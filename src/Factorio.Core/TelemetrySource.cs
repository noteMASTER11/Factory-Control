namespace Factorio.Core;

public sealed record TelemetryRead(Snapshot? Snapshot,string SourceKind,int? SourceProcessId);

// The desktop passes immutable completed snapshots by reference. Standalone hosts use MCP.
public interface ITelemetrySource
{
    TelemetryRead Read(string topic);
}

public static class TelemetryCadence
{
    public static readonly IReadOnlyDictionary<string,double> Seconds=new Dictionary<string,double>
    {
        ["status"]=2,["power"]=1,["production"]=2,["machines"]=5,
        ["logistics"]=5,["research"]=5,["resources"]=15,["combat"]=1
    }.AsReadOnly();
}
