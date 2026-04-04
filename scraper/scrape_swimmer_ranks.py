"""Find national rankings for Bella & Amber across all their events and years."""

from __future__ import annotations

import sqlite3
import re

from .config import BASE_URL, DB_PATH, TARGET_SWIMMERS, STROKE_NAMES
from .db import init_db
from .parsers import norm_ws, parse_tiref_from_href
from .session import fetch_soup

RANKINGS_URL = f"{BASE_URL}/eventrankings/eventrankings.php"
PAGE_SIZE = 100
MAX_PAGES = 30  # up to rank 3000
YEARS = [2023, 2024, 2025, 2026]

# Map PB stroke names back to stroke codes
STROKE_NAME_TO_CODE = {}
for code, name in STROKE_NAMES.items():
    STROKE_NAME_TO_CODE[name] = code
# Also map the short forms from PB data
SHORT_TO_FULL = {
    "50 Freestyle": 1, "100 Freestyle": 2, "200 Freestyle": 3,
    "400 Freestyle": 4, "800 Freestyle": 5, "1500 Freestyle": 6,
    "50 Breaststroke": 7, "100 Breaststroke": 8, "200 Breaststroke": 9,
    "50 Butterfly": 10, "100 Butterfly": 11, "200 Butterfly": 12,
    "50 Backstroke": 13, "100 Backstroke": 14, "200 Backstroke": 15,
    "200 Individual Medley": 16, "400 Individual Medley": 17, "100 Individual Medley": 18,
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS swimmer_ranks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiref INTEGER NOT NULL,
    event TEXT NOT NULL,
    course TEXT NOT NULL,
    year INTEGER NOT NULL,
    age_group INTEGER NOT NULL,
    rank INTEGER,
    total_in_ranking INTEGER,
    time TEXT,
    UNIQUE(tiref, event, course, year)
);
"""


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def _find_rank(tiref: int, stroke_code: int, pool: str, age: int, year: int) -> tuple[int | None, int, str | None]:
    """Paginate through rankings to find a swimmer's rank.

    Returns (rank, total_seen, time) or (None, total_seen, None) if not found.
    """
    total = 0
    for page in range(MAX_PAGES):
        start = page * PAGE_SIZE + 1
        soup = fetch_soup(RANKINGS_URL, {
            "Pool": pool,
            "Stroke": str(stroke_code),
            "Sex": "F",
            "TargetYear": str(year),
            "AgeGroup": str(age),
            "AgeAt": "D",
            "TargetNationality": "E",
            "TargetRegion": "P",
            "TargetCounty": "XXXX",
            "TargetClub": "XXXX",
            "StartNumber": str(start),
            "RecordsToView": str(PAGE_SIZE),
            "Level": "N",
        })
        table = soup.find("table", id="rankTable")
        if not table:
            break
        rows = [tr for tr in table.find_all("tr") if len(tr.find_all("td")) >= 7]
        if not rows:
            break
        for tr in rows:
            tds = tr.find_all("td")
            total += 1
            link = tds[1].find("a", href=True)
            if link and f"tiref={tiref}" in link.get("href", ""):
                rank_text = norm_ws(tds[0].get_text(" ", strip=True))
                # Rank text might have commas: "1,084"
                rank = int(rank_text.replace(",", "")) if rank_text.replace(",", "").isdigit() else total
                time_val = norm_ws(tds[6].get_text(" ", strip=True))
                return rank, total, time_val
        if len(rows) < PAGE_SIZE:
            break
    return None, total, None


def _get_events_for_swimmer(conn: sqlite3.Connection, tiref: int) -> list[tuple[str, str, int]]:
    """Get list of (stroke_name, course_code, stroke_code) from PBs."""
    rows = conn.execute("""
        SELECT DISTINCT stroke, course FROM personal_bests
        WHERE tiref = ? AND wa_points IS NOT NULL
    """, (tiref,)).fetchall()
    events = []
    for stroke_name, course in rows:
        stroke_name = norm_ws(stroke_name)
        # Map course: LC→L, SC→S
        pool = "L" if course == "LC" else "S"
        # Find stroke code
        code = SHORT_TO_FULL.get(stroke_name)
        if code is None:
            # Try partial match
            for full_name, c in SHORT_TO_FULL.items():
                if full_name in stroke_name or stroke_name in full_name:
                    code = c
                    break
        if code is not None:
            events.append((stroke_name, pool, code))
    return events


def main() -> None:
    conn = init_db()
    try:
        ensure_schema(conn)
        conn.execute("DELETE FROM swimmer_ranks")
        conn.commit()

        total_found = 0
        total_queries = 0

        for tiref, info in TARGET_SWIMMERS.items():
            name = info["name"]
            yob = info["yob"]
            events = _get_events_for_swimmer(conn, tiref)
            print(f"\n[Ranks] {name} (tiref {tiref}, YoB {yob}): {len(events)} events")

            for stroke_name, pool, stroke_code in events:
                course_label = "SC" if pool == "S" else "LC"
                for year in YEARS:
                    age = year - yob
                    if age < 8 or age > 18:
                        continue

                    rank, total, time_val = _find_rank(tiref, stroke_code, pool, age, year)
                    total_queries += 1

                    if rank is not None:
                        conn.execute("""
                            INSERT OR REPLACE INTO swimmer_ranks
                                (tiref, event, course, year, age_group, rank, total_in_ranking, time)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (tiref, stroke_name, course_label, year, age, rank, total, time_val))
                        conn.commit()
                        total_found += 1
                        print(f"  {stroke_name} {course_label} {year} (age {age}): #{rank} ({time_val})")
                    # Don't print for not-found — too noisy

        print(f"\n[Ranks] Done: {total_found} rankings found from {total_queries} queries")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
