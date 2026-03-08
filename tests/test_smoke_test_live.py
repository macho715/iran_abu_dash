from __future__ import annotations

import importlib.util
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError


def _load_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "scripts" / "smoke_test_live.py"
    spec = importlib.util.spec_from_file_location("smoke_test_live", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module: {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


smoke_test_live = _load_module()


class SmokeTestLiveTests(unittest.TestCase):
    def test_normalize_latest_payload_supports_legacy_schema(self) -> None:
        payload = {
            "version": "abc123",
            "publishedAt": "2026-03-06T23:16:50Z",
            "stateTs": "2026-03-07T03:16:50+04:00",
            "litePath": "v/abc123/state-lite.json",
            "aiPath": "",
            "aiVersion": "",
        }

        normalized = smoke_test_live._normalize_latest_payload(payload)

        self.assertEqual(normalized["publishedAt"], payload["publishedAt"])
        self.assertEqual(normalized["litePath"], payload["litePath"])

    def test_normalize_latest_payload_supports_current_schema(self) -> None:
        payload = {
            "version": "2026-03-06T23-27-31Z",
            "collectedAt": "2026-03-06T23:27:31Z",
            "stateTs": "2026-03-07T03:27:31+04:00",
            "liteUrl": "v/2026-03-06T23-27-31Z/state-lite.json",
            "aiUrl": None,
            "aiVersion": None,
        }

        normalized = smoke_test_live._normalize_latest_payload(payload)

        self.assertEqual(normalized["publishedAt"], payload["collectedAt"])
        self.assertEqual(normalized["litePath"], payload["liteUrl"])

    def test_fetch_json_with_retry_retries_transient_errors(self) -> None:
        responses = [
            HTTPError("https://example.com/live/latest.json", 404, "not ready", hdrs=None, fp=None),
            HTTPError("https://example.com/live/latest.json", 404, "still not ready", hdrs=None, fp=None),
            {"ok": True},
        ]

        def fake_load(url: str, timeout: float = 20.0):
            result = responses.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

        with patch.object(smoke_test_live, "_load_json_url", side_effect=fake_load) as load_mock:
            with patch.object(smoke_test_live.time, "sleep") as sleep_mock:
                payload = smoke_test_live._fetch_json_with_retry(
                    "https://example.com/live/latest.json",
                    retries=3,
                    sleep_seconds=0.1,
                    label="latest",
                )

        self.assertEqual(payload, {"ok": True})
        self.assertEqual(load_mock.call_count, 3)
        self.assertEqual(sleep_mock.call_count, 2)

    def test_fetch_git_json_with_retry_fetches_branch_and_retries(self) -> None:
        responses = [RuntimeError("not yet visible"), {"ok": True}]

        def fake_git_load(ref: str, path: str):
            result = responses.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

        with patch.object(smoke_test_live, "_load_json_git_ref", side_effect=fake_git_load) as load_mock:
            with patch.object(smoke_test_live.subprocess, "run") as run_mock:
                with patch.object(smoke_test_live.time, "sleep") as sleep_mock:
                    run_mock.return_value = subprocess.CompletedProcess(args=["git"], returncode=0)
                    payload = smoke_test_live._fetch_git_json_with_retry(
                        "origin/urgentdash-live",
                        "live/latest.json",
                        "urgentdash-live",
                        retries=2,
                        sleep_seconds=0.1,
                        label="latest",
                    )

        self.assertEqual(payload, {"ok": True})
        self.assertEqual(load_mock.call_count, 2)
        self.assertEqual(run_mock.call_count, 2)
        self.assertEqual(sleep_mock.call_count, 1)

    def test_infer_git_branch_from_raw_latest_url(self) -> None:
        branch = smoke_test_live._infer_git_branch_from_latest_url(
            "https://raw.githubusercontent.com/macho715/iran_abu_dash/urgentdash-live/live/latest.json"
        )

        self.assertEqual(branch, "urgentdash-live")


if __name__ == "__main__":
    unittest.main()
