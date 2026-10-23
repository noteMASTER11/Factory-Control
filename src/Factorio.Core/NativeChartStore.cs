using System.Text.Json;
using System.Text.Json.Nodes;

namespace Factorio.Core;

// Cached file exports only. Map pixels never enter telemetry history or snapshot messages.
public sealed class NativeChartStore(string directory)
{
    private readonly object sync=new();
    private readonly string root=Path.GetFullPath(directory);
    private JsonObject? manifest;
    private DateTime stamp;
    private long nextRead;
    private readonly HashSet<(string Scope,int X,int Y)> tiles=[];
    private readonly Dictionary<(string Scope,int X,int Y),long> versions=[];
    private readonly Dictionary<(string Generation,string Scope,int Level,int X,int Y), (int Version,byte[] Pixels,long Used)> pages=[];
    private static bool Component(string? value)=>value is {Length:>0 and <=128}
        && value.All(c=>char.IsAsciiLetterOrDigit(c)||c is '-' or '_');

    public JsonObject? ReadManifest(string? session)
    {
        if(string.IsNullOrEmpty(session))return null;
        lock(sync)
        {
            try
            {
                if(Environment.TickCount64>=nextRead)
                {
                    nextRead=Environment.TickCount64+2000;
                    var path=Path.Combine(root,"map.json");
                    if(!File.Exists(path)){manifest=null;tiles.Clear();return null;}
                    var file=new FileInfo(path);
                    if(file.Length>16*1024*1024){manifest=null;tiles.Clear();return null;}
                    if(manifest is null||file.LastWriteTimeUtc!=stamp)
                    {
                        var before=file.LastWriteTimeUtc;
                        using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);
                        var candidate=JsonNode.Parse(stream) as JsonObject;
                        if(File.GetLastWriteTimeUtc(path)!=before)return Matching(session);
                        if(candidate?["schema_version"]?.GetValue<int>()!=1||candidate["format"]?.GetValue<string>()!="rgb565le"
                            ||candidate["chunk_size"]?.GetValue<int>()!=32||!Component(candidate["generation"]?.GetValue<string>()))
                        {manifest=null;tiles.Clear();return null;}
                        SnapshotFiles.NormalizeArrays(candidate);
                        if(candidate["scopes"] is not JsonArray {Count:<=128} scopes){manifest=null;tiles.Clear();return null;}
                        var nextTiles=new HashSet<(string,int,int)>();
                        var nextVersions=new Dictionary<(string,int,int),long>();
                        foreach(var scope in scopes)
                        {
                            var id=scope?["id"]?.GetValue<string>();
                            if(!Component(id)||scope?["tiles"] is not JsonArray rows)continue;
                            foreach(var row in rows)
                            {
                                if(row is not JsonArray {Count:3} cell)continue;
                                var x=cell[0]!.GetValue<int>();var y=cell[1]!.GetValue<int>();
                                if(Math.Abs((long)x)>1000000||Math.Abs((long)y)>1000000)continue;
                                if(nextTiles.Count>=131072)throw new JsonException("Chart tile index exceeds its limit.");
                                nextTiles.Add((id!,x,y));
                                nextVersions[(id!,x,y)]=cell[2]!.GetValue<long>();
                            }
                        }
                        manifest=candidate;stamp=before;tiles.Clear();tiles.UnionWith(nextTiles);
                        versions.Clear();foreach(var pair in nextVersions)versions.Add(pair.Key,pair.Value);
                    }
                }
                return Matching(session);
            }
            catch(Exception ex)when(ex is IOException or JsonException or InvalidOperationException or FormatException)
            {return Matching(session);}
        }
    }
    private JsonObject? Matching(string session)=>manifest?["session_id"]?.GetValue<string>()==session?manifest:null;

    // A page is always 256x256 RGBA; lower zooms cover more world area without
    // more SVG images or decoded pixels. Only already exported files are read.
    public byte[]? ReadPage(string? session,string generation,string scope,int level,int x,int y)
    {
        if(level is <0 or >2||!Component(generation)||!Component(scope)
            ||Math.Abs((long)x)>25000||Math.Abs((long)y)>25000||ReadManifest(session) is not {} current)return null;
        lock(sync)
        {
            if(!ReferenceEquals(current,manifest)||Matching(session!) is null||current["generation"]?.GetValue<string>()!=generation)return null;
            var chunks=8<<level;var sample=1<<level;var tileSize=32/sample;
            var entries=new List<(int X,int Y)>();var hash=new HashCode();
            for(var dy=0;dy<chunks;dy++)for(var dx=0;dx<chunks;dx++)
            {
                var cx=x*chunks+dx;var cy=y*chunks+dy;
                if(!versions.TryGetValue((scope,cx,cy),out var version))continue;
                entries.Add((cx,cy));hash.Add(cx);hash.Add(cy);hash.Add(version);
            }
            if(entries.Count==0)return null;
            var key=(generation,scope,level,x,y);var signature=hash.ToHashCode();
            if(pages.TryGetValue(key,out var cached)&&cached.Version==signature)
            {pages[key]=(signature,cached.Pixels,Environment.TickCount64);return cached.Pixels;}
            var pixels=new byte[256*256*4];
            foreach(var chunk in entries)
            {
                var data=ReadPixels(generation,scope,chunk.X,chunk.Y);if(data is null)return null;
                var left=(chunk.X-x*chunks)*tileSize;var top=(chunk.Y-y*chunks)*tileSize;
                for(var py=0;py<tileSize;py++)for(var px=0;px<tileSize;px++)
                {
                    var r=0;var g=0;var b=0;
                    for(var sy=0;sy<sample;sy++)for(var sx=0;sx<sample;sx++)
                    {
                        var offset=((py*sample+sy)*32+px*sample+sx)*2;
                        var value=data[offset]|data[offset+1]<<8;var red=value>>11;var green=value>>5&63;var blue=value&31;
                        r+=(red<<3)|(red>>2);g+=(green<<2)|(green>>4);b+=(blue<<3)|(blue>>2);
                    }
                    var target=((top+py)*256+left+px)*4;var count=sample*sample;
                    pixels[target]=(byte)(r/count);pixels[target+1]=(byte)(g/count);pixels[target+2]=(byte)(b/count);pixels[target+3]=255;
                }
            }
            pages[key]=(signature,pixels,Environment.TickCount64);
            while(pages.Count>32)pages.Remove(pages.MinBy(p=>p.Value.Used).Key);
            return pixels;
        }
    }

    private byte[]? ReadPixels(string generation,string scope,int x,int y)
    {
        try
        {
            var path=Path.Combine(root,"map",generation,scope,$"{x}_{y}.bin");
            var before=File.GetLastWriteTimeUtc(path);
            using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);
            if(stream.Length!=2048)return null;
            var result=new byte[2048];stream.ReadExactly(result);
            return before==File.GetLastWriteTimeUtc(path)?result:null;
        }
        catch(IOException){return null;}
    }

    public byte[]? ReadTile(string? session,string generation,string scope,int x,int y)
    {
        if(!Component(generation)||!Component(scope)||ReadManifest(session) is not {} current)return null;
        lock(sync)
        {
            if(!ReferenceEquals(current,manifest)||Matching(session!) is null||current["generation"]?.GetValue<string>()!=generation||!tiles.Contains((scope,x,y)))return null;
            return ReadPixels(generation,scope,x,y);
        }
    }
}
