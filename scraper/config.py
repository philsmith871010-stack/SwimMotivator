"""Shared constants for SwimMotivator scrapers."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "swimmotivator.db"
JSON_DIR = DATA_DIR / "json"

BASE_URL = "https://www.swimmingresults.org"
PB_URL = f"{BASE_URL}/individualbest/personal_best.php"
BIOG_URL = f"{BASE_URL}/biogs/biogs_details.php"
HISTORY_URL = f"{BASE_URL}/individualbest/personal_best_time_date.php"
RANKINGS_URL = f"{BASE_URL}/eventrankings/eventrankings.php"
CLUB_CODES_ZIP_URL = f"{BASE_URL}/clubcodes/GBClub.php"

REQUEST_DELAY = 0.1
REQUEST_TIMEOUT = 30

# Club configuration — swimmers derived dynamically from rankings data
CLUB_NAME_PATTERN = "St Albans"  # Matches club names containing this in rankings

# Test swimmers (for quick testing with --test)
BELLA_TIREF = 1373165
AMBER_TIREF = 1479966
TEST_TIREFS = [BELLA_TIREF, AMBER_TIREF]

# Stroke code → event name mapping
STROKE_NAMES = {
    1: "50 Freestyle", 2: "100 Freestyle", 3: "200 Freestyle", 4: "400 Freestyle",
    5: "800 Freestyle", 6: "1500 Freestyle", 7: "50 Breaststroke", 8: "100 Breaststroke",
    9: "200 Breaststroke", 10: "50 Butterfly", 11: "100 Butterfly", 12: "200 Butterfly",
    13: "50 Backstroke", 14: "100 Backstroke", 15: "200 Backstroke",
    16: "200 Individual Medley", 17: "400 Individual Medley", 18: "100 Individual Medley",
}

# All stroke codes including distance freestyle
ALL_STROKE_CODES = list(range(1, 19))

COURSES = ["S", "L"]

# Ranking levels with their API filter parameters
# Level=N (National), Level=D (District/Region), Level=C (County)
# These map to the radio buttons on eventrankings.php
RANKING_LEVELS = {
    "county":   {"Level": "C", "TargetNationality": "P", "TargetRegion": "P", "TargetCounty": "HRTT", "TargetClub": "XXXX"},   # HRTT = Hertfordshire
}

# Can be added back when needed:
# "regional": {"Level": "D", "TargetNationality": "P", "TargetRegion": "T", "TargetCounty": "XXXX", "TargetClub": "XXXX"},  # T = East Region
# "national": {"Level": "N", "TargetNationality": "E", "TargetRegion": "P", "TargetCounty": "XXXX", "TargetClub": "XXXX"}

RANKING_YEARS = [2022, 2023, 2024, 2025, 2026]
DEFAULT_AGE_GROUPS = list(range(8, 19))  # 8-18
DEFAULT_SEXES = ["F", "M"]
