from __future__ import annotations

import os
from datetime import datetime

from .common import SourceSpec, collect_source_specs


TIER2_SPECS: list[SourceSpec] = [
    SourceSpec(
        source_id="tier2_the_national",
        name="The National UAE",
        url="https://www.thenationalnews.com/uae/",
        tier="TIER2",
        indicator_ids=("I06",),
        keywords=("fuel", "supply", "supermarket", "stock", "panic buying"),
        critical_keywords=("shortage", "empty shelves"),
    ),
    SourceSpec(
        source_id="tier2_khaleej_times",
        name="Khaleej Times",
        url="https://www.khaleejtimes.com/",
        tier="TIER2",
        indicator_ids=("I06",),
        keywords=("fuel", "supply", "stock", "rationing", "shortage"),
        critical_keywords=("rationing", "shortage"),
    ),
    SourceSpec(
        source_id="tier2_gulf_news",
        name="Gulf News",
        url="https://gulfnews.com/",
        tier="TIER2",
        indicator_ids=("I06",),
        keywords=("fuel", "food", "supply", "stock", "supermarket"),
        critical_keywords=("shortage", "rationing"),
    ),
    SourceSpec(
        source_id="tier2_waze_live_map",
        name="Waze Live Map",
        url="https://www.waze.com/live-map/",
        tier="TIER2",
        indicator_ids=("I04",),
        keywords=("traffic", "jam", "congestion", "road", "incident"),
        critical_keywords=("road closed", "blocked"),
        tags=("route_a_congested",),
    ),
    SourceSpec(
        source_id="tier2_oman_border",
        name="Royal Oman Police Border",
        url="https://www.rop.gov.om/",
        tier="TIER2",
        indicator_ids=("I04",),
        keywords=("border", "crossing", "opening hours", "restricted"),
        critical_keywords=("closed", "restricted"),
        tags=("border_watch",),
    ),
    SourceSpec(
        source_id="tier2_port_fujairah",
        name="Port of Fujairah",
        url="https://www.fujairahport.ae/",
        tier="TIER2",
        indicator_ids=("I04",),
        keywords=("operations", "port", "disruption", "closed"),
        critical_keywords=("closed", "disruption"),
        tags=("fujairah_disruption",),
    ),
]


async def collect_tier2_signals(*, timeout_sec: float, now: datetime) -> tuple[list[dict], dict[str, dict]]:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return [], {}
    return await collect_source_specs(TIER2_SPECS, timeout_sec=timeout_sec, checked_at=now)
