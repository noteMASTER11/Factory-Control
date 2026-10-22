using System.Text.Json;
using System.Text.Json.Nodes;

namespace Factorio.Core;

// Reconstruction runs in the external bridge. Factorio serializes one small page per tick.
public sealed class RequesterPages
{
    private string? cachedKey;
    private JsonArray? cachedRows;
    public async Task<JsonArray?> ReadAsync(string root,string session,JsonObject reference,CancellationToken ct)
    {
        try
        {
            var bank=reference["bank"]?.GetValue<string>();
            var revision=reference["revision"]?.GetValue<long>();
            var pages=reference["page_count"]?.GetValue<int>();
            var count=reference["row_count"]?.GetValue<int>();
            if(reference["schema_version"]?.GetValue<int>()!=1||bank is not ("a" or "b")||revision is null||revision<0||pages is null or <0 or >65536||count is null or <0 or >1048576)return null;
            var key=$"{Path.GetFullPath(root)}|{session}|{bank}|{revision}|{pages}|{count}";
            if(key==cachedKey)return cachedRows?.DeepClone().AsArray();
            var rows=new JsonArray();long bytes=0;
            for(var index=1;index<=pages.Value;index++)
            {
                var path=Path.Combine(root,"requesters",bank,index.ToString("D5")+".json");
                var stamp=File.GetLastWriteTimeUtc(path);
                await using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete,8192,true);
                bytes+=stream.Length;if(stream.Length>1024*1024||bytes>32*1024*1024)return null;
                var page=await JsonNode.ParseAsync(stream,cancellationToken:ct) as JsonObject;
                if(stamp!=File.GetLastWriteTimeUtc(path)||page?["schema_version"]?.GetValue<int>()!=1||page["session_id"]?.GetValue<string>()!=session||page["revision"]?.GetValue<long>()!=revision||page["index"]?.GetValue<int>()!=index||page["rows"] is not JsonArray items||items.Count>16)return null;
                while(items.Count>0){var row=items[0];items.RemoveAt(0);rows.Add(row);}
                if(rows.Count>count)return null;
            }
            if(rows.Count!=count)return null;
            cachedKey=key;cachedRows=rows;
            return rows.DeepClone().AsArray();
        }
        catch(Exception ex)when(ex is IOException or JsonException or InvalidOperationException or FormatException or ArgumentException){return null;}
    }
}
