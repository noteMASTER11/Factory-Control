using System.Windows;
using System.IO;

namespace Factorio.Desktop;

public partial class App : Application
{
    private Mutex? instance;
    private bool ownsInstance;
    private DesktopBackend? backend;
    private Task? backendReady;
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        instance = new Mutex(true, @"Local\FactoryControl.Desktop", out ownsInstance);
        if (!ownsInstance) { Shutdown(); return; }
        var options = BackendOptions.Load(e.Args);
        backend = new DesktopBackend(options);
        backendReady = Task.Run(async () =>
        {
            try { await backend.StartAsync(); }
            catch (Exception ex)
            {
                var logs = Path.Combine(options.DataRoot, "logs");
                Directory.CreateDirectory(logs);
                await File.AppendAllTextAsync(Path.Combine(logs, "desktop-backend.log"), $"{DateTimeOffset.Now:O} {ex}\n");
                throw new InvalidOperationException("Embedded backend could not start.", ex);
            }
        });
        MainWindow = new MonitorWindow(e.Args, backendReady);
        MainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (backend is not null)
            Task.Run(async () =>
            {
                try { if (backendReady is not null) await backendReady; } catch { /* Logged at startup. */ }
                await backend.DisposeAsync();
            }).GetAwaiter().GetResult();
        if (ownsInstance) instance?.ReleaseMutex();
        instance?.Dispose();
        base.OnExit(e);
    }
}
