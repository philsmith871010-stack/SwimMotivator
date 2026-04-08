"""Test: find the fastest way to get swimmer data.

Run:  python test_alltimes.py
"""
import time
from scraper.session import fetch_soup

TIREF = 1479966  # Amber
HISTORY_URL = "https://www.swimmingresults.org/individualbest/personal_best_time_date.php"
PB_URL = "https://www.swimmingresults.org/individualbest/personal_best.php"

# Test 1: PB page (all strokes, both courses, 1 request)
print("=== Test 1: PB page (all strokes at once) ===")
t0 = time.time()
soup = fetch_soup(PB_URL, {"tiref": TIREF, "mode": "A"})
t1 = time.time()
tables = soup.find_all("table", id="rankTable")
print(f"Found {len(tables)} rankTable(s) in {t1-t0:.2f}s")
total_rows = 0
for t in tables:
    rows = [tr for tr in t.find_all("tr") if len(tr.find_all("td")) >= 6]
    total_rows += len(rows)
    if rows:
        first = [td.get_text(strip=True) for td in rows[0].find_all("td")]
        print(f"  Table: {len(rows)} rows, first row: {first[:4]}")
print(f"Total PB rows: {total_rows}")
# Show headings
for tag in ["h2", "h3", "h4"]:
    headings = soup.find_all(tag)
    if headings:
        for h in headings:
            txt = h.get_text(strip=True)
            if txt and len(txt) < 100:
                print(f"  {tag}: {txt}")
print()

# Test 2: print=2 version (stripped down, might be faster)
print("=== Test 2: PB page with print=2 ===")
t0 = time.time()
soup2 = fetch_soup(PB_URL, {"tiref": TIREF, "mode": "A", "print": "2"})
t1 = time.time()
tables2 = soup2.find_all("table", id="rankTable")
print(f"Found {len(tables2)} rankTable(s) in {t1-t0:.2f}s")
total_rows2 = 0
for t in tables2:
    rows = [tr for tr in t.find_all("tr") if len(tr.find_all("td")) >= 6]
    total_rows2 += len(rows)
print(f"Total PB rows: {total_rows2}")
# Show page size comparison
print(f"Page size: {len(soup2.get_text())} chars (vs {len(soup.get_text())} without print=2)")
print()

# Test 3: Single stroke history for comparison
print("=== Test 3: Single stroke history (50 Free SC) ===")
t0 = time.time()
soup3 = fetch_soup(HISTORY_URL, {
    "back": "individualbest", "tiref": TIREF,
    "mode": "A", "tstroke": "1", "tcourse": "S",
})
t1 = time.time()
tables3 = soup3.find_all("table", id="rankTable")
total_rows3 = 0
for t in tables3:
    total_rows3 += len([tr for tr in t.find_all("tr") if len(tr.find_all("td")) >= 6])
print(f"Found {total_rows3} history rows for 50 Free SC in {t1-t0:.2f}s")
print()

# Test 4: County-filtered rankings
print("=== Test 4: County rankings (Herts, 50 Free, Female age 12) ===")
RANKINGS_URL = "https://www.swimmingresults.org/eventrankings/eventrankings.php"
t0 = time.time()
soup4 = fetch_soup(RANKINGS_URL, {
    "Pool": "S", "Stroke": "1", "Sex": "F",
    "TargetYear": "2025", "AgeGroup": "12",
    "AgeAt": "D", "TargetNationality": "E",
    "TargetRegion": "P", "TargetCounty": "HRTT",
    "TargetClub": "XXXX", "StartNumber": "1",
    "RecordsToView": "100", "Level": "N",
})
t1 = time.time()
tables4 = soup4.find_all("table", id="rankTable")
total_rows4 = 0
for t in tables4:
    total_rows4 += len([tr for tr in t.find_all("tr") if len(tr.find_all("td")) >= 6])
print(f"Found {total_rows4} Herts swimmers for 50 Free F age 12 in {t1-t0:.2f}s")
print()

print("=== Summary ===")
print(f"PB page (all strokes):     {total_rows} PBs in 1 request")
print(f"PB page (print=2):         {total_rows2} PBs in 1 request (lighter page)")
print(f"History (1 stroke):        {total_rows3} times in 1 request (x36 for full history)")
print(f"County rankings (1 combo): {total_rows4} swimmers in 1 request")
print()
print("For full history, we still need 36 requests per swimmer.")
print(f"But PB page gives all {total_rows} PBs in just 1 request!")
