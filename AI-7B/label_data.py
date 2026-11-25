"""Label-reading test set: X-Wines wines (CC0) rendered as the text lines an OCR engine returns from a label.

Real label photos with ground truth are scarce, so each case starts from a known wine and simulates what
Rekognition DetectText gives back: the wine's lines plus label boilerplate (bottle size, alcohol, bottling
notes, founding years), in a loosely shuffled order, with OCR slips (0/O, 1/l, rn/m, c/e, lost accents) and
long lines split in two. In 10% of cases the vintage line is missing, so the right answer is "no vintage".

Output (gitignored):
  data/labels_eval.jsonl     N cases: {"id", "lines", "truth", "wine_id"}
  data/labels_catalog.jsonl  the eval wines plus distractors, the catalog the matcher searches
Usage: python label_data.py [--n 300] [--catalog 2000] [--seed 7]
"""
from __future__ import annotations

import argparse
import ast
import csv
import io
import json
import random
import unicodedata
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "data" / "raw" / "XWines_Full_100K_wines.zip"
COLOR = {"Red": "red", "White": "white", "Rosé": "rose", "Sparkling": "sparkling",
         "Dessert": "dessert", "Dessert/Port": "dessert"}
OCR_SWAP = {"O": "0", "o": "0", "0": "O", "l": "1", "I": "l", "1": "l", "S": "5", "B": "8", "e": "c",
            "c": "e", "g": "q", "G": "C", "rn": "m", "m": "rn", "h": "b", "u": "v"}
APPELLATION = {"France": "Appellation {r} Controlee", "Italy": "{r} Denominazione di Origine Controllata",
               "Spain": "Denominacion de Origen {r}", "Portugal": "Denominacao de Origem {r}",
               "Germany": "Qualitatswein {r}"}
BOILER = ["750 ml", "750ML", "75 cl", "Contains sulfites", "Estate bottled", "Mis en bouteille au domaine",
          "Imbottigliato all'origine", "Embotellado en origen", "Gutsabfullung", "Produced and bottled by",
          "Lot L{lot}", "Alc. {abv}% vol", "{abv}% vol", "Product of {country}", "Produce of {country}",
          "Since {founded}", "Founded in {founded}", "Family owned since {founded}"]


def load_wines() -> list[dict]:
    with zipfile.ZipFile(RAW) as z:
        rows = list(csv.DictReader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8")))
    wines = []
    for r in rows:
        years = [v for v in ast.literal_eval(r["Vintages"]) if isinstance(v, int) and 1960 <= v <= 2022]
        if r["Type"] not in COLOR or not r["WineryName"] or not r["WineName"]:
            continue
        wines.append({"wine_id": r["WineID"], "producer": r["WineryName"], "name": r["WineName"],
                      "region": r["RegionName"], "country": r["Country"], "color": COLOR[r["Type"]],
                      "grapes": ast.literal_eval(r["Grapes"]), "abv": r["ABV"], "years": years})
    return wines


def strip_accents(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def ocr_noise(line: str, rnd: random.Random, rate: float) -> str:
    if rnd.random() < 0.5:
        line = strip_accents(line)
    out, i = [], 0
    while i < len(line):
        two = line[i:i + 2]
        if two in OCR_SWAP and rnd.random() < rate:
            out.append(OCR_SWAP[two]); i += 2; continue
        ch = line[i]
        out.append(OCR_SWAP[ch] if ch in OCR_SWAP and rnd.random() < rate else ch)
        i += 1
    return "".join(out)


def render(w: dict, rnd: random.Random) -> tuple[list[str], dict]:
    vintage = rnd.choice(w["years"]) if w["years"] and rnd.random() < 0.92 else None
    producer = w["producer"].upper() if rnd.random() < 0.6 else w["producer"]
    lines = [producer, w["name"] if rnd.random() < 0.5 else w["name"].upper()]
    if w["region"] and rnd.random() < 0.85:
        tpl = APPELLATION.get(w["country"])
        lines.append(tpl.format(r=w["region"]) if tpl and rnd.random() < 0.6 else w["region"])
    shown_vintage = vintage if vintage and rnd.random() < 0.9 else None    # sometimes the year is not legible
    if shown_vintage:
        lines.append(str(shown_vintage) if rnd.random() < 0.8 else f"Vintage {shown_vintage}")
    founded = rnd.randint(1820, 1990)
    for b in rnd.sample(BOILER, rnd.randint(2, 5)):
        lines.append(b.format(lot=rnd.randint(100, 999), abv=w["abv"] or "13", country=w["country"], founded=founded))
    rate = rnd.choice([0.0, 0.03, 0.06])
    lines = [ocr_noise(l, rnd, rate) for l in lines]
    split = []
    for l in lines:                       # OCR breaks long lines
        if len(l) > 18 and " " in l and rnd.random() < 0.3:
            cut = rnd.choice([i for i, c in enumerate(l) if c == " "])
            split += [l[:cut], l[cut + 1:]]
        else:
            split.append(l)
    for _ in range(len(split) // 2):      # loose order: neighbours swap
        i = rnd.randrange(len(split) - 1)
        split[i], split[i + 1] = split[i + 1], split[i]
    truth = {"producer": w["producer"], "name": w["name"], "vintage": shown_vintage, "region": w["region"],
             "country": w["country"], "color": w["color"], "grapes": w["grapes"]}
    return split, truth


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--catalog", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    rnd = random.Random(args.seed)
    wines = load_wines()
    rnd.shuffle(wines)
    chosen, distract = wines[:args.n], wines[args.n:args.catalog]
    out = HERE / "data"
    with open(out / "labels_eval.jsonl", "w", encoding="utf-8") as f:
        for i, w in enumerate(chosen):
            lines, truth = render(w, rnd)
            f.write(json.dumps({"id": f"l{i:04d}", "lines": lines, "truth": truth, "wine_id": w["wine_id"]},
                               ensure_ascii=False) + "\n")
    with open(out / "labels_catalog.jsonl", "w", encoding="utf-8") as f:
        for w in chosen + distract:
            f.write(json.dumps({k: w[k] for k in ("wine_id", "producer", "name", "region", "country", "color")},
                               ensure_ascii=False) + "\n")
    print(f"{len(chosen)} cases, catalog {len(chosen) + len(distract)} wines (from {len(wines)} X-Wines wines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
