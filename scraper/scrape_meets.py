"""Bulk meet scraper — scrapes all meets for a given year, or meets from PB licences."""

from __future__ import annotations

import re
import time as time_mod

from bs4 import BeautifulSoup

from .config import MEET_STROKE_CODES, REQUEST_DELAY, SHOWMEETSBYEVENT_URL, TARGET_TIREFS
from .db import (
    init_db, insert_meet_results, is_meet_scraped, mark_meet_scraped,
)
from .parsers import norm_ws, parse_int_or_none, parse_tiref_from_href, sex_from_eligibility, year_from_date
from .session import fetch_soup


def _has_error(soup: BeautifulSoup) -> bool:
    text = norm_ws(soup.get_text(" ", strip=True)).lower()
    return "invalid selection" in text or "please try again" in text or "no swims for that meet" in text


def _extract_meet_rows(soup: BeautifulSoup) -> list[dict[str, str]]:
    table = soup.find("table", id="rankTable")
    if not table:
        return []
    rows: list[dict[str, str]] = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue
        meet_name = norm_ws(tds[0].get_text(" ", strip=True))
        meet_date = norm_ws(tds[3].get_text(" ", strip=True))
        course = norm_ws(tds[4].get_text(" ", strip=True))
        licence = norm_ws(tds[5].get_text(" ", strip=True))
        link = tds[5].find("a", href=True)
        if not link:
            continue
        m = re.search(r"[?&]meetcode=(\d+)", link["href"])
        if not m:
            continue
        rows.append({
            "meetcode": m.group(1), "meet_name": meet_name,
            "date": meet_date, "licence": licence, "course": course,
        })
    return rows


def _parse_event_results(soup: BeautifulSoup, meet_meta: dict[str, str]) -> list[dict]:
    table = soup.find("table", id="rankTable")
    if not table:
        return []
    out: list[dict] = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 9:
            continue
        tiref_link = tds[0].find("a", href=True)
        if not tiref_link:
            continue
        tiref = parse_tiref_from_href(tiref_link.get("href", ""))
        if not tiref:
            continue
        name = norm_ws(tds[1].get_text(" ", strip=True))
        yob = parse_int_or_none(tds[2].get_text(" ", strip=True))
        if yob is not None and yob < 100:
            yob += 2000
        eligibility = norm_ws(tds[3].get_text(" ", strip=True))
        club = norm_ws(tds[4].get_text(" ", strip=True)) or None
        event = norm_ws(tds[5].get_text(" ", strip=True)) or None
        round_name = norm_ws(tds[6].get_text(" ", strip=True)) or None
        swim_time = norm_ws(tds[7].get_text(" ", strip=True)) or None
        wa_num = parse_int_or_none(tds[8].get_text(" ", strip=True))
        wa_points = str(wa_num) if wa_num is not None else None
        out.append({
            "tiref": str(tiref), "swimmer_name": name, "yob": yob,
            "sex": sex_from_eligibility(eligibility), "club": club,
            "meet_name": meet_meta["meet_name"], "meet_date": meet_meta["date"],
            "course": meet_meta["course"], "licence": meet_meta["licence"],
            "meetcode": str(meet_meta["meetcode"]), "event": event,
            "round": round_name, "time": swim_time, "wa_points": wa_points,
        })
    return out


