"""Derive per-swimmer ranking data from bulk event_rankings table.

This no longer makes any network requests — it reads from the
event_rankings table (populated by scrape_rankings.py) and builds
the swimmer_ranks table used by the frontend.

Can extract ranks for all CoSA swimmers, or any set of swimmers.
"""

from __future__ import annotations

import sqlite3

from .config import DB_PATH, TARGET_SWIMMERS
from .db import init_db

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


def _get_costa_tirefs(conn: sqlite3.Connection) -> set[str]:
    """Get all CoSA swimmer tirefs from the database."""
    tirefs = set()

    # From swimmers table
    rows = conn.execute("""
        SELECT DISTINCT tiref FROM swimmers
        WHERE club LIKE '%St Albans%' AND sex = 'F'
    """).fetchall()
    for (tiref,) in rows:
        tirefs.add(str(tiref))

    # From meet results
    rows = conn.execute("""
        SELECT DISTINCT tiref FROM meet_results
        WHERE club LIKE '%St Albans%' AND sex = 'F'
    """).fetchall()
    for (tiref,) in rows:
        tirefs.add(str(tiref))

    # Always include target swimmers
    for tiref in TARGET_SWIMMERS:
        tirefs.add(str(tiref))

    return tirefs


def derive_swimmer_ranks(tirefs: set[str] | None = None) -> None:
    """Extract per-swimmer ranks from event_rankings for given tirefs.

    If tirefs is None, extracts for all CoSA swimmers.
    """
    conn = init_db()
    try:
        ensure_schema(conn)

        # Check event_rankings exists and has data
        has_data = conn.execute("""
            SELECT COUNT(*) FROM sqlite_master
            WHERE type='table' AND name='event_rankings'
        """).fetchone()[0]
        if not has_data:
            print("[Swimmer Ranks] event_rankings table not found. Run scrape_rankings first.")
            return

        count = conn.execute("SELECT COUNT(*) FROM event_rankings").fetchone()[0]
        if not count:
            print("[Swimmer Ranks] event_rankings table is empty. Run scrape_rankings first.")
            return

        # Get target tirefs
        if tirefs is None:
            tirefs = _get_costa_tirefs(conn)
        print(f"[Swimmer Ranks] Extracting ranks for {len(tirefs)} swimmers from {count:,} ranking entries...")

        conn.execute("DELETE FROM swimmer_ranks")
        conn.commit()

        # Get total swimmers per event/course/year for total_in_ranking
        totals = {}
        for row in conn.execute("""
            SELECT event, course, year, age_group, COUNT(*) as cnt
            FROM event_rankings
            GROUP BY event, course, year, age_group
        """).fetchall():
            totals[(row[0], row[1], row[2], row[3])] = row[4]

        # Extract ranks for our swimmers
        placeholders = ",".join(["?"] * len(tirefs))
        rows = conn.execute(f"""
            SELECT tiref, event, course, year, age_group, rank, time, swimmer_name
            FROM event_rankings
            WHERE tiref IN ({placeholders})
            ORDER BY tiref, event, course, year
        """, list(tirefs)).fetchall()

        inserted = 0
        swimmers_found = set()
        null_fixed = 0
        for tiref, event, course, year, age_group, rank, time_val, name in rows:
            total = totals.get((event, course, year, age_group), 0)
            try:
                age_int = int(age_group)
            except (ValueError, TypeError):
                age_int = 0

            # If rank is null but we have a time, compute rank from position
            # by counting how many swimmers have a faster time in the same event
            actual_rank = rank
            if actual_rank is None and time_val:
                computed = conn.execute("""
                    SELECT COUNT(*) FROM event_rankings
                    WHERE event = ? AND course = ? AND year = ? AND age_group = ?
                      AND time < ?
                """, (event, course, year, age_group, time_val)).fetchone()[0]
                actual_rank = computed + 1
                null_fixed += 1

            conn.execute("""
                INSERT OR REPLACE INTO swimmer_ranks
                    (tiref, event, course, year, age_group, rank, total_in_ranking, time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (int(tiref) if str(tiref).isdigit() else tiref,
                  event, course, int(year), age_int, actual_rank, total, time_val))
            inserted += 1
            swimmers_found.add(tiref)

        conn.commit()
        print(f"[Swimmer Ranks] Done: {inserted} rankings for {len(swimmers_found)} swimmers")
        if null_fixed:
            print(f"[Swimmer Ranks] Computed {null_fixed} missing ranks from time-based position")

    finally:
        conn.close()


def main() -> None:
    derive_swimmer_ranks()


if __name__ == "__main__":
    main()
