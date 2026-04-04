"""Shared HTML/text parsing utilities."""

from __future__ import annotations

import re
from datetime import datetime


def norm_ws(text: str) -> str:
    """Normalise whitespace: collapse runs, strip non-breaking spaces."""
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def parse_int_or_none(text: str) -> int | None:
    cleaned = re.sub(r"[^\d]", "", text)
    return int(cleaned) if cleaned else None


def parse_tiref_from_href(href: str) -> str | None:
    m = re.search(r"[?&]tiref=(\d+)", href)
    return m.group(1) if m else None


def sex_from_eligibility(eligibility: str) -> str | None:
    if re.search(r"\bFemale\b", eligibility, flags=re.I):
        return "F"
    if re.search(r"\bMale\b", eligibility, flags=re.I):
        return "M"
    return None


def year_from_date(date_text: str | None) -> int | None:
    if not date_text:
        return None
    m = re.match(r"^\s*\d{1,2}/\d{1,2}/(\d{2,4})\s*$", str(date_text).strip())
    if not m:
        return None
    y = m.group(1)
    return 2000 + int(y) if len(y) == 2 else int(y)


def parse_date(text: str) -> datetime | None:
    text = norm_ws(text)
    for fmt in ("%d/%m/%y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_time_seconds(text: str) -> float | None:
    t = norm_ws(text)
    if not t:
        return None
    if ":" in t:
        parts = t.split(":")
        if len(parts) != 2:
            return None
        try:
            return float(parts[0]) * 60.0 + float(parts[1])
        except ValueError:
            return None
    try:
        return float(t)
    except ValueError:
        return None
