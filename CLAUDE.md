# UX Issue Showcase — instructions for Claude

This repo catalogs confusing UI interactions and microcopy in the SnapLogic Admin UI for PM/eng stakeholders. Each issue is a set of small, self-contained, interactive HTML mockups — no build tools, no server, opened directly via `open <file>` or a browser.

Read `README.md` for the full human-facing explanation. This file is the condensed version for you to follow automatically.

## Repo structure

```
/
├── index.html          ← landing page, generated from issues.json at load time — don't hand-edit issue cards into it
├── issues.json          ← single source of truth; every issue's card, links, and badges come from here
├── <area>/               ← one folder per UI area: admin-manager, monitor, snapgpt, ...
│   └── <issue-slug>/      ← one folder per issue, named for the issue not the ticket number
│       ├── comparison.html     ← current UI + proposed redesign, side by side in one page
│       └── possible-bug.html   ← optional, only if a defect (not a UX issue) was found
```

Name issue folders descriptively (`sso-config`), never by ticket number (`app-2297`).

**Never put Current UI and Proposed Redesign in separate files that require clicking between tabs to compare.** Earlier versions of this repo did that and it was explicitly rejected as confusing — stakeholders need to see both at once. They belong in one `comparison.html` as a two-column grid (`.compare-grid { grid-template-columns: 1fr 1fr }`, stacking to one column under 900px). `possible-bug.html` stays a separate file since it's deliberately de-emphasized (a small secondary link, not a third column) — see point 5 below.

## When asked to add a new issue

1. **Get the real facts from the user first.** You need: the screen's location (breadcrumb path), a screenshot, the JIRA ticket if one exists, and the user's description of the real workflow versus what the screen does. Don't invent UI details — ask, or work from the screenshot given. If a screenshot shows fewer/different elements than you assumed, the screenshot wins; fix the recreation to match it exactly.
2. **Build `comparison.html`** in a new `<area>/<issue-slug>/` folder: one shared header at the top (breadcrumb, issue title + JIRA ticket, one-line instruction, small link to `possible-bug.html` if one exists), then a two-column grid below it — left column recreates the current UI with pins, right column is the interactive proposed redesign. Copy the header/grid structure from `admin-manager/sso-config/comparison.html` rather than reinventing it. Keep pin styling consistent: red (`#d32f2f`) for UX-issue pins, amber (`#b26a00`) reserved for `possible-bug.html`.
3. **Pins on the current-UI column** — one per genuinely distinct problem, numbered in top-to-bottom reading order. Each pin opens a popover with: a concise title, a `problem` (what's wrong and why it confuses users), and a `fix` (the specific change). Don't split one problem into multiple pins to pad the count.
4. **The proposed-redesign column** — make interactions real where it matters (copy buttons, a step unlocking after a real action). Only gate UI state on something the app can actually observe. Don't gate a step on an action that happens outside the app (e.g. "the user configured something in an external tool") — that can't be reflected honestly in a mockup, so just use step numbers and instructional text instead of a locked/dimmed state.
5. **Defects vs. design issues** — if something looks broken rather than badly designed (e.g. a control disabled with no apparent dependency), it goes in `possible-bug.html`, styled amber, explicitly labeled "not a UX design issue," linked from `comparison.html`'s header as a small secondary link — never as a third grid column or equal-weight nav item. Never fold a defect into the numbered UX pins either — it gives stakeholders an easy way to dismiss a real design problem as "just a bug."
6. **Wire it up**: add an entry to root `issues.json`. `index.html` is generated entirely from this file (fetched at load time) — you do not edit `index.html` to add an issue. Required fields per entry: `id`, `area` (must exactly match a folder name — `Admin Manager`, `Monitor`, `SnapGPT`), `title`, `screen` (breadcrumb path), `jira` (empty string if none), `severity` (`High`/`Medium`/`Low`), `category`, `summary` (one or two sentences — this is the card blurb, keep it sharp and active-voice), `mockups.comparison`/`mockups.possibleBug` (relative paths from repo root; omit `possibleBug` entirely if there isn't one), and `annotations` (array matching the pins in `comparison.html` — its length drives the "N issues" count shown on the card). Then `git add -A`, commit, and push. GitHub Pages rebuilds automatically from `main`.

## Content rules (apply to everything you draft or edit)

- **Active voice, always.** No exceptions. If you catch yourself writing "is used," "are presented," "was configured," rewrite it as who does the action.
- **Be concise.** Popover `problem`/`fix` text should be a few sentences, not a paragraph. Titles are one line.
- **Use consistent terminology** for the same concept across all pins/files in an issue (e.g. don't alternate between "SnapLogic values" and "SnapLogic-generated values").
- When reviewing or critiquing a design (not drafting new copy), structure findings across four lenses if asked for a full review: **Product** (users, problem, workflow fit), **UX** (mental model, flows, edge cases, cognitive load), **UI** (components, hierarchy, labeling, consistency), **Enterprise Reality Check** (permissions/scale/backward-compatibility risk). Ask 1–2 sharp clarifying questions when something is ambiguous rather than guessing; offer alternatives, not just criticism.

## Before every push

**Scrub any real customer/org-identifying data.** This repo is public. Replace real staging URLs, org IDs, org paths, customer names — anything pulled from a real screenshot — with obviously-fake placeholders (`your-org.snaplogic.com`, `ORG_ID`, `YOUR_ORG`) before committing. Never commit credentials, tokens, or internal-only hostnames.
