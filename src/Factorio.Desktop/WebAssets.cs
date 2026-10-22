using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;

namespace Factorio.Desktop;

public static class WebAssets
{
    public static string Prepare()
    {
        using var archive = Assembly.GetExecutingAssembly().GetManifestResourceStream("Factorio.Desktop.Web.zip");
        if (archive is null) return Path.Combine(AppContext.BaseDirectory, "Web");
        var hash = Convert.ToHexString(SHA256.HashData(archive));
        archive.Position = 0;
        var root = Path.Combine(@"D:\ChatGPT\Cache\FactorioMonitor\Web", hash);
        var complete = Path.Combine(root, ".complete");
        if (File.Exists(complete) && File.ReadAllText(complete) == hash) return root;
        Directory.CreateDirectory(root);
        using var zip = new ZipArchive(archive, ZipArchiveMode.Read);
        zip.ExtractToDirectory(root, overwriteFiles: true);
        File.WriteAllText(complete, hash);
        return root;
    }
}
