#!/usr/bin/env python
"""Canonical scheduler entrypoint (long running)."""

from __future__ import annotations

from main import _run_serve


def main() -> int:
    _run_serve(telegram_send=False, dry_run=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
