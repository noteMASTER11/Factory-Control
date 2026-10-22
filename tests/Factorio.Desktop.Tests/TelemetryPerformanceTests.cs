using Factorio.Bridge;
using Factorio.Core;
using Factorio.Gateway;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Net.Http;
using Xunit;

public sealed class TelemetryPerformanceTests
{
    [Fact]
    public async Task StandaloneGatewayStillCollectsFullPayloadViaMcp()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","mcp-fallback-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        Directory.CreateDirectory(Path.Combine(root,"requesters","a"));
        await File.WriteAllTextAsync(Path.Combine(root,"logistics.json"),"""{"schema_version":1,"topic":"logistics","session_id":"mcp-world","tick":1,"data":{"requesters_ref":{"schema_version":1,"bank":"a","revision":1,"page_count":1,"row_count":1}}}""");
        await File.WriteAllTextAsync(Path.Combine(root,"requesters","a","00001.json"),"""{"schema_version":1,"session_id":"mcp-world","revision":1,"index":1,"rows":[{"unit_number":17,"surface":"nauvis","force":"player","sections":[{"filters":[{"value":{"name":"iron-plate"},"min":10}]}]}]}""");
        await using var bridge=BridgeHost.Build(new Dictionary<string,string?>{["Telemetry:Directory"]=root},"http://127.0.0.1:0");
        await bridge.StartAsync();
        await using var gateway=GatewayHost.Build(new Dictionary<string,string?>{["Bridge:Endpoint"]=bridge.Urls.Single()+"/mcp",["History:Path"]=Path.Combine(root,"history.db")},"http://127.0.0.1:0");
        await gateway.StartAsync();
        try
        {
            using var http=new HttpClient();
            using var deadline=new CancellationTokenSource(TimeSpan.FromSeconds(12));
            JsonNode? state;
            do
            {
                state=JsonNode.Parse(await http.GetStringAsync(gateway.Urls.Single()+"/api/v1/client/status",deadline.Token));
                if(state?["topics"]?["logistics"] is not null)break;
                await Task.Delay(50,deadline.Token);
            }while(true);
            Assert.Equal("mcp",state!["transport"]!.GetValue<string>());
            Assert.True(state["mcp_calls"]!.GetValue<long>()>0);
            Assert.Equal(10,state["topics"]!["logistics"]!["payload"]!["data"]!["requests"]![0]!["missing"]!.GetValue<double>());
            var details=JsonNode.Parse(await http.GetStringAsync(gateway.Urls.Single()+"/api/v1/logistics",deadline.Token));
            Assert.Equal(17,details!["payload"]!["data"]!["requesters"]![0]!["unit_number"]!.GetValue<int>());
            var encoded=bridge.Services.GetRequiredService<ITelemetrySource>().Read("logistics").Snapshot!;
            var history=gateway.Services.GetRequiredService<HistoryStore>();
            history.Save(encoded with {Tick=2,WrittenAt=encoded.WrittenAt.AddTicks(1)});
            var historical=JsonNode.Parse(JsonSerializer.Serialize(history.Read("logistics",10,encoded.SessionId)))!.AsArray();
            Assert.Equal(2,historical.Count);
            Assert.All(historical,row=>Assert.Equal(17,row!["payload"]!["data"]!["requesters"]![0]!["unit_number"]!.GetValue<int>()));
        }
        finally {await gateway.StopAsync();await bridge.StopAsync();}
    }
    [Fact]
    public async Task FastFileChangesDoNotReparseLogisticsMoreOftenThanConsumerCadence()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","cadence-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path=Path.Combine(root,"logistics.json");
        string Snapshot(long tick)=>new JsonObject{["schema_version"]=1,["topic"]="logistics",["session_id"]="cadence",["tick"]=tick,["data"]=new JsonObject()}.ToJsonString();
        await File.WriteAllTextAsync(path,Snapshot(1));
        await using var host=BridgeHost.Build(new Dictionary<string,string?>{["Telemetry:Directory"]=root},"http://127.0.0.1:0");
        await host.StartAsync();
        try
        {
            var cache=host.Services.GetRequiredService<SnapshotCache>();
            using var deadline=new CancellationTokenSource(TimeSpan.FromSeconds(12));
            while(cache.Get("logistics") is null)await Task.Delay(30,deadline.Token);
            await File.WriteAllTextAsync(path,Snapshot(2));
            await Task.Delay(800,deadline.Token);
            Assert.Equal(1,cache.Get("logistics")!.Tick);
            while(cache.Get("logistics")?.Tick!=2)await Task.Delay(50,deadline.Token);
            Assert.Equal(2,cache.Get("logistics")!.Tick);
        }
        finally {await host.StopAsync();}
    }

    [Fact]
    public void HistoryKeepsFullPayloadInCompressedStorageAndReadsLegacyRows()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","history-"+Guid.NewGuid().ToString("N"));
        var path=Path.Combine(root,"history.db");
        var configuration=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["History:Path"]=path}).Build();
        var store=new HistoryStore(configuration);
        var payload=new JsonObject{["data"]=new JsonObject{["details"]=new string('x',256*1024)}};
        store.Save(new("logistics","world",1,DateTimeOffset.UtcNow,payload));
        using var connection=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=path}.ToString());
        connection.Open();
        using var query=connection.CreateCommand();
        query.CommandText="SELECT typeof(json),length(json) FROM snapshots";
        using(var reader=query.ExecuteReader())
        {
            Assert.True(reader.Read());
            Assert.Equal("blob",reader.GetString(0));
            Assert.True(reader.GetInt64(1)<4096,"Repetitive detailed snapshots should not be stored verbatim.");
        }
        query.CommandText="INSERT INTO snapshots VALUES('world','logistics',2,$written,'{\"data\":{\"legacy\":true}}')";
        query.Parameters.AddWithValue("$written",DateTimeOffset.UtcNow.AddSeconds(1).ToString("O"));query.ExecuteNonQuery();
        var rows=JsonNode.Parse(JsonSerializer.Serialize(store.Read("logistics",10,"world")))!.AsArray();
        Assert.Equal(2,rows.Count);
        Assert.True(rows[0]!["payload"]!["data"]!["legacy"]!.GetValue<bool>());
        Assert.Equal(payload.ToJsonString(),rows[1]!["payload"]!.ToJsonString());
    }
}
