param([int]$CaptureSeconds=45)
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskProbe=Join-Path $env:TEMP ('space-probe-'+[Guid]::NewGuid().ToString('N'))
$taskMods=Join-Path $taskProbe 'mods'
$taskFixture=Join-Path $taskMods 'space-probe'
New-Item -ItemType Directory -Force $taskFixture | Out-Null
$taskPackage=& "$PSScriptRoot\package-telemetry.ps1" -GameBranch 2.1
Copy-Item -LiteralPath $taskPackage -Destination $taskMods
Copy-Item -LiteralPath (Join-Path $env:APPDATA 'Factorio\saves\saboteur.zip') -Destination (Join-Path $taskProbe 'validation-saboteur.zip')
Copy-Item -LiteralPath (Join-Path $taskRoot 'tests\fixtures\space-probe.lua') -Destination (Join-Path $taskFixture 'control.lua')
@{name='space-probe';version='0.0.1';title='Isolated transport probe';author='Factory Control';factorio_version='2.1';dependencies=@('base >= 2.1.23','factory-telemetry >= 0.6.0')} | ConvertTo-Json | Set-Content (Join-Path $taskFixture 'info.json') -Encoding utf8NoBOM
@{mods=@(@{name='base';enabled=$true},@{name='space-age';enabled=$true},@{name='quality';enabled=$true},@{name='elevated-rails';enabled=$true},@{name='recycler';enabled=$true},@{name='factory-telemetry';enabled=$true},@{name='space-probe';enabled=$true})}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $taskMods 'mod-list.json') -Encoding utf8NoBOM
$taskConfig=Join-Path $taskProbe 'config.ini'
"[path]`nread-data=D:/SteamLibrary/steamapps/common/Factorio/data`nwrite-data=$($taskProbe.Replace('\','/'))`n[other]`ncheck-updates=false" | Set-Content $taskConfig -Encoding utf8NoBOM
$taskSettings=Get-Content 'D:\SteamLibrary\steamapps\common\Factorio\data\server-settings.example.json' -Raw | ConvertFrom-Json
$taskSettings.name='Factory Control isolated transport copy';$taskSettings.visibility.public=$false;$taskSettings.visibility.lan=$false;$taskSettings.require_user_verification=$false;$taskSettings.auto_pause=$false;$taskSettings.autosave_interval=0
$taskSettings|ConvertTo-Json -Depth 8|Set-Content (Join-Path $taskProbe 'server-settings.json') -Encoding utf8NoBOM
$taskArgs=@('--config',$taskConfig,'--mod-directory',$taskMods,'--start-server',(Join-Path $taskProbe 'validation-saboteur.zip'),'--server-settings',(Join-Path $taskProbe 'server-settings.json'),'--port','34220','--bind','127.0.0.1')
$taskProcess=Start-Process 'D:\SteamLibrary\steamapps\common\Factorio\bin\x64\Factorio.exe' -ArgumentList $taskArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskProbe 'stdout.log') -RedirectStandardError (Join-Path $taskProbe 'stderr.log') -PassThru
Write-Output "Isolated save-copy transport probe PID $($taskProcess.Id): $taskProbe"
if(!$taskProcess.WaitForExit($CaptureSeconds*1000)){
 $taskOwn=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskProcess.Id)"
 if(!$taskOwn.CommandLine.Contains($taskProbe)){throw 'Unexpected validation process identity'}
 Stop-Process -Id $taskProcess.Id
}
Get-Content (Join-Path $taskProbe 'stdout.log')|Select-String 'SPACE_PROBE|Error|factory-telemetry .*:'
Write-Output "Evidence: $taskProbe"
