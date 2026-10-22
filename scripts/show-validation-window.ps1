. "$PSScriptRoot\env.ps1"
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskDir=Join-Path $taskRoot 'Validation\singleplayer'
$taskId=[int](Get-Content -LiteralPath (Join-Path $taskDir 'process.pid'))
$taskProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$taskId"
if(!$taskProcess -or !$taskProcess.CommandLine.Contains($taskDir)){throw 'The validation process is not running.'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ValidationWindow {
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")]public static extern bool EnumWindows(EnumProc cb,IntPtr p);
 [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern bool SetWindowText(IntPtr h,string text);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetClassName(IntPtr h,StringBuilder text,int n);
}
'@
$taskWindows=[System.Collections.Generic.List[IntPtr]]::new()
[ValidationWindow]::EnumWindows({param($h,$unused);$taskOwner=[uint32]0;[void][ValidationWindow]::GetWindowThreadProcessId($h,[ref]$taskOwner);if($taskOwner -eq $taskId){$taskClass=[Text.StringBuilder]::new(256);[void][ValidationWindow]::GetClassName($h,$taskClass,256);Write-Host "Window class: $taskClass";if($taskClass.ToString() -match '^(Factorio|SDL.*)$'){ $taskWindows.Add($h) }};return $true},[IntPtr]::Zero) | Out-Null
foreach($taskWindow in $taskWindows){
 [void][ValidationWindow]::SetWindowText($taskWindow,'Factorio Monitor — TELEMETRY VALIDATION COPY')
 [void][ValidationWindow]::ShowWindow($taskWindow,4)
}
