from __future__ import annotations

import os
from datetime import datetime

from .common import SourceSpec, collect_source_specs


TIER1_SPECS: list[SourceSpec] = [
    SourceSpec(
        source_id="tier1_aljazeera_middle_east",
        name="Al Jazeera Middle East",
        url="https://www.aljazeera.com/news/middleeast/",
        tier="TIER1",
        indicator_ids=("I03",),
        keywords=("iran", "uae", "strike", "missile", "drone", "explosion"),
        critical_keywords=("missile", "drone", "explosion"),
        tags=("strike",),
    ),
    SourceSpec(
        source_id="tier1_reuters_world",
        name="Reuters World",
        url="https://www.reuters.com/world/middle-east/",
        tier="TIER1",
        indicator_ids=("I03",),
        keywords=("iran", "uae", "missile", "drone", "attack", "gulf"),
        critical_keywords=("missile", "drone", "attack"),
        tags=("strike",),
    ),
    SourceSpec(
        source_id="tier1_bbc_world",
        name="BBC World",
        url="https://www.bbc.com/news/world/middle_east",
        tier="TIER1",
        indicator_ids=("I03",),
        keywords=("iran", "uae", "attack", "strike", "drone"),
        critical_keywords=("attack", "drone", "missile"),
        tags=("strike",),
    ),
    SourceSpec(
        source_id="tier1_cnn_breaking",
        name="CNN Middle East",
        url="https://www.cnn.com/middleeast",
        tier="TIER1",
        indicator_ids=("I03",),
        keywords=("iran", "uae", "explosion", "missile", "drone", "strike"),
        critical_keywords=("explosion", "missile", "drone"),
        tags=("strike",),
    ),
    SourceSpec(
        source_id="tier1_canada_uae_advisory",
        name="Canada Travel Advisory UAE",
        url="https://travel.gc.ca/destinations/united-arab-emirates",
        tier="TIER1",
        indicator_ids=("I04",),
        keywords=("advisory", "avoid", "security", "border", "road"),
        critical_keywords=("avoid", "border closed", "restricted"),
        tags=("border_watch",),
    ),
    SourceSpec(
        source_id="tier1_downdetector_uae",
        name="Downdetector UAE",
        url="https://downdetector.ae/",
        tier="TIER1",
        indicator_ids=("I05",),
        keywords=("outage", "issues", "internet", "etisalat", "du"),
        critical_keywords=("outage", "major outage"),
        tags=("comms",),
    ),
    SourceSpec(
        source_id="tier1_aws_status",
        name="AWS Service Health",
        url="https://status.aws.amazon.com/",
        tier="TIER1",
        indicator_ids=("I05",),
        keywords=("degraded", "outage", "service event", "operational"),
        critical_keywords=("degraded", "outage"),
        tags=("comms",),
    ),
    SourceSpec(
        source_id="tier1_azure_status",
        name="Azure Status",
        url="https://azure.status.microsoft.com/en-us/status",
        tier="TIER1",
        indicator_ids=("I05",),
        keywords=("degraded", "outage", "service issue", "incident"),
        critical_keywords=("degraded", "outage", "incident"),
        tags=("comms",),
    ),
    SourceSpec(
        source_id="tier1_nation_thailand",
        name="Nation Thailand",
        url="https://www.nationthailand.com/",
        tier="TIER1",
        indicator_ids=("I07",),
        keywords=("evacuation", "middle east", "uae", "military flight"),
        critical_keywords=("evacuation", "military flight"),
    ),
    SourceSpec(
        source_id="tier1_ndtv_world",
        name="NDTV World",
        url="https://www.ndtv.com/world-news",
        tier="TIER1",
        indicator_ids=("I07",),
        keywords=("evacuation", "special flight", "uae", "middle east"),
        critical_keywords=("evacuation", "special flight"),
    ),
]


async def collect_tier1_signals(*, timeout_sec: float, now: datetime) -> tuple[list[dict], dict[str, dict]]:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return [], {}
    return await collect_source_specs(TIER1_SPECS, timeout_sec=timeout_sec, checked_at=now)
