using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;

namespace Factorio.Desktop;

// Shared by native UI, both embedded hosts and browser diagnostics. Producers
// never wait on disk; when disabled they do not format provider log messages.
public sealed class RuntimeLogs : IAsyncDisposable
{
    private sealed record Line(string Path,string Text,bool Close=false);
    private readonly Channel<Line> queue;
    private readonly Task writerTask;
    private readonly string preferencePath;
    private readonly object gate=new();
    private volatile bool enabled;
    private string? currentPath;
    private long dropped;
    public bool Enabled=>enabled;
    public string DirectoryPath {get;}
    public string? LastError {get;private set;}

    public RuntimeLogs(string dataRoot)
    {
        DirectoryPath=Path.Combine(Path.GetFullPath(dataRoot),"logs");
        preferencePath=Path.Combine(Path.GetFullPath(dataRoot),"debug-logging.json");
        queue=Channel.CreateBounded<Line>(new BoundedChannelOptions(1024){SingleReader=true,FullMode=BoundedChannelFullMode.DropOldest},_=>Interlocked.Increment(ref dropped));
        writerTask=Task.Run(WriteLoop);
        try
        {
            if(File.Exists(preferencePath)&&new FileInfo(preferencePath).Length<=4096)
            {using var doc=JsonDocument.Parse(File.ReadAllText(preferencePath));if(doc.RootElement.GetProperty("enabled").GetBoolean())SetEnabled(true,persist:false);}
        }
        catch(Exception ex)when(ex is IOException or JsonException or InvalidOperationException or KeyNotFoundException or UnauthorizedAccessException){ }
    }

    public void SetEnabled(bool value,bool persist=true)
    {
        lock(gate)
        {
            if(enabled==value)return;
            if(value)
            {
                currentPath=Path.Combine(DirectoryPath,$"FactoryControl-{DateTime.Now:yyyyMMdd-HHmmss-fff}-{Environment.ProcessId}-{Guid.NewGuid().ToString("N")[..4]}.log");
                enabled=true;Write(LogLevel.Information,"desktop","Debug logging enabled");
            }
            else
            {
                Write(LogLevel.Information,"desktop","Debug logging disabled");enabled=false;
                if(currentPath is {} path)queue.Writer.TryWrite(new(path,"",true));
            }
            if(persist)try{Directory.CreateDirectory(Path.GetDirectoryName(preferencePath)!);File.WriteAllText(preferencePath,JsonSerializer.Serialize(new{enabled=value}));}
                catch(Exception ex)when(ex is IOException or UnauthorizedAccessException){LastError=ex.Message;}
        }
    }

    public void Write(LogLevel level,string category,string message,Exception? exception=null)
    {
        if(!enabled||level<LogLevel.Debug||level==LogLevel.None||currentPath is not {} path)return;
        var text=exception is null?message:message+"\n"+exception;
        if(text.Length>8192)text=text[..8192];
        queue.Writer.TryWrite(new(path,$"{DateTimeOffset.Now:O} [{level}] {category}: {text}"));
    }

    public ILoggerProvider CreateProvider()=>new Provider(this);
    private sealed class Provider(RuntimeLogs owner):ILoggerProvider
    {
        public ILogger CreateLogger(string categoryName)=>new Logger(owner,categoryName);
        public void Dispose(){ } // The desktop owns the sink, not either host.
    }
    private sealed class Logger(RuntimeLogs owner,string category):ILogger
    {
        public bool IsEnabled(LogLevel level)=>owner.Enabled&&level>=LogLevel.Debug&&level!=LogLevel.None;
        public IDisposable? BeginScope<TState>(TState state)where TState:notnull=>null;
        public void Log<TState>(LogLevel level,EventId eventId,TState state,Exception? exception,Func<TState,Exception?,string> formatter)
        {if(IsEnabled(level))owner.Write(level,category,formatter(state,exception),exception);}
    }

    private async Task WriteLoop()
    {
        StreamWriter? writer=null;string? basePath=null;var part=0;
        async Task Close(){if(writer is not null){await writer.DisposeAsync();writer=null;}basePath=null;}
        try
        {
            await foreach(var item in queue.Reader.ReadAllAsync())
            {
                try
                {
                    if(item.Close){if(basePath==item.Path)await Close();continue;}
                    if(basePath!=item.Path){await Close();basePath=item.Path;part=0;}
                    if(writer is not null&&writer.BaseStream.Length>=16*1024*1024){await writer.DisposeAsync();writer=null;part++;}
                    if(writer is null)
                    {
                        Directory.CreateDirectory(DirectoryPath);
                        var path=part==0?item.Path:Path.ChangeExtension(item.Path,$"{part:D3}.log");
                        writer=new StreamWriter(new FileStream(path,FileMode.Append,FileAccess.Write,FileShare.ReadWrite|FileShare.Delete,16384,FileOptions.Asynchronous),new UTF8Encoding(false));
                    }
                    var lost=Interlocked.Exchange(ref dropped,0);
                    if(lost>0)await writer.WriteLineAsync($"{DateTimeOffset.Now:O} [Warning] logging: Dropped {lost} queued lines under load");
                    await writer.WriteLineAsync(item.Text);await writer.FlushAsync();
                }
                catch(Exception ex)when(ex is IOException or UnauthorizedAccessException){LastError=ex.Message;if(writer is not null){try{await Close();}catch(IOException){writer=null;basePath=null;}}}
            }
        }
        finally{if(writer is not null)try{await writer.DisposeAsync();}catch(IOException){}}
    }

    public async ValueTask DisposeAsync(){enabled=false;queue.Writer.TryComplete();await writerTask;}
}
