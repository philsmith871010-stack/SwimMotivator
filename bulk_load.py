#!/usr/bin/env python3
"""
Initial bulk data load — run this LOCALLY once to build the full database.

This captures everything you need for a complete England swimming app:
  1. National rankings (M+F, all events, ages 8-18, 2022-2026) — ~3 hours
  2. Meet results for every competition 2022-2026              — ~8 hours
  3. Derive per-swimmer ranks + export JSON                    — instant

Total: ~11 hours, fully RESUMABLE (safe to Ctrl+C and restart).

Usage:
    python bulk_load.py              # run everything
    python bulk_load.py --step 1     # just rankings
    python bulk_load.py --step 2     # just meets
    python bulk_load.py --step 3     # just derive + export
    python bulk_load.py --status     # check progress without scraping
"""

import argparse
import sqlite3
import sys
import time

from scraper.config import DB_PATH

MEET_YEARS = [2022, 2023, 2024, 2025, 2026]
RANKING_YEARS = [2022, 2023, 2024, 2025, 2026]


def show_status():
    """Show current database status and progress."""
    print("\n=== Database Status ===\n")

    if not DB_PATH.exists():
        print("No database found. Run bulk_load.py to start.")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        # Rankings progress
        try:
            total_combos = conn.execute("SELECT COUNT(*) FROM scraped_ranking_combos").fetchone()[0]
            total_rankings = conn.execute("SELECT COUNT(*) FROM event_rankings").fetchone()[0]
            unique_swimmers = conn.execute("SELECT COUNT(DISTINCT tiref) FROM event_rankings").fetchone()[0]
            print(f"Rankings:       {total_rankings:>10,} entries ({total_combos} combos scraped)")
            print(f"                {unique_swimmers:>10,} unique swimmers")

            # Expected combos: 18 events × 2 sexes × 11 ages × 2 courses × 5 years
            expected = 18 * 2 * 11 * 2 * len(RANKING_YEARS)
            pct = total_combos / expected * 100 if expected else 0
            print(f"                {pct:>9.0f}% complete ({total_combos}/{expected} combos)")
        except sqlite3.OperationalError:
            print("Rankings:       not started")

        print()

        # Meet results progress
        try:
            total_meets = conn.execute("SELECT COUNT(*) FROM scraped_meets").fetchone()[0]
            total_swims = conn.execute("SELECT COUNT(*) FROM meet_results").fetchone()[0]
            meets_with_data = conn.execute(
                "SELECT COUNT(*) FROM scraped_meets WHERE swims_saved > 0").fetchone()[0]
            print(f"Meet results:   {total_swims:>10,} individual swims")
            print(f"                {meets_with_data:>10,} meets with data ({total_meets} total processed)")

            for year in MEET_YEARS:
                yr_meets = conn.execute(
                    "SELECT COUNT(*), COALESCE(SUM(swims_saved), 0) FROM scraped_meets WHERE year = ?",
                    (year,)).fetchone()
                print(f"  {year}:         {yr_meets[0]:>6} meets, {yr_meets[1]:>8,} swims")
        except sqlite3.OperationalError:
            print("Meet results:   not started")

        print()

        # Swimmer ranks (derived)
        try:
            sr_count = conn.execute("SELECT COUNT(*) FROM swimmer_ranks").fetchone()[0]
            sr_swimmers = conn.execute("SELECT COUNT(DISTINCT tiref) FROM swimmer_ranks").fetchone()[0]
            print(f"Swimmer ranks:  {sr_count:>10,} entries for {sr_swimmers:,} swimmers")
        except sqlite3.OperationalError:
            print("Swimmer ranks:  not derived yet (run step 3)")

        # DB file size
        size_mb = DB_PATH.stat().st_size / 1e6
        print(f"\nDatabase size:  {size_mb:.1f} MB")

    finally:
        conn.close()


def step1_rankings():
    """Scrape national rankings — every swimmer's best time per event per year."""
    print("\n" + "=" * 60)
    print("STEP 1: National Rankings")
    print("  M+F, all events, ages 8-18, years", RANKING_YEARS)
    print("  Estimated: ~3 hours (resumable)")
    print("=" * 60)
    from scraper.scrape_rankings import scrape_event_rankings
    scrape_event_rankings(years=RANKING_YEARS)


def step2_meets():
    """Scrape all meet results — every swim at every competition."""
    print("\n" + "=" * 60)
    print("STEP 2: Meet Results")
    print("  Every competition, years", MEET_YEARS)
    print("  Estimated: ~8 hours (resumable per-meet)")
    print("=" * 60)
    from scraper.scrape_meets import scrape_year
    for year in MEET_YEARS:
        print(f"\n{'─' * 40}")
        print(f"  Scraping meets for {year}...")
        print(f"{'─' * 40}")
        try:
            scrape_year(year)
        except KeyboardInterrupt:
            print("\n[!] Interrupted — progress saved. Run again to resume.")
            raise
        except Exception as e:
            print(f"[!] Error scraping {year}: {e}")
            print("    Continuing to next year (already-scraped meets are saved)...")
            continue


def step3_derive_and_export():
    """Derive swimmer ranks and export all JSON."""
    print("\n" + "=" * 60)
    print("STEP 3: Derive ranks + Export JSON")
    print("=" * 60)

    print("\nDeriving per-swimmer ranks...")
    from scraper.scrape_swimmer_ranks import derive_swimmer_ranks
    derive_swimmer_ranks()

    print("\nExporting JSON...")
    from scraper.export_json import main as export_json
    export_json()


def main():
    parser = argparse.ArgumentParser(
        description="Bulk load England swimming data (resumable)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python bulk_load.py              Run full pipeline (~11 hours)
  python bulk_load.py --step 1     Just rankings (~3 hours)
  python bulk_load.py --step 2     Just meet results (~8 hours)
  python bulk_load.py --step 3     Just derive + export (instant)
  python bulk_load.py --status     Check progress
        """)
    parser.add_argument("--step", type=int, choices=[1, 2, 3],
                        help="Run only a specific step")
    parser.add_argument("--status", action="store_true",
                        help="Show progress and exit")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    start = time.time()

    print("=" * 60)
    print("SwimMotivator — Bulk Data Load")
    print(f"Rankings: {RANKING_YEARS[0]}-{RANKING_YEARS[-1]}  (M+F)")
    print(f"Meets:    {MEET_YEARS[0]}-{MEET_YEARS[-1]}")
    print("=" * 60)
    print()
    print("RESUMABLE: safe to Ctrl+C and restart at any time.")
    print("Already-scraped data will be skipped automatically.")
    print()
    print("Check progress anytime:  python bulk_load.py --status")
    print()

    try:
        if args.step is None or args.step == 1:
            step1_rankings()

        if args.step is None or args.step == 2:
            step2_meets()

        if args.step is None or args.step == 3:
            step3_derive_and_export()

    except KeyboardInterrupt:
        print("\n\n[!] Interrupted — all progress saved.")
        print("    Run again to resume from where you left off.")
        print("    Run 'python bulk_load.py --status' to check progress.")
        sys.exit(0)

    elapsed = time.time() - start
    hours = elapsed / 3600
    print(f"\n{'=' * 60}")
    print(f"Done! Total time: {hours:.1f} hours")
    show_status()
    print(f"\n{'=' * 60}")
    print()
    print("Next steps:")
    print("  git add data/ && git commit -m 'Bulk data load' && git push")
    print("  (This triggers the GitHub Pages deploy)")
    print("  Weekly updates will run automatically via GitHub Actions.")


if __name__ == "__main__":
    main()