def get_all_meetcodes(year: int) -> list[dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    page = 1
    while True:
        print(f"  Scanning meets page {page}...")
        try:
            soup = fetch_soup(SHOWMEETSBYEVENT_URL, {"targetyear": year, "masters": 0, "page": page})
        except Exception as exc:
            print(f"  Stop scanning page {page}: {exc}")
            break
        if _has_error(soup):
            break
        rows = _extract_meet_rows(soup)
        if not rows:
            break
        before = len(out)
        for row in rows:
            out[row["meetcode"]] = row
        if len(out) == before:
            break
        page += 1
    return list(out.values())


def scrape_meet(meetcode: str, year: int, meet_meta: dict[str, str]) -> tuple[list[dict], bool]:
    out: list[dict] = []
    seen: set[tuple] = set()
    for stroke in MEET_STROKE_CODES:
        soup = fetch_soup(SHOWMEETSBYEVENT_URL, {
            "targetyear": year, "masters": 0, "meetcode": meetcode,
            "pgm": 1, "targetstroke": stroke,
        })
        if _has_error(soup):
            return [], True
        rows = _parse_event_results(soup, meet_meta)
        for row in rows:
            key = (row["tiref"], row["event"], row["round"], row["time"], row["meetcode"], row["meet_date"])
            if key not in seen:
                seen.add(key)
                out.append(row)
    return out, False


def scrape_year(year: int, limit: int = 0) -> None:
    conn = init_db()
    try:
        meets = get_all_meetcodes(year)
        if not meets:
            print(f"No meets found for {year}.")
            return
        print(f"Found {len(meets)} meets for {year}")
        successful = 0
        for idx, meet in enumerate(meets, start=1):
            mc = meet["meetcode"]
            if is_meet_scraped(conn, year, mc):
                continue
            try:
                rows, invalid = scrape_meet(mc, year, meet)
                if invalid:
                    mark_meet_scraped(conn, year=year, meetcode=mc,
                                     meet_name=meet["meet_name"], licence=meet["licence"], swims_saved=0)
                    conn.commit()
                    continue
                insert_meet_results(conn, rows)
                mark_meet_scraped(conn, year=year, meetcode=mc,
                                  meet_name=meet["meet_name"], licence=meet["licence"], swims_saved=len(rows))
                conn.commit()
                print(f"[Meet] {idx}/{len(meets)} {meet['meet_name']} — {len(rows):,} swims")
                if rows:
                    successful += 1
                if limit > 0 and successful >= limit:
                    break
            except Exception as exc:
                conn.rollback()
                print(f"[Meet] {idx}/{len(meets)} ({mc}) failed: {exc}")
            time_mod.sleep(REQUEST_DELAY)
    finally:
        conn.close()


def scrape_pb_meets() -> None:
    """Scrape full results for meets where Bella/Amber set PBs."""
    conn = init_db()
    try:
        rows = conn.execute("""
            SELECT DISTINCT licence, date FROM personal_bests
            WHERE tiref IN (?, ?) AND licence IS NOT NULL AND TRIM(licence) <> ''
        """, tuple(TARGET_TIREFS)).fetchall()

        targets: dict[tuple[str, int], dict] = {}
        for licence, date_text in rows:
            lic = norm_ws(str(licence))
            yr = year_from_date(date_text)
            if lic and yr:
                targets[(lic, yr)] = {"licence": lic, "year": yr}

        if not targets:
            print("No PB licence targets found.")
            return

        print(f"Found {len(targets)} PB licence targets")

        for (lic, yr), t in sorted(targets.items()):
            # Find meetcode from meet listing pages
            meetcode = _find_meetcode_for_licence(lic, yr)
            if not meetcode:
                print(f"  Could not resolve meetcode for {lic} ({yr})")
                continue
            if is_meet_scraped(conn, yr, meetcode["meetcode"]):
                continue
            try:
                rows_data, invalid = scrape_meet(meetcode["meetcode"], yr, meetcode)
                if invalid:
                    mark_meet_scraped(conn, year=yr, meetcode=meetcode["meetcode"],
                                     meet_name=meetcode["meet_name"], licence=lic, swims_saved=0)
                    conn.commit()
                    continue
                insert_meet_results(conn, rows_data)
                mark_meet_scraped(conn, year=yr, meetcode=meetcode["meetcode"],
                                  meet_name=meetcode["meet_name"], licence=lic, swims_saved=len(rows_data))
                conn.commit()
                print(f"[PBMeet] {meetcode['meet_name']} — {len(rows_data):,} swims")
            except Exception as exc:
                conn.rollback()
                print(f"[PBMeet] {lic} ({yr}) failed: {exc}")
    finally:
        conn.close()


def _find_meetcode_for_licence(licence: str, year: int) -> dict[str, str] | None:
    page = 1
    while True:
        soup = fetch_soup(SHOWMEETSBYEVENT_URL, {"targetyear": year, "masters": 0, "page": page})
        rows = _extract_meet_rows(soup)
        if not rows:
            return None
        for row in rows:
            if row["licence"] == licence:
                return row
        page += 1
        if page > 50:
            return None


def main(years: list[int] | None = None) -> None:
    if years is None:
        years = [2024, 2025]
    for year in years:
        print(f"\n=== Scraping meets for {year} ===")
        scrape_year(year)
    print("\n=== Scraping PB meets ===")
    scrape_pb_meets()


if __name__ == "__main__":
    main()
