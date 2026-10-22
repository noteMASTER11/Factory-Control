using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace Factorio.Desktop;

public sealed class MonitorWindow : Window
{
    private const string Origin = "https://factory.local";
    private readonly WebView2 browser = new();
    private readonly HttpClient http = new() { BaseAddress = new Uri("http://127.0.0.1:18741"), Timeout = TimeSpan.FromSeconds(4) };
    private readonly CancellationTokenSource lifetime = new();
    private readonly string[] arguments;
    private readonly Task backendReady;
    private FullscreenWindow? fullscreen;
    private bool reading;
    private bool ready;
    private bool settingsOpen;
    private long? telemetryRevision;
    private string? telemetrySession;
    private string? historySession;

    public MonitorWindow(string[] arguments, Task? backendReady = null)
    {
        this.arguments = arguments;
        this.backendReady = backendReady ?? Task.CompletedTask;
        Title = Localization.Text("app.title");
        Width = 1168; Height = 903; MinWidth = 800; MinHeight = 600;
        Background = new SolidColorBrush(Color.FromRgb(6, 15, 23));
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Content = browser;
        SourceInitialized += (_, _) =>
        {
            var handle = new WindowInteropHelper(this).Handle;
            fullscreen = new FullscreenWindow(handle);
            HwndSource.FromHwnd(handle)?.AddHook(WindowMessage);
        };
        Loaded += Initialize;
        LocationChanged += (_, _) => PublishWindowState();
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.F11 || (e.Key == Key.Escape && !settingsOpen && fullscreen?.IsFullscreen == true))
            {
                e.Handled = true;
                if (!e.IsRepeat) Dispatcher.BeginInvoke(() => ChangeFullscreen(e.Key == Key.F11));
            }
        };
        Closed += (_, _) => { lifetime.Cancel(); browser.Dispose(); http.Dispose(); };
    }

    private async void Initialize(object sender, RoutedEventArgs e)
    {
        try
        {
            var webAssets = Task.Run(WebAssets.Prepare);
            var profile = @"D:\ChatGPT\Cache\FactorioMonitor\WebView2";
            Directory.CreateDirectory(profile);
            var options = new CoreWebView2EnvironmentOptions();
            var browserArguments = new List<string>();
            browserArguments.Add("--autoplay-policy=no-user-gesture-required");
            var automation = arguments.FirstOrDefault(a => a.StartsWith("--automation-port=", StringComparison.Ordinal));
            if (automation is not null && int.TryParse(automation.Split('=')[1], out var port) && port is >= 1024 and <= 65535)
                browserArguments.Add($"--remote-debugging-address=127.0.0.1 --remote-debugging-port={port}");
            if(!arguments.Contains("--svg-fallback"))browserArguments.Add("--enable-blink-features=CanvasDrawElement");
            options.AdditionalBrowserArguments=string.Join(" ",browserArguments);
            var environment = await CoreWebView2Environment.CreateAsync(null, profile, options);
            await browser.EnsureCoreWebView2Async(environment);
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.Settings.IsZoomControlEnabled = false;
            browser.CoreWebView2.SetVirtualHostNameToFolderMapping("factory.local",
                await webAssets, CoreWebView2HostResourceAccessKind.Deny);
            browser.CoreWebView2.NavigationStarting += (_, args) =>
            { if (!IsLocal(args.Uri)) args.Cancel = true; };
            browser.CoreWebView2.NewWindowRequested += (_, args) => args.Handled = true;
            browser.CoreWebView2.WebMessageReceived += ReceiveMessage;
            browser.CoreWebView2.NavigationCompleted += (_, _) =>
            { settingsOpen=false;ready = true; PublishWindowState(); browser.Focus(); };
            browser.Source = new Uri(Origin + "/index.html"+(arguments.Contains("--svg-fallback")?"?renderer=svg":""));
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            Content = new System.Windows.Controls.TextBlock
            {
                Text = Localization.Text("native.initError", "detail", ex.Message),
                Foreground = Brushes.LightCoral, Margin = new Thickness(24), TextWrapping = TextWrapping.Wrap
            };
        }
    }

    private static bool IsLocal(string uri) => Uri.TryCreate(uri, UriKind.Absolute, out var u)
        && u.Scheme == "https" && u.Host == "factory.local" && u.Port == 443;

    private async void ReceiveMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (!IsLocal(args.Source)) return;
        string? id = null;
        try
        {
            using var document = JsonDocument.Parse(args.WebMessageAsJson);
            var message = document.RootElement;
            var command = message.GetProperty("type").GetString();
            if(command=="settings.dialog"){settingsOpen=message.TryGetProperty("open",out var open)&&open.ValueKind==JsonValueKind.True;return;}
            if(command=="settings.zoom"){
                if(message.TryGetProperty("scale",out var scale)&&scale.TryGetInt32(out var percent))browser.ZoomFactor=Math.Clamp(percent,70,175)/100.0;
                return;
            }
            if (command == "settings.locale")
            {
                if (message.GetProperty("locale").GetString() is { } locale && Localization.Select(locale))
                    Title = Localization.Text("app.title");
                return;
            }
            if (command == "window.toggleFullscreen") { ChangeFullscreen(true); return; }
            if (command == "window.exitFullscreen") { ChangeFullscreen(false); return; }
            if (command == "window.state") { PublishWindowState(); return; }
            if (command != "api.snapshot") return;
            id = message.GetProperty("id").GetString();
            if (string.IsNullOrEmpty(id) || id.Length > 80) return;
            if (reading) { Send(new { type = "api.reply", id, error = "busy" }); return; }
            reading = true;
            try
            {
                await backendReady.WaitAsync(lifetime.Token);
                if(message.TryGetProperty("reset",out var reset)&&reset.ValueKind==JsonValueKind.True){telemetryRevision=null;telemetrySession=null;historySession=null;}
                // One fixed cached delta feed for every view. History is bootstrapped once per session.
                var query=telemetryRevision is null?"":$"?since={telemetryRevision}&session={Uri.EscapeDataString(telemetrySession??"")}";
                var status = JsonNode.Parse(await http.GetStringAsync("/api/v1/client/updates"+query, lifetime.Token));
                var sessions = JsonNode.Parse(await http.GetStringAsync("/api/v1/sessions", lifetime.Token));
                var nextSession=status?["session_id"]?.GetValue<string>();
                JsonNode? history=null,productionHistory=null,researchHistory=null;
                if(nextSession is not null&&nextSession!=historySession)
                {
                    history=JsonNode.Parse(await http.GetStringAsync("/api/v1/history?topic=power&limit=300",lifetime.Token));
                    productionHistory=JsonNode.Parse(await http.GetStringAsync("/api/v1/history?topic=production&limit=300",lifetime.Token));
                    researchHistory=JsonNode.Parse(await http.GetStringAsync("/api/v1/history?topic=research&limit=300",lifetime.Token));
                    // A world may change while SQLite is being read. The worker also filters each history row by session.
                    historySession=nextSession;
                }
                telemetryRevision=status?["revision"]?.GetValue<long>();telemetrySession=nextSession;
                Send(new { type = "api.reply", id, data = new { status, sessions, history, productionHistory, researchHistory } });
            }
            finally { reading = false; }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException or KeyNotFoundException)
        { if (!lifetime.IsCancellationRequested) Send(new { type = "api.reply", id, error = "gateway_unavailable" }); }
    }

    private void ChangeFullscreen(bool toggle)
    {
        if (fullscreen is null) return;
        try
        {
            if (fullscreen.IsFullscreen) fullscreen.Exit();
            else if (toggle) fullscreen.Enter();
            PublishWindowState();
        }
        catch (System.ComponentModel.Win32Exception)
        { Send(new { type = "window.error", error = "app.fullscreenError" }); }
    }
    private nint WindowMessage(nint hwnd, int message, nint wParam, nint lParam, ref bool handled)
    {
        if (message is 0x007E or 0x02E0 && fullscreen?.IsFullscreen == true)
            Dispatcher.BeginInvoke(DispatcherPriority.ApplicationIdle, () =>
            { fullscreen.RefreshMonitorBounds(); PublishWindowState(); });
        return 0;
    }
    private void PublishWindowState()
    { if (ready && fullscreen is not null) Send(new { type = "window.state", data = fullscreen.Describe() }); }
    private void Send(object value)
    { if (!lifetime.IsCancellationRequested) browser.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(value)); }
}
