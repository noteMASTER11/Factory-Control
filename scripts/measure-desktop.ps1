param(
 [Parameter(Mandatory)][int]$ProcessId,
 [ValidateRange(10,600)][int]$Seconds=60,
 [Parameter(Mandatory)][string]$OutputPath
)
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
$taskOutput=[IO.Path]::GetFullPath($OutputPath)
if(!$taskOutput.StartsWith('D:\ChatGPT\',[StringComparison]::OrdinalIgnoreCase)){throw 'OutputPath must be under D:\ChatGPT'}
$taskApp=Get-Process -Id $ProcessId
if($taskApp.ProcessName -notin @('FactoryControl','Factorio.Desktop')){throw 'Expected Factory Control process'}
$taskWatch=[Diagnostics.Stopwatch]::StartNew()
$taskLast=@{}
$taskSamples=[Collections.Generic.List[object]]::new()
do {
 $taskNodes=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'msedgewebview2.exe'})
 $taskFamily=@($ProcessId)
 do {
  $taskPrevious=$taskFamily.Count
  $taskFamily+=@($taskNodes | Where-Object {$_.ParentProcessId -in $taskFamily -and $_.ProcessId -notin $taskFamily} | Select-Object -ExpandProperty ProcessId)
 }while($taskFamily.Count -gt $taskPrevious)
 $taskRows=@(foreach($taskId in $taskFamily){
  try {
   $taskProcess=Get-Process -Id $taskId
   [pscustomobject]@{pid=$taskId;cpu=$taskProcess.TotalProcessorTime.TotalSeconds;working=$taskProcess.WorkingSet64;private=$taskProcess.PrivateMemorySize64}
  }catch [Microsoft.PowerShell.Commands.ProcessCommandException]{ }
 })
 if(!($taskRows | Where-Object pid -eq $ProcessId)){throw 'Measured application exited'}
 $taskPrivateWorking=@(Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object {$_.IDProcess -in $taskFamily})
 $taskCpu=0.0
 foreach($taskRow in $taskRows){
  if($taskLast.ContainsKey($taskRow.pid)){$taskCpu+=$taskRow.cpu-$taskLast[$taskRow.pid]}
  $taskLast[$taskRow.pid]=$taskRow.cpu
 }
 $taskSamples.Add([pscustomobject]@{
  seconds=$taskWatch.Elapsed.TotalSeconds;cpu_seconds=$taskCpu
  main_working_mb=($taskRows | Where-Object pid -eq $ProcessId).working/1MB
  family_working_mb=($taskRows | Measure-Object working -Sum).Sum/1MB
  family_private_mb=($taskRows | Measure-Object private -Sum).Sum/1MB
  main_private_working_mb=($taskPrivateWorking | Where-Object IDProcess -eq $ProcessId).WorkingSetPrivate/1MB
  family_private_working_mb=($taskPrivateWorking | Measure-Object WorkingSetPrivate -Sum).Sum/1MB
 })
 if($taskWatch.Elapsed.TotalSeconds -lt $Seconds){Start-Sleep -Seconds 3}
}while($taskWatch.Elapsed.TotalSeconds -lt $Seconds)
$taskResult=[pscustomobject]@{
 process_id=$ProcessId;logical_processors=[Environment]::ProcessorCount;duration_seconds=$taskWatch.Elapsed.TotalSeconds
 cpu_percent=100*($taskSamples | Measure-Object cpu_seconds -Sum).Sum/$taskWatch.Elapsed.TotalSeconds/[Environment]::ProcessorCount
 main_working_avg_mb=($taskSamples | Measure-Object main_working_mb -Average).Average
 family_working_avg_mb=($taskSamples | Measure-Object family_working_mb -Average).Average
 family_private_avg_mb=($taskSamples | Measure-Object family_private_mb -Average).Average
 main_private_working_avg_mb=($taskSamples | Measure-Object main_private_working_mb -Average).Average
 family_private_working_avg_mb=($taskSamples | Measure-Object family_private_working_mb -Average).Average
 samples=$taskSamples.ToArray()
}
New-Item -ItemType Directory -Force -Path (Split-Path $taskOutput -Parent) | Out-Null
$taskResult | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $taskOutput -Encoding utf8NoBOM
$taskResult | Select-Object -ExcludeProperty samples | ConvertTo-Json
