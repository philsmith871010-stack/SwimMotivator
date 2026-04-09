#!/usr/bin/env python3
"""
SwimMotivator data pipeline — dynamic squad from rankings data.

Pipeline order (rankings first to discover club swimmers):
  1. Club metadata (GBClub.php)                    — ~5 seconds
  2. Rankings at county level                      — ~15 minutes
  3. Personal bests for club swimmers              — ~1 minute
  4. Full swim history (every time ever swam)      — ~22 minutes
  5. Export JSON for the frontend                  — instant

Club swimmers are derived DYNAMICALLY from rankings data — no hardcoded
list needed. Any swimmer whose club name contains "St Albans" in the
county rankings is included.

Fully RESUMABLE: safe to Ctrl+C and restart at any time.

Usage:
    python bulk_load.py              # run everything
    python bulk_load.py --step 1     # just clubs
    python bulk_load.py --step 2     # just rankings
    python bulk_load.py --step 3     # just PBs (requires step 2 first)
    python bulk_load.py --step 4     # just history (requires step 2 first)
    python bulk_load.py --step 5     # just export JSON
    python bulk_load.py --status     # check progress
    python bulk_load.py --test       # quick test with Bella + Amber only
"""

import argparse
import sqlite3
import sys
import time

from scraper.config import DB_PATH, CLUB_NAME_PATTERN, RANKING_YEARS, TEST_TIREFS


def show_status():
    """Show current database status and progress."""
    print("\n=== Database Status ===\n")

    if not DB_PATH.exists():
        print("No database found. Run bulk_load.py to start.")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        # Swimmers
        try:
            count = conn.execute("SELECT COUNT(*) FROM swimmers").fetchone()[0]
            print(f"Swimmers:       {count:>10,}")
        except sqlite3.OperationalError:
            print("Swimmers:       not started")

        # Personal bests
        try:
            pb_count = conn.execute("SELECT COUNT(*) FROM personal_bests").fetchone()[0]
            pb_swimmers = conn.execute("SELECT COUNT(DISTINCT tiref) FROM personal_bests").fetchone()[0]
            print(f"Personal bests: {pb_count:>10,} entries for {pb_swimmers} swimmers")
        except sqlite3.OperationalError:
            print("Personal bests: not started")

        # Swimmer history
        try:
            hist_count = conn.execute("SELECT COUNT(*) FROM swimmer_history").fetchone()[0]
            hist_swimmers = conn.execute("SELECT COUNT(DISTINCT tiref) FROM swimmer_history").fetchone()[0]
            done = conn.execute("SELECT COUNT(*) FROM scraped_swimmer_history").fetchone()[0]
            print(f"Swim history:   {hist_count:>10,} swims for {hist_swimmers} swimmers ({done} scraped)")
        except sqlite3.OperationalError:
            print("Swim history:   not started")

        # Rankings
        try:
            for level in ["county", "regional", "national"]:
                lcount = conn.execute(
                    "SELECT COUNT(*) FROM rankings WHERE level = ?", (level,)
                ).fetchone()[0]
                lunique = conn.execute(
                    "SELECT COUNT(DISTINCT tiref) FROM rankings WHERE level = ?", (level,)
                ).fetchone()[0]
                print(f"  {level:>10}: {lcount:>10,} entries, {lunique:,} swimmers")

            combos_done = conn.execute("SELECT COUNT(*) FROM scraped_ranking_combos").fetchone()[0]
            print(f"  Combos scraped: {combos_done}")
        except sqlite3.OperationalError:
            print("Rankings:       not started")

        # Club swimmers derived from rankings
        try:
            club_count = conn.execute(
                "SELECT COUNT(DISTINCT tiref) FROM rankings WHERE club LIKE ?",
                (f"%{CLUB_NAME_PATTERN}%",)
            ).fetchone()[0]
            print(f"Club swimmers:  {club_count:>10,} (matching '{CLUB_NAME_PATTERN}')")
        except sqlite3.OperationalError:
            pass

        # Clubs
        try:
            club_count = conn.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
            print(f"Clubs:          {club_count:>10,}")
        except sqlite3.OperationalError:
            print("Clubs:          not loaded")

        # DB size
        size_mb = DB_PATH.stat().st_size / 1e6
        print(f"\nDatabase size:  {size_mb:.1f} MB")

    finally:
        conn.close()


def _get_club_tirefs() -> list[int]:
    """Derive club swimmers from rankings data."""
    from scraper.db import get_club_tirefs, init_db
    conn = init_db()
    try:
        tirefs = get_club_tirefs(conn, CLUB_NAME_PATTERN)
    finally:
        conn.close()
    return tirefs


