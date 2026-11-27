"""Small, stateful parser for sanitized Squad rotation status."""

import re
import uuid
from datetime import datetime, timezone


_MAP_PATH = re.compile(
    r"(?:/Game/Maps/([^/\s?]+)|/([^/\s?]+)/Maps)/Gameplay_Layers/([^/\s?]+)",
    re.I,
)
_LEVEL = re.compile(r"\bLevel:\s*(.*?)(?:,\s*Game:|\s*\))", re.I)
_SAFE = re.compile(r"^[A-Za-z0-9_]+$")
_UNREAL_PREFIX = re.compile(r"^\[\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3}\]\[\d+\]")
_BUILD_VERSION = re.compile(r"^LogInit: Build: [0-9.]+//Squad/(v[0-9A-Za-z_.-]+)$")
_ALIASES = {
    "GooseBay": "Goose Bay",
    "Fallujah": "Fallujah",
    "Harju": "Harju",
    "Anvil": "Anvil",
}


def _label(name):
    if not _SAFE.fullmatch(name):
        return None
    return _ALIASES.get(name, name.replace("_", " ").title())


def _normalized_layer(map_name, layer_code):
    map_label = _label(map_name)
    layer_match = re.fullmatch(r"[A-Za-z0-9_]+_(AAS|RAAS)_v([0-9]+)", layer_code, re.I)
    if not map_label or not layer_match:
        return None
    mode, version = layer_match.groups()
    return f"{map_label} · {mode.upper()} v{version}"


def _layer_from_path(text):
    match = _MAP_PATH.search(text)
    if not match:
        return None
    map_name = match.group(1) or match.group(2)
    return _normalized_layer(map_name, match.group(3))


class LogParser:
    def __init__(self, connected=False):
        self.connected = connected
        self.pending = None
        self.travel_pending = False
        self.welcomed = False
        self.status = {
            "layer": None,
            "connection": "connected" if connected else "disconnected",
            "eventId": None,
            "at": None,
            "phase": None,
            "version": None,
        }

    def _event(self, layer=None, connection=None, rotation=False, phase=None):
        self.status = {
            "layer": self.status["layer"] if layer is None and phase == "loading" else layer,
            "connection": connection or ("connected" if self.connected else "disconnected"),
            "eventId": str(uuid.uuid4()) if rotation else self.status["eventId"],
            "at": datetime.now(timezone.utc).isoformat() if rotation else self.status["at"],
            "phase": phase,
            "version": self.status["version"],
        }
        return dict(self.status)

    def feed(self, line):
        # Only recognize specific game-owned event signatures; never retain line content.
        line = _UNREAL_PREFIX.sub("", line, count=1)
        build = _BUILD_VERSION.fullmatch(line)
        if build:
            self.status["version"] = build.group(1)
            return dict(self.status)
        if line.startswith("LogSquad: Start new vote "):
            marker = line[len("LogSquad: Start new vote "):]
            if marker == "Vote_NextLayer":
                return self._event(self.status["layer"], phase="map_vote")
            if marker in ("Vote_Faction_0", "Vote_Faction_1"):
                return self._event(self.status["layer"], phase="faction_vote")
        if line.startswith("LogSquad: Cleanup vote"):
            return self._event(self.status["layer"], phase="loading" if self.status["phase"] == "loading" else None)
        if line.startswith("LogWorld: SeamlessTravel to:"):
            self.pending = _layer_from_path(line)
            self.travel_pending = True
            return self._event(self.status["layer"], phase="loading")
        if line.startswith("LogWorld: ----SeamlessTravel finished") and self.travel_pending:
            layer, self.pending = self.pending, None
            self.travel_pending = False
            if layer is None:
                return self._event(self.status["layer"], "connected")
            self.connected = True
            return self._event(layer, "connected", rotation=True)
        if line.startswith("LogLoad: LoadMap:") and re.search(r"/(?:EntryMap|Entry)\b", line, re.I):
            self.pending = None
            self.travel_pending = False
            self.connected = False
            self.welcomed = False
            self.pending = None
            self.travel_pending = False
            return self._event(None, "disconnected")
        if line.startswith("LogLoad: LoadMap:") and self.welcomed:
            layer = _layer_from_path(line)
            if layer:
                self.connected = True
                duplicate = self.status["connection"] == "connected" and self.status["layer"] == layer
                return self._event(layer, "connected", rotation=not duplicate)
        if any(marker in line for marker in ("LogExit: Exit", "LogNet: UNetConnection::Close")):
            self.pending = None
            self.connected = False
            self.welcomed = False
            return self._event(self.status["layer"], "disconnected")
        if line.startswith("LogNet: Welcomed by server"):
            self.connected = True
            self.welcomed = True
            level = _LEVEL.search(line)
            layer = _layer_from_path(level.group(1)) if level else None
            duplicate = layer and self.status["connection"] == "connected" and self.status["layer"] == layer
            return self._event(layer or self.status["layer"], "connected", rotation=bool(layer and not duplicate))
        return None

    def snapshot(self):
        return dict(self.status)
