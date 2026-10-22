using System.Text.Json.Nodes;

namespace Factorio.Core;

public static class ClientTelemetry
{
    // Aggregated once on ingestion, outside the game. Detailed routes retain the original snapshot.
    public static JsonObject Project(string topic, JsonObject payload)
    {
        if(topic!="logistics")return payload;
        var result=new JsonObject();
        foreach(var field in payload)if(field.Key!="data")result[field.Key]=field.Value?.DeepClone();
        var source=payload["data"];
        var data=new JsonObject
        {
            ["requester_count"]=source?["requester_count"]?.DeepClone()??JsonValue.Create((source?["requesters"] as JsonArray)?.Count??0),
            ["requesters_available"]=source?["requesters_available"]?.DeepClone(),
            ["request_age_available"]=source?["request_age_available"]?.DeepClone(),
            ["train_eta_available"]=source?["train_eta_available"]?.DeepClone()
        };
        foreach(var (field,keys) in new[]{
            ("networks",new[]{"id","name","surface","force","logistic_total","logistic_available","construction_total","construction_available"}),
            ("trains",new[]{"id","state","speed","manual","surface","force","station","position","eta_available"})})
        {
            var rows=new JsonArray();
            if(source?[field] is JsonArray array)foreach(var row in array)
            {
                var projected=new JsonObject();
                foreach(var key in keys)if(row?[key] is {} value)projected[key]=value.DeepClone();
                if(field=="networks")projected["item_count"]=LogisticsProjection.ItemCount(row?["items"]);
                else LogisticsProjection.TrainDetails(projected,row);
                rows.Add(projected);
            }
            data[field]=rows;
        }
        LogisticsProjection.Requests(data,source);
        result["data"]=data;return result;
    }

    public static bool InventoryComplete(JsonObject payload)=>
        payload["coverage"]?["discovery_complete"]?.GetValue<bool>()==true
        && (payload["data"]?["collection_mode"]?.GetValue<string>()!="rolling"
            || payload["data"]?["inventory_complete"]?.GetValue<bool>()==true);
    public static bool InventoryUsable(Snapshot snapshot,DateTimeOffset now)=>
        InventoryComplete(snapshot.Payload)&&now-snapshot.WrittenAt<=TimeSpan.FromSeconds(15);
}
