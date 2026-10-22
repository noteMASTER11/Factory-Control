param([string]$SavePath)
. "$PSScriptRoot\env.ps1"
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskRuntime = Join-Path $taskRoot 'Validation\runtime'
New-Item -ItemType Directory -Force -Path $taskRuntime,(Join-Path $taskRuntime 'mods'),(Join-Path $taskRuntime 'saves') | Out-Null
$taskSource = Join-Path $env:APPDATA 'Factorio\saves'
if(!$SavePath){
 $taskLoadLine=Get-Content -LiteralPath (Join-Path $env:APPDATA 'Factorio\factorio-current.log') | Select-String 'Loading map (.+\.zip): \d+ bytes' | Select-Object -Last 1
 if($taskLoadLine -and $taskLoadLine.Line -match 'Loading map (.+\.zip): \d+ bytes'){$SavePath=$Matches[1]}
}
if($SavePath){$taskSave=Get-Item -LiteralPath $SavePath}else{$taskSave=Get-ChildItem -LiteralPath $taskSource -Filter '_autosave*.zip' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1}
if (!$taskSave) { throw 'No autosave found.' }
Copy-Item -LiteralPath $taskSave.FullName -Destination (Join-Path $taskRuntime 'saves\validation-copy.zip')
if (!(Test-Path -LiteralPath (Join-Path $taskRuntime 'mods\factory-telemetry'))) { New-Item -ItemType Junction -Path (Join-Path $taskRuntime 'mods\factory-telemetry') -Target (Join-Path $taskRoot 'mod\factory-telemetry') | Out-Null }
@{mods=@(@{name='base';enabled=$true},@{name='space-age';enabled=$true},@{name='quality';enabled=$true},@{name='elevated-rails';enabled=$true},@{name='factory-telemetry';enabled=$true})} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskRuntime 'mods\mod-list.json') -Encoding utf8NoBOM
@"
[path]
read-data=D:/SteamLibrary/steamapps/common/Factorio/data
write-data=$($taskRuntime.Replace('\','/'))
[other]
check-updates=false
"@ | Set-Content -LiteralPath (Join-Path $taskRuntime 'config.ini') -Encoding utf8NoBOM
@{name='Factory telemetry validation copy';description='Separate copied save; not the running player session';visibility=@{public=$false;lan=$false};require_user_verification=$false;auto_pause=$false;autosave_interval=0;allow_commands='admins-only'} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskRuntime 'server-settings.json') -Encoding utf8NoBOM
@{source_save=$taskSave.Name;source_mtime=$taskSave.LastWriteTimeUtc;copy='saves/validation-copy.zip';source_kind='validation_copy'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRuntime 'provenance.json') -Encoding utf8NoBOM
Write-Output $taskRuntime
