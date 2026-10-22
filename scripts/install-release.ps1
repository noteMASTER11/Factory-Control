#requires -Version 7.0
param(
 [string]$GameExecutable='D:\SteamLibrary\steamapps\common\Factorio\bin\x64\Factorio.exe',
 [string]$GameProfile=(Join-Path $env:APPDATA 'Factorio'),
 [string]$InstallDirectory='D:\ChatGPT\Projects\FactoryControl',
 [string]$PackageDirectory=$PSScriptRoot
)
$ErrorActionPreference='Stop'
$taskInstall=[IO.Path]::GetFullPath($InstallDirectory)
if(!$taskInstall.StartsWith('D:\ChatGPT\',[StringComparison]::OrdinalIgnoreCase)){throw 'InstallDirectory must be under D:\ChatGPT'}
$taskExe=Join-Path $PackageDirectory 'FactoryControl.exe'
$taskZip=Join-Path $PackageDirectory 'factory-telemetry_0.4.0.zip'
$taskModList=Join-Path $GameProfile 'mods\mod-list.json'
foreach($taskPath in @($taskExe,$taskZip,$GameExecutable,$taskModList)){if(!(Test-Path -LiteralPath $taskPath -PathType Leaf)){throw "File not found: $taskPath"}}
$taskData=Join-Path $taskInstall 'Data'
$taskLive=Join-Path $taskData 'LiveGame'
$taskOutput=Join-Path $taskLive 'script-output'
$taskLink=Join-Path $GameProfile 'script-output'
if(Test-Path -LiteralPath $taskLink){
 $taskExisting=Get-Item -LiteralPath $taskLink
 if($taskExisting.LinkType){if([string]$taskExisting.Target -ne $taskOutput){throw "script-output points elsewhere: $taskLink. Keep the existing collector installation or select its installation directory."}}
 elseif(@(Get-ChildItem -LiteralPath $taskLink -Force).Count){throw "script-output is not empty: $taskLink. Move its existing files to D: before installing; nothing has been replaced."}
}
$taskMods=Get-Content -LiteralPath $taskModList -Raw | ConvertFrom-Json
if(!(Test-Path -LiteralPath (Join-Path $taskLive 'backups'))){New-Item -ItemType Directory -Force -Path (Join-Path $taskLive 'backups') | Out-Null}
Copy-Item -LiteralPath $taskModList -Destination (Join-Path $taskLive ('backups\mod-list-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.json'))
if([IO.Path]::GetFullPath($taskExe) -ne (Join-Path $taskInstall 'FactoryControl.exe')){Copy-Item -LiteralPath $taskExe -Destination (Join-Path $taskInstall 'FactoryControl.exe') -Force}
Copy-Item -LiteralPath $taskZip -Destination (Join-Path $GameProfile 'mods\factory-telemetry_0.4.0.zip') -Force
New-Item -ItemType Directory -Force -Path $taskOutput,(Join-Path $taskOutput 'factory-telemetry') | Out-Null
if(Test-Path -LiteralPath $taskLink){if(!(Get-Item -LiteralPath $taskLink).LinkType){Remove-Item -LiteralPath $taskLink}}
if(!(Test-Path -LiteralPath $taskLink)){New-Item -ItemType Junction -Path $taskLink -Target $taskOutput | Out-Null}
$taskEntry=$taskMods.mods | Where-Object {$_.name -eq 'factory-telemetry'}
if($taskEntry){$taskEntry.enabled=$true}else{$taskMods.mods+=@{name='factory-telemetry';enabled=$true}}
$taskMods | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $taskModList -Encoding utf8NoBOM
@{export_directory=(Join-Path $taskOutput 'factory-telemetry');game_profile=[IO.Path]::GetFullPath($GameProfile);game_executable=[IO.Path]::GetFullPath($GameExecutable);source_kind='game'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskLive 'profile.json') -Encoding utf8NoBOM
$taskLauncher='@echo off'+"`r`n"+'start "Factory Control" "'+(Join-Path $taskInstall 'FactoryControl.exe')+'" "--data-root='+$taskData+'"'+"`r`n"
Set-Content -LiteralPath (Join-Path $taskInstall 'Factory Control.cmd') -Value $taskLauncher -Encoding ascii
Write-Output "Installed: $taskInstall"
Write-Output 'Restart Factorio, load a map, then launch Factory Control.cmd. The game is not started or stopped by this installer.'
