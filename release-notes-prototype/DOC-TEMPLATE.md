# The Google Doc template

**To build the doc, use [template.html](template.html) instead of this file.**
Open it, select everything in the box, copy, and paste into a new Google Doc.
Google Docs keeps Heading 1 and Heading 2 on paste, so the whole skeleton —
every product, every category — arrives with its styles already applied, and
nobody formats 85 headings by hand.

Published copy:
<https://rstento-sl.github.io/snaplogic-ux-showcase/release-notes-prototype/template.html>

This file explains the structure and the rules. The skeleton is the thing you
paste.

The template carries **every product and every category**. Writers delete what
has nothing in it rather than adding headings as they go, so a release note
never invents a heading and the order is the same every month.

---

*[Normal text, before the first heading. The skeleton carries an italic note
above each of these three fields explaining what to type. Those notes never
publish — text before the first heading that isn't one of the three fields is
dropped — so a writer who leaves them in place can still publish.]*

*[Release — the month and year as readers should see it. The page titles itself
"<release> Release Notes", so leave those two words off; writing them here is
harmless, because they get stripped rather than printed twice.]*

Release: October 2026

*[Date — YYYY-MM-DD. Prints under the title, and sorts the index so the newest
release is found by date rather than by publish order.]*

Date: 2026-10-30

*[Slug — lowercase letters, digits and hyphens. Becomes the URL. Republishing
with the same slug replaces that release; changing it creates a second page and
orphans the first, so don't change it after the first publish.]*

Slug: october-2026

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

**Behavior changes** *[rare — delete it most months]*

- *[...]*

*[The skeleton repeats all five categories under every product, so the job is
deleting rather than typing. The list below is every product. This list is every product
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

*[These sections are Heading 1 too, but they are not products and take no
categories. They go between Highlights and the products, in this order — which
is how September, August and June published them:]*

- In this Release (4 of 8 months)
- Recommended Snaplex Version (3 of 8 months)

*[**Platform: Patch Updates** and **Snaps: Patch Updates** are deliberately not
in the skeleton. They go in after the release, not when the notes are drafted,
so add them then — as Heading 1, after Recommended Snaplex Version, Platform
first.]*

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

## Screenshots

1. Paste the image into the doc on its own line, directly under the bullet it
   illustrates.
2. Right-click the image and select **Alt text**.
3. Describe what the image shows.

Publish refuses without alt text, so step 2 is not optional.

A screenshot on its own line under a bullet publishes inside that bullet,
lined up with the bullet's text. Nest the bullet deeper and the screenshot
follows it. One that follows no bullet sits at the margin, and one with words
beside it stays part of that sentence rather than becoming a screenshot of its
own.

**Scale it to whatever reads best in the doc.** It publishes at the size it was
captured at however small you make it here, and the page fits it to the content
column, so shrinking a wide screenshot to keep the doc readable costs nothing
on the published page.

## Videos

Google Docs cannot hold a video file, so the video goes on YouTube and the doc
links to it — the same thing the DITA docs do.

1. Upload the video to YouTube. Unlisted is fine; it only has to play for
   someone with the link.
2. Type a short description of the video, like *Publishing a standard*. Make
   it a bullet among the other entries, or a plain line — either publishes as
   a player.
3. Select that description and link it to the video.

The description becomes the caption under the video and the name a screen
reader announces for the play button, which is why step 2 is words rather than
a pasted URL. Publish stops on a bare link, and on a link to a video that does
not play, which it finds by trying to fetch the thumbnail.

The link needs the line to itself. One inside a sentence stays an ordinary
link, because a player would break the sentence. A bullet counts as its own
line: the player takes that bullet's place, so the list keeps its shape and the
video stays where you put it.

The published page does not contact YouTube until a reader clicks. The
thumbnail is downloaded at publish time and stored with the other images, so
opening a release note tells YouTube nothing about who read it.

`youtube.com/watch`, `youtu.be`, `/embed/` and `/shorts/` links all work, and a
start time (`t=90` or `t=1m30s`) carries through to the player.

## Rules the script enforces

It blocks publication, naming what to fix, when:

- Release, Date or Slug is missing, or Date is not `YYYY-MM-DD`, or Slug is not
  lowercase letters, digits and hyphens
- There are no Highlights, or no products
- A product has no categories, or a category has no entries
- A category name is not in the list above
- An image has no alt text
- A video link has no description to use as its caption, or points at a video
  that will not play
- A link to another section of the release note matches no Heading 1
- A table sits somewhere with no category to hold it
- A heading is Heading 3 or deeper — only Heading 1 and Heading 2 publish
- Text sits outside any category — usually a bullet that lost its heading
- A comment thread is unresolved, or a suggestion is still pending

That last one is the point of the whole exercise: a published release note
cannot have review feedback still open against it.

## What publishes

- **Bullets and numbered lists.** A numbered list in the doc publishes as a
  numbered list.
- **Tables.** The first row becomes the header. They are styled like every
  other table on the docs site.
- **Images.** Pasted into the doc, they publish with it, at full captured size
  rather than the size they were scaled to in the doc. Each one is stored under
  a hash of its contents, so the same screenshot used twice is stored once and
  republishing an unchanged image uploads nothing. Alt text is required. See
  [Screenshots](#screenshots).
- **Videos**, as a YouTube link on its own line, with the link text as the
  caption. See [Videos](#videos).
- **Bold, italics, links and monospace**, inline, wherever they appear —
  including inside a table cell.

## What it does not enforce

House style, and the product list. The script checks structure, not prose — it
will happily publish "Users are able to now configure…". Writing quality stays
a review matter.
