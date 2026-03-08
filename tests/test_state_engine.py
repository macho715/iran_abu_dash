from __future__ import annotations

import unittest

from src.iran_monitor.app import _article_to_signal
from src.iran_monitor.sources.common import SourceSpec, _build_signal
from src.iran_monitor.state_engine import build_state_payload


TS = "2026-03-07T08:00:00+04:00"


class StateEngineTests(unittest.TestCase):
    def test_article_signal_ignores_plain_dubai_reference(self) -> None:
        signal = _article_to_signal(
            {
                "title": "Weekend markets remain busy in Dubai",
                "source": "demo",
                "link": "https://example.com/story",
            },
            TS,
        )

        self.assertIsNone(signal)

    def test_article_signal_returns_none_for_unmatched_story(self) -> None:
        signal = _article_to_signal(
            {
                "title": "Local business forum opens in Sharjah",
                "source": "demo",
                "link": "https://example.com/forum",
            },
            TS,
        )

        self.assertIsNone(signal)

    def test_source_probe_marks_origin_and_border_closed(self) -> None:
        spec = SourceSpec(
            source_id="tier1_demo_border",
            name="Demo Border Monitor",
            url="https://example.com/border",
            tier="TIER1",
            indicator_ids=("I04",),
            keywords=("border", "crossing"),
            critical_keywords=("closed",),
            tags=("border_watch",),
        )

        signal = _build_signal(spec, "Border crossing closed due to security checks", TS)

        self.assertIsNotNone(signal)
        self.assertEqual(signal["origin"], "source_probe")
        self.assertIn("border_closed", signal["tags"])

    def test_border_closed_blocks_routes_a_and_b(self) -> None:
        signal = _article_to_signal(
            {
                "title": "Oman border crossing closed near Buraimi checkpoint",
                "source": "reuters",
                "link": "https://example.com/border-closed",
            },
            TS,
        )

        self.assertIsNotNone(signal)
        self.assertEqual(signal["origin"], "article")
        self.assertIn("border_closed", signal["tags"])

        payload = build_state_payload(signals=[signal], source_health={})
        routes = {route["id"]: route for route in payload["routes"]}

        self.assertEqual(routes["A"]["status"], "BLOCKED")
        self.assertEqual(routes["B"]["status"], "BLOCKED")

    def test_border_restricted_only_cautions_routes_a_and_b(self) -> None:
        signal = _article_to_signal(
            {
                "title": "Border crossing restricted at Al Ain checkpoint",
                "source": "ap",
                "link": "https://example.com/border-restricted",
            },
            TS,
        )

        self.assertIsNotNone(signal)
        self.assertIn("border_restricted", signal["tags"])

        payload = build_state_payload(signals=[signal], source_health={})
        routes = {route["id"]: route for route in payload["routes"]}

        self.assertEqual(routes["A"]["status"], "CAUTION")
        self.assertEqual(routes["B"]["status"], "CAUTION")
        self.assertNotEqual(routes["A"]["status"], "BLOCKED")
        self.assertNotEqual(routes["B"]["status"], "BLOCKED")

    def test_article_only_signal_keeps_evidence_conf_low(self) -> None:
        signal = _article_to_signal(
            {
                "title": "Missile strike reported near Gulf shipping lane",
                "source": "reuters",
                "link": "https://example.com/strike",
            },
            TS,
        )

        self.assertIsNotNone(signal)
        self.assertFalse(signal["confirmed"])

        payload = build_state_payload(signals=[signal], source_health={})

        self.assertLess(payload["evidence_conf"], 0.3)

    def test_multiple_confirmed_tier0_signals_raise_evidence_conf(self) -> None:
        article_signal = _article_to_signal(
            {
                "title": "Flight disruption reported at airport",
                "source": "demo",
                "link": "https://example.com/article",
            },
            TS,
        )
        self.assertIsNotNone(article_signal)
        article_payload = build_state_payload(signals=[article_signal], source_health={})

        signals = [
            {
                "source_id": "tier0_gcaa",
                "source": "UAE GCAA",
                "tier": "TIER0",
                "origin": "source_probe",
                "indicator_ids": ["I02"],
                "score": 0.84,
                "confirmed": True,
                "ts": TS,
                "summary": "UAE GCAA: airspace operations restricted",
                "tags": ["air_update"],
            },
            {
                "source_id": "tier0_embassy",
                "source": "US Embassy UAE",
                "tier": "TIER0",
                "origin": "source_probe",
                "indicator_ids": ["I01", "I07"],
                "score": 0.91,
                "confirmed": True,
                "ts": TS,
                "summary": "US Embassy UAE: do not travel",
                "tags": [],
            },
            {
                "source_id": "tier0_mod",
                "source": "UAE Ministry of Defence",
                "tier": "TIER0",
                "origin": "source_probe",
                "indicator_ids": ["I03"],
                "score": 0.88,
                "confirmed": True,
                "ts": TS,
                "summary": "UAE Ministry of Defence: missile intercepted",
                "tags": ["strike"],
            },
        ]

        payload = build_state_payload(
            signals=signals,
            source_health={
                "tier0_gcaa": {"ok": True},
                "tier0_embassy": {"ok": True},
                "tier0_mod": {"ok": True},
            },
        )

        self.assertGreater(payload["evidence_conf"], 0.75)
        self.assertGreater(payload["evidence_conf"], article_payload["evidence_conf"])


if __name__ == "__main__":
    unittest.main()
