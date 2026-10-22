using Factorio.Core;
using Xunit;

namespace Factorio.Tests;

public sealed class ProcessBindingTests
{
    private static readonly DateTimeOffset Started=DateTimeOffset.Parse("2026-10-22T11:29:23Z");
    [Fact]
    public void ExplicitIdentityAllowsAttachingToAnAlreadyRunningGame()
    {
        var binding=new ProcessBinding(22824,@"D:\SteamLibrary\Factorio.exe",Started);
        Assert.True(binding.Matches(22824,@"d:\steamlibrary\Factorio.exe",Started));
    }
    [Fact]
    public void ReusedPidOrAnotherExecutableCannotInheritTheBinding()
    {
        var binding=new ProcessBinding(22824,@"D:\SteamLibrary\Factorio.exe",Started);
        Assert.False(binding.Matches(22824,@"D:\SteamLibrary\Factorio.exe",Started.AddMinutes(5)));
        Assert.False(binding.Matches(22824,@"D:\Other\Factorio.exe",Started));
        Assert.False(binding.Matches(1234,@"D:\SteamLibrary\Factorio.exe",Started));
    }
    [Fact]
    public void InvalidOrOversizedBindingIsIgnored()
    {
        Assert.Null(ProcessBinding.Parse("{partial"));
        Assert.Null(ProcessBinding.Parse(new string('x',4097)));
        Assert.Null(ProcessBinding.Parse("{}"));
    }
}
