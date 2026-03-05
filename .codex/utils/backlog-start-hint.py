#!/usr/bin/env python3
"""Print focused backlog hints for the start command."""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple


BACKLOG_PATH = Path(".claude/BACKLOG.md")
CHECKBOX_RE = re.compile(r"^\s*-\s\[\s\]\s+(.+?)\s*$")
H3_RE = re.compile(r"^\s*###\s+(.+?)\s*$")
DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
DEFAULT_STALE_DAYS = 3


def _safe_int(raw: str, fallback: int) -> int:
    try:
        value = int(str(raw).strip())
    except Exception:
        return fallback
    return value if value > 0 else fallback


def _extract_next_action(markdown: str) -> Optional[str]:
    first_unchecked: Optional[str] = None
    first_high_priority: Optional[str] = None
    current_h3 = ""

    for line in markdown.splitlines():
        h3_match = H3_RE.match(line)
        if h3_match:
            current_h3 = h3_match.group(1).strip().lower()
            continue

        item_match = CHECKBOX_RE.match(line)
        if not item_match:
            continue

        item = item_match.group(1).strip()
        if not item:
            continue

        if first_unchecked is None:
            first_unchecked = item

        if first_high_priority is None and "high priority" in current_h3:
            first_high_priority = item

    return first_high_priority or first_unchecked


def _extract_manual_update_date(markdown: str) -> Optional[datetime]:
    for line in markdown.splitlines()[:60]:
        if "updated" not in line.lower() and "refreshed" not in line.lower():
            continue
        match = DATE_RE.search(line)
        if not match:
            continue
        try:
            parsed = datetime.strptime(match.group(1), "%Y-%m-%d")
        except ValueError:
            continue
        return parsed.replace(tzinfo=timezone.utc)
    return None


def _resolve_update_timestamp(path: Path, markdown: str) -> Tuple[Optional[datetime], str]:
    manual = _extract_manual_update_date(markdown)
    if manual:
        return manual, "manual"

    try:
        stat_time = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        return stat_time, "file_mtime"
    except Exception:
        return None, "unknown"


def main() -> int:
    if not BACKLOG_PATH.exists():
        return 0

    try:
        text = BACKLOG_PATH.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return 0

    next_action = _extract_next_action(text)
    if next_action:
        print(f"[codex] backlog next: {next_action}")
    else:
        print("[codex] backlog next: no unchecked tasks found in .claude/BACKLOG.md")

    updated_at, source_kind = _resolve_update_timestamp(BACKLOG_PATH, text)
    if not updated_at:
        return 0

    stale_days = _safe_int(os.getenv("CODEX_BACKLOG_STALE_DAYS", ""), DEFAULT_STALE_DAYS)
    today = datetime.now(timezone.utc).date()
    updated_date = updated_at.date()
    age_days = max((today - updated_date).days, 0)

    if age_days >= stale_days:
        source_label = "manual update" if source_kind == "manual" else "file update"
        print(
            "[codex] backlog stale: "
            f"last {source_label} {updated_date.isoformat()} ({age_days} days ago). "
            "refresh .claude/BACKLOG.md priorities."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
