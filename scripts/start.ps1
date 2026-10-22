param([string]$TelemetryDirectory='', [ValidateSet('game','validation_copy')][string]$SourceKind='game')
# Compatibility entry point: the desktop now owns both services.
& "$PSScriptRoot\start-desktop.ps1" -TelemetryDirectory $TelemetryDirectory -SourceKind $SourceKind
