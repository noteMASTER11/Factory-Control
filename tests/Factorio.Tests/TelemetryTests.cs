using Factorio.Core;
using System.Text.Json.Nodes;
using Xunit;

namespace Factorio.Tests;

public sealed class TelemetryTests
{
    [Fact]
    public void ProcessResetClearsAllTopicsAndRejectsDelayedPreviousGeneration()
    {
        var cache=new SnapshotCache();
        var old=new Snapshot("machines","old",10,DateTimeOffset.UtcNow,new());
        cache.Put(old);cache.Reset();
        Assert.Null(cache.SessionId);Assert.Null(cache.Get("machines"));
        Assert.False(cache.Put(old));
        Assert.True(cache.Put(old with {SessionId="new"}));
    }
    [Fact]
    public void WorldReloadWithSameSaveIdCreatesNewGenerationAndRejectsLeftoverFiles()
    {
        var source=new SourceGeneration();
        var at=DateTimeOffset.UtcNow;
        var first=source.Accept(new("production","save",9000,at,new()))!;
        var reset=source.Accept(new("production","save",1000,at.AddSeconds(5),new()))!;
        Assert.NotEqual(first.SessionId,reset.SessionId);
        Assert.Null(source.Accept(new("power","save",8990,at.AddSeconds(-1),new())));
        var freshPower=source.Accept(new("power","save",1002,at.AddSeconds(6),new()))!;
        Assert.Equal(reset.SessionId,freshPower.SessionId);
    }

