import os
import tempfile
import unittest

from watcher import server
from watcher.log_parser import LogParser


class WatcherBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.log_dir = self.temp.name
        self.path = os.path.join(self.log_dir, "SquadGame.log")
        self.reset()

    def tearDown(self):
        self.temp.cleanup()

    def reset(self):
        server.LOG_DIR = self.log_dir
        server.parser = LogParser()
        server.cursor_path = server.cursor_inode = None
        server.cursor_size = 0
        server.partial = b""
        server.bootstrap_size = server.bootstrap_parser = None

    def test_replay_bootstraps_only_after_canonical_file_grows(self):
        with open(self.path, "wb") as log:
            log.write(
                b"LogNet: Welcomed by server (Level: /Game/Maps/Chora/Gameplay_Layers/Chora_AAS_v2, Game: private)\n"
            )
            log.write(b"LogLoad: LoadMap: /Game/Maps/Chora/Gameplay_Layers/Chora_AAS_v2\n")
        server.poll_logs()
        self.assertIsNone(server.parser.snapshot()["layer"])
        with open(self.path, "ab") as log:
            log.write(b"LogNet: Welcomed by server\n")
        server.poll_logs()
        self.assertEqual(server.parser.snapshot()["layer"], "Chora · AAS v2")
        self.assertEqual(server.parser.snapshot()["connection"], "connected")

    def test_reset_clears_active_state_and_backups_are_ignored(self):
        with open(os.path.join(self.log_dir, "SquadGame-backup.log"), "wb") as log:
            log.write(b"LogNet: Welcomed by server (Level: /Game/Maps/Harju/Gameplay_Layers/Harju_RAAS_v1, Game: private)\n")
        server.poll_logs()
        self.assertIsNone(server.parser.snapshot()["layer"])
        with open(self.path, "wb") as log:
            log.write(b"LogNet: Welcomed by server (Level: /Game/Maps/Chora/Gameplay_Layers/Chora_AAS_v2, Game: private)\n")
        server.poll_logs()
        with open(self.path, "wb") as log:
            log.write(b"LogLoad: LoadMap: /Game/Maps/EntryMap\n")
        server.poll_logs()
        self.assertIsNone(server.parser.snapshot()["layer"])
        self.assertEqual(server.parser.snapshot()["connection"], "disconnected")


if __name__ == "__main__":
    unittest.main()
