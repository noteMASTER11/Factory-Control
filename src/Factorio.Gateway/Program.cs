using System.Diagnostics;
using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Nodes;
using Factorio.Core;
using Microsoft.Data.Sqlite;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace Factorio.Gateway;

public static class GatewayHost
{
    public static WebApplication Build(IReadOnlyDictionary<string,string?> settings, string url="http://127.0.0.1:18741",ITelemetrySource? directSource=null)
    {
var builder=WebApplication.CreateBuilder(new WebApplicationOptions { Args=[], ApplicationName=typeof(GatewayHost).Assembly.FullName, ContentRootPath=AppContext.BaseDirectory });
builder.Configuration.AddInMemoryCollection(settings);
builder.Logging.ClearProviders();
builder.Services.Configure<HostOptions>(options=>options.ShutdownTimeout=TimeSpan.FromSeconds(5));
builder.WebHost.UseUrls(url);
builder.Services.AddSingleton<SnapshotCache>();
builder.Services.AddSingleton<GatewayState>();
builder.Services.AddSingleton<HistoryStore>();
if(directSource is not null)builder.Services.AddSingleton(directSource);
builder.Services.AddHostedService<McpCollector>();
var app=builder.Build();
app.MapGet("/health",()=>new {service="gateway",process_id=Environment.ProcessId,hosting="desktop",version="0.2.0"});
app.MapGet("/api/v1/status",(GatewayState state,SnapshotCache cache)=>state.Describe(cache));
app.MapGet("/api/v1/client/status",(GatewayState state,SnapshotCache cache)=>state.Describe(cache,true));
app.MapGet("/api/v1/client/updates",(long? since,string? session,GatewayState state,SnapshotCache cache)=>
{
    var delta=cache.Changes(since,session);
    return new{connected=state.Connected,telemetry_ready=cache.Get("status") is not null,session_id=delta.SessionId,source_kind=state.SourceKind,source_process_id=state.SourceProcessId,last_error=state.LastError,mcp_calls=Interlocked.Read(ref state.Calls),telemetry_reads=Interlocked.Read(ref state.Reads),transport=state.Transport,revision=delta.Revision,reset=delta.Reset,topics=delta.Topics.ToDictionary(p=>p.Key,p=>state.Wrap(p.Value,true))};
});
app.MapGet("/api/v1/collector/status",(GatewayState state,SnapshotCache cache)=>state.Describe(cache));
app.MapGet("/api/v1/telemetry/{topic}",(string topic,SnapshotCache cache,GatewayState state)=>
    !GatewayState.Intervals.ContainsKey(topic)?Results.NotFound():cache.Get(topic) is {} s?Results.Json(state.Wrap(s)):Results.Json(new{error="telemetry_not_ready",topic},statusCode:503));
app.MapGet("/api/v1/overview",(SnapshotCache cache,GatewayState state)=>
    Results.Json(new{session_id=cache.SessionId,source_kind=state.SourceKind,topics=GatewayState.Intervals.Keys.ToDictionary(t=>t,t=>cache.Get(t) is {} s?state.Wrap(s):null)}));
foreach(var topic in new[]{"power","production","machines","logistics","research","resources","combat"})
{
    var selected=topic;
    app.MapGet("/api/v1/"+selected,(SnapshotCache cache,GatewayState state)=>cache.Get(selected) is {} s?Results.Json(state.Wrap(s)):Results.Json(new{error="telemetry_not_ready"},statusCode:503));
}
app.MapGet("/api/v1/forecasts",(GatewayState state)=>Results.Json(state.Forecasts));
app.MapGet("/api/v1/history",(string? topic,int? limit,HistoryStore history,SnapshotCache cache)=>
    GatewayState.Intervals.ContainsKey(topic??"production")?Results.Json(history.Read(topic??"production",Math.Clamp(limit??60,1,300),cache.SessionId)):Results.BadRequest(new{error="unknown_topic"}));
app.MapGet("/api/v1/sessions",(SnapshotCache cache,GatewayState state)=>
{
    var processes=new List<object>();
    foreach(var p in Process.GetProcessesByName("factorio"))
    {
        using(p)try {processes.Add(new{pid=p.Id,executable=p.MainModule?.FileName,window=p.MainWindowTitle,telemetry_associated=p.Id==state.SourceProcessId});}catch(Exception ex)when(ex is System.ComponentModel.Win32Exception or InvalidOperationException){processes.Add(new{pid=p.Id,error="process_details_unavailable"});}
    }
    return new{processes,telemetry_session=cache.SessionId,source_kind=state.SourceKind,mcp_connected=state.Connected};
});
app.MapGet("/api/v1/events",async (HttpContext ctx,GatewayState state)=>
{
    ctx.Response.ContentType="text/event-stream";
    ctx.Response.Headers.CacheControl="no-cache";
    long last=-1;
    while(!ctx.RequestAborted.IsCancellationRequested)
    {
        var revision=Interlocked.Read(ref state.Revision);
        if(revision!=last){last=revision;await ctx.Response.WriteAsync("event: telemetry\ndata: "+JsonSerializer.Serialize(new{revision,connected=state.Connected})+"\n\n",ctx.RequestAborted);await ctx.Response.Body.FlushAsync(ctx.RequestAborted);}
        await Task.Delay(1000,ctx.RequestAborted);
    }
});
return app;
    }
}

