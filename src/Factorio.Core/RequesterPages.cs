using System.Text.Json;
using System.Text.Json.Nodes;

namespace Factorio.Core;

// Reconstruction runs in the external bridge. Factorio serializes one small page per tick.
public sealed class RequesterPages
{
    private string? cachedKey;
    private byte[]? cachedJson;
    private JsonObject? cachedSummary;
    public sealed record PageSet(JsonNode Rows,JsonObject Summary);
    private PageSet Cached()=>new(JsonValue.Create(new EncodedJsonArray(cachedJson!))!,cachedSummary!);
    public async Task<PageSet?> ReadAsync(string root,string session,JsonObject reference,CancellationToken ct)
    {
        try
        {
            var bank=reference["bank"]?.GetValue<string>();
            var revision=reference["revision"]?.GetValue<long>();
            var pages=reference["page_count"]?.GetValue<int>();
            var count=reference["row_count"]?.GetValue<int>();
            if(reference["schema_version"]?.GetValue<int>()!=1||bank is not ("a" or "b")||revision is null||revision<0||pages is null or <0 or >65536||count is null or <0 or >1048576)return null;
            var key=$"{Path.GetFullPath(root)}|{session}|{bank}|{revision}|{pages}|{count}";
            if(key==cachedKey)return Cached();
            using var buffer=new MemoryStream();
            using var writer=new Utf8JsonWriter(buffer);
            writer.WriteStartArray();
            var summary=new LogisticsProjection.RequestAccumulator();
            var rowCount=0;long bytes=0;
            for(var index=1;index<=pages.Value;index++)
            {
                var path=Path.Combine(root,"requesters",bank,index.ToString("D5")+".json");
                var stamp=File.GetLastWriteTimeUtc(path);
                await using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete,1,true);
                bytes+=stream.Length;if(stream.Length>1024*1024||bytes>32*1024*1024)return null;
                using var document=await JsonDocument.ParseAsync(stream,cancellationToken:ct);
                var page=document.RootElement;
                if(stamp!=File.GetLastWriteTimeUtc(path)||!page.TryGetProperty("schema_version",out var schema)||schema.GetInt32()!=1
                    ||!page.TryGetProperty("session_id",out var world)||world.GetString()!=session
                    ||!page.TryGetProperty("revision",out var rev)||rev.GetInt64()!=revision
                    ||!page.TryGetProperty("index",out var number)||number.GetInt32()!=index
                    ||!page.TryGetProperty("rows",out var items)||items.ValueKind!=JsonValueKind.Array||items.GetArrayLength()>16)return null;
                foreach(var row in items.EnumerateArray())
                {if(row.ValueKind!=JsonValueKind.Object)return null;summary.Add(row);SnapshotFiles.WriteNormalized(writer,row);rowCount++;}
                if(rowCount>count)return null;
            }
            if(rowCount!=count)return null;
            writer.WriteEndArray();writer.Flush();
            var result=new JsonObject();summary.Write(result);
            // Keep immutable encoded details, not tens of thousands of expanded mutable trees.
            cachedJson=buffer.ToArray();cachedSummary=result;cachedKey=key;
            return Cached();
        }
        catch(Exception ex)when(ex is IOException or JsonException or InvalidOperationException or FormatException or ArgumentException){return null;}
    }
}
