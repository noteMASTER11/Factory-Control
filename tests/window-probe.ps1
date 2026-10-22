param([Parameter(Mandatory=$true)][int]$ProcessId,[ValidateSet('Read','Place','Maximize','Restore','F11','Escape')][string]$Action='Read',[int]$MonitorIndex=0)
. "$PSScriptRoot\..\scripts\env.ps1"
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskProcess=Get-Process -Id $ProcessId -ErrorAction Stop
$taskAllowed=@((Join-Path $taskRoot 'dist\FactoryControl.exe'),(Join-Path $taskRoot 'out\Desktop\Factorio.Desktop.exe'),(Join-Path $taskRoot 'src\Factorio.Desktop\bin\Release\net10.0-windows\Factorio.Desktop.exe'))
if($taskProcess.Path -notin $taskAllowed -or !$taskProcess.MainWindowHandle){throw 'Probe can operate only on this project desktop window'}
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class MonitorProbe {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] public struct Placement {public int Length,Flags,ShowCommand;public Point Min,Max;public Rect Normal;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct Info {public int Size;public Rect Monitor,Work;public uint Flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string Device;}
 public delegate bool Callback(IntPtr monitor,IntPtr dc,ref Rect rect,IntPtr data);
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr window,out Rect rect);
 [DllImport("user32.dll")]public static extern bool GetWindowPlacement(IntPtr window,ref Placement placement);
 [DllImport("user32.dll")]public static extern bool IsZoomed(IntPtr window);
 [DllImport("user32.dll")]public static extern uint GetDpiForWindow(IntPtr window);
 [DllImport("user32.dll")]public static extern IntPtr MonitorFromWindow(IntPtr window,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern bool GetMonitorInfo(IntPtr monitor,ref Info info);
 [DllImport("user32.dll")]public static extern bool EnumDisplayMonitors(IntPtr dc,IntPtr clip,Callback callback,IntPtr data);
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int w,int h,uint flags);
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr window,int command);
 [DllImport("user32.dll")]public static extern bool PostMessage(IntPtr window,uint message,IntPtr key,IntPtr value);
 [DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 public static List<Info> Monitors(){var result=new List<Info>();Callback callback=(IntPtr h,IntPtr d,ref Rect r,IntPtr p)=>{var info=new Info{Size=Marshal.SizeOf<Info>()};GetMonitorInfo(h,ref info);result.Add(info);return true;};EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,callback,IntPtr.Zero);return result;}
}
'@
[MonitorProbe]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$taskHandle=$taskProcess.MainWindowHandle
$taskMonitors=[MonitorProbe]::Monitors()
switch($Action){
 'Place' {
  if($MonitorIndex -lt 0 -or $MonitorIndex -ge $taskMonitors.Count){throw 'Invalid monitor index'}
  $taskMonitor=$taskMonitors[$MonitorIndex]
  [MonitorProbe]::ShowWindow($taskHandle,9) | Out-Null
  [MonitorProbe]::SetWindowPos($taskHandle,[IntPtr]::Zero,($taskMonitor.Work.Left+30),($taskMonitor.Work.Top+30),1000,740,0x0014) | Out-Null
 }
 'Maximize' {[MonitorProbe]::ShowWindow($taskHandle,3) | Out-Null}
 'Restore' {[MonitorProbe]::ShowWindow($taskHandle,9) | Out-Null}
 'F11' {[MonitorProbe]::PostMessage($taskHandle,0x100,[IntPtr]0x7A,[IntPtr]1) | Out-Null;[MonitorProbe]::PostMessage($taskHandle,0x101,[IntPtr]0x7A,[IntPtr]0xC0000001L) | Out-Null}
 'Escape' {[MonitorProbe]::PostMessage($taskHandle,0x100,[IntPtr]0x1B,[IntPtr]1) | Out-Null;[MonitorProbe]::PostMessage($taskHandle,0x101,[IntPtr]0x1B,[IntPtr]0xC0000001L) | Out-Null}
}
$taskRect=New-Object MonitorProbe+Rect
[MonitorProbe]::GetWindowRect($taskHandle,[ref]$taskRect) | Out-Null
$taskInfo=New-Object MonitorProbe+Info
$taskInfo.Size=[Runtime.InteropServices.Marshal]::SizeOf($taskInfo)
[MonitorProbe]::GetMonitorInfo([MonitorProbe]::MonitorFromWindow($taskHandle,2),[ref]$taskInfo) | Out-Null
$taskPlacement=New-Object MonitorProbe+Placement
$taskPlacement.Length=[Runtime.InteropServices.Marshal]::SizeOf($taskPlacement)
[MonitorProbe]::GetWindowPlacement($taskHandle,[ref]$taskPlacement) | Out-Null
@{pid=$ProcessId;rect=$taskRect;monitor=$taskInfo;monitors=@($taskMonitors);maximized=[MonitorProbe]::IsZoomed($taskHandle);normal=$taskPlacement.Normal;dpi=[MonitorProbe]::GetDpiForWindow($taskHandle)} | ConvertTo-Json -Depth 5 -Compress
