param([string]$GameData='D:\SteamLibrary\steamapps\common\Factorio\data')
. "$PSScriptRoot\env.ps1"
& 'D:\ChatGPT\Cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' "$PSScriptRoot\import-game-catalog.py" --game-data $GameData
if($LASTEXITCODE -ne 0){throw 'Game catalog import failed'}
