using Factorio.Core;
using System.Text.Json.Nodes;
using System.Text.Json;
using Xunit;

namespace Factorio.Tests;

[CollectionDefinition("Allocation", DisableParallelization = true)]
public sealed class AllocationCollection;

[Collection("Allocation")]
public sealed class TelemetryAllocationTests
{
    [Fact]
    public async Task ReusingRequesterGenerationKeepsDetailsWithoutExpandingEveryChestAgain()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","allocations-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root,"requesters","a"));
        const string chest="""{"unit_number":11,"surface":"nauvis","force":"player","items":[{"name":"iron-plate","count":2}],"delivering":{},"sections":[{"active":true,"multiplier":2,"filters":[{"value":{"name":"iron-plate","quality":"normal"},"min":10}]}]}""";
        const int pages=256;
        var rows="["+string.Join(',',Enumerable.Repeat(chest,16))+"]";
        for(var i=1;i<=pages;i++)
            await File.WriteAllTextAsync(Path.Combine(root,"requesters","a",i.ToString("D5")+".json"),
                "{\"schema_version\":1,\"session_id\":\"allocation-world\",\"revision\":300,\"index\":"+i+",\"rows\":"+rows+"}");
        var path=Path.Combine(root,"logistics.json");
        await File.WriteAllTextAsync(path,"{\"schema_version\":1,\"topic\":\"logistics\",\"session_id\":\"allocation-world\",\"tick\":500,\"data\":{\"requesters_ref\":{\"schema_version\":1,\"bank\":\"a\",\"revision\":300,\"page_count\":"+pages+",\"row_count\":"+pages*16+"}}}");
        var reader=new SnapshotFiles();
        var coldBefore=GC.GetTotalAllocatedBytes(true);
        var first=await reader.ReadAsync(path,"logistics");
        var coldAllocated=GC.GetTotalAllocatedBytes(true)-coldBefore;
        Assert.True(coldAllocated<12*1024*1024,$"First requester generation allocated {coldAllocated/1024/1024} MiB; budget is 12 MiB.");
        var before=GC.GetTotalAllocatedBytes(true);
        Snapshot? current=null;
        for(var i=0;i<4;i++)current=await reader.ReadAsync(path,"logistics");
        var allocated=GC.GetTotalAllocatedBytes(true)-before;
        Assert.True(allocated<1024*1024,$"Four unchanged requester generations allocated {allocated/1024/1024} MiB; budget is 1 MiB.");
        var serializeBefore=GC.GetTotalAllocatedBytes(true);
        using(var writer=new Utf8JsonWriter(Stream.Null))JsonSerializer.Serialize(writer,current!.Payload);
        var serializeAllocated=GC.GetTotalAllocatedBytes(true)-serializeBefore;
        Assert.True(serializeAllocated<256*1024,$"Streaming details allocated {serializeAllocated/1024} KiB; budget is 256 KiB.");
        var details=JsonNode.Parse(current!.Payload.ToJsonString())!["data"]!["requesters"]!.AsArray();
        Assert.Equal(pages*16,details.Count);
        Assert.Empty(details[0]!["delivering"]!.AsArray());
        Assert.NotNull(current.ClientPayload);
        var request=Assert.Single(current.ClientPayload["data"]!["requests"]!.AsArray())!;
        Assert.Equal(pages*16*18,request["missing"]!.GetValue<double>());
        Assert.Equal(ClientTelemetry.Project("logistics",current.Payload).ToJsonString(),current.ClientPayload.ToJsonString());
        Assert.NotSame(first!.ClientPayload,current.ClientPayload);
    }
}
