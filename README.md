# SquadTimer V1

German, installierbare PWA für manuelle Fahrzeug-Abschussmeldungen. Keine Spielintegration, kein Backend, keine Push-Meldungen. Die Runde wird lokal gespeichert und arbeitet mit festen absoluten Zeitpunkten.

SquadTimer wurde mit KI-Unterstützung entwickelt.

## Start

```sh
npm install
npm run dev
```

Tests: `npm test`; Produktionsdateien: `npm run build`, danach `npm run preview`. Installation und Service Worker benötigen HTTPS auf gehosteten Seiten; `localhost` ist für Entwicklung ausgenommen. Offline-Nutzung steht nach erfolgreichem ersten Online-Laden zur Verfügung. Daten verbleiben im Browser dieses Geräts; Browserdaten löschen entfernt auch die Runde.

## Lokaler Docker-Test

Mit Docker Desktop (Linux-Container) das Produktions-Build lokal starten:

```sh
docker compose up --build -d
```

Danach unter <http://127.0.0.1:8080> öffnen. Der Dienst ist ausschließlich an die Loopback-Adresse gebunden und nicht aus dem LAN erreichbar. Falls Port 8080 bereits belegt ist, einen freien Host-Port angeben, z. B.:

```powershell
$env:SQUADTIMER_PORT = "8081"
docker compose up --build -d
```

Dann lautet die URL <http://127.0.0.1:8081>. Beenden und den Container entfernen:

```sh
docker compose down
```

Das ist ein lokaler HTTP-Test. Installation und Service Worker funktionieren auf gehosteten Seiten nur über HTTPS (localhost ist eine Browser-Ausnahme). Offline-Verhalten ist mit dem Containerstart allein nicht getestet.

## Optionale lokale Match-Erkennung (Windows)

Standardmäßig ist keine Log-Datei eingebunden und es läuft kein Erkennungsdienst. Optional kann ein read-only Watcher die Squad-Client-Logs lokal lesen. Er erkennt einen Layer erst nach abgeschlossenem `SeamlessTravel` und liefert ausschließlich normalisierten Layer, Verbindungsstatus, Ereignis-ID und Zeitstempel an die App unter demselben Ursprung. Es werden keine Discord-Daten, Spielprozesse, IP-/Kontodaten, Rohzeilen oder Telemetrie gelesen/übertragen. Die Erkennung liefert **keine Fahrzeugdaten**. Team, Fraktion, Einheit und „Staging beendet“ bleiben manuell zu prüfen/setzen.

In PowerShell im Projektverzeichnis:

```powershell
$env:LOCALAPPDATA = [Environment]::GetFolderPath('LocalApplicationData')
docker compose -f compose.yaml -f compose.match-detection.yaml up --build -d
```

Der Watcher mountet nur `$env:LOCALAPPDATA\SquadGame\Saved\Logs` und ausschließlich read-only. Ist der Ordner nicht vorhanden, bleibt die optionale Erkennung inaktiv. Standardstart und Loopback-Bindung `127.0.0.1:8080` bleiben unverändert. Für abweichende Log-Ordner muss der Volume-Pfad in `compose.match-detection.yaml` bewusst angepasst werden. Beenden:

```powershell
docker compose -f compose.yaml -f compose.match-detection.yaml down
```

Der erste beobachtete Dateistand wird bis Dateiende übersprungen; ältere Log-Sitzungen werden damit nicht als live angeboten. Dateiersetzung/-kürzung setzt die Parser-Sitzung zurück. Der Parser wurde mit synthetischen Beispielen für RAAS und AAS geprüft; eine echte AAS-Logzeile und ein Live-Test auf dem Ziel-PC stehen aus. Erkannte Layer können im vorhandenen Katalog fehlen; in diesem Fall zeigt die App unbekannte Fahrzeugdaten und startet keine Fahrzeug-Timer.

## Katalog und Grenzen

