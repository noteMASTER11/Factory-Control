$taskRoot=Split-Path $PSScriptRoot -Parent
foreach($taskFolder in @('Validation\runtime','Validation\singleplayer')){
 $taskDir=Join-Path $taskRoot $taskFolder
 $taskPidFile=Join-Path $taskDir 'process.pid'
 if(!(Test-Path -LiteralPath $taskPidFile)){continue}
 $taskId=[int](Get-Content -LiteralPath $taskPidFile)
 $taskProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$taskId"
 if($taskProcess -and $taskProcess.Name -ieq 'Factorio.exe' -and $taskProcess.CommandLine.Contains($taskDir)){Stop-Process -Id $taskId -Force;Write-Output "Stopped validation copy PID=$taskId"}
}
