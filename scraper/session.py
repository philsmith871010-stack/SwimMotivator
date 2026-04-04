"""Shared HTTP session with polite User-Agent and delay helper."""

from __future__ import annotations

import time

import requests
from bs4 import BeautifulSoup

from .config import REQUEST_DELAY, REQUEST_TIMEOUT

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": (
        "SwimMotivator/1.0 (local dashboard; contact: club admin) "
        "python-requests"
    )
})


def fetch_soup(url: str, params: dict | None = None, delay: float = REQUEST_DELAY) -> BeautifulSoup:
    """GET a URL, parse as HTML, and sleep politely."""
    resp = SESSION.get(url, params=params or {}, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    time.sleep(delay)
    return BeautifulSoup(resp.text, "html.parser")
