using System.Net.Http;
using System.Text.Json.Nodes;
using Factorio.Desktop;
using Xunit;

public sealed class DesktopBackendTests
{
    [Fact]
    public void ReleaseProfileUsesItsGameExecutableAndDataDirectory()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","release-profile-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root,"LiveGame"));
        var export=Path.Combine(root,"LiveGame","script-output","factory-telemetry");
        File.WriteAllText(Path.Combine(root,"LiveGame","profile.json"),new JsonObject{["export_directory"]=export,["game_executable"]=@"D:\Games\Factorio\bin\x64\factorio.exe",["source_kind"]="game"}.ToJsonString());
        var options=BackendOptions.Load(["--data-root="+root]);
        Assert.Equal(root,options.DataRoot);Assert.Equal(export,options.TelemetryDirectory);Assert.Equal(@"D:\Games\Factorio\bin\x64\factorio.exe",options.GameExecutable);Assert.True(options.WatchGame);
        Assert.Equal(@"D:\Other\factorio.exe",BackendOptions.Load(["--data-root="+root,@"--game-executable=D:\Other\factorio.exe"]).GameExecutable);
    }
    [Fact]
    public async Task FailedGatewayStartupAlsoStopsBridge()
    {
        var root = Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor", "embedded-failure-" + Guid.NewGuid().ToString("N"));
        var occupied = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        occupied.Start();
        try
        {
            var port = ((System.Net.IPEndPoint)occupied.LocalEndpoint).Port;
            await using var backend = new DesktopBackend(new(root, root, WatchGame: false,
                BridgeUrl: "http://127.0.0.1:0", GatewayUrl: $"http://127.0.0.1:{port}"));
            await Assert.ThrowsAsync<IOException>(() => backend.StartAsync());
            AssertPortReleased(backend.BridgeAddress!);
        }
        finally { occupied.Stop(); }
    }

    [Fact]
    public async Task BothHostsSharePidAndSnapshotsAndReleaseTheirPorts()
    {
        var root = Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor", "embedded-" + Guid.NewGuid().ToString("N"));
        var export = Path.Combine(root, "script-output", "factory-telemetry");
        Directory.CreateDirectory(export);
        var now = DateTimeOffset.UtcNow;
        await File.WriteAllTextAsync(Path.Combine(export, "status.json"), new JsonObject
        {
            ["schema_version"] = 1, ["session_id"] = "embedded-test", ["topic"] = "status", ["tick"] = 60,
            ["written_at"] = now.ToString("O"), ["data"] = new JsonObject { ["test"] = true }
        }.ToJsonString());
        string bridgeUrl, gatewayUrl;
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        await using (var backend = new DesktopBackend(new(root, export, "validation_copy", false, "http://127.0.0.1:0", "http://127.0.0.1:0")))
        {
            await backend.StartAsync();
            bridgeUrl = backend.BridgeAddress!; gatewayUrl = backend.GatewayAddress!;
            foreach (var url in new[] { bridgeUrl, gatewayUrl })
            {
                var health = JsonNode.Parse(await client.GetStringAsync(url + "/health"))!;
                Assert.Equal(Environment.ProcessId, health["process_id"]!.GetValue<int>());
                Assert.Equal("desktop", health["hosting"]!.GetValue<string>());
            }
            JsonNode? status = null;
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            do
            {
                status = JsonNode.Parse(await client.GetStringAsync(gatewayUrl + "/api/v1/status", deadline.Token));
                if (status?["telemetry_ready"]?.GetValue<bool>() == true) break;
                await Task.Delay(100, deadline.Token);
            } while (true);
            Assert.True(status!["connected"]!.GetValue<bool>());
            Assert.StartsWith("embedded-test:", status["session_id"]!.GetValue<string>());
            Assert.Equal("in_process",status["transport"]!.GetValue<string>());
            Assert.Equal(0,status["mcp_calls"]!.GetValue<long>());
            Assert.True(status["telemetry_reads"]!.GetValue<long>() > 0);
            var history = JsonNode.Parse(await client.GetStringAsync(gatewayUrl + "/api/v1/history?topic=status"))!.AsArray();
            Assert.Single(history);
        }
        foreach (var url in new[] { bridgeUrl, gatewayUrl }) AssertPortReleased(url);
    }

    private static void AssertPortReleased(string url)
    {
        // Bind the exact endpoint again, independently of HTTP/proxy/connection-pool behavior.
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, new Uri(url).Port);
        try { listener.Start(); } finally { listener.Stop(); }
    }
}
