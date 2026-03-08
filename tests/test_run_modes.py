from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from src.iran_monitor import app as app_mod


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


def sample_articles() -> list[dict]:
    return [{"source": "demo", "title": "demo headline", "link": "https://example.com/demo"}]


class RunModeTests(unittest.TestCase):
    def test_lite_and_ai_reuse_same_run_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ai_input = root / "state" / "ai_input.json"
            hyie_state = root / "state" / "hyie_state.json"
            health_file = root / ".health_state.json"
            live_root = root / "live"
            snapshot = sample_snapshot()
            all_articles = sample_articles()
            persist_calls: list[dict] = []

            async def collect(_flags):
                return list(all_articles)

            async def update_state(_all_articles, _run_ts, _flags):
                return dict(snapshot)

            def persist_storage(**kwargs):
                persist_calls.append(kwargs)

            with (
                patch.object(app_mod, "AI_INPUT_FILE", ai_input),
                patch.object(app_mod, "HYIE_STATE_FILE", hyie_state),
                patch.object(app_mod, "HEALTH_STATE_FILE", health_file),
                patch.object(app_mod, "_live_root", return_value=live_root),
                patch.object(app_mod, "_collect_all_articles", new=collect),
                patch.object(app_mod, "_update_hyie_state", new=update_state),
                patch.object(app_mod, "_filter_new_persistent", return_value=list(all_articles)),
                patch.object(app_mod, "_persist_storage", side_effect=persist_storage),
                patch.object(app_mod, "_publish_lite_outputs", return_value={}),
                patch.object(app_mod, "_publish_ai_outputs", return_value={}),
                patch.object(app_mod, "_write_health_state", return_value=None),
                patch.object(app_mod, "_inject_ai_analysis_into_hyie_state", return_value=None),
                patch.object(app_mod, "_upload_to_notebooklm", return_value=None),
                patch.object(
                    app_mod,
                    "_analyze_phase2",
                    return_value={
                        "threat_level": "LOW",
                        "threat_score": 15,
                        "sentiment": "일반",
                        "abu_dhabi_level": "LOW",
                        "dubai_level": "LOW",
                        "summary": "fallback",
                        "recommended_action": "watch",
                        "key_points": ["demo"],
                        "analysis_source": "fallback",
                    },
                ),
                patch.object(app_mod, "send_telegram_report", new=AsyncMock(return_value={"telegram": True, "whatsapp": True, "approved": True})),
                patch.object(app_mod, "send_telegram_alert", new=AsyncMock(return_value=True)),
            ):
                asyncio.run(app_mod.run_lite_cycle())
                asyncio.run(app_mod.run_ai_cycle(ai_input_path=ai_input, approval_required=False, dry_run=False))

            self.assertEqual(len(persist_calls), 2)
            self.assertEqual(persist_calls[0]["run_id"], persist_calls[1]["run_id"])
            self.assertEqual(persist_calls[0]["run_ts"], persist_calls[1]["run_ts"])

    def test_ai_stage_skips_upload_when_no_new_articles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ai_input = root / "state" / "ai_input.json"
            hyie_state = root / "state" / "hyie_state.json"
            health_file = root / ".health_state.json"
            live_root = root / "live"
            snapshot = sample_snapshot()
            all_articles = sample_articles()
            persist_calls: list[dict] = []
            upload_calls: list[list[dict]] = []

            async def collect(_flags):
                return list(all_articles)

            async def update_state(_all_articles, _run_ts, _flags):
                return dict(snapshot)

            def persist_storage(**kwargs):
                persist_calls.append(kwargs)

            def upload_to_notebooklm(articles):
                upload_calls.append(list(articles))
                return None

            with (
                patch.object(app_mod, "AI_INPUT_FILE", ai_input),
                patch.object(app_mod, "HYIE_STATE_FILE", hyie_state),
                patch.object(app_mod, "HEALTH_STATE_FILE", health_file),
                patch.object(app_mod, "_live_root", return_value=live_root),
                patch.object(app_mod, "_collect_all_articles", new=collect),
                patch.object(app_mod, "_update_hyie_state", new=update_state),
                patch.object(app_mod, "_filter_new_persistent", return_value=[]),
                patch.object(app_mod, "_persist_storage", side_effect=persist_storage),
                patch.object(app_mod, "_publish_lite_outputs", return_value={}),
                patch.object(app_mod, "_publish_ai_outputs", return_value={}),
                patch.object(app_mod, "_write_health_state", return_value=None),
                patch.object(app_mod, "_inject_ai_analysis_into_hyie_state", return_value=None),
                patch.object(app_mod, "_upload_to_notebooklm", side_effect=upload_to_notebooklm),
                patch.object(app_mod, "send_telegram_report", new=AsyncMock(return_value={"telegram": True, "whatsapp": True, "approved": True})),
                patch.object(app_mod, "send_telegram_alert", new=AsyncMock(return_value=True)),
            ):
                asyncio.run(app_mod.run_lite_cycle())
                asyncio.run(app_mod.run_ai_cycle(ai_input_path=ai_input, approval_required=False, dry_run=False))

            self.assertEqual(upload_calls, [])
            self.assertEqual(persist_calls[0]["articles"], [])
            self.assertEqual(persist_calls[1]["articles"], [])
            self.assertIn("총 1건 기준", persist_calls[1]["analysis"]["summary"])


if __name__ == "__main__":
    unittest.main()
