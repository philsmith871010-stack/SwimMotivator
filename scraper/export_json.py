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
    from .parsers import parse_time_seconds

    stroke_map = {str(k): v for k, v in STROKE_NAMES.items()}

    # Get all female Costa swimmer tirefs
    costa_females = {}
    for row in conn.execute("""
        SELECT DISTINCT mr.tiref, mr.swimmer_name, mr.yob
        FROM meet_results mr
        WHERE mr.club LIKE '%St Albans%' AND mr.sex = 'F'
          AND mr.swimmer_name IS NOT NULL
        GROUP BY mr.tiref
    """).fetchall():
        costa_females[str(row[0])] = {"name": row[1], "yob": row[2]}
    for row in conn.execute(
        "SELECT tiref, name, yob FROM swimmers WHERE sex = 'F' AND club LIKE '%St Albans%'"
    ).fetchall():
        t = str(row[0])
        if t not in costa_females:
            costa_females[t] = {"name": row[1], "yob": row[2]}

    # Derive PBs from swimmer_history for each swimmer (both SC and LC)
    rows = []
    for tiref, info in costa_females.items():
        hist = conn.execute("""
            SELECT stroke_code, course, time, wa_points, date, meet_name
            FROM swimmer_history
            WHERE tiref = ? AND time IS NOT NULL AND TRIM(time) <> ''
        """, (tiref,)).fetchall()

        # Group by (stroke, course) and find fastest time
        best: dict[tuple, dict] = {}
        for stroke_code, course, time_str, wa, date_str, meet in hist:
            secs = parse_time_seconds(time_str)
            if secs is None:
                continue
            key = (stroke_code, course)
            wa_int = int(wa) if wa and str(wa).strip().isdigit() else 0
            if key not in best or secs < parse_time_seconds(best[key]["time"]):
                event_name = stroke_map.get(str(stroke_code))
                if event_name:
                    course_label = "SC" if course == "S" else "LC"
                    best[key] = {
                        "tiref": tiref,
                        "course": course_label,
                        "stroke": event_name,
                        "time": time_str,
                        "wa_points": wa_int,
                        "date": date_str or "",
                        "meet": meet or "",
                        "swimmer_name": info["name"],
                        "yob": info["yob"],
                    }

        rows.extend(best.values())

    rows.sort(key=lambda r: -(r.get("wa_points") or 0))
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


# Club name patterns for county/region filtering
HERTS_CLUB_PATTERNS = [
    '%St Albans%', '%Berkhamsted%', '%Bishop%Stortford%', '%Bushey%',
    '%Cheshunt%', '%Dacorum%', '%Harpenden%', '%Hatfield%',
    '%Hemel Hempstead%', '%Hertford%', '%Hertsmere%', '%Hitchin%',
    '%Hoddesdon%', '%Letchworth%', '%Potters Bar%', '%Royston%',
    '%Stevenage%', '%Verulam%', '%Ware%', '%Watford%',
    '%Welwyn%', '%Borehamwood%', '%Rickmansworth%', '%Tring%',
    '%Sawbridgeworth%',
]

EAST_REGION_PATTERNS = HERTS_CLUB_PATTERNS + [
    # Bedfordshire
    '%Bedford%', '%Dunstable%', '%Leighton Buzzard%', '%Luton%', '%Flitwick%',
    # Cambridgeshire
    '%Cambridge%', '%Ely%', '%Huntingdon%', '%Peterborough%', '%St Ives%',
    '%St Neots%', '%Wisbech%',
    # Essex
    '%Basildon%', '%Braintree%', '%Brentwood%', '%Chelmsford%', '%Colchester%',
    '%Harlow%', '%Southend%', '%Thurrock%', '%Epping%', '%Billericay%',
    '%Saffron%', '%Halstead%', '%Witham%', '%Clacton%', '%Maldon%',
    # Norfolk
    '%Norwich%', '%Norfolk%', '%Great Yarmouth%', '%King%Lynn%', '%Dereham%',
    '%Thetford%', '%North Norfolk%',
    # Suffolk
    '%Ipswich%', '%Bury St Edmunds%', '%Felixstowe%', '%Lowestoft%',
    '%Stowmarket%', '%Sudbury%', '%Newmarket%', '%Haverhill%',
]


def _build_club_filter_sql(patterns: list[str]) -> str:
    """Build SQL WHERE clause to match club names against patterns."""
    clauses = [f"club LIKE '{p}'" for p in patterns]
    return " OR ".join(clauses)


