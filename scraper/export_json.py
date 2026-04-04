"""Export SQLite data to JSON files for the static dashboard."""

from __future__ import annotations

import json
import sqlite3

from .config import BELLA_TIREF, AMBER_TIREF, DB_PATH, JSON_DIR, STROKE_NAMES, TARGET_TIREFS


def _dict_rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict]:
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def export_swimmers(conn: sqlite3.Connection) -> None:
    rows = _dict_rows(conn, "SELECT * FROM swimmers ORDER BY name")
    (JSON_DIR / "swimmers.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"  swimmers.json: {len(rows)} swimmers")


def export_personal_bests(conn: sqlite3.Connection) -> None:
    rows = _dict_rows(conn, """
        SELECT pb.*, s.name as swimmer_name, s.yob, s.sex, s.club
        FROM personal_bests pb
        JOIN swimmers s ON pb.tiref = s.tiref
        ORDER BY s.name, pb.course, pb.stroke
    """)
    (JSON_DIR / "personal_bests.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"  personal_bests.json: {len(rows)} PBs")


def export_history(conn: sqlite3.Connection) -> None:
    history_dir = JSON_DIR / "history"
    history_dir.mkdir(parents=True, exist_ok=True)

    tirefs = conn.execute("SELECT DISTINCT tiref FROM swimmer_history").fetchall()
    for (tiref,) in tirefs:
        rows = _dict_rows(conn, """
            SELECT * FROM swimmer_history WHERE tiref = ? ORDER BY stroke_code, course, date
        """, (tiref,))
        (history_dir / f"{tiref}.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")

    # Also export a combined index of who has history
    index = _dict_rows(conn, """
        SELECT DISTINCT h.tiref,
            COALESCE(s.name, mr.swimmer_name, 'Swimmer ' || h.tiref) as swimmer_name,
            COALESCE(s.yob, mr.yob) as yob,
            COALESCE(s.sex, mr.sex) as sex,
            COALESCE(s.club, mr.club) as club
        FROM swimmer_history h
        LEFT JOIN swimmers s ON CAST(h.tiref AS INTEGER) = s.tiref
        LEFT JOIN (
            SELECT tiref, swimmer_name, yob, sex, club,
                   ROW_NUMBER() OVER (PARTITION BY tiref ORDER BY id) as rn
            FROM meet_results
        ) mr ON h.tiref = mr.tiref AND mr.rn = 1
        ORDER BY swimmer_name
    """)
    (JSON_DIR / "history_index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"  history/: {len(tirefs)} swimmer files, {len(index)} in index")


def export_meet_results(conn: sqlite3.Connection) -> None:
    rows = _dict_rows(conn, """
        SELECT * FROM meet_results ORDER BY meet_date DESC, meet_name, event
    """)
    (JSON_DIR / "meet_results.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"  meet_results.json: {len(rows)} results")


def export_clubs(conn: sqlite3.Connection) -> None:
    rows = _dict_rows(conn, "SELECT * FROM clubs ORDER BY club_name")
    (JSON_DIR / "clubs.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"  clubs.json: {len(rows)} clubs")


def export_config(conn: sqlite3.Connection) -> None:
    """Export a config file with stroke names, target tirefs, etc."""
    config = {
        "target_tirefs": {"bella": BELLA_TIREF, "amber": AMBER_TIREF},
        "stroke_names": {str(k): v for k, v in STROKE_NAMES.items()},
    }
    (JSON_DIR / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    print("  config.json: exported")


def main() -> None:
    JSON_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        print("[Export] Writing JSON files...")
        export_config(conn)
        export_swimmers(conn)
        export_personal_bests(conn)
        export_history(conn)
        export_meet_results(conn)
        export_clubs(conn)
        print("[Export] Done!")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
