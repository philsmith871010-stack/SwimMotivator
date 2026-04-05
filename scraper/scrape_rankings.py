"""Scrape national event rankings from Swim England — bulk approach.

Instead of searching for individual swimmers, this scrapes entire ranking
lists and stores EVERY ranked swimmer. This is dramatically faster when
you want data for many swimmers, and captures the full national picture.

Time estimate: ~18 events × 2 sexes × 2 courses × 11 age groups × 5 years = ~3,960 combos
At ~5 pages avg and 0.4s/request ≈ 2-3 hours for all of England (M+F).

RESUMABLE: Tracks which combos have been scraped. Safe to stop and restart.
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
DEFAULT_YEARS = [2022, 2023, 2024, 2025, 2026]
DEFAULT_AGE_GROUPS = list(range(8, 19))  # 8-18
DEFAULT_SEXES = ["F", "M"]

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

CREATE TABLE IF NOT EXISTS scraped_ranking_combos (
    combo_key TEXT PRIMARY KEY,
    swimmers_found INTEGER DEFAULT 0,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def _combo_key(stroke_code: int, sex: str, age: str, course: str, year: int) -> str:
    return f"{stroke_code}|{sex}|{age}|{course}|{year}"


def _is_combo_scraped(conn: sqlite3.Connection, key: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM scraped_ranking_combos WHERE combo_key = ?", (key,)
    ).fetchone() is not None


def _mark_combo_scraped(conn: sqlite3.Connection, key: str, count: int) -> None:
    conn.execute("""
        INSERT OR REPLACE INTO scraped_ranking_combos (combo_key, swimmers_found)
        VALUES (?, ?)
    """, (key, count))


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
        rank_text = norm_ws(tds[0].get_text(" ", strip=True)).replace(",", "").lstrip("=").strip()
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
    sexes: list[str] | None = None,
    courses: list[str] | None = None,
    years: list[int] | None = None,
    level: str = "N",  # N = National
    force: bool = False,  # if True, re-scrape already-done combos
) -> None:
    """Scrape national rankings for all event/age/course/year/sex combos.

    RESUMABLE: tracks which combos have been scraped. Safe to stop and restart.
    Pass force=True to re-scrape everything from scratch.
    """
    _stroke_codes = stroke_codes or ALL_STROKE_CODES
    _age_groups = age_groups or DEFAULT_AGE_GROUPS
    _sexes = sexes or DEFAULT_SEXES
    _courses = courses or ["S", "L"]
    _years = years or DEFAULT_YEARS

    conn = init_db()
    try:
        ensure_schema(conn)

        if force:
            conn.execute("DELETE FROM scraped_ranking_combos")
            conn.execute("DELETE FROM event_rankings")
            conn.commit()
            print("[Rankings] Force mode: cleared all previous data")

        # Build all combos
        combos = []
        for year in _years:
            for sex in _sexes:
                for stroke_code in _stroke_codes:
                    event_name = STROKE_NAMES.get(stroke_code, f"Stroke {stroke_code}")
                    for age in _age_groups:
                        for course in _courses:
                            combos.append((stroke_code, event_name, str(age), sex, course, year))

        # Filter out already-scraped combos
        total_all = len(combos)
        if not force:
            combos = [c for c in combos
                      if not _is_combo_scraped(conn, _combo_key(c[0], c[3], c[2], c[4], c[5]))]

        skipped = total_all - len(combos)
        total = len(combos)

        print(f"[Rankings] {total_all} total combos ({len(_stroke_codes)} events × "
              f"{len(_sexes)} sexes × {len(_age_groups)} ages × "
              f"{len(_courses)} courses × {len(_years)} years)")
        if skipped:
            print(f"[Rankings] Skipping {skipped} already-scraped combos, {total} remaining")

        if total == 0:
            print("[Rankings] Nothing to do — all combos already scraped")
            return

        total_saved = 0
        total_requests = 0

        for idx, (stroke_code, event_name, age, sex, course, year) in enumerate(combos, start=1):
            key = _combo_key(stroke_code, sex, age, course, year)
            combo_rows: list[dict] = []
            start = 1
            pages = 0

            while pages < MAX_PAGES:
                try:
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
                except Exception as exc:
                    print(f"  [!] Request failed for {event_name} {sex} age {age} "
                          f"{'SC' if course == 'S' else 'LC'} {year}: {exc}")
                    break

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

            # Save this combo's results
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
                total_saved += len(combo_rows)

            # Mark combo as done (even if empty — so we don't retry it)
            _mark_combo_scraped(conn, key, len(combo_rows))
            conn.commit()

            if idx % 25 == 0 or idx == total:
                elapsed_pct = idx / total * 100
                print(f"[Rankings] {idx}/{total} ({elapsed_pct:.0f}%) — "
                      f"{total_saved:,} swimmers stored — {total_requests} requests")

        # Summary
        unique = conn.execute("SELECT COUNT(DISTINCT tiref) FROM event_rankings").fetchone()[0]
        total_rows = conn.execute("SELECT COUNT(*) FROM event_rankings").fetchone()[0]
        print(f"\n[Rankings] Complete: {total_rows:,} ranking entries, "
              f"{unique:,} unique swimmers, {total_requests} requests")
    finally:
        conn.close()


def main() -> None:
    scrape_event_rankings()


if __name__ == "__main__":
    main()
