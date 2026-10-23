using Factorio.Desktop;
using Xunit;

public sealed class GameInstallationTests
{
    [Fact] public void PortableAndCustomWriteDataAreResolvedFromGameConfiguration()
    {
        var root=Path.Combine(Path.GetTempPath(),"game-profile-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(Path.Combine(root,"bin","x64"));
        var exe=Path.Combine(root,"bin","x64","factorio.exe");File.WriteAllText(exe,"");
        File.WriteAllText(Path.Combine(root,"config-path.cfg"),"config-path=__PATH__executable__/../../config\nuse-system-read-write-data-directories=false\n");
        Assert.Equal(root,GameInstallation.Profile(exe,@"E:\UserProfile"));
        Directory.CreateDirectory(Path.Combine(root,"config"));File.WriteAllText(Path.Combine(root,"config","config.ini"),"[path]\nwrite-data=__PATH__executable__/../../custom-profile\n");
        Assert.Equal(Path.Combine(root,"custom-profile"),GameInstallation.Profile(exe,@"E:\UserProfile"));
    }
    [Fact] public void StandardInstallationUsesTheWindowsGameProfile()
    {
        var root=Path.Combine(Path.GetTempPath(),"game-standard-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(Path.Combine(root,"bin","x64"));
        File.WriteAllText(Path.Combine(root,"config-path.cfg"),"config-path=__PATH__system-write-data__/config\nuse-system-read-write-data-directories=true\n");
        Assert.Equal(@"E:\UserProfile",GameInstallation.Profile(Path.Combine(root,"bin","x64","factorio.exe"),@"E:\UserProfile"));
    }
}
