using Factorio.Core;
using System.Text.Json.Nodes;
using Xunit;
namespace Factorio.Tests;
public sealed class TransportRatesTests
{
    [Fact]
    public void ReadingsRespectForceQualityAndWarmup()
    {
        var now=DateTimeOffset.UtcNow;
        var payload=JsonNode.Parse("""{"data":{"space":{"schema_version":1,"started_tick":0,"rate_gap_tick":0,"rate_window_end_tick":7200,"production_statistics_include_transfers":false,"flow_rates":[{"surface":"nauvis","force":"Newbies","name":"iron-plate","quality":"rare","imported":500,"exported":20,"window_end_tick":7200}]}}}""")!.AsObject();
        var snapshot=new Snapshot("logistics","test",7200,now,payload);
        var row=JsonNode.Parse("""{"surface":"nauvis","force":"Newbies","name":"iron-plate","quality":"rare","kind":"item"}""")!;
        var rate=TransportRates.Read(snapshot,row,now);Assert.True(rate.Ready);Assert.Equal(500,rate.Imported);Assert.Equal(20,rate.Exported);
        row["quality"]="normal";Assert.Equal(0,TransportRates.Read(snapshot,row,now).Imported);
        payload["data"]!["space"]!["rate_gap_tick"]=7100L;Assert.False(TransportRates.Read(snapshot,row,now).Ready);
        Assert.False(TransportRates.Read(snapshot with{WrittenAt=now.AddMinutes(-1)},row,now).Ready);
        Assert.False(TransportRates.Read(null,row,now).Available);
    }
}
