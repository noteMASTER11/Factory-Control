using Factorio.Desktop;
using Microsoft.Extensions.Logging;
using Xunit;

public sealed class RuntimeLogsTests
{
    [Fact]
    public async Task DefaultOffThenAllLevelsFromDebugAreWrittenAndDisableStopsNewEntries()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","logs-"+Guid.NewGuid().ToString("N"));
        var logs=new RuntimeLogs(root);
        using var provider=logs.CreateProvider();var logger=provider.CreateLogger("test.host");
        Assert.False(logs.Enabled);Assert.False(logger.IsEnabled(LogLevel.Debug));
        logger.Log(LogLevel.Error,new EventId(1),"state",null,(_,_)=>throw new InvalidOperationException("Disabled logger formatted a message"));
        logger.LogError("off-by-default");Assert.False(Directory.Exists(logs.DirectoryPath));
        logs.SetEnabled(true);
        logger.LogDebug("debug-event");logger.LogInformation("info-event");logger.LogWarning("warning-event");logger.LogError("error-event");logger.LogCritical("critical-event");
        logs.SetEnabled(false);logger.LogCritical("off-after-toggle");await logs.DisposeAsync();
        var text=string.Join('\n',Directory.GetFiles(logs.DirectoryPath,"*.log").Select(File.ReadAllText));
        foreach(var value in new[]{"debug-event","info-event","warning-event","error-event","critical-event"})Assert.Contains(value,text);
        Assert.DoesNotContain("off-by-default",text);Assert.DoesNotContain("off-after-toggle",text);
    }

    [Fact]
    public async Task PreferenceSurvivesRestartAndHostProviderDisposalDoesNotStopOtherHost()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","logs-restart-"+Guid.NewGuid().ToString("N"));
        await using(var first=new RuntimeLogs(root)){first.SetEnabled(true);first.CreateProvider().Dispose();first.Write(LogLevel.Debug,"gateway","after-bridge-provider-disposal");}
        await using(var second=new RuntimeLogs(root)){Assert.True(second.Enabled);second.Write(LogLevel.Debug,"startup","restored-startup");}
        var text=string.Join('\n',Directory.GetFiles(Path.Combine(root,"logs"),"*.log").Select(File.ReadAllText));
        Assert.Contains("after-bridge-provider-disposal",text);Assert.Contains("restored-startup",text);
    }

    [Fact]
    public async Task EmbeddedHostProvidersCaptureDebugAndRequestLogs()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","logs-hosts-"+Guid.NewGuid().ToString("N"));
        var logs=new RuntimeLogs(root);logs.SetEnabled(true);string bridgeAddress,gatewayAddress;
        await using(var backend=new DesktopBackend(new(root,Path.Combine(root,"export"),"validation_copy",false,"http://127.0.0.1:0","http://127.0.0.1:0"),logs))
        {
            await backend.StartAsync();using var http=new HttpClient();
            bridgeAddress=backend.BridgeAddress!;gatewayAddress=backend.GatewayAddress!;
            await http.GetStringAsync(backend.BridgeAddress+"/health");await http.GetStringAsync(backend.GatewayAddress+"/health");
        }
        await logs.DisposeAsync();var text=string.Join('\n',Directory.GetFiles(logs.DirectoryPath,"*.log").Select(File.ReadAllText));
        Assert.Contains("[Debug]",text);Assert.Contains("Request finished",text);
        Assert.Contains(bridgeAddress+"/health",text);Assert.Contains(gatewayAddress+"/health",text);
    }
}