def step1_clubs():
    print("\n" + "=" * 60)
    print("STEP 1: Club Metadata")
    print("=" * 60)
    from scraper.scrape_clubs import main as clubs_main
    clubs_main()


def step2_rankings(years=None, levels=None):
    _years = years or RANKING_YEARS
    print("\n" + "=" * 60)
    print("STEP 2: Rankings")
    print(f"  Years: {_years}")
    print(f"  Levels: {levels or 'all configured'}")
    print("  Resumable — safe to Ctrl+C and restart")
    print("=" * 60)
    from scraper.scrape_rankings import scrape_event_rankings
    scrape_event_rankings(years=_years, levels=levels)


def step3_pbs(tirefs: list[int]):
    print("\n" + "=" * 60)
    print("STEP 3: Personal Bests")
    print(f"  {len(tirefs)} swimmers")
    print("=" * 60)
    from scraper.scrape_personal_bests import scrape_personal_bests
    scrape_personal_bests(tirefs=tirefs)


def step4_history(tirefs: list[int]):
    print("\n" + "=" * 60)
    print("STEP 4: Full Swim History")
    print(f"  {len(tirefs)} swimmers, 36 requests each")
    print("  Resumable — safe to Ctrl+C and restart")
    print("=" * 60)
    from scraper.scrape_history import scrape_history
    scrape_history(tirefs=tirefs)


def step5_export():
    print("\n" + "=" * 60)
    print("STEP 5: Export JSON")
    print("=" * 60)
    from scraper.export_json import main as export_main
    export_main()


def main():
    parser = argparse.ArgumentParser(
        description="SwimMotivator data pipeline (resumable)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Pipeline order:
  Step 1: Club metadata
  Step 2: Rankings (county) — discovers all swimmers
  Step 3: Personal bests (for club swimmers found in step 2)
  Step 4: Swim history (for club swimmers found in step 2)
  Step 5: Export JSON

Examples:
  python bulk_load.py              Full pipeline
  python bulk_load.py --step 2     Just rankings
  python bulk_load.py --test       Quick test (Bella + Amber only)
  python bulk_load.py --status     Check progress
        """)
    parser.add_argument("--step", type=int, choices=[1, 2, 3, 4, 5],
                        help="Run only a specific step")
    parser.add_argument("--status", action="store_true",
                        help="Show progress and exit")
    parser.add_argument("--test", action="store_true",
                        help="Quick test with Bella + Amber only")
    parser.add_argument("--force", action="store_true",
                        help="Clear and re-scrape everything")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    start = time.time()

    print("=" * 60)
    print("SwimMotivator — Data Pipeline")
    if args.test:
        print("MODE: TEST (Bella + Amber only, 2 years)")
    print("=" * 60)
    print()
    print("RESUMABLE: safe to Ctrl+C and restart at any time.")
    print("Check progress:  python bulk_load.py --status")
    print()

    try:
        # Step 1: Club metadata
        if args.step is None or args.step == 1:
            step1_clubs()

        # Step 2: Rankings — this discovers all swimmers
        if args.step is None or args.step == 2:
            if args.test:
                step2_rankings(years=[2025, 2026])
            else:
                step2_rankings()

        # Derive club swimmers from rankings (or use test set)
        if args.test:
            club_tirefs = TEST_TIREFS
            print(f"\n[Test mode] Using {len(club_tirefs)} test swimmers")
        else:
            club_tirefs = _get_club_tirefs()
            if club_tirefs:
                print(f"\n[Squad] Found {len(club_tirefs)} swimmers matching "
                      f"'{CLUB_NAME_PATTERN}' in rankings")
            else:
                print(f"\n[Squad] No swimmers found matching '{CLUB_NAME_PATTERN}'.")
                print("  Run step 2 (rankings) first to populate the database.")
                if args.step and args.step > 2:
                    return

        # Step 3: Personal bests for club swimmers
        if args.step is None or args.step == 3:
            if club_tirefs:
                step3_pbs(club_tirefs)
            else:
                print("\n[Skip] Step 3: no club swimmers found (run step 2 first)")

        # Step 4: Full history for club swimmers
        if args.step is None or args.step == 4:
            if club_tirefs:
                step4_history(club_tirefs)
            else:
                print("\n[Skip] Step 4: no club swimmers found (run step 2 first)")

        # Step 5: Export
        if args.step is None or args.step == 5:
            step5_export()

    except KeyboardInterrupt:
        print("\n\n[!] Interrupted — all progress saved.")
        print("    Run again to resume from where you left off.")
        sys.exit(0)

    elapsed = time.time() - start
    mins = elapsed / 60
    print(f"\n{'=' * 60}")
    print(f"Done! Total time: {mins:.1f} minutes")
    show_status()


if __name__ == "__main__":
    main()
