using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Factorio.Core;

// Reads bounded local startup metadata only; never asks the game for data.
public sealed class CollectorStartupProbe(string? gameProfile)
{
    private readonly object gate = new();
    private DateTimeOffset previousStart;
    private DateTime logStamp, configStamp;
    private long nextCheck;
    private string state = "unknown";

    public string Read(DateTimeOffset startedAt)
    {
        if (string.IsNullOrWhiteSpace(gameProfile)) return "unknown";
        lock (gate)
        {
            if (startedAt == previousStart && Environment.TickCount64 < nextCheck) return state;
            nextCheck = Environment.TickCount64 + 2000;
            try
            {
                var log = Path.Combine(gameProfile, "factorio-current.log");
                var config = Path.Combine(gameProfile, "mods", "mod-list.json");
                var currentLog = File.GetLastWriteTimeUtc(log);
                var currentConfig = File.GetLastWriteTimeUtc(config);
                if (startedAt == previousStart && currentLog == logStamp && currentConfig == configStamp) return state;
                previousStart = startedAt; logStamp = currentLog; configStamp = currentConfig;
                state = Evaluate(ReadPrefix(config, 1024 * 1024, requireComplete: true),
                    ReadPrefix(log, 256 * 1024, requireComplete: false), startedAt);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
            { state = "unknown"; }
            return state;
        }
    }

    private static string? ReadPrefix(string path, int limit, bool requireComplete)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        if (requireComplete && stream.Length > limit) return null;
        var bytes = new byte[(int)Math.Min(stream.Length, limit)];
        var count = 0;
        while (count < bytes.Length)
        {
            var read = stream.Read(bytes, count, bytes.Length - count);
            if (read == 0) break;
            count += read;
        }
        return Encoding.UTF8.GetString(bytes, 0, count);
    }

    public static string Evaluate(string? modList, string? startupLog, DateTimeOffset startedAt)
    {
        if (startupLog is null) return "unknown";
        // A profile can be shared by several processes: only diagnose a matching startup log.
        var stamp = Regex.Match(startupLog, @"\A[^\r\n]*?(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})");
        if (!stamp.Success || !DateTimeOffset.TryParseExact(stamp.Groups[1].Value, "yyyy-MM-dd HH:mm:ss",
                CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var logStart)
            || Math.Abs((logStart - startedAt).TotalSeconds) > 10) return "unknown";
        var initialized = startupLog.Contains("Factorio initialised", StringComparison.Ordinal);
        if (!initialized) return "starting";
        if (startupLog.Contains("Checksum of factory-telemetry:", StringComparison.Ordinal))
            return startupLog.Contains("Checksum for script __factory-telemetry__/control.lua:", StringComparison.Ordinal)
                ? "awaiting_export" : "awaiting_map";
        if (modList is null) return "unknown";
        try
        {
            using var config = JsonDocument.Parse(modList);
            if (!config.RootElement.TryGetProperty("mods", out var mods) || mods.ValueKind != JsonValueKind.Array) return "unknown";
            foreach (var mod in mods.EnumerateArray())
            {
                if (!mod.TryGetProperty("name", out var name) || name.GetString() != "factory-telemetry") continue;
                if (!mod.TryGetProperty("enabled", out var enabled)) return "unknown";
                return enabled.ValueKind switch { JsonValueKind.True => "restart_required", JsonValueKind.False => "disabled", _ => "unknown" };
            }
            return "not_installed";
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException) { return "unknown"; }
    }
}
