"""Build the 7B wine pool with real evidence (runs locally, standard library only).

Sources (in ai/data/raw/, see ai/lora/README.md and AI-7B/PLAN.md):
  Updated-Wine-Enthusiast-Reviews.arff  81k reviews 2017-2020 (OpenML mirror, research use only)
  XWines_Full_100K_wines.zip / XWines_Full_21M_ratings.zip  (CC0)
  ai/data/xwines_evidence.json  crowd evidence for the 20 catalog wines (ai/lora/build_xwines.py)

Pool:
  A  ~300 bottles from the reviews: critic evidence = the bottle's own review + its peer group.
  B  ~120 bottles from X-Wines: crowd evidence = peer-relative rank; critic evidence = peer group
     from the reviews when the region and grape match, else none.
  C  the 20 catalog wines (demo bottles): crowd from xwines_evidence.json, critic = peer group.
Held out: 15% of A and B (by bottle) plus the PoC's 4 catalog hold-outs.

Output: AI-7B/data/pool.jsonl (one wine per line) and a summary on stdout.
Usage:  python AI-7B/build_pool.py
"""
from __future__ import annotations

import bisect
import csv
import importlib.util
import io
import json
import random
import re
import statistics
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import evidence7b as ev7

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RAW = ROOT / "ai" / "data" / "raw"
OUT = HERE / "data"
CATALOG_PY = ROOT / "webos" / "backend" / "app" / "catalog.py"
XW_EVIDENCE = ROOT / "ai" / "data" / "xwines_evidence.json"
SEED = 42
MIN_GROUP = 15        # reviews needed for a critic peer group
MIN_RATINGS = 30      # X-Wines ratings needed per wine
MIN_PEERS = 5
QUOTA_A = {"France": 110, "Italy": 90, "US": 40, "Spain": 15, "Portugal": 10, "Germany": 10, "Austria": 5}
QUOTA_A_OTHER = 20
N_B = 120
CATALOG_HOLDOUT = {("Domaine Arnoux-Lachaux", "Bourgogne Rouge"), ("Domaine Roulot", "Meursault"),
                   ("Jacques Lassaigne", "Extra Brut Les Vignes de Montgueux"),
                   ("Ridge Vineyards", "Napa Valley Cabernet Sauvignon")}

RED = {"pinot noir", "cabernet sauvignon", "merlot", "syrah", "shiraz", "nebbiolo", "sangiovese", "tempranillo",
       "malbec", "zinfandel", "grenache", "red blend", "bordeaux-style red blend", "rhone-style red blend",
       "cabernet franc", "gamay", "barbera", "corvina, rondinella, molinara", "aglianico", "nero d'avola",
       "mourvedre", "petite sirah", "touriga nacional", "portuguese red", "carmenere", "sangiovese grosso",
       "primitivo", "montepulciano", "dolcetto", "garnacha", "monastrell", "tinta de toro", "blaufrankisch",
       "g-s-m", "petit verdot", "cabernet sauvignon-merlot", "nerello mascalese", "sagrantino", "lagrein"}
WHITE = {"chardonnay", "sauvignon blanc", "riesling", "pinot gris", "pinot grigio", "gruner veltliner",
         "chenin blanc", "viognier", "white blend", "bordeaux-style white blend", "albarino", "vermentino",
         "garganega", "semillon", "gewurztraminer", "pinot blanc", "verdejo", "fiano", "greco", "falanghina",
         "verdicchio", "assyrtiko", "torrontes", "rhone-style white blend", "marsanne", "roussanne",
         "melon", "portuguese white", "alvarinho", "muscat", "moscato", "trebbiano", "friulano", "godello"}
