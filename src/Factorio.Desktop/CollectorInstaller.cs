using System.IO;
using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Factorio.Desktop;

public sealed record CollectorSetup([property:JsonPropertyName("state")]string State,
    [property:JsonPropertyName("branch")]string? Branch=null,[property:JsonPropertyName("version")]string? Version=null,
    [property:JsonPropertyName("executable")]string? Executable=null,[property:JsonPropertyName("error")]string? Error=null);

public sealed class CollectorInstaller(string dataRoot,string gameProfile,Func<bool> gameRunning)
{
    public CollectorSetup Ensure(string executable)
    {
        string? branch=null,version=null;
        try
        {
            var gameVersion=CollectorPackage.GameVersion(executable);branch=$"{gameVersion.Major}.{gameVersion.Minor}";
            var package=CollectorPackage.Create(branch);version=package.Version;
            var mods=Path.Combine(Path.GetFullPath(gameProfile),"mods");
            var path=Path.Combine(mods,$"factory-telemetry_{version}.zip");
            var listPath=Path.Combine(mods,"mod-list.json");
            JsonObject? list;
            try{list=File.Exists(listPath)?JsonNode.Parse(File.ReadAllText(listPath)) as JsonObject:new JsonObject{["mods"]=new JsonArray(new JsonObject{["name"]="base",["enabled"]=true})};}
            catch(JsonException){return new("error",branch,version,executable,"invalid_mod_list");}
            if(list?["mods"] is not JsonArray entries)return new("error",branch,version,executable,"invalid_mod_list");
            var installed=FindCollectors(mods);
            var newer=installed.FirstOrDefault(m=>m.Branch==branch&&Version.TryParse(m.Version,out var v)&&v>Version.Parse(version));
            var current=newer is not null||(File.Exists(path)&&new FileInfo(path).Length==package.Bytes.Length&&File.ReadAllBytes(path).AsSpan().SequenceEqual(package.Bytes));
            var duplicate=newer is null&&installed.Any(m=>!string.Equals(m.Path,path,StringComparison.OrdinalIgnoreCase)&&m.Version==version);
            var enabled=entries.OfType<JsonObject>().FirstOrDefault(m=>m["name"]?.GetValue<string>()=="factory-telemetry");
            if(current&&!duplicate&&enabled?["enabled"]?.GetValue<bool>()==true){ClearPending();return new("ready",branch,newer?.Version??version,executable);}
            if(gameRunning()){SavePending(executable);return new("waiting_for_exit",branch,version,executable);}
            Directory.CreateDirectory(mods);
            if(!current||duplicate)
            {
                // Move only positively identified direct children. A junction is moved as a link; its target is never traversed.
                foreach(var old in installed)
                {
                    if(gameRunning()){SavePending(executable);return new("waiting_for_exit",branch,version,executable);}
                    var absolute=Path.GetFullPath(old.Path);
                    if(!string.Equals(Path.GetDirectoryName(absolute),mods,StringComparison.OrdinalIgnoreCase))throw new IOException("Unexpected collector path");
                    var backup=Path.Combine(gameProfile,"FactoryControl","collector-backups",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss")+"-"+Guid.NewGuid().ToString("N"));
                    Directory.CreateDirectory(backup);var destination=Path.Combine(backup,Path.GetFileName(absolute));
                    if(Directory.Exists(absolute))Directory.Move(absolute,destination);else File.Move(absolute,destination);
                }
                if(gameRunning()){SavePending(executable);return new("waiting_for_exit",branch,version,executable);}
                AtomicWrite(path,package.Bytes);
            }
            if(gameRunning()){SavePending(executable);return new("waiting_for_exit",branch,version,executable);}
            if(enabled?["enabled"]?.GetValue<bool>()!=true)
            {
                if(File.Exists(listPath))
                {
                    var backup=Path.Combine(gameProfile,"FactoryControl","collector-backups");Directory.CreateDirectory(backup);
                    File.Copy(listPath,Path.Combine(backup,"mod-list-"+Guid.NewGuid().ToString("N")+".json"));
                }
                if(enabled is null)entries.Add(new JsonObject{["name"]="factory-telemetry",["enabled"]=true});else enabled["enabled"]=true;
                AtomicWrite(listPath,JsonSerializer.SerializeToUtf8Bytes(list,new JsonSerializerOptions{WriteIndented=true}));
            }
            ClearPending();return new("ready",branch,newer?.Version??version,executable);
        }
        catch(NotSupportedException){return new("error",branch,version,executable,"unsupported_version");}
        catch(UnauthorizedAccessException){return new("error",branch,version,executable,"access_denied");}
        catch(Exception ex)when(ex is ArgumentException or FileNotFoundException or DirectoryNotFoundException or JsonException or InvalidOperationException)
        {return new("error",branch,version,executable,"invalid_game");}
        catch(IOException){return new("error",branch,version,executable,"io");}
    }

    private sealed record Installed(string Path,string Version,string Branch);
    private static List<Installed> FindCollectors(string mods)
    {
        var found=new List<Installed>();if(!Directory.Exists(mods))return found;
        foreach(var path in Directory.EnumerateFileSystemEntries(mods))
        {
            if(!Path.GetFileName(path).StartsWith("factory-telemetry",StringComparison.OrdinalIgnoreCase))continue;
            try
            {
                JsonNode? info=null;
                if(Directory.Exists(path))info=JsonNode.Parse(File.ReadAllText(Path.Combine(path,"info.json")));
                else if(Path.GetExtension(path).Equals(".zip",StringComparison.OrdinalIgnoreCase))
                {
                    using var zip=ZipFile.OpenRead(path);var entry=zip.Entries.FirstOrDefault(e=>e.FullName.Split('/').Length==2&&e.FullName.EndsWith("/info.json",StringComparison.Ordinal));
                    if(entry is null||entry.Length>65536)continue;using var reader=new StreamReader(entry.Open());info=JsonNode.Parse(reader.ReadToEnd());
                }
                if(info?["name"]?.GetValue<string>()=="factory-telemetry"&&info["version"]?.GetValue<string>() is {} version&&info["factorio_version"]?.GetValue<string>() is {} branch)
                    found.Add(new(path,version,branch));
            }
            catch(Exception ex)when(ex is IOException or JsonException or InvalidOperationException or UnauthorizedAccessException){/* Unidentified files are left intact. */}
        }
        return found;
    }
    private string PendingPath=>Path.Combine(dataRoot,"collector-pending.json");
    private void SavePending(string executable)=>AtomicWrite(PendingPath,JsonSerializer.SerializeToUtf8Bytes(new{executable,profile=gameProfile}));
    private void ClearPending(){if(File.Exists(PendingPath))File.Delete(PendingPath);}
    public static string? PendingExecutable(string dataRoot)
    {
        try{return JsonNode.Parse(File.ReadAllText(Path.Combine(dataRoot,"collector-pending.json")))?["executable"]?.GetValue<string>();}
        catch(Exception ex)when(ex is IOException or JsonException or UnauthorizedAccessException){return null;}
    }
    private static void AtomicWrite(string path,byte[] content)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);var temporary=path+"."+Guid.NewGuid().ToString("N")+".tmp";
        try{File.WriteAllBytes(temporary,content);File.Move(temporary,path,true);}finally{if(File.Exists(temporary))File.Delete(temporary);}
    }
}
