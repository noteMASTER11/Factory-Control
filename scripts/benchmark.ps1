param([int]$Ticks=6000,[int]$Runs=3,[switch]$ServerAlreadyStopped)
. "$PSScriptRoot\env.ps1"
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskValidation=Join-Path $taskRoot 'Validation'
$taskRuntime=Join-Path $taskValidation 'runtime'
$taskOldId=[int](Get-Content -LiteralPath (Join-Path $taskRuntime 'process.pid'))
$taskOld=Get-CimInstance Win32_Process -Filter "ProcessId=$taskOldId"
if(!$ServerAlreadyStopped -and $taskOld -and $taskOld.CommandLine.Contains($taskRuntime)){Stop-Process -Id $taskOldId -Force}
foreach($taskMode in @('baseline','collector')){
 $taskDir=Join-Path $taskValidation ('benchmark-'+$taskMode)
 New-Item -ItemType Directory -Force -Path $taskDir,(Join-Path $taskDir 'mods') | Out-Null
 $taskMods=@(@{name='base';enabled=$true},@{name='space-age';enabled=$true},@{name='quality';enabled=$true},@{name='elevated-rails';enabled=$true})
 if($taskMode -eq 'collector'){
   $taskMods+=@{name='factory-telemetry';enabled=$true}
   if(!(Test-Path -LiteralPath (Join-Path $taskDir 'mods\factory-telemetry'))){New-Item -ItemType Junction -Path (Join-Path $taskDir 'mods\factory-telemetry') -Target (Join-Path $taskRoot 'mod\factory-telemetry') | Out-Null}
 }
 @{mods=$taskMods} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskDir 'mods\mod-list.json') -Encoding utf8NoBOM
 "[path]`nread-data=D:/SteamLibrary/steamapps/common/Factorio/data`nwrite-data=$($taskDir.Replace('\','/'))`n[other]`ncheck-updates=false" | Set-Content -LiteralPath (Join-Path $taskDir 'config.ini') -Encoding utf8NoBOM
 $taskArgs=@('--config',(Join-Path $taskDir 'config.ini'),'--mod-directory',(Join-Path $taskDir 'mods'),'--benchmark',(Join-Path $taskRuntime 'saves\validation-copy.zip'),'--benchmark-ticks',"$Ticks",'--benchmark-runs',"$Runs")
 $taskProcess=Start-Process -FilePath 'D:\SteamLibrary\steamapps\common\Factorio\bin\x64\Factorio.exe' -ArgumentList $taskArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskDir 'stdout.log') -RedirectStandardError (Join-Path $taskDir 'stderr.log') -PassThru
 $taskProcess.WaitForExit()
 if($taskProcess.ExitCode -ne 0){throw "Benchmark $taskMode failed; inspect $taskDir"}
 # Benchmark mode does not produce helpers.write_file output on this installation.
 # File export is validated separately in a running server and single-player process.
 Get-Content -LiteralPath (Join-Path $taskDir 'stdout.log') | Select-String 'Performed|avg:|min:|max:|checksum'
}
