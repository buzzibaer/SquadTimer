$ErrorActionPreference = 'Stop'
$env:SQUADTIMER_VERSION = (Get-Content (Join-Path $PSScriptRoot 'VERSION' -ErrorAction SilentlyContinue) -Raw).Trim()
if (-not $env:SQUADTIMER_VERSION) { $env:SQUADTIMER_VERSION = '0.1.0' }
& docker compose -p squadtimer-release -f (Join-Path $PSScriptRoot 'compose.yaml') --profile watcher down --remove-orphans
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Docker Desktop ist nicht erreichbar oder das SquadTimer-Release-Stack konnte nicht beendet werden.'
    exit 1
}
Write-Host 'SquadTimer wurde beendet.'
