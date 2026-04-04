"""Find peer swimmers from meets where Bella/Amber competed."""

from __future__ import annotations

import re
import sqlite3
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup

from .config import (
    BASE_URL, DB_PATH, PEER_MAX_YOB, PEER_MIN_YOB, SHOWMEETS_URL, TARGET_TIREFS,
)
from .db import init_db, upsert_swimmer
from .parsers import norm_ws, parse_tiref_from_href, year_from_date
from .session import fetch_soup

FALLBACK_LETTERS = list("ABCDFGHJKLMNOPRSTW")


def _parse_yob(yob_text: str) -> int | None:
    cleaned = re.sub(r"[^\d]", "", yob_text)
    if not cleaned:
        return None
    year = int(cleaned)
    return year + 2000 if year < 100 else year


def _extract_pages(soup: BeautifulSoup, key: str) -> list[int]:
    pages: set[int] = {1}
    for a in soup.find_all("a", href=True):
        if f"{key}=" not in a["href"]:
            continue
        parsed = urlparse(urljoin(BASE_URL, a["href"]))
        val = parse_qs(parsed.query).get(key, [None])[0]
        if val and str(val).isdigit():
            pages.add(int(val))
    return sorted(pages)


def _extract_peers(soup: BeautifulSoup) -> dict[int, dict]:
    peers: dict[int, dict] = {}
    table = soup.find("table", id="rankTable")
    if not table:
        return peers
    for tr in table.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) < 4:
            continue
        link = cells[0].find("a", href=True)
        if not link:
            continue
        tiref_str = parse_tiref_from_href(link["href"])
        if not tiref_str:
            continue
        tiref = int(tiref_str)
        name = norm_ws(cells[1].get_text(" ", strip=True))
        yob = _parse_yob(cells[2].get_text(" ", strip=True))
        category = norm_ws(cells[3].get_text(" ", strip=True))
        if not re.search(r"\bFemale\b", category, flags=re.I):
            continue
        if yob is None or not (PEER_MIN_YOB <= yob <= PEER_MAX_YOB):
            continue
        peers[tiref] = {"tiref": tiref, "name": name, "yob": yob}
    return peers


def load_licence_targets(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT DISTINCT licence, date FROM personal_bests
        WHERE tiref IN (?, ?) AND licence IS NOT NULL AND TRIM(licence) <> ''
    """, tuple(TARGET_TIREFS)).fetchall()
    out: dict[tuple[str, int], dict] = {}
    for licence, date_text in rows:
        lic = norm_ws(str(licence))
        yr = year_from_date(date_text)
        if lic and yr:
            out[(lic, yr)] = {"licence": lic, "year": yr}
    return sorted(out.values(), key=lambda x: (x["year"], x["licence"]))


def load_meetcode_cache(conn: sqlite3.Connection) -> dict[tuple[str, int], str]:
    mapping: dict[tuple[str, int], str] = {}
    try:
        rows = conn.execute("""
            SELECT DISTINCT licence, meet_date, meetcode FROM meet_results
            WHERE licence IS NOT NULL AND TRIM(licence) <> ''
              AND meetcode IS NOT NULL AND TRIM(meetcode) <> ''
        """).fetchall()
    except Exception:
        return mapping
    for licence, meet_date, meetcode in rows:
        lic = norm_ws(str(licence))
        yr = year_from_date(meet_date)
        code = norm_ws(str(meetcode))
        if lic and yr and code:
            mapping[(lic, yr)] = code
    return mapping


def resolve_meetcode(licence: str, year: int) -> str | None:
    first = fetch_soup(SHOWMEETS_URL, {"targetyear": year, "masters": 0})
    pages = _extract_pages(first, "page")
    for page in pages:
        soup = first if page == 1 else fetch_soup(
            SHOWMEETS_URL, {"targetyear": year, "masters": 0, "page": page})
        table = soup.find("table")
        if not table:
            continue
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 6:
                continue
            lic = norm_ws(tds[5].get_text(" ", strip=True))
            if lic != licence:
                continue
            link = tds[5].find("a", href=True)
            if link:
                m = re.search(r"[?&]meetcode=(\d+)", link["href"])
                if m:
                    return m.group(1)
    return None


def fetch_peers_for_meet(meetcode: str, year: int) -> dict[int, dict]:
    from .config import SHOWMEETSBYEVENT_URL
    peers: dict[int, dict] = {}
    # Try unfiltered first
    first = fetch_soup(SHOWMEETSBYEVENT_URL,
                       {"targetyear": year, "masters": 0, "pgm": 1, "meetcode": meetcode})
    pages = _extract_pages(first, "pgs")
    for page in pages:
        soup = first if page == 1 else fetch_soup(
            SHOWMEETSBYEVENT_URL,
            {"targetyear": year, "masters": 0, "pgm": 1, "meetcode": meetcode, "pgs": page})
        peers.update(_extract_peers(soup))
    if peers:
        return peers

    # Fallback to letter-by-letter
    for letter in FALLBACK_LETTERS:
        first = fetch_soup(SHOWMEETSBYEVENT_URL, {
            "targetyear": year, "masters": 0, "pgm": 1,
            "meetcode": meetcode, "targetAZ": letter,
        })
        pages = _extract_pages(first, "pgs")
        for page in pages:
            soup = first if page == 1 else fetch_soup(SHOWMEETSBYEVENT_URL, {
                "targetyear": year, "masters": 0, "pgm": 1,
                "meetcode": meetcode, "targetAZ": letter, "pgs": page,
            })
            peers.update(_extract_peers(soup))
    return peers


def main() -> None:
    raw_conn = sqlite3.connect(DB_PATH)
    try:
        targets = load_licence_targets(raw_conn)
        if not targets:
            print("No licence targets found.")
            return
        cached = load_meetcode_cache(raw_conn)
    finally:
        raw_conn.close()

    meet_targets: dict[str, dict] = {}
    for t in targets:
        lic, yr = str(t["licence"]), int(t["year"])
        mc = cached.get((lic, yr))
        if not mc:
            mc = resolve_meetcode(lic, yr)
        if mc:
            meet_targets[mc] = {"meetcode": mc, "year": yr}

    if not meet_targets:
        print("No meetcodes resolved.")
        return

    all_peers: dict[int, dict] = {}
    for idx, meet in enumerate(meet_targets.values(), start=1):
        mc, yr = str(meet["meetcode"]), int(meet["year"])
        print(f"[Peers] Scanning meet {idx}/{len(meet_targets)}: {mc} ({yr})...")
        try:
            all_peers.update(fetch_peers_for_meet(mc, yr))
        except Exception as e:
            print(f"  Warning: {e}")

    if not all_peers:
        print("No peers found.")
        return

    print(f"[Peers] Found {len(all_peers)} unique female peers (YoB {PEER_MIN_YOB}-{PEER_MAX_YOB})")

    conn = init_db()
    try:
        for s in all_peers.values():
            upsert_swimmer(conn, tiref=s["tiref"], name=s["name"],
                          yob=s["yob"], sex="F", club=None)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
