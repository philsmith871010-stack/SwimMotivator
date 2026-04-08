"""Scrape ALL times for a swimmer in one request using /individualalltimes/.

This endpoint shows every time a swimmer has ever recorded across ALL events
and courses on a single page. Compared to scrape_history.py which makes 36
requests per swimmer (18 strokes × 2 courses), this does it in 1-2 requests
(one per course, or potentially just one if the page shows both).

Key discovery: The /individualalltimes/ endpoint uses the same parameters as
/individualbest/personal_best_time_date.php:
    tiref   = swimmer ID
    mode    = A (all time)
    tcourse = S (short course) or L (long course)

But it returns ALL strokes on one page instead of requiring tstroke per-event.

Speed improvement:
    - Old: 36 requests per swimmer  →  3,240 for 90 CoSA swimmers
    - New: 2 requests per swimmer   →  180 for 90 CoSA swimmers  (18x faster)
    - For 2,000 Herts swimmers: 4,000 vs 72,000 requests

RESUMABLE: Tracks which swimmers have been scraped. Safe to stop and restart.
"""

from __future__ import annotations

import sqlite3

from .config import BASE_URL, DB_PATH, ALL_STROKE_CODES, STROKE_NAMES
from .db import init_db, insert_history_rows
from .parsers import norm_ws, parse_date, parse_time_seconds
from .session import fetch_soup

ALL_TIMES_URL = f"{BASE_URL}/individualalltimes/individual_all_times.php"

# Fallback: if /individualalltimes/ doesn't work as expected, we can still
# use /individualbest/personal_best_time_date.php but without tstroke to get
# all events. The exact URL format needs testing on the live site.
HISTORY_URL = f"{BASE_URL}/individualbest/personal_best_time_date.php"

