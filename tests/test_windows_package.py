import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WindowsPackageTests(unittest.TestCase):
    def test_release_compose_uses_versioned_images_and_loopback(self):
        compose = (ROOT / "distribution" / "compose.yaml").read_text()
        self.assertIn("ghcr.io/buzzibaer/squadtimer:${SQUADTIMER_VERSION}", compose)
        self.assertIn("127.0.0.1:8080:80", compose)
        self.assertNotIn("build:", compose)

    def test_release_compose_has_profiled_watcher_and_safe_fallback_interpolation(self):
        compose = (ROOT / "distribution" / "compose.yaml").read_text()
        self.assertIn("profiles: [watcher]", compose)
        self.assertIn("ghcr.io/buzzibaer/squadtimer-watcher:${SQUADTIMER_VERSION}", compose)
        self.assertIn("source: ${SQUADTIMER_LOG_DIR:-./unused-logs}", compose)
        self.assertIn("read_only: true", compose)
        self.assertNotIn("compose.match-detection.yaml", compose)
        launcher = (ROOT / "distribution" / "start.ps1").read_text()
        self.assertIn("SquadGame\\Saved\\Logs", launcher)
        self.assertIn("SQUADTIMER_LOG_DIR", launcher)
        self.assertIn("--profile", launcher)
        self.assertNotIn("Read-Host", launcher)
        self.assertNotIn("watcher-enabled", launcher)
        stop = (ROOT / "distribution" / "stop.ps1").read_text()
        self.assertNotIn("SQUADTIMER_LOG_DIR", stop)
        self.assertIn("--remove-orphans", stop)

    def test_user_package_has_launcher_stop_guide_and_packager(self):
        for relative in (
            "distribution/SquadTimer starten.cmd",
            "distribution/SquadTimer stoppen.cmd",
            "distribution/Kurzanleitung.txt",
            "scripts/package-windows.ps1",
        ):
            with self.subTest(path=relative):
                self.assertTrue((ROOT / relative).is_file())

    def test_startup_checks_its_own_compose_project_before_accepting_a_busy_port(self):
        launcher = (ROOT / "distribution" / "start.ps1").read_text()
        self.assertIn("& docker compose @compose", launcher)
        self.assertLess(launcher.index("SQUADTIMER_VERSION"), launcher.index("$listener.Start()"))

    def test_startup_explains_registry_pull_failures(self):
        launcher = (ROOT / "distribution" / "start.ps1").read_text()
        self.assertIn("GHCR-Anmeldung und Paket-Zugriff", launcher)

    def test_release_images_copy_watcher_package_without_source_mount(self):
        dockerfile = (ROOT / "watcher" / "Dockerfile").read_text()
        self.assertIn("COPY watcher/", dockerfile)
        self.assertIn("python:3.12-alpine", dockerfile)

    def test_github_publishing_is_manual_and_attaches_windows_package(self):
        workflow = (ROOT / ".github" / "workflows" / "release-images.yml").read_text()
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("SquadTimer-${{ inputs.version }}-windows.zip", workflow)
        self.assertIn("softprops/action-gh-release", workflow)


if __name__ == "__main__":
    unittest.main()
