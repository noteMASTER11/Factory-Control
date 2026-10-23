param(
 [string]$GameProfile=(Join-Path $env:APPDATA 'Factorio'),
 [Parameter(Mandatory=$true)][string]$GameExecutable,
 [ValidateSet('Auto','2.0','2.1')][string]$GameBranch='Auto',
 [switch]$SkipDesktopStart
)
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
# Factorio rewrites its in-memory mod list on shutdown. Editing it while the
# client is alive can silently undo activation on the very next restart.
if(@(Get-Process -Name factorio -ErrorAction SilentlyContinue).Count){
 throw 'Close Factorio before installing the collector. A running client overwrites mod-list.json on exit. Install with the game closed, or enable an already installed mod through the in-game Mods menu.'
}
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
if($GameBranch -eq 'Auto'){
 $taskVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($GameExecutable)
 $GameBranch="$($taskVersion.FileMajorPart).$($taskVersion.FileMinorPart)"
 if($GameBranch -notin @('2.0','2.1')){throw "Unsupported Factorio branch: $GameBranch"}
}
$taskPackage=& "$PSScriptRoot\package-telemetry.ps1" -GameBranch $GameBranch
$taskModInfo=Get-Content -LiteralPath (Join-Path $taskRoot 'mod\factory-telemetry\info.json') -Raw | ConvertFrom-Json
$taskStage=Join-Path $taskData "mods\$GameBranch"
Expand-Archive -LiteralPath $taskPackage -DestinationPath $taskStage -Force
$taskModTarget=Join-Path $taskStage "$($taskModInfo.name)_$($taskModInfo.version)"
$taskModLink=Join-Path $GameProfile 'mods\factory-telemetry'
if(Test-Path -LiteralPath $taskModLink){
 $taskExistingMod=Get-Item -LiteralPath $taskModLink
 if($taskExistingMod.LinkType -ne 'Junction'){throw "Expected the managed collector junction: $taskModLink"}
 $taskOldTarget=[IO.Path]::GetFullPath([string]$taskExistingMod.Target)
 $taskAllowedRoot=[IO.Path]::GetFullPath($taskRoot).TrimEnd('\')+'\'
 if(!$taskOldTarget.StartsWith($taskAllowedRoot,[StringComparison]::OrdinalIgnoreCase)){throw "Collector junction belongs to another installation: $taskOldTarget"}
 if($taskOldTarget -ne $taskModTarget){Remove-Item -LiteralPath $taskModLink}
}
$taskBackup=Join-Path $taskData ('backups\mod-list-'+[DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.json')
Copy-Item -LiteralPath $taskModList -Destination $taskBackup
Add-ProjectJunction $taskModLink $taskModTarget
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
if(!$SkipDesktopStart){
 & "$PSScriptRoot\stop-validation.ps1"
 & "$PSScriptRoot\start-desktop.ps1"
}
Write-Output 'Collector installed in the existing game profile. Save the game, restart Factorio, and load the same save.'
Write-Output "All telemetry is written to $taskExport"
