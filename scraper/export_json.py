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
        WHERE s.sex = 'F' AND s.club LIKE '%St Albans%'
        ORDER BY pb.wa_points DESC
    """)
    (JSON_DIR / "personal_bests.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    unique = len(set(r["tiref"] for r in rows))
    print(f"  personal_bests.json: {len(rows)} PBs for {unique} swimmers")


def export_history(conn: sqlite3.Connection) -> None:
    """Export history for Bella, Amber, and all female Costa swimmers with history."""
    history_dir = JSON_DIR / "history"
    history_dir.mkdir(parents=True, exist_ok=True)

    # Get all female Costa swimmer tirefs that have history
    costa_tirefs = set()
    for row in conn.execute("""
        SELECT DISTINCT mr.tiref FROM meet_results mr
        WHERE mr.club LIKE '%St Albans%' AND mr.sex = 'F'
    """).fetchall():
        costa_tirefs.add(str(row[0]))
    # Always include Bella & Amber
    costa_tirefs.add(str(BELLA_TIREF))
    costa_tirefs.add(str(AMBER_TIREF))

    exported = 0
    for tiref in sorted(costa_tirefs):
        rows = _dict_rows(conn, """
            SELECT stroke_code, course, date, time, is_pb, meet_name, wa_points
            FROM swimmer_history WHERE tiref = ? ORDER BY stroke_code, course, date
        """, (tiref,))
        if rows:
            (history_dir / f"{tiref}.json").write_text(json.dumps(rows), encoding="utf-8")
            exported += 1
    print(f"  history/: {exported} swimmer files")


def export_ranks(conn: sqlite3.Connection) -> None:
    # Prefer swimmer_ranks (derived from bulk event_rankings)
    if _table_exists(conn, "swimmer_ranks"):
        count = conn.execute("SELECT COUNT(*) FROM swimmer_ranks").fetchone()[0]
        if count:
            rows = _dict_rows(conn, """
                SELECT * FROM swimmer_ranks ORDER BY tiref, event, course, year
            """)
            (JSON_DIR / "ranks.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
            unique = len(set(r["tiref"] for r in rows))
            print(f"  ranks.json: {len(rows)} ranking entries for {unique} swimmers")
            return

    # Fallback: build from event_rankings for CoSA swimmers
    if _table_exists(conn, "event_rankings"):
        count = conn.execute("SELECT COUNT(*) FROM event_rankings").fetchone()[0]
        if count:
            rows = _dict_rows(conn, """
                SELECT er.tiref, er.event, er.course, er.year,
                       CAST(er.age_group AS INTEGER) as age_group,
                       er.rank, er.time,
                       (SELECT COUNT(*) FROM event_rankings er2
                        WHERE er2.event = er.event AND er2.course = er.course
                        AND er2.year = er.year AND er2.age_group = er.age_group) as total_in_ranking
                FROM event_rankings er
                WHERE er.club LIKE '%St Albans%'
                ORDER BY er.tiref, er.event, er.course, er.year
            """)
            (JSON_DIR / "ranks.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
            unique = len(set(r["tiref"] for r in rows))
            print(f"  ranks.json: {len(rows)} ranking entries for {unique} swimmers (from event_rankings)")
            return

    print("  ranks.json: no ranking data found, writing empty array")
    (JSON_DIR / "ranks.json").write_text("[]", encoding="utf-8")


def export_squad(conn: sqlite3.Connection) -> None:
    """Export female Costa swimmers' best times per event from history data."""
    # Build squad from swimmer_history for all Costa female swimmers
    # First get the Costa female swimmer list
    costa_females = conn.execute("""
        SELECT DISTINCT mr.tiref, mr.swimmer_name, mr.yob
        FROM meet_results mr
        WHERE mr.club LIKE '%St Albans%' AND mr.sex = 'F'
          AND mr.swimmer_name IS NOT NULL
        GROUP BY mr.tiref
    """).fetchall()

    tiref_info = {}
    for tiref, name, yob in costa_females:
        tiref_info[str(tiref)] = {"name": name, "yob": yob}

    # Also add from swimmers table
    for row in conn.execute("SELECT tiref, name, yob FROM swimmers WHERE sex = 'F' AND club LIKE '%St Albans%'").fetchall():
        t = str(row[0])
        if t not in tiref_info:
            tiref_info[t] = {"name": row[1], "yob": row[2]}

    stroke_map = {str(k): v for k, v in STROKE_NAMES.items()}

    from .parsers import parse_time_seconds

    # Get best times from history for these swimmers (SC only)
    rows = []
    for tiref, info in tiref_info.items():
        hist = conn.execute("""
            SELECT stroke_code, time, wa_points
            FROM swimmer_history
            WHERE tiref = ? AND course = 'S' AND time IS NOT NULL AND TRIM(time) <> ''
        """, (tiref,)).fetchall()

        # Group by stroke and find actual fastest time (numeric comparison)
        by_stroke: dict[int, tuple[float, str, int]] = {}
        for stroke_code, time_str, wa in hist:
            secs = parse_time_seconds(time_str)
            if secs is None:
                continue
            wa_int = int(wa) if wa and str(wa).strip().isdigit() else 0
            if stroke_code not in by_stroke or secs < by_stroke[stroke_code][0]:
                by_stroke[stroke_code] = (secs, time_str, wa_int)
            elif wa_int > by_stroke[stroke_code][2]:
                by_stroke[stroke_code] = (by_stroke[stroke_code][0], by_stroke[stroke_code][1], wa_int)

        for stroke_code, (_, best_time, best_wa) in by_stroke.items():
            event_name = stroke_map.get(str(stroke_code))
            if event_name:
                rows.append({
                    "tiref": tiref,
                    "swimmer_name": info["name"],
                    "yob": info["yob"],
                    "event": event_name,
                    "best_time": best_time,
                    "best_wa": best_wa,
                })
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
