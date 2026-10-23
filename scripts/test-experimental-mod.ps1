param([string]$GameExecutable='D:\SteamLibrary\steamapps\common\Factorio\bin\x64\Factorio.exe')
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskCheck=Join-Path $env:TEMP ('experimental-smoke-'+[Guid]::NewGuid().ToString('N'))
$taskMods=Join-Path $taskCheck 'mods'
$taskFixture=Join-Path $taskMods 'telemetry-smoke'
New-Item -ItemType Directory -Force -Path $taskFixture | Out-Null
$taskPackage=& "$PSScriptRoot\package-telemetry.ps1" -GameBranch 2.1
Copy-Item -LiteralPath $taskPackage -Destination $taskMods
@{name='telemetry-smoke';version='0.0.1';title='Isolated telemetry test';author='Factory Control';factorio_version='2.1';dependencies=@('base >= 2.1.23','factory-telemetry >= 0.4.1')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskFixture 'info.json') -Encoding utf8NoBOM
Copy-Item -LiteralPath (Join-Path $taskRoot 'tests\fixtures\experimental-smoke.lua') -Destination (Join-Path $taskFixture 'control.lua')
@{mods=@(@{name='base';enabled=$true},@{name='factory-telemetry';enabled=$true},@{name='telemetry-smoke';enabled=$true})} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskMods 'mod-list.json') -Encoding utf8NoBOM
$taskConfig=Join-Path $taskCheck 'config.ini'
$taskRead=Join-Path (Split-Path (Split-Path (Split-Path $GameExecutable -Parent) -Parent) -Parent) 'data'
"[path]`nread-data=$($taskRead.Replace('\','/'))`nwrite-data=$($taskCheck.Replace('\','/'))`n[other]`ncheck-updates=false" | Set-Content -LiteralPath $taskConfig -Encoding utf8NoBOM
@{width=64;height=64;seed=1001;peaceful_mode=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskCheck 'map-gen.json') -Encoding utf8NoBOM
$taskSave=Join-Path $taskCheck 'synthetic-test.zip'
$taskSettings=Get-Content -LiteralPath (Join-Path $taskRead 'server-settings.example.json') -Raw | ConvertFrom-Json
$taskSettings.name='Factory Control isolated test';$taskSettings.description='Synthetic telemetry compatibility test'
$taskSettings.visibility.public=$false;$taskSettings.visibility.lan=$false
$taskSettings.require_user_verification=$false;$taskSettings.auto_pause=$false;$taskSettings.autosave_interval=0
$taskSettings | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskCheck 'server-settings.json') -Encoding utf8NoBOM
foreach($taskMode in @('create','server')){
 $taskArgs=@('--config',$taskConfig,'--mod-directory',$taskMods,'--disable-audio')
 if($taskMode -eq 'create'){$taskArgs+=@('--create',$taskSave,'--map-gen-settings',(Join-Path $taskCheck 'map-gen.json'))}
 else{$taskArgs+=@('--start-server',$taskSave,'--server-settings',(Join-Path $taskCheck 'server-settings.json'),'--port','34219')}
 $taskProcess=Start-Process -FilePath $GameExecutable -ArgumentList $taskArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskCheck "$taskMode.stdout.log") -RedirectStandardError (Join-Path $taskCheck "$taskMode.stderr.log") -PassThru
 if($taskMode -eq 'create'){
  $taskProcess.WaitForExit()
  if($taskProcess.ExitCode -ne 0){Get-Content -LiteralPath (Join-Path $taskCheck "$taskMode.stdout.log") -Tail 30;throw "Engine test failed ($taskMode); evidence: $taskCheck"}
 }else{
  try{
   $taskDeadline=[DateTime]::UtcNow.AddSeconds(30)
   do{
    Start-Sleep -Milliseconds 250
    $taskResult=Get-Content -LiteralPath (Join-Path $taskCheck 'server.stdout.log') | Select-String 'FACTORY_TELEMETRY_SMOKE_OK' | Select-Object -Last 1
   }while(!$taskResult -and !$taskProcess.HasExited -and [DateTime]::UtcNow -lt $taskDeadline)
  }finally{
   if(!$taskProcess.HasExited){
    $taskOwnProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskProcess.Id)"
    if(!$taskOwnProcess.CommandLine.Contains($taskCheck)){throw 'Unexpected test process identity'}
    Stop-Process -Id $taskProcess.Id
   }
  }
  if(!$taskResult){Get-Content -LiteralPath (Join-Path $taskCheck 'server.stdout.log') -Tail 35;throw "Engine did not confirm test completion; evidence: $taskCheck"}
 }
}
foreach($taskTopic in @('status','power','production','machines','logistics','research','resources','combat')){
 $taskDoc=Get-Content -LiteralPath (Join-Path $taskCheck "script-output\factory-telemetry\$taskTopic.json") -Raw | ConvertFrom-Json
 if($taskDoc.topic -ne $taskTopic){throw "Wrong exported channel: $taskTopic"}
}
Write-Output $taskResult.Line
Write-Output "Evidence: $taskCheck"
