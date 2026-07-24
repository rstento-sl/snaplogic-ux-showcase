# UX Showcase — Session Progress

## Status: In Progress
Last updated: 2026-07-24

## What we're building

A self-contained HTML showcase demonstrating confusing SnapLogic UI interactions and microcopy, with annotated before/after views and interactive mocks. Audience: PM/eng stakeholders.

## Files created

```
~/UX/
├── workplan.md                         ← full 4-phase project plan
├── issues.json                         ← issue catalog (data source for showcase)
├── mockup-issue-01-sso.html            ← proposed redesign (interactive, two-step layout)
└── mockup-issue-01-sso-annotated.html  ← current UI with clickable annotation pins (Option C)
```

## Issue catalog: what's done

### Issue 01 — SSO configuration screen (APP-2297) ✅
- **Screen:** Admin Manager > Organization > Authentication > SSO tab
- **Problem:** Page conflates two tasks that happen at different times and presents them in the wrong order. Metadata upload (second visit) appears before the SnapLogic-generated values the user needs to copy first. No indication of the two-pass workflow.
- **Proposed fix:** Numbered two-step layout. Step 1 = copy/download SnapLogic values to configure IdP. Step 2 = return and upload IdP metadata. Download metadata file is the primary option in Step 1; individual URL copy is secondary (with "or" divider).
- **Interactive candidate:** Yes — two-pass flow demo already built in mockup-issue-01-sso.html

## Mockup state

### mockup-issue-01-sso.html (proposed redesign)
- Two-step numbered layout, fully interactive
- "First visit / Second visit" toggle in demo bar
- Step 2 is dimmed and locked on first visit; unlocks on second visit
- Download metadata file is first option, "or copy individual values" divider, then URL fields
- Copy buttons work with clipboard + checkmark confirmation

### mockup-issue-01-sso-annotated.html (current UI annotated)
- Recreates current UI from screenshot
- Three red numbered pins at problem locations
- Click a pin → popover with problem description + proposed fix
- Prev/Next navigation in popover
- Click outside popover to close
- Fixed bug: pins are z-index 300 so they're always clickable

## What's next

1. Collect remaining issues from Ruth to add to issues.json
2. Build showcase.html — single page combining all issues with before/after toggle + annotation pins

## Decisions made

- Option C (annotated overlay) chosen for showing issues in the current UI
- Will combine with before/after toggle in final showcase.html
- Issue schema in issues.json includes: id, title, screen, jira, severity, category, current_state, proposed_fix, interactive_candidate, screenshots, annotations
