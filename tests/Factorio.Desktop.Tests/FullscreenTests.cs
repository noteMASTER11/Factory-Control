using System.Runtime.InteropServices;
using Factorio.Desktop;
using Xunit;

namespace Factorio.Desktop.Tests;

public sealed class FullscreenTests
{
    [Fact]
    public void FullscreenUsesTheWindowsMonitorBoundsAndRestoresTheOriginalFrame()
    {
        var hwnd = CreateWindowEx(0, "STATIC", "Factorio Monitor native test", 0x00CF0000,
            70, 80, 700, 500, 0, 0, 0, 0);
        Assert.NotEqual(0, hwnd);
        try
        {
            var before = Rectangle(hwnd);
            var style = GetWindowLongPtr(hwnd, -16);
            var monitor = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
            Assert.True(GetMonitorInfo(MonitorFromWindow(hwnd, 2), ref monitor));
            var fullscreen = new FullscreenWindow(hwnd);
            fullscreen.Enter();
            Assert.True(fullscreen.IsFullscreen);
            Assert.Equal(monitor.Monitor, Rectangle(hwnd));
            Assert.Equal(0L, GetWindowLongPtr(hwnd, -16).ToInt64() & 0x00CF0000L);
            fullscreen.Enter(); // Repeated requests must not overwrite the saved frame.
            fullscreen.Exit();
            Assert.False(fullscreen.IsFullscreen);
            Assert.Equal(before, Rectangle(hwnd));
            Assert.Equal(style, GetWindowLongPtr(hwnd, -16));
            fullscreen.Exit();
            Assert.Equal(before, Rectangle(hwnd));
        }
        finally { DestroyWindow(hwnd); }
    }

    private static Rect Rectangle(nint hwnd) { Assert.True(GetWindowRect(hwnd, out var value)); return value; }
    [StructLayout(LayoutKind.Sequential)] private record struct Rect(int Left, int Top, int Right, int Bottom);
    [StructLayout(LayoutKind.Sequential)] private struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern nint CreateWindowEx(uint ex, string cls, string name, uint style, int x, int y, int width, int height, nint parent, nint menu, nint instance, nint parameter);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint hwnd, out Rect rect);
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] private static extern nint GetWindowLongPtr(nint hwnd, int index);
    [DllImport("user32.dll")] private static extern nint MonitorFromWindow(nint hwnd, uint flags);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern bool GetMonitorInfo(nint monitor, ref MonitorInfo info);
}
