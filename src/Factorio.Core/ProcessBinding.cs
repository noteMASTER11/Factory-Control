using System.Text.Json;
using System.Text.Json.Serialization;

namespace Factorio.Core;

public sealed record ProcessBinding(
    [property:JsonPropertyName("process_id")] int ProcessId,
    [property:JsonPropertyName("executable")] string Executable,
    [property:JsonPropertyName("started_at_utc")] DateTimeOffset StartedAt)
{
    public bool Matches(int processId,string executable,DateTimeOffset startedAt) => ProcessId>0
        && ProcessId==processId && StartedAt> DateTimeOffset.UnixEpoch && StartedAt==startedAt
        && !string.IsNullOrWhiteSpace(Executable)
        && Path.GetFullPath(Executable).Equals(Path.GetFullPath(executable),StringComparison.OrdinalIgnoreCase);
    public static ProcessBinding? Parse(string json)
    {
        if(json.Length>4096)return null;
        try
        {
            var binding=JsonSerializer.Deserialize<ProcessBinding>(json);
            return binding is {ProcessId:>0} && !string.IsNullOrWhiteSpace(binding.Executable)
                && Path.IsPathFullyQualified(binding.Executable) && binding.StartedAt>DateTimeOffset.UnixEpoch ? binding : null;
        }
        catch(JsonException) { return null; }
    }
}
