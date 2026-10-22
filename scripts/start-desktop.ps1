param([int]$AutomationPort=0,[switch]$PixiProbe,[switch]$SvgFallback,[string]$TelemetryDirectory='',[ValidateSet('game','validation_copy')][string]$SourceKind='game')
. "$PSScriptRoot\env.ps1"
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskExe=Join-Path $taskRoot 'dist\FactoryControl.exe'
if(!(Test-Path -LiteralPath $taskExe)){$taskExe=Join-Path $taskRoot 'src\Factorio.Desktop\bin\Release\net10.0-windows\Factorio.Desktop.exe'}
if(!(Test-Path -LiteralPath $taskExe)){throw 'Build the desktop project first: scripts/build.ps1'}
$taskLaunch=@{FilePath=$taskExe;WorkingDirectory=$taskRoot;PassThru=$true;WindowStyle='Normal'}
$taskArgs=@('"--data-root='+(Join-Path $taskRoot 'Data')+'"')
if($TelemetryDirectory){$taskArgs+='"--telemetry-directory='+$TelemetryDirectory+'"';$taskArgs+="--source-kind=$SourceKind"}
if($AutomationPort -ge 1024 -and $AutomationPort -le 65535){$taskArgs+="--automation-port=$AutomationPort"}
if($PixiProbe){$taskArgs+='--pixi-probe'}
if($SvgFallback){$taskArgs+='--svg-fallback'}
if($taskArgs.Count){$taskLaunch.ArgumentList=$taskArgs}
$taskProcess=Start-Process @taskLaunch
Write-Output "Factory Control PID=$($taskProcess.Id)"
