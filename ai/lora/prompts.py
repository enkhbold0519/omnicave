"""Mirror of the webOS backend's critic-debate prompt (webos/backend/app/services.py).

Training samples must use exactly the messages the backend sends at inference time,
otherwise the adapter learns a prompt it never sees. We do not edit webos/ (other
members work there), so the layout is copied here and `check_prompt_sync.py` fails
when the backend's source drifts from these snippets.

Mirrors:
  services.LANG_HINT
  services._user_context()      -> owner_context()
  label inside ai_dialogue()    -> wine_label()
  messages inside ai_dialogue() -> critic_messages()
  transcript.append(...)        -> transcript_line()
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "webos" / "backend"
SERVICES_PY = BACKEND / "app" / "services.py"
PERSONAS_JSON = BACKEND / "personas.json"

LANG_HINT = "Answer in the same language as the user's request (Korean if the user writes Korean). Be concise."

# Exact source lines expected in services.py (whitespace-normalized by the checker).
SOURCE_SNIPPETS = [
    'LANG_HINT = "Answer in the same language as the user\'s request (Korean if the user writes Korean). Be concise."',
    'return (f"User preferences: {json.dumps(prefs, ensure_ascii=False)}. "',
    'f"Consumption history ({prof[\'total\']} bottles): colors {prof[\'colors\']}, regions {prof[\'regions\']}, grapes {prof[\'grapes\']}.")',
    'label = f"{w[\'producer\']} {w[\'name\']} {w[\'vintage\'] or \'NV\'} ({w[\'region\']}, {w[\'grape\']}, {w[\'color\']})"',
    '{"role": "system", "content": f"You are {p[\'name\']}, a fictional wine critic ({p[\'title\']}). Philosophy: {p[\'philosophy\']} "',
    'f"Stay in character. 2-3 sentences. Give tasting notes and an aging prediction. "',
    'f"React to the previous critics if any. {LANG_HINT}"},',
    '{"role": "user", "content": f"Wine on the table: {label}. Owner context: {uctx}\\n"',
    'f"Debate so far:\\n" + ("\\n".join(transcript) or "(you speak first)")},',
    'for ev in _stream_text(msgs, _mock_turn(p, w, i), adapter=p.get("lora_adapter"), max_tokens=180):',
    'transcript.append(f"{p[\'name\']}: {text.strip()}")',
]

MAX_TOKENS = 180  # ai_dialogue's per-turn limit


def load_personas() -> list[dict]:
    """Personas in the order the backend speaks them."""
    return json.loads(PERSONAS_JSON.read_text(encoding="utf-8"))


def owner_context(prefs: dict, total: int, colors: list, regions: list, grapes: list) -> str:
    """services._user_context(); colors/regions/grapes are lists of (name, count) tuples."""
    return (f"User preferences: {json.dumps(prefs, ensure_ascii=False)}. "
            f"Consumption history ({total} bottles): colors {colors}, regions {regions}, grapes {grapes}.")


def wine_label(w: dict) -> str:
    return f"{w['producer']} {w['name']} {w['vintage'] or 'NV'} ({w['region']}, {w['grape']}, {w['color']})"


def transcript_line(persona: dict, text: str) -> str:
    return f"{persona['name']}: {text.strip()}"


EVIDENCE_HEADER = "Retrieved evidence (use only these facts for drinking dates, published scores and tasting notes):"
_LABEL_RE = re.compile(r"^Wine on the table: (.+?\))\. Owner context: ", re.S)


def parse_label(messages: list[dict]) -> str | None:
    """The wine label from a backend debate prompt, or None if this is not a debate turn."""
    users = [m for m in messages if m.get("role") == "user"]
    if not users:
        return None
    m = _LABEL_RE.match(users[-1].get("content") or "")
    return m.group(1) if m else None


_PERSONA_RE = re.compile(r"^You are (.+?), a fictional wine critic \(")


def parse_persona(messages: list[dict]) -> str | None:
    """Persona id of a debate turn, from the system prompt's 'You are <name>, ...'."""
    sys_msgs = [m for m in messages if m.get("role") == "system"]
    m = _PERSONA_RE.match(sys_msgs[0].get("content") or "") if sys_msgs else None
    if not m:
        return None
    return next((p["id"] for p in load_personas() if p["name"] == m.group(1)), None)


def add_evidence(messages: list[dict], block: str) -> list[dict]:
    """Append the retrieved-evidence block to the last user message (RAG step)."""
    out = [dict(m) for m in messages]
    for m in reversed(out):
        if m.get("role") == "user":
            m["content"] = f"{m['content']}\n\n{block}"
            break
    return out


def critic_messages(p: dict, label: str, uctx: str, transcript: list[str]) -> list[dict]:
    return [
        {"role": "system", "content": f"You are {p['name']}, a fictional wine critic ({p['title']}). Philosophy: {p['philosophy']} "
                                      f"Stay in character. 2-3 sentences. Give tasting notes and an aging prediction. "
                                      f"React to the previous critics if any. {LANG_HINT}"},
        {"role": "user", "content": f"Wine on the table: {label}. Owner context: {uctx}\n"
                                    f"Debate so far:\n" + ("\n".join(transcript) or "(you speak first)")},
    ]
