using System.Text.Json.Nodes;

namespace Factorio.Core;

internal static class LogisticsProjection
{
    private static IEnumerable<JsonNode> Rows(JsonNode? value)=>value is JsonArray a?a.OfType<JsonObject>():[];
    private static string Text(JsonNode? n,string fallback="")=>n is JsonValue v&&v.TryGetValue<string>(out var s)?s:fallback;
    private static double Number(JsonNode? n,double fallback=0)
    {
        if(n is not JsonValue v)return fallback;
        if(v.TryGetValue<double>(out var d))return double.IsFinite(d)?d:fallback;
        if(v.TryGetValue<int>(out var i))return i;
        if(v.TryGetValue<long>(out var l))return l;
        return fallback;
    }
    private static (string Name,string Quality) Key(JsonNode row)=>(Text(row["name"]),Text(row["quality"],"normal"));
    private static Dictionary<(string,string),double> Contents(JsonNode? value)
    {
        var result=new Dictionary<(string,string),double>();
        foreach(var r in Rows(value)){var k=Key(r);result[k]=result.GetValueOrDefault(k)+Math.Max(0,Number(r["count"]));}
        return result;
    }
    public static double ItemCount(JsonNode? items)=>Contents(items).Values.Sum();
    public static void TrainDetails(JsonObject target,JsonNode? train)
    {
        if(train is null)return;
        var fluids=train["fluids"] is JsonObject map?map.Select(p=>new JsonObject{["name"]=p.Key,["kind"]="fluid",["count"]=Number(p.Value)}):Rows(train["fluids"]).Select(r=>new JsonObject{["name"]=Text(r["name"]),["kind"]="fluid",["count"]=Number(r["amount"],Number(r["count"]))});
        var cargo=Rows(train["items"]).Select(r=>new JsonObject{["name"]=Text(r["name"]),["quality"]=Text(r["quality"],"normal"),["kind"]="item",["count"]=Number(r["count"])})
            .Concat(fluids).OrderByDescending(r=>Number(r["count"])).ToArray();
        target["cargo"]=new JsonArray(cargo.Take(6).Cast<JsonNode>().ToArray());target["cargo_kinds"]=cargo.Length;
        var records=Rows(train["schedule"]?["records"]).ToArray();
        var current=(int)Number(train["schedule"]?["current"],1)-1;
        target["destination"]=current>=0&&current<records.Length?Text(records[current]["station"]):null;
        target["route"]=new JsonArray(records.Where(r=>r["station"] is not null).Take(12).Select(r=>(JsonNode?)JsonValue.Create(Text(r["station"]))).ToArray());
    }
    public static void Requests(JsonObject target,JsonNode? source)
    {
        var groups=new Dictionary<(string Surface,string Force,string Name,string Quality),Request>();var unsupported=0;
        foreach(var chest in Rows(source?["requesters"]))
        {
            var requests=new Dictionary<(string Name,string Quality),double>();
            foreach(var section in Rows(chest["sections"]))
            {
                if(section["active"]?.GetValue<bool>()==false)continue;
                var multiplier=Number(section["multiplier"],1);
                foreach(var filter in Rows(section["filters"]))
                {
                    var item=filter["value"];
                    if(item is not JsonObject||string.IsNullOrEmpty(Text(item["name"]))||Text(item["type"],"item")!="item")continue;
                    if(Text(item["comparator"],"=")!="="){unsupported++;continue;}
                    var k=Key(item);requests[k]=requests.GetValueOrDefault(k)+Math.Floor(Number(filter["min"])*multiplier);
                }
            }
            var contents=Contents(chest["items"]);var incoming=Contents(chest["delivering"]);
            foreach(var (key,requested) in requests)
            {
                if(requested<=0)continue;
                var k=(Text(chest["surface"]),Text(chest["force"]),key.Name,key.Quality);
                if(!groups.TryGetValue(k,out var r))groups[k]=r=new Request();
                var held=contents.GetValueOrDefault(key);var delivery=incoming.GetValueOrDefault(key);
                r.Requested+=requested;r.Present+=held;r.Incoming+=delivery;r.Missing+=Math.Max(0,requested-held-delivery);r.Containers++;
            }
        }
        var rows=new JsonArray();
        foreach(var (k,r) in groups.OrderByDescending(p=>p.Value.Missing).ThenBy(p=>p.Key.Name,StringComparer.Ordinal).Take(512))
            rows.Add(new JsonObject{["surface"]=k.Surface,["force"]=k.Force,["name"]=k.Name,["quality"]=k.Quality,["requested"]=r.Requested,["present"]=r.Present,["incoming"]=r.Incoming,["missing"]=r.Missing,["containers"]=r.Containers});
        target["requests"]=rows;target["request_groups_total"]=groups.Count;target["unsupported_filters"]=unsupported;
        if(source?["requesters_ref"] is {} reference){target["requests_tick"]=reference["revision"]?.DeepClone();target["sample_start_tick"]=reference["sample_start_tick"]?.DeepClone();target["sample_end_tick"]=reference["sample_end_tick"]?.DeepClone();}
    }
    private sealed class Request {public double Requested,Present,Incoming,Missing;public int Containers;}
}
