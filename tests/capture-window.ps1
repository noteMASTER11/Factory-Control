param([Parameter(Mandatory=$true)][int]$ProcessId,[Parameter(Mandatory=$true)][string]$OutputPath)
. "$PSScriptRoot\..\scripts\env.ps1"
$ErrorActionPreference='Stop'
$taskProcess=Get-Process -Id $ProcessId
if($taskProcess.Path -notin @('D:\ChatGPT\Projects\FactorioMonitor\dist\FactoryControl.exe','D:\ChatGPT\Projects\FactorioMonitor\out\Desktop\Factorio.Desktop.exe')){throw 'Only this project application can be captured'}
$taskOutput=[IO.Path]::GetFullPath($OutputPath)
if(!$taskOutput.StartsWith('D:\ChatGPT\',[StringComparison]::OrdinalIgnoreCase)){throw 'Output must stay under D:\ChatGPT'}
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class CaptureOwnWindow {
 [StructLayout(LayoutKind.Sequential)]public struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
$taskOldContext=[CaptureOwnWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
try{
 $taskRect=New-Object CaptureOwnWindow+Rect
 $null=[CaptureOwnWindow]::GetWindowRect($taskProcess.MainWindowHandle,[ref]$taskRect)
 $taskBitmap=New-Object Drawing.Bitmap(($taskRect.Right-$taskRect.Left),($taskRect.Bottom-$taskRect.Top))
 $taskGraphics=[Drawing.Graphics]::FromImage($taskBitmap)
 $taskDc=$taskGraphics.GetHdc()
 try{if(![CaptureOwnWindow]::PrintWindow($taskProcess.MainWindowHandle,$taskDc,2)){throw 'Window capture failed'}}finally{$taskGraphics.ReleaseHdc($taskDc)}
 $taskBitmap.Save($taskOutput,[Drawing.Imaging.ImageFormat]::Png)
 $taskGraphics.Dispose();$taskBitmap.Dispose()
 Write-Output $taskOutput
}finally{$null=[CaptureOwnWindow]::SetThreadDpiAwarenessContext($taskOldContext)}
