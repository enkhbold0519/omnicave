"""Evidence retrieval for critic debates (the RAG half of RAG + LoRA).

Facts about a bottle (drinking window, critic consensus, community average, tasting notes) come
from retrieval at inference time. The LoRA adapters only learn how each persona reads and
argues from that evidence.

PoC status: `lookup()` serves a SIMULATED store for the 20 catalog wines. The values are
plausible but invented, and are marked "simulated" in the evidence block. Real connectors
(community tasting notes, published critic evaluations) replace `_simulated()` later, after each
source's terms of use are checked. Aggregate numbers and short descriptors only; no review text
is copied and no real critic is named.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import random
from dataclasses import asdict, dataclass, field

import prompts

CATALOG_PY = prompts.BACKEND / "app" / "catalog.py"

# grape -> (aromas, tannin 0-3, acidity 0-3, body 0-3); seeds the simulated tasting notes.
GRAPES = {
    "Pinot Noir": (["red cherry", "raspberry", "forest floor", "rose petal", "sweet spice"], 1, 3, 1),
    "Chardonnay": (["lemon curd", "white peach", "hazelnut", "toasted brioche", "wet stone"], 0, 2, 2),
    "Meunier": (["red apple", "bread dough", "redcurrant"], 0, 2, 1),
    "Syrah": (["blackberry", "smoked meat", "black olive", "cracked pepper", "violet"], 2, 2, 3),
    "Grenache": (["kirsch", "strawberry jam", "garrigue", "white pepper"], 1, 1, 2),
    "Mourvèdre": (["blackberry", "leather", "game", "dried herbs"], 3, 2, 3),
    "Cinsault": (["wild strawberry", "rose", "orange peel"], 0, 2, 1),
    "Cabernet Sauvignon": (["blackcurrant", "cedar", "graphite", "tobacco leaf"], 3, 2, 3),
    "Merlot": (["plum", "black cherry", "cocoa"], 2, 1, 2),
    "Sauvignon Blanc": (["gooseberry", "lime zest", "cut grass", "flint"], 0, 3, 1),
    "Nebbiolo": (["tar", "rose", "sour cherry", "licorice"], 3, 3, 2),
    "Sangiovese": (["sour cherry", "dried herbs", "black tea", "leather"], 2, 3, 2),
    "Riesling": (["green apple", "lime", "white flowers", "slate"], 0, 3, 1),
    "Tempranillo": (["dried cherry", "vanilla", "dill", "tobacco"], 2, 2, 2),
    "Touriga Nacional": (["black plum", "violet", "fig", "dark chocolate"], 3, 1, 3),
    "Sémillon": (["apricot", "honey", "saffron", "marmalade"], 0, 2, 3),
}
STRUCTURE_NOTES = ["fine-grained tannins", "long finish", "chalky texture", "saline edge", "ripe tannins",
                   "creamy mousse", "bright acidity", "toasty oak"]
ALL_AROMAS = sorted({a for g in GRAPES.values() for a in g[0]})


@dataclass
class Evidence:
    window: tuple[int, int] | None = None          # drinking window (from, to)
    critic: tuple[int, int, int] | None = None     # consensus low, high, number of reviews
    community: tuple[float, int] | None = None     # average /100, number of notes
    notes: list[str] = field(default_factory=list)
    source: str = "simulated"

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict | None) -> "Evidence | None":
        if d is None:
            return None
        return Evidence(window=tuple(d["window"]) if d.get("window") else None,
                        critic=tuple(d["critic"]) if d.get("critic") else None,
                        community=tuple(d["community"]) if d.get("community") else None,
                        notes=list(d.get("notes") or []), source=d.get("source", "simulated"))

    def years(self) -> set[int]:
        return set(self.window) if self.window else set()


def load_catalog() -> list[dict]:
    spec = importlib.util.spec_from_file_location("catalog", CATALOG_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.CATALOG


def structure(w: dict) -> dict:
    grapes = [g.strip() for g in w["grape"].split(",") if g.strip()]
    known = [GRAPES[g] for g in grapes if g in GRAPES]
    if not known:
        raise SystemExit(f"Add grape(s) {grapes} to GRAPES in evidence.py")
    return {
        "aromas": list(dict.fromkeys(a for k in known for a in k[0])),
        "tannin": round(sum(k[1] for k in known) / len(known)),
        "acid": round(sum(k[2] for k in known) / len(known)),
        "body": max(k[3] for k in known),
    }


def _seed(label: str) -> int:
    return int(hashlib.sha256(label.encode("utf-8")).hexdigest()[:8], 16)


def _simulated(w: dict, rng: random.Random, perturb: bool) -> Evidence:
    """Plausible evidence for a catalog wine. perturb=True varies it per training sample."""
    s = structure(w)
    jitter = (lambda k: rng.randint(-k, k)) if perturb else (lambda k: 0)
    lo, hi = w["drink_from"] + jitter(2), w["drink_to"] + jitter(3)
    if hi <= lo:
        hi = lo + 3
    center = 89 + s["body"] + (1 if w["base_price"] >= 150 else 0) + (-2 if w["color"] == "rose" else 0)
    center = max(86, min(97, center + jitter(2)))
    reviews = rng.randint(3, 12)
    notes = rng.sample(s["aromas"], k=min(len(s["aromas"]), rng.randint(2, 3)))
    if perturb and rng.random() < 0.3:  # an unexpected descriptor teaches the model to read the evidence
        notes.append(rng.choice([a for a in ALL_AROMAS if a not in notes]))
    notes.append(rng.choice(STRUCTURE_NOTES))
    # No raw community average: stars are not comparable across regions and grapes (decision
    # 2026-11-13). The crowd signal lives in CrowdEvidence, peer-relative only.
    return Evidence(window=(lo, hi), critic=(center - 1, center + 1, reviews), notes=notes)


def sample_for_training(w: dict, rng: random.Random) -> Evidence | None:
    """Training evidence: perturbed, sometimes partial, about 10% missing."""
    r = rng.random()
    if r < 0.10:
        return None
    ev = _simulated(w, rng, perturb=True)
    if r < 0.18:
        ev.window = None          # sources found, but no drinking window
    elif r < 0.24:
        ev.critic = None          # no published critic scores
    return ev


_BY_LABEL: dict[str, dict] | None = None


def lookup(label: str) -> Evidence | None:
    """Retrieval entry point used by serve.py. Returns None when nothing reliable is found."""
    global _BY_LABEL
    if _BY_LABEL is None:
        _BY_LABEL = {prompts.wine_label(w): w for w in load_catalog()}
    w = _BY_LABEL.get(label)
    if w is None:
        return None
    return _simulated(w, random.Random(_seed(label)), perturb=False)


# ---------------------------------------------------------------- crowd evidence (real, X-Wines)
CROWD_ID = "crowd-taste"
XWINES_JSON = prompts.REPO / "ai" / "data" / "xwines_evidence.json"
PAIRING_POOL = ["Beef", "Lamb", "Veal", "Poultry", "Pork", "Game Meat", "Rich Fish", "Lean Fish", "Shellfish",
                "Spicy Food", "Pasta", "Mushrooms", "Cured Meat", "Soft Cheese", "Blue Cheese", "Goat Cheese",
                "Appetizer", "Aperitif", "Sweet Dessert", "Fruit Dessert", "Vegetarian"]


@dataclass
class CrowdEvidence:
    """Peer-relative community signal from X-Wines. Raw star averages are deliberately absent."""
    kind: str = "crowd"
    peer_group: str | None = None     # e.g. "Meursault Chardonnay (white)"
    peers: int | None = None
    top_pct: int | None = None        # "top N%" within the peer group
    delta: float | None = None        # stars above/below the peer mean
    ratings: int = 0
    vintage: str = "N.V."
    vintage_ratings: int = 0
    body: str | None = None
    acidity: str | None = None
    pairings: list[str] = field(default_factory=list)
    source: str = "X-Wines community ratings (CC0, collected 2022)"

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def ranked(self) -> bool:
        return self.top_pct is not None


def from_dict(d: dict | None) -> "Evidence | CrowdEvidence | None":
    if d is None:
        return None
    if d.get("kind") == "crowd":
        return CrowdEvidence(**d)
    return Evidence.from_dict(d)


_XW: dict | None = None


def _xwines() -> dict:
    global _XW
    if _XW is None:
        if not XWINES_JSON.exists():
            raise SystemExit(f"{XWINES_JSON} missing. Run: python build_xwines.py")
        _XW = json.loads(XWINES_JSON.read_text(encoding="utf-8"))
    return _XW


def _crowd_real(w: dict) -> CrowdEvidence | None:
    x = _xwines().get(f"{w['producer']}|{w['name']}")
    if not x:
        return None
    rel = x.get("relative")
    return CrowdEvidence(
        peer_group=rel["peer_group"] if rel else f"{x['region']} {x['grapes'][0] if x['grapes'] else ''}".strip(),
        peers=rel["peers"] if rel else None,
        top_pct=max(1, 100 - rel["percentile"]) if rel else None,
        delta=rel["delta_stars"] if rel else None,
        ratings=x["ratings"], vintage=x["vintage"], vintage_ratings=x["vintage_ratings"],
        body=x["body"], acidity=x["acidity"], pairings=list(x["pairings"]))


def crowd_lookup(w: dict) -> CrowdEvidence | None:
    """Retrieval for the crowd persona: real X-Wines data for a catalog wine, or None."""
    return _crowd_real(w)


def crowd_for_training(w: dict, rng: random.Random) -> CrowdEvidence | None:
    """Real values, perturbed per sample so the LoRA reads the block instead of memorizing it."""
    if rng.random() < 0.10:
        return None
    ev = _crowd_real(w)
    if ev is None:
        return None
    if ev.ranked:
        ev.top_pct = max(1, min(99, ev.top_pct + rng.randint(-10, 10)))
        ev.peers = max(5, round(ev.peers * rng.uniform(0.7, 1.3)))
        sign = 1 if ev.top_pct <= 50 else -1
        ev.delta = round(sign * abs(ev.delta + rng.uniform(-0.1, 0.1)), 2) or round(sign * 0.01, 2)
    pool = list(ev.pairings)
    rng.shuffle(pool)
    ev.pairings = pool[:rng.randint(1, min(3, len(pool)))] if pool else []
    if rng.random() < 0.3:
        ev.pairings.append(rng.choice([p for p in PAIRING_POOL if p not in ev.pairings]))
    if rng.random() < 0.3:
        ev.vintage_ratings = 0 if rng.random() < 0.5 else rng.randint(1, 60)
    return ev


NEAR_STARS = 0.1  # |delta| below this reads as "about the same as its peers"


def relation(delta: float) -> str:
    """Words for the peer delta, rendered at retrieval time so the LLM copies instead of comparing numbers."""
    if abs(delta) < NEAR_STARS:
        return "about the same as its peers"
    return "above its peers" if delta > 0 else "below its peers"


def format_crowd(ev: CrowdEvidence | None) -> str:
    if ev is None:
        return (f"{prompts.EVIDENCE_HEADER}\n- No community ratings found for this bottle. "
                "Do not guess how drinkers rate it.")
    lines = [prompts.EVIDENCE_HEADER]
    if ev.ranked:
        lines.append(f"- Community comparison: top {ev.top_pct}% of {ev.peers} {ev.peer_group} peers, "
                     f"{ev.delta:+.2f} stars vs the peer average, {relation(ev.delta)} (same region and grape only)")
    else:
        lines.append(f"- Community comparison: not enough rated {ev.peer_group} peers or ratings to rank it")
    lines.append(f"- Ratings: {ev.ratings} in total, {ev.vintage_ratings} for the {ev.vintage} vintage")
    if ev.body or ev.acidity:
        lines.append(f"- Style: {ev.body or 'unknown body'}, {(ev.acidity or 'unknown').lower()} acidity")
    if ev.pairings:
        lines.append(f"- Pairs with: {', '.join(ev.pairings)}")
    lines.append(f"- Source: {ev.source}")
    return "\n".join(lines)


def block_for(persona_id: str | None, label: str) -> tuple[str, str]:
    """Evidence block for one persona's turn, plus a short note for the server log."""
    if _BY_LABEL is None:
        lookup(label)  # builds the label index
    w = _BY_LABEL.get(label)
    if persona_id == CROWD_ID:
        ev = crowd_lookup(w) if w else None
        return format_crowd(ev), ("crowd evidence (X-Wines)" if ev else "no crowd evidence")
    ev = lookup(label)
    return format_block(ev), ("critic evidence (simulated)" if ev else "no evidence")


def format_block(ev: Evidence | None) -> str:
    if ev is None:
        return (f"{prompts.EVIDENCE_HEADER}\n- No reliable sources found for this bottle. "
                "Do not state drinking dates or published scores.")
    lines = [prompts.EVIDENCE_HEADER]
    if ev.window:
        lines.append(f"- Drinking window: {ev.window[0]}-{ev.window[1]} (community consensus)")
    else:
        lines.append("- Drinking window: not available")
    if ev.critic:
        lines.append(f"- Critic consensus: {ev.critic[0]}-{ev.critic[1]} points across {ev.critic[2]} reviews")
    else:
        lines.append("- Critic consensus: no published scores")
    if ev.notes:
        lines.append(f"- Common tasting notes: {', '.join(ev.notes)}")
    lines.append(f"- Source: {ev.source}")
    return "\n".join(lines)
