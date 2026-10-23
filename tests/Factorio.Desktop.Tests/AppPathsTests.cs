using Factorio.Desktop;
using Xunit;

public sealed class AppPathsTests
{
    [Fact] public void StandardUserStorageHasNoMachineSpecificDrive()
    {
        Assert.Equal(Path.Combine(@"C:\Users\Example\AppData\Local","FactoryControl"),AppPaths.ResolveHome(null,@"C:\Users\Example\AppData\Local"));
        Assert.Equal(@"E:\Portable\FactoryControl",AppPaths.ResolveHome(@"E:\Portable\FactoryControl",@"C:\Users\Example\AppData\Local"));
    }
    [Fact] public void DefaultConnectionUsesCurrentFactorioUserProfile()
    {
        var options=BackendOptions.Load(["--data-root="+Path.Combine(Path.GetTempPath(),"FactoryControl-empty-profile-"+Guid.NewGuid().ToString("N"))]);
        Assert.Equal(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"Factorio"),options.GameProfile);
        Assert.Equal(Path.Combine(options.GameProfile!,"script-output","factory-telemetry"),options.TelemetryDirectory);
        Assert.Equal(string.Empty,options.GameExecutable);
        Assert.True(options.WatchGame);
    }
}
