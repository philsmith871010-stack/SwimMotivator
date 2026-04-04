"""Export SQLite data to JSON files for the motivational dashboard."""

from __future__ import annotations

import json
import sqlite3

from .config import BELLA_TIREF, BELLA_YOB, AMBER_TIREF, AMBER_YOB, DB_PATH, JSON_DIR, STROKE_NAMES, TARGET_SWIMMERS


def _dict_rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict]:
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def export_config(conn: sqlite3.Connection) -> None:
    config = {
        "swimmers": {
            "bella": {"tiref": BELLA_TIREF, "name": "Bella", "yob": BELLA_YOB},
            "amber": {"tiref": AMBER_TIREF, "name": "Amber", "yob": AMBER_YOB},
        },
        "stroke_names": {str(k): v for k, v in STROKE_NAMES.items()},
    }
    (JSON_DIR / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    print("  config.json")


def export_personal_bests(conn: sqlite3.Connection) -> None:
    rows = _dict_rows(conn, """
        SELECT pb.tiref, pb.course, pb.stroke, pb.time, pb.wa_points, pb.date, pb.meet,
               s.name as swimmer_name, s.yob
        FROM personal_bests pb
        JOIN swimmers s ON pb.tiref = s.tiref
        WHERE pb.tiref IN (?, ?)
        ORDER BY pb.wa_points DESC
    """, (BELLA_TIREF, AMBER_TIREF))
    (JSON_DIR / "personal_bests.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"  personal_bests.json: {len(rows)} PBs")


def export_history(conn: sqlite3.Connection) -> None:
    """Export history for Bella & Amber only (the chart needs it)."""
    history_dir = JSON_DIR / "history"
    history_dir.mkdir(parents=True, exist_ok=True)
    for tiref in [BELLA_TIREF, AMBER_TIREF]:
        rows = _dict_rows(conn, """
            SELECT stroke_code, course, date, time, is_pb, meet_name, venue, wa_points, round, level
            FROM swimmer_history WHERE tiref = ? ORDER BY stroke_code, course, date
        """, (str(tiref),))
        (history_dir / f"{tiref}.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print(f"  history/{tiref}.json: {len(rows)} swims")


def export_ranks(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn, "swimmer_ranks"):
        print("  ranks.json: table not found, skipping")
        return
    rows = _dict_rows(conn, """
        SELECT * FROM swimmer_ranks ORDER BY tiref, event, course, year
    """)
    (JSON_DIR / "ranks.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"  ranks.json: {len(rows)} ranking entries")


def export_squad(conn: sqlite3.Connection) -> None:
    """Export female Costa swimmers' best times per event for club standings."""
    rows = _dict_rows(conn, """
        SELECT
            mr.tiref,
            mr.swimmer_name,
            mr.yob,
            mr.event,
            MIN(mr.time) as best_time,
            MAX(CAST(mr.wa_points AS INTEGER)) as best_wa,
            mr.meet_date
        FROM meet_results mr
        WHERE mr.club LIKE '%St Albans%'
          AND mr.sex = 'F'
          AND mr.time IS NOT NULL
          AND TRIM(mr.time) <> ''
        GROUP BY mr.tiref, mr.event
        ORDER BY mr.event, best_time
    """)
    (JSON_DIR / "squad.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    unique = len(set(r["tiref"] for r in rows))
    print(f"  squad.json: {len(rows)} entries, {unique} swimmers")


def main() -> None:
    JSON_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        print("[Export] Writing JSON files...")
        export_config(conn)
        export_personal_bests(conn)
        export_history(conn)
        export_ranks(conn)
        export_squad(conn)
        print("[Export] Done!")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
