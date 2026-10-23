using Factorio.Desktop;
using Xunit;

public sealed class DesktopInstanceTests
{
    [Fact] public void AnExistingUnownedMutexDoesNotPreventStartup()
    {
        var name="Local\\FactoryControl.Test."+Guid.NewGuid().ToString("N");
        using var staleHandle=new Mutex(false,name);
        using var instance=new DesktopInstance(name);Assert.True(instance.TryAcquire());
    }
    [Fact] public void SecondLaunchNotifiesTheExistingOwnerInsteadOfStartingAnotherBackend()
    {
        var name="Local\\FactoryControl.Test."+Guid.NewGuid().ToString("N");
        using var owner=new DesktopInstance(name);Assert.True(owner.TryAcquire());
        using var activated=new ManualResetEventSlim();owner.Listen(()=>activated.Set());
        bool? duplicateAcquired=null;
        var thread=new Thread(()=>{using var duplicate=new DesktopInstance(name);duplicateAcquired=duplicate.TryAcquire();duplicate.RequestActivation();});
        thread.Start();Assert.True(thread.Join(3000));Assert.False(duplicateAcquired);Assert.True(activated.Wait(1500));
    }
}
