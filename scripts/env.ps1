# Optional machine-local toolchain/cache paths. Never ship personal paths.
$taskLocalEnvironment=Join-Path $PSScriptRoot 'env.local.ps1'
if(Test-Path -LiteralPath $taskLocalEnvironment){. $taskLocalEnvironment}
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONUTF8='1'
