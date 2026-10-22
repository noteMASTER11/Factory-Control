param([string]$GameProfile=(Join-Path $env:APPDATA 'Factorio'))
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskData=Join-Path $taskRoot 'Data\LiveGame'
$taskExport=Join-Path $taskData 'script-output\factory-telemetry'
$taskOutput=Join-Path $taskData 'script-output'
$taskModList=Join-Path $GameProfile 'mods\mod-list.json'
if(!(Test-Path -LiteralPath $taskModList)){throw 'Factorio profile mod-list.json was not found'}
$taskProfileItem=Get-Item -LiteralPath $GameProfile
if(!$taskProfileItem.PSIsContainer){throw 'Expected a Factorio profile directory'}
New-Item -ItemType Directory -Force -Path $taskData,$taskExport,(Join-Path $taskData 'backups') | Out-Null
function Add-ProjectJunction([string]$LinkPath,[string]$TargetPath){
 if(Test-Path -LiteralPath $LinkPath){
  $taskExisting=Get-Item -LiteralPath $LinkPath
  if($taskExisting.LinkType -ne 'Junction' -or [string]$taskExisting.Target -ne $TargetPath){throw "Existing path must be inspected before installation: $LinkPath"}
 }else{New-Item -ItemType Junction -Path $LinkPath -Target $TargetPath | Out-Null}
}
$taskBackup=Join-Path $taskData ('backups\mod-list-'+[DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.json')
Copy-Item -LiteralPath $taskModList -Destination $taskBackup
Add-ProjectJunction (Join-Path $GameProfile 'mods\factory-telemetry') (Join-Path $taskRoot 'mod\factory-telemetry')
# Factorio resolves the whole script-output root before checking write_file paths.
# A junction for only its child is rejected by the engine.
$taskOutputLink=Join-Path $GameProfile 'script-output'
if(Test-Path -LiteralPath $taskOutputLink){
 $taskItem=Get-Item -LiteralPath $taskOutputLink
 if(!$taskItem.LinkType){
  if(@(Get-ChildItem -LiteralPath $taskOutputLink -Force).Count){throw "Existing script-output contains files; inspect before installing: $taskOutputLink"}
  Remove-Item -LiteralPath $taskOutputLink
 }
}
Add-ProjectJunction $taskOutputLink $taskOutput
$taskMods=Get-Content -LiteralPath $taskModList -Raw | ConvertFrom-Json
$taskEntry=$taskMods.mods | Where-Object {$_.name -eq 'factory-telemetry'}
if($taskEntry){$taskEntry.enabled=$true}else{$taskMods.mods+=@{name='factory-telemetry';enabled=$true}}
$taskMods | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $taskModList -Encoding utf8NoBOM
@{game_profile=$GameProfile;export_directory=$taskExport;mod_backup=$taskBackup;source_kind='game'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskData 'profile.json')
& "$PSScriptRoot\stop-validation.ps1"
& "$PSScriptRoot\start-desktop.ps1"
Write-Output 'Collector installed in the existing game profile. Save the game, restart Factorio, and load the same save.'
Write-Output "All telemetry is written to $taskExport"
