"""Scrape complete stroke history for CoSA swimmers.

Uses personal_best_time_date.php with tstroke/tcourse params.
18 strokes x 2 courses = 36 requests per swimmer.
For 90 swimmers: ~3,240 requests at 0.4s delay = ~22 minutes.

RESUMABLE: Tracks which swimmers have been scraped. Safe to stop and restart.
"""

from __future__ import annotations

import sqlite3

from .config import ALL_STROKE_CODES, COURSES, HISTORY_URL, COSTA_TIREFS
from .db import init_db, insert_history_rows
from .parsers import norm_ws, parse_date, parse_time_seconds
from .session import fetch_soup


def fetch_history_rows(tiref: int, stroke: int, course: str) -> list[dict]:
    soup = fetch_soup(HISTORY_URL, {
        "back": "individualbest", "tiref": tiref,
        "mode": "A", "tstroke": stroke, "tcourse": course,
    })
    tables = soup.find_all("table", id="rankTable")
    if not tables:
        return []
    table = tables[-1]
    rows: list[dict] = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 8:
            continue
        rows.append({
            "time": norm_ws(tds[0].get_text(" ", strip=True)),
            "wa_points": norm_ws(tds[1].get_text(" ", strip=True)),
            "round": norm_ws(tds[2].get_text(" ", strip=True)),
            "date": norm_ws(tds[3].get_text(" ", strip=True)),
            "meet_name": norm_ws(tds[4].get_text(" ", strip=True)),
            "venue": norm_ws(tds[5].get_text(" ", strip=True)),
            "level": norm_ws(tds[7].get_text(" ", strip=True)),
        })
    return rows


def mark_running_pbs(rows: list[dict]) -> list[dict]:
    sortable = []
    for r in rows:
        dt = parse_date(r["date"])
        ts = parse_time_seconds(r["time"])
        if dt is None or ts is None:
            continue
        sortable.append((dt, ts, r))
    sortable.sort(key=lambda x: (x[0], x[1]))

    out: list[dict] = []
    best = float("inf")
    for _, ts, r in sortable:
        is_pb = 1 if ts <= best else 0
        best = min(best, ts)
        out.append({**r, "is_pb": is_pb})
    return out


def _is_swimmer_scraped(conn: sqlite3.Connection, tiref: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM scraped_swimmer_history WHERE tiref = ?", (tiref,)
    ).fetchone() is not None


def _mark_swimmer_scraped(conn: sqlite3.Connection, tiref: str, count: int) -> None:
    conn.execute("""
        INSERT OR REPLACE INTO scraped_swimmer_history (tiref, swims_found)
        VALUES (?, ?)
    """, (tiref, count))


def scrape_history(
    tirefs: list[int] | None = None,
    *,
    force: bool = False,
) -> None:
    """Scrape full swim history for a list of swimmers.

    RESUMABLE: tracks which swimmers have been scraped.
    """
    _tirefs = tirefs or COSTA_TIREFS

    conn = init_db()
    try:
        if force:
            conn.execute("DELETE FROM scraped_swimmer_history")
            conn.execute("DELETE FROM swimmer_history")
            conn.commit()
            print("[History] Force mode: cleared all previous data")

        to_scrape = [t for t in _tirefs
                     if force or not _is_swimmer_scraped(conn, str(t))]

        skipped = len(_tirefs) - len(to_scrape)
        total = len(to_scrape)

        print(f"[History] {len(_tirefs)} swimmers, {skipped} already done, {total} remaining")
        if total == 0:
            print("[History] Nothing to do")
            return

        total_saved = 0

        for idx, tiref in enumerate(to_scrape, start=1):
            conn.execute("DELETE FROM swimmer_history WHERE tiref = ?", (str(tiref),))
            conn.commit()
            swimmer_total = 0

            for stroke in ALL_STROKE_CODES:
                for course in COURSES:
                    try:
                        raw = fetch_history_rows(tiref, stroke, course)
                        rows = mark_running_pbs(raw)
                        insert_history_rows(conn, tiref=tiref, stroke=stroke,
                                            course=course, rows=rows)
                        conn.commit()
                        swimmer_total += len(rows)
                    except Exception as exc:
                        print(f"  [!] tiref {tiref} stroke {stroke} "
                              f"course {course}: {exc}")
                        continue

            _mark_swimmer_scraped(conn, str(tiref), swimmer_total)
            conn.commit()
            total_saved += swimmer_total
            print(f"[History] {idx}/{total}: tiref {tiref} — {swimmer_total} swims")

        print(f"\n[History] Complete: {total_saved:,} swims for {total} swimmers")
    finally:
        conn.close()


def main() -> None:
    scrape_history()


if __name__ == "__main__":
    main()
