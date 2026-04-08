"""Scrape event rankings at national, regional, and county levels.

Uses the eventrankings.php endpoint with TargetRegion/TargetCounty filters
to get authoritative rankings at each geographic level.

RESUMABLE: Tracks which combos have been scraped. Safe to stop and restart.
"""

from __future__ import annotations

import sqlite3

from .config import (
    RANKINGS_URL, ALL_STROKE_CODES, STROKE_NAMES,
    RANKING_LEVELS, RANKING_YEARS, DEFAULT_AGE_GROUPS, DEFAULT_SEXES,
)
from .db import init_db, insert_rankings
from .parsers import norm_ws, parse_tiref_from_href
from .session import fetch_soup

PAGE_SIZE = 100
MAX_PAGES = 30  # up to rank 3000 per combo


def _combo_key(stroke_code: int, sex: str, age: str, course: str,
               year: int, level: str) -> str:
    return f"{stroke_code}|{sex}|{age}|{course}|{year}|{level}"


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
                         age_group: str, year: int, level: str) -> list[dict]:
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
            "rank": rank,
            "total_in_ranking": None,  # filled in after all pages
            "time": time_val,
            "meet_name": meet_name,
            "date": date,
            "year": year,
            "level": level,
        })
    return rows


def scrape_event_rankings(
    *,
    stroke_codes: list[int] | None = None,
    age_groups: list[int] | None = None,
    sexes: list[str] | None = None,
    courses: list[str] | None = None,
    years: list[int] | None = None,
    levels: list[str] | None = None,
    force: bool = False,
) -> None:
    """Scrape rankings for all event/age/course/year/sex/level combos.

    RESUMABLE: tracks which combos have been scraped. Safe to stop and restart.
    """
    _stroke_codes = stroke_codes or ALL_STROKE_CODES
    _age_groups = age_groups or DEFAULT_AGE_GROUPS
    _sexes = sexes or DEFAULT_SEXES
    _courses = courses or ["S", "L"]
    _years = years or RANKING_YEARS
    _levels = levels or list(RANKING_LEVELS.keys())

    conn = init_db()
    try:
        if force:
            conn.execute("DELETE FROM scraped_ranking_combos")
            conn.execute("DELETE FROM rankings")
            conn.commit()
            print("[Rankings] Force mode: cleared all previous data")

        # Build all combos
        combos = []
        for level in _levels:
            for year in _years:
                for sex in _sexes:
                    for stroke_code in _stroke_codes:
                        event_name = STROKE_NAMES.get(stroke_code, f"Stroke {stroke_code}")
                        for age in _age_groups:
                            for course in _courses:
                                combos.append((stroke_code, event_name, str(age),
                                               sex, course, year, level))

        total_all = len(combos)
        if not force:
            combos = [c for c in combos
                      if not _is_combo_scraped(conn,
                          _combo_key(c[0], c[3], c[2], c[4], c[5], c[6]))]

        skipped = total_all - len(combos)
        total = len(combos)

        print(f"[Rankings] {total_all} total combos ({len(_stroke_codes)} events x "
              f"{len(_sexes)} sexes x {len(_age_groups)} ages x "
              f"{len(_courses)} courses x {len(_years)} years x {len(_levels)} levels)")
        if skipped:
            print(f"[Rankings] Skipping {skipped} already-scraped, {total} remaining")

        if total == 0:
            print("[Rankings] Nothing to do")
            return

        total_saved = 0
        total_requests = 0

        for idx, (stroke_code, event_name, age, sex, course, year, level) in enumerate(combos, start=1):
            key = _combo_key(stroke_code, sex, age, course, year, level)
            level_params = RANKING_LEVELS[level]
            combo_rows: list[dict] = []
            start = 1
            pages = 0

            while pages < MAX_PAGES:
                params = {
                    "Pool": course,
                    "Stroke": str(stroke_code),
                    "Sex": sex,
                    "TargetYear": str(year),
                    "AgeGroup": age,
                    "AgeAt": "A",
                    "TargetNationality": "P",
                    "StartNumber": str(start),
                    "RecordsToView": str(PAGE_SIZE),
                    **level_params,
                }
                try:
                    soup = fetch_soup(RANKINGS_URL, params)
                    total_requests += 1
                except Exception as exc:
                    print(f"  [!] Failed: {event_name} {sex} age {age} "
                          f"{'SC' if course == 'S' else 'LC'} {year} {level}: {exc}")
                    break

                rows = _parse_rankings_page(
                    soup, event=event_name, course=course, sex=sex,
                    age_group=age, year=year, level=level,
                )

                if not rows:
                    break

                combo_rows.extend(rows)
                pages += 1

                if len(rows) < PAGE_SIZE:
                    break
                start += PAGE_SIZE

            # Set total_in_ranking for all rows in this combo
            max_rank = max((r["rank"] for r in combo_rows if r["rank"]), default=0)
            total_count = max(max_rank, len(combo_rows))
            for r in combo_rows:
                r["total_in_ranking"] = total_count

            if combo_rows:
                insert_rankings(conn, combo_rows)
                total_saved += len(combo_rows)

            _mark_combo_scraped(conn, key, len(combo_rows))
            conn.commit()

            if idx % 50 == 0 or idx == total:
                pct = idx / total * 100
                print(f"[Rankings] {idx}/{total} ({pct:.0f}%) — "
                      f"{total_saved:,} entries — {total_requests} requests")

        unique = conn.execute("SELECT COUNT(DISTINCT tiref) FROM rankings").fetchone()[0]
        total_rows = conn.execute("SELECT COUNT(*) FROM rankings").fetchone()[0]
        print(f"\n[Rankings] Complete: {total_rows:,} entries, "
              f"{unique:,} unique swimmers, {total_requests} requests")
    finally:
        conn.close()


def main() -> None:
    scrape_event_rankings()


if __name__ == "__main__":
    main()
