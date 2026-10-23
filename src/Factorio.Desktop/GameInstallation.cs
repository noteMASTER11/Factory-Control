using System.IO;

namespace Factorio.Desktop;

public static class GameInstallation
{
    public static string Profile(string executable,string systemProfile)
    {
        var binary=Path.GetDirectoryName(Path.GetFullPath(executable))!;var root=Directory.GetParent(binary)?.Parent?.FullName??binary;
        var paths=ReadIni(Path.Combine(root,"config-path.cfg"));
        string Expand(string value)=>Path.GetFullPath(value.Replace("__PATH__executable__",binary,StringComparison.Ordinal)
            .Replace("__PATH__system-write-data__",systemProfile,StringComparison.Ordinal)
            .Replace("__PATH__system-read-data__",Path.Combine(root,"data"),StringComparison.Ordinal),root);
        var portable=paths.GetValueOrDefault("use-system-read-write-data-directories") is "false" or "0";
        var fallback=portable?root:systemProfile;
        var config=paths.TryGetValue("config-path",out var location)?Expand(location):Path.Combine(fallback,"config");
        var values=ReadIni(Path.Combine(config,"config.ini"),"path");
        return values.TryGetValue("write-data",out var profile)?Expand(profile):Path.GetFullPath(fallback);
    }
    private static Dictionary<string,string> ReadIni(string path,string? section=null)
    {
        var values=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);if(!File.Exists(path))return values;
        string? current=null;foreach(var raw in File.ReadLines(path))
        {
            var line=raw.Trim();if(line.Length==0||line[0] is ';' or '#')continue;
            if(line.StartsWith('[')&&line.EndsWith(']')){current=line[1..^1];continue;}
            if(section is not null&&!string.Equals(current,section,StringComparison.OrdinalIgnoreCase))continue;
            var equal=line.IndexOf('=');if(equal>0)values[line[..equal].Trim()]=line[(equal+1)..].Trim().Trim('"');
        }
        return values;
    }
}
