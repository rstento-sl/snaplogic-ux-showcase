# UX Showcase — Session Progress

## Status: In Progress
Last updated: 2026-07-31

## What we're building

A data-driven, self-contained showcase of confusing SnapLogic Admin UI interactions and microcopy, for PM/eng review. `index.html` renders issue cards from `issues.json`; each issue has its own `comparison.html` (current UI recreation with numbered red pins + interactive proposed redesign, side by side).

## Repo structure (current)

```
~/UX/
├── index.html                                        ← data-driven landing page (don't hand-edit cards)
├── issues.json                                        ← single source of truth for all issue cards
└── admin-manager/
    ├── pipeline-validation/comparison.html             ← issue-02, unreported issue 01
    ├── snapgpt-settings/comparison.html                 ← issue-03, unreported issue 02
    └── sso-config/
        ├── comparison.html                              ← issue-01, APP-2297
        └── possible-bug.html                             ← separate defect, not a UX pin
```

Card order on the index page matches Admin Manager nav order: **Designer (Pipeline Validation) → SnapGPT → SSO** (SSO's real nav location — Organization > Authentication — comes later in the nav than Application Settings).

## Issue catalog: what's done

### issue-02 — Designer pipeline validation screen (unreported issue 01) ✅
- Screen: Admin Manager > Application Settings > Designer > Pipeline validation
- Medium severity. 5 pins, one-sentence copy each: title vs nav label mismatch, title vs controls mismatch, unexplained toggle, no toggle/doc-limit relationship, Save disabled with no explanation.
- Proposed design: interactive toggle + document-limit dropdown, Save/Update button with live dirty-state tracking (any change — toggle or dropdown — activates the button and relabels it "Update"). "Initial state / User update" demo switcher.

### issue-03 — SnapGPT settings (unreported issue 02) ✅
- Screen: Admin Manager > Application Settings > SnapGPT
- High severity. 4 pins: intro text "never sent" doesn't say where, dependent toggles have no visual grouping under the master toggle, one toggle's phrasing breaks the "When disabled, ___" pattern, pipeline-generation dropdown has no explanatory copy.
- Proposed design: dependent toggles + dropdown visually nested under "Enable SnapGPT" with a left-border group that greys out when the master toggle is off ("SnapGPT enabled / disabled" demo switcher). Reworded toggle microcopy per Ruth's line edits. Dropdown relabeled "Mode" under a new "Use pipelines for enhanced generation" section with condensed Auto/Manual/Disable explanation (Ruth is still refining this — she said she has more microcopy comments coming).
- Fixed a real bug this session: pin 3 was rendering on top of pin 2 because its container was missing `position: relative`.

### issue-01 — SSO configuration screen (APP-2297) ✅
- Screen: Admin Manager > Organization > Authentication > SSO tab
- High severity. Numbered two-step proposed layout (copy SnapLogic values → upload IdP metadata), "First-time setup / Already configured" state toggle, real field values from Ruth's screenshot in the configured state.
- Separate `possible-bug.html` flags the Download file button (disabled with no visible dependency) — deliberately de-emphasized, not folded into the UX pins.

## What's next

1. **More microcopy feedback on SnapGPT (issue-03)** — Ruth said she has additional comments beyond what was covered this session; pick this up first next time.
2. **Collect remaining Admin Manager screens from Ruth, one at a time** — same pattern each time: screenshot → UX review (4-layer framework) → Ruth confirms which findings to use → plan pins + proposed fix → get sign-off → build → iterate on copy.
3. No other issues currently queued.

## Working pattern established (apply automatically)

- Always describe pins + proposed-fix approach and get sign-off before building a new comparison.html — don't just build it.
- Keep all pin/annotation copy to one punchy sentence — Ruth has repeatedly cut down wordy paragraph-style callouts.
- Current UI column must stay 100% accurate to the real screenshot — never edit it for copy fixes, only the Proposed design column changes.
- After every HTML/JSON edit: verify div balance (Python count) and JS syntax (`new Function()`) before committing.
- unreportedLabel numbering: "Unreported issue 01" = Pipeline Validation, "Unreported issue 02" = SnapGPT. Next unreported issue would be "Unreported issue 03".
