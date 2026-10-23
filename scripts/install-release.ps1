#requires -Version 7.0
param(
 [Parameter(Mandatory=$true)][string]$GameExecutable,
 [string]$GameProfile=(Join-Path $env:APPDATA 'Factorio'),
 [string]$InstallDirectory=(Join-Path $env:LOCALAPPDATA 'FactoryControl'),
 [string]$PackageDirectory=$PSScriptRoot
)
$ErrorActionPreference='Stop'
if(@(Get-Process -Name factorio -ErrorAction SilentlyContinue).Count){
 throw 'Close Factorio before installing the collector. A running client overwrites mod-list.json on exit. Install with the game closed, or enable an already installed mod through the in-game Mods menu.'
}
$taskInstall=[IO.Path]::GetFullPath($InstallDirectory)
$taskExe=Join-Path $PackageDirectory 'FactoryControl.exe'
$taskVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($GameExecutable)
$taskGameBranch="$($taskVersion.FileMajorPart).$($taskVersion.FileMinorPart)"
$taskPackages=foreach($taskCandidate in Get-ChildItem -LiteralPath $PackageDirectory -Filter 'factory-telemetry_*.zip' -File){
 $taskArchive=[IO.Compression.ZipFile]::OpenRead($taskCandidate.FullName)
 try{
  $taskEntry=$taskArchive.Entries | Where-Object FullName -match '^[^/]+/info\.json$' | Select-Object -First 1
  if(!$taskEntry){continue}
  $taskReader=[IO.StreamReader]::new($taskEntry.Open())
  try{$taskInfo=$taskReader.ReadToEnd() | ConvertFrom-Json}finally{$taskReader.Dispose()}
  if($taskInfo.name -eq 'factory-telemetry' -and $taskInfo.factorio_version -eq $taskGameBranch){[pscustomobject]@{Path=$taskCandidate.FullName;Version=[version]$taskInfo.version}}
 }finally{$taskArchive.Dispose()}
}
$taskSelected=$taskPackages | Sort-Object Version -Descending | Select-Object -First 1
if(!$taskSelected){throw "No factory-telemetry archive for Factorio $taskGameBranch was found in $PackageDirectory"}
$taskZip=$taskSelected.Path
$taskModList=Join-Path $GameProfile 'mods\mod-list.json'
foreach($taskPath in @($taskExe,$taskZip,$GameExecutable,$taskModList)){if(!(Test-Path -LiteralPath $taskPath -PathType Leaf)){throw "File not found: $taskPath"}}
$taskData=Join-Path $taskInstall 'Data'
$taskLive=Join-Path $taskData 'LiveGame'
$taskOutput=Join-Path $taskLive 'script-output'
$taskLink=Join-Path $GameProfile 'script-output'
if(Test-Path -LiteralPath $taskLink){
 $taskExisting=Get-Item -LiteralPath $taskLink
 if($taskExisting.LinkType){if([string]$taskExisting.Target -ne $taskOutput){throw "script-output points elsewhere: $taskLink. Keep the existing collector installation or select its installation directory."}}
 elseif(@(Get-ChildItem -LiteralPath $taskLink -Force).Count){throw "script-output is not empty: $taskLink. Relocate its existing files or use a fresh game profile before installing; nothing has been replaced."}
}
$taskMods=Get-Content -LiteralPath $taskModList -Raw | ConvertFrom-Json
if(!(Test-Path -LiteralPath (Join-Path $taskLive 'backups'))){New-Item -ItemType Directory -Force -Path (Join-Path $taskLive 'backups') | Out-Null}
Copy-Item -LiteralPath $taskModList -Destination (Join-Path $taskLive ('backups\mod-list-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.json'))
if([IO.Path]::GetFullPath($taskExe) -ne (Join-Path $taskInstall 'FactoryControl.exe')){Copy-Item -LiteralPath $taskExe -Destination (Join-Path $taskInstall 'FactoryControl.exe') -Force}
Copy-Item -LiteralPath $taskZip -Destination (Join-Path $GameProfile ('mods\'+[IO.Path]::GetFileName($taskZip))) -Force
New-Item -ItemType Directory -Force -Path $taskOutput,(Join-Path $taskOutput 'factory-telemetry') | Out-Null
if(Test-Path -LiteralPath $taskLink){if(!(Get-Item -LiteralPath $taskLink).LinkType){Remove-Item -LiteralPath $taskLink}}
if(!(Test-Path -LiteralPath $taskLink)){New-Item -ItemType Junction -Path $taskLink -Target $taskOutput | Out-Null}
$taskEntry=$taskMods.mods | Where-Object {$_.name -eq 'factory-telemetry'}
if($taskEntry){$taskEntry.enabled=$true}else{$taskMods.mods+=@{name='factory-telemetry';enabled=$true}}
$taskMods | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $taskModList -Encoding utf8NoBOM
@{export_directory=(Join-Path $taskOutput 'factory-telemetry');game_profile=[IO.Path]::GetFullPath($GameProfile);game_executable=[IO.Path]::GetFullPath($GameExecutable);source_kind='game'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskLive 'profile.json') -Encoding utf8NoBOM
$taskLauncher='@echo off'+"`r`n"+'chcp 65001 >nul'+"`r`n"+'start "Factory Control" "'+(Join-Path $taskInstall 'FactoryControl.exe')+'" "--data-root='+$taskData+'"'+"`r`n"
Set-Content -LiteralPath (Join-Path $taskInstall 'Factory Control.cmd') -Value $taskLauncher -Encoding utf8NoBOM
Write-Output "Installed: $taskInstall"
Write-Output 'Restart Factorio, load a map, then launch Factory Control.cmd. The game is not started or stopped by this installer.'
