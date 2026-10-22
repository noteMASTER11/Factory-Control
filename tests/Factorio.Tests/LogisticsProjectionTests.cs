using Factorio.Core;
using System.Text.Json.Nodes;
using Xunit;

namespace Factorio.Tests;
public sealed class LogisticsProjectionTests
{
    [Fact]
    public void DeficitIsComputedPerChestAndIncomingCargoIsSubtractedOnlyOnce()
    {
        // Summing container contents before clamping would incorrectly cancel the second chest's shortage.
        var payload=JsonNode.Parse("""
        {"data":{"requesters_available":true,"requesters":[
          {"surface":"nauvis","force":"player","items":[{"name":"iron-plate","quality":"normal","count":200}],"sections":[{"active":true,"multiplier":1,"filters":[{"value":{"name":"iron-plate","quality":"normal"},"min":100}]}]},
          {"surface":"nauvis","force":"player","items":[{"name":"iron-plate","quality":"normal","count":10}],"delivering":[{"name":"iron-plate","quality":"normal","count":20}],"sections":[{"active":true,"multiplier":2,"filters":[{"value":{"name":"iron-plate"},"min":25}]},{"active":true,"multiplier":1,"filters":[{"value":{"name":"iron-plate"},"min":50}]},{"active":false,"filters":[{"value":{"name":"iron-plate"},"min":9999}]}]}
        ]}}
        """)!.AsObject();
        var original=payload.ToJsonString();
        var data=ClientTelemetry.Project("logistics",payload)["data"]!;
        var row=Assert.Single(data["requests"]!.AsArray())!;
        Assert.Equal(200,row["requested"]!.GetValue<double>());
        Assert.Equal(210,row["present"]!.GetValue<double>());
        Assert.Equal(20,row["incoming"]!.GetValue<double>());
        Assert.Equal(70,row["missing"]!.GetValue<double>());
        Assert.Equal(2,row["containers"]!.GetValue<int>());
        Assert.Equal(original,payload.ToJsonString());
    }
    [Fact]
    public void QualitiesAndSurfacesRemainSeparateAndQualityRangesAreNotGuessed()
    {
        var payload=JsonNode.Parse("""{"data":{"requesters_available":true,"requesters":[{"surface":"nauvis","force":"player","items":[{"name":"iron-plate","quality":"rare","count":100}],"sections":[{"active":true,"filters":[{"value":{"name":"iron-plate","quality":"normal","comparator":"="},"min":10},{"value":{"name":"iron-plate","quality":"rare","comparator":"="},"min":20},{"value":{"name":"copper-plate","quality":"normal","comparator":">"},"min":30}]}]},{"surface":"vulcanus","force":"player","sections":[{"active":true,"filters":[{"value":{"name":"iron-plate"},"min":7}]}]}]}}""")!.AsObject();
        var data=ClientTelemetry.Project("logistics",payload)["data"]!;
        Assert.Equal(3,data["requests"]!.AsArray().Count);
        Assert.Equal(1,data["unsupported_filters"]!.GetValue<int>());
        Assert.Equal(10,data["requests"]!.AsArray().First(r=>r!["surface"]!.GetValue<string>()=="nauvis"&&r["quality"]!.GetValue<string>()=="normal")!["missing"]!.GetValue<double>());
    }
    [Fact]
    public void LargeRequesterListProducesBoundedSummaryAndTrainCargoAndRouteSurvive()
    {
        var requesters=new JsonArray();
        for(var i=0;i<4000;i++)requesters.Add(new JsonObject{["surface"]="nauvis",["force"]="player",["sections"]=new JsonArray(new JsonObject{["active"]=true,["filters"]=new JsonArray(new JsonObject{["value"]=new JsonObject{["name"]="iron-plate"},["min"]=10})})});
        var payload=JsonNode.Parse("""{"data":{"networks":[{"id":1,"items":[{"name":"iron-plate","count":100}]}],"trains":[{"id":7,"position":{"x":40,"y":80},"items":[{"name":"iron-plate","count":200}],"schedule":{"current":2,"records":[{"station":"Mine"},{"station":"Base"}]}}]}}""")!.AsObject();
        payload["data"]!["requesters"]=requesters;payload["data"]!["requesters_available"]=true;
        var data=ClientTelemetry.Project("logistics",payload)["data"]!;
        Assert.Single(data["requests"]!.AsArray());
        Assert.Equal(40000,data["requests"]![0]!["missing"]!.GetValue<double>());
        Assert.True(data.ToJsonString().Length<3000);
        Assert.Equal(100,data["networks"]![0]!["item_count"]!.GetValue<double>());
        Assert.Equal("Base",data["trains"]![0]!["destination"]!.GetValue<string>());
        Assert.Equal(200,data["trains"]![0]!["cargo"]![0]!["count"]!.GetValue<double>());
        Assert.Equal(40,data["trains"]![0]!["position"]!["x"]!.GetValue<int>());
    }
    [Fact]
    public void ProjectionLimitsDistinctGroupsAndPreservesFluidCargo()
    {
        var payload=JsonNode.Parse("""{"data":{"requesters_available":true,"requesters":[],"trains":[{"id":1,"fluids":{"water":25000}}]}}""")!.AsObject();
        var chests=payload["data"]!["requesters"]!.AsArray();
        for(var i=0;i<600;i++)chests.Add(new JsonObject{["surface"]="nauvis",["force"]="player",["sections"]=new JsonArray(new JsonObject{["filters"]=new JsonArray(new JsonObject{["value"]=new JsonObject{["name"]="item-"+i},["min"]=i+1})})});
        var data=ClientTelemetry.Project("logistics",payload)["data"]!;
        Assert.Equal(600,data["request_groups_total"]!.GetValue<int>());
        Assert.Equal(512,data["requests"]!.AsArray().Count);
        Assert.Equal(600,data["requests"]![0]!["missing"]!.GetValue<double>());
        Assert.Equal("water",data["trains"]![0]!["cargo"]![0]!["name"]!.GetValue<string>());
        Assert.Equal(25000,data["trains"]![0]!["cargo"]![0]!["count"]!.GetValue<double>());
    }
}
