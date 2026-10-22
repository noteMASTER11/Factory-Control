using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Factorio.Core;

// Completed, validated requester details stay encoded until a caller explicitly inspects them.
// The converter writes an ordinary JSON array on every public HTTP/MCP/history route.
[JsonConverter(typeof(EncodedJsonArrayConverter))]
internal sealed record EncodedJsonArray(ReadOnlyMemory<byte> Json);

internal sealed class EncodedJsonArrayConverter:JsonConverter<EncodedJsonArray>
{
    public EncodedJsonArrayConverter() { }
    public override EncodedJsonArray Read(ref Utf8JsonReader reader,Type type,JsonSerializerOptions options)
    {
        using var document=JsonDocument.ParseValue(ref reader);
        if(document.RootElement.ValueKind!=JsonValueKind.Array)throw new JsonException("Expected requester array.");
        return new(Encoding.UTF8.GetBytes(document.RootElement.GetRawText()));
    }
    public override void Write(Utf8JsonWriter writer,EncodedJsonArray value,JsonSerializerOptions options)
    {
        var bytes=value.Json.Span;
        var reader=new Utf8JsonReader(bytes);
        if(!reader.Read()||reader.TokenType!=JsonTokenType.StartArray)throw new JsonException("Expected requester array.");
        writer.WriteStartArray();
        var batch=0;
        while(reader.Read()&&reader.TokenType!=JsonTokenType.EndArray)
        {
            var start=(int)reader.TokenStartIndex;reader.Skip();
            writer.WriteRawValue(bytes.Slice(start,(int)reader.BytesConsumed-start),skipInputValidation:true);
            // Do not make a stream writer allocate one contiguous multi-megabyte staging buffer.
            if(++batch==32){writer.Flush();batch=0;}
        }
        writer.WriteEndArray();
    }
}
