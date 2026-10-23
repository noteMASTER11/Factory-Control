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
    string GameExecutable = "", string? GameProfile = null,bool GameProfileExplicit=false)
{
    public static BackendOptions Load(string[] arguments)
    {
        string? Argument(string name) => arguments.FirstOrDefault(a => a.StartsWith(name + "=", StringComparison.Ordinal))?[(name.Length + 1)..];
        var root = Path.GetFullPath(Argument("--data-root") ?? AppPaths.DataRoot);
        var live = Path.Combine(root, "LiveGame");
        var profilePath = Path.Combine(live, "profile.json");
        var profile = File.Exists(profilePath) ? JsonNode.Parse(File.ReadAllText(profilePath)) : null;
        var gameProfile=Argument("--game-profile")??profile?["game_profile"]?.GetValue<string>()??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"Factorio");
        gameProfile=Path.GetFullPath(gameProfile);
        var explicitProfile=Argument("--game-profile") is not null||(profile?["game_profile_explicit"]?.GetValue<bool>()??profile?["game_profile"] is not null);
        var executable=Argument("--game-executable")??profile?["game_executable"]?.GetValue<string>();
        var export = Path.GetFullPath(Argument("--telemetry-directory") ?? profile?["export_directory"]?.GetValue<string>()
            ?? Path.Combine(gameProfile,"script-output","factory-telemetry"));
        return new(root, export, Argument("--source-kind") ?? profile?["source_kind"]?.GetValue<string>() ?? "game",
            WatchGame: Argument("--telemetry-directory") is null,
            GameExecutable: string.IsNullOrWhiteSpace(executable)?string.Empty:Path.GetFullPath(executable),
            GameProfile: Argument("--telemetry-directory") is null ? gameProfile : null,GameProfileExplicit:explicitProfile);
    }
}

