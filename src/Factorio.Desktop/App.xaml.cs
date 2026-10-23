using System.Windows;
using System.IO;
using Microsoft.Extensions.Logging;

namespace Factorio.Desktop;

public partial class App : Application
{
    private Mutex? instance;
    private bool ownsInstance;
    private DesktopBackend? backend;
    private Task? backendReady;
    private RuntimeLogs? runtimeLogs;
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        instance = new Mutex(true, @"Local\FactoryControl.Desktop", out ownsInstance);
        if (!ownsInstance) { Shutdown(); return; }
        var options = BackendOptions.Load(e.Args);
        runtimeLogs=new RuntimeLogs(options.DataRoot);
        runtimeLogs.Write(LogLevel.Information,"desktop","Application starting");
        AppDomain.CurrentDomain.UnhandledException+=(_,args)=>runtimeLogs.Write(LogLevel.Critical,"desktop","Unhandled exception",args.ExceptionObject as Exception);
        DispatcherUnhandledException+=(_,args)=>runtimeLogs.Write(LogLevel.Critical,"desktop","Dispatcher exception",args.Exception);
        backend = new DesktopBackend(options,runtimeLogs);
        backendReady = Task.Run(async () =>
        {
            try { await backend.StartAsync(); }
            catch (Exception ex)
            {
                runtimeLogs.Write(LogLevel.Error,"backend","Embedded backend could not start",ex);
                var logs = Path.Combine(options.DataRoot, "logs");
                Directory.CreateDirectory(logs);
                await File.AppendAllTextAsync(Path.Combine(logs, "desktop-backend.log"), $"{DateTimeOffset.Now:O} {ex}\n");
                throw new InvalidOperationException("Embedded backend could not start.", ex);
            }
        });
        MainWindow = new MonitorWindow(e.Args, backendReady,runtimeLogs,backend);
        MainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        runtimeLogs?.Write(LogLevel.Information,"desktop","Application stopping");
        if (backend is not null)
            Task.Run(async () =>
            {
                try { if (backendReady is not null) await backendReady; } catch { /* Logged at startup. */ }
                await backend.DisposeAsync();
            }).GetAwaiter().GetResult();
        if (ownsInstance) instance?.ReleaseMutex();
        if(runtimeLogs is not null)runtimeLogs.DisposeAsync().AsTask().GetAwaiter().GetResult();
        instance?.Dispose();
        base.OnExit(e);
    }
}
