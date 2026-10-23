using System.Text.Json.Nodes;
using Factorio.Core;
using Xunit;

namespace Factorio.Tests;

public sealed class NativeChartTests
{
    [Fact]
    public void AtlasContainsEveryIndexedChunkWithTransparentUnknownCellsAndNoScopeMixing()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","atlas-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root,"map","g","7-3"));
        File.WriteAllText(Path.Combine(root,"map.json"),"""{"schema_version":1,"session_id":"world","generation":"g","format":"rgb565le","chunk_size":32,"scopes":[{"id":"7-3","surface":"gleba","force":"Newbies","tiles":[[-1,-1,100],[-2,-1,101]]}]}""");
        var pixels=new byte[2048];for(var i=0;i<pixels.Length;i+=2){pixels[i]=0;pixels[i+1]=248;}
        File.WriteAllBytes(Path.Combine(root,"map","g","7-3","-1_-1.bin"),pixels);
        File.WriteAllBytes(Path.Combine(root,"map","g","7-3","-2_-1.bin"),pixels);
        var store=new NativeChartStore(root);
        foreach(var level in new[]{0,1,2})
        {
            var page=store.ReadPage("world","g","7-3",level,-1,-1)!;
            Assert.Equal(256*256*4,page.Length);
            Assert.Equal(new byte[]{255,0,0,255},page[^4..]);
            Assert.Equal(new byte[]{0,0,0,0},page[..4]);
        }
        Assert.Null(store.ReadPage("world","g","7-4",0,-1,-1));
        Assert.Null(store.ReadPage("another-world","g","7-3",0,-1,-1));
        Assert.Null(store.ReadPage("world","g","7-3",3,-1,-1));
        Assert.Null(store.ReadPage("world","g","7-3",0,0,0));
        Assert.Null(store.ReadPage("world","../g","7-3",0,-1,-1));
    }

    [Fact]
    public void ServesOnlyCompleteTilesFromTheCurrentManifestAndScope()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","chart-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root,"map","g","7-3"));
        File.WriteAllText(Path.Combine(root,"map.json"),"""{"schema_version":1,"session_id":"world","generation":"g","format":"rgb565le","chunk_size":32,"scopes":[{"id":"7-3","surface":"gleba","force":"Newbies","tiles":[[-1,2,100]]}]}""");
        var path=Path.Combine(root,"map","g","7-3","-1_2.bin");File.WriteAllBytes(path,new byte[2048]);
        var store=new NativeChartStore(root);
        Assert.NotNull(store.ReadManifest("world"));
        Assert.Null(store.ReadManifest("another-world"));
        Assert.Equal(2048,store.ReadTile("world","g","7-3",-1,2)!.Length);
        Assert.Null(store.ReadTile("world","g","7-4",-1,2));
        Assert.Null(store.ReadTile("world","g","7-3",0,2));
        Assert.Null(store.ReadTile("world","../g","7-3",-1,2));
        File.WriteAllBytes(path,new byte[200]);
        Assert.Null(store.ReadTile("world","g","7-3",-1,2));
    }

    [Fact]
    public void RejectsInvalidManifestPathsAndNormalizesEmptyLuaCollections()
    {
        var root=Path.Combine(@"D:\ChatGPT\Temp\FactorioMonitor","chart-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root,"map.json"),"""{"schema_version":1,"session_id":"s","generation":"../bad","format":"rgb565le","chunk_size":32,"scopes":{}}""");
        Assert.Null(new NativeChartStore(root).ReadManifest("s"));
        File.WriteAllText(Path.Combine(root,"map.json"),"""{"schema_version":1,"session_id":"s","generation":"valid","format":"rgb565le","chunk_size":32,"scopes":{}}""");
        Assert.IsType<JsonArray>(new NativeChartStore(root).ReadManifest("s")!["scopes"]);
    }
}
