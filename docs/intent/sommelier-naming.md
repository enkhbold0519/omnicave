# Intent: call the AI characters "Sommelier" everywhere the user or reader sees them

Confirmed with Sungbin on 2026-11-25.

## Why
The professor's feedback: it is unclear whether these are "personas" or "sommeliers"; make it definite.
Users can also ask each character anything (not only debates), so "sommelier" is the right role name.

## Outcome
- The webOS door display and the paper (`documents/wine_cellar.tex`) use one role name: **Sommelier**.
  This covers the 4 built-in characters (Victor Hale, Livia Moretti, Marcus Reed, Jordan Reyes) and the
  sommeliers the user creates.
- "persona" and "critic" no longer appear as the role name in visible webOS text or in the paper.
  The built-in four read like "Sommelier Victor Hale". Their scoring style stays as the description under
  the name (the existing `title`, for example "100-Point Power Critic").

## Who
- The owner standing at the door display.
- The professor and readers of the paper.

## Success
- No visible webOS string uses "persona" or "critic" as the role name.
- The paper defines "sommelier" once and uses it consistently.
- `npx tsc --noEmit` and the webOS build pass.

## Constraints (do not change)
- The model prompt and `personas.json` (title, philosophy). Changing them means retraining the LoRAs.
- Code ids (`power-critic`, ...), adapter names (`persona-*`) and the backend API format, because the other apps
  share the same backend.

## Out of scope
- Android and iOS apps (other owners).
- Backend, `AI-7B/`.
