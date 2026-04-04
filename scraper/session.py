"""Shared HTTP session with polite User-Agent, retry logic, and delay."""

from __future__ import annotations

import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

from .config import REQUEST_DELAY, REQUEST_TIMEOUT

# Retry strategy: 4 retries with exponential backoff (2s, 4s, 8s, 16s)
# Retries on connection errors, timeouts, and 429/500/502/503/504
retry_strategy = Retry(
    total=4,
    backoff_factor=2,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET"],
)

SESSION = requests.Session()
SESSION.mount("https://", HTTPAdapter(max_retries=retry_strategy))
SESSION.mount("http://", HTTPAdapter(max_retries=retry_strategy))
SESSION.headers.update({
    "User-Agent": (
        "SwimMotivator/1.0 (local dashboard; contact: club admin) "
        "python-requests"
    )
})


def fetch_soup(url: str, params: dict | None = None, delay: float = REQUEST_DELAY) -> BeautifulSoup:
    """GET a URL, parse as HTML, and sleep politely.

    Automatically retries on connection errors and server errors (4 attempts
    with exponential backoff). Safe to use in long-running overnight scrapes.
    """
    resp = SESSION.get(url, params=params or {}, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    time.sleep(delay)
    return BeautifulSoup(resp.text, "html.parser")
