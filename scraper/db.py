"""SQLite schema and helpers for all SwimMotivator tables."""

from __future__ import annotations

import sqlite3

from .config import DATA_DIR, DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS swimmers (
    tiref INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    yob INTEGER,
    sex TEXT,
    club TEXT
);

CREATE TABLE IF NOT EXISTS personal_bests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiref INTEGER NOT NULL,
    course TEXT NOT NULL,
    stroke TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS meet_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiref TEXT NOT NULL,
    swimmer_name TEXT,
    yob INTEGER,
    sex TEXT,
    club TEXT,
    meet_name TEXT,
    meet_date TEXT,
    course TEXT,
    licence TEXT,
    meetcode TEXT,
    event TEXT,
    round TEXT,
    time TEXT,
    wa_points TEXT
);
CREATE INDEX IF NOT EXISTS idx_mr_meetcode ON meet_results (meetcode);
CREATE INDEX IF NOT EXISTS idx_mr_tiref ON meet_results (tiref);

CREATE TABLE IF NOT EXISTS scraped_meets (
    year INTEGER NOT NULL,
    meetcode TEXT NOT NULL,
    meet_name TEXT,
    licence TEXT,
    swims_saved INTEGER DEFAULT 0,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (year, meetcode)
);

CREATE TABLE IF NOT EXISTS swimmer_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiref TEXT NOT NULL,
    stroke_code INTEGER NOT NULL,
    course TEXT NOT NULL,
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


def insert_meet_results(conn: sqlite3.Connection, rows: list[dict]) -> None:
    conn.executemany("""
        INSERT INTO meet_results (tiref, swimmer_name, yob, sex, club, meet_name,
            meet_date, course, licence, meetcode, event, round, time, wa_points)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [(r["tiref"], r["swimmer_name"], r["yob"], r["sex"], r["club"],
           r["meet_name"], r["meet_date"], r["course"], r["licence"],
           r["meetcode"], r["event"], r["round"], r["time"], r["wa_points"])
          for r in rows])


def is_meet_scraped(conn: sqlite3.Connection, year: int, meetcode: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM scraped_meets WHERE year = ? AND meetcode = ?",
        (year, meetcode)).fetchone()
    return row is not None


def mark_meet_scraped(conn: sqlite3.Connection, *, year: int, meetcode: str,
                      meet_name: str, licence: str, swims_saved: int) -> None:
    conn.execute("""
        INSERT INTO scraped_meets (year, meetcode, meet_name, licence, swims_saved)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(year, meetcode) DO UPDATE SET
            meet_name = excluded.meet_name, licence = excluded.licence,
            swims_saved = excluded.swims_saved, scraped_at = CURRENT_TIMESTAMP
    """, (year, meetcode, meet_name, licence, swims_saved))


def insert_history_rows(conn: sqlite3.Connection, *, tiref: int, stroke: int,
                        course: str, rows: list[dict]) -> None:
    conn.executemany("""
        INSERT INTO swimmer_history (tiref, stroke_code, course, date, time,
            is_pb, meet_name, venue, wa_points, round, level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [(str(tiref), stroke, course, r["date"], r["time"], int(r["is_pb"]),
           r["meet_name"], r["venue"], r["wa_points"], r["round"], r["level"])
          for r in rows])


def upsert_clubs(conn: sqlite3.Connection, clubs: list[dict]) -> None:
    conn.executemany("""
        INSERT INTO clubs (club_code, club_name, region, county, country)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(club_code) DO UPDATE SET
            club_name = excluded.club_name, region = excluded.region,
            county = excluded.county, country = excluded.country
    """, [(c["club_code"], c["club_name"], c["region"], c["county"], c["country"])
          for c in clubs])
