using System.Text.Json.Nodes;
using System.Text.Json;

namespace Factorio.Core;

public sealed record Snapshot(string Topic, string SessionId, long Tick, DateTimeOffset WrittenAt, JsonObject Payload)
{
    public JsonObject? ClientPayload {get;init;}
}
public sealed record SnapshotDelta(string? SessionId,long Revision,bool Reset,Dictionary<string,Snapshot> Topics);
public sealed class SourceGeneration
{
    private readonly Dictionary<string,Snapshot> previous=[];
    private string? rawSession;
    private string generation=Guid.NewGuid().ToString("N");
    private DateTimeOffset barrier=DateTimeOffset.MinValue;
    public Snapshot? Accept(Snapshot snapshot)
    {
        if(snapshot.WrittenAt<barrier)return null;
        var rewound=previous.TryGetValue(snapshot.Topic,out var old) && snapshot.Tick<old.Tick && snapshot.WrittenAt>old.WrittenAt;
        if(rawSession is not null && (rawSession!=snapshot.SessionId||rewound))
        {
            previous.Clear();generation=Guid.NewGuid().ToString("N");barrier=snapshot.WrittenAt;
        }
        rawSession=snapshot.SessionId;
        previous[snapshot.Topic]=snapshot;
        return snapshot with {SessionId=rawSession+":"+generation};
    }
}
public sealed class SnapshotCache
{
    private readonly object sync = new();
    private readonly Dictionary<string,Snapshot> snapshots = [];
    private readonly HashSet<string> retired = [];
    private string? session;
    private long revision;
    private readonly Dictionary<string,long> versions=[];
    public bool Put(Snapshot snapshot)
    {
        lock(sync)
        {
            if(retired.Contains(snapshot.SessionId)) return false;
            if(session != snapshot.SessionId)
            {
                if(session is not null) retired.Add(session);
                snapshots.Clear();versions.Clear(); session=snapshot.SessionId;
            }
            if(snapshots.TryGetValue(snapshot.Topic,out var previous) && previous.Tick >= snapshot.Tick) return false;
            snapshots[snapshot.Topic]=snapshot;
            versions[snapshot.Topic]=++revision;
            return true;
        }
    }
    public Snapshot? Get(string topic) {lock(sync) return snapshots.GetValueOrDefault(topic);}
    public void Reset()
    {
        lock(sync){if(session is not null)retired.Add(session);snapshots.Clear();versions.Clear();session=null;revision++;}
    }
    public SnapshotDelta Changes(long? since,string? knownSession)
    {
        lock(sync)
        {
            var reset=knownSession!=session||since is null||since<0||since>revision;
            return new(session,revision,reset,snapshots.Where(p=>reset||versions[p.Key]>since).ToDictionary());
        }
    }
    public string? SessionId {get {lock(sync) return session;}}
}
public sealed class SnapshotFiles
{
    private readonly RequesterPages requesterPages=new();
    private static readonly HashSet<string> ArrayFields=["rows","groups","stocks","networks","accumulators","nameplate_generators","consumers","producers","trains","requesters","forces","queue","ingredients","products","examples","chunks","items","filters","sections","delivering","episodes","losses","placement"];
    private static void NormalizeArrays(JsonNode? node)
    {
        if(node is JsonObject obj)foreach(var pair in obj.ToArray())
        {
            if(ArrayFields.Contains(pair.Key)&&pair.Value is JsonObject {Count:0})obj[pair.Key]=new JsonArray();
            NormalizeArrays(obj[pair.Key]);
        }
        else if(node is JsonArray array)foreach(var item in array)NormalizeArrays(item);
    }
    public async Task<Snapshot?> ReadAsync(string path, string topic, CancellationToken ct = default)
    {
        try
        {
            var before=File.GetLastWriteTimeUtc(path);
            await using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete,8192,true);
            if(stream.Length>32*1024*1024) return null;
            var value=await JsonNode.ParseAsync(stream,cancellationToken:ct) as JsonObject;
            if(before!=File.GetLastWriteTimeUtc(path) || value is null || value["schema_version"]?.GetValue<int>()!=1 || value["topic"]?.GetValue<string>()!=topic) return null;
            var session=value["session_id"]?.GetValue<string>();
            var tick=value["tick"]?.GetValue<long>();
            if(string.IsNullOrWhiteSpace(session)||tick is null||tick<0||value["data"] is null)return null;
            if(topic=="logistics"&&value["data"] is JsonObject data&&data["requesters_ref"] is JsonObject reference)
            {
                var rows=await requesterPages.ReadAsync(Path.GetDirectoryName(Path.GetFullPath(path))!,session,reference,ct);
                data["requesters"]=rows??new JsonArray();
                data["requesters_available"]=rows is not null;
            }
            NormalizeArrays(value["data"]);
            return new(topic,session,tick.Value,new DateTimeOffset(before,TimeSpan.Zero),value);
        }
        catch(Exception ex) when(ex is IOException or JsonException or InvalidOperationException or FormatException) {return null;}
    }
}
public sealed class SerializedPoller
{
    private readonly SemaphoreSlim gate=new(1,1);
    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> operation, TimeSpan timeout, CancellationToken ct = default)
    {
        // The worker owns the gate until it really exits, even if its caller has timed out.
        var linked=CancellationTokenSource.CreateLinkedTokenSource(ct);
        linked.CancelAfter(timeout);
        var task=RunHeldAsync(operation,linked);
        try {return await task.WaitAsync(timeout,ct);}
        catch(OperationCanceledException) when(!ct.IsCancellationRequested) {throw new TimeoutException("Telemetry poll timed out.");}
    }
    private async Task<T> RunHeldAsync<T>(Func<CancellationToken,Task<T>> operation,CancellationTokenSource linked)
    {
        var acquired=false;
        try {await gate.WaitAsync(linked.Token); acquired=true; return await operation(linked.Token);}
        finally {if(acquired)gate.Release(); linked.Dispose();}
    }
}
public sealed record Depletion(double? Coverage, double? ReserveMinutes, double? EmptyMinutes, string Status);
public static class Forecast
{
    public static Depletion Calculate(double production, double consumption, double? stock, double reserve, bool complete = true)
    {
        if(!double.IsFinite(production)||!double.IsFinite(consumption)||!double.IsFinite(reserve)||production<0||consumption<0||reserve<0||stock is <0||stock is {} s&&!double.IsFinite(s))throw new ArgumentOutOfRangeException(nameof(production));
        double? coverage=consumption>0?production/consumption:null;
        var deficit=consumption-production;
        if(deficit<=0)return new(coverage,null,null,production==0&&consumption==0?"idle":deficit==0?"balanced":"surplus");
        if(stock is null||!complete)return new(coverage,null,null,"unknown_stock");
        return new(coverage,Math.Max(0,stock.Value-reserve)/deficit,stock.Value/deficit,"deficit");
    }
}
