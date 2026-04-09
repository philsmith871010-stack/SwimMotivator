"""Export SQLite data to JSON files for the frontend.

Reads from the new schema (swimmers, personal_bests, swimmer_history, rankings)
and produces per-swimmer JSON files plus aggregate ranking files.
"""

from __future__ import annotations

import json
import sqlite3

from .config import DB_PATH, JSON_DIR, STROKE_NAMES, CLUB_NAME_PATTERN, SQUAD_MIN_YEAR
from .db import get_club_tirefs


def _dict_rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict]:
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def export_config() -> None:
    config = {
        "stroke_names": {str(k): v for k, v in STROKE_NAMES.items()},
    }
    (JSON_DIR / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    print("  config.json")


def export_swimmers(conn: sqlite3.Connection) -> None:
    """Export list of all CoSA swimmers."""
    rows = _dict_rows(conn, """
        SELECT tiref, name, yob, sex, club FROM swimmers
        ORDER BY name
    """)
    (JSON_DIR / "swimmers.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"  swimmers.json: {len(rows)} swimmers")


def export_per_swimmer(conn: sqlite3.Connection) -> None:
    """Export a single JSON file per swimmer with PBs, history, and rankings."""
    swimmers_dir = JSON_DIR / "swimmers"
    swimmers_dir.mkdir(parents=True, exist_ok=True)

    # Get club swimmers from rankings + any in swimmers table
    tirefs = [str(t) for t in get_club_tirefs(conn, CLUB_NAME_PATTERN, min_year=SQUAD_MIN_YEAR)]
    for row in conn.execute("SELECT tiref FROM swimmers").fetchall():
        t = str(row[0])
        if t not in tirefs:
            tirefs.append(t)

    exported = 0
    for tiref in sorted(tirefs):
        # Swimmer info
        info = conn.execute(
            "SELECT tiref, name, yob, sex, club FROM swimmers WHERE tiref = ?",
            (int(tiref) if tiref.isdigit() else tiref,)
        ).fetchone()

        if not info:
            continue

        swimmer = dict(info)

        # Personal bests
        swimmer["pbs"] = _dict_rows(conn, """
            SELECT course, stroke, time, converted_time, wa_points, date, meet, venue
            FROM personal_bests WHERE tiref = ?
            ORDER BY stroke, course
        """, (int(tiref),))

        # Full history
        swimmer["history"] = _dict_rows(conn, """
            SELECT stroke_code, course, date, time, is_pb, meet_name, wa_points
            FROM swimmer_history WHERE tiref = ?
            ORDER BY stroke_code, course, date
        """, (tiref,))

        # Rankings at all levels
        swimmer["rankings"] = {}
        for level in ["national", "regional", "county"]:
            swimmer["rankings"][level] = _dict_rows(conn, """
                SELECT event, course, year, age_group, rank, total_in_ranking, time
                FROM rankings WHERE tiref = ? AND level = ?
                ORDER BY event, course, year
            """, (tiref, level))

        out_path = swimmers_dir / f"{tiref}.json"
        out_path.write_text(json.dumps(swimmer, indent=2), encoding="utf-8")
        exported += 1

    print(f"  swimmers/: {exported} per-swimmer files")


def export_rankings_by_level(conn: sqlite3.Connection) -> None:
    """Export aggregate ranking files for county/regional/national."""
    if not _table_exists(conn, "rankings"):
        print("  rankings: no data")
        return

    costa_set = set(str(t) for t in get_club_tirefs(conn, CLUB_NAME_PATTERN, min_year=SQUAD_MIN_YEAR))

    for level in ["county", "regional", "national"]:
        rows = _dict_rows(conn, """
            SELECT tiref, swimmer_name, club, yob, sex, event, course,
                   age_group, rank, total_in_ranking, time, year
            FROM rankings WHERE level = ?
            ORDER BY event, course, year, rank
        """, (level,))

        # Filter to just CoSA swimmers for the aggregate file
        costa_rows = [r for r in rows if str(r["tiref"]) in costa_set]

        filename = f"{level}_ranks.json"
        (JSON_DIR / filename).write_text(json.dumps(costa_rows, indent=2), encoding="utf-8")
        unique = len(set(str(r["tiref"]) for r in costa_rows))
        print(f"  {filename}: {len(costa_rows)} entries for {unique} CoSA swimmers")


def main() -> None:
    JSON_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        print("[Export] Writing JSON files...")
        export_config()
        export_swimmers(conn)
        export_per_swimmer(conn)
        export_rankings_by_level(conn)
        print("[Export] Done!")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
