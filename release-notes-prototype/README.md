# Release notes prototype

Writers edit a Google Doc and press **Publish**. A page appears on GitHub Pages,
styled with the dual-nav site's theme, and the index page updates itself.

This is a prototype for the proposed replacement for the Confluence WIP → public
Confluence process. It is deliberately not the production design — see
[What this is not](#what-this-is-not).

- Index: <https://rstento-sl.github.io/snaplogic-ux-showcase/release-notes-prototype/>
- Sample page: <https://rstento-sl.github.io/snaplogic-ux-showcase/release-notes-prototype/releases/sample-release.html>

## How it works, end to end

**Create.** A writer opens the month's Google Doc — one doc per release, shared
with writers and reviewers only. It starts as a skeleton carrying every product
and every category already styled, so nobody formats headings. The job is
deleting what has nothing in it and writing what does.

**Review.** Reviewers comment in the Doc, the way they already do. Nothing is
copied anywhere and there is no second version drifting out of sync, because
the Doc is the only source. A writer answers each comment and resolves it.

**Check.** Any writer can validate at any time. The script reads the Doc and
reports what would stop it publishing — a category spelled four different ways,
an image with no alt text, a bullet that lost its heading, a comment still
open. Nothing is written anywhere, so it is free to run as often as you like.

**Publish.** One menu click. The release note appears on the site in the site's
own styling, the index updates itself, and the home page picks up the new
highlights. Any writer can do it — no ticket, no admin, no build.

**Correct.** Fix the Doc and publish again. The page is replaced in place, at
the same URL. That is the point of the whole thing: there is one copy to edit,
so the public page cannot drift from the source, and a correction takes a
minute instead of a round trip.

The one hard rule: it refuses to publish while any comment or suggestion is
unresolved. A published release note cannot have open review feedback against
it.

## What's here

```
release-notes-prototype/
├── index.html              reads releases.json at load time — the homepage behaviour
├── releases.json           the index the script maintains
├── releases/               one published page per release
├── images/                 screenshots and video thumbnails, named by content hash
├── assets/release-notes.css  layout only; type and colour come from the dual-nav theme
├── assets/release-notes.js   click-to-play for embedded videos
├── apps-script/Code.gs     the script writers run
├── apps-script/appsscript.json  scopes and the Drive advanced service
├── test/check-transform.js doc -> HTML, with DocumentApp stubbed
├── test/check-video.js     builds a page with a video and presses play
├── test/check-layout.js    the published page in a real browser
└── DOC-TEMPLATE.md         what to put in the Google Doc
```

## Setup, about ten minutes

**1. Make the doc.** Open [template.html](template.html), select everything in
the box, copy, and paste into a new Google Doc at docs.new. The heading styles
survive the paste, so all 17 products and their categories arrive already
styled. Check that a product name shows as Heading 1. Then share the doc with
the writers and reviewers who should have it. `DOC-TEMPLATE.md` explains the
structure and the rules; it is not the thing you paste.

**2. Add the script.** In that doc: **Extensions > Apps Script**. Replace the
contents of `Code.gs` with this repo's `apps-script/Code.gs`. Then
**Project Settings**, tick *Show "appsscript.json" manifest file*, and replace
that file with this repo's copy.

**3. Check the Drive service is on.** The manifest you pasted in step 2 already
enables it, so **Drive** should be listed under **Services** in the left
sidebar — there is nothing to click. Without it the comment check cannot run,
and the script refuses to publish rather than skip it.

If Drive is missing, the manifest paste didn't take; fix that rather than using
**Services > +**. (That dialog often fails to open when the browser is signed
into more than one Google account.) To add it by hand instead: **Services > +**,
**Drive API**, version **v3**, identifier `Drive`.

**4. Make a GitHub token.** github.com → Settings → Developer settings →
Personal access tokens → **Fine-grained tokens**. Scope it to
`rstento-sl/snaplogic-ux-showcase` only, with **Contents: Read and write**.
Nothing else.

**5. Add the settings.** Apps Script **Project Settings > Script properties**:

- `GITHUB_TOKEN` — the token from step 4
- `GITHUB_REPO` — `rstento-sl/snaplogic-ux-showcase`
- `GITHUB_BRANCH` — `main`
- `BASE_PATH` — `release-notes-prototype`

**6. Reload the doc.** A **Release notes** menu appears next to Help. First run
asks each person to authorize the script — one click, once.

## Using it

**Check** validates and reports what's wrong, without publishing.

**Publish** validates, then commits the page and updates `releases.json`. It
refuses while anything is unresolved, and asks for confirmation if the release
date has not arrived.

GitHub Pages rebuilds in under a minute, so the page is not quite instant. The
production design deploys straight to the CDN and is.

## Adding a screenshot

Paste the image into the doc wherever it belongs, then right-click it and add
alt text. Publish refuses without alt text.

An image on its own line under a bullet publishes inside that bullet, lined up
with the bullet's text — nest the bullet deeper and the screenshot follows it.
An image that follows no bullet sits at the margin. An image with words beside
it stays part of that sentence.

Screenshots publish at their real pixel size, not the size you dragged them to
in the doc, and the page scales them down to the content column. So shrinking a
screenshot to fit the page in Docs costs nothing on the published page — resize
freely.

The file is committed to `images/`, named by a hash of its bytes, so the same
screenshot used twice is stored once.

## Adding a video

Google Docs cannot hold a video file, so the video goes on YouTube and the doc
links to it. This is what the DITA docs already do.

1. Upload the video to YouTube. Unlisted is fine — it only has to be playable
   by someone with the link.
2. Copy the link.
3. In the doc, type a short description of the video on its own line —
   "Publishing a standard", not a bare URL.
4. Select that text and link it to the video.

Publish renders a thumbnail with a play button. The description becomes the
caption underneath.

**The page does not contact YouTube until the reader clicks.** The thumbnail
is downloaded at publish time and committed to `images/`, so opening a release
note tells YouTube nothing about who read it. Clicking loads the player from
`youtube-nocookie.com`, already playing. Without JavaScript the thumbnail
stays an ordinary link to YouTube, which is the honest fallback.

Three rules the script enforces:

- **The link sits on its own line.** A video link inside a sentence stays a
  link, because replacing it with a player would break the sentence.
- **The link needs text.** A pasted URL leaves the player with no caption, so
  Publish stops and asks for a description.
- **The video has to exist.** The thumbnail download is also the check: a
  typo'd or private link gets no thumbnail, and Publish stops rather than
  shipping a player that will not play.

`youtube.com/watch`, `youtu.be`, `/embed/` and `/shorts/` links all work, and
a start time (`t=90` or `t=1m30s`) carries through to the player.

This is the prototype's one way in, chosen because it needs nothing from the
docs team beyond a YouTube account. Production will want more. An earlier
version of this script pulled the MP4 out of Drive and committed it here; that
works, but Publish runs as whoever clicks it, so the file has to be readable by
that person, which gets awkward once one person publishes for several writers.
It is in the history if it is wanted. The likelier answer is to keep the MP4
alongside the docs in `ditasrc` and reference it from there, which makes the
video a reviewed artifact like any other and drops the third-party embed
entirely. All three are the same shape: the transform recognises the link and
decides what to render.

## What it checks

Structure, not prose:

- Release, Date and Slug present and well formed
- Highlights present, at least one product area
- Every area has categories, every category has entries
- Category names from the fixed list in `DOC-TEMPLATE.md`
- Alt text on every image
- A caption on every video, and a YouTube link that resolves to a real video
- No text stranded outside a category
- **No unresolved comments and no pending suggestions**

That last one is the reason the whole thing exists. A published release note
cannot have review feedback still open against it, which is what the current
process cannot guarantee.

## What this is not

Three deliberate shortcuts, all of which the production design fixes:

**One token, shared.** The script reads the GitHub token from Script Properties,
which everyone running the script shares. So every publish is committed as the
token's owner rather than the writer who pressed the button, and anyone who can
edit the doc can open the script editor and read the token. Acceptable for a
public repo holding invented content; not acceptable for the real thing. In the
production design a Cloudflare Worker holds the credential and the script calls
it — this prototype is a decent argument for why that Worker exists.

**GitHub Pages, not the CDN.** Hence the rebuild delay.

**Images commit to this repo.** Each one is named for a hash of its bytes and
stored in `images/`, so the same screenshot used twice is stored once and
republishing an unchanged image uploads nothing. In production they would go to
the same store as the pages rather than into a git repo.

## The sample content is invented

`releases/sample-release.html` is fiction. This repo is public, so no real
release note — least of all an unreleased one — belongs in it.

## The header and footer are a mock

`assets/chrome-header.html` and `assets/chrome-footer.html` are a snapshot of
the dual-nav POC's chrome, so release notes can be seen in context rather than
as a bare content column.

Nothing in them navigates. Every link was rewritten to `href="#"` and the
scripts stripped — the search box, the product menus and the view switcher are
all inert. A banner under the header says so, so nobody mistakes it for a
working site.

They load at runtime, like `releases.json`, so refreshing the chrome does not
mean republishing every release note.

To refresh them after the dual-nav theme changes, re-snapshot from
<https://rstento-sl.github.io/dual-nav-poc/>.

## Checking the transform

```
node test/check-transform.js
```

Loads `Code.gs` into a VM with `DocumentApp`, `Drive` and `UrlFetchApp`
stubbed, builds documents in memory, and asserts on the HTML that comes out.
No network, no Google account, no published page. Run it after any change to
the parser or the renderer.

It exists because the layout check cannot see what the parser dropped. An
image on its own line was being discarded before rendering: the page published
cleanly, just without the screenshot. A browser looking at that page has
nothing to notice.

## Checking the video

```
node test/check-video.js
```

Builds a page with a video, serves it on a free port, and drives it in a real
browser. Needs Playwright; needs no Google account and no published page.

It presses play, which neither other check can do. The assertion that matters
most is the one before the click: no request reaches YouTube until the reader
asks for the video. That is the whole reason the thumbnail is committed here
rather than loaded from YouTube, and it would break silently.

## Checking the layout

```
node test/check-layout.js                          # the published prototype
node test/check-layout.js http://localhost:8000    # a local copy
```

Run it after changing anything structural, and after re-snapshotting the chrome.

It exists because of a real break. The dual-nav theme makes `<body>` a CSS grid
with named areas:

```
grid-template-areas: 'gheader gheader gheader'
                     'gmenu   gmain   gmain'
                     'gfooter gfooter gfooter'
```

`header`, `nav.toc`, `main` and `footer` have to be grid items of `<body>` to
land in them. The first version wrapped the injected header and footer in plain
`<div>`s, so they lost their areas and were auto-placed — the footer rendered
in the middle of the page, on top of the content.

The fix is `display: contents` on the placeholders, which removes the wrapper
from the box tree so the real `<header>` and `<footer>` become the grid items.
The script checks that contract directly, plus the geometry it protects: header
at the top, footer below the content, nav beside it, no sideways scroll, the
chrome rendered with no live links, and the Acherus web font actually loading
across origins — which would silently fall back if the theme ever moved to a
host that sends no CORS headers.

## Building the doc

Open [template.html](template.html), select everything in the box, copy, and
paste into a new Google Doc. Google Docs preserves Heading 1 and Heading 2 on
paste, so all 17 products and their categories arrive already styled — no one
applies 85 heading styles by hand.

Then delete every product and category with nothing in it. The skeleton is
deliberately longer than any real release note; deleting is the job.
