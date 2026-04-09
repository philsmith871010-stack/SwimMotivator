"""Fetch personal bests and biog data for all Co St Albans swimmers."""

from __future__ import annotations

import re
from typing import Any

from bs4 import BeautifulSoup

from .config import BIOG_URL, PB_URL
from .db import clear_personal_bests, init_db, insert_personal_best, upsert_swimmer
from .parsers import norm_ws, parse_int_or_none
from .session import fetch_soup

SWIMMER_LINE_RE = re.compile(r"^(.+?)\s*-\s*\(\s*(\d+)\s*\)\s*-\s*(.+)$", re.DOTALL)
VALID_STROKE_RE = re.compile(
    r"^\d+m?\s+(Freestyle|Backstroke|Breaststroke|Butterfly|Individual Medley)$", re.I
)


def parse_swimmer_header(soup: BeautifulSoup, tiref: int) -> tuple[str, str]:
    needle = f"tiref={tiref}"
    for p in soup.find_all("p", class_="rnk_sj"):
        link = p.find("a", href=lambda h: h and needle in h)
        if not link:
            continue
        text = norm_ws(p.get_text(" ", strip=True))
        text = re.sub(r"\s*Search Again\s*$", "", text, flags=re.I)
        text = norm_ws(text)
        m = SWIMMER_LINE_RE.match(text)
        if m:
            return m.group(1).strip(), m.group(3).strip()
        raise ValueError(f"Could not parse swimmer line: {text!r}")
    raise ValueError("Swimmer header not found on page")


def parse_pb_table(table, course: str) -> list[dict[str, Any]]:
    rows_out: list[dict[str, Any]] = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) < 9:
            continue
        stroke = norm_ws(cells[0].get_text(" ", strip=True))
        if stroke.lower() == "stroke":
            continue
        if not VALID_STROKE_RE.match(stroke):
            continue
        time_val = norm_ws(cells[1].get_text(" ", strip=True))
        converted = norm_ws(cells[2].get_text(" ", strip=True))
        wa_raw = norm_ws(cells[3].get_text(" ", strip=True))
        wa_points = parse_int_or_none(wa_raw)
        date = norm_ws(cells[4].get_text(" ", strip=True)) or None
        meet = norm_ws(cells[5].get_text(" ", strip=True)) or None
        venue = norm_ws(cells[6].get_text(" ", strip=True)) or None
        licence = norm_ws(cells[7].get_text(" ", strip=True)) or None
        level = norm_ws(cells[8].get_text(" ", strip=True)) or None
        rows_out.append({
            "course": course, "stroke": stroke, "time": time_val,
            "converted_time": converted or None, "wa_points": wa_points,
            "date": date, "meet": meet, "venue": venue,
            "licence": licence, "level": level,
        })
    return rows_out


def parse_biog(soup: BeautifulSoup) -> tuple[int | None, str | None]:
    yob: int | None = None
    sex: str | None = None
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 2:
            continue
        label = norm_ws(tds[0].get_text(" ", strip=True))
        val = norm_ws(tds[1].get_text(" ", strip=True))
        if label == "Year of Birth":
            yob = int(val) if val.isdigit() else None
        elif label == "Eligibility Category":
            if re.search(r"\bFemale\b", val):
                sex = "F"
            elif re.search(r"\bMale\b", val):
                sex = "M"
    return yob, sex


def _detect_course(soup: BeautifulSoup) -> str:
    text = norm_ws(soup.get_text(" ", strip=True)).lower()
    has_lc = "long course" in text
    has_sc = "short course" in text
    if has_lc and not has_sc:
        return "LC"
    if has_sc and not has_lc:
        return "SC"
    return "LC"


def scrape_one(conn, tiref: int) -> None:
    soup = fetch_soup(PB_URL, {"tiref": tiref, "mode": "A"})
    name, club = parse_swimmer_header(soup, tiref)

    tables = soup.find_all("table", id="rankTable")
    if len(tables) >= 2:
        lc = parse_pb_table(tables[0], "LC")
        sc = parse_pb_table(tables[1], "SC")
    elif len(tables) == 1:
        course = _detect_course(soup)
        rows = parse_pb_table(tables[0], course)
        lc, sc = (rows, []) if course == "LC" else ([], rows)
    else:
        print(f"  Warning: no rank tables for tiref {tiref}, skipping.")
        return

    bio_soup = fetch_soup(BIOG_URL, {"tiref": tiref})
    yob, sex = parse_biog(bio_soup)

    clear_personal_bests(conn, tiref)
    upsert_swimmer(conn, tiref=tiref, name=name, yob=yob, sex=sex, club=club)
    for row in lc + sc:
        insert_personal_best(conn, tiref=tiref, **row)


def scrape_personal_bests(tirefs: list[int]) -> None:
    _tirefs = tirefs
    conn = init_db()
    total = len(_tirefs)
    try:
        for i, tiref in enumerate(_tirefs, start=1):
            print(f"[PB] Swimmer {i}/{total} (tiref {tiref})...")
            try:
                scrape_one(conn, tiref)
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"  Error: {e}")
    finally:
        conn.close()


def main() -> None:
    # Standalone: derive tirefs from rankings data
    from .config import CLUB_NAME_PATTERN, SQUAD_MIN_YEAR
    from .db import get_club_tirefs, init_db
    conn = init_db()
    try:
        tirefs = get_club_tirefs(conn, CLUB_NAME_PATTERN, min_year=SQUAD_MIN_YEAR)
    finally:
        conn.close()
    if not tirefs:
        print("[PB] No club swimmers found in rankings. Run rankings scrape first.")
        return
    print(f"[PB] Found {len(tirefs)} active club swimmers from rankings")
    scrape_personal_bests(tirefs=tirefs)


if __name__ == "__main__":
    main()
