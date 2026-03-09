from __future__ import annotations

import unittest

from src.iran_monitor import reporter


class ReporterWeeklyTests(unittest.TestCase):
    def test_build_weekly_report_includes_kpi_and_significance(self) -> None:
        payload = {
            "current": {
                "decision_time_reduction": 34.5,
                "warning_accuracy": 88.4,
                "false_alarm_rate": 14.2,
                "user_revisit": 52.1,
            },
            "previous": {
                "decision_time_reduction": 29.0,
                "warning_accuracy": 82.1,
                "false_alarm_rate": 18.7,
                "user_revisit": 47.8,
            },
            "experiment": {
                "control_success": 62,
                "control_total": 120,
                "variant_success": 91,
                "variant_total": 130,
            },
        }

        report_text = reporter.build_weekly_report_text(payload)

        self.assertIn("핵심 KPI", report_text)
        self.assertIn("통계 검정 p-value", report_text)
        self.assertIn("Control 성공률", report_text)
        self.assertIn("Variant 성공률", report_text)

    def test_build_weekly_report_flags_deprecate_candidates(self) -> None:
        payload = {
            "current": {
                "decision_time_reduction": 18.0,
                "warning_accuracy": 60.0,
                "false_alarm_rate": 41.0,
                "user_revisit": 20.0,
            },
            "previous": {
                "decision_time_reduction": 30.0,
                "warning_accuracy": 70.0,
                "false_alarm_rate": 20.0,
                "user_revisit": 31.0,
            },
            "experiment": {
                "control_success": 10,
                "control_total": 50,
                "variant_success": 9,
                "variant_total": 49,
            },
        }

        report_text = reporter.build_weekly_report_text(payload)

        self.assertIn("Deprecate 후보 기능", report_text)
        self.assertIn("결정 시간 단축", report_text)
        self.assertIn("False alarm rate", report_text)


if __name__ == "__main__":
    unittest.main()