SCHEMA = """
CREATE TABLE IF NOT EXISTS scraped_swimmers_alltimes (
    tiref TEXT PRIMARY KEY,
    sc_rows INTEGER DEFAULT 0,
    lc_rows INTEGER DEFAULT 0,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def _is_swimmer_scraped(conn: sqlite3.Connection, tiref: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM scraped_swimmers_alltimes WHERE tiref = ?", (tiref,)
    ).fetchone() is not None


def _mark_swimmer_scraped(conn: sqlite3.Connection, tiref: str,
                          sc_rows: int, lc_rows: int) -> None:
    conn.execute("""
        INSERT OR REPLACE INTO scraped_swimmers_alltimes (tiref, sc_rows, lc_rows)
        VALUES (?, ?, ?)
    """, (tiref, sc_rows, lc_rows))


def _detect_stroke_code(event_text: str) -> int | None:
    """Map event text from the page back to a stroke code."""
    event_text = event_text.strip()
    # Build reverse map from STROKE_NAMES
    for code, name in STROKE_NAMES.items():
        if name.lower() == event_text.lower():
            return code
    # Try partial matching
    text_lower = event_text.lower()
    for code, name in STROKE_NAMES.items():
        if name.lower() in text_lower or text_lower in name.lower():
            return code
    return None


def _parse_all_times_page(soup) -> list[dict]:
    """Parse the individualalltimes page which shows all events in sections.

    The page structure has event headers followed by result tables.
    Each section has an event name (e.g., "50 Freestyle") and a table of times.

    Returns list of dicts with: stroke_code, time, date, meet_name, venue,
    wa_points, round, level
    """
    rows: list[dict] = []

    # Try rankTable format (same as personal_best_time_date.php)
    tables = soup.find_all("table", id="rankTable")
    if tables:
        # Multiple rankTables, each preceded by an event heading
        # Look for h3/h4/strong tags before each table
        all_headings = soup.find_all(["h3", "h4", "h2"])
        heading_map = {}
        for h in all_headings:
            text = norm_ws(h.get_text(" ", strip=True))
            # Find the next table after this heading
            next_table = h.find_next("table", id="rankTable")
            if next_table:
                heading_map[id(next_table)] = text

        for table in tables:
            event_text = heading_map.get(id(table), "")
            stroke_code = _detect_stroke_code(event_text)

            for tr in table.find_all("tr"):
                tds = tr.find_all("td")
                if len(tds) < 8:
                    continue
                rows.append({
                    "stroke_code": stroke_code,
                    "event_text": event_text,
                    "time": norm_ws(tds[0].get_text(" ", strip=True)),
                    "wa_points": norm_ws(tds[1].get_text(" ", strip=True)),
                    "round": norm_ws(tds[2].get_text(" ", strip=True)),
                    "date": norm_ws(tds[3].get_text(" ", strip=True)),
                    "meet_name": norm_ws(tds[4].get_text(" ", strip=True)),
                    "venue": norm_ws(tds[5].get_text(" ", strip=True)),
                    "level": norm_ws(tds[7].get_text(" ", strip=True)) if len(tds) > 7 else "",
                })

    # Alternative: try generic table parsing if no rankTables found
    if not rows:
        # Some pages use a single large table with event rows interspersed
        for table in soup.find_all("table"):
            current_event = ""
            current_stroke = None
            for tr in table.find_all("tr"):
                tds = tr.find_all("td")
                # Event header row (usually has colspan or fewer columns)
                if len(tds) == 1:
                    text = norm_ws(tds[0].get_text(" ", strip=True))
                    if text:
                        current_event = text
                        current_stroke = _detect_stroke_code(text)
                    continue
                if len(tds) < 6:
                    continue
                rows.append({
                    "stroke_code": current_stroke,
                    "event_text": current_event,
                    "time": norm_ws(tds[0].get_text(" ", strip=True)),
                    "wa_points": norm_ws(tds[1].get_text(" ", strip=True)) if len(tds) > 1 else "",
                    "round": norm_ws(tds[2].get_text(" ", strip=True)) if len(tds) > 2 else "",
                    "date": norm_ws(tds[3].get_text(" ", strip=True)) if len(tds) > 3 else "",
                    "meet_name": norm_ws(tds[4].get_text(" ", strip=True)) if len(tds) > 4 else "",
                    "venue": norm_ws(tds[5].get_text(" ", strip=True)) if len(tds) > 5 else "",
                    "level": norm_ws(tds[7].get_text(" ", strip=True)) if len(tds) > 7 else "",
                })

    return rows


def mark_running_pbs(rows: list[dict]) -> list[dict]:
    """Mark which entries are running PBs (best time up to that date)."""
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


def fetch_swimmer_all_times(tiref: int, course: str) -> list[dict]:
    """Fetch all times for a swimmer in one request.

    Tries /individualalltimes/ first. Falls back to standard per-event
    endpoint if the all-times page doesn't return usable data.
    """
    # Try the all-times endpoint
    try:
        soup = fetch_soup(ALL_TIMES_URL, {
            "tiref": tiref,
            "mode": "A",
            "tcourse": course,
        })
        rows = _parse_all_times_page(soup)
        if rows:
            return rows
    except Exception:
        pass

    # Fallback: try without tstroke on the standard endpoint
    # This might show all strokes on one page
    try:
        soup = fetch_soup(HISTORY_URL, {
            "back": "individualbest",
            "tiref": tiref,
            "mode": "A",
            "tcourse": course,
        })
        rows = _parse_all_times_page(soup)
        if rows:
            return rows
    except Exception:
        pass

    return []


def scrape_all_times(
    tirefs: list[int] | list[str],
    *,
    force: bool = False,
) -> None:
    """Scrape all times for a list of swimmers using the fast endpoint.

    RESUMABLE: tracks which swimmers have been scraped.
    """
    conn = init_db()
    try:
        ensure_schema(conn)

        if force:
            conn.execute("DELETE FROM scraped_swimmers_alltimes")
            conn.commit()
            print("[AllTimes] Force mode: cleared progress tracker")

        # Filter already-scraped
        to_scrape = []
        for t in tirefs:
            tiref_str = str(t)
            if force or not _is_swimmer_scraped(conn, tiref_str):
                to_scrape.append(int(tiref_str) if str(tiref_str).isdigit() else tiref_str)

        skipped = len(tirefs) - len(to_scrape)
        total = len(to_scrape)

        print(f"[AllTimes] {len(tirefs)} swimmers total, {skipped} already done, {total} remaining")
        if total == 0:
            print("[AllTimes] Nothing to do")
            return

        total_saved = 0

        for idx, tiref in enumerate(to_scrape, start=1):
            # Clear existing history for this swimmer
            conn.execute("DELETE FROM swimmer_history WHERE tiref = ?", (str(tiref),))
            conn.commit()

            sc_count = 0
            lc_count = 0

            for course in ["S", "L"]:
                raw = fetch_swimmer_all_times(tiref, course)

                if raw:
                    # Group by stroke code and process each group
                    by_stroke: dict[int, list[dict]] = {}
                    for r in raw:
                        sc = r.get("stroke_code")
                        if sc is not None:
                            by_stroke.setdefault(sc, []).append(r)

                    for stroke_code, stroke_rows in by_stroke.items():
                        marked = mark_running_pbs(stroke_rows)
                        insert_history_rows(
                            conn, tiref=tiref, stroke=stroke_code,
                            course=course, rows=marked
                        )
                        if course == "S":
                            sc_count += len(marked)
                        else:
                            lc_count += len(marked)
                else:
                    # Fallback: use the old per-event approach for this swimmer
                    from .scrape_history import fetch_history_rows
                    for stroke in ALL_STROKE_CODES:
                        try:
                            rows = fetch_history_rows(tiref, stroke, course)
                            from .scrape_history import mark_running_pbs as mark_pbs
                            marked = mark_pbs(rows)
                            insert_history_rows(
                                conn, tiref=tiref, stroke=stroke,
                                course=course, rows=marked
                            )
                            if course == "S":
                                sc_count += len(marked)
                            else:
                                lc_count += len(marked)
                        except Exception:
                            continue

            _mark_swimmer_scraped(conn, str(tiref), sc_count, lc_count)
            conn.commit()
            total_saved += sc_count + lc_count

            if idx % 10 == 0 or idx == total or idx == 1:
                print(f"[AllTimes] {idx}/{total}: tiref {tiref} — "
                      f"{sc_count} SC + {lc_count} LC = {sc_count + lc_count} swims "
                      f"(total: {total_saved:,})")

        print(f"\n[AllTimes] Complete: {total_saved:,} swims for {total} swimmers")
    finally:
        conn.close()


def main() -> None:
    """Scrape all CoSA swimmers using the fast endpoint."""
    from .config import COSTA_TIREFS
    scrape_all_times(COSTA_TIREFS)


if __name__ == "__main__":
    main()
