param([switch]$EnableRcon)
. "$PSScriptRoot\env.ps1"
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskRuntime = Join-Path $taskRoot 'Validation\runtime'
$taskPidFile = Join-Path $taskRuntime 'process.pid'
if (Test-Path -LiteralPath $taskPidFile) {
  $taskOldId=[int](Get-Content -LiteralPath $taskPidFile)
  $taskOld=Get-CimInstance Win32_Process -Filter "ProcessId=$taskOldId"
  if ($taskOld -and $taskOld.CommandLine.Contains($taskRuntime) -and $taskOld.Name -ieq 'Factorio.exe') { Stop-Process -Id $taskOldId -Force }
}
$taskArgs=@('--config',($taskRuntime+'\config.ini'),'--mod-directory',($taskRuntime+'\mods'),'--start-server',($taskRuntime+'\saves\validation-copy.zip'),'--server-settings',($taskRuntime+'\server-settings.json'),'--bind','127.0.0.1','--port','34199')
if($EnableRcon){$taskArgs+=@('--rcon-port','27099','--rcon-bind','127.0.0.1:27099','--rcon-password','local-validation-only')}
$taskServer=Start-Process -FilePath 'D:\SteamLibrary\steamapps\common\Factorio\bin\x64\Factorio.exe' -ArgumentList $taskArgs -WindowStyle Hidden -RedirectStandardOutput ($taskRuntime+'\stdout.log') -RedirectStandardError ($taskRuntime+'\stderr.log') -PassThru
$taskServer.Id | Set-Content -LiteralPath $taskPidFile
Write-Output "validation_copy PID=$($taskServer.Id)"
