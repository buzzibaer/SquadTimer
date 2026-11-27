# SquadTimer V1

SquadTimer ist eine deutschsprachige, installierbare Web-App für Handy, Tablet und PC. Sie zeigt, wann gegnerische Fahrzeuge in Squad erstmals spawnen oder nach einem gemeldeten Abschuss wieder verfügbar sein könnten.

SquadTimer wurde mit KI-Unterstützung entwickelt.

**Du möchtest SquadTimer einfach benutzen?** Zur [Windows-Installation Schritt für Schritt](INSTALLATION.md) und zum [fertigen Download](https://github.com/buzzibaer/SquadTimer/releases/latest).

## Architektur und Funktionsweise

```text
SquadMaps → Katalog-Updater → Fahrzeugkatalog → Vite-Build → NGINX → Browser
Squad-Clientlog → optionaler Python-Logleser → /api/status ────────→ Browser
                                                                     ↕
                                                              Lokale Rundendaten
```

| Baustein | Aufgabe |
| --- | --- |
| [Web-App](src/main.ts) | TypeScript-Oberfläche für die Rundenauswahl, den Fahrzeugstatus und die manuelle Erfassung von Abschüssen. Docker baut die statische App mit Vite und liefert sie über NGINX aus. |
| [Timerlogik](src/tracker.ts) und [Rundenspeicher](src/storage.ts) | Die Runde speichert eine Kopie der gewählten Fahrzeugaufstellung, den Zeitbezug und die Abschussmeldungen im Browser (`localStorage`). Die Timerlogik berechnet aus den absoluten Zeitpunkten, was jetzt noch aussteht. Ein Katalogupdate ändert keine gespeicherte Runde. |
| [Katalog-Updater](scripts/import-squadmaps.js) | Liest Fahrzeugdaten für AAS und RAAS aus SquadMaps, prüft sie und schreibt den Offline-Katalog. Ein neuer App-Build übernimmt den Katalog. Beim Spielen fragt der Browser SquadMaps dafür nicht ab. |
| [Optionaler Logleser](watcher/server.py) | Liest das lokale Squad-Clientlog und liefert der App über `/api/status` erkannte Layer und Statusinformationen. Die App schlägt den Layer vor; die gegnerische Aufstellung und der Rundenstart werden weiterhin manuell bestätigt. |
| [Service Worker](public/sw.js) | Speichert die gebauten App-Dateien samt Fahrzeugkatalog für die Offline-Nutzung. Der optionale Live-Status wird nicht gecacht. |

**So entstehen die Timer:** Du wählst vor der Runde Karte, Layer und gegnerische Aufstellung. Beim Einstieg **ab Staging-Ende** berechnet die App die Erstspawns aus dem angegebenen Zeitpunkt. Beim **Beitritt zu einer laufenden Runde** bleibt die Ausgangslage unbekannt; eine optional nachgetragene Staging-Endzeit hilft nur bei noch ausstehenden Erstspawns. Jeder gültige gemeldete Abschuss bekommt einen eigenen Respawn-Timer. Ist der Fahrzeugtyp unbekannt, zeigt die App mögliche Zeiten in derselben Zeile und bei Bedarf eine Spanne für die verfügbare Anzahl. Abgelaufene Meldungen wandern in den Verlauf und bleiben korrigierbar.

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

Standardmäßig ist keine Logdatei eingebunden und es läuft kein Erkennungsdienst. Der optionale Logleser erkennt den Layer beim Beitritt oder nach abgeschlossenem Kartenwechsel (`SeamlessTravel`). Er gibt nur normalisierte Felder weiter: Layer, Verbindungsstatus, Ereignis-ID und Zeitstempel sowie, wenn erkennbar, Abstimmungs- oder Ladephase und Spielversion. Die Rohzeilen bleiben lokal. Die Erkennung liefert **keine Fahrzeugdaten**. Team, Fraktion, Einheit und „Staging beendet“ bleiben manuell zu prüfen oder zu setzen.

In PowerShell im Projektverzeichnis:

```powershell
$env:LOCALAPPDATA = [Environment]::GetFolderPath('LocalApplicationData')
docker compose -f compose.yaml -f compose.match-detection.yaml up --build -d
```

Der Watcher mountet nur `$env:LOCALAPPDATA\SquadGame\Saved\Logs` und ausschließlich read-only. Ist der Ordner nicht vorhanden, bleibt die optionale Erkennung inaktiv. Standardstart und Loopback-Bindung `127.0.0.1:8080` bleiben unverändert. Für abweichende Log-Ordner muss der Volume-Pfad in `compose.match-detection.yaml` bewusst angepasst werden. Beenden:

```powershell
docker compose -f compose.yaml -f compose.match-detection.yaml down
```

Beim Start liest der Logleser den vorhandenen Inhalt von `SquadGame.log`, meldet daraus aber erst einen Live-Status, wenn die Datei weitergeschrieben wird. Er ignoriert Sicherungslogs. Wird die Datei ersetzt oder gekürzt, setzt er den bisherigen Status zurück. Fehlt eine Fahrzeugaufstellung im Katalog, meldet die App das ausdrücklich und startet dafür keine Fahrzeug-Timer.

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

## Windows-Benutzerpaket

Für den lokalen PC-Betrieb gibt es ein ZIP ohne Quellcode-, Node- oder Build-Abhängigkeit: Docker Desktop (Linux-Container) ist die einzige Voraussetzung. ZIP entpacken und `SquadTimer starten.cmd` ausführen; die App öffnet nach dem Start unter <http://127.0.0.1:8080>. `SquadTimer stoppen.cmd` beendet ausschließlich den benannten SquadTimer-Release-Stack. Ist `%LOCALAPPDATA%\SquadGame\Saved\Logs` vorhanden, startet die optionale Match-Erkennung automatisch und bindet diesen Ordner nur lesend ein. Fehlt der Ordner, läuft die App manuell und prüft beim nächsten Start erneut.

Der [öffentliche Windows-Download](https://github.com/buzzibaer/SquadTimer/releases/latest) enthält beide Docker-Images. Der Starter importiert sie bei Bedarf direkt aus dem Paket; dafür ist keine GitHub-Anmeldung nötig.

Für einen lokalen Build des ZIPs mit mitgelieferten Images zuerst App und Logleser mit den in `distribution/compose.yaml` angegebenen Image-Namen und der gewünschten Version bauen. Dann `scripts/package-windows.ps1 -Version 0.1.0 -IncludeImages` ausführen. Der manuelle Workflow „Build and publish release images“ ist für separate, registrygestützte Releases im Quellcode-Repository gedacht. Paketerstellung prüfen: `py -3 -m unittest tests.test_windows_package -v`.