    [Fact]
    public void DelayedRetiredSessionCannotReplaceTheCurrentWorld()
    {
        var cache=new SnapshotCache();
        cache.Put(new("power","old",500,DateTimeOffset.UtcNow,new()));
        cache.Put(new("production","new",100,DateTimeOffset.UtcNow,new()));
        Assert.False(cache.Put(new("power","old",600,DateTimeOffset.UtcNow,new())));
        Assert.Equal("new",cache.SessionId);
    }
    [Fact]
    public async Task EmptyLuaCollectionsBecomeArraysButErrorDictionaryRemainsObject()
    {
        var folder=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);
        var path=Path.Combine(folder,"power.json");
        try
        {
            await File.WriteAllTextAsync(path,"{\"schema_version\":1,\"topic\":\"power\",\"session_id\":\"s\",\"tick\":1,\"data\":{\"networks\":{},\"accumulators\":{},\"errors\":{}}}");
            var value=await new SnapshotFiles().ReadAsync(path,"power");
            Assert.IsType<JsonArray>(value!.Payload["data"]!["networks"]);
            Assert.IsType<JsonArray>(value.Payload["data"]!["accumulators"]);
            Assert.IsType<JsonObject>(value.Payload["data"]!["errors"]);
        }finally{Directory.Delete(folder,true);}
    }

    [Fact]
    public void NewSessionCannotRetainPreviousWorldPower()
    {
        var cache = new SnapshotCache();
        cache.Put(new("power", "old", 9000, DateTimeOffset.UtcNow, new()));
        cache.Put(new("production", "new", 60, DateTimeOffset.UtcNow, new()));
        Assert.Null(cache.Get("power"));
        Assert.Equal("new", cache.SessionId);
    }

    [Fact]
    public void DelayedSameSessionSnapshotCannotRollBackGameTime()
    {
        var cache = new SnapshotCache();
        cache.Put(new("power", "world", 200, DateTimeOffset.UtcNow, new()));
        Assert.False(cache.Put(new("power", "world", 100, DateTimeOffset.UtcNow, new())));
        Assert.Equal(200, cache.Get("power")!.Tick);
    }

    [Fact]
    public async Task PartialFileDoesNotBecomeAValidSnapshot()
    {
        var folder = Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "power.json");
        try
        {
            await File.WriteAllTextAsync(path, "{\"schema_version\":1,");
            Assert.Null(await new SnapshotFiles().ReadAsync(path,"power"));
            await File.WriteAllTextAsync(path, "{\"schema_version\":1,\"topic\":\"power\",\"session_id\":\"test\",\"tick\":120,\"data\":{\"watts\":900}}");
            var value = await new SnapshotFiles().ReadAsync(path,"power");
            Assert.Equal(120, value!.Tick);
            Assert.Equal(900, value.Payload["data"]!["watts"]!.GetValue<int>());
            var timestamp = value.WrittenAt;
            Assert.Equal(timestamp, (await new SnapshotFiles().ReadAsync(path,"power"))!.WrittenAt);
            Assert.Null(await new SnapshotFiles().ReadAsync(path,"production"));
        }
        finally { Directory.Delete(folder,true); }
    }

    [Fact]
    public async Task ParallelReadersCannotOverlapGameRequests()
    {
        var poller = new SerializedPoller();
        var active = 0;
        var maximum = 0;
        var results = await Task.WhenAll(Enumerable.Range(0,12).Select(i => poller.RunAsync(async ct => {
            var count = Interlocked.Increment(ref active);
            InterlockedExtensions.Max(ref maximum, count);
            try { await Task.Delay(5,ct); return i; }
            finally { Interlocked.Decrement(ref active); }
        },TimeSpan.FromSeconds(2))));
        Assert.Equal(1, maximum);
        Assert.Equal(12, results.Distinct().Count());
    }

    [Fact]
    public async Task TimeoutDoesNotReleaseGateWhileUncooperativeOperationStillRuns()
    {
        var poller = new SerializedPoller();
        var release = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = poller.RunAsync(_ => release.Task,TimeSpan.FromMilliseconds(30));
        await Assert.ThrowsAsync<TimeoutException>(()=>first);
        var entered = false;
        var second = poller.RunAsync(_ => { entered=true; return Task.FromResult(2); },TimeSpan.FromSeconds(2));
        await Task.Delay(40);
        Assert.False(entered);
        release.SetResult(1);
        Assert.Equal(2, await second);
    }

    [Fact]
    public async Task CallerCancellationDoesNotPoisonFollowingPoll()
    {
        var poller = new SerializedPoller();
        using var cts = new CancellationTokenSource(20);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>poller.RunAsync(async ct => {await Task.Delay(3000,ct); return 0;},TimeSpan.FromSeconds(4),cts.Token));
        Assert.Equal(7,await poller.RunAsync(_=>Task.FromResult(7),TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public void ReserveAndEmptyAreDifferentThresholds()
    {
        var f=Forecast.Calculate(1800,1920,2400,960);
        Assert.Equal(12,f.ReserveMinutes);
        Assert.Equal(20,f.EmptyMinutes);
        Assert.Equal(0.9375,f.Coverage);
    }

    [Theory]
    [InlineData(200,100,500,"surplus")]
    [InlineData(100,100,500,"balanced")]
    [InlineData(0,0,0,"idle")]
    public void BalancedAndIdleLinesDoNotInventADepletionTime(double p,double c,double s,string status)
    {
        var f=Forecast.Calculate(p,c,s,0);
        Assert.Null(f.EmptyMinutes);
        Assert.Equal(status,f.Status);
    }

    [Fact]
    public void UnknownOrIncompleteStockDoesNotProduceAFakeEta()
    {
        Assert.Null(Forecast.Calculate(10,20,null,0).EmptyMinutes);
        Assert.Null(Forecast.Calculate(10,20,200,0,false).EmptyMinutes);
        Assert.Equal(0,Forecast.Calculate(10,20,0,0).EmptyMinutes);
    }

    [Theory]
    [InlineData(-1,20,200)]
    [InlineData(10,-2,200)]
    [InlineData(10,20,-1)]
    public void NegativeTelemetryIsRejected(double p,double c,double s) => Assert.Throws<ArgumentOutOfRangeException>(()=>Forecast.Calculate(p,c,s,0));
}

internal static class InterlockedExtensions
{
    public static void Max(ref int target,int value) { int old; do {old=Volatile.Read(ref target); if(old>=value)return;} while(Interlocked.CompareExchange(ref target,value,old)!=old); }
}
