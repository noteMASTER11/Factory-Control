param([string]$SavePath=(Join-Path $env:APPDATA 'Factorio\saves\saboteur.zip'),[ValidateRange(0,45)][int]$CaptureSeconds=0)
. "$PSScriptRoot\env.ps1"
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskProbe=Join-Path $env:TEMP ('native-map-probe-'+[Guid]::NewGuid().ToString('N'))
$taskMods=Join-Path $taskProbe 'mods'
$taskFixture=Join-Path $taskMods 'map-probe'
New-Item -ItemType Directory -Force -Path $taskFixture | Out-Null
$taskPackage=& "$PSScriptRoot\package-telemetry.ps1" -GameBranch 2.1
Copy-Item -LiteralPath $taskPackage -Destination $taskMods
Copy-Item -LiteralPath $SavePath -Destination (Join-Path $taskProbe 'validation-saboteur.zip')
@{name='map-probe';version='0.0.1';title='Isolated native map probe';author='Factory Control';factorio_version='2.1';dependencies=@('base >= 2.1.23','factory-telemetry >= 0.4.1')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskFixture 'info.json') -Encoding utf8NoBOM
@'
script.on_nth_tick(60,function()
 if game.tick==0 then return end
 local rows={}
 local players={};for _,p in pairs(game.players)do if #players<12 then local c={surface=p.surface,x=math.floor(p.position.x/32),y=math.floor(p.position.y/32)};players[#players+1]={name=p.name,surface=p.surface.name,x=p.position.x,y=p.position.y,force=p.force.name,charted=p.force.is_chunk_charted(p.surface,c),generated=p.surface.is_chunk_generated(c)}end end
 log('FACTORY_MAP_PLAYERS '..helpers.table_to_json(players))
 log('FACTORY_MAP_STATUS '..tostring(game.tick)..' '..tostring(remote.call('factory_telemetry','snapshot','status')))
 for _,s in pairs(game.surfaces)do
  for _,f in pairs(game.forces)do
   if f.name~="enemy" and f.name~="neutral" then
    local visited=0
    for c in s.get_chunks()do
     visited=visited+1
     if f.is_chunk_charted(s,c)then
      local timer=helpers.create_profiler()
      local pixels=f.get_chunk_chart(s,c);timer.stop()
      rows[#rows+1]={surface=s.name,force=f.name,x=c.x,y=c.y,bytes=pixels and #pixels or 0,width=pixels and math.sqrt(#pixels/2) or 0,elapsed=tostring(timer)}
      if pixels then helpers.write_file('map-probe/'..s.index..'-'..f.index..'.rgb565',pixels,false)end
      break
     end
     if visited>=10000 then break end
    end
   end
  end
 end
 log('FACTORY_MAP_PROBE '..helpers.table_to_json(rows))
 script.on_nth_tick(60,nil)
end)
'@ | Set-Content -LiteralPath (Join-Path $taskFixture 'control.lua') -Encoding utf8NoBOM
@{mods=@(@{name='base';enabled=$true},@{name='space-age';enabled=$true},@{name='quality';enabled=$true},@{name='elevated-rails';enabled=$true},@{name='recycler';enabled=$true},@{name='factory-telemetry';enabled=$true},@{name='map-probe';enabled=$true})} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskMods 'mod-list.json') -Encoding utf8NoBOM
$taskConfig=Join-Path $taskProbe 'config.ini'
"[path]`nread-data=D:/SteamLibrary/steamapps/common/Factorio/data`nwrite-data=$($taskProbe.Replace('\','/'))`n[other]`ncheck-updates=false" | Set-Content -LiteralPath $taskConfig -Encoding utf8NoBOM
$taskArgs=@('--config',$taskConfig,'--mod-directory',$taskMods,'--benchmark',(Join-Path $taskProbe 'validation-saboteur.zip'),'--benchmark-ticks','121','--benchmark-runs','1')
if($CaptureSeconds){
 $taskSettings=Get-Content -LiteralPath 'D:\SteamLibrary\steamapps\common\Factorio\data\server-settings.example.json' -Raw | ConvertFrom-Json
 $taskSettings.name='Factory Control isolated save copy';$taskSettings.description='Explicit validation copy of saboteur.zip';$taskSettings.visibility.public=$false;$taskSettings.visibility.lan=$false;$taskSettings.require_user_verification=$false;$taskSettings.auto_pause=$false;$taskSettings.autosave_interval=0
 $taskSettings | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskProbe 'server-settings.json') -Encoding utf8NoBOM
 $taskArgs=@('--config',$taskConfig,'--mod-directory',$taskMods,'--start-server',(Join-Path $taskProbe 'validation-saboteur.zip'),'--server-settings',(Join-Path $taskProbe 'server-settings.json'),'--port','34219','--bind','127.0.0.1')
}
$taskProcess=Start-Process -FilePath 'D:\SteamLibrary\steamapps\common\Factorio\bin\x64\Factorio.exe' -ArgumentList $taskArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskProbe 'stdout.log') -RedirectStandardError (Join-Path $taskProbe 'stderr.log') -PassThru
Write-Output "Isolated save copy probe PID $($taskProcess.Id): $taskProbe"
if($CaptureSeconds){
 if(!$taskProcess.WaitForExit($CaptureSeconds*1000)){
  $taskOwn=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskProcess.Id)"
  if(!$taskOwn.CommandLine.Contains($taskProbe)){throw 'Unexpected validation process identity'}
  Stop-Process -Id $taskProcess.Id
 }
}else{$taskProcess.WaitForExit()}
Get-Content -LiteralPath (Join-Path $taskProbe 'stdout.log') | Select-String 'FACTORY_MAP_PLAYERS|FACTORY_MAP_STATUS|FACTORY_MAP_PROBE|factory-telemetry .*:|Error|avg:|Performed'
if(!$CaptureSeconds -and $taskProcess.ExitCode -ne 0){Get-Content -LiteralPath (Join-Path $taskProbe 'stdout.log') -Tail 25;throw 'Native map probe failed'}
if($CaptureSeconds){
 $taskStatus=Get-Content -LiteralPath (Join-Path $taskProbe 'script-output\factory-telemetry\status.json') -Raw | ConvertFrom-Json
 if($taskStatus.data.errors.PSObject.Properties.Count){throw ('Collector errors: '+($taskStatus.data.errors|ConvertTo-Json -Depth 5))}
 Get-ChildItem -LiteralPath (Join-Path $taskProbe 'script-output\factory-telemetry') -Filter '*.json' | Select-Object Name,Length
}
Write-Output "Evidence: $taskProbe"
