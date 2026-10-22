param([Parameter(Mandatory=$true)][string]$DataRoot,[string]$GameExecutable='D:\SteamLibrary\steamapps\common\Factorio\bin\x64\Factorio.exe')
. "$PSScriptRoot\env.ps1"
$taskIdentityPath=Join-Path $DataRoot 'process.json'
$taskLast=''
while($true){
 try{
  $taskCandidates=@(Get-CimInstance Win32_Process -Filter "Name='factorio.exe'" | Where-Object {$_.ExecutablePath -eq $GameExecutable -and $_.CommandLine -notmatch '--config|--start-server|--benchmark'})
  if($taskCandidates.Count -eq 1){
   $taskGame=Get-Process -Id $taskCandidates[0].ProcessId -ErrorAction Stop
   $taskKey="$($taskGame.Id):$($taskGame.StartTime.ToUniversalTime().Ticks)"
   if($taskKey -ne $taskLast){
    $taskIdentity=@{process_id=$taskGame.Id;executable=$taskGame.Path;started_at_utc=$taskGame.StartTime.ToUniversalTime().ToString('o')}
    $taskIdentity | ConvertTo-Json | Set-Content -LiteralPath ($taskIdentityPath+'.tmp') -Encoding utf8NoBOM
    Move-Item -LiteralPath ($taskIdentityPath+'.tmp') -Destination $taskIdentityPath -Force
    $taskLast=$taskKey
   }
  }
 }catch{Write-Output $_.Exception.Message}
 Start-Sleep -Seconds 2
}
