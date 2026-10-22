. "$PSScriptRoot\env.ps1"
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskDir=Join-Path $taskRoot 'Validation\singleplayer'
New-Item -ItemType Directory -Force -Path $taskDir | Out-Null
'427520' | Set-Content -LiteralPath (Join-Path $taskDir 'steam_appid.txt') -Encoding ascii
@"
[path]
read-data=D:/SteamLibrary/steamapps/common/Factorio/data
write-data=$($taskDir.Replace('\','/'))
[other]
check-updates=false
autosave-interval=0
[sound]
master-volume=0
[graphics]
full-screen=false
graphics-quality=normal
"@ | Set-Content -LiteralPath (Join-Path $taskDir 'config.ini') -Encoding utf8NoBOM
$taskArgs=@('--config',(Join-Path $taskDir 'config.ini'),'--mod-directory',(Join-Path $taskRoot 'Validation\runtime\mods'),'--load-game',(Join-Path $taskRoot 'Validation\runtime\saves\validation-copy.zip'))
$env:SteamAppId='427520'
$taskProcess=Start-Process -FilePath 'D:\SteamLibrary\steamapps\common\Factorio\bin\x64\Factorio.exe' -WorkingDirectory $taskDir -ArgumentList $taskArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskDir 'stdout.log') -RedirectStandardError (Join-Path $taskDir 'stderr.log') -PassThru
$taskProcess.Id | Set-Content -LiteralPath (Join-Path $taskDir 'process.pid')
Write-Output "singleplayer validation_copy PID=$($taskProcess.Id)"
