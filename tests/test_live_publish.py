from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from src.iran_monitor.live_publish import (
    AI_FILENAME,
    LAST_UPDATED_FILENAME,
    LEGACY_FILENAME,
    LATEST_FILENAME,
    LITE_FILENAME,
    VERSION_DIRNAME,
    parse_version,
    prune_old_versions,
    publish_ai_bundle,
    publish_lite_bundle,
)


def sample_snapshot() -> dict:
    return {
        "state_ts": "2026-03-06T09:27:22+04:00",
        "status": "degraded",
        "source_health": {"tier0_demo": {"ok": True}},
        "degraded": True,
        "flags": ["SOURCE_DEGRADED"],
        "intel_feed": [{"id": "feed-1", "text": "demo"}],
        "indicators": [{"id": "I01", "name": "demo", "state": 0.8, "tier": "TIER0"}],
        "hypotheses": [{"id": "H2", "name": "prepare", "score": 0.9}],
        "routes": [{"id": "A", "name": "route-a", "status": "OPEN", "base_h": 3.5, "cong": 0.1}],
        "checklist": [{"id": 1, "text": "demo", "done": False}],
    }


class LivePublishTests(unittest.TestCase):
    def test_publish_lite_and_ai_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            live_root = Path(tmp) / "live"
            version = "2026-03-06T05-27-22Z"
            snapshot = sample_snapshot()

            latest = publish_lite_bundle(
                live_root=live_root,
                snapshot=snapshot,
                version=version,
                collected_at="2026-03-06T05:27:40Z",
                health={"last_lite_success_at": "2026-03-06T09:27:22+04:00"},
            )
            self.assertEqual(latest["version"], version)
            self.assertEqual(latest["schemaVersion"], "2025.10")
            self.assertEqual(latest["status"]["ai"], "pending")
            self.assertTrue((live_root / LATEST_FILENAME).exists())
            self.assertTrue((live_root / VERSION_DIRNAME / version / LITE_FILENAME).exists())
            self.assertTrue((live_root / VERSION_DIRNAME / version / f"{LITE_FILENAME}.sha256").exists())
            self.assertTrue((live_root / VERSION_DIRNAME / version / f"{LITE_FILENAME}.sig").exists())
            self.assertIn("integrity", latest)
            self.assertIn("provenance", latest)

            compat_payload = json.loads((live_root / LEGACY_FILENAME).read_text(encoding="utf-8"))
            self.assertNotIn("ai_analysis", compat_payload)
            self.assertEqual(compat_payload["schemaVersion"], "2025.10")
            self.assertEqual(compat_payload["version"], version)
            self.assertEqual(compat_payload["generatedAt"], "2026-03-06T05:27:40Z")

            ai_payload = {
                "threat_level": "LOW",
                "threat_score": 20,
                "sentiment": "일반",
                "abu_dhabi_level": "LOW",
                "dubai_level": "LOW",
                "summary": "fallback",
                "recommended_action": "watch",
                "key_points": ["demo"],
                "analysis_source": "fallback",
                "notebook_url": None,
                "updated_at": "2026-03-06T09:29:00+04:00",
            }
            latest = publish_ai_bundle(
                live_root=live_root,
                snapshot=snapshot,
                version=version,
                ai_analysis=ai_payload,
                ai_updated_at="2026-03-06T05:29:00Z",
                health={"last_ai_success_at": "2026-03-06T09:29:00+04:00"},
            )

            self.assertEqual(latest["status"]["ai"], "ok")
            self.assertEqual(latest["aiVersion"], "2026-03-06T05:29:00Z")
            self.assertTrue((live_root / VERSION_DIRNAME / version / AI_FILENAME).exists())
            self.assertTrue((live_root / VERSION_DIRNAME / version / f"{AI_FILENAME}.sha256").exists())
            self.assertTrue((live_root / VERSION_DIRNAME / version / f"{AI_FILENAME}.sig").exists())
            ai_file = json.loads((live_root / VERSION_DIRNAME / version / AI_FILENAME).read_text(encoding="utf-8"))
            self.assertEqual(ai_file["schemaVersion"], "2025.10")
            self.assertEqual(ai_file["version"], version)
            self.assertEqual(ai_file["generatedAt"], "2026-03-06T05:29:00Z")

            compat_payload = json.loads((live_root / LEGACY_FILENAME).read_text(encoding="utf-8"))
            self.assertIn("ai_analysis", compat_payload)
            self.assertEqual(compat_payload["ai_analysis"]["summary"], "fallback")
            self.assertEqual(compat_payload["schemaVersion"], "2025.10")

            last_updated = json.loads((live_root / LAST_UPDATED_FILENAME).read_text(encoding="utf-8"))
            self.assertEqual(last_updated["version"], version)
            self.assertEqual(last_updated["ai_version"], "2026-03-06T05:29:00Z")
            self.assertIn("ai", latest["integrity"])

    def test_prune_old_versions_keeps_recent_directories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            live_root = Path(tmp) / "live"
            version_root = live_root / VERSION_DIRNAME
            old_dir = version_root / "2026-02-20T00-00-00Z"
            keep_dir = version_root / "2026-03-05T00-00-00Z"
            invalid_dir = version_root / "manual"
            old_dir.mkdir(parents=True)
            keep_dir.mkdir(parents=True)
            invalid_dir.mkdir(parents=True)

            removed = prune_old_versions(
                live_root,
                keep_days=7,
                now=datetime(2026, 3, 10, 0, 0, tzinfo=timezone.utc),
            )

            self.assertEqual(removed, ["2026-02-20T00-00-00Z"])
            self.assertFalse(old_dir.exists())
            self.assertTrue(keep_dir.exists())
            self.assertTrue(invalid_dir.exists())
            self.assertIsNotNone(parse_version("2026-03-05T00-00-00Z"))


if __name__ == "__main__":
    unittest.main()
