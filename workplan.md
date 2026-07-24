# UX Issue Showcase — Workplan

## Objective

Demonstrate confusing UI interactions and microcopy issues, and propose user-friendly solutions for PM/eng stakeholders.

## Deliverable

A self-contained HTML page combining annotated before/after screenshots with interactive mocks for high-impact issues.

---

## Phase 1 — Issue Catalog

Build a structured list of issues before touching any UI. Each entry captures:

- **Screen/location** — where in the UI the issue appears
- **Current label or interaction** — exact copy or behavior
- **Problem type** — cognitive load, misleading, inconsistent, unclear affordance, etc.
- **Proposed fix** — revised copy and/or interaction change
- **Severity** — High / Medium / Low

Output: a JSON or markdown file that serves as the data source for the HTML doc.

---

## Phase 2 — Screenshot Capture + Edit

For each issue:
- Capture a **before** screenshot of the current UI
- Use image editor to create an **after** version with revised microcopy
- Name files consistently: `issue-01-before.png`, `issue-01-after.png`

---

## Phase 3 — Build the HTML Doc

A single self-contained HTML page driven by the issue catalog. Each issue gets a card with:

- Problem category tag + severity badge
- Annotated before image (callout overlays marking the problem)
- After image with the proposed fix
- Toggle or side-by-side view
- Short rationale note explaining the user impact

---

## Phase 4 — Add Interactivity

For select high-impact issues, embed mini interactive mocks (hover states, button labels, modal copy) so stakeholders can feel the difference, not just see it.

---

## File Structure

```
~/UX/
├── workplan.md          ← this file
├── issues.json          ← issue catalog (Phase 1 output)
├── screenshots/
│   ├── issue-01-before.png
│   ├── issue-01-after.png
│   └── ...
└── showcase.html        ← final deliverable
```
