"""Personal news briefing (RAG): today's wine news tied to the user's own bottles, written by the LLM.

Retrieval: news.get_news() items (RSS title + publisher summary only, never the article body), scored by how
many of the user's cellar keywords (region, country, producer, grape) and drinking-history favourites they
mention. The top articles go to the model with the bottles each one matches (window, status, location).

Generation: the base model (no LoRA) writes 2-4 sentences in a neutral voice and cites articles as [1], [2].
check() rejects a reply that cites nothing or a missing article, names a publication or critic, uses first
person, or states a year or a percentage that is not in the evidence. Rejected, no LLM, or pod off: None, and
the display keeps its fixed headline. One accepted text is cached per user, day and article set.
"""
from __future__ import annotations

import json
import re
from datetime import date

from . import config, llm

TOP_ARTICLES = 3
BOTTLES_PER_ARTICLE = 2
# publications and critics never named in AI text (same rule as the sommelier personas)
BANNED = ["robert parker", "parker", "wine spectator", "spectator", "wine advocate", "wine enthusiast",
          "wineenthusiast", "decanter", "vinepair", "vivino", "cellartracker", "james suckling", "jancis", "jeb dunnuck"]
SYSTEM = (
    "You write the wine cellar's short daily briefing for its owner. Neutral, factual voice: no persona, no "
    "first person, no names of publications, critics or websites. 2-3 sentences in English. Connect today's "
    "news to the owner's own bottles: say which bottle a story concerns and whether it is ready, still young "
    "or past its window. Use ONLY facts from the articles and bottles given. Mention no year or percentage "
    "that is not in the data. EVERY sentence ends with the number of the article it uses in square brackets, "
    "for example: \"Piedmont growers expect a strong year, and the Vajra Barolo 2018 is still young [1].\"")

_cache: dict[tuple, dict] = {}


SPECIFIC = ("region", "producer", "grape")   # a country alone ("France") is too broad to tie a story to a bottle


def terms(b: dict) -> dict[str, str]:
    """A bottle's keywords -> the field they come from."""
    out = {}
    for f in ("country", *SPECIFIC):
        for k in str(b.get(f) or "").split(",") if f == "grape" else [b.get(f)]:
            k = (k or "").strip()
            if len(k) > 2:
                out[k] = f
    return out


def keywords(bottles: list[dict], profile: dict) -> dict[str, float]:
    """Cellar keywords with weights: one per bottle (a country counts half), drinking-history favourites +2."""
    kw: dict[str, float] = {}
    for b in bottles:
        for k, f in terms(b).items():
            kw[k] = kw.get(k, 0) + (0.5 if f == "country" else 1)
    for key in ("regions", "grapes"):
        for k, _ in profile.get(key, []):
            if k in kw:
                kw[k] += 2
    return kw


def status(b: dict, year: int) -> str:
    if b.get("drink_from") and year < b["drink_from"]:
        return "young"
    if b.get("drink_to") and year > b["drink_to"]:
        return "past its window"
    return "ready"


def pick(items: list[dict], bottles: list[dict], profile: dict, year: int) -> list[dict]:
    """Top articles that mention something in the cellar, each with the bottles it concerns."""
    kw = keywords(bottles, profile)
    scored = []
    for it in items:
        text = f"{it['title']} {it['summary']}".lower()
        hits = [k for k in kw if re.search(rf"(?<![a-z]){re.escape(k.lower())}(?![a-z])", text)]
        # the bottles this story is about: they share a region, producer or grape with it
        # (a region or producer named in the story ties it to a bottle more than a shared grape)
        ranked = []
        for b in bottles:
            t = terms(b)
            score = sum(3 if t.get(h) in ("region", "producer") else 1 if t.get(h) == "grape" else 0 for h in hits)
            if score:
                ranked.append((score, b))
        seen, uniq = set(), []
        for _, b in sorted(ranked, key=lambda x: -x[0]):
            key = (b["producer"], b["name"], b["vintage"])
            if key not in seen:
                seen.add(key)
                uniq.append(b)
        if not uniq:
            continue
        scored.append((sum(kw[h] for h in hits), it, hits, uniq[:BOTTLES_PER_ARTICLE]))
    scored.sort(key=lambda x: -x[0])
    out = []
    for n, (_, it, hits, bs) in enumerate(scored[:TOP_ARTICLES], 1):
        out.append({"n": n, "title": it["title"], "summary": it["summary"], "link": it.get("link", ""),
                    "source": it.get("source", ""), "matched": hits[:4],
                    "bottles": [{"wine": f"{b['producer']} {b['name']} {b['vintage'] or 'NV'}",
                                 "window": f"{b['drink_from']}-{b['drink_to']}", "status": status(b, year),
                                 "location": b.get("location", "")} for b in bs]})
    return out


