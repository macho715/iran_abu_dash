#!/usr/bin/env python
"""Build HyIE state once without running the full scrape/report pipeline."""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from src.iran_monitor.app import _update_hyie_state


async def _main() -> int:
    now = datetime.now(ZoneInfo("Asia/Dubai")).isoformat(timespec="seconds")
    flags: list[str] = []
    payload = await _update_hyie_state(all_articles=[], run_ts=now, flags=flags)
    if payload is None:
        print("HyIE state update skipped (likely lock held).")
        print(f"flags={flags}")
        return 1

    print(f"state_ts={payload.get('state_ts')}")
    print(f"status={payload.get('status')}")
    print(f"degraded={payload.get('degraded')}")
    print(f"egress_eta_source={payload.get('egress_eta_source')}")
    print(f"flags={flags}")
    return 0


def main() -> int:
    return asyncio.run(_main())


if __name__ == "__main__":
    raise SystemExit(main())