def export_county_region_ranks(conn: sqlite3.Connection) -> None:
    """Derive county and regional ranks for CoSA swimmers from event_rankings."""
    if not _table_exists(conn, "event_rankings"):
        print("  county_ranks.json: no event_rankings table, skipping")
        print("  region_ranks.json: no event_rankings table, skipping")
        return

    from .parsers import parse_time_seconds

    # Get CoSA swimmer tirefs
    costa_tirefs = set()
    for row in conn.execute("""
        SELECT DISTINCT tiref FROM meet_results
        WHERE club LIKE '%St Albans%' AND sex = 'F'
    """).fetchall():
        costa_tirefs.add(str(row[0]))
    for row in conn.execute(
        "SELECT tiref FROM swimmers WHERE sex = 'F' AND club LIKE '%St Albans%'"
    ).fetchall():
        costa_tirefs.add(str(row[0]))

    if not costa_tirefs:
        print("  county_ranks.json: no CoSA swimmers found")
        print("  region_ranks.json: no CoSA swimmers found")
        return

    herts_filter = _build_club_filter_sql(HERTS_CLUB_PATTERNS)
    east_filter = _build_club_filter_sql(EAST_REGION_PATTERNS)

    placeholders = ",".join(["?"] * len(costa_tirefs))

    # Get our swimmers' ranking entries
    our_rows = conn.execute(f"""
        SELECT tiref, event, course, year, age_group, time
        FROM event_rankings
        WHERE tiref IN ({placeholders})
    """, list(costa_tirefs)).fetchall()

    county_ranks = []
    region_ranks = []

    for tiref, event, course, year, age_group, time_val in our_rows:
        our_secs = parse_time_seconds(time_val)
        if our_secs is None:
            continue

        # County rank: count Herts swimmers with faster times
        county_faster = conn.execute(f"""
            SELECT COUNT(*) FROM event_rankings
            WHERE event = ? AND course = ? AND year = ? AND age_group = ?
              AND ({herts_filter})
              AND tiref != ?
        """, (event, course, year, age_group, tiref)).fetchone()[0]

        # Count faster times properly (using parsed seconds comparison would be ideal
        # but too slow for 2M rows, so we use the event_rankings rank order)
        county_total = conn.execute(f"""
            SELECT COUNT(*) FROM event_rankings
            WHERE event = ? AND course = ? AND year = ? AND age_group = ?
              AND ({herts_filter})
        """, (event, course, year, age_group)).fetchone()[0]

        # Count how many Herts swimmers have a strictly faster time
        # We need proper time comparison, so fetch all Herts times for this combo
        herts_times = conn.execute(f"""
            SELECT time FROM event_rankings
            WHERE event = ? AND course = ? AND year = ? AND age_group = ?
              AND ({herts_filter})
              AND tiref != ?
        """, (event, course, year, age_group, tiref)).fetchall()

        county_rank = 1
        for (ht,) in herts_times:
            ht_secs = parse_time_seconds(ht)
            if ht_secs is not None and ht_secs < our_secs:
                county_rank += 1

        county_ranks.append({
            "tiref": int(tiref) if str(tiref).isdigit() else tiref,
            "event": event, "course": course, "year": year,
            "age_group": int(age_group) if str(age_group).isdigit() else 0,
            "rank": county_rank, "total": county_total + 1,
            "time": time_val,
        })

        # Region rank: same but for East Region
        region_times = conn.execute(f"""
            SELECT time FROM event_rankings
            WHERE event = ? AND course = ? AND year = ? AND age_group = ?
              AND ({east_filter})
              AND tiref != ?
        """, (event, course, year, age_group, tiref)).fetchall()

        region_rank = 1
        region_total = len(region_times)
        for (rt,) in region_times:
            rt_secs = parse_time_seconds(rt)
            if rt_secs is not None and rt_secs < our_secs:
                region_rank += 1

        region_ranks.append({
            "tiref": int(tiref) if str(tiref).isdigit() else tiref,
            "event": event, "course": course, "year": year,
            "age_group": int(age_group) if str(age_group).isdigit() else 0,
            "rank": region_rank, "total": region_total + 1,
            "time": time_val,
        })

    (JSON_DIR / "county_ranks.json").write_text(
        json.dumps(county_ranks, indent=2), encoding="utf-8")
    unique_c = len(set(r["tiref"] for r in county_ranks))
    print(f"  county_ranks.json: {len(county_ranks)} entries for {unique_c} swimmers")

    (JSON_DIR / "region_ranks.json").write_text(
        json.dumps(region_ranks, indent=2), encoding="utf-8")
    unique_r = len(set(r["tiref"] for r in region_ranks))
    print(f"  region_ranks.json: {len(region_ranks)} entries for {unique_r} swimmers")


def main() -> None:
    JSON_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        print("[Export] Writing JSON files...")
        export_config(conn)
        export_personal_bests(conn)
        export_history(conn)
        export_ranks(conn)
        export_county_region_ranks(conn)
        export_squad(conn)
        print("[Export] Done!")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
