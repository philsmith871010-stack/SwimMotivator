"""Quick test: does /individualalltimes/ return all strokes in one request?

Run:  python test_alltimes.py
"""
from scraper.session import fetch_soup

URL = "https://www.swimmingresults.org/individualalltimes/index.php"
TIREF = 1479966  # Amber

print("Fetching individualalltimes for Amber (tiref 1479966)...")
print()

soup = fetch_soup(URL, {"tiref": TIREF, "mode": "A"})

# Check for rankTables (one per stroke if all-in-one)
tables = soup.find_all("table", id="rankTable")
print(f"Found {len(tables)} rankTable(s)")

# Check headings (should show event names)
for tag in ["h2", "h3", "h4"]:
    headings = soup.find_all(tag)
    if headings:
        print(f"\n{tag} headings:")
        for h in headings:
            print(f"  - {h.get_text(strip=True)}")

# Show first 3000 chars of page text
print("\n--- Page text (first 3000 chars) ---")
print(soup.get_text()[:3000])
