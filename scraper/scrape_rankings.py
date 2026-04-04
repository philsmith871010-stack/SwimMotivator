"""Scrape event rankings for bulk peer data from Swim England."""

from __future__ import annotations

import re
import sqlite3

from .config import (
    BASE_URL, DB_PATH, MEET_STROKE_CODES, STROKE_NAMES,
    PEER_MIN_YOB, PEER_MAX_YOB,
)
from .db import init_db
from .parsers import norm_ws, parse_tiref_from_href
from .session import fetch_soup

RANKINGS_URL = f"{BASE_URL}/eventrankings/eventrankings.php"
PAGE_SIZE = 100
MAX_PAGES = 10  # safety limit: 1000 swimmers per combo

# Age groups matching peer YoB range (10-14 year olds)
AGE_GROUPS = ["10", "11", "12", "13", "14"]
SEXES = ["F"]  # Female peers only; add "M" if you want boys too
COURSES = ["S", "L"]
REGIONS = ["T"]  # T = East region. Add more if desired:
# A=East Midland, T=East, L=London, E=North East, N=North West,
# S=South East, W=South West, M=West Midland, D=Yorkshire & NE


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
        rank_text = norm_ws(tds[0].get_text(" ", strip=True))
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
    age_groups: list[str] | None = None,
    sexes: list[str] | None = None,
    courses: list[str] | None = None,
    regions: list[str] | None = None,
    year: int = 2025,
) -> None:
    _stroke_codes = stroke_codes or MEET_STROKE_CODES
    _age_groups = age_groups or AGE_GROUPS
    _sexes = sexes or SEXES
    _courses = courses or COURSES
    _regions = regions or REGIONS

    conn = init_db()
    try:
        ensure_schema(conn)

        # Clear old rankings for this year
        conn.execute("DELETE FROM event_rankings WHERE year = ?", (year,))
        conn.commit()

        combos = []
        for stroke_code in _stroke_codes:
            event_name = STROKE_NAMES.get(stroke_code, f"Stroke {stroke_code}")
            for age in _age_groups:
                for sex in _sexes:
                    for course in _courses:
                        for region in _regions:
                            combos.append((stroke_code, event_name, age, sex, course, region))

        total = len(combos)
        total_saved = 0

        for idx, (stroke_code, event_name, age, sex, course, region) in enumerate(combos, start=1):
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
                    "TargetRegion": region,
                    "TargetCounty": "XXXX",
                    "TargetClub": "XXXX",
                    "StartNumber": str(start),
                    "RecordsToView": str(PAGE_SIZE),
                    "Level": "N",
                })

                rows = _parse_rankings_page(
                    soup, event=event_name, course=course, sex=sex,
                    age_group=age, region=region, year=year,
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

            if idx % 10 == 0 or idx == total:
                print(f"[Rankings] {idx}/{total} combos done — {total_saved:,} total records")

        print(f"[Rankings] Complete: {total_saved:,} records from {total} combos")

        # Print summary
        unique = conn.execute("SELECT COUNT(DISTINCT tiref) FROM event_rankings WHERE year = ?", (year,)).fetchone()[0]
        print(f"[Rankings] {unique:,} unique swimmers found")
    finally:
        conn.close()


def main() -> None:
    scrape_event_rankings(year=2025)


if __name__ == "__main__":
    main()
