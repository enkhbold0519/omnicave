"""Evidence blocks for the 7B critics (shared by build_pool.py locally and generate.py on the pod).

Critic evidence (Victor, Livia, Marcus) comes from real WineEnthusiast reviews (2017-2020, OpenML
mirror, research use only): the bottle's own review if the bottle is in that data (points, price,
drink window the review states, descriptor keywords) and its peer group (same region and grape:
points distribution, median price, value percentile). No review text and no reviewer names.

Crowd evidence (Jordan) comes from X-Wines (CC0): peer-relative ranking only, as in the PoC.
"""
from __future__ import annotations

import re

EVIDENCE_HEADER = "Retrieved evidence (use only these facts for drinking dates, published scores and tasting notes):"
NEAR_STARS = 0.1

# Descriptor vocabulary for keyword extraction from review text (longest first when matching).
DESCRIPTORS = sorted(set("""
black cherry|red cherry|cherry|blackberry|raspberry|strawberry|plum|black plum|blackcurrant|cassis|cranberry|
redcurrant|pomegranate|fig|prune|raisin|dried cherry|kirsch|blueberry|lemon|lime|citrus|grapefruit|orange peel|
apple|green apple|pear|peach|white peach|apricot|nectarine|pineapple|mango|passion fruit|melon|quince|
violet|rose petal|lavender|white flowers|honeysuckle|acacia|dried herbs|thyme|sage|mint|eucalyptus|fennel|
garrigue|cut grass|green pepper|black pepper|white pepper|clove|cinnamon|licorice|anise|vanilla|nutmeg|tobacco|
cedar|leather|forest floor|mushroom|truffle|tar|smoke|graphite|iron|wet stone|flint|slate|chalk|saline|gravel|
game|bacon|olive|coffee|espresso|mocha|dark chocolate|chocolate|cocoa|caramel|toffee|butterscotch|honey|almond|
hazelnut|toast|brioche|butter|cream|oak|petrol|beeswax|ginger|saffron|marmalade|black tea|
firm tannins|fine tannins|ripe tannins|velvety tannins|silky|supple|polished|plush|dense|concentrated|structured|
crisp acidity|bright acidity|fresh acidity|racy|juicy|rich|opulent|elegant|lean|long finish
""".replace("\n", "").split("|")) - {""}, key=len, reverse=True)
# Style and structure words are a critic's judgment, not a tasting fact, so replies may use them freely.
STYLE = {"firm tannins", "fine tannins", "ripe tannins", "velvety tannins", "silky", "supple", "polished", "plush",
         "dense", "concentrated", "structured", "crisp acidity", "bright acidity", "fresh acidity", "racy", "juicy",
         "rich", "opulent", "elegant", "lean", "long finish", "oak"}
BANNED_NAMES = ["robert parker", "parker", "luca maroni", "maroni", "wine spectator", "spectator", "wine advocate",
                "wineenthusiast", "wine enthusiast", "vivino", "cellartracker", "james suckling", "jancis"]


def fact_notes(text: str) -> set[str]:
    """Tasting-fact descriptors (aromas, flavours, minerals) in a reply; style words excluded."""
    return set(find_descriptors(text)) - STYLE


def find_descriptors(text: str, limit: int | None = None) -> list[str]:
    """Known descriptors in order of first appearance; longer phrases win over their parts."""
    low = " " + text.lower() + " "
    hits = []
    for d in DESCRIPTORS:
        for m in re.finditer(rf"(?<![a-z]){re.escape(d)}(?![a-z])", low):
            hits.append((m.start(), d))
        low = re.sub(rf"(?<![a-z]){re.escape(d)}(?![a-z])", lambda m: " " * len(m.group(0)), low)
    out = []
    for _, d in sorted(hits):
        if d not in out:
            out.append(d)
    return out[:limit] if limit else out


def window_text(w: dict | None) -> str | None:
    if not w:
        return None
    a, b = w.get("from"), w.get("to")
    if a == "now" and b:
        return f"now through {b}"
    if a == "now":
        return "drink now"
    if a and b:
        return f"{a}-{b}"
    if a:
        return f"from {a}"
    if b:
        return f"through {b}"
    return None


def critic_years(ev: dict | None) -> set[int]:
    if not ev:
        return set()
    w = (ev.get("bottle") or {}).get("window") or {}
    return {y for y in (w.get("from"), w.get("to")) if isinstance(y, int)}


def format_critic(ev: dict | None) -> str:
    if not ev:
        return (f"{EVIDENCE_HEADER}\n- No published critic reviews found for this bottle or its region and grape. "
                "Do not state drinking dates or published scores.")
    lines = [EVIDENCE_HEADER]
    b = ev.get("bottle")
    if b:
        price = f", ${b['price']:.0f}" if b.get("price") else ""
        lines.append(f"- Published review of this bottle (one professional critic): {b['points']} points{price}")
        wt = window_text(b.get("window"))
        lines.append(f"- Drinking window stated in that review: {wt}" if wt else "- Drinking window: not stated")
        if b.get("descriptors"):
            lines.append(f"- Descriptors in that review: {', '.join(b['descriptors'])}")
        if b.get("value_pct") is not None:
            lines.append(f"- Value: points per dollar better than {b['value_pct']}% of its peer group")
    else:
        lines.append("- No published review of this exact bottle; peer group only")
        lines.append("- Drinking window: not available")
    g = ev.get("group")
    if g:
        lines.append(f"- Peer group ({g['label']}, {g['n']} reviews): median {g['median']} points "
                     f"(middle half {g['q1']}-{g['q3']}), median price ${g['price']:.0f}")
        if g.get("descriptors"):
            lines.append(f"- Common descriptors in the peer group: {', '.join(g['descriptors'])}")
    if ev.get("list_price"):
        lines.append(f"- Cellar list price: ${ev['list_price']:.0f}")
    lines.append("- Source: professional reviews 2017-2020 (reviewers not named)")
    return "\n".join(lines)


def relation(delta: float) -> str:
    if abs(delta) < NEAR_STARS:
        return "about the same as its peers"
    return "above its peers" if delta > 0 else "below its peers"


def format_crowd(ev: dict | None) -> str:
    if not ev:
        return f"{EVIDENCE_HEADER}\n- No community ratings found for this bottle. Do not guess how drinkers rate it."
    lines = [EVIDENCE_HEADER]
    if ev.get("top_pct") is not None:
        lines.append(f"- Community comparison: top {ev['top_pct']}% of {ev['peers']} {ev['peer_group']} peers, "
                     f"{ev['delta']:+.2f} stars vs the peer average, {relation(ev['delta'])} (same region and grape only)")
    else:
        lines.append(f"- Community comparison: not enough rated {ev['peer_group']} peers or ratings to rank it")
    lines.append(f"- Ratings: {ev['ratings']} in total, {ev['vintage_ratings']} for the {ev['vintage']} vintage")
    if ev.get("body") or ev.get("acidity"):
        lines.append(f"- Style: {ev.get('body') or 'unknown body'}, {(ev.get('acidity') or 'unknown').lower()} acidity")
    if ev.get("pairings"):
        lines.append(f"- Pairs with: {', '.join(ev['pairings'])}")
    lines.append("- Source: X-Wines community ratings (CC0, collected 2022)")
    return "\n".join(lines)


CROWD_ID = "crowd-taste"


def block_for(persona_id: str, row: dict) -> str:
    return format_crowd(row.get("crowd")) if persona_id == CROWD_ID else format_critic(row.get("critic"))
