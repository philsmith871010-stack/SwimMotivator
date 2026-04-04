"""Scrape complete stroke history for target swimmers and their club peers."""

from __future__ import annotations

import sqlite3

from .config import ALL_STROKE_CODES, COURSES, DB_PATH, HISTORY_URL, TARGET_TIREFS
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


def load_club_tirefs(conn: sqlite3.Connection) -> dict[int, str]:
    rows = conn.execute("""
        SELECT DISTINCT tiref, swimmer_name FROM meet_results
        WHERE club LIKE '%St Albans%'
    """).fetchall()
    out: dict[int, str] = {}
    for tiref, name in rows:
        t = str(tiref).strip()
        if t.isdigit():
            out[int(t)] = norm_ws(name or "")
    return out


def main() -> None:
    conn = init_db()
    try:
        targets: dict[int, str] = {t: "" for t in TARGET_TIREFS}
        targets.update(load_club_tirefs(conn))
        to_scrape = sorted(targets.items())
        total = len(to_scrape)
        total_saved = 0

        for idx, (tiref, name) in enumerate(to_scrape, start=1):
            conn.execute("DELETE FROM swimmer_history WHERE tiref = ?", (str(tiref),))
            conn.commit()
            swimmer_total = 0
            for stroke in ALL_STROKE_CODES:
                for course in COURSES:
                    raw = fetch_history_rows(tiref, stroke, course)
                    rows = mark_running_pbs(raw)
                    insert_history_rows(conn, tiref=tiref, stroke=stroke, course=course, rows=rows)
                    conn.commit()
                    swimmer_total += len(rows)
            total_saved += swimmer_total
            label = name or str(tiref)
            print(f"[History] {idx}/{total}: {label} — {swimmer_total} swims")
        print(f"[History] Total: {total_saved} swims saved")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
