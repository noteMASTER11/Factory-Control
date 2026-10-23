using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace Factorio.Desktop;

public sealed class DesktopInstance:IDisposable
{
    private readonly Mutex mutex;
    private readonly EventWaitHandle activation;
    private RegisteredWaitHandle? listener;
    private bool owns;
    public DesktopInstance(string name)
    {
        mutex=new Mutex(false,name);activation=new EventWaitHandle(false,EventResetMode.AutoReset,name+".Activate");
    }
    public bool TryAcquire()
    {
        if(owns)return true;
        try{return owns=mutex.WaitOne(0);}catch(AbandonedMutexException){return owns=true;}
    }
    public void Listen(Action handler)=>listener=ThreadPool.RegisterWaitForSingleObject(activation,(_,_)=>handler(),null,Timeout.Infinite,false);
    public void RequestActivation()
    {
        foreach(var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(Environment.ProcessPath)))
            using(process)if(process.Id!=Environment.ProcessId)AllowSetForegroundWindow(process.Id);
        activation.Set();
    }
    public void Dispose(){listener?.Unregister(null);activation.Dispose();if(owns){mutex.ReleaseMutex();owns=false;}mutex.Dispose();}
    [DllImport("user32.dll")] private static extern bool AllowSetForegroundWindow(int processId);
}
