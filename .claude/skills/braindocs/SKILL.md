---
name: braindocs
description: Update the four brain docs after a feature or decision change. Use when a thread
  changes architecture, a decision, scoring rules, or project state and the brain docs are stale.
---
Update the brain docs at repo root for the change just made, with cross-references:
- PROJECT.md   — current state / what shipped
- ARCHITECTURE.md — structural or data-flow changes
- DECISIONS.md — one entry per decision, dated, with the rationale and what it supersedes
- SCORING.md   — only if scoring rules changed (source of truth)
Keep entries terse. Do NOT push or re-upload — Sergio re-uploads all four to Project
knowledge manually after merge. Output the diffs and stop.
