"""Build real community evidence for the catalog wines from X-Wines (CC0-1.0).

Input (download into ai/data/raw/, see README):
  XWines_Full_100K_wines.zip   wine attributes (grapes, body, acidity, food pairings, ABV, vintages)
  XWines_Full_21M_ratings.zip  21M user ratings (1-5 stars, with vintage and date)
Mapping: sources/xwines_catalog_map.json (hand-reviewed; null = not in X-Wines)
Output:  ai/data/xwines_evidence.json, keyed by "producer|name"

Per mapped wine: attributes (grapes, pairings, body, acidity, ABV) and a PEER-RELATIVE crowd
signal. Raw star averages are not comparable across regions and grapes (Burgundy rates low,
US Cabernet rates high), so a wine is only compared with its peers: same X-Wines region, same
primary grape and same type, each with at least MIN_RATINGS ratings. With fewer than MIN_PEERS
peers there is no comparison. No raw averages are exported.

Usage: python build_xwines.py      (standard library only; streams the 1 GB ratings file)
"""
from __future__ import annotations

import bisect
import csv
import importlib.util
import io
import json
import sys
import time
import zipfile
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RAW = ROOT / "ai" / "data" / "raw"
OUT = ROOT / "ai" / "data" / "xwines_evidence.json"
MAP = HERE / "sources" / "xwines_catalog_map.json"
CATALOG_PY = ROOT / "webos" / "backend" / "app" / "catalog.py"
MIN_RATINGS = 30
MIN_PEERS = 5


def load_catalog() -> list[dict]:
    spec = importlib.util.spec_from_file_location("catalog", CATALOG_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.CATALOG


def read_zip_csv(path: Path):
    z = zipfile.ZipFile(path)
    name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
    return z, name


def parse_list(s: str) -> list:
    s = (s or "").strip()
    if not s.startswith("["):
        return [s] if s else []
    return [x.strip().strip("'\"") for x in s[1:-1].split(",") if x.strip()]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    mapping = json.loads(MAP.read_text(encoding="utf-8"))["wines"]
    catalog = {(w["producer"], w["name"]): w for w in load_catalog()}
    missing = [m for m in mapping if (m["producer"], m["name"]) not in catalog]
    if missing:
        raise SystemExit(f"mapping entries not in catalog.py: {missing}")
    ids = {m["xwines_id"] for m in mapping if m["xwines_id"]}

    z, name = read_zip_csv(RAW / "XWines_Full_100K_wines.zip")
    wines = {int(r["WineID"]): r for r in csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8"))}
    unknown = ids - wines.keys()
    if unknown:
        raise SystemExit(f"WineIDs not in X-Wines: {sorted(unknown)}")
    print(f"X-Wines wines: {len(wines):,}; mapped catalog wines: {len(ids)}/{len(mapping)}")

    t0 = time.perf_counter()
    total = defaultdict(lambda: [0, 0.0])                      # all wines: count, sum
    per_vintage = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    hist = defaultdict(lambda: defaultdict(int))
    last = {}
    z, name = read_zip_csv(RAW / "XWines_Full_21M_ratings.zip")
    with z.open(name) as fh:
        for i, r in enumerate(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8"))):
            wid, rating = int(r["WineID"]), float(r["Rating"])
            t = total[wid]
            t[0] += 1
            t[1] += rating
            if wid in ids:
                v = per_vintage[wid][r["Vintage"]]
                v[0] += 1
                v[1] += rating
                hist[wid][r["Rating"]] += 1
                last[wid] = max(last.get(wid, ""), r["Date"])
            if i % 5_000_000 == 0 and i:
                print(f"  {i:,} ratings read ({time.perf_counter() - t0:.0f}s)")
    print(f"ratings read in {time.perf_counter() - t0:.0f}s")

    def peer_key(x: dict) -> tuple:
        grapes = parse_list(x["Grapes"])
        return (x["RegionName"], grapes[0] if grapes else "", x["Type"])

    peers = defaultdict(list)  # (region, primary grape, type) -> sorted means of rated wines
    for wid, (n, s) in total.items():
        if n >= MIN_RATINGS and wid in wines:
            peers[peer_key(wines[wid])].append(s / n)
    for v in peers.values():
        v.sort()

    out = {}
    for m in mapping:
        key = f"{m['producer']}|{m['name']}"
        wid = m["xwines_id"]
        if not wid:
            out[key] = None
            continue
        x, cat = wines[wid], catalog[(m["producer"], m["name"])]
        n, s = total.get(wid, (0, 0.0))
        vint = str(cat["vintage"]) if cat["vintage"] else "N.V."
        region, grape, wtype = peer_key(x)
        group = [v for v in peers.get((region, grape, wtype), [])]
        others = list(group)
        if n >= MIN_RATINGS and s / n in others:
            others.remove(s / n)  # do not compare the wine with itself
        relative = None
        if n >= MIN_RATINGS and len(others) >= MIN_PEERS:
            mean, peer_mean = s / n, sum(others) / len(others)
            relative = {
                "peer_group": f"{region} {grape} ({wtype.lower()})",
                "peers": len(others),
                "percentile": round(100 * bisect.bisect_left(others, mean) / len(others)),
                "delta_stars": round(mean - peer_mean, 2),
            }
        out[key] = {
            "xwines_id": wid, "xwines_name": f"{x['WineryName']} {x['WineName']}", "type": wtype,
            "region": region, "grapes": parse_list(x["Grapes"]), "pairings": parse_list(x["Harmonize"]),
            "body": x["Body"], "acidity": x["Acidity"], "abv": float(x["ABV"]) if x["ABV"] else None,
            "ratings": n, "vintage": vint, "vintage_ratings": per_vintage[wid].get(vint, (0, 0.0))[0],
            "relative": relative, "last_rating": last.get(wid),
            "source": "X-Wines (CC0-1.0, ratings collected 2022)",
        }
        rel = (f"top {max(1, 100 - relative['percentile'])}% of {relative['peers']} {relative['peer_group']} peers, "
               f"{relative['delta_stars']:+.2f} stars vs peer mean") if relative else f"no comparison ({len(others)} peers)"
        print(f"  {key}: {n:,} ratings ({vint}: {out[key]['vintage_ratings']}); {rel}; body {x['Body']}, acidity {x['Acidity']}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
