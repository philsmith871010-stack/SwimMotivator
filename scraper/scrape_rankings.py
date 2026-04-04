"""Scrape national event rankings from Swim England — bulk approach.

Instead of searching for individual swimmers, this scrapes entire ranking
lists and stores EVERY ranked swimmer. This is dramatically faster when
you want data for many swimmers, and captures the full national picture.

Time estimate: ~18 events × 2 courses × 11 age groups × 4 years = ~1,584 combos
At ~5 pages avg and 0.4s/request ≈ 50-90 minutes for all of England.
"""

from __future__ import annotations

import sqlite3

from .config import (
    BASE_URL, DB_PATH, ALL_STROKE_CODES, STROKE_NAMES,
)
from .db import init_db
from .parsers import norm_ws, parse_tiref_from_href
from .session import fetch_soup

RANKINGS_URL = f"{BASE_URL}/eventrankings/eventrankings.php"
PAGE_SIZE = 100
MAX_PAGES = 30  # up to rank 3000 per combo

# Configurable defaults
DEFAULT_YEARS = [2023, 2024, 2025, 2026]
DEFAULT_AGE_GROUPS = list(range(8, 19))  # 8-18
DEFAULT_SEX = "F"

SCHEMA = """
CREATE TABLE IF NOT EXISTS event_rankings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiref TEXT NOT NULL,
    swimmer_name TEXT,
    club TEXT,
    yob INTEGER,
    sex TEXT,
    event TEXT,
    course TEXT,
    age_group TEXT,
    region TEXT,
    rank INTEGER,
    time TEXT,
    meet_name TEXT,
    date TEXT,
    year INTEGER
);
CREATE INDEX IF NOT EXISTS idx_er_tiref ON event_rankings (tiref);
CREATE INDEX IF NOT EXISTS idx_er_event ON event_rankings (event, course, sex, age_group);
"""


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def _parse_rankings_page(soup, *, event: str, course: str, sex: str,
                         age_group: str, region: str, year: int) -> list[dict]:
    table = soup.find("table", id="rankTable")
    if not table:
        return []
    rows: list[dict] = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue
        rank_text = norm_ws(tds[0].get_text(" ", strip=True)).replace(",", "")
        rank = int(rank_text) if rank_text.isdigit() else None

        link = tds[1].find("a", href=True)
        if not link:
            continue
        tiref = parse_tiref_from_href(link["href"])
        if not tiref:
            continue

        name = norm_ws(tds[1].get_text(" ", strip=True))
        club = norm_ws(tds[2].get_text(" ", strip=True)) or None
        yob_text = norm_ws(tds[3].get_text(" ", strip=True))
        yob = int(yob_text) if yob_text.isdigit() else None
        if yob and yob < 100:
            yob += 2000
        meet_name = norm_ws(tds[4].get_text(" ", strip=True)) or None
        date = norm_ws(tds[5].get_text(" ", strip=True)) or None
        time_val = norm_ws(tds[6].get_text(" ", strip=True)) or None

        rows.append({
            "tiref": tiref,
            "swimmer_name": name,
            "club": club,
            "yob": yob,
            "sex": sex,
            "event": event,
            "course": "SC" if course == "S" else "LC",
            "age_group": age_group,
            "region": region,
            "rank": rank,
            "time": time_val,
            "meet_name": meet_name,
            "date": date,
            "year": year,
        })
    return rows


def scrape_event_rankings(
    *,
    stroke_codes: list[int] | None = None,
    age_groups: list[int] | None = None,
    sex: str = DEFAULT_SEX,
    courses: list[str] | None = None,
    years: list[int] | None = None,
    level: str = "N",  # N = National
) -> None:
    """Scrape national rankings for all event/age/course/year combos.

    Args:
        stroke_codes: Which strokes to scrape (default: all 18)
        age_groups: Which age groups (default: 8-18)
        sex: "F" or "M" (default: "F")
        courses: ["S", "L"] for short/long course (default: both)
        years: Which years to scrape (default: 2023-2026)
        level: "N" for National, "R" for Regional
    """
    _stroke_codes = stroke_codes or ALL_STROKE_CODES
    _age_groups = age_groups or DEFAULT_AGE_GROUPS
    _courses = courses or ["S", "L"]
    _years = years or DEFAULT_YEARS

    conn = init_db()
    try:
        ensure_schema(conn)

        # Clear old rankings for these years
        for year in _years:
            conn.execute("DELETE FROM event_rankings WHERE year = ?", (year,))
        conn.commit()

        # Build all combos
        combos = []
        for year in _years:
            for stroke_code in _stroke_codes:
                event_name = STROKE_NAMES.get(stroke_code, f"Stroke {stroke_code}")
                for age in _age_groups:
                    for course in _courses:
                        combos.append((stroke_code, event_name, str(age), sex, course, year))

        total = len(combos)
        total_saved = 0
        total_requests = 0

        print(f"[Rankings] {total} combos to scrape ({len(_stroke_codes)} events × "
              f"{len(_age_groups)} ages × {len(_courses)} courses × {len(_years)} years)")

        for idx, (stroke_code, event_name, age, sex, course, year) in enumerate(combos, start=1):
            combo_rows: list[dict] = []
            start = 1
            pages = 0

            while pages < MAX_PAGES:
                soup = fetch_soup(RANKINGS_URL, {
                    "Pool": course,
                    "Stroke": str(stroke_code),
                    "Sex": sex,
                    "TargetYear": str(year),
                    "AgeGroup": age,
                    "AgeAt": "D",
                    "TargetNationality": "E",
                    "TargetRegion": "P",     # National
                    "TargetCounty": "XXXX",
                    "TargetClub": "XXXX",
                    "StartNumber": str(start),
                    "RecordsToView": str(PAGE_SIZE),
                    "Level": level,
                })
                total_requests += 1

                rows = _parse_rankings_page(
                    soup, event=event_name, course=course, sex=sex,
                    age_group=age, region="National", year=year,
                )

                if not rows:
                    break

                combo_rows.extend(rows)
                pages += 1

                if len(rows) < PAGE_SIZE:
                    break
                start += PAGE_SIZE

            if combo_rows:
                conn.executemany("""
                    INSERT INTO event_rankings (
                        tiref, swimmer_name, club, yob, sex, event, course,
                        age_group, region, rank, time, meet_name, date, year
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [(r["tiref"], r["swimmer_name"], r["club"], r["yob"], r["sex"],
                       r["event"], r["course"], r["age_group"], r["region"],
                       r["rank"], r["time"], r["meet_name"], r["date"], r["year"])
                      for r in combo_rows])
                conn.commit()
                total_saved += len(combo_rows)

            if idx % 25 == 0 or idx == total:
                print(f"[Rankings] {idx}/{total} combos — {total_saved:,} swimmers stored — "
                      f"{total_requests} requests")

        # Summary
        unique = conn.execute("SELECT COUNT(DISTINCT tiref) FROM event_rankings").fetchone()[0]
        print(f"\n[Rankings] Complete: {total_saved:,} ranking entries, "
              f"{unique:,} unique swimmers, {total_requests} requests")
    finally:
        conn.close()


def main() -> None:
    scrape_event_rankings()


if __name__ == "__main__":
    main()
