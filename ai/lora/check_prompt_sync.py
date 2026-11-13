"""Fail if the backend's debate prompt no longer matches ai/lora/prompts.py.

Run this before generating data or training. If it fails, someone changed the prompt in
webos/backend/app/services.py: update prompts.py (snippets and functions) to match, then
regenerate the dataset and retrain the adapters.

Usage:  python check_prompt_sync.py
"""
import re
import sys

import prompts


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def main() -> int:
    src = norm(prompts.SERVICES_PY.read_text(encoding="utf-8"))
    missing = [s for s in prompts.SOURCE_SNIPPETS if norm(s) not in src]
    personas = prompts.load_personas()
    bad = [p.get("id") for p in personas if not all(p.get(k) for k in ("id", "name", "title", "philosophy", "lora_adapter"))]
    if missing:
        print("Prompt drift: these lines are no longer in webos/backend/app/services.py:")
        for s in missing:
            print("  -", s)
    if bad:
        print("personas.json entries missing a field:", bad)
    if missing or bad:
        return 1
    print(f"OK: {len(prompts.SOURCE_SNIPPETS)} prompt snippets match; personas = "
          + ", ".join(f"{p['id']}->{p['lora_adapter']}" for p in personas))
    return 0


if __name__ == "__main__":
    sys.exit(main())
