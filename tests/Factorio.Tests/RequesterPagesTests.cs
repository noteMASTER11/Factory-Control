using Factorio.Core;
using System.Text.Json.Nodes;
using Xunit;

namespace Factorio.Tests;
public sealed class RequesterPagesTests
{
    [Fact]
    public async Task CompletedPagesReconstructAllDetailsOutsideTheGame()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor",Guid.NewGuid().ToString("N"));
        try
        {
            var path=await Fixture(root);
            var snapshot=await new SnapshotFiles().ReadAsync(path,"logistics");
            var rows=Assert.IsType<JsonArray>(JsonNode.Parse(snapshot!.Payload.ToJsonString())!["data"]!["requesters"]);
            Assert.Equal(3,rows.Count);
            Assert.Equal(11,rows[0]!["unit_number"]!.GetValue<int>());
            Assert.Equal(12,rows[1]!["unit_number"]!.GetValue<int>());
            Assert.Equal(13,rows[2]!["unit_number"]!.GetValue<int>());
            Assert.True(snapshot.Payload["data"]!["requesters_available"]!.GetValue<bool>());
        }
        finally{if(Directory.Exists(root))Directory.Delete(root,true);}
    }
    [Theory]
    [InlineData("revision",99)]
    [InlineData("index",7)]
    [InlineData("schema_version",2)]
    public async Task ReusedOrPartialPagesNeverBecomeACompleteSnapshot(string field,int value)
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor",Guid.NewGuid().ToString("N"));
        try
        {
            var path=await Fixture(root);
            var pagePath=Path.Combine(root,"requesters","a","00002.json");
            var page=JsonNode.Parse(await File.ReadAllTextAsync(pagePath))!.AsObject();page[field]=value;
            await File.WriteAllTextAsync(pagePath,page.ToJsonString());
            var snapshot=await new SnapshotFiles().ReadAsync(path,"logistics");
            Assert.NotNull(snapshot);
            Assert.False(snapshot.Payload["data"]!["requesters_available"]!.GetValue<bool>());
            Assert.Empty(Assert.IsType<JsonArray>(snapshot.Payload["data"]!["requesters"]));
        }
        finally{if(Directory.Exists(root))Directory.Delete(root,true);}
    }
    private static async Task<string> Fixture(string root)
    {
        Directory.CreateDirectory(Path.Combine(root,"requesters","a"));
        var path=Path.Combine(root,"logistics.json");
        await File.WriteAllTextAsync(path,"""{"schema_version":1,"topic":"logistics","session_id":"world:2","tick":500,"data":{"requesters_available":true,"requesters_ref":{"schema_version":1,"bank":"a","revision":300,"page_count":2,"row_count":3}}}""");
        await File.WriteAllTextAsync(Path.Combine(root,"requesters","a","00001.json"),"""{"schema_version":1,"topic":"requesters_page","session_id":"world:2","revision":300,"index":1,"rows":[{"unit_number":11},{"unit_number":12}]}""");
        await File.WriteAllTextAsync(Path.Combine(root,"requesters","a","00002.json"),"""{"schema_version":1,"topic":"requesters_page","session_id":"world:2","revision":300,"index":2,"rows":[{"unit_number":13}]}""");
        return path;
    }
}
