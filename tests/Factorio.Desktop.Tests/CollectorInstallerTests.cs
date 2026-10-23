using System.IO.Compression;
using System.Text.Json.Nodes;
using Factorio.Desktop;
using Xunit;

public sealed class CollectorInstallerTests
{
    private readonly string root=Path.Combine(Path.GetTempPath(),"collector-install-"+Guid.NewGuid().ToString("N"));
    private string Profile=>Path.Combine(root,"profile");
    private string Data=>Path.Combine(root,"app");
    private string Game(string version)
    {
        var game=Path.Combine(root,version);Directory.CreateDirectory(Path.Combine(game,"bin","x64"));Directory.CreateDirectory(Path.Combine(game,"data","base"));
        var exe=Path.Combine(game,"bin","x64","factorio.exe");File.WriteAllText(exe,"");
        File.WriteAllText(Path.Combine(game,"data","base","info.json"),new JsonObject{["name"]="base",["version"]=version}.ToJsonString());
        return exe;
    }
    [Theory][InlineData("2.0.77","2.0")][InlineData("2.1.23","2.1")]
    public void OneEmbeddedCollectorProducesBothGameBranches(string gameVersion,string branch)
    {
        var result=new CollectorInstaller(Data,Profile,()=>false).Ensure(Game(gameVersion));
        Assert.Equal("ready",result.State);Assert.Equal(branch,result.Branch);
        using var zip=ZipFile.OpenRead(Path.Combine(Profile,"mods",$"factory-telemetry_{result.Version}.zip"));
        using var reader=new StreamReader(zip.GetEntry($"factory-telemetry_{result.Version}/info.json")!.Open());
        var info=JsonNode.Parse(reader.ReadToEnd())!;
        Assert.Equal(branch,info["factorio_version"]!.GetValue<string>());
        Assert.Contains("base >= "+gameVersion,info["dependencies"]!.AsArray().Select(n=>n!.GetValue<string>()));
        Assert.NotNull(zip.GetEntry($"factory-telemetry_{result.Version}/space.lua"));
        Assert.Contains(JsonNode.Parse(File.ReadAllText(Path.Combine(Profile,"mods","mod-list.json")))!["mods"]!.AsArray(),m=>m!["name"]!.GetValue<string>()=="factory-telemetry"&&m["enabled"]!.GetValue<bool>());
    }
    [Fact] public void RunningGameDefersAllGameProfileChangesUntilItExits()
    {
        Directory.CreateDirectory(Path.Combine(Profile,"mods"));var list=Path.Combine(Profile,"mods","mod-list.json");var original="{\"mods\":[{\"name\":\"base\",\"enabled\":true}]}";File.WriteAllText(list,original);
        var running=true;var installer=new CollectorInstaller(Data,Profile,()=>running);var exe=Game("2.1.23");
        Assert.Equal("waiting_for_exit",installer.Ensure(exe).State);
        Assert.Equal(original,File.ReadAllText(list));Assert.Empty(Directory.GetFiles(Path.Combine(Profile,"mods"),"*.zip"));
        running=false;Assert.Equal("ready",installer.Ensure(exe).State);
    }
    [Fact] public void RepeatedSetupPreservesUnrelatedModsAndExistingOutputAndDoesNotRewriteCurrentPackage()
    {
        Directory.CreateDirectory(Path.Combine(Profile,"mods"));File.WriteAllText(Path.Combine(Profile,"mods","mod-list.json"),"{\"mods\":[{\"name\":\"base\",\"enabled\":true},{\"name\":\"other-mod\",\"enabled\":false}]}");
        Directory.CreateDirectory(Path.Combine(Profile,"script-output","other-mod"));var output=Path.Combine(Profile,"script-output","other-mod","keep.txt");File.WriteAllText(output,"keep");
        var running=false;var installer=new CollectorInstaller(Data,Profile,()=>running);var exe=Game("2.1.23");var result=installer.Ensure(exe);var package=Path.Combine(Profile,"mods",$"factory-telemetry_{result.Version}.zip");
        File.SetLastWriteTimeUtc(package,new DateTime(2020,1,1));var list=File.ReadAllText(Path.Combine(Profile,"mods","mod-list.json"));running=true;
        Assert.Equal("ready",installer.Ensure(exe).State);Assert.Equal(new DateTime(2020,1,1),File.GetLastWriteTimeUtc(package));Assert.Equal(list,File.ReadAllText(Path.Combine(Profile,"mods","mod-list.json")));Assert.Equal("keep",File.ReadAllText(output));
        Assert.False(JsonNode.Parse(list)!["mods"]!.AsArray().Single(m=>m!["name"]!.GetValue<string>()=="other-mod")!["enabled"]!.GetValue<bool>());
    }
    [Fact] public void AConflictingLooseCollectorIsBackedUpBeforeInstallingTheArchive()
    {
        var loose=Path.Combine(Profile,"mods","factory-telemetry");Directory.CreateDirectory(loose);
        File.WriteAllText(Path.Combine(loose,"info.json"),"{\"name\":\"factory-telemetry\",\"version\":\"0.1.0\",\"factorio_version\":\"2.0\"}");File.WriteAllText(Path.Combine(loose,"custom.txt"),"preserve");
        var result=new CollectorInstaller(Data,Profile,()=>false).Ensure(Game("2.1.23"));
        Assert.Equal("ready",result.State);Assert.False(Directory.Exists(loose));
        Assert.Contains(Directory.EnumerateFiles(Path.Combine(Profile,"FactoryControl","collector-backups"),"custom.txt",SearchOption.AllDirectories),p=>File.ReadAllText(p)=="preserve");
    }
    [Theory][InlineData("1.1.110")][InlineData("2.0.1")][InlineData("2.1.1")][InlineData("2.2.0")]
    public void UnsupportedGamesLeaveTheProfileUntouched(string version)
    {
        var result=new CollectorInstaller(Data,Profile,()=>false).Ensure(Game(version));Assert.Equal("unsupported_version",result.Error);Assert.False(Directory.Exists(Profile));
    }
    [Fact] public void NewerInstalledCollectorIsNotDowngraded()
    {
        var loose=Path.Combine(Profile,"mods","factory-telemetry");Directory.CreateDirectory(loose);var info="{\"name\":\"factory-telemetry\",\"version\":\"9.0.0\",\"factorio_version\":\"2.1\"}";File.WriteAllText(Path.Combine(loose,"info.json"),info);
        Assert.Equal("ready",new CollectorInstaller(Data,Profile,()=>false).Ensure(Game("2.1.23")).State);Assert.Equal(info,File.ReadAllText(Path.Combine(loose,"info.json")));Assert.Empty(Directory.GetFiles(Path.Combine(Profile,"mods"),"*.zip"));
    }
    [Fact] public void DuplicateLooseCopyIsRemovedFromTheModDirectoryEvenWhenTheZipIsCurrent()
    {
        var installer=new CollectorInstaller(Data,Profile,()=>false);var exe=Game("2.1.23");var result=installer.Ensure(exe);
        var loose=Path.Combine(Profile,"mods","factory-telemetry");Directory.CreateDirectory(loose);
        File.WriteAllText(Path.Combine(loose,"info.json"),new JsonObject{["name"]="factory-telemetry",["version"]=result.Version,["factorio_version"]="2.1"}.ToJsonString());
        Assert.Equal("ready",installer.Ensure(exe).State);Assert.False(Directory.Exists(loose));
    }
    [Theory][InlineData("{\"unexpected\":true}")][InlineData("not valid json")]
    public void InvalidModListIsReportedWithoutReplacingIt(string content)
    {
        Directory.CreateDirectory(Path.Combine(Profile,"mods"));var path=Path.Combine(Profile,"mods","mod-list.json");File.WriteAllText(path,content);
        Assert.Equal("invalid_mod_list",new CollectorInstaller(Data,Profile,()=>false).Ensure(Game("2.1.23")).Error);Assert.Equal(content,File.ReadAllText(path));
    }
}
