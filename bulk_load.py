#!/usr/bin/env python3
"""
SwimMotivator data pipeline — targeted scraping for CoSA swimmers.

Steps:
  1. Club metadata (GBClub.php)                    — ~5 seconds
  2. Personal bests for all CoSA swimmers           — ~1 minute
  3. Full swim history (every time ever swam)       — ~22 minutes
  4. Rankings at county/regional/national level     — ~40 minutes
  5. Export JSON for the frontend                   — instant

Total: ~60 minutes, fully RESUMABLE (safe to Ctrl+C and restart).

Usage:
    python bulk_load.py              # run everything
    python bulk_load.py --step 1     # just clubs
    python bulk_load.py --step 2     # just PBs
    python bulk_load.py --step 3     # just history
    python bulk_load.py --step 4     # just rankings (all levels)
    python bulk_load.py --step 5     # just export JSON
    python bulk_load.py --status     # check progress
    python bulk_load.py --test       # quick test with 2 swimmers only
"""

import argparse
import sqlite3
import sys
import time

from scraper.config import DB_PATH, BELLA_TIREF, AMBER_TIREF, COSTA_TIREFS, RANKING_YEARS


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
            rank_count = conn.execute("SELECT COUNT(*) FROM rankings").fetchone()[0]
            for level in ["national", "regional", "county"]:
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


def step1_clubs():
    print("\n" + "=" * 60)
    print("STEP 1: Club Metadata")
    print("=" * 60)
    from scraper.scrape_clubs import main as clubs_main
    clubs_main()


def step2_pbs(tirefs=None):
    _tirefs = tirefs or COSTA_TIREFS
    print("\n" + "=" * 60)
    print("STEP 2: Personal Bests")
    print(f"  {len(_tirefs)} swimmers")
    print("=" * 60)
    from scraper.scrape_personal_bests import scrape_personal_bests
    scrape_personal_bests(tirefs=_tirefs)


def step3_history(tirefs=None):
    _tirefs = tirefs or COSTA_TIREFS
    print("\n" + "=" * 60)
    print("STEP 3: Full Swim History")
    print(f"  {len(_tirefs)} swimmers, 36 requests each")
    print("  Estimated: ~22 minutes (resumable)")
    print("=" * 60)
    from scraper.scrape_history import scrape_history
    scrape_history(tirefs=_tirefs)


def step4_rankings(years=None, levels=None):
    _years = years or RANKING_YEARS
    print("\n" + "=" * 60)
    print("STEP 4: Rankings (County + Regional + National)")
    print(f"  Years: {_years}")
    print(f"  Levels: {levels or 'all'}")
    print("  Estimated: ~40 minutes (resumable)")
    print("=" * 60)
    from scraper.scrape_rankings import scrape_event_rankings
    scrape_event_rankings(years=_years, levels=levels)


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
Examples:
  python bulk_load.py              Full pipeline (~60 minutes)
  python bulk_load.py --step 1     Just club metadata
  python bulk_load.py --step 2     Just personal bests
  python bulk_load.py --step 3     Just swim history
  python bulk_load.py --step 4     Just rankings
  python bulk_load.py --step 5     Just export JSON
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

    test_tirefs = [BELLA_TIREF, AMBER_TIREF] if args.test else None

    start = time.time()

    print("=" * 60)
    print("SwimMotivator — Data Pipeline")
    if args.test:
        print("MODE: TEST (Bella + Amber only)")
    print("=" * 60)
    print()
    print("RESUMABLE: safe to Ctrl+C and restart at any time.")
    print("Check progress:  python bulk_load.py --status")
    print()

    try:
        if args.step is None or args.step == 1:
            step1_clubs()

        if args.step is None or args.step == 2:
            step2_pbs(test_tirefs)

        if args.step is None or args.step == 3:
            step3_history(test_tirefs)

        if args.step is None or args.step == 4:
            # For test mode, still scrape all rankings (they're shared)
            # but limit to current year only
            if args.test:
                step4_rankings(years=[2025, 2026])
            else:
                step4_rankings()

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
