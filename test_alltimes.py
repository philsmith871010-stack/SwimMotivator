"""Test: can we get all strokes in fewer requests?

Run:  python test_alltimes.py
"""
from scraper.session import fetch_soup

TIREF = 1479966  # Amber
HISTORY_URL = "https://www.swimmingresults.org/individualbest/personal_best_time_date.php"

# Test 1: What happens if we omit tstroke? Does it return all strokes?
print("=== Test 1: history endpoint WITHOUT tstroke ===")
soup = fetch_soup(HISTORY_URL, {
    "back": "individualbest", "tiref": TIREF,
    "mode": "A", "tcourse": "S",
})
tables = soup.find_all("table", id="rankTable")
print(f"Found {len(tables)} rankTable(s)")
for tag in ["h3", "h4"]:
    headings = soup.find_all(tag)
    if headings:
        for h in headings:
            print(f"  {tag}: {h.get_text(strip=True)}")

# Count total data rows
total_rows = 0
for t in tables:
    total_rows += len([tr for tr in t.find_all("tr") if len(tr.find_all("td")) >= 6])
print(f"Total data rows: {total_rows}")
print()

# Test 2: Normal single-stroke request for comparison
print("=== Test 2: history endpoint WITH tstroke=1 (50 Free) ===")
soup2 = fetch_soup(HISTORY_URL, {
    "back": "individualbest", "tiref": TIREF,
    "mode": "A", "tstroke": "1", "tcourse": "S",
})
tables2 = soup2.find_all("table", id="rankTable")
print(f"Found {len(tables2)} rankTable(s)")
total_rows2 = 0
for t in tables2:
    total_rows2 += len([tr for tr in t.find_all("tr") if len(tr.find_all("td")) >= 6])
print(f"Total data rows: {total_rows2}")
print()

# Test 3: PB page without tstroke
print("=== Test 3: PB page without tstroke ===")
PB_URL = "https://www.swimmingresults.org/individualbest/personal_best.php"
soup3 = fetch_soup(PB_URL, {"tiref": TIREF, "mode": "A"})
tables3 = soup3.find_all("table", id="rankTable")
print(f"Found {len(tables3)} rankTable(s)")
total_rows3 = 0
for t in tables3:
    total_rows3 += len([tr for tr in t.find_all("tr") if len(tr.find_all("td")) >= 6])
print(f"Total data rows: {total_rows3}")

print("\n=== Summary ===")
print(f"Without tstroke: {total_rows} rows in {len(tables)} tables")
print(f"With tstroke=1:  {total_rows2} rows in {len(tables2)} tables")
print(f"PB page:         {total_rows3} rows in {len(tables3)} tables")
if total_rows > total_rows2:
    print(">>> WINNER: omitting tstroke returns MORE data! Potential speedup.")
