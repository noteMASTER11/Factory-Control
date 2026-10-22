$taskRoot=Split-Path $PSScriptRoot -Parent
$taskPaths=@((Join-Path $taskRoot 'dist\FactoryControl.exe'),(Join-Path $taskRoot 'out\Desktop\Factorio.Desktop.exe'),(Join-Path $taskRoot 'src\Factorio.Desktop\bin\Release\net10.0-windows\Factorio.Desktop.exe'))
foreach($taskProcess in Get-Process -Name Factorio.Desktop,FactoryControl -ErrorAction SilentlyContinue){
 if($taskProcess.Path -in $taskPaths){
  $null=$taskProcess.CloseMainWindow()
  if(!$taskProcess.WaitForExit(15000)){throw 'Factory Control did not finish shutdown'}
  Write-Output "Stopped Factory Control PID=$($taskProcess.Id)"
 }
}
