param([string]$SourceDirectory='C:\Users\User\Downloads')
. "$PSScriptRoot\env.ps1"
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskAudio=Join-Path $taskRoot 'src\Factorio.Desktop\Web\audio'
$taskFfmpeg=(Get-ChildItem -LiteralPath 'D:\ChatGPT\Tools\FFmpegRuntime\imageio_ffmpeg\binaries' -Filter *.exe | Select-Object -First 1).FullName
if(!$taskFfmpeg){throw 'FFmpeg is not installed in D:\ChatGPT\Tools\FFmpegRuntime'}
foreach($taskName in @('alarm','button','notification','screenshow','button-click-1','button-click-2','button-click-3','button-click-4','button-click-5')){
 & $taskFfmpeg -hide_banner -loglevel error -i (Join-Path $SourceDirectory "$taskName.mp3") -map 0:a:0 -vn -map_metadata -1 -c:a libopus -b:a 64k -vbr on -ar 48000 -y (Join-Path $taskAudio "$taskName.ogg")
 if($LASTEXITCODE -ne 0){throw "Audio conversion failed: $taskName"}
}
& $taskFfmpeg -hide_banner -loglevel error -i (Join-Path $SourceDirectory 'intro.mp3') -map 0:a:0 -vn -t 2 -af 'afade=t=out:st=1.94:d=0.06' -map_metadata -1 -c:a libopus -b:a 64k -vbr on -ar 48000 -y (Join-Path $taskAudio 'intro.ogg')
if($LASTEXITCODE -ne 0){throw 'Intro conversion failed'}
& $taskFfmpeg -hide_banner -loglevel error -i (Join-Path $SourceDirectory 'loading.mp3') -t 1.5 -ac 1 -ar 48000 -c:a pcm_s16le -y 'D:\ChatGPT\Temp\FactorioMonitor\background-head.wav'
if($LASTEXITCODE -ne 0){throw 'Background excerpt failed'}
& 'D:\ChatGPT\Cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' (Join-Path $PSScriptRoot 'prepare-background.py')
if($LASTEXITCODE -ne 0){throw 'Background seam preparation failed'}
& $taskFfmpeg -hide_banner -loglevel error -i 'D:\ChatGPT\Temp\FactorioMonitor\background-loop.wav' -map_metadata -1 -c:a libopus -b:a 48k -vbr on -ar 48000 -y (Join-Path $taskAudio 'background.ogg')
if($LASTEXITCODE -ne 0){throw 'Background encoding failed'}
Get-ChildItem -LiteralPath $taskAudio -Filter *.ogg | Select-Object Name,Length
