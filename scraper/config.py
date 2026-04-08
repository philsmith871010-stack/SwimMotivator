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

REQUEST_DELAY = 0.4
REQUEST_TIMEOUT = 30

# Target swimmers (for quick testing)
BELLA_TIREF = 1373165
BELLA_YOB = 2011
AMBER_TIREF = 1479966
AMBER_YOB = 2012
TARGET_TIREFS = {BELLA_TIREF, AMBER_TIREF}
TARGET_SWIMMERS = {
    BELLA_TIREF: {"name": "Bella", "yob": BELLA_YOB},
    AMBER_TIREF: {"name": "Amber", "yob": AMBER_YOB},
}

# Co St Albans full squad tirefs
COSTA_TIREFS = [
    1312423, 1350903, 1390595, 1432363, 1438408, 1462050, 1498612,
    1597956, 1605757, 1620301, 1620302, 1629090, 1636560, 1656010,
    1656011, 1656019, 1658967, 1660439, 1660442, 1665031, 1672826,
    1684758, 1693587, 1706064, 1709405, 1722985, 1725672, 1728438,
    1732645, 1733488, 1735982, 1742896, 1757931, 1760429, 1765923,
    1774903, 1781026, 1782409, 1797060, 1798413, 1803530, 1803533,
    1812687, 1818108, 1830975, 1837530, BELLA_TIREF, AMBER_TIREF,
]

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
    "national": {"Level": "N", "TargetRegion": "P", "TargetCounty": "XXXX", "TargetClub": "XXXX"},
    "regional": {"Level": "D", "TargetRegion": "T", "TargetCounty": "XXXX", "TargetClub": "XXXX"},   # T = East Region
    "county":   {"Level": "C", "TargetRegion": "P", "TargetCounty": "HRTT", "TargetClub": "XXXX"},   # HRTT = Hertfordshire
}

RANKING_YEARS = [2022, 2023, 2024, 2025, 2026]
DEFAULT_AGE_GROUPS = list(range(8, 19))  # 8-18
DEFAULT_SEXES = ["F", "M"]
