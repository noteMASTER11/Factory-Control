using System.Text.Json.Nodes;
using System.Text.Json;

namespace Factorio.Core;

internal static class LogisticsProjection
{
    private static IEnumerable<JsonNode> Rows(JsonNode? value)
    {
        if(value is JsonValue encoded&&encoded.TryGetValue<EncodedJsonArray>(out var details))value=JsonNode.Parse(details.Json.Span);
        return value is JsonArray array?array.OfType<JsonObject>():[];
    }
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
    public static void Requests(JsonObject target,JsonNode? source,JsonObject? summary=null)
    {
        if(summary is null)
        {
            var accumulator=new RequestAccumulator();
            foreach(var chest in Rows(source?["requesters"]))accumulator.Add(chest);
            accumulator.Write(target);
        }
        else foreach(var field in summary)target[field.Key]=field.Value?.DeepClone();
        if(source?["requesters_ref"] is {} reference){target["requests_tick"]=reference["revision"]?.DeepClone();target["sample_start_tick"]=reference["sample_start_tick"]?.DeepClone();target["sample_end_tick"]=reference["sample_end_tick"]?.DeepClone();}
    }
    internal sealed class RequestAccumulator
    {
        private readonly Dictionary<(string Surface,string Force,string Name,string Quality),Request> groups=[];
        private int unsupported;
        private readonly Dictionary<(string Name,string Quality),double> requests=[];
        private readonly Dictionary<(string Name,string Quality),double> contents=[];
        private readonly Dictionary<(string Name,string Quality),double> incoming=[];
        private static JsonElement Field(JsonElement row,string key)=>row.ValueKind==JsonValueKind.Object&&row.TryGetProperty(key,out var value)?value:default;
        private static string Text(JsonElement value,string fallback="")=>value.ValueKind==JsonValueKind.String?value.GetString()!:fallback;
        private static double Number(JsonElement value,double fallback=0)=>value.ValueKind==JsonValueKind.Number&&value.TryGetDouble(out var number)&&double.IsFinite(number)?number:fallback;
        private static IEnumerable<JsonElement> Rows(JsonElement value)=>value.ValueKind==JsonValueKind.Array?value.EnumerateArray():[];
        private static (string Name,string Quality) Key(JsonElement row)=>(Text(Field(row,"name")),Text(Field(row,"quality"),"normal"));
        private static void Contents(JsonElement value,Dictionary<(string,string),double> target)
        {
            target.Clear();
            foreach(var row in Rows(value)){var key=Key(row);target[key]=target.GetValueOrDefault(key)+Math.Max(0,Number(Field(row,"count")));}
        }
        public void Add(JsonNode chest)
        {
            using var document=JsonDocument.Parse(chest.ToJsonString());
            Add(document.RootElement);
        }
        public void Add(JsonElement chest)
        {
            requests.Clear();
            foreach(var section in Rows(Field(chest,"sections")))
            {
                if(Field(section,"active").ValueKind==JsonValueKind.False)continue;
                var multiplier=Number(Field(section,"multiplier"),1);
                foreach(var filter in Rows(Field(section,"filters")))
                {
                    var item=Field(filter,"value");
                    if(item.ValueKind!=JsonValueKind.Object||string.IsNullOrEmpty(Text(Field(item,"name")))||Text(Field(item,"type"),"item")!="item")continue;
                    if(Text(Field(item,"comparator"),"=")!="="){unsupported++;continue;}
                    var key=Key(item);requests[key]=requests.GetValueOrDefault(key)+Math.Floor(Number(Field(filter,"min"))*multiplier);
                }
            }
            Contents(Field(chest,"items"),contents);Contents(Field(chest,"delivering"),incoming);
            foreach(var (key,requested) in requests)
            {
                if(requested<=0)continue;
                var group=(Text(Field(chest,"surface")),Text(Field(chest,"force")),key.Name,key.Quality);
                if(!groups.TryGetValue(group,out var request))groups[group]=request=new Request();
                var held=contents.GetValueOrDefault(key);var delivery=incoming.GetValueOrDefault(key);
                request.Requested+=requested;request.Present+=held;request.Incoming+=delivery;request.Missing+=Math.Max(0,requested-held-delivery);request.Containers++;
            }
        }
        public void Write(JsonObject target)
        {
            var rows=new JsonArray();
            foreach(var (k,r) in groups.OrderByDescending(p=>p.Value.Missing).ThenBy(p=>p.Key.Name,StringComparer.Ordinal).Take(512))
                rows.Add(new JsonObject{["surface"]=k.Surface,["force"]=k.Force,["name"]=k.Name,["quality"]=k.Quality,["requested"]=r.Requested,["present"]=r.Present,["incoming"]=r.Incoming,["missing"]=r.Missing,["containers"]=r.Containers});
            target["requests"]=rows;target["request_groups_total"]=groups.Count;target["unsupported_filters"]=unsupported;
        }
    }
    private sealed class Request {public double Requested,Present,Incoming,Missing;public int Containers;}
}
