param([Parameter(Mandatory=$true)][string]$SavePath)
. "$PSScriptRoot\env.ps1"
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskProfile=Join-Path $taskRoot 'Data\Factorio'
$taskSave=Get-Item -LiteralPath $SavePath
if($taskSave.Extension -ne '.zip'){throw 'Expected a Factorio .zip save.'}
& "$PSScriptRoot\stop-validation.ps1"
New-Item -ItemType Directory -Force -Path $taskProfile,(Join-Path $taskProfile 'mods'),(Join-Path $taskProfile 'saves') | Out-Null
if(!(Test-Path -LiteralPath (Join-Path $taskProfile 'mods\factory-telemetry'))){New-Item -ItemType Junction -Path (Join-Path $taskProfile 'mods\factory-telemetry') -Target (Join-Path $taskRoot 'mod\factory-telemetry') | Out-Null}
@{mods=@(@{name='base';enabled=$true},@{name='space-age';enabled=$true},@{name='quality';enabled=$true},@{name='elevated-rails';enabled=$true},@{name='factory-telemetry';enabled=$true})} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskProfile 'mods\mod-list.json') -Encoding utf8NoBOM
$taskDestination=Join-Path $taskProfile ('saves\monitor-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.zip')
Copy-Item -LiteralPath $taskSave.FullName -Destination $taskDestination
$taskConfig=Join-Path $taskProfile 'config.ini'
if(!(Test-Path -LiteralPath $taskConfig)){
 $taskOriginal=Join-Path $env:APPDATA 'Factorio\config\config.ini'
 $taskText=Get-Content -LiteralPath $taskOriginal -Raw
 $taskText=[regex]::Replace($taskText,'(?m)^read-data=.*$','read-data=D:/SteamLibrary/steamapps/common/Factorio/data')
 $taskText=[regex]::Replace($taskText,'(?m)^write-data=.*$','write-data='+$taskProfile.Replace('\','/'))
 Set-Content -LiteralPath $taskConfig -Value $taskText -Encoding utf8NoBOM
}
& "$PSScriptRoot\start.ps1" -TelemetryDirectory (Join-Path $taskProfile 'script-output\factory-telemetry') -SourceKind game
# This is an explicitly launched interactive game window. It uses a separate D: profile and copied save.
'427520' | Set-Content -LiteralPath (Join-Path $taskProfile 'steam_appid.txt') -Encoding ascii
$env:SteamAppId='427520'
$taskGameProcess=Start-Process -FilePath 'D:\SteamLibrary\steamapps\common\Factorio\bin\x64\Factorio.exe' -WorkingDirectory $taskProfile -ArgumentList @('--config',$taskConfig,'--mod-directory',(Join-Path $taskProfile 'mods'),'--load-game',$taskDestination) -PassThru
$taskGameProcess.Id | Set-Content -LiteralPath (Join-Path $taskProfile 'process.pid')
Write-Output "Monitored game profile: $taskProfile"
