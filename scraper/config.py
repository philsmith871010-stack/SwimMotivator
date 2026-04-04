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
SHOWMEETSBYEVENT_URL = f"{BASE_URL}/showmeetsbyevent/index.php"
SHOWMEETS_URL = f"{BASE_URL}/showmeets/index.php"
CLUB_CODES_ZIP_URL = f"{BASE_URL}/clubcodes/GBClub.php"

REQUEST_DELAY = 0.4
REQUEST_TIMEOUT = 30

# Target swimmers
BELLA_TIREF = 1373165
AMBER_TIREF = 1479966
TARGET_TIREFS = {BELLA_TIREF, AMBER_TIREF}

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

# Peer filtering
PEER_MIN_YOB = 2010
PEER_MAX_YOB = 2014

# Stroke code → event name mapping
STROKE_NAMES = {
    1: "50 Free", 2: "100 Free", 3: "200 Free", 4: "400 Free",
    5: "800 Free", 6: "1500 Free", 7: "50 Breast", 8: "100 Breast",
    9: "200 Breast", 10: "50 Fly", 11: "100 Fly", 12: "200 Fly",
    13: "50 Back", 14: "100 Back", 15: "200 Back",
    16: "200 IM", 17: "400 IM", 18: "100 IM",
}

# Stroke codes used when scraping meet event pages
MEET_STROKE_CODES = [1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 16, 17]

# All stroke codes including distance freestyle
ALL_STROKE_CODES = list(range(1, 19))

COURSES = ["S", "L"]
