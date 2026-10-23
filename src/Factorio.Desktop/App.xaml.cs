using System.Windows;
using System.IO;
using Microsoft.Extensions.Logging;

namespace Factorio.Desktop;

public partial class App : Application
{
    private DesktopInstance? instance;
    private DesktopBackend? backend;
    private Task? backendReady;
    private RuntimeLogs? runtimeLogs;
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        instance = new DesktopInstance(@"Local\FactoryControl.Desktop");
        if (!instance.TryAcquire()) { instance.RequestActivation(); Shutdown(); return; }
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
        instance.Listen(()=>
        {
            if(Dispatcher.HasShutdownStarted)return;
            Dispatcher.BeginInvoke(()=>
            {
                if(MainWindow is not {} window||!window.IsLoaded)return;
                if(window.WindowState==WindowState.Minimized)window.WindowState=WindowState.Normal;
                window.Show();window.Activate();
            });
        });
    }

    protected override void OnExit(ExitEventArgs e)
    {
        runtimeLogs?.Write(LogLevel.Information,"desktop","Application stopping");
        try
        {
            Task.Run(async () =>
            {
                if(backend is not null)
                {
                    try { if (backendReady is not null) await backendReady; } catch { /* Logged at startup. */ }
                    await backend.DisposeAsync();
                }
                if(runtimeLogs is not null)await runtimeLogs.DisposeAsync();
            }).GetAwaiter().GetResult();
        }
        finally{instance?.Dispose();base.OnExit(e);}
    }
}