Der Offline-Katalog `src/data/squadmaps-catalog.json` wird aus den strukturierten, öffentlich geladenen SquadMaps-Daten erstellt. Es werden nur Faktenfelder für Kartenlayer, Team-/Fraktions-/Einheitsoptionen und MBT/MGS/IFV-Fahrzeuge übernommen; keine Grafiken oder Website-Komponenten. Die Quelldatei wird zur Laufzeit nicht geladen. Quelle, Abrufzeit, SHA-256, Layer-/Lineup-Zahlen und offene Abdeckung stehen im Katalog sowie in `src/data/squadmaps-coverage.json`. Nicht auflösbare Datensätze bleiben als Lücken ausgewiesen; ein leeres Fahrzeugfeld gilt nur dann als bekannt leer, wenn der Fahrzeugroster vollständig aufgelöst wurde. SquadMaps zeigt 26 Kartenübersichtskarten; Jensen's Range ist als einzige ohne Layerliste ausgewiesen. Die übrigen 25 Karten liefern AAS-/RAAS-Layer.

Zum Aktualisieren (Docker Desktop):

```powershell
# Wenn der optionale Match-Watcher aktiviert ist, beide Compose-Dateien angeben:
docker compose -f compose.yaml -f compose.match-detection.yaml --profile squadmaps-update run --rm squadmaps-updater
docker compose -f compose.yaml -f compose.match-detection.yaml up --build -d squadtimer

# Ohne Match-Watcher:
docker compose --profile squadmaps-update run --rm squadmaps-updater
docker compose up --build -d squadtimer
```

Der Updater folgt den aktuellen JavaScript-Dateireferenzen der normalen SquadMaps-Startseite und sucht eingebettete `JSON.parse`-JSON-Daten anhand ihres Schemas, nicht anhand eines dauerhaft festen Chunk-Namens. Er wertet JavaScript nicht aus. Struktur-/Coverage-Fehler brechen den Lauf ab; Änderungen der Fakten gegenüber dem bisherigen Katalog werden in `src/data/squadmaps-coverage.json` mit Vorher/Nachher-Werten ausgewiesen und blockieren keine legitimen Timer-Updates. Die letzte gültige Katalogdatei bleibt bei einem fehlgeschlagenen Import bestehen. Das Update verändert keine bereits lokal gespeicherten Runden. Beim Produktions-Build wird der Service-Worker-Cache-Schlüssel aus den gebauten App-Assets abgeleitet, sodass auch ein reines Katalogupdate einen neuen Cache erzeugt und alte Offline-App-Dateien ersetzt.

Quellenangabe: [SquadMaps](https://squadmaps.com/), nur sachliche Fahrzeug- und Layerdaten; keine Fahrzeugbilder oder sonstige Artwork-Daten übernommen. Die Lizenz- bzw. Weitergabebedingungen des Quellprojekts wurden nicht unabhängig geklärt; diese Attribution ist keine Lizenzzusage. Der aktuelle Katalog wurde gegen die Anvil-Referenz für beide Teams (GFI Armored: 2× T-62 · 10/20, 1× T-72S · 0/20, 2× BMP-1 · 0/10) geprüft. Künftige Abweichungen werden mit dem gespeicherten vorherigen Katalog verglichen und im Coverage-Bericht ausgegeben, nicht anhand dieser Zeiten blockiert. `Chora_AAS_v2` wird separat auf Layer-Erkennung geprüft.

Die Erstspawn-Zeiten verwenden die manuell erfasste Staging-Endzeit als Nullpunkt; diese Beziehung muss im Spiel verifiziert werden. Mögliche Verfügbarkeit ist eine Modellrechnung aus Meldungen und keine Sichtung. Browser-Offline-Smoke und echte iOS-/Android-Installation müssen auf Zielgeräten geprüft werden.

## Timer-Piktogramme

Die drei lokalen Fahrzeug-Piktogramme (`Tank_vehicle_icon.webp`, `Mgs_vehicle_icon.webp`, `Trackedifv_vehicle_icon.webp`) wurden vom Nutzer bereitgestellt und werden von Vite inline in das App-Bundle eingebettet, damit sie auch nach einem Kaltstart offline verfügbar sind. Zuordnung: MBT → Tank, MGS → Mgs, IFV → Trackedifv. Die Herkunft als Squad-Bildmaterial ist bekannt; Lizenz- und Weitergaberechte wurden nicht verifiziert. Diese Dokumentation stellt keine Rechtefreigabe dar.
