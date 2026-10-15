# The Google Doc template

Paste this into a new Google Doc and apply the Google Docs heading styles shown
in brackets. The brackets are instructions — delete them.

The template carries **every product and every category**. Writers delete what
has nothing in it rather than adding headings as they go, so a release note
never invents a heading and the order is the same every month.

---

Release: October 2026

Date: 2026-10-30

Slug: october-2026

*[Normal text, before the first heading. The script reads these three for the
page title, the release-date check, and the URL.]*

**Highlights** *[Heading 1 — this exact word]*

- *[Bulleted list. These appear at the top of the published page and on the
  index page, so write them for someone deciding whether to read on. They run
  the full width of the content column, so a long highlight is fine.]*

---

## The product sections

One **Heading 1** per product, in this order. Under each, the categories that
apply as **Heading 2**. Delete any product with nothing in it, and any category
with nothing in it.

**Admin Manager** *[Heading 1]*

**New features** *[Heading 2]*

- *[Bulleted list. One entry per bullet. Bold, italics, links and monospace all
  survive into the published page.]*

**Enhancements**

- *[...]*

**Fixed issues**

- *[...]*

**Known issues**

- *[...]*

*[Then the same block for each remaining product:]*

- API Management
- AutoSync
- Designer
- Documentation Enhancements
- Git Integration
- MCP Server
- Monitor
- Public APIs
- SnapGPT
- Snaplexes
- Snaps

*[Check this list against the current month before you start — products come
and go. The script does not police product names, only categories.]*

---

## Categories

Use exactly these, spelled and capitalised this way. The script refuses to
publish anything else, which is what keeps the published pages consistent:

- New features
- Enhancements
- Fixed issues
- Known issues
- Behavior changes

They publish in that order under each product. **Behavior changes** is used
rarely — include it only when something behaves differently than it did before
and that is not a fix.

Sentence case throughout: *New features*, not *New Features*. The current
Confluence page mixes **New Features**, **Features**, **New**, **Enhancement**
and **Enhancements** for what are really two categories; this is the fix for
that.

## Rules the script enforces

It blocks publication, naming what to fix, when:

- Release, Date or Slug is missing, or Date is not `YYYY-MM-DD`, or Slug is not
  lowercase letters, digits and hyphens
- There are no Highlights, or no products
- A product has no categories, or a category has no entries
- A category name is not in the list above
- An image has no alt text
- Text sits outside any category — usually a bullet that lost its heading
- A comment thread is unresolved, or a suggestion is still pending

That last one is the point of the whole exercise: a published release note
cannot have review feedback still open against it.

## What it does not enforce

House style, and the product list. The script checks structure, not prose — it
will happily publish "Users are able to now configure…". Writing quality stays
a review matter.
