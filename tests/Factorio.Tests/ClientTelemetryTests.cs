using Factorio.Core;
using System.Text.Json.Nodes;
using Xunit;

namespace Factorio.Tests;
public sealed class ClientTelemetryTests
{
    [Fact]
    public void SummaryDropsRequesterDetailsWithoutMutatingDetailedSnapshot()
    {
        var payload=JsonNode.Parse("""{"coverage":{"discovery_complete":true},"data":{"networks":[{"id":3,"logistic_total":42,"items":[{"name":"iron-plate","count":10}]}],"trains":[{"id":7,"station":"A","schedule":{"records":[]}}],"requesters":[{"sections":[{"filters":[{"value":"iron-plate"}]}]},{"sections":[]}]}}""")!.AsObject();
        var before=payload.ToJsonString();
        var result=ClientTelemetry.Project("logistics",payload);
        Assert.Equal(2,result["data"]!["requester_count"]!.GetValue<int>());
        Assert.Equal(42,result["data"]!["networks"]![0]!["logistic_total"]!.GetValue<int>());
        Assert.Null(result["data"]!["networks"]![0]!["items"]);
        Assert.Null(result["data"]!["trains"]![0]!["schedule"]);
        Assert.Null(result["data"]!["requesters"]);
        Assert.Equal(before,payload.ToJsonString());
    }
    [Theory]
    [InlineData(false,false)]
    [InlineData(true,true)]
    public void DiscoveredMapDoesNotImplyCompleteRollingInventory(bool complete,bool expected)
    {
        var payload=new JsonObject{["coverage"]=new JsonObject{["discovery_complete"]=true},["data"]=new JsonObject{["collection_mode"]="rolling",["inventory_complete"]=complete}};
        Assert.Equal(expected,ClientTelemetry.InventoryComplete(payload));
    }
    [Fact]
    public void CompleteButStaleInventoriesCannotDriveForecasts()
    {
        var now=DateTimeOffset.UtcNow;
        var payload=new JsonObject{["coverage"]=new JsonObject{["discovery_complete"]=true},["data"]=new JsonObject()};
        Assert.False(ClientTelemetry.InventoryUsable(new("machines","world",1,now.AddSeconds(-201),payload),now));
        Assert.True(ClientTelemetry.InventoryUsable(new("machines","world",1,now.AddSeconds(-2),payload),now));
    }
}
