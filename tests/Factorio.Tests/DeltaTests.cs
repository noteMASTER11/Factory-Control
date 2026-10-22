using Factorio.Core;
using Xunit;
namespace Factorio.Tests;
public sealed class DeltaTests
{
    [Fact]
    public void UnchangedTopicsAreNotRepeatedAndChangedTopicsRemainAvailable()
    {
        var cache=new SnapshotCache();var now=DateTimeOffset.UtcNow;
        cache.Put(new("power","a",1,now,new()));cache.Put(new("machines","a",1,now,new()));
        var first=cache.Changes(null,null);Assert.True(first.Reset);Assert.Equal(2,first.Topics.Count);
        Assert.Empty(cache.Changes(first.Revision,first.SessionId).Topics);
        cache.Put(new("power","a",2,now,new()));
        var next=cache.Changes(first.Revision,first.SessionId);
        Assert.False(next.Reset);Assert.Single(next.Topics);Assert.Equal(2,next.Topics["power"].Tick);
        Assert.NotNull(cache.Get("machines"));
    }
    [Fact]
    public void SessionChangeAndCounterRestartForceAFullRefresh()
    {
        var cache=new SnapshotCache();cache.Put(new("power","a",1,DateTimeOffset.UtcNow,new()));
        var old=cache.Changes(null,null);
        cache.Put(new("status","b",1,DateTimeOffset.UtcNow,new()));
        var current=cache.Changes(old.Revision,old.SessionId);
        Assert.True(current.Reset);Assert.Single(current.Topics);Assert.False(current.Topics.ContainsKey("power"));
        Assert.True(cache.Changes(long.MaxValue,current.SessionId).Reset);
    }
}
