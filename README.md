# SnapLogic UX Issue Showcase

A catalog of confusing UI interactions and microcopy in the SnapLogic Admin UI, built for PM/eng stakeholders. Each issue gets a self-contained interactive mockup showing the current (broken) UI and the proposed fix **side by side**, plus — when relevant — any suspected bugs found along the way that aren't UX problems.

Live site: https://rstento-sl.github.io/snaplogic-ux-showcase/

## Structure

```
/
├── index.html          ← landing page, grouped by UI area
├── issues.json          ← catalog of every issue, tagged with an "area" field
├── admin-manager/
│   └── sso-config/       ← one folder per issue
│       ├── comparison.html   ← current UI + proposed redesign, side by side in one page
│       └── possible-bug.html ← optional — defects that aren't UX design issues
├── monitor/
└── snapgpt/
```

Each area (Admin Manager, Monitor, SnapGPT, ...) gets its own top-level folder. Each issue within an area gets its own subfolder, named for the issue, not the ticket number (e.g. `sso-config/`, not `app-2297/`).

## How to ask Claude to add a new issue

This repo includes a [`CLAUDE.md`](CLAUDE.md) file with the conventions (folder structure, the comparison-page pattern, pin/color rules, active-voice requirement) written as direct instructions for Claude. If you're using Claude Code, clone this repo and work inside it — Claude Code loads `CLAUDE.md` automatically, so you don't need to re-explain any of this. If you're using Claude some other way, download `CLAUDE.md` and paste it in at the start of your session.

Either way, what Claude needs from **you** is the actual UX judgment: what's on the screen, what's confusing about it, and what should happen instead.

### 1. Give Claude a screenshot and describe the problem

Paste a screenshot of the current screen and describe, in your own words:

- Where the screen lives (e.g. "Admin Manager > Organization > Authentication > SSO tab")
- The JIRA ticket, if one exists
- What's confusing or wrong — walk through it like you're explaining it to a coworker who's never seen it. Mention the *real* workflow (what the user is actually trying to accomplish, and in what order) versus what the screen currently does.
- What you think the fix should look like, if you already have an idea. If you don't, ask Claude to propose one.

A good prompt looks like:

> Here's a screenshot of [screen name]. This screen [describe what's wrong — wrong order, unclear labels, hidden dependency, etc.]. The real workflow is: [step 1, step 2, ...]. Users get confused because [specific consequence]. Can you build this out as a new issue in the showcase, following the pattern in admin-manager/sso-config/?

### 2. Correct the recreation against the real screenshot

Claude will recreate the current UI from your description, but it's working from a description, not the live product — it will get details wrong (exact button labels, which fields are disabled by default, section order). Check the recreation against a real screenshot and correct anything that's off. Claude can't verify this itself; only you can, since you have access to the real product.

### 3. Review the drafted content

Ask Claude to review the popup/annotation copy against the review framework in `~/Git/claude-prompts` (the Enterprise Product Design Lead framework) — it should already be applying this automatically, but it's worth asking explicitly: **"review the content for usability"** or **"does this use active voice?"** The framework requires active voice throughout and structures critique across four lenses: Product, UX, UI, and Enterprise Reality Check.

### 4. Flag anything that looks like a bug, separately

If something in the real UI looks broken rather than badly designed (e.g. a button that's disabled for no apparent reason), say so explicitly and ask Claude to document it as a `possible-bug.html`, not as one of the numbered UX pins and not as a third column in the comparison. Mixing defects into the UX critique weakens the argument — stakeholders can wave off "that's just a bug," but they can't wave off a UX flaw. Keep them visibly separate; `possible-bug.html` is linked from the comparison page as a small secondary link only.

### 5. Before publishing

**Never let real customer/org-identifying data go into a public repo.** If your screenshot has a real staging URL, org ID, or org path, ask Claude to scrub it to something clearly fake (e.g. `your-org.snaplogic.com`, `ORG_ID`) before committing. This repo is public — anyone with the link can view it.

### 6. Wire it into the catalog

The homepage (`index.html`) is generated entirely from `issues.json` — you never hand-edit issue cards into the page itself. Once `comparison.html` (and `possible-bug.html`, if needed) exist and look right, ask Claude to:
- Add an entry to the root `issues.json`, including a short `"summary"` (the one- or two-sentence blurb shown on the homepage card) and a `"mockups"` object pointing at your files
- Commit and push — GitHub Pages rebuilds automatically from `main`, and the new issue appears on the homepage under the right area

## What each mockup file needs

- **`comparison.html`** — one shared header (breadcrumb, issue title, JIRA ticket, instruction line, small link to `possible-bug.html` if there is one), then a two-column grid below it. **Left column**: the current UI, recreated faithfully, with numbered red pins marking each problem — clicking a pin opens a popover with a concise problem statement and a proposed fix. Keep pin count to genuine, distinct issues — don't split one problem into two pins just to pad the count. **Right column**: a working mockup of the proposed fix. Make it genuinely interactive where it matters (copy buttons, unlocking a step after a real action) — but don't gate UI states on something the app can't actually observe (e.g. "the user went to another website and came back"). Only gate on state the app can see. The two columns sit side by side so stakeholders can compare directly, with no clicking back and forth required.
- **`possible-bug.html`** (optional) — same visual pattern (toolbar, pin/popover), styled amber instead of red, explicitly labeled as not a UX design issue. Linked from `comparison.html` as a small secondary link, never as a third column or an equal-weight nav tab — earlier versions of this repo used a 3-tab nav across three separate pages and it was confusing; don't bring that pattern back.
