param([string]$OutputDirectory='',[ValidateSet('2.0','2.1')][string]$GameBranch='2.0')
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(!$OutputDirectory){$taskReleaseFolder=if($GameBranch -eq '2.0'){'dist\release'}else{'dist\release-2.1'};$OutputDirectory=Join-Path $taskRoot $taskReleaseFolder}
$taskOutput=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskSource=Join-Path $taskRoot 'mod\factory-telemetry'
$taskInfo=Get-Content -LiteralPath (Join-Path $taskSource 'info.json') -Raw | ConvertFrom-Json
$taskName="$($taskInfo.name)_$($taskInfo.version)"
$taskZipPath=& "$PSScriptRoot\package-telemetry.ps1" -GameBranch $GameBranch -OutputDirectory $taskOutput
Copy-Item -LiteralPath (Join-Path $taskRoot 'dist\FactoryControl.exe') -Destination (Join-Path $taskOutput 'FactoryControl.exe') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install-release.ps1') -Destination (Join-Path $taskOutput 'Install-FactoryControl.ps1') -Force
$taskSums=foreach($taskName in @('FactoryControl.exe',($taskName+'.zip'),'Install-FactoryControl.ps1')){
 $taskHash=Get-FileHash -LiteralPath (Join-Path $taskOutput $taskName) -Algorithm SHA256
 "$($taskHash.Hash.ToLowerInvariant())  $taskName"
}
$taskSums | Set-Content -LiteralPath (Join-Path $taskOutput 'SHA256SUMS.txt') -Encoding utf8NoBOM
$taskBundle=Join-Path $taskOutput "FactoryControl-$($taskInfo.version)-Factorio-$GameBranch.zip"
Compress-Archive -LiteralPath @((Join-Path $taskOutput 'FactoryControl.exe'),(Join-Path $taskOutput ($taskInfo.name+'_'+$taskInfo.version+'.zip')),(Join-Path $taskOutput 'Install-FactoryControl.ps1'),(Join-Path $taskOutput 'SHA256SUMS.txt')) -DestinationPath $taskBundle -Force
Write-Output "Release files: $taskOutput"
