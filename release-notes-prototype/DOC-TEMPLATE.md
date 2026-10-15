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

*[Then the same block for each remaining product. This list is every product
that appeared in the January–October 2026 release notes, alphabetically, with
the number of those eight months it appeared in:]*

- Admin Manager (7)
- AgentCreator (7)
- API Management (8) — covers both Classic APIM and APIM 3.0
- AutoSync (3)
- Designer (6)
- Documentation Enhancements (3)
- Git Integration (6)
- MCP Server (5)
- Monitor (8)
- Pipelines and Tasks (3)
- Project Manager (1)
- Public APIs (7)
- SnapCode (3)
- SnapGPT (6)
- Snaplexes (4)
- Snaps (8)
- The SnapLogic MCP Server (4)

*[These recurring sections are Heading 1 too, but they are not products and do
not take the categories. Keep them in this order, after the products:]*

- Platform: Patch Updates (7 of 8 months)
- Snaps: Patch Updates (6 of 8 months)
- Recommended Snaplex Version (3 of 8 months)

*[**API Management** is one section covering both Classic APIM and APIM 3.0.
Say which one an entry applies to in the entry itself rather than splitting the
section. Past release notes used *API Management 3.0*, *Classic API Management
(APIM)* and *Classic APIM* as separate Heading 1s; they are one section now.]*

*[**MCP Server** and **The SnapLogic MCP Server** are two different products,
not two spellings of one. Keep them as separate sections. *MCP* on its own has
also been used as a Heading 1 — don't, because it doesn't say which.]*

*[**Documentation Enhancements**, not *Documentation Updates*. Check the product
list against the current month before you start — products come and go, and the
script does not police product names, only categories.]*

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

Sentence case throughout: *New features*, not *New Features*.

This is the fix for a real drift. Across the January–October 2026 release
notes, the category headings were written as:

- Enhancements 51 times, Enhancement 3 times
- Fixed Issues 29 times, Fixed issues 3 times
- Known Issues 19 times, Known issues once, plus Known Issues and
  Limitations, and Known Limitation
- Features 10 times, New 6 times, New Features 5 times, New features once —
  four spellings of one category
- Behavior change twice, Behavior changes once, UI and Behavior Changes twice

Fifteen spellings for five categories. The script rejecting anything off the
list is what stops that recurring.

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