def messages(articles: list[dict], year: int) -> list[dict]:
    lines = [f"Current year: {year}", "Today's articles and the owner's bottles they concern:"]
    for a in articles:
        lines.append(f"[{a['n']}] {a['title']}. {a['summary']}")
        for b in a["bottles"]:
            lines.append(f"    owner's bottle: {b['wine']}, drinking window {b['window']}, {b['status']}")
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": "\n".join(lines)}]


def check(text: str, articles: list[dict], year: int) -> list[str]:
    """Problems with a model briefing; empty list = OK to show."""
    problems = []
    cited = {int(n) for n in re.findall(r"\[(\d+)\]", text)}
    if not cited:
        problems.append("cites no article")
    if cited - {a["n"] for a in articles}:
        problems.append(f"cites a missing article: {sorted(cited - {a['n'] for a in articles})}")
    evidence = json.dumps(articles, ensure_ascii=False) + f" {year}"
    years = set(re.findall(r"\b(?:19|20)\d\d\b", text)) - set(re.findall(r"\b(?:19|20)\d\d\b", evidence))
    if years:
        problems.append(f"years not in evidence: {sorted(years)}")
    pcts = set(re.findall(r"\d+(?:\.\d+)?\s?%", text)) - set(re.findall(r"\d+(?:\.\d+)?\s?%", evidence))
    if pcts:
        problems.append(f"percentages not in evidence: {sorted(pcts)}")
    low = text.lower()
    sources = {re.sub(r"^www\.|\..*$", "", a.get("source", "")).lower() for a in articles} - {"", "sample"}
    if any(re.search(rf"(?<![a-z]){re.escape(n)}(?![a-z])", low) for n in [*BANNED, *sources]):
        problems.append("names a publication or critic")
    own = text
    for a in articles:   # "I" inside a wine or producer name is not first person
        for b in a["bottles"]:
            own = own.replace(b["wine"], " ")
    if re.search(r"\b(I|I'm|I'd|I'll)\b", own) or re.search(r"\b(me|my|mine|we|our)\b", own, re.I):
        problems.append("first person")
    if len(text) > 700:
        problems.append("too long")
    return problems


def generate(user_id: int, items: list[dict], bottles: list[dict], profile: dict, year: int | None = None) -> dict | None:
    """{"text", "refs": [{n, title, link, source}]} or None (no LLM, no matching news, or the check failed)."""
    year = year or date.today().year
    if config.LLM_PROVIDER == "mock":
        return None
    articles = pick(items, bottles, profile, year)
    if not articles:
        return None
    key = (user_id, date.today().isoformat(), tuple(a["title"] for a in articles))
    if key not in _cache:
        reply = "".join(llm.stream_chat(messages(articles, year), "", temperature=0, max_tokens=220)).strip()
        if not reply or check(reply, articles, year):
            return None   # not cached: tried again on the next request (e.g. once the pod is up)
        cited = {int(n) for n in re.findall(r"\[(\d+)\]", reply)}
        _cache[key] = {"text": reply, "refs": [{k: a[k] for k in ("n", "title", "link", "source")}
                                               for a in articles if a["n"] in cited]}
    return _cache[key]
