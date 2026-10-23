param(
 [ValidateSet('2.0','2.1')][string]$GameBranch='2.0',
 [string]$OutputDirectory=''
)
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(!$OutputDirectory){$OutputDirectory=Join-Path $taskRoot "dist\mods\$GameBranch"}
$taskOutput=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskSource=Join-Path $taskRoot 'mod\factory-telemetry'
$taskInfo=Get-Content -LiteralPath (Join-Path $taskSource 'info.json') -Raw | ConvertFrom-Json
$taskInfo.factorio_version=$GameBranch
$taskMinimum=if($GameBranch -eq '2.1'){'2.1.23'}else{'2.0.77'}
$taskInfo.dependencies=@("base >= $taskMinimum","? space-age >= $taskMinimum","? quality >= $taskMinimum")
$taskName="$($taskInfo.name)_$($taskInfo.version)"
$taskZipPath=Join-Path $taskOutput ($taskName+'.zip')
if(Test-Path -LiteralPath $taskZipPath){Remove-Item -LiteralPath $taskZipPath}
$taskZip=[IO.Compression.ZipFile]::Open($taskZipPath,[IO.Compression.ZipArchiveMode]::Create)
try{
 foreach($taskFile in Get-ChildItem -LiteralPath $taskSource -Recurse -File){
  $taskRelative=[IO.Path]::GetRelativePath($taskSource,$taskFile.FullName).Replace('\','/')
  if($taskRelative -eq 'info.json'){
   $taskEntry=$taskZip.CreateEntry("$taskName/info.json")
   $taskWriter=[IO.StreamWriter]::new($taskEntry.Open(),[Text.UTF8Encoding]::new($false))
   try{$taskWriter.Write(($taskInfo | ConvertTo-Json -Depth 8))}finally{$taskWriter.Dispose()}
  }else{
   [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,$taskFile.FullName,($taskName+'/'+$taskRelative),[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
 }
}finally{$taskZip.Dispose()}
Write-Output $taskZipPath
