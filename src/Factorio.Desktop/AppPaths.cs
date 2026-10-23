using System.IO;

namespace Factorio.Desktop;

public static class AppPaths
{
    public static string ResolveHome(string? home,string localApplicationData)
        => Path.GetFullPath(string.IsNullOrWhiteSpace(home)?Path.Combine(localApplicationData,"FactoryControl"):home);
    public static string Home => ResolveHome(Environment.GetEnvironmentVariable("FACTORY_CONTROL_HOME"),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
    public static string CacheRoot => Path.GetFullPath(Environment.GetEnvironmentVariable("FACTORY_CONTROL_CACHE") is {Length:>0} value?value:Path.Combine(Home,"Cache"));
    public static string DataRoot => File.Exists(Path.Combine(AppContext.BaseDirectory,"Data","LiveGame","profile.json"))?Path.Combine(AppContext.BaseDirectory,"Data"):Path.Combine(Home,"Data");
}
