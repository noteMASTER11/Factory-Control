using System.Globalization;
using System.Reflection;
using System.Text.Json;

namespace Factorio.Desktop;

public static class Localization
{
    private static readonly JsonElement Catalog = LoadCatalog();
    private static Dictionary<string, string> strings = Load(Catalog.GetProperty("defaultLocale").GetString()!)!;
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
