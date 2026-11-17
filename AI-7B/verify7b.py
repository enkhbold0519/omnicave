"""Checks for 7B persona replies (used to filter teacher output and to score the LoRAs).

Every check returns True when the reply is acceptable. A reply is kept only if all checks pass.
"""
from __future__ import annotations

import re

import evidence7b as ev7

SCALE = {
    "power-critic": re.compile(r"\b(\d{2})-(\d{2}) points\b"),
    "fruit-purist": re.compile(r"\bFQI (\d\.\d)\b"),
    "value-critic": re.compile(r"\b(\d{2}) points\b.*?\bvalue grade ([A-D][+-]?)(?![A-Za-z])", re.S),
    "crowd-taste": re.compile(r"\btop (\d{1,2})% of (\d+)\b"),
}
CHECKS = ["scale", "leak", "sentences", "years", "notes", "prices", "near_evidence", "no_real_names", "claims"]


def sentences(text: str, label: str) -> int:
    masked = text.replace(label, "WINE").replace("N.V.", "NV")
    masked = re.sub(r"\b([A-Z])\.(?=[A-Z]?\.?\s)", r"\1", masked)  # initials such as "G.D."
    return len([s for s in re.split(r"(?<=[.!?])\s+", masked.strip()) if s])


def _other_scale(persona: str, reply: str) -> bool:
    for other, rx in SCALE.items():
        if other == persona:
            continue
        if other == "value-critic" and persona in ("power-critic",):
            # a range like "93-95 points" must not be read as Marcus's single score
            if re.search(r"\bvalue grade [A-D]", reply):
                return True
            continue
        if other == "power-critic" and persona == "value-critic":
            if rx.search(reply):
                return True
            continue
        if rx.search(reply):
            return True
    return False


def check(reply: str, persona: str, row: dict, year: int = 2026, prompt: str | None = None) -> dict:
    """row: a pool entry (wine, critic, crowd, label). prompt: the user message the persona saw
    (evidence + debate so far); when given, years, prices and tasting notes may also come from it,
    so a critic may repeat what an earlier critic said, but nothing new. Returns {check: bool}."""
    w, critic, crowd = row["wine"], row.get("critic"), row.get("crowd")
    low = reply.lower()
    res = {k: True for k in CHECKS}
    m = SCALE[persona].search(reply)

    # scale: own format present (crowd only when the evidence ranks the bottle)
    if persona == ev7.CROWD_ID:
        ranked = bool(crowd and crowd.get("top_pct") is not None)
        res["scale"] = bool(m) == ranked
    else:
        res["scale"] = bool(m)
    res["leak"] = not _other_scale(persona, reply)
    res["sentences"] = 2 <= sentences(reply, row["label"]) <= 3

    years = {int(y) for y in re.findall(r"\b(19\d\d|20\d\d)\b", reply)}
    allowed = {w["vintage"]} | ({year} if persona != ev7.CROWD_ID else set())
    if persona != ev7.CROWD_ID:
        allowed |= ev7.critic_years(critic)
    if prompt:
        allowed |= {int(y) for y in re.findall(r"\b(19\d\d|20\d\d)\b", prompt)}
    res["years"] = not (years - allowed)

    # pairings such as "Game Meat" contain words that are also descriptors ("game")
    masked = low
    for p in ((crowd or {}).get("pairings") or []) + [p.lower() for p in ("Game Meat", "Rich Fish", "Lean Fish")]:
        masked = masked.replace(p.lower(), " ")
    said = ev7.fact_notes(masked)
    ok = ev7.fact_notes(prompt) if prompt else set()
    if persona != ev7.CROWD_ID and critic:
        ok |= set((critic.get("bottle") or {}).get("descriptors") or [])
        ok |= set((critic.get("group") or {}).get("descriptors") or [])
    res["notes"] = said <= ok

    prices = {round(float(p)) for p in re.findall(r"\$(\d+(?:\.\d+)?)", reply)}
    okp = set()
    if prompt:
        for v in re.findall(r"\$(\d+(?:\.\d+)?)", prompt):
            okp |= {round(float(v)), round(float(v)) - 1, round(float(v)) + 1}
    if critic:
        for v in ((critic.get("bottle") or {}).get("price"), (critic.get("group") or {}).get("price"), critic.get("list_price")):
            if v:
                okp |= {round(v), round(v) - 1, round(v) + 1}
    res["prices"] = prices <= okp

    # numbers near the evidence: a critic's own score stays within reach of the published one
    pub = (critic or {}).get("bottle", {}) if critic else {}
    pub_pts = pub.get("points") if pub else None
    if m and persona == "power-critic":
        lo, hi = int(m.group(1)), int(m.group(2))
        res["near_evidence"] = 80 <= lo < hi <= 100 and hi - lo <= 3 and (pub_pts is None or abs((lo + hi) / 2 - pub_pts) <= 4)
    elif m and persona == "value-critic":
        s = int(m.group(1))
        res["near_evidence"] = 80 <= s <= 100 and (pub_pts is None or abs(s - pub_pts) <= 3)
    elif m and persona == "fruit-purist":
        res["near_evidence"] = 0.5 <= float(m.group(1)) <= 2.5

    res["no_real_names"] = not any(re.search(rf"\b{re.escape(n)}\b", low) for n in ev7.BANNED_NAMES)

    if persona == ev7.CROWD_ID and crowd:
        claims = True
        if crowd.get("top_pct") is not None and m:
            claims = int(m.group(1)) == crowd["top_pct"] and int(m.group(2)) == crowd["peers"]
            rel = ev7.relation(crowd["delta"])
            if rel.startswith("about"):
                claims = claims and not re.search(r"\b(above|below) (its|the) (neighbours|neighbors|peers)", low)
            else:
                word = rel.split()[0]
                claims = claims and word in low and not re.search(r"\b(right around|about the same)\b", low)
        if re.search(r"\b(nobody|no one)\b.*\brated\b", low) and crowd.get("vintage_ratings", 0) > 0:
            claims = False
        res["claims"] = claims
    if persona != ev7.CROWD_ID and not critic and m and persona != "fruit-purist":
        # no critic evidence: a score is still an opinion, but no published score may be implied
        res["claims"] = not re.search(r"\b(published|consensus|reviewers?)\b", low) or "no published" in low
    return res


