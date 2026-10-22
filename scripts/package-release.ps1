param([string]$OutputDirectory='')
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(!$OutputDirectory){$OutputDirectory=Join-Path $taskRoot 'dist\release'}
$taskOutput=[IO.Path]::GetFullPath($OutputDirectory)
if(!$taskOutput.StartsWith('D:\ChatGPT\',[StringComparison]::OrdinalIgnoreCase)){throw 'Release output must be under D:\ChatGPT'}
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskSource=Join-Path $taskRoot 'mod\factory-telemetry'
$taskInfo=Get-Content -LiteralPath (Join-Path $taskSource 'info.json') -Raw | ConvertFrom-Json
$taskName="$($taskInfo.name)_$($taskInfo.version)"
$taskZipPath=Join-Path $taskOutput ($taskName+'.zip')
if(Test-Path -LiteralPath $taskZipPath){Remove-Item -LiteralPath $taskZipPath}
$taskZip=[IO.Compression.ZipFile]::Open($taskZipPath,[IO.Compression.ZipArchiveMode]::Create)
try{
 foreach($taskFile in Get-ChildItem -LiteralPath $taskSource -Recurse -File){
  $taskRelative=[IO.Path]::GetRelativePath($taskSource,$taskFile.FullName).Replace('\','/')
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,$taskFile.FullName,($taskName+'/'+$taskRelative),[IO.Compression.CompressionLevel]::Optimal) | Out-Null
 }
}finally{$taskZip.Dispose()}
Copy-Item -LiteralPath (Join-Path $taskRoot 'dist\FactoryControl.exe') -Destination (Join-Path $taskOutput 'FactoryControl.exe') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install-release.ps1') -Destination (Join-Path $taskOutput 'Install-FactoryControl.ps1') -Force
$taskSums=foreach($taskName in @('FactoryControl.exe',($taskName+'.zip'),'Install-FactoryControl.ps1')){
 $taskHash=Get-FileHash -LiteralPath (Join-Path $taskOutput $taskName) -Algorithm SHA256
 "$($taskHash.Hash.ToLowerInvariant())  $taskName"
}
$taskSums | Set-Content -LiteralPath (Join-Path $taskOutput 'SHA256SUMS.txt') -Encoding utf8NoBOM
Write-Output "Release files: $taskOutput"
