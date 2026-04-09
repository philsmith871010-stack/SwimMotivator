"""Orchestrate the full scrape + export pipeline."""

from __future__ import annotations


def main() -> None:
    print("=" * 60)
    print("SwimMotivator — Full Pipeline")
    print("=" * 60)

    print("\n[1/5] Loading club metadata...")
    from .scrape_clubs import main as scrape_clubs
    scrape_clubs()

    print("\n[2/5] Scraping rankings (county)...")
    from .scrape_rankings import main as scrape_rankings
    scrape_rankings()

    # Derive club swimmers from rankings
    from .config import CLUB_NAME_PATTERN
    from .db import get_club_tirefs, init_db
    conn = init_db()
    try:
        club_tirefs = get_club_tirefs(conn, CLUB_NAME_PATTERN)
    finally:
        conn.close()
    print(f"\n[Squad] Found {len(club_tirefs)} swimmers matching '{CLUB_NAME_PATTERN}'")

    if club_tirefs:
        print("\n[3/5] Scraping personal bests...")
        from .scrape_personal_bests import scrape_personal_bests
        scrape_personal_bests(tirefs=club_tirefs)

        print("\n[4/5] Scraping swimmer history...")
        from .scrape_history import scrape_history
        scrape_history(tirefs=club_tirefs)

    print("\n[5/5] Exporting to JSON...")
    from .export_json import main as export_json
    export_json()

    print("\n" + "=" * 60)
    print("Pipeline complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
