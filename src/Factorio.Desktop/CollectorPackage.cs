using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Factorio.Desktop;

public sealed record PreparedCollector(string Version,byte[] Bytes);

public static class CollectorPackage
{
    public static Version GameVersion(string executable)
    {
        if(!File.Exists(executable)||!Path.GetFileName(executable).Equals("factorio.exe",StringComparison.OrdinalIgnoreCase))throw new ArgumentException("invalid_game");
        var root=Directory.GetParent(executable)?.Parent?.Parent?.FullName??throw new ArgumentException("invalid_game");
        var info=JsonNode.Parse(File.ReadAllText(Path.Combine(root,"data","base","info.json")));
        if(info?["name"]?.GetValue<string>()!="base"||!Version.TryParse(info["version"]?.GetValue<string>(),out var version))throw new ArgumentException("invalid_game");
        if(version.Major!=2||(version.Minor==0?version<new Version(2,0,77):version.Minor==1?version<new Version(2,1,23):true))throw new NotSupportedException("unsupported_version");
        return version;
    }

    public static PreparedCollector Create(string branch)
    {
        if(branch is not ("2.0" or "2.1"))throw new NotSupportedException("unsupported_version");
        using var source=Assembly.GetExecutingAssembly().GetManifestResourceStream("Factorio.Desktop.Collector.zip")??throw new IOException("Missing embedded collector");
        using var input=new ZipArchive(source,ZipArchiveMode.Read);
        using var reader=new StreamReader(input.GetEntry("info.json")!.Open());
        var info=JsonNode.Parse(reader.ReadToEnd())!;var version=info["version"]!.GetValue<string>();
        info["factorio_version"]=branch;var minimum=branch=="2.1"?"2.1.23":"2.0.77";
        info["dependencies"]=new JsonArray($"base >= {minimum}",$"? space-age >= {minimum}",$"? quality >= {minimum}");
        using var bytes=new MemoryStream();
        using(var output=new ZipArchive(bytes,ZipArchiveMode.Create,true))
            foreach(var file in input.Entries.OrderBy(e=>e.FullName,StringComparer.Ordinal))
            {
                if(file.FullName.EndsWith('/'))continue;
                var entry=output.CreateEntry($"factory-telemetry_{version}/"+file.FullName,CompressionLevel.Optimal);
                entry.LastWriteTime=new DateTimeOffset(2000,1,1,0,0,0,TimeSpan.Zero);
                using var target=entry.Open();
                if(file.FullName=="info.json"){using var writer=new StreamWriter(target,new UTF8Encoding(false));writer.Write(info.ToJsonString(new JsonSerializerOptions{WriteIndented=true}));}
                else{using var content=file.Open();content.CopyTo(target);}
            }
        return new(version,bytes.ToArray());
    }
}
