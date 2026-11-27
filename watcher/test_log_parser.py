import unittest

from watcher.log_parser import LogParser


class LogParserTests(unittest.TestCase):
    def test_vote_phase_signals_and_cleanup_are_transient_and_sanitized(self):
        parser = LogParser(connected=True)
        for marker, phase in [
            ("Vote_NextLayer", "map_vote"),
            ("Vote_Faction_0", "faction_vote"),
            ("Vote_Faction_1", "faction_vote"),
        ]:
            event = parser.feed(f"[2026.11.24-17.02.42:981][445]LogSquad: Start new vote {marker}")
            self.assertEqual(event["phase"], phase)
            self.assertNotIn("raw", event)
        cleared = parser.feed("LogSquad: Cleanup vote")
        self.assertIsNone(cleared["phase"])

    def test_travel_preserves_layer_then_reports_loading_until_completion(self):
        parser = LogParser(connected=True)
        parser.feed("LogWorld: SeamlessTravel to: /Game/Maps/Harju/Gameplay_Layers/Harju_RAAS_v1")
        self.assertEqual(parser.snapshot()["layer"], None)
        self.assertEqual(parser.snapshot()["phase"], "loading")
        disconnected = parser.feed("LogNet: UNetConnection::Close")
        self.assertIsNone(disconnected["phase"])

    def test_unrecognized_travel_still_clears_loading_when_it_finishes(self):
        parser = LogParser(connected=True)
        parser.feed("LogWorld: SeamlessTravel to: unknown destination")
        finished = parser.feed("LogWorld: ----SeamlessTravel finished in 2 seconds ------")
        self.assertIsNone(finished["phase"])
        self.assertIsNone(finished["layer"])

    def test_build_version_is_sanitized_and_menu_clears_phase(self):
        parser = LogParser(connected=True)
        parser.feed("LogWorld: SeamlessTravel to: /Game/Maps/Harju/Gameplay_Layers/Harju_RAAS_v1")
        parser.feed("LogWorld: ----SeamlessTravel finished in 1 seconds ------")
        event = parser.feed("LogInit: Build: 698493.3268.//Squad/v10.6.3_Hotfix6")
        self.assertEqual(event["version"], "v10.6.3_Hotfix6")
        parser.feed("LogSquad: Start new vote Vote_NextLayer")
        event = parser.feed("LogLoad: LoadMap: /Game/Maps/EntryMap")
        self.assertIsNone(event["phase"])
        self.assertIsNone(event["layer"])

    def test_emits_layer_only_after_seamless_travel_finishes(self):
        parser = LogParser()
        self.assertEqual(parser.feed("LogWorld: SeamlessTravel to: /Game/Maps/GooseBay/Gameplay_Layers/GooseBay_RAAS_v1")["phase"], "loading")
        event = parser.feed("LogWorld: ----SeamlessTravel finished in 12.3 seconds ------")
        self.assertEqual(event["layer"], "Goose Bay · RAAS v1")
        self.assertEqual(event["connection"], "connected")
        self.assertNotIn("raw", event)
        rotation_id = event["eventId"]
        welcomed = parser.feed("LogNet: Welcomed by server")
        self.assertEqual(welcomed["layer"], "Goose Bay · RAAS v1")
        self.assertEqual(welcomed["eventId"], rotation_id)

    def test_does_not_publish_startup_or_browser_layers(self):
        parser = LogParser()
        startup = parser.feed("LogLoad: LoadMap: /Game/Maps/EntryMap")
        self.assertIsNone(startup["layer"])
        self.assertIsNone(parser.feed("Server browser: Harju_RAAS_v1"))
        self.assertEqual(parser.feed("LogWorld: SeamlessTravel to: /Game/Maps/Fallujah/Gameplay_Layers/Fallujah_RAAS_v2")["phase"], "loading")
        event = parser.feed("LogWorld: ----SeamlessTravel finished in 9 seconds ------")
        self.assertEqual(event["layer"], "Fallujah · RAAS v2")

    def test_initial_session_map_is_detected_only_after_server_welcome(self):
        parser = LogParser()
        line = "LogLoad: LoadMap: /Game/Maps/Fallujah/Gameplay_Layers/Fallujah_RAAS_v2"
        self.assertIsNone(parser.feed(line))
        parser.feed("LogNet: Welcomed by server")
        event = parser.feed(line)
        self.assertEqual(event["layer"], "Fallujah · RAAS v2")
        self.assertEqual(event["connection"], "connected")

    def test_chora_welcome_and_host_prefixed_load_map_are_normalized_without_url_data(self):
        parser = LogParser()
        welcome = (
            "LogNet: Welcomed by server (Level: /Game/Maps/Chora/Gameplay_Layers/Chora_AAS_v2, "
            "Game: /Game/Gameplay/GameModes/BP_GameMode_AAS.BP_GameMode_AAS_C)"
        )
        event = parser.feed(welcome)
        self.assertEqual(event["layer"], "Chora · AAS v2")
        rotation_id = event["eventId"]

        parser.feed("LogSquad: OnPreLoadMap: Succeeded determining Level: Chora / Layer: Chora AAS v2")
        duplicate = parser.feed(
            "LogLoad: LoadMap: 192.0.2.1:7787/Game/Maps/Chora/Gameplay_Layers/Chora_AAS_v2?options"
        )
        self.assertEqual(duplicate["layer"], "Chora · AAS v2")
        self.assertEqual(duplicate["eventId"], rotation_id)
        self.assertEqual(set(duplicate), {"layer", "connection", "eventId", "at", "phase", "version"})
        self.assertNotIn("192.0.2.1", str(duplicate))
        self.assertNotIn("options", str(duplicate))

    def test_alternate_map_root_path_emits_only_after_travel_finishes(self):
        parser = LogParser()
        self.assertEqual(parser.feed("LogWorld: SeamlessTravel to: /Harju/Maps/Gameplay_Layers/Harju_RAAS_v2")["phase"], "loading")
        event = parser.feed("LogWorld: ----SeamlessTravel finished in 3 seconds ------")
        self.assertEqual(event["layer"], "Harju · RAAS v2")

    def test_supports_aas_and_sanitizes_unknown_maps(self):
        parser = LogParser()
        parser.feed("LogWorld: SeamlessTravel to: /Game/Maps/Unknown_Map/Gameplay_Layers/Unknown_Map_AAS_v3")
        event = parser.feed("LogWorld: ----SeamlessTravel finished in 1 seconds ------")
        self.assertEqual(event["layer"], "Unknown Map · AAS v3")

    def test_connection_close_does_not_end_a_rotation(self):
        parser = LogParser()
        parser.feed("LogWorld: SeamlessTravel to: /Game/Maps/Harju/Gameplay_Layers/Harju_RAAS_v1")
        rotation = parser.feed("LogWorld: ----SeamlessTravel finished in 1 seconds ------")
        closed = parser.feed("LogNet: UNetConnection::Close")
        self.assertEqual(closed["eventId"], rotation["eventId"])
        self.assertEqual(closed["connection"], "disconnected")

    def test_entry_map_and_shutdown_only_change_connection_status(self):
        parser = LogParser(connected=True)
        before = parser.snapshot()
        event = parser.feed("LogLoad: LoadMap: /Game/Maps/EntryMap")
        self.assertEqual(event["connection"], "disconnected")
        self.assertIsNone(event["layer"])
        self.assertEqual(event["eventId"], before["eventId"])

    def test_unreal_timestamp_prefixes_are_ignored_for_join_travel_menu_and_close(self):
        parser = LogParser()
        prefix = "[2026.11.24-17.02.42:981][445]"
        welcomed = parser.feed(
            f"{prefix}LogNet: Welcomed by server (Level: /Al_Basrah/Maps/Gameplay_Layers/AlBasrah_AAS_v2, Game: private)"
        )
        self.assertEqual(welcomed["layer"], "Al Basrah · AAS v2")
        rotation_id = welcomed["eventId"]
        loaded = parser.feed(
            "[2026.11.24-17.02.43:005][445]LogLoad: LoadMap: 192.0.2.1:7787/Al_Basrah/Maps/Gameplay_Layers/AlBasrah_AAS_v2?dummy=1"
        )
        self.assertEqual(loaded["eventId"], rotation_id)
        self.assertEqual(loaded["connection"], "connected")
        self.assertNotIn("192.0.2.1", str(loaded))
        menu = parser.feed("[2026.11.24-17.03.00:000][445]LogLoad: LoadMap: /Game/Maps/EntryMap")
        self.assertIsNone(menu["layer"])
        self.assertEqual(menu["connection"], "disconnected")
        parser.feed(
            f"{prefix}LogWorld: SeamlessTravel to: /Game/Maps/Harju/Gameplay_Layers/Harju_RAAS_v1"
        )
        travel = parser.feed(f"{prefix}LogWorld: ----SeamlessTravel finished in 1 seconds ------")
        self.assertEqual(travel["layer"], "Harju · RAAS v1")
        parser.feed(f"{prefix}LogNet: Welcomed by server")
        closed = parser.feed(f"{prefix}LogNet: UNetConnection::Close")
        self.assertEqual(closed["connection"], "disconnected")


if __name__ == "__main__":
    unittest.main()
