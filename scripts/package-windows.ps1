param(
    [string]$Version = '0.1.0',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist'),
    [switch]$IncludeImages
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version muss dem Format MAJOR.MINOR.PATCH entsprechen.' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$destination = [IO.Path]::GetFullPath($OutputDirectory)
$stage = Join-Path ([IO.Path]::GetTempPath()) ("SquadTimer-$Version-" + [guid]::NewGuid())
$zip = Join-Path $destination "SquadTimer-$Version-windows.zip"
New-Item -ItemType Directory -Force -Path $stage, $destination | Out-Null
try {
    Copy-Item (Join-Path $root 'distribution\*') $stage -Recurse -Force
    Set-Content -Path (Join-Path $stage 'VERSION') -Value $Version -NoNewline
    if ($IncludeImages) {
        docker image save --output (Join-Path $stage 'docker-images.tar') `
            "ghcr.io/buzzibaer/squadtimer:$Version" `
            "ghcr.io/buzzibaer/squadtimer-watcher:$Version"
        if ($LASTEXITCODE -ne 0) { throw 'Docker-Images konnten nicht exportiert werden.' }
    }
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
    Write-Host "Paket erstellt: $zip"
} finally {
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
