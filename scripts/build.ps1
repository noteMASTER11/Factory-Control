param([switch]$Publish)
. "$PSScriptRoot\env.ps1"
$taskRoot=Split-Path $PSScriptRoot -Parent
Push-Location $taskRoot
try{
 dotnet build .\FactorioMonitor.slnx --configuration Release --nologo --verbosity minimal
 if($LASTEXITCODE -ne 0){throw 'Build failed'}
 dotnet test .\tests\Factorio.Tests\Factorio.Tests.csproj --configuration Release --no-build --nologo --verbosity minimal
 if($LASTEXITCODE -ne 0){throw 'Tests failed'}
 dotnet test .\tests\Factorio.Desktop.Tests\Factorio.Desktop.Tests.csproj --configuration Release --no-build --nologo --verbosity minimal
 if($LASTEXITCODE -ne 0){throw 'Desktop tests failed'}
 if($Publish){
   $taskPublish=Join-Path ([IO.Path]::GetTempPath()) ('FactoryControl-publish-'+[Guid]::NewGuid().ToString('N'))
   dotnet publish .\src\Factorio.Desktop\Factorio.Desktop.csproj -c Release -r win-x64 -p:PortableBundle=true -p:DebugType=embedded -o $taskPublish --nologo --verbosity minimal
   if($LASTEXITCODE -ne 0){throw 'Publish Desktop failed'}
   $taskBundle=Join-Path $taskPublish 'Factorio.Desktop.exe'
   New-Item -ItemType Directory -Force -Path .\dist | Out-Null
   Copy-Item -LiteralPath $taskBundle -Destination .\dist\FactoryControl.exe -Force -ErrorAction Stop
   Write-Output "Portable application: $taskRoot\dist\FactoryControl.exe"
 }
}finally{Pop-Location}
