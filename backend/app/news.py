"""Daily wine news aggregation from RSS feeds, cached for one hour.
If no feed is reachable, a small set of clearly-flagged sample items is used."""
import html
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from . import config

_cache: dict = {"ts": 0.0, "items": [], "sample": True}

SAMPLE = [
    ("Sample: Burgundy growers report a small but promising harvest", "Burgundy Pinot Noir Chardonnay vintage report"),
    ("Sample: Champagne houses discuss grower-producer pricing", "Champagne market trend"),
    ("Sample: Piedmont's Nebbiolo vintages draw collector interest", "Piedmont Barolo Nebbiolo"),
    ("Sample: Bordeaux en primeur campaign — what collectors watch", "Bordeaux Cabernet Sauvignon Merlot market"),
    ("Sample: Mosel Riesling and the rise of lighter Kabinett styles", "Mosel Germany Riesling"),
    ("Sample: Northern Rhône Syrah — cellaring windows explained", "Rhône Syrah Hermitage aging"),
    ("Sample: Fine-wine index steady as secondary market cools", "market trend auction index"),
    ("Sample: Rioja Gran Reserva and long-aged Tempranillo", "Rioja Spain Tempranillo"),
]


def _clean(s: str | None) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _fetch(url: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "WineCellarDisplay/0.2 (dev)"})
    with urllib.request.urlopen(req, timeout=4) as r:
        root = ET.fromstring(r.read())
    out = []
    for item in root.iter("item"):
        out.append({
            "title": _clean(item.findtext("title")),
            "link": (item.findtext("link") or "").strip(),
            "summary": _clean(item.findtext("description"))[:280],
            "published": (item.findtext("pubDate") or "").strip(),
            "source": url.split("/")[2],
        })
    return out[:20]


def get_news() -> tuple[list[dict], bool]:
    if time.time() - _cache["ts"] < 3600 and _cache["items"]:
        return _cache["items"], _cache["sample"]
    items: list[dict] = []
    for url in config.NEWS_FEEDS:
        try:
            items.extend(_fetch(url))
        except Exception:
            continue
    sample = not items
    if sample:
        items = [{"title": t, "link": "", "summary": k, "published": "", "source": "sample"} for t, k in SAMPLE]
    _cache.update(ts=time.time(), items=items, sample=sample)
    return items, sample
