using System.ComponentModel;
using System.Text.Json.Nodes;
using System.Text.Json;
using Factorio.Core;
using ModelContextProtocol.Server;
using System.Diagnostics;

namespace Factorio.Bridge;

public static class BridgeHost
{
    public static WebApplication Build(IReadOnlyDictionary<string,string?> settings, string url="http://127.0.0.1:18740")
    {
var builder=WebApplication.CreateBuilder(new WebApplicationOptions { Args=[], ApplicationName=typeof(BridgeHost).Assembly.FullName, ContentRootPath=AppContext.BaseDirectory });
builder.Configuration.AddInMemoryCollection(settings);
builder.Logging.ClearProviders();
builder.Services.Configure<HostOptions>(options=>options.ShutdownTimeout=TimeSpan.FromSeconds(5));
builder.WebHost.UseUrls(url);
builder.Services.AddSingleton<SnapshotCache>();
builder.Services.AddSingleton<SnapshotFiles>();
builder.Services.AddSingleton<BridgeSource>();
builder.Services.AddSingleton<TelemetryTools>();
builder.Services.AddSingleton<ITelemetrySource>(services=>services.GetRequiredService<TelemetryTools>());
builder.Services.AddHostedService<FileCollector>();
builder.Services.AddMcpServer().WithHttpTransport().WithTools<TelemetryTools>();
var app=builder.Build();
app.MapMcp("/mcp");
app.MapGet("/health",(BridgeSource source,SnapshotCache cache)=>new {service="bridge",process_id=Environment.ProcessId,hosting="desktop",state=cache.SessionId is null?"waiting_for_collector":"ready",source_kind=source.Kind,source.Directory,session_id=cache.SessionId});
return app;
    }
}

public sealed class BridgeSource(IConfiguration config)
{
    public string Directory {get;}=Path.GetFullPath(config["Telemetry:Directory"]??@"D:\ChatGPT\Projects\FactorioMonitor\Data\Factorio\script-output\factory-telemetry");
    public string Kind {get;}=config["Telemetry:SourceKind"]??"game";
    public bool RequiresProcessBinding=>new DirectoryInfo(Directory).Parent?.Parent?.FullName is {} root
        && (File.Exists(Path.Combine(root,"process.json"))||File.Exists(Path.Combine(root,"process.pid")));
    public DateTimeOffset? StartedAt(int? id)
    {
        if(id is null)return null;
        try{using var p=Process.GetProcessById(id.Value);return p.StartTime.ToUniversalTime();}
        catch(Exception ex)when(ex is ArgumentException or InvalidOperationException or Win32Exception){return null;}
    }
    public int? GameProcessId
    {
        get
        {
            try
            {
                var root=new DirectoryInfo(Directory).Parent?.Parent?.FullName;
                if(root is null)return null;
                var identityPath=Path.Combine(root,"process.json");
                if(File.Exists(identityPath))
                {
                    if(new FileInfo(identityPath).Length>4096)return null;
                    var identity=ProcessBinding.Parse(File.ReadAllText(identityPath));
                    if(identity is null)return null;
                    using var bound=Process.GetProcessById(identity.ProcessId);
                    return bound.ProcessName.Equals("factorio",StringComparison.OrdinalIgnoreCase)
                        && identity.Matches(bound.Id,bound.MainModule?.FileName??"",bound.StartTime.ToUniversalTime())?bound.Id:null;
                }
                var path=Path.Combine(root,"process.pid");
                if(!File.Exists(path)||new FileInfo(path).Length>32||!int.TryParse(File.ReadAllText(path).Trim(),out var id))return null;
                using var process=Process.GetProcessById(id);
                var written=File.GetLastWriteTimeUtc(path);var started=process.StartTime.ToUniversalTime();
                return process.ProcessName.Equals("factorio",StringComparison.OrdinalIgnoreCase)&&started<=written&&written-started<TimeSpan.FromSeconds(30)?id:null;
            }
            catch(Exception ex)when(ex is IOException or ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception){return null;}
        }
    }
    public static readonly string[] Topics=["status","production","machines","power","logistics","research","resources","combat"];
}
public sealed class FileCollector(BridgeSource source,SnapshotCache cache,SnapshotFiles files,ILogger<FileCollector> log):BackgroundService
{
    private readonly Dictionary<string,DateTime> loaded=[];
    private readonly Dictionary<string,long> nextRead=[];
    private SourceGeneration generation=new();
    private int? boundPid;
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        log.LogInformation("Reading {SourceKind} telemetry from {Directory}",source.Kind,source.Directory);
        using var timer=new PeriodicTimer(TimeSpan.FromMilliseconds(250));
        do
        {
            var pid=source.GameProcessId;
            if(pid!=boundPid){cache.Reset();loaded.Clear();nextRead.Clear();generation=new();boundPid=pid;}
            if(source.RequiresProcessBinding&&pid is null)continue;
            var started=source.StartedAt(pid);
            foreach(var topic in BridgeSource.Topics)
            {
                if(Environment.TickCount64<nextRead.GetValueOrDefault(topic))continue;
                var path=Path.Combine(source.Directory,topic+".json");
                if(!File.Exists(path))continue;
                var stamp=File.GetLastWriteTimeUtc(path);
                if(started is not null&&stamp<started.Value.UtcDateTime)continue;
                if(loaded.GetValueOrDefault(topic)==stamp)continue;
                var value=await files.ReadAsync(path,topic,stoppingToken);
                if(value is null)continue;
                var normalized=generation.Accept(value);
                if(normalized is not null)cache.Put(normalized);
                loaded[topic]=stamp;
                nextRead[topic]=Environment.TickCount64+(long)(TelemetryCadence.Seconds[topic]*1000);
            }
        }while(await timer.WaitForNextTickAsync(stoppingToken));
    }
}
[McpServerToolType]
public sealed class TelemetryTools(SnapshotCache cache,BridgeSource source):ITelemetrySource
{
    public TelemetryRead Read(string topic)
    {
        if(!BridgeSource.Topics.Contains(topic,StringComparer.Ordinal))throw new ArgumentException("Unknown telemetry topic.",nameof(topic));
        var pid=source.GameProcessId;
        var value=cache.Get(topic);
        if(source.RequiresProcessBinding&&(pid is null||value?.WrittenAt<source.StartedAt(pid)))value=null;
        return new(value,source.Kind,pid);
    }
    [McpServerTool(Name="telemetry_snapshot"),Description("Reads a completed cached snapshot. Never scans or mutates the game. Topics: status, production, machines, power, logistics, research, resources, combat.")]
    public string ReadSnapshot(string topic)
    {
        var read=Read(topic);var value=read.Snapshot;
        return JsonSerializer.Serialize(new {ready=value is not null,topic,session_id=value?.SessionId,tick=value?.Tick,written_at=value?.WrittenAt.ToString("O"),source_kind=read.SourceKind,source_process_id=read.SourceProcessId,payload=value?.Payload,
            client_payload=value is not null&&!ReferenceEquals(value.ClientPayload,value.Payload)?value.ClientPayload:null});
    }
    [McpServerTool(Name="telemetry_capabilities"),Description("Describes read-only telemetry coverage and known limitations.")]
    public object Capabilities()=>new {schema_version=1,topics=BridgeSource.Topics,read_only=true,engine_queries_per_tool_call=0,limitations=new[]{"Item flow rates currently describe normal quality.","Inventory counts exclude belts, pipes, hands and players.","Nameplate power is theoretical, not dispatchable reserve. Train ETA and request age require history.","Initial discovery is incremental; consult coverage and sample ticks."}};
}