SPARKLING = {"sparkling blend", "champagne blend", "prosecco", "glera", "cava"}
SYNONYMS = {"syrah/shiraz": "syrah", "shiraz": "syrah", "garnacha": "grenache", "mourvedre": "mourvedre",
            "pinot grigio": "pinot gris", "tempranillo/tinta roriz": "tempranillo", "sangiovese grosso": "sangiovese",
            "muscat/moscato": "muscat", "moscato": "muscat", "alvarinho": "albarino"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9,'/ -]+", " ", s)).strip()


def grape_key(g: str) -> str:
    g = norm(g)
    return SYNONYMS.get(g, g)


def color_of(variety: str) -> str | None:
    v = norm(variety)
    if v in SPARKLING or "sparkling" in v:
        return "sparkling"
    if "rose" in v:
        return "rose"
    if v in RED:
        return "red"
    if v in WHITE:
        return "white"
    return None


def load_catalog() -> list[dict]:
    spec = importlib.util.spec_from_file_location("catalog", CATALOG_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.CATALOG


# ---------------------------------------------------------------- reviews (critic evidence)
def load_reviews() -> list[dict]:
    lines = (RAW / "Updated-Wine-Enthusiast-Reviews.arff").read_text(encoding="utf-8", errors="replace").splitlines()
    attrs = [l.split()[1].strip("'\"") for l in lines if l.lower().startswith("@attribute")]
    start = next(i for i, l in enumerate(lines) if l.strip().lower() == "@data") + 1
    rows = []
    for rec in csv.reader(lines[start:], quotechar="'", escapechar="\\", skipinitialspace=True):
        if len(rec) != len(attrs):
            continue
        r = dict(zip(attrs, rec))
        try:
            r["points"] = int(float(r["points"]))
        except ValueError:
            continue
        try:
            r["price"] = float(r["price"])
        except ValueError:
            r["price"] = None
        r["region"] = r["region_1"] if r.get("region_1") not in (None, "", "?") else r.get("province", "")
        r["color"] = color_of(r.get("variety", ""))
        r["vintage_i"] = int(r["vintage"]) if re.fullmatch(r"(19|20)\d\d", r.get("vintage", "")) else None
        rows.append(r)
    return rows


def drink_window(text: str) -> dict | None:
    t = text.lower()
    m = re.search(r"drink (?:it )?(?:from|after) (\d{4})(?:[^.]{0,25}?(?:through|to|until|-|–)\s*(\d{4}))?", t) \
        or re.search(r"best (?:from|after) (\d{4})(?:[^.]{0,25}?(?:through|to|until|-|–)\s*(\d{4}))?", t)
    if m:
        return {"from": int(m.group(1)), "to": int(m.group(2)) if m.group(2) else None}
    m = re.search(r"drink (\d{4})\s*(?:-|–|to|through)\s*(\d{4})", t)
    if m:
        return {"from": int(m.group(1)), "to": int(m.group(2))}
    m = re.search(r"drink (?:now|up)?\s*(?:through|until|to|by)\s+(\d{4})", t)
    if m:
        return {"from": "now", "to": int(m.group(1))}
    if re.search(r"\bdrink (?:it )?now\b", t):
        return {"from": "now", "to": None}
    return None


def groups_of(reviews: list[dict]) -> dict:
    by = defaultdict(list)
    for r in reviews:
        if r["region"] and r["region"] != "?" and r.get("variety"):
            by[(norm(r["region"]), grape_key(r["variety"]))].append(r)
    out = {}
    for key, rs in by.items():
        if len(rs) < MIN_GROUP:
            continue
        pts = sorted(r["points"] for r in rs)
        prices = [r["price"] for r in rs if r["price"]]
        ppd = sorted(r["points"] / r["price"] for r in rs if r["price"])
        q = statistics.quantiles(pts, n=4)
        desc = Counter(d for r in rs for d in ev7.find_descriptors(r.get("description", "")))
        out[key] = {"label": f"{rs[0]['region']} {rs[0]['variety']}", "n": len(rs),
                    "median": int(statistics.median(pts)), "q1": int(q[0]), "q3": int(q[2]),
                    "price": statistics.median(prices) if prices else 0.0, "_ppd": ppd,
                    "descriptors": [d for d, _ in desc.most_common(5)]}
    return out


def public_group(g: dict | None) -> dict | None:
    return {k: v for k, v in g.items() if not k.startswith("_")} if g else None


def bottle_evidence(r: dict, g: dict) -> dict:
    ppd = r["points"] / r["price"] if r["price"] else None
    value = round(100 * bisect.bisect_left(g["_ppd"], ppd) / len(g["_ppd"])) if ppd and g["_ppd"] else None
    return {"points": r["points"], "price": r["price"], "window": drink_window(r.get("description", "")),
            "descriptors": ev7.find_descriptors(r.get("description", ""), 5), "value_pct": value}


def wine_from_review(r: dict) -> dict:
    title = r.get("title", "")
    name = re.sub(r"\s*\([^)]*\)\s*$", "", title)
    if name.lower().startswith(r["winery"].lower()):
        name = name[len(r["winery"]):]
    name = re.sub(r"\b(19|20)\d\d\b|\bNV\b", "", name).strip(" -")
    name = re.sub(r"\s+", " ", name) or r["variety"]
    return {"producer": r["winery"], "name": name, "vintage": r["vintage_i"] or 0, "region": r["region"],
            "grape": r["variety"], "color": r["color"], "price": r["price"]}


# ---------------------------------------------------------------- X-Wines (crowd evidence)
def parse_list(s: str) -> list[str]:
    s = (s or "").strip()
    return [x.strip().strip("'\"") for x in s[1:-1].split(",") if x.strip()] if s.startswith("[") else ([s] if s else [])


def xwines_pool(rng: random.Random, n: int) -> list[dict]:
    z = zipfile.ZipFile(RAW / "XWines_Full_100K_wines.zip")
    wines = {int(r["WineID"]): r for r in csv.DictReader(io.TextIOWrapper(z.open("XWines_Full_100K_wines.csv"), encoding="utf-8"))}
    zr = zipfile.ZipFile(RAW / "XWines_Full_21M_ratings.zip")
    name = zr.namelist()[0]
    total = defaultdict(lambda: [0, 0.0])
    with zr.open(name) as fh:
        for r in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8")):
            t = total[int(r["WineID"])]
            t[0] += 1
            t[1] += float(r["Rating"])
    peers = defaultdict(list)
    key = lambda x: (x["RegionName"], (parse_list(x["Grapes"]) or [""])[0], x["Type"])
    for wid, (c, s) in total.items():
        if c >= MIN_RATINGS and wid in wines:
            peers[key(wines[wid])].append((s / c, wid))
    cands = []
    for k, lst in peers.items():
        if len(lst) >= MIN_PEERS + 1 and wines[lst[0][1]]["Country"] in ("France", "Italy", "United States", "Spain",
                                                                          "Portugal", "Germany", "Austria", "Argentina",
                                                                          "Chile", "Australia", "New Zealand"):
            cands += [wid for _, wid in lst]
    chosen = rng.sample(sorted(set(cands)), k=min(n, len(cands)))
    vint = {}
    for wid in chosen:
        vs = [v for v in parse_list(wines[wid]["Vintages"]) if re.fullmatch(r"(19|20)\d\d", v) and 2008 <= int(v) <= 2020]
        vint[wid] = rng.choice(vs) if vs else "N.V."
    vcount = Counter()
    want = {(wid, vint[wid]) for wid in chosen}
    with zr.open(name) as fh:
        for r in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8")):
            k2 = (int(r["WineID"]), r["Vintage"])
            if k2 in want:
                vcount[k2] += 1
    out = []
    tmap = {"Red": "red", "White": "white", "Sparkling": "sparkling", "Rosé": "rose", "Dessert": "white",
            "Dessert/Port": "red"}
    for wid in chosen:
        x = wines[wid]
        c, s = total[wid]
        others = sorted(m for m, w in peers[key(x)] if w != wid)
        mean = s / c
        pct = round(100 * bisect.bisect_left(others, mean) / len(others))
        grapes = parse_list(x["Grapes"])
        out.append({"wine": {"producer": x["WineryName"], "name": x["WineName"],
                             "vintage": int(vint[wid]) if vint[wid] != "N.V." else 0, "region": x["RegionName"],
                             "grape": ", ".join(grapes[:3]) or "blend", "color": tmap.get(x["Type"], "red"), "price": None},
                    "crowd": {"peer_group": f"{x['RegionName']} {grapes[0] if grapes else ''} ({x['Type'].lower()})",
                              "peers": len(others), "top_pct": max(1, 100 - pct),
                              "delta": round(mean - sum(others) / len(others), 2), "ratings": c,
                              "vintage": vint[wid], "vintage_ratings": vcount[(wid, vint[wid])],
                              "body": x["Body"], "acidity": x["Acidity"], "pairings": parse_list(x["Harmonize"])[:4]},
                    "_country": x["Country"], "_grape_key": grape_key(grapes[0]) if grapes else ""})
    return out


def catalog_crowd(w: dict) -> dict | None:
    x = json.loads(XW_EVIDENCE.read_text(encoding="utf-8")).get(f"{w['producer']}|{w['name']}")
    if not x:
        return None
    rel = x.get("relative")
    return {"peer_group": rel["peer_group"] if rel else f"{x['region']} {(x['grapes'] or [''])[0]}",
            "peers": rel["peers"] if rel else None, "top_pct": max(1, 100 - rel["percentile"]) if rel else None,
            "delta": rel["delta_stars"] if rel else None, "ratings": x["ratings"], "vintage": x["vintage"],
            "vintage_ratings": x["vintage_ratings"], "body": x["body"], "acidity": x["acidity"],
            "pairings": x["pairings"][:4]}


# ---------------------------------------------------------------- main
def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    rng = random.Random(SEED)
    reviews = load_reviews()
    groups = groups_of(reviews)
    print(f"reviews: {len(reviews):,}; peer groups with >= {MIN_GROUP} reviews: {len(groups):,}")

    # Pool A: bottles with their own review
    cand = [r for r in reviews if r["color"] and r["price"] and (r["vintage_i"] or r["color"] == "sparkling")
            and (norm(r["region"]), grape_key(r["variety"])) in groups]
    rng.shuffle(cand)
    per_group, per_country, pool = Counter(), Counter(), []
    for r in cand:
        gk = (norm(r["region"]), grape_key(r["variety"]))
        quota = QUOTA_A.get(r["country"], QUOTA_A_OTHER if r["country"] not in QUOTA_A else 0)
        ckey = r["country"] if r["country"] in QUOTA_A else "other"
        if per_group[gk] >= 2 or per_country[ckey] >= quota:
            continue
        per_group[gk] += 1
        per_country[ckey] += 1
        g = groups[gk]
        pool.append({"source": "review", "wine": wine_from_review(r),
                     "critic": {"bottle": bottle_evidence(r, g), "group": public_group(g)}, "crowd": None})
    print("pool A by country:", dict(per_country))

    # Pool B: X-Wines bottles
    region_keys = {k[0] for k in groups}
    nb = 0
    for b in xwines_pool(rng, N_B):
        gk = (norm(b["wine"]["region"]), b.pop("_grape_key"))
        b.pop("_country")
        pool.append({"source": "xwines", "wine": b["wine"], "crowd": b["crowd"],
                     "critic": {"bottle": None, "group": public_group(groups[gk])} if gk in groups else None})
        nb += 1
    print(f"pool B: {nb} X-Wines bottles, {sum(1 for p in pool[-nb:] if p['critic'])} with a critic peer group "
          f"(region names known to reviews: {len(region_keys):,})")

    # Pool C: catalog
    for w in load_catalog():
        gk = None
        for reg in (w["name"], w["region"]):
            k = (norm(reg), grape_key(w["grape"].split(",")[0]))
            if k in groups:
                gk = k
                break
        pool.append({"source": "catalog", "wine": {k: w[k] for k in ("producer", "name", "vintage", "region", "grape", "color")}
                     | {"price": float(w["base_price"])},
                     "critic": ({"bottle": None, "group": public_group(groups[gk]), "list_price": float(w["base_price"])}
                                if gk else None),
                     "crowd": catalog_crowd(w),
                     "_holdout": (w["producer"], w["name"]) in CATALOG_HOLDOUT})

    for p in pool:
        hold = p.pop("_holdout", None)
        p["split"] = ("eval" if hold else "train") if p["source"] == "catalog" else ("eval" if rng.random() < 0.15 else "train")
        p["label"] = f"{p['wine']['producer']} {p['wine']['name']} {p['wine']['vintage'] or 'NV'} " \
                     f"({p['wine']['region']}, {p['wine']['grape']}, {p['wine']['color']})"
    OUT.mkdir(exist_ok=True)
    with open(OUT / "pool.jsonl", "w", encoding="utf-8") as fh:
        for i, p in enumerate(pool):
            fh.write(json.dumps({"id": f"w{i:04d}"} | p, ensure_ascii=False) + "\n")

    c = Counter((p["source"], p["split"]) for p in pool)
    print("pool:", dict(c), "| total", len(pool))
    print("critic evidence:", sum(1 for p in pool if p["critic"]), "| bottle reviews:",
          sum(1 for p in pool if p["critic"] and p["critic"]["bottle"]), "| with drink window:",
          sum(1 for p in pool if p["critic"] and p["critic"]["bottle"] and p["critic"]["bottle"]["window"]))
    print("crowd evidence:", sum(1 for p in pool if p["crowd"]), "| ranked:",
          sum(1 for p in pool if p["crowd"] and p["crowd"].get("top_pct") is not None))
    ex = next(p for p in pool if p["source"] == "review" and p["critic"]["bottle"]["window"])
    print("\nexample label:", ex["label"])
    print(ev7.format_critic(ex["critic"]))
    exb = next(p for p in pool if p["source"] == "xwines")
    print("\nexample label:", exb["label"])
    print(ev7.format_crowd(exb["crowd"]))
    print(ev7.format_critic(exb["critic"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
