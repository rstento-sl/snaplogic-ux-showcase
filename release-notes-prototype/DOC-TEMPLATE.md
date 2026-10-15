# The Google Doc template

Paste this into a new Google Doc, then apply the Google Docs heading styles shown
in brackets. The brackets themselves are instructions — delete them.

The structure mirrors the October 2026 page already in Confluence: Highlights,
then one section per product area, then categories inside each area. The one
difference is that category names are fixed, because the current page uses
**New Features**, **Features**, **New**, **Enhancement** and **Enhancements**
for what are really two categories.

---

Release: October 2026

Date: 2026-10-30

Slug: october-2026

*[Those three lines are Normal text, before the first heading. The script reads
them for the page title, the publish date check, and the URL.]*

**Highlights** *[Heading 1 — this exact word]*

- *[Bulleted list. Each bullet is one highlight. These appear at the top of the
  published page and on the index page, so write them for someone deciding
  whether to read further.]*

**Admin Manager** *[Heading 1 — a product area. Repeat this block per area.]*

**New Features** *[Heading 2 — must be one of the categories below]*

- *[Bulleted list. One entry per bullet. Bold, italics, links and monospace all
  survive into the published page.]*

**Fixed Issues** *[Heading 2]*

- *[...]*

---

## Categories

Use exactly these, spelled this way. The script refuses to publish anything else,
which is what keeps the published pages consistent:

- New Features
- Enhancements
- Fixed Issues
- Known Issues
- Deprecations
- Documentation

## Rules the script enforces

It blocks publication, naming what to fix, when:

- Release, Date or Slug is missing, or Date is not `YYYY-MM-DD`, or Slug is not
  lowercase letters, digits and hyphens
- There are no Highlights, or no product areas
- An area has no categories, or a category has no entries
- A category name is not in the list above
- An image has no alt text
- Text sits outside any category — usually a bullet that lost its heading
- A comment thread is unresolved, or a suggestion is still pending

That last one is the point of the whole exercise: a published release note
cannot have review feedback still open against it.

## What it does not enforce

House style. The script checks structure, not prose — it will happily publish
"Users are able to now configure…". Writing quality stays a review matter.
