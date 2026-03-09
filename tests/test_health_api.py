from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.iran_monitor import health as health_mod
from src.iran_monitor.live_publish import publish_ai_bundle, publish_lite_bundle


def sample_snapshot() -> dict:
    return {
        "state_ts": "2026-03-06T09:27:22+04:00",
        "status": "ok",
        "source_health": {"tier0_demo": {"ok": True}},
        "degraded": False,
        "flags": [],
        "intel_feed": [{"id": "feed-1", "text": "demo"}],
        "indicators": [{"id": "I01", "name": "demo", "state": 0.2, "tier": "TIER0"}],
        "hypotheses": [{"id": "H0", "name": "normal", "score": 0.8}],
        "routes": [{"id": "A", "name": "route-a", "status": "OPEN", "base_h": 2.0, "cong": 0.0}],
        "checklist": [{"id": 1, "text": "demo", "done": False}],
    }


class HealthApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.live_root = root / "live"
        self.state_file = root / "state" / "hyie_state.json"
        self.health_file = root / ".health_state.json"
        self.egress_file = root / "state" / "egress_eta.json"

        snapshot = sample_snapshot()
        publish_lite_bundle(
            live_root=self.live_root,
            snapshot=snapshot,
            version="2026-03-06T05-27-22Z",
            collected_at="2026-03-06T05:27:40Z",
            health={"last_lite_success_at": "2026-03-06T09:27:22+04:00"},
        )
        publish_ai_bundle(
            live_root=self.live_root,
            snapshot=snapshot,
            version="2026-03-06T05-27-22Z",
            ai_analysis={
                "threat_level": "LOW",
                "threat_score": 10,
                "sentiment": "일반",
                "abu_dhabi_level": "LOW",
                "dubai_level": "LOW",
                "summary": "fallback",
                "recommended_action": "watch",
                "key_points": ["demo"],
                "analysis_source": "fallback",
                "updated_at": "2026-03-06T09:30:00+04:00",
            },
            ai_updated_at="2026-03-06T05:30:00Z",
            health={"last_ai_success_at": "2026-03-06T09:30:00+04:00"},
        )

        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps({"status": "warming_up"}), encoding="utf-8")
        self.health_file.write_text(
            json.dumps(
                {
                    "status": "ok",
                    "last_success_at": "2026-03-06T09:27:22+04:00",
                    "last_lite_success_at": "2026-03-06T09:27:22+04:00",
                    "last_ai_success_at": "2026-03-06T09:30:00+04:00",
                    "last_lite_duration_ms": 1200,
                    "last_ai_duration_ms": 4500,
                    "last_error_stage": None,
                    "stale_reason": None,
                    "counts": {"new_count": 1, "total_count": 3, "unique_count": 1},
                    "last_article_count": 1,
                    "source_health": {"tier0_demo": {"ok": True}},
                }
            ),
            encoding="utf-8",
        )

        self.patches = [
            patch.object(health_mod, "LIVE_ROOT", self.live_root),
            patch.object(health_mod, "HYIE_STATE_FILE", self.state_file),
            patch.object(health_mod, "HEALTH_STATE_FILE", self.health_file),
            patch.object(health_mod, "HYIE_EGRESS_ETA_FILE", self.egress_file),
            patch.object(health_mod.settings, "LIVE_AUTO_REFRESH_ENABLED", False),
        ]
        for patcher in self.patches:
            patcher.start()
        self.client = TestClient(health_mod.app)

    def tearDown(self) -> None:
        for patcher in reversed(self.patches):
            patcher.stop()
        self.tmp.cleanup()

    def test_health_endpoint_returns_split_stage_fields(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["last_success_at"], "2026-03-06T09:27:22+04:00")
        self.assertEqual(payload["last_lite_success_at"], "2026-03-06T09:27:22+04:00")
        self.assertEqual(payload["last_ai_success_at"], "2026-03-06T09:30:00+04:00")
        self.assertEqual(payload["last_lite_duration_ms"], 1200)
        self.assertEqual(payload["last_ai_duration_ms"], 4500)

    def test_live_endpoints_and_compat_state_use_live_bundle(self) -> None:
        latest = self.client.get("/api/live/latest")
        self.assertEqual(latest.status_code, 200)
        self.assertEqual(latest.json()["version"], "2026-03-06T05-27-22Z")
        self.assertEqual(latest.json()["schemaVersion"], "2025.10")

        lite = self.client.get("/api/live/v/2026-03-06T05-27-22Z/state-lite.json")
        self.assertEqual(lite.status_code, 200)
        self.assertEqual(lite.json()["status"], "ok")

        compat = self.client.get("/api/state")
        self.assertEqual(compat.status_code, 200)
        self.assertEqual(compat.json()["status"], "ok")
        self.assertIn("ai_analysis", compat.json())

    def test_live_latest_triggers_lite_refresh_when_bundle_is_stale(self) -> None:
        publish_lite_bundle(
            live_root=self.live_root,
            snapshot=sample_snapshot(),
            version="2026-03-06T00-00-00Z",
            collected_at="2026-03-06T00:00:00Z",
        )

        async def refresh_bundle(_reason: str) -> dict:
            publish_lite_bundle(
                live_root=self.live_root,
                snapshot=sample_snapshot(),
                version="2026-03-06T10-00-00Z",
                collected_at="2026-03-06T10:00:00Z",
            )
            return json.loads((self.live_root / "latest.json").read_text(encoding="utf-8"))

        with (
            patch.object(health_mod.settings, "LIVE_AUTO_REFRESH_ENABLED", True),
            patch.object(health_mod.settings, "LIVE_REFRESH_STALE_AFTER_SEC", 0),
            patch.object(health_mod, "_LIVE_REFRESH_LAST_ATTEMPT_AT", None),
            patch.object(health_mod, "_refresh_live_bundle", side_effect=refresh_bundle) as refresh_mock,
        ):
            response = self.client.get("/api/live/latest")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], "2026-03-06T10-00-00Z")
        self.assertEqual(refresh_mock.call_count, 1)

    def test_api_live_latest_returns_contract_error_when_schema_version_missing(self) -> None:
        latest_path = self.live_root / "latest.json"
        latest_payload = json.loads(latest_path.read_text(encoding="utf-8"))
        latest_payload.pop("schemaVersion", None)
        latest_path.write_text(json.dumps(latest_payload), encoding="utf-8")

        response = self.client.get("/api/live/latest")
        self.assertEqual(response.status_code, 502)
        body = response.json()
        self.assertEqual(body["errorCode"], "LATEST_CONTRACT_ERROR")
        self.assertEqual(body["reasonCode"], "LATEST_REQUIRED_KEYS_MISSING")
        self.assertIn("schemaVersion", body["missingKeys"])

    def test_api_state_returns_contract_error_when_required_keys_missing(self) -> None:
        state_path = self.live_root / "hyie_state.json"
        state_payload = json.loads(state_path.read_text(encoding="utf-8"))
        state_payload.pop("schemaVersion", None)
        state_path.write_text(json.dumps(state_payload), encoding="utf-8")

        response = self.client.get("/api/state")
        self.assertEqual(response.status_code, 502)
        body = response.json()
        self.assertEqual(body["errorCode"], "STATE_CONTRACT_ERROR")
        self.assertEqual(body["reasonCode"], "STATE_REQUIRED_KEYS_MISSING")
        self.assertIn("schemaVersion", body["missingKeys"])


if __name__ == "__main__":
    unittest.main()
