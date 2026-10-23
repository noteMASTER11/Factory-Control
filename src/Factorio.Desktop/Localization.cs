using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Runtime.InteropServices;

namespace Factorio.Desktop;

public static class Localization
{
    private static readonly JsonElement Catalog = LoadCatalog();
    public static string? SystemLocale { get; } = ReadSystemLocale();
    private static Dictionary<string, string> strings = Load(Resolve(SystemLocale))!;
    [DllImport("kernel32.dll")] private static extern ushort GetUserDefaultUILanguage();
    private static string? ReadSystemLocale()
    {
        try { return CultureInfo.GetCultureInfo(GetUserDefaultUILanguage()).Name; }
        catch (CultureNotFoundException) { return null; }
    }
    public static string Resolve(string? locale)
    {
        var entries=Catalog.GetProperty("locales").EnumerateArray().Select(e=>e.GetProperty("id").GetString()!).ToArray();
        var code=locale?.Replace('_','-');
        return entries.FirstOrDefault(id=>string.Equals(id,code,StringComparison.OrdinalIgnoreCase))
            ?? entries.FirstOrDefault(id=>!string.IsNullOrEmpty(code)&&string.Equals(id.Split('-')[0],code.Split('-')[0],StringComparison.OrdinalIgnoreCase))
            ?? Catalog.GetProperty("defaultLocale").GetString()!;
    }
    private static JsonElement LoadCatalog()
    {
        using var catalog = Assembly.GetExecutingAssembly().GetManifestResourceStream("Factorio.Desktop.Locales.index.json")!;
        using var index = JsonDocument.Parse(catalog);
        return index.RootElement.Clone();
    }
    private static Dictionary<string, string>? Load(string locale)
    {
        foreach (var entry in Catalog.GetProperty("locales").EnumerateArray())
        {
            if (entry.GetProperty("id").GetString() != locale) continue;
            var file = entry.GetProperty("file").GetString();
            using var source = Assembly.GetExecutingAssembly().GetManifestResourceStream($"Factorio.Desktop.Locales.{file}")!;
            CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo(locale);
            return JsonSerializer.Deserialize<Dictionary<string, string>>(source)!;
        }
        return null;
    }
    public static bool Select(string locale)
    {
        if (Load(locale) is not { } selected) return false;
        strings = selected;
        return true;
    }
    public static string Text(string key) => strings[key];
    public static string Text(string key, string name, string value) => Text(key).Replace("{" + name + "}", value, StringComparison.Ordinal);
}
