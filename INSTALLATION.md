# SquadTimer unter Windows installieren

SquadTimer läuft auf dem PC, auf dem du Squad spielst. Du startest es per Doppelklick und verwendest es im Browser.

> **Voraussetzung: Docker Desktop für Windows muss installiert sein und laufen.** [Docker Desktop für Windows (x86_64) herunterladen – offizielle Docker-Seite](https://docs.docker.com/desktop/setup/install/windows-install/).

## Was du vorher brauchst

- **Einen Windows-PC mit x64-Prozessor.** Wähle auf der Docker-Seite den Download **„Docker Desktop for Windows – x86_64“** und führe die Installationsdatei aus. Folge den Hinweisen zu WSL 2 und einem Neustart, falls der Installer sie anzeigt. Lass Docker Desktop im Standardmodus für Linux-Container laufen.
- **Internet zum Herunterladen des ZIPs.** Die fertigen Docker-Images sind im ZIP enthalten. Du brauchst weder ein GitHub-Konto noch eine Anmeldung bei einer Docker-Registry.
- **Einen freien lokalen Port 8080.** Wenn dort bereits eine andere Anwendung läuft, meldet der Starter das. Squad selbst muss zum Starten von SquadTimer nicht geöffnet sein.

## Schritt für Schritt

1. **Docker Desktop öffnen.** Warte, bis Docker Desktop gestartet und die Engine bereit ist.
2. **SquadTimer herunterladen.** Öffne die [Download-Seite](https://github.com/buzzibaer/SquadTimer/releases/latest). Klicke unter **Assets** auf die Datei `SquadTimer-…-windows.zip`. Die Einträge **Source code** sind für Entwickler und werden hier nicht benötigt.
3. **Das ZIP vollständig entpacken.** Klicke im Datei-Explorer mit der rechten Maustaste auf das ZIP und wähle **Alle extrahieren…**. Öffne danach den entpackten Ordner. Lass die Dateien zusammen.
4. **SquadTimer starten.** Doppelklicke im entpackten Ordner auf **`SquadTimer starten.cmd`**. Beim ersten Start importiert Docker die mitgelieferten Images. Lass das Startfenster offen, bis der Browser aufgeht.
5. **Im Browser loslegen.** SquadTimer öffnet sich unter **<http://127.0.0.1:8080>**. Falls kein Browserfenster aufgeht, gib die Adresse selbst in deinen Browser ein.

## Karte auswählen und Runde erfassen

- **Automatisch:** Ist der Squad-Logordner auf diesem PC vorhanden, startet die Match-Erkennung mit. Wenn SquadTimer einen Layer erkennt, klicke auf **„Erkanntes Match öffnen“**. Wähle dann die gegnerische Aufstellung.
- **Manuell:** Ohne Logordner oder erkannten Layer wählst du Karte, Layer und gegnerische Aufstellung selbst. Falls Squad den Logordner erst später anlegt, starte SquadTimer erneut. Der Logleser greift nur lesend auf den Ordner zu.
- Wähle **„Ab Staging-Ende tracken“** für eine Runde, deren Staging-Ende du kennst, oder **„Laufender Runde beitreten“**, wenn du später dazukommst.

## Beenden und aktualisieren

- **Beenden:** Doppelklicke auf **`SquadTimer stoppen.cmd`**. Das schließt die SquadTimer-Dienste. Den Browser-Tab kannst du danach schließen. Deine Runde bleibt im selben Browserprofil gespeichert.
- **Aktualisieren:** Lade das neue Windows-ZIP von der Download-Seite, entpacke es vollständig in einen neuen Ordner und starte SquadTimer daraus. Verwende weiterhin dieselbe Browser-Adresse und dasselbe Browserprofil.

## Wenn etwas nicht klappt

| Was du siehst | Was du tun kannst |
| --- | --- |
| Docker Desktop fehlt oder ist nicht erreichbar | Docker Desktop installieren bzw. öffnen, warten, bis es bereit ist, und `SquadTimer starten.cmd` erneut öffnen. |
| Port 8080 ist belegt | Wenn dort eine andere SquadTimer-Installation läuft, stoppe sie zuerst. Beende andere Programme nur, wenn du weißt, welches den Port belegt. Starte SquadTimer danach erneut. |
| Der Browser öffnet sich nicht | Öffne <http://127.0.0.1:8080> von Hand. Bei einer Fehlermeldung im Startfenster ist zuerst diese zu beheben. |
| Kein Match wird erkannt | Stelle sicher, dass Squad auf demselben PC läuft. Wurde das Spiel gerade zum ersten Mal gestartet, starte auch SquadTimer erneut. Du kannst den Layer jederzeit manuell auswählen. |
