from __future__ import annotations

import os
from datetime import datetime

from .common import SourceSpec, collect_source_specs


TIER0_SPECS: list[SourceSpec] = [
    SourceSpec(
        source_id="tier0_us_embassy_uae",
        name="US Embassy UAE",
        url="https://ae.usembassy.gov/u-s-citizen-services/security-and-travel-information/",
        tier="TIER0",
        indicator_ids=("I01", "I07"),
        keywords=("security alert", "travel advisory", "ordered departure", "do not travel", "leave immediately"),
        critical_keywords=("ordered departure", "do not travel", "leave immediately"),
    ),
    SourceSpec(
        source_id="tier0_kr_mofa_0404",
        name="KR MOFA 0404",
        url="https://www.0404.go.kr/dev/newest_list.mofa",
        tier="TIER0",
        indicator_ids=("I01", "I07"),
        keywords=("여행경보", "특별여행주의보", "철수권고", "즉시 출국", "leave immediately"),
        critical_keywords=("즉시 출국", "철수권고", "leave immediately"),
        tags=("kr_channel",),
    ),
    SourceSpec(
        source_id="tier0_uk_fcdo_uae",
        name="UK FCDO UAE Advice",
        url="https://www.gov.uk/foreign-travel-advice/united-arab-emirates",
        tier="TIER0",
        indicator_ids=("I01",),
        keywords=("do not travel", "advice against all travel", "terrorist", "missile", "evacuation"),
        critical_keywords=("do not travel", "advice against all travel"),
    ),
    SourceSpec(
        source_id="tier0_etihad_updates",
        name="Etihad Travel Updates",
        url="https://www.etihad.com/en/travel-updates",
        tier="TIER0",
        indicator_ids=("I02",),
        keywords=("flight", "cancel", "suspend", "disruption", "resume"),
        critical_keywords=("cancel", "suspend", "disruption"),
        tags=("air_update",),
    ),
    SourceSpec(
        source_id="tier0_emirates_updates",
        name="Emirates Updates",
        url="https://www.emirates.com/english/help/travel-updates/",
        tier="TIER0",
        indicator_ids=("I02",),
        keywords=("flight", "cancel", "suspend", "disruption", "resume"),
        critical_keywords=("cancel", "suspend", "disruption"),
        tags=("air_update",),
    ),
    SourceSpec(
        source_id="tier0_gcaa",
        name="UAE GCAA",
        url="https://www.gcaa.gov.ae/en/Pages/default.aspx",
        tier="TIER0",
        indicator_ids=("I02",),
        keywords=("notam", "airspace", "flight", "suspended", "operations"),
        critical_keywords=("airspace", "suspended"),
        tags=("air_update",),
    ),
    SourceSpec(
        source_id="tier0_uae_mod",
        name="UAE Ministry of Defence",
        url="https://www.mod.gov.ae/en/media-center/news.aspx",
        tier="TIER0",
        indicator_ids=("I03",),
        keywords=("missile", "drone", "intercepted", "attack", "operation"),
        critical_keywords=("missile", "drone", "attack"),
        tags=("strike",),
    ),
]


async def collect_tier0_signals(*, timeout_sec: float, now: datetime) -> tuple[list[dict], dict[str, dict]]:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return [], {}
    return await collect_source_specs(TIER0_SPECS, timeout_sec=timeout_sec, checked_at=now)
