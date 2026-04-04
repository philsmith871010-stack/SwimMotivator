"""Download UK club metadata from Swim England club codes."""

from __future__ import annotations

import csv
import io
import zipfile

import requests

from .config import CLUB_CODES_ZIP_URL
from .db import init_db, upsert_clubs

DISTRICT_TO_REGION = {
    "N": "North West", "E": "North East", "M": "West Midlands",
    "A": "East Midlands", "L": "London", "T": "East",
    "W": "South West", "S": "South East", "X": "Scotland", "Y": "Wales",
}


def infer_country(district: str, county: str) -> str:
    d = (district or "").strip().upper()
    c = (county or "").strip().upper()
    if d == "X" or c.startswith("SS"):
        return "Scotland"
    if d == "Y" or c.startswith("WL"):
        return "Wales"
    return "England"


def fetch_clubs() -> list[dict[str, str]]:
    resp = requests.get(CLUB_CODES_ZIP_URL, timeout=30)
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = zf.namelist()
        csv_name = next((n for n in names if n.lower().endswith(".csv")), None)
        if not csv_name:
            raise RuntimeError("No CSV in club codes download")
        content = zf.read(csv_name).decode("utf-8-sig", errors="replace")

    reader = csv.DictReader(io.StringIO(content))
    out: list[dict[str, str]] = []
    for row in reader:
        name = (row.get("Club Name") or "").strip()
        code = (row.get("Code") or "").strip()
        district = (row.get("District") or "").strip()
        county = (row.get("County") or "").strip()
        if not name or not code:
            continue
        out.append({
            "club_code": code, "club_name": name,
            "region": DISTRICT_TO_REGION.get(district, district),
            "county": county, "country": infer_country(district, county),
        })
    return out


def main() -> None:
    clubs = fetch_clubs()
    if not clubs:
        print("No clubs parsed.")
        return
    conn = init_db()
    try:
        upsert_clubs(conn, clubs)
        conn.commit()
        print(f"[Clubs] Saved {len(clubs)} clubs")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
