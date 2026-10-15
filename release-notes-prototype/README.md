# Release notes prototype

Writers edit a Google Doc and press **Publish**. A page appears on GitHub Pages,
styled with the dual-nav site's theme, and the index page updates itself.

This is a prototype for the proposed replacement for the Confluence WIP → public
Confluence process. It is deliberately not the production design — see
[What this is not](#what-this-is-not).

- Index: <https://rstento-sl.github.io/snaplogic-ux-showcase/release-notes-prototype/>
- Sample page: <https://rstento-sl.github.io/snaplogic-ux-showcase/release-notes-prototype/releases/sample-release.html>

## What's here

```
release-notes-prototype/
├── index.html              reads releases.json at load time — the homepage behaviour
├── releases.json           the index the script maintains
├── releases/               one published page per release
├── assets/release-notes.css  layout only; type and colour come from the dual-nav theme
├── apps-script/Code.gs     the script writers run
├── apps-script/appsscript.json  scopes and the Drive advanced service
└── DOC-TEMPLATE.md         what to put in the Google Doc
```

## Setup, about ten minutes

**1. Make the doc.** New Google Doc, paste in `DOC-TEMPLATE.md` and apply the
heading styles it describes. Share it with the writers and reviewers who should
have it.

**2. Add the script.** In that doc: **Extensions > Apps Script**. Replace the
contents of `Code.gs` with this repo's `apps-script/Code.gs`. Then
**Project Settings**, tick *Show "appsscript.json" manifest file*, and replace
that file with this repo's copy.

**3. Enable the Drive service.** In the Apps Script editor, **Services > +**,
pick **Drive API**, version **v3**, identifier `Drive`. Without this the comment
check cannot run, and the script will refuse to publish rather than skip it.

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

## What it checks

Structure, not prose:

- Release, Date and Slug present and well formed
- Highlights present, at least one product area
- Every area has categories, every category has entries
- Category names from the fixed list in `DOC-TEMPLATE.md`
- Alt text on every image
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
