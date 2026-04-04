"""Orchestrate the full scrape + export pipeline."""

from __future__ import annotations

import sys


def main() -> None:
    print("=" * 60)
    print("SwimMotivator — Full Scrape Pipeline")
    print("=" * 60)

    print("\n[1/7] Scraping personal bests...")
    from .scrape_personal_bests import main as scrape_pbs
    scrape_pbs()

    print("\n[2/7] Scraping PB meets...")
    from .scrape_meets import scrape_pb_meets
    scrape_pb_meets()

    print("\n[3/7] Finding peer swimmers...")
    from .scrape_peers import main as scrape_peers
    scrape_peers()

    print("\n[4/7] Scraping swimmer history...")
    from .scrape_history import main as scrape_history
    scrape_history()

    print("\n[5/7] Scraping national rankings (bulk — all swimmers)...")
    from .scrape_rankings import main as scrape_rankings
    scrape_rankings()

    print("\n[6/7] Deriving per-swimmer ranks from bulk data...")
    from .scrape_swimmer_ranks import main as derive_ranks
    derive_ranks()

    print("\n[7/7] Exporting to JSON...")
    from .export_json import main as export_json
    export_json()

    print("\n" + "=" * 60)
    print("Pipeline complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
