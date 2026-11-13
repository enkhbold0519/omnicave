"""Generate the PoC dataset for the three critic personas (RAG + LoRA).

Each sample is one debate turn exactly as the backend sends it (prompts.critic_messages), plus
the retrieved-evidence block that serve.py appends (prompts.add_evidence), plus a template reply.
Replies take drinking dates, published-score context and tasting notes ONLY from the evidence
block, so the adapter learns to read evidence rather than memorize wines:
  - training evidence is perturbed per sample (evidence.sample_for_training);
  - about 10% of samples have no evidence, and those replies state no dates or tasting notes;
  - eval samples use the same deterministic evidence that serve.py retrieves.

Each persona has its own scale, so adherence is easy to measure:
  power-critic  (Victor Hale)   -> "93-95 points"   (100-point range)
  fruit-purist  (Livia Moretti) -> "FQI 1.6"        (fruit quality index)
  classicist    (Eleanor Finch) -> "17.5/20"        (20-point scale)

Usage:
  python make_dataset.py            # writes data/train.jsonl and data/eval.jsonl, then checks
  python make_dataset.py --check    # only checks existing files
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import evidence as evd
import prompts
from evidence import CrowdEvidence, Evidence

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"

# Held out of training; their grapes and colors still appear in other training wines.
HOLDOUT = {
    ("Domaine Arnoux-Lachaux", "Bourgogne Rouge"),
    ("Domaine Roulot", "Meursault"),
    ("Jacques Lassaigne", "Extra Brut Les Vignes de Montgueux"),
    ("Ridge Vineyards", "Napa Valley Cabernet Sauvignon"),
}
FOOD = {
    "red": {3: "roast lamb", 2: "braised beef", 1: "duck breast", 0: "roast pork"},
    "white": {3: "lobster with butter", 2: "roast chicken", 1: "sole meunière", 0: "oysters"},
    "sparkling": {3: "fried chicken", 2: "tempura", 1: "oysters", 0: "oysters"},
    "rose": {3: "grilled sardines", 2: "salade niçoise", 1: "grilled prawns", 0: "grilled prawns"},
}
PREFS = [{}, {}, {"style": "bold reds"}, {"style": "fresh whites"}, {"budget": "under 100 USD"},
         {"note": "likes older vintages"}, {"occasion": "dinner parties"}]
SCALE_RE = {
    "power-critic": re.compile(r"\b\d{2}-\d{2} points\b"),
    "fruit-purist": re.compile(r"\bFQI \d\.\d\b"),
    "classicist": re.compile(r"\b\d{2}(?:\.5|\.0)?/20\b"),
    "crowd-taste": re.compile(r"\btop \d{1,2}% of \d"),
}
NOTE_VOCAB = sorted(set(evd.ALL_AROMAS) | set(evd.STRUCTURE_NOTES), key=len, reverse=True)


def short_label(w: dict) -> str:
    """services._wine_label(): producer + name + vintage, without repeating the producer."""
    prod = "" if w["name"].startswith(w["producer"]) else w["producer"] + " "
    return f"{prod}{w['name']} {w['vintage'] or 'NV'}"


def owner_ctx(rng: random.Random, catalog: list[dict]) -> str:
    total = rng.choice([0, 0, 3, 7, 12, 25, 40])
    if total == 0:
        return prompts.owner_context(rng.choice(PREFS), 0, [], [], [])

    def top(values: list[str]) -> list[tuple[str, int]]:
        picks = rng.sample(sorted(set(values)), k=min(3, len(set(values))))
        counts = sorted((rng.randint(1, max(1, total // 2)) for _ in picks), reverse=True)
        return list(zip(picks, counts))

    return prompts.owner_context(
        rng.choice(PREFS), total,
        top([w["color"] for w in catalog]),
        top([w["region"] for w in catalog]),
        top([g.strip() for w in catalog for g in w["grape"].split(",")]),
    )


def status(ev: Evidence | None, year: int) -> str:
    if not ev or not ev.window:
        return "unknown"
    lo, hi = ev.window
    return "young" if year < lo else "ready" if year <= hi else "past"


def pick(notes: list[str], k: int, rng: random.Random, prefer_aroma: bool = False) -> list[str]:
    pool = [n for n in notes if n in evd.ALL_AROMAS] if prefer_aroma else list(notes)
    pool = pool or list(notes)
    out = rng.sample(pool, k=min(k, len(pool)))
    return out


def color_word(w: dict) -> str:
    # "rose" is also a tasting note (Nebbiolo, Cinsault); write the wine color as "rosé".
    return "rosé" if w["color"] == "rose" else w["color"]


def join(xs: list[str]) -> str:
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]


# ---------------------------------------------------------------- persona templates
def power_reply(w: dict, s: dict, ev: Evidence | None, year: int, rng: random.Random, prev: dict) -> tuple[str, dict]:
    name = short_label(w)
    adj = {3: "dense, powerful", 2: "concentrated, generous", 1: "polished but lighter", 0: "lean, delicate"}[s["body"]]
    if ev and ev.notes:
        n = pick(ev.notes, 3, rng)
        s1 = rng.choice([f"{name} is a {adj} wine, and the notes point to {join(n)}.",
                         f"Here is {name}: {join(n)}, in a {adj} frame.",
                         f"{name} delivers {join(n)}, {adj} from start to finish."])
    else:
        s1 = rng.choice([f"I have no reliable tasting notes for {name}, so I judge it on style: a {adj} {color_word(w)} from {w['region']}.",
                         f"Sources are thin on {name}; on style alone it should be {adj}."])
    bias = 1 if s["body"] >= 2 else -1
    if ev and ev.critic:
        mid = (ev.critic[0] + ev.critic[1]) // 2 + bias
        lo = max(85, min(97, mid - 1))
        s2 = rng.choice([f"I'd score it {lo}-{lo + 2} points, {'a touch above' if bias > 0 else 'a touch below'} the published consensus.",
                         f"That puts it at {lo}-{lo + 2} points."])
    else:
        lo = 89 + bias + (1 if s["body"] == 3 else 0)
        s2 = f"With no published scores to lean on, my own read is {lo}-{lo + 2} points."
    st = status(ev, year)
    if st == "young":
        a, b = ev.window
        s3 = rng.choice([f"Give it time; the window opens in {a} and runs to {b}.",
                         f"Too young today, so start opening it in {a} and it will run to {b}."])
    elif st == "ready":
        s3 = rng.choice([f"It is drinking now and will hold to {ev.window[1]}.",
                         f"Open it any time between now and {ev.window[1]}."])
    elif st == "past":
        s3 = f"The window closed in {ev.window[1]}, so drink it soon."
    else:
        s3 = "I found no reliable drinking-window data, so I won't put dates on it."
    return " ".join([s1, s2, s3]), {"low": lo}


def fruit_reply(w: dict, s: dict, ev: Evidence | None, year: int, rng: random.Random, prev: dict) -> tuple[str, dict]:
    who = prev.get("power-critic")
    if ev and ev.notes:
        f = pick(ev.notes, 2, rng, prefer_aroma=True)
        if who:
            s1 = rng.choice([
                f"Victor's {'high score' if who['low'] >= 92 else 'score'} rewards extraction, but I look at the fruit itself: {join(f)}.",
                f"I see it differently from Victor Hale, because the {join(f)} matter more than power.",
            ])
        else:
            s1 = f"The fruit is what counts here: {join(f)}."
    else:
        s1 = ("Without reliable tasting notes I can only reason from the grape, not the glass." if not who else
              "Victor is guessing as much as I am; there are no reliable tasting notes for this bottle.")
    fqi = 1.0 + 0.25 * (3 - s["tannin"]) + 0.15 * s["body"] - 0.1 * (s["acid"] - 2)
    fqi = round(min(2.2, max(0.6, fqi + rng.choice([-0.1, 0, 0.1]))), 1)
    verdict = ("the fruit is clearly ahead of the structure" if fqi >= 1.5 else
               "fruit and structure are in balance" if fqi >= 1.0 else "the tannin and acid still outweigh the fruit")
    s2 = rng.choice([f"On my fruit quality index it scores FQI {fqi}, so {verdict}.",
                     f"I measure it at FQI {fqi}: {verdict}."])
    st = status(ev, year)
    if st == "young":
        s3 = f"The fruit is still tight, so I would wait until {ev.window[0]}."
    elif st == "ready":
        s3 = rng.choice([f"It is already giving pleasure, so drink it before {ev.window[1]} while the fruit is fresh.",
                         f"Open it now; there is no reason to wait for {ev.window[1]}."])
    elif st == "past":
        s3 = "The fruit is fading, so drink it now."
    else:
        s3 = "With no window data, open one bottle and judge the fruit before deciding."
    return " ".join([s1, s2, s3]), {"fqi": fqi}


def classic_reply(w: dict, s: dict, ev: Evidence | None, year: int, rng: random.Random, prev: dict) -> tuple[str, dict]:
    acid_word = {3: "bright, tense acidity", 2: "fresh acidity", 1: "softer acidity", 0: "low acidity"}[s["acid"]]
    if ev and ev.notes:
        a = pick(ev.notes, 2, rng)
        s1 = rng.choice([f"Balance first: {join(a)}, carried by {acid_word}.",
                         f"What I notice is {acid_word} and a clear sense of {w['region']}, with {join(a)}."])
    else:
        s1 = f"There are no reliable notes on this bottle, so I can only expect {acid_word} from a {w['region']} {color_word(w)}."
    if ev and ev.critic:
        mid = (ev.critic[0] + ev.critic[1]) / 2
        raw = 10 + (mid - 80) * 0.5 + 0.5 * (s["acid"] - 2)
    else:
        raw = 16 + 0.5 * s["acid"] + (1 - abs(s["body"] - 2) * 0.5)
    score = f"{min(19.0, max(15.5, round((raw + rng.choice([-0.5, 0, 0])) * 2) / 2)):g}"
    if prev.get("power-critic") and prev.get("fruit-purist"):
        s2 = rng.choice([f"Victor's points and Livia's index both overlook that; on my 20-point scale it is {score}/20.",
                         f"I would temper my colleagues' enthusiasm and give it {score}/20."])
    else:
        s2 = f"On my 20-point scale it is {score}/20."
    food = FOOD[w["color"]][s["body"]]
    st = status(ev, year)
    if st == "young":
        s3 = f"Best window {ev.window[0]}-{ev.window[1]}; serve it with {food} rather than alone."
    elif st == "ready":
        s3 = rng.choice([f"Best window now to {ev.window[1]}; serve it with {food} rather than alone.",
                         f"Drink between now and {ev.window[1]}, at the table with {food}."])
    elif st == "past":
        s3 = f"It is past its window, so drink it soon with {food}."
    else:
        s3 = f"I have no window to quote, but it belongs at the table with {food}."
    return " ".join([s1, s2, s3]), {"score20": score}


def crowd_reply(w: dict, s: dict, ev: CrowdEvidence | None, year: int, rng: random.Random, prev: dict) -> tuple[str, dict]:
    """Jordan Reyes: peer-relative community view from X-Wines. No dates, no tasting notes."""
    lead = rng.choice(["", "Whatever the critics say, ", "Speaking for everyday drinkers, "]) if prev else ""
    if ev is None:
        s1 = f"{lead}I couldn't find community ratings for this bottle, so I'd rather not guess how drinkers rate it."
        s2 = "Go by the critics above and trust your own glass."
        return " ".join([s1, s2]), {}
    if ev.ranked:
        rel = evd.relation(ev.delta)  # same words the evidence block shows
        how = ("right around its neighbours" if rel.startswith("about") else
               f"{ev.delta:+.2f} stars {rel.split()[0]} its neighbours")
        s1 = rng.choice([
            f"{lead}compared only with {ev.peers} other {ev.peer_group} bottles, the crowd puts this in the top {ev.top_pct}% of {ev.peers}, {how}.",
            f"{lead}among {ev.peer_group} wines only, drinkers rank it in the top {ev.top_pct}% of {ev.peers} peers, {how}.",
        ])
        s1 = s1[0].upper() + s1[1:]
    else:
        s1 = (f"{lead}the crowd hasn't rated enough {ev.peer_group} bottles like this one to rank it fairly, "
              "and I won't compare it with wines from elsewhere.")
        s1 = s1[0].upper() + s1[1:]
    parts = []
    if ev.body and ev.acidity:
        parts.append(f"drinkers describe a {ev.body.lower()} wine with {ev.acidity.lower()} acidity")
    if ev.pairings:
        parts.append(f"it goes best with {join([p.lower() for p in ev.pairings[:2]])}")
    s2 = (" and ".join(parts) + ".") if parts else "There is no style or food data for it."
    s2 = s2[0].upper() + s2[1:]
    if ev.vintage_ratings == 0 and ev.vintage != "N.V.":
        s3 = f"Nobody in the data has rated the {ev.vintage} vintage yet, so this reflects older vintages."
    else:
        s3 = rng.choice(["Timing I leave to the critics; my job is telling you whether it's worth opening.",
                         "When to open it is the critics' call; the crowd only tells you how it lands."])
    return " ".join([s1, s2, s3]), {}


REPLY = {"power-critic": power_reply, "fruit-purist": fruit_reply, "classicist": classic_reply,
         "crowd-taste": crowd_reply}


def debate(w: dict, personas: list[dict], year: int, rng: random.Random, uctx: str, ev: Evidence | None,
           crowd: CrowdEvidence | None) -> list[dict]:
    """One full debate on a wine; critics share one evidence set, the crowd persona gets X-Wines."""
    s = evd.structure(w)
    label = prompts.wine_label(w)
    transcript: list[str] = []
    prev: dict = {}
    out = []
    for p in personas:
        mine = crowd if p["id"] == evd.CROWD_ID else ev
        block = evd.format_crowd(mine) if p["id"] == evd.CROWD_ID else evd.format_block(mine)
        text, meta = REPLY[p["id"]](w, s, mine, year, rng, prev)
        backend = prompts.critic_messages(p, label, uctx, transcript)
        out.append({"persona": p["id"], "adapter": p["lora_adapter"], "wine": short_label(w), "year": year,
                    "evidence": mine.to_dict() if mine else None, "backend_messages": backend,
                    "messages": prompts.add_evidence(backend, block) + [{"role": "assistant", "content": text}]})
        prev[p["id"]] = meta
        transcript.append(prompts.transcript_line(p, text))
    return out


def generate(per_wine_train: int, per_wine_eval: int, year: int, seed: int) -> None:
    catalog = evd.load_catalog()
    personas = prompts.load_personas()
    missing = set(REPLY) ^ {p["id"] for p in personas}
    if missing:
        raise SystemExit(f"personas.json and REPLY templates differ: {sorted(missing)}")
    names = {(w["producer"], w["name"]) for w in catalog}
    if not HOLDOUT <= names:
        raise SystemExit(f"Holdout wines missing from catalog: {sorted(HOLDOUT - names)}")
    rng = random.Random(seed)
    DATA.mkdir(exist_ok=True)
    counts = Counter()
    for split, n in (("train", per_wine_train), ("eval", per_wine_eval)):
        rows = []
        for w in catalog:
            if ((w["producer"], w["name"]) in HOLDOUT) != (split == "eval"):
                continue
            for _ in range(n):
                ev = evd.sample_for_training(w, rng) if split == "train" else evd.lookup(prompts.wine_label(w))
                crowd = evd.crowd_for_training(w, rng) if split == "train" else evd.crowd_lookup(w)
                for s in debate(w, personas, year, rng, owner_ctx(rng, catalog), ev, crowd):
                    rows.append(s | {"split": split})
        rng.shuffle(rows)
        with open(DATA / f"{split}.jsonl", "w", encoding="utf-8") as fh:
            for i, r in enumerate(rows):
                fh.write(json.dumps({"id": f"{split}-{i:05d}"} | r, ensure_ascii=False) + "\n")
        counts.update(f"{split}/{r['persona']}" for r in rows)
    print("Wrote", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))


# ---------------------------------------------------------------- checks (shared with eval.py)
def sentences(text: str, wine: str) -> int:
    # Producer names such as "G.D. Vajra" contain dots, so mask the wine label first.
    return len(re.split(r"(?<=[.!?])\s+", text.replace(wine, "WINE").strip()))


def mentioned_notes(text: str) -> set[str]:
    """Known tasting/structure descriptors in a reply (longest phrases first, no double counting)."""
    low, found = text.lower(), set()
    for n in NOTE_VOCAB:
        if re.search(rf"\b{re.escape(n)}\b", low):
            found.add(n)
            low = re.sub(rf"\b{re.escape(n)}\b", " ", low)
    return found


def grounding(reply: str, persona: str, wine: dict, wine_label: str, ev, year: int) -> dict:
    if persona == evd.CROWD_ID:
        return crowd_grounding(reply, wine, wine_label, ev)
    allowed_years = {wine["vintage"], year} | (ev.years() if ev else set())
    years = {int(y) for y in re.findall(r"\b(19\d\d|20\d\d)\b", reply)}
    notes = mentioned_notes(reply)
    ev_notes = set(ev.notes) if ev else set()
    return {
        "scale": bool(SCALE_RE[persona].search(reply)),
        "leak": any(rx.search(reply) for other, rx in SCALE_RE.items() if other != persona),
        "sentences": 2 <= sentences(reply, wine_label) <= 3,
        "years_grounded": not (years - allowed_years),
        "notes_grounded": notes <= ev_notes,
        "uses_evidence": bool(notes & ev_notes) if ev_notes else True,
        "claims_match": True,  # critics: no checkable relative claim yet
    }


def crowd_grounding(reply: str, wine: dict, wine_label: str, ev: CrowdEvidence | None) -> dict:
    """Crowd persona: ranks only when the evidence ranks, with the exact numbers; no dates or notes."""
    rx = SCALE_RE[evd.CROWD_ID]
    ranked = bool(ev and ev.ranked)
    years = {int(y) for y in re.findall(r"\b(19\d\d|20\d\d)\b", reply)}
    low = reply.lower()
    if ev is None:
        uses = True
    elif ranked:
        uses = f"top {ev.top_pct}% of {ev.peers}" in reply
    else:
        uses = any(p.lower() in low for p in ev.pairings) or (ev.body or "").lower() in low
    claims = True
    if ranked:  # the wording must match the numbers: "right around" only when |delta| < 0.1
        near_said = "right around" in low
        above, below = "above its neighbours" in low, "below its neighbours" in low
        if abs(ev.delta) < evd.NEAR_STARS:
            claims = near_said and not (above or below)
        else:
            claims = (not near_said) and (above if ev.delta > 0 else below) and f"{ev.delta:+.2f}" in reply
    no_pairings = reply
    for p in sorted((ev.pairings if ev else []) + evd.PAIRING_POOL, key=len, reverse=True):
        no_pairings = re.sub(re.escape(p), " ", no_pairings, flags=re.I)  # "Game Meat" is food, not the "game" note
    return {
        "scale": bool(rx.search(reply)) == ranked,
        "leak": any(r.search(reply) for other, r in SCALE_RE.items() if other != evd.CROWD_ID),
        "sentences": 2 <= sentences(reply, wine_label) <= 3,
        "years_grounded": not (years - {wine["vintage"]}),
        "notes_grounded": not mentioned_notes(no_pairings),
        "uses_evidence": uses,
        "claims_match": bool(claims),
    }


def check() -> int:
    catalog = {short_label(w): w for w in evd.load_catalog()}
    held = {short_label(w) for w in catalog.values() if (w["producer"], w["name"]) in HOLDOUT}
    errors: list[str] = []
    counts, no_ev = Counter(), Counter()
    for split in ("train", "eval"):
        path = DATA / f"{split}.jsonl"
        if not path.exists():
            print(f"missing {path}; run without --check first")
            return 1
        for line in path.read_text(encoding="utf-8").splitlines():
            r = json.loads(line)
            counts[f"{split}/{r['persona']}"] += 1
            reply = r["messages"][-1]["content"]
            ev = evd.from_dict(r["evidence"])
            no_ev[split] += ev is None
            if (r["wine"] in held) != (split == "eval"):
                errors.append(f"{r['id']}: wine {r['wine']} in the wrong split")
            g = grounding(reply, r["persona"], catalog[r["wine"]], r["wine"], ev, r["year"])
            errors += [f"{r['id']}: {k} failed: {reply[:90]}" for k, ok in g.items() if (not ok) != (k == "leak")]
            if [m["role"] for m in r["messages"]] != ["system", "user", "assistant"]:
                errors.append(f"{r['id']}: bad message roles")
            if r["messages"][0] != r["backend_messages"][0] or not r["messages"][1]["content"].startswith(
                    r["backend_messages"][1]["content"]):
                errors.append(f"{r['id']}: training prompt is not backend prompt + evidence")
    print("Counts:", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())),
          "| debates without evidence (x3 personas):", dict(no_ev))
    for e in errors[:20]:
        print("ERROR", e)
    if errors:
        print(f"{len(errors)} problem(s)")
        return 1
    print("OK: splits, scales, sentences, grounded years and notes, prompt layout all valid")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="only validate existing files")
    ap.add_argument("--per-wine-train", type=int, default=19, help="debates per training wine (16 wines)")
    ap.add_argument("--per-wine-eval", type=int, default=10, help="debates per held-out wine (4 wines)")
    ap.add_argument("--year", type=int, default=date.today().year, help="'today' for drinking-window logic")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    if not args.check:
        generate(args.per_wine_train, args.per_wine_eval, args.year, args.seed)
    return check()


if __name__ == "__main__":
    sys.exit(main())
