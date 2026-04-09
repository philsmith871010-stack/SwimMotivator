"""SQLite schema and helpers for all SwimMotivator tables."""

from __future__ import annotations

import sqlite3

from .config import DATA_DIR, DB_PATH

SCHEMA = """
-- Core swimmer identity
CREATE TABLE IF NOT EXISTS swimmers (
    tiref INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    yob INTEGER,
    sex TEXT,
    club TEXT
);

-- Personal bests (from personal_best.php, all strokes both courses in 1 request)
CREATE TABLE IF NOT EXISTS personal_bests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiref INTEGER NOT NULL,
    course TEXT NOT NULL,        -- 'SC' or 'LC'
    stroke TEXT NOT NULL,        -- e.g. '50 Freestyle'
    time TEXT NOT NULL,
    converted_time TEXT,
    wa_points INTEGER,
    date TEXT,
    meet TEXT,
    venue TEXT,
    licence TEXT,
    level TEXT,
    FOREIGN KEY (tiref) REFERENCES swimmers (tiref)
);
CREATE INDEX IF NOT EXISTS idx_pb_tiref ON personal_bests (tiref);

-- Full swim history (from personal_best_time_date.php, 36 requests per swimmer)
CREATE TABLE IF NOT EXISTS swimmer_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiref TEXT NOT NULL,
    stroke_code INTEGER NOT NULL,
    course TEXT NOT NULL,        -- 'S' or 'L'
    date TEXT,
    time TEXT,
    is_pb INTEGER NOT NULL,
    meet_name TEXT,
    venue TEXT,
    wa_points TEXT,
    round TEXT,
    level TEXT
);
CREATE INDEX IF NOT EXISTS idx_hist_key ON swimmer_history (tiref, stroke_code, course);

-- Rankings at county/regional/national level (from eventrankings.php)
CREATE TABLE IF NOT EXISTS rankings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiref TEXT NOT NULL,
    swimmer_name TEXT,
    club TEXT,
    yob INTEGER,
    sex TEXT,
    event TEXT,                  -- e.g. '50 Freestyle'
    course TEXT,                 -- 'SC' or 'LC'
    age_group TEXT,
    rank INTEGER,
    total_in_ranking INTEGER,
    time TEXT,
    meet_name TEXT,
    date TEXT,
    year INTEGER,
    level TEXT NOT NULL          -- 'national', 'regional', 'county'
);
CREATE INDEX IF NOT EXISTS idx_rank_tiref ON rankings (tiref);
CREATE INDEX IF NOT EXISTS idx_rank_event ON rankings (event, course, sex, age_group, year, level);

-- Resumability tracker for rankings scraper
CREATE TABLE IF NOT EXISTS scraped_ranking_combos (
    combo_key TEXT PRIMARY KEY,
    swimmers_found INTEGER DEFAULT 0,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Resumability tracker for swimmer history scraper
CREATE TABLE IF NOT EXISTS scraped_swimmer_history (
    tiref TEXT PRIMARY KEY,
    swims_found INTEGER DEFAULT 0,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Club metadata (from GBClub.php ZIP)
CREATE TABLE IF NOT EXISTS clubs (
    club_code TEXT PRIMARY KEY,
    club_name TEXT NOT NULL,
    region TEXT,
    county TEXT,
    country TEXT
);
CREATE INDEX IF NOT EXISTS idx_clubs_name ON clubs (club_name);
"""


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> sqlite3.Connection:
    conn = get_connection()
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def upsert_swimmer(conn: sqlite3.Connection, *, tiref: int, name: str,
                   yob: int | None, sex: str | None, club: str | None) -> None:
    conn.execute("""
        INSERT INTO swimmers (tiref, name, yob, sex, club) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tiref) DO UPDATE SET
            name = excluded.name, yob = excluded.yob,
            sex = excluded.sex, club = excluded.club
    """, (tiref, name, yob, sex, club))


def insert_personal_best(conn: sqlite3.Connection, *, tiref: int, course: str,
                         stroke: str, time: str, converted_time: str | None,
                         wa_points: int | None, date: str | None, meet: str | None,
                         venue: str | None, licence: str | None, level: str | None) -> None:
    conn.execute("""
        INSERT INTO personal_bests (tiref, course, stroke, time, converted_time,
            wa_points, date, meet, venue, licence, level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (tiref, course, stroke, time, converted_time, wa_points, date, meet, venue, licence, level))


def clear_personal_bests(conn: sqlite3.Connection, tiref: int) -> None:
    conn.execute("DELETE FROM personal_bests WHERE tiref = ?", (tiref,))


def insert_history_rows(conn: sqlite3.Connection, *, tiref: int, stroke: int,
                        course: str, rows: list[dict]) -> None:
    conn.executemany("""
        INSERT INTO swimmer_history (tiref, stroke_code, course, date, time,
            is_pb, meet_name, venue, wa_points, round, level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [(str(tiref), stroke, course, r["date"], r["time"], int(r["is_pb"]),
           r["meet_name"], r["venue"], r["wa_points"], r["round"], r["level"])
          for r in rows])


def insert_rankings(conn: sqlite3.Connection, rows: list[dict]) -> None:
    conn.executemany("""
        INSERT INTO rankings (tiref, swimmer_name, club, yob, sex, event, course,
            age_group, rank, total_in_ranking, time, meet_name, date, year, level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [(r["tiref"], r["swimmer_name"], r["club"], r["yob"], r["sex"],
           r["event"], r["course"], r["age_group"], r["rank"],
           r.get("total_in_ranking"), r["time"], r["meet_name"],
           r["date"], r["year"], r["level"])
          for r in rows])


def get_club_tirefs(conn: sqlite3.Connection, club_pattern: str,
                    min_year: int | None = None) -> list[int]:
    """Get unique tirefs from rankings where club name matches pattern.

    If min_year is set, only include swimmers with rankings in that year or later.
    """
    if min_year:
        rows = conn.execute(
            "SELECT DISTINCT tiref FROM rankings WHERE club LIKE ? AND year >= ?",
            (f"%{club_pattern}%", min_year)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT DISTINCT tiref FROM rankings WHERE club LIKE ?",
            (f"%{club_pattern}%",)
        ).fetchall()
    return sorted(int(r[0]) for r in rows)


def upsert_clubs(conn: sqlite3.Connection, clubs: list[dict]) -> None:
    conn.executemany("""
        INSERT INTO clubs (club_code, club_name, region, county, country)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(club_code) DO UPDATE SET
            club_name = excluded.club_name, region = excluded.region,
            county = excluded.county, country = excluded.country
    """, [(c["club_code"], c["club_name"], c["region"], c["county"], c["country"])
          for c in clubs])
