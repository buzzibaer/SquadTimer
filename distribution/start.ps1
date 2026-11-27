$ErrorActionPreference = 'Stop'
$project = 'squadtimer-release'
$url = 'http://127.0.0.1:8080'
$compose = @('-p', $project, '-f', (Join-Path $PSScriptRoot 'compose.yaml'))
$logDir = Join-Path $env:LOCALAPPDATA 'SquadGame\Saved\Logs'

function Invoke-Docker([string[]]$Arguments) {
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        if ($Arguments -contains 'up') {
            throw 'SquadTimer-Image konnte nicht gestartet/geladen werden. Prüfe Internetverbindung sowie GHCR-Anmeldung und Paket-Zugriff; Details stehen in der Docker-Meldung oben.'
        }
        throw "Docker-Befehl fehlgeschlagen: docker $($Arguments -join ' ')"
    }
}

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI nicht gefunden. Bitte Docker Desktop installieren und starten.'
    }
    Invoke-Docker @('info') | Out-Null
    Invoke-Docker @('compose', 'version') | Out-Null
    $env:SQUADTIMER_VERSION = (Get-Content (Join-Path $PSScriptRoot 'VERSION') -Raw).Trim()

    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 8080)
    try { $listener.Start() } catch {
        $running = & docker compose @compose 'ps' '--status' 'running' '-q' 'squadtimer'
        if ($LASTEXITCODE -ne 0 -or -not $running) {
            throw 'Port 8080 ist bereits belegt. SquadTimer wurde nicht gestartet; beende den anderen Dienst oder ändere den Port bewusst.'
        }
        try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null } catch {
            throw 'Port 8080 wird bereits verwendet, aber die SquadTimer-App antwortet nicht.'
        }
    } finally { $listener.Stop() }

    $watcher = Test-Path $logDir -PathType Container
    $archive = Join-Path $PSScriptRoot 'docker-images.tar'
    if (Test-Path -LiteralPath $archive -PathType Leaf) {
        $images = @("ghcr.io/buzzibaer/squadtimer:$env:SQUADTIMER_VERSION")
        if ($watcher) { $images += "ghcr.io/buzzibaer/squadtimer-watcher:$env:SQUADTIMER_VERSION" }
        $installedImages = Invoke-Docker @('image', 'ls', '--format', '{{.Repository}}:{{.Tag}}')
        if ($images | Where-Object { $_ -notin $installedImages }) {
            Write-Host 'Mitgelieferte Docker-Images werden einmalig geladen ...'
            Invoke-Docker @('image', 'load', '--input', $archive)
        }
    }
    if ($watcher) {
        $env:SQUADTIMER_LOG_DIR = $logDir.Replace('\', '/')
        $files = @('--profile', 'watcher')
    } else {
        $files = @()
        Invoke-Docker (@('compose') + $compose + @('--profile', 'watcher', 'rm', '-s', '-f', 'match-watcher'))
        Write-Host 'Squad-Logordner nicht gefunden. Die App startet im manuellen Modus; beim nächsten Start wird erneut geprüft.'
    }
    Invoke-Docker (@('compose') + $compose + $files + @('up', '-d', '--remove-orphans'))

    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'SquadTimer wurde nicht rechtzeitig bereit. Prüfe Docker Desktop mit „docker compose logs“. ' }
    Start-Process $url
    Write-Host "SquadTimer läuft: $url"
} catch {
    Write-Error $_
    exit 1
}