// The two hosts keep separate DI scopes/caches, but share the desktop's lifetime and PID.
public sealed class DesktopBackend(BackendOptions options,RuntimeLogs? logs=null) : IAsyncDisposable
{
    private readonly CancellationTokenSource lifetime = new();
    private WebApplication? bridge, gateway;
    private Task? watcher;
    private readonly SemaphoreSlim setupGate=new(1,1);
    private CollectorSetup setup=new("idle");
    private string? knownExecutable=options.GameExecutable.Length>0?options.GameExecutable:CollectorInstaller.PendingExecutable(options.DataRoot);
    public CollectorSetup Collector=>Volatile.Read(ref setup);
    public string? KnownExecutable=>knownExecutable;
    public string? BridgeAddress { get; private set; }
    public string? GatewayAddress { get; private set; }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await StartHostsAsync(cancellationToken).ConfigureAwait(false);
            if(options.WatchGame)watcher=Task.Run(()=>WatchGameAsync(lifetime.Token),lifetime.Token);
        }
        catch {await DisposeAsync().ConfigureAwait(false);throw;}
    }

    private async Task StartHostsAsync(CancellationToken cancellationToken)
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
            bridge = BridgeHost.Build(settings, options.BridgeUrl,logs?.CreateProvider());
            await bridge.StartAsync(cancellationToken).ConfigureAwait(false);
            BridgeAddress = bridge.Urls.Single();
            settings["Bridge:Endpoint"] = BridgeAddress + "/mcp";
            gateway = GatewayHost.Build(settings, options.GatewayUrl,bridge.Services.GetRequiredService<ITelemetrySource>(),logs?.CreateProvider());
            await gateway.StartAsync(cancellationToken).ConfigureAwait(false);
            GatewayAddress = gateway.Urls.Single();
        }
        catch
        {
            await StopHostsAsync().ConfigureAwait(false);
            throw;
        }
    }

    public async Task<CollectorSetup> SetupCollectorAsync(string executable,CancellationToken cancellationToken=default)
    {
        await setupGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            // Validate the game before persisting or touching its profile.
            try{CollectorPackage.GameVersion(executable);}
            catch(Exception ex)when(ex is IOException or ArgumentException or NotSupportedException or JsonException or UnauthorizedAccessException)
            {return setup=new("error",Executable:executable,Error:ex is NotSupportedException?"unsupported_version":"invalid_game");}
            var profile=options.GameProfileExplicit?options.GameProfile!:GameInstallation.Profile(executable,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"Factorio"));
            if(!string.Equals(profile,options.GameProfile,StringComparison.OrdinalIgnoreCase)||bridge is null||gateway is null)
            {
                await StopHostsAsync().ConfigureAwait(false);
                options=options with{GameProfile=profile,TelemetryDirectory=Path.Combine(profile,"script-output","factory-telemetry")};
                await StartHostsAsync(cancellationToken).ConfigureAwait(false);
            }
            knownExecutable=executable;
            options=options with{GameExecutable=executable};
            var live=Path.Combine(options.DataRoot,"LiveGame");Directory.CreateDirectory(live);
            var document=new JsonObject{["game_executable"]=executable,["game_profile"]=profile,["game_profile_explicit"]=options.GameProfileExplicit,["export_directory"]=options.TelemetryDirectory,["source_kind"]="game"};
            var path=Path.Combine(live,"profile.json");File.WriteAllText(path+".tmp",document.ToJsonString());File.Move(path+".tmp",path,true);
            var result=await Task.Run(()=>new CollectorInstaller(options.DataRoot,profile,AnyGameRunning).Ensure(executable),cancellationToken).ConfigureAwait(false);
            if(result!=setup)logs?.Write(result.State=="error"?Microsoft.Extensions.Logging.LogLevel.Error:Microsoft.Extensions.Logging.LogLevel.Information,"collector.setup",$"{result.State}: {result.Branch}, {result.Version}, {result.Error}");
            return setup=result;
        }
        catch(Exception ex)when(ex is IOException or UnauthorizedAccessException or JsonException or ArgumentException or InvalidOperationException)
        {
            logs?.Write(Microsoft.Extensions.Logging.LogLevel.Error,"collector.setup","Collector setup failed",ex);
            return setup=new("error",Executable:executable,Error:ex is UnauthorizedAccessException?"access_denied":"io");
        }
        finally{setupGate.Release();}
    }

    private static bool AnyGameRunning()
    {
        var processes=Process.GetProcessesByName("factorio");try{return processes.Length>0;}finally{foreach(var process in processes)process.Dispose();}
    }

    private async Task WatchGameAsync(CancellationToken cancellationToken)
    {
        // Discovery only inspects Windows process metadata every two seconds. It never queries the game.
        string? previous = null;
        string? attempted=null;long nextAttempt=0;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(2));
        do
        {
            try
            {
                var root=new DirectoryInfo(options.TelemetryDirectory).Parent?.Parent?.FullName;
                if(root is null)return;Directory.CreateDirectory(root);
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
                    var key = $"{root}:{game.Id}:{game.Started.Ticks}";
                    if (key != previous)
                    {
                        var path = Path.Combine(root, "process.json");
                        var identity = JsonSerializer.Serialize(new { process_id = game.Id, executable = game.Executable, started_at_utc = game.Started.ToString("O") });
                        await File.WriteAllTextAsync(path + ".tmp", identity, cancellationToken);
                        File.Move(path + ".tmp", path, true);
                        previous = key;
                    }
                }
                var desired=candidates.Count==1?candidates[0].Executable:knownExecutable;
                var attempt=desired+":"+AnyGameRunning();
                if(desired is not null&&(attempt!=attempted||(Collector.State=="error"&&Environment.TickCount64>=nextAttempt)))
                {await SetupCollectorAsync(desired,cancellationToken);attempted=attempt;nextAttempt=Environment.TickCount64+30000;}
            }
            catch (Exception ex) when (ex is IOException or ManagementException or UnauthorizedAccessException or InvalidOperationException or ArgumentException)
            {logs?.Write(Microsoft.Extensions.Logging.LogLevel.Error,"collector.setup","Game/profile discovery failed",ex);}
        } while (await timer.WaitForNextTickAsync(cancellationToken));
    }

    public async ValueTask DisposeAsync()
    {
        await lifetime.CancelAsync().ConfigureAwait(false);
        if (watcher is not null)
        {
            try { await watcher.ConfigureAwait(false); } catch (OperationCanceledException) { }
            watcher = null;
        }
        await setupGate.WaitAsync().ConfigureAwait(false);
        try{await StopHostsAsync().ConfigureAwait(false);}finally{setupGate.Release();}
    }
    private async Task StopHostsAsync()
    {
        // Stop the MCP consumer first; the bridge remains available during its shutdown.
        foreach (var host in new[] { gateway, bridge })
        {
            if (host is null) continue;
            try { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5)); await host.StopAsync(timeout.Token).ConfigureAwait(false); }
            finally { await host.DisposeAsync().ConfigureAwait(false); }
        }
        gateway = null; bridge = null;
    }
}