def passes(reply: str, persona: str, row: dict, year: int = 2026, prompt: str | None = None) -> tuple[bool, list[str]]:
    r = check(reply, persona, row, year, prompt)
    failed = [k for k, v in r.items() if not v]
    return not failed, failed


if __name__ == "__main__":
    # self-check on hand-written replies
    row = {"wine": {"vintage": 2016, "producer": "X", "name": "Y"}, "label": "X Y 2016 (Barolo, Nebbiolo, red)",
           "critic": {"bottle": {"points": 93, "price": 60.0, "window": {"from": 2022, "to": 2035},
                                 "descriptors": ["tar", "rose petal"], "value_pct": 40},
                      "group": {"descriptors": ["cherry"], "price": 55.0}},
           "crowd": {"top_pct": 15, "peers": 188, "delta": 0.17, "vintage_ratings": 0, "pairings": ["Game Meat"]}}
    assert passes("Tar and rose petal, very serious. I'd say 92-94 points. Drink 2022-2035.", "power-critic", row)[0]
    assert not passes("Tar and blackberry. 92-94 points. Drink 2022-2040.", "power-critic", row)[0]
    assert passes("It earns 92 points and a value grade B, fair at $60. Open from 2022.", "value-critic", row)[0]
    assert not passes("It earns 99 points and a value grade A. Open now.", "value-critic", row)[0]
    assert passes("The crowd puts it in the top 15% of 188 peers, above its neighbours. Great with game meat.",
                  "crowd-taste", row)[0]
    assert not passes("The crowd puts it in the top 15% of 188 peers, right around its neighbours. Fine.",
                      "crowd-taste", row)[0]
    assert not passes("Robert Parker would love it: 93-95 points. Superb.", "power-critic", row)[0]
    prompt = "Debate so far:\nVictor Hale: tar and violet, drink by 2031.\n\nRetrieved evidence ..."
    assert passes("Victor's tar and violet sound right; the crowd cannot rank it. Good with game meat.",
                  "crowd-taste", row | {"crowd": None}, prompt=prompt)[0]
    assert not passes("Lovely blackberry; the crowd cannot rank it. Good with game meat.",
                      "crowd-taste", row | {"crowd": None}, prompt=prompt)[0]
    print("verify7b self-check OK")