public sealed class GatewayState
{
    public static readonly IReadOnlyDictionary<string,double> Intervals=TelemetryCadence.Seconds;
    public volatile bool Connected;
    public string SourceKind="unknown";
    public int? SourceProcessId;
    public string? LastError;
    public long Calls,Reads,Revision;
    public string Transport="mcp";
    public JsonObject Forecasts=new(){["rows"]=new JsonArray(),["scope"]="waiting_for_telemetry"};
    public object Wrap(Snapshot s,bool summary=false)=>new{topic=s.Topic,session_id=s.SessionId,tick=s.Tick,written_at=s.WrittenAt,age_seconds=Math.Max(0,(DateTimeOffset.UtcNow-s.WrittenAt).TotalSeconds),stale=(DateTimeOffset.UtcNow-s.WrittenAt).TotalSeconds>Math.Max(15,Intervals[s.Topic]*3),source_kind=SourceKind,payload=summary?(s.ClientPayload??s.Payload):s.Payload};
    public object Describe(SnapshotCache cache,bool summary=false)=>new{connected=Connected,telemetry_ready=cache.Get("status") is not null,discovery_complete=cache.Get("status")?.Payload["coverage"]?["discovery_complete"]?.GetValue<bool>()??false,session_id=cache.SessionId,source_kind=SourceKind,source_process_id=SourceProcessId,last_error=LastError,mcp_calls=Interlocked.Read(ref Calls),telemetry_reads=Interlocked.Read(ref Reads),transport=Transport,revision=Interlocked.Read(ref Revision),topics=Intervals.Keys.ToDictionary(t=>t,t=>cache.Get(t) is {} s?Wrap(s,summary):null)};
    public void UpdateForecasts(SnapshotCache cache)
    {
        var p=cache.Get("production");var m=cache.Get("machines");
        if(p?.Payload["data"]?["rows"] is not JsonArray rows){Volatile.Write(ref Forecasts,new JsonObject{["rows"]=new JsonArray(),["scope"]="waiting_for_current_session"});return;}
        var stocks=m?.Payload["data"]?["stocks"] as JsonArray;
        var complete=m is not null&&ClientTelemetry.InventoryUsable(m,DateTimeOffset.UtcNow);
        var inventory=new Dictionary<string,double>();
        static string Key(JsonNode row)=>$"{row["surface"]}|{row["force"]}|{row["kind"]}|{row["name"]}|{row["quality"]}";
        if(stocks is not null)foreach(var s in stocks){if(s is null)continue;var k=Key(s);inventory[k]=inventory.GetValueOrDefault(k)+(s["count"]?.GetValue<double>()??0);}
        var output=new JsonArray();
        foreach(var row in rows)
        {
            if(row is null)continue;
            var produced=row["produced_per_minute"]!.GetValue<double>();var consumed=row["consumed_per_minute"]!.GetValue<double>();
            if(consumed<=produced)continue;
            double? stock=complete?inventory.GetValueOrDefault(Key(row)):null;
            var f=Forecast.Calculate(produced,consumed,stock,consumed*2,complete);
            output.Add(new JsonObject{["name"]=row["name"]!.DeepClone(),["kind"]=row["kind"]!.DeepClone(),["surface"]=row["surface"]!.DeepClone(),["produced_per_minute"]=produced,["consumed_per_minute"]=consumed,["balance_per_minute"]=produced-consumed,["coverage_ratio"]=f.Coverage,["monitored_inventory_stock"]=stock,["reserve_minutes"]=f.ReserveMinutes,["empty_minutes"]=f.EmptyMinutes,["status"]=f.Status,["confidence"]=complete?"conditional_inventory_only":"insufficient_inventory_coverage",["recommendation"]=new JsonObject{["action"]="investigate_capacity_and_delivery",["additional_required_per_minute"]=Math.Ceiling(consumed*1.05-produced),["automatic_game_changes"]=false}});
        }
        Volatile.Write(ref Forecasts,new JsonObject{["rows"]=output,["tick"]=p.Tick,["scope"]="Conditional on monitored inventories and constant 1-minute flows; not a claim about all factory stock. Demand inference and causal recommendations require further history.",["discovery_complete"]=complete});
    }
}
public sealed class HistoryStore
{
    private readonly string connectionString;
    private readonly int retentionMinutes;
    private DateTimeOffset lastPrune;
    public HistoryStore(IConfiguration config)
    {
        var path=Path.GetFullPath(config["History:Path"]??@"D:\ChatGPT\Projects\FactorioMonitor\Data\history.db");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);connectionString=new SqliteConnectionStringBuilder{DataSource=path}.ToString();
        retentionMinutes=Math.Clamp(config.GetValue("History:RetentionMinutes",60),15,1440);
        using var c=Open();using var cmd=c.CreateCommand();cmd.CommandText="PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS snapshots(session TEXT,topic TEXT,tick INTEGER,written TEXT,json TEXT,PRIMARY KEY(session,topic,tick)); CREATE INDEX IF NOT EXISTS snapshots_topic ON snapshots(topic,written); CREATE INDEX IF NOT EXISTS snapshots_written ON snapshots(written); CREATE INDEX IF NOT EXISTS snapshots_session_topic ON snapshots(session,topic,written DESC);";cmd.ExecuteNonQuery();
    }
    private SqliteConnection Open(){var c=new SqliteConnection(connectionString);c.Open();return c;}
    public void Save(Snapshot s)
    {
        using var c=Open();using var cmd=c.CreateCommand();cmd.CommandText="INSERT OR IGNORE INTO snapshots VALUES($session,$topic,$tick,$written,$json)";
        using var buffer=new MemoryStream();
        using(var compressed=new BrotliStream(buffer,CompressionLevel.Fastest,true))
        using(var writer=new Utf8JsonWriter(compressed))JsonSerializer.Serialize(writer,s.Payload);
        cmd.Parameters.AddWithValue("$session",s.SessionId);cmd.Parameters.AddWithValue("$topic",s.Topic);cmd.Parameters.AddWithValue("$tick",s.Tick);cmd.Parameters.AddWithValue("$written",s.WrittenAt.ToString("O"));cmd.Parameters.AddWithValue("$json",buffer.ToArray());cmd.ExecuteNonQuery();
        if(DateTimeOffset.UtcNow-lastPrune>TimeSpan.FromMinutes(1))
        {
            using var prune=c.CreateCommand();prune.CommandText="DELETE FROM snapshots WHERE written < $cutoff";prune.Parameters.AddWithValue("$cutoff",DateTimeOffset.UtcNow.AddMinutes(-retentionMinutes).ToString("O"));prune.ExecuteNonQuery();lastPrune=DateTimeOffset.UtcNow;
        }
    }
    public object[] Read(string topic,int limit,string? session)
    {
        if(session is null)return [];
        using var c=Open();using var cmd=c.CreateCommand();cmd.CommandText="SELECT session,tick,written,json FROM snapshots WHERE topic=$topic AND session=$session ORDER BY written DESC LIMIT $limit";
        cmd.Parameters.AddWithValue("$session",session);cmd.Parameters.AddWithValue("$topic",topic);cmd.Parameters.AddWithValue("$limit",limit);using var r=cmd.ExecuteReader();var result=new List<object>();
        while(r.Read())
        {
            JsonNode? payload;
            if(r.GetValue(3) is byte[] bytes){using var input=new MemoryStream(bytes,false);using var decoded=new BrotliStream(input,CompressionMode.Decompress);payload=JsonNode.Parse(decoded);}
            else payload=JsonNode.Parse(r.GetString(3));
            result.Add(new{session_id=r.GetString(0),tick=r.GetInt64(1),written_at=r.GetString(2),payload});
        }
        return result.ToArray();
    }
}
public sealed class McpCollector(IConfiguration config,SnapshotCache cache,GatewayState state,HistoryStore history,ILogger<McpCollector> log,IServiceProvider services):BackgroundService
{
    private readonly SerializedPoller serial=new();
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var url=config["Bridge:Endpoint"]??"http://127.0.0.1:18740/mcp";
        while(!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var direct=services.GetService<ITelemetrySource>();
                var transport=direct is null?new HttpClientTransport(new HttpClientTransportOptions{Endpoint=new Uri(url),TransportMode=HttpTransportMode.StreamableHttp,ConnectionTimeout=TimeSpan.FromSeconds(5)}):null;
                await using var client=transport is null?null:await McpClient.CreateAsync(transport,cancellationToken:stoppingToken);
                if(client is not null)
                {
                    var tools=await client.ListToolsAsync(cancellationToken:stoppingToken);
                    if(!tools.Any(t=>t.Name=="telemetry_snapshot"))throw new InvalidOperationException("Required telemetry_snapshot MCP tool not found.");
                }
                state.Transport=direct is null?"mcp":"in_process";
                state.Connected=true;state.LastError=null;
                var due=GatewayState.Intervals.Keys.ToDictionary(k=>k,_=>DateTimeOffset.MinValue);
                while(!stoppingToken.IsCancellationRequested)
                {
                    var topic=due.MinBy(x=>x.Value).Key;
                    if(due[topic]>DateTimeOffset.UtcNow){await Task.Delay(100,stoppingToken);continue;}
                    due[topic]=DateTimeOffset.UtcNow.AddSeconds(GatewayState.Intervals[topic]);
                    TelemetryRead read;
                    Interlocked.Increment(ref state.Reads);
                    if(direct is not null)read=direct.Read(topic);
                    else
                    {
                        Interlocked.Increment(ref state.Calls);
                        var response=await serial.RunAsync(ct=>client!.CallToolAsync("telemetry_snapshot",new Dictionary<string,object?>{{"topic",topic}},cancellationToken:ct).AsTask(),TimeSpan.FromSeconds(3),stoppingToken);
                        if(response.IsError==true){state.LastError="topic_not_ready:"+topic;continue;}
                        var text=response.Content.OfType<TextContentBlock>().FirstOrDefault()?.Text;
                        var value=text is null?null:JsonNode.Parse(text) as JsonObject;
                        if(value is null)throw new InvalidDataException("Malformed bridge response.");
                        Snapshot? received=null;
                        if(value["ready"]?.GetValue<bool>()!=false)
                        {
                            if(value["payload"] is not JsonObject payload)throw new InvalidDataException("Malformed bridge response.");
                            received=new Snapshot(topic,value["session_id"]!.GetValue<string>(),value["tick"]!.GetValue<long>(),DateTimeOffset.Parse(value["written_at"]!.GetValue<string>()),payload)
                                {ClientPayload=value["client_payload"] as JsonObject??ClientTelemetry.Project(topic,payload)};
                        }
                        read=new(received,value["source_kind"]?.GetValue<string>()??"unknown",value["source_process_id"]?.GetValue<int>());
                    }
                    var sourcePid=read.SourceProcessId;
                    if(state.SourceProcessId!=sourcePid){cache.Reset();state.UpdateForecasts(cache);Interlocked.Increment(ref state.Revision);}
                    state.SourceKind=read.SourceKind;
                    state.SourceProcessId=sourcePid;
                    if(read.Snapshot is not {} snapshot){if(topic!="combat")state.LastError="topic_not_ready:"+topic;continue;}
                    var previous=cache.Get(topic);
                    if(previous?.SessionId==snapshot.SessionId&&previous.Tick>=snapshot.Tick)continue;
                    var changedSession=cache.SessionId!=snapshot.SessionId;
                    if(cache.Put(snapshot)){history.Save(snapshot);if(changedSession||topic is "production" or "machines")state.UpdateForecasts(cache);Interlocked.Increment(ref state.Revision);}
                    state.LastError=null;
                }
            }
            catch(OperationCanceledException)when(stoppingToken.IsCancellationRequested){break;}
            catch(Exception ex)
            {
                state.Connected=false;state.LastError=ex.GetType().Name+": "+ex.Message;log.LogWarning("MCP connection failed: {Error}",state.LastError);
                await Task.Delay(2000,stoppingToken);
            }
            finally {state.Connected=false;}
        }
    }
}
