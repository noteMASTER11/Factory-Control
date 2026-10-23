param([string]$OutputDirectory='')
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(!$OutputDirectory){$OutputDirectory=Join-Path $taskRoot 'dist\release'}
$taskOutput=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskInfo=Get-Content -LiteralPath (Join-Path $taskRoot 'mod\factory-telemetry\info.json') -Raw | ConvertFrom-Json
Copy-Item -LiteralPath (Join-Path $taskRoot 'dist\FactoryControl.exe') -Destination (Join-Path $taskOutput 'FactoryControl.exe') -Force
$taskModRoot=Join-Path $taskOutput 'manual-collector'
foreach($taskBranch in @('2.0','2.1')){
 & "$PSScriptRoot\package-telemetry.ps1" -GameBranch $taskBranch -OutputDirectory (Join-Path $taskModRoot $taskBranch) | Out-Null
}
@'
Factory Control already contains and installs the collector. This optional archive is for manual installation.

Choose the 2.0 folder for Factorio 2.0.77+ or the 2.1 folder for Factorio 2.1.23+ experimental.
Copy the inner factory-telemetry_<version>.zip into your Factorio profile's mods folder. Do not extract the inner ZIP.
Enable Factory Telemetry Bridge in Factorio, restart the game and load your save.

The two mod archives share their Lua code and differ only in the game compatibility metadata.
In multiplayer, the collector exports on the server; Factory Control needs access to those exported files.
'@ | Set-Content -LiteralPath (Join-Path $taskModRoot 'README.txt') -Encoding utf8NoBOM
$taskModBundle='FactoryTelemetry-'+$taskInfo.version+'.zip'
Compress-Archive -LiteralPath @((Join-Path $taskModRoot '2.0'),(Join-Path $taskModRoot '2.1'),(Join-Path $taskModRoot 'README.txt')) -DestinationPath (Join-Path $taskOutput $taskModBundle) -Force
$taskSums=foreach($taskName in @('FactoryControl.exe',$taskModBundle)){
 $taskHash=Get-FileHash -LiteralPath (Join-Path $taskOutput $taskName) -Algorithm SHA256
 "$($taskHash.Hash.ToLowerInvariant())  $taskName"
}
$taskSums | Set-Content -LiteralPath (Join-Path $taskOutput 'SHA256SUMS.txt') -Encoding utf8NoBOM
Write-Output "Release files: $taskOutput"
