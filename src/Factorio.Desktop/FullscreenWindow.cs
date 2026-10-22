using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Factorio.Desktop;

public sealed class FullscreenWindow(nint handle)
{
    private Placement savedPlacement;
    private nint savedStyle;
    public bool IsFullscreen { get; private set; }

    public void Enter()
    {
        if (IsFullscreen) return;
        // MonitorFromWindow uses the largest overlap, including monitors at negative coordinates.
        var monitor = CurrentMonitor();
        savedPlacement = new Placement { Length = Marshal.SizeOf<Placement>() };
        Check(GetWindowPlacement(handle, ref savedPlacement));
        savedStyle = GetWindowLongPtr(handle, -16);
        if ((savedStyle.ToInt64() & 0x10000000L) == 0) savedPlacement.ShowCommand = 0;
        try
        {
            if (IsZoomed(handle))
            {
                var normal = savedPlacement;
                normal.ShowCommand = 4; // Restore without activating another window.
                Check(SetWindowPlacement(handle, ref normal));
            }
            SetStyle(new nint(savedStyle.ToInt64() & ~0x00CF0000L));
            MoveTo(monitor);
            IsFullscreen = true;
        }
        catch { Restore(); throw; }
    }

    public void Exit()
    {
        if (!IsFullscreen) return;
        Restore();
        IsFullscreen = false;
    }

    public void RefreshMonitorBounds()
    {
        if (IsFullscreen) MoveTo(CurrentMonitor());
    }

    public object Describe()
    {
        var info = MonitorDetails();
        return new { fullscreen = IsFullscreen, width = info.Monitor.Right - info.Monitor.Left,
            height = info.Monitor.Bottom - info.Monitor.Top, left = info.Monitor.Left, top = info.Monitor.Top };
    }

    private MonitorInfo MonitorDetails()
    {
        var info = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
        Check(GetMonitorInfo(MonitorFromWindow(handle, 2), ref info));
        return info;
    }
    private Rect CurrentMonitor() => MonitorDetails().Monitor;
    private void MoveTo(Rect rect) => Check(SetWindowPos(handle, 0, rect.Left, rect.Top,
        rect.Right - rect.Left, rect.Bottom - rect.Top, 0x0004 | 0x0010 | 0x0020));
    private void Restore()
    {
        SetStyle(savedStyle);
        Check(SetWindowPlacement(handle, ref savedPlacement));
        Check(SetWindowPos(handle, 0, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020));
    }
    private void SetStyle(nint style)
    {
        Marshal.SetLastPInvokeError(0);
        var previous = SetWindowLongPtr(handle, -16, style);
        if (previous == 0 && Marshal.GetLastPInvokeError() != 0) throw new Win32Exception(Marshal.GetLastPInvokeError());
    }
    private static void Check(bool success) { if (!success) throw new Win32Exception(Marshal.GetLastPInvokeError()); }

    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct Placement { public int Length, Flags, ShowCommand; public Point Min, Max; public Rect Normal; }
    [StructLayout(LayoutKind.Sequential)] private struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
    [DllImport("user32.dll", SetLastError=true)] private static extern bool GetWindowPlacement(nint hwnd, ref Placement placement);
    [DllImport("user32.dll", SetLastError=true)] private static extern bool SetWindowPlacement(nint hwnd, ref Placement placement);
    [DllImport("user32.dll")] private static extern bool IsZoomed(nint hwnd);
    [DllImport("user32.dll")] private static extern nint MonitorFromWindow(nint hwnd, uint flags);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern bool GetMonitorInfo(nint monitor, ref MonitorInfo info);
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW", SetLastError=true)] private static extern nint GetWindowLongPtr(nint hwnd, int index);
    [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] private static extern nint SetWindowLongPtr(nint hwnd, int index, nint value);
    [DllImport("user32.dll", SetLastError=true)] private static extern bool SetWindowPos(nint hwnd, nint after, int x, int y, int width, int height, uint flags);
}
