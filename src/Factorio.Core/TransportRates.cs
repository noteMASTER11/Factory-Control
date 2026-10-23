using System.Text.Json.Nodes;
namespace Factorio.Core;
public sealed record TransportRate(bool Available,bool Ready,double Imported=0,double Exported=0);
public static class TransportRates
{
    public static TransportRate Read(Snapshot? snapshot,JsonNode resource,DateTimeOffset now)
    {
        var space=snapshot?.Payload["data"]?["space"];
        if(space?["schema_version"]?.GetValue<int>()!=1)return new(false,false);
        var end=space["rate_window_end_tick"]?.GetValue<long>()??0;
        if(snapshot is null||now-snapshot.WrittenAt>TimeSpan.FromSeconds(15)
            ||space["rate_overflow"]?.GetValue<bool>()==true
            ||space["production_statistics_include_transfers"]?.GetValue<bool>()!=false
            ||(space["started_tick"]?.GetValue<long>()??end)>end-3600
            ||(space["rate_gap_tick"]?.GetValue<long>()??end)>end-3600
            ||space["flow_rates"] is not JsonArray rates)return new(true,false);
        static string Text(JsonNode? n,string fallback="")=>n?.GetValue<string>()??fallback;
        var rows=rates.Where(r=>r is not null&&Text(r["surface"])==Text(resource["surface"])&&Text(r["force"])==Text(resource["force"])).ToArray();
        if(rows.Any(r=>snapshot.Tick-(r!["window_end_tick"]?.GetValue<long>()??0)>900
            ||(r!["window_end_tick"]?.GetValue<long>()??0)-3600<Math.Max(space["started_tick"]!.GetValue<long>(),space["rate_gap_tick"]!.GetValue<long>())))return new(true,false);
        var row=Text(resource["kind"],"item")=="item"?rows.FirstOrDefault(r=>Text(r!["name"])==Text(resource["name"])&&Text(r["quality"],"normal")==Text(resource["quality"],"normal")):null;
        return new(true,true,row?["imported"]?.GetValue<double>()??0,row?["exported"]?.GetValue<double>()??0);
    }
}
