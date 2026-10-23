using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Management;
using System.Text.RegularExpressions;
using Factorio.Bridge;
using Factorio.Gateway;
using Microsoft.AspNetCore.Builder;
using Factorio.Core;
using Microsoft.Extensions.DependencyInjection;

namespace Factorio.Desktop;

public sealed record BackendOptions(string DataRoot, string TelemetryDirectory, string SourceKind = "game",
    bool WatchGame = true, string BridgeUrl = "http://127.0.0.1:18740", string GatewayUrl = "http://127.0.0.1:18741",
    string GameExecutable = "", string? GameProfile = null)
{
    public static BackendOptions Load(string[] arguments)
    {
        string? Argument(string name) => arguments.FirstOrDefault(a => a.StartsWith(name + "=", StringComparison.Ordinal))?[(name.Length + 1)..];
        var root = Path.GetFullPath(Argument("--data-root") ?? AppPaths.DataRoot);
        var live = Path.Combine(root, "LiveGame");
        var profilePath = Path.Combine(live, "profile.json");
        var profile = File.Exists(profilePath) ? JsonNode.Parse(File.ReadAllText(profilePath)) : null;
        var gameProfile=profile?["game_profile"]?.GetValue<string>()??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"Factorio");
        var executable=Argument("--game-executable")??profile?["game_executable"]?.GetValue<string>();
        var export = Path.GetFullPath(Argument("--telemetry-directory") ?? profile?["export_directory"]?.GetValue<string>()
            ?? Path.Combine(gameProfile,"script-output","factory-telemetry"));
        return new(root, export, Argument("--source-kind") ?? profile?["source_kind"]?.GetValue<string>() ?? "game",
            WatchGame: Argument("--telemetry-directory") is null,
            GameExecutable: string.IsNullOrWhiteSpace(executable)?string.Empty:Path.GetFullPath(executable),
            GameProfile: Argument("--telemetry-directory") is null ? gameProfile : null);
    }
}

// The two hosts keep separate DI scopes/caches, but share the desktop's lifetime and PID.
public sealed class DesktopBackend(BackendOptions options,RuntimeLogs? logs=null) : IAsyncDisposable
{
    private readonly CancellationTokenSource lifetime = new();
    private WebApplication? bridge, gateway;
    private Task? watcher;
    public string? BridgeAddress { get; private set; }
    public string? GatewayAddress { get; private set; }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Telemetry:Directory"] = options.TelemetryDirectory,
            ["Telemetry:SourceKind"] = options.SourceKind,
            ["Telemetry:GameProfile"] = options.GameProfile,
            ["History:Path"] = Path.Combine(options.DataRoot, "history.db"),
            ["Logging:LogLevel:Default"] = logs is null?"Warning":"Debug"
        };
        try
        {
            if (options.WatchGame) watcher = WatchGameAsync(lifetime.Token);
            bridge = BridgeHost.Build(settings, options.BridgeUrl,logs?.CreateProvider());
            await bridge.StartAsync(cancellationToken);
            BridgeAddress = bridge.Urls.Single();
            settings["Bridge:Endpoint"] = BridgeAddress + "/mcp";
            gateway = GatewayHost.Build(settings, options.GatewayUrl,bridge.Services.GetRequiredService<ITelemetrySource>(),logs?.CreateProvider());
            await gateway.StartAsync(cancellationToken);
            GatewayAddress = gateway.Urls.Single();
        }
        catch
        {
            await DisposeAsync();
            throw;
        }
    }

    private async Task WatchGameAsync(CancellationToken cancellationToken)
    {
        // Discovery only inspects Windows process metadata every two seconds. It never queries the game.
        var root = new DirectoryInfo(options.TelemetryDirectory).Parent?.Parent?.FullName;
        if (root is null) return;
        Directory.CreateDirectory(root);
        string? previous = null;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
        do
        {
            try
            {
                var candidates = new List<(int Id, string Executable, DateTime Started)>();
                using var search = new ManagementObjectSearcher("SELECT ProcessId, ExecutablePath, CommandLine FROM Win32_Process WHERE Name='factorio.exe'");
                using var results = search.Get();
                foreach (ManagementObject row in results)
                {
                    using (row)
                    {
                        try
                        {
                            var executable = row["ExecutablePath"] as string;
                            if (executable is null || (options.GameExecutable.Length>0&&!string.Equals(executable, options.GameExecutable, StringComparison.OrdinalIgnoreCase))) continue;
                            var command = row["CommandLine"] as string;
                            if (command is null || Regex.IsMatch(command, @"--config|--start-server|--benchmark", RegexOptions.IgnoreCase)) continue;
                            using var process = Process.GetProcessById(Convert.ToInt32(row["ProcessId"]));
                            candidates.Add((process.Id, executable, process.StartTime.ToUniversalTime()));
                        }
                        catch (Exception ex) when (ex is Win32Exception or InvalidOperationException or ArgumentException) { }
                    }
                }
                if (candidates.Count == 1)
                {
                    var game = candidates[0];
                    var key = $"{game.Id}:{game.Started.Ticks}";
                    if (key != previous)
                    {
                        var path = Path.Combine(root, "process.json");
                        var identity = JsonSerializer.Serialize(new { process_id = game.Id, executable = game.Executable, started_at_utc = game.Started.ToString("O") });
                        await File.WriteAllTextAsync(path + ".tmp", identity, cancellationToken);
                        File.Move(path + ".tmp", path, true);
                        previous = key;
                    }
                }
            }
            catch (Exception ex) when (ex is IOException or ManagementException or UnauthorizedAccessException) { /* Retry metadata/profile access on the next tick. */ }
        } while (await timer.WaitForNextTickAsync(cancellationToken));
    }

    public async ValueTask DisposeAsync()
    {
        await lifetime.CancelAsync();
        if (watcher is not null)
        {
            try { await watcher; } catch (OperationCanceledException) { }
            watcher = null;
        }
        // Stop the MCP consumer first; the bridge remains available during its shutdown.
        foreach (var host in new[] { gateway, bridge })
        {
            if (host is null) continue;
            try { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5)); await host.StopAsync(timeout.Token); }
            finally { await host.DisposeAsync(); }
        }
        gateway = null; bridge = null;
    }
}
