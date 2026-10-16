#!/usr/bin/env node
'use strict';

/**
 * Transform contract for the release notes publisher.
 *
 * Why this exists: check-layout.js drives a published page in a browser, so it
 * only sees what survived the transform. It cannot see an element the parser
 * dropped. An image on its own line in the source doc was being discarded
 * before it was ever registered — the page published cleanly, just without the
 * screenshot, which is exactly the kind of silent loss a layout check misses.
 *
 * Code.gs is Apps Script, not a module. It is loaded into a sandbox with enough
 * of the DocumentApp and Utilities surface stubbed to run parseDoc_ and
 * renderPage_ against a doc built in memory.
 *
 * Usage:
 *   node test/check-transform.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ------------------------------------------------------------- Apps Script */

const ElementType = {
  PARAGRAPH: 'PARAGRAPH',
  LIST_ITEM: 'LIST_ITEM',
  TEXT: 'TEXT',
  INLINE_IMAGE: 'INLINE_IMAGE',
  TABLE: 'TABLE',
  FOOTNOTE: 'FOOTNOTE',
  INLINE_DRAWING: 'INLINE_DRAWING',
  EQUATION: 'EQUATION',
  HORIZONTAL_RULE: 'HORIZONTAL_RULE',
  PAGE_BREAK: 'PAGE_BREAK',
  TABLE_OF_CONTENTS: 'TABLE_OF_CONTENTS',
  UNSUPPORTED: 'UNSUPPORTED'
};

const ParagraphHeading = {
  NORMAL: 'NORMAL', HEADING1: 'HEADING1', HEADING2: 'HEADING2',
  HEADING3: 'HEADING3', HEADING4: 'HEADING4', HEADING5: 'HEADING5',
  HEADING6: 'HEADING6'
};

const GlyphType = {
  BULLET: 'BULLET', NUMBER: 'NUMBER', LATIN_UPPER: 'LATIN_UPPER',
  LATIN_LOWER: 'LATIN_LOWER', ROMAN_UPPER: 'ROMAN_UPPER', ROMAN_LOWER: 'ROMAN_LOWER'
};

/* ------------------------------------------------------- document builders */

/** A text run. `opts` may carry bold, italic, url, font. */
function run(str, opts) {
  const o = opts || {};
  return {
    _kind: 'text',
    getType: () => ElementType.TEXT,
    getText: () => str,
    asText() { return this; },
    isBold: () => !!o.bold,
    isItalic: () => !!o.italic,
    getLinkUrl: () => o.url || null,
    getFontFamily: () => o.font || 'Arial'
  };
}

/** An inline image. Distinct `bytes` give distinct content hashes. */
function image(alt, bytes, width) {
  return {
    _kind: 'image',
    getType: () => ElementType.INLINE_IMAGE,
    getText: () => '',
    asInlineImage() { return this; },
    getAltDescription: () => (alt === null ? null : alt),
    getWidth: () => (width === undefined ? 480 : width),
    getBlob: () => ({
      getBytes: () => bytes || [1, 2, 3],
      getContentType: () => 'image/png'
    })
  };
}

function para(children, heading) {
  const kids = [].concat(children);
  return {
    getType: () => ElementType.PARAGRAPH,
    getText: () => kids.map((k) => k.getText()).join(''),
    getNumChildren: () => kids.length,
    getChild: (i) => kids[i],
    asParagraph() { return this; },
    getHeading: () => heading || ParagraphHeading.NORMAL
  };
}

function h1(text) { return para([run(text)], ParagraphHeading.HEADING1); }
function h2(text) { return para([run(text)], ParagraphHeading.HEADING2); }

function item(children, opts) {
  const kids = [].concat(children);
  const o = opts || {};
  return {
    getType: () => ElementType.LIST_ITEM,
    getText: () => kids.map((k) => k.getText()).join(''),
    getNumChildren: () => kids.length,
    getChild: (i) => kids[i],
    asListItem() { return this; },
    getGlyphType: () => o.glyph || GlyphType.BULLET,
    getNestingLevel: () => o.level || 0
  };
}

/** The three metadata lines every valid doc opens with. */
function metaLines(slug) {
  return [
    para([run('Release: October 2026')]),
    para([run('Date: 2026-10-16')]),
    para([run('Slug: ' + (slug || '2026-oct'))])
  ];
}

/* ----------------------------------------------------------------- sandbox */

/**
 * `drive` describes the Drive files the doc links to, keyed by file id:
 * { mimeType, size, name, bytes, httpStatus }.
 */
function loadCode(children, drive) {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

  const files = drive || {};

  const sandbox = {
    ScriptApp: { getOAuthToken: () => 'test-token' },
    Drive: {
      // No unresolved comments, so validate_ reports only what a test sets up.
      Comments: { list: () => ({ comments: [] }) },
      Files: {
        get: (id, opts) => {
          const f = files[id];
          if (!f) throw new Error('File not found: ' + id);
          // Drive v3 404s a shared-drive file unless the caller opts in.
          if (f.sharedDrive && !(opts && opts.supportsAllDrives)) {
            throw new Error('File not found: ' + id);
          }
          return { name: f.name || 'clip.mp4', mimeType: f.mimeType, size: f.size };
        }
      }
    },
    UrlFetchApp: {
      fetch: (url) => {
        const m = String(url).match(/files\/([-\w]+)\?alt=media/);
        const f = m ? files[m[1]] : null;
        const status = f && f.httpStatus ? f.httpStatus : (f ? 200 : 404);
        return {
          getResponseCode: () => status,
          getContentText: () => '',
          getBlob: () => ({
            getBytes: () => (f && f.bytes) || [8, 8, 8],
            getContentType: () => (f && f.mimeType) || 'video/mp4'
          })
        };
      }
    },
    DocumentApp: {
      ElementType,
      ParagraphHeading,
      GlyphType,
      getActiveDocument: () => ({
        getId: () => 'doc-id',
        getBody: () => ({
          getNumChildren: () => children.length,
          getChild: (i) => children[i]
        })
      }),
      getUi: () => { throw new Error('getUi should not be called in a transform test'); }
    },
    Utilities: {
      DigestAlgorithm: { MD5: 'MD5' },
      Charset: { UTF_8: 'UTF_8' },
      // Not MD5, just stable and content-dependent, which is all the
      // filename contract needs: same bytes -> same name.
      computeDigest: (algo, bytes) => {
        const out = [];
        let acc = 7;
        for (const b of bytes) acc = (acc * 31 + b) & 0xffff;
        for (let i = 0; i < 16; i++) out.push((acc >> (i % 8)) & 0xff ^ (i * 17));
        return out;
      },
      base64Encode: (x) => Buffer.from(String(x)).toString('base64'),
      newBlob: (x) => ({ getDataAsString: () => String(x) }),
      formatDate: () => '2026-10-16',
      sleep: () => {}
    },
    Session: { getScriptTimeZone: () => 'UTC' },
    console
  };

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'Code.gs' });
  return sandbox;
}

/* ----------------------------------------------------------------- harness */

let failures = 0;
let checks = 0;

function check(ok, label, detail) {
  checks++;
  if (ok) {
    console.log('  ✓ ' + label);
  } else {
    failures++;
    console.log('  ✗ ' + label + (detail ? '\n      ' + detail : ''));
  }
}

function section(name) { console.log('\n' + name); }

/* ------------------------------------------------------------------- tests */

section('an image on its own line');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('You can now do the thing')]),
    para([image('The new Snaplex dialog', [9, 9, 9])])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();

  check(model.images.length === 1,
    'the image is registered for upload',
    'model.images holds ' + model.images.length);

  check(model.unsupported.length === 0,
    'it is not reported as unsupported',
    model.unsupported.join(' | '));

  const area = model.areas.find((a) => a.name === 'Admin Manager');
  const blocks = area ? area.categories[0].blocks : [];
  const figures = blocks.filter((b) => b.kind === 'figure');

  check(figures.length === 1,
    'it becomes a figure block, not a list item',
    'blocks: ' + JSON.stringify(blocks.map((b) => b.kind)));

  const html = api.renderPage_(model);

  check(/<p class="rn-figure"><img [^>]*><\/p>/.test(html),
    'it renders as a block image in the page');

  check(!/<li><img/.test(html),
    'it is not wrapped in a stray list item');

  check(/alt="The new Snaplex dialog"/.test(html),
    'alt text survives into the page');

  check(/src="\.\.\/images\/[0-9a-f]+\.png"/.test(html),
    'it points at a committed image file',
    (html.match(/src="[^"]*"/) || ['none'])[0]);

  check(api.validate_ && api.validate_(model).filter(
    (p) => /alt text/.test(p)).length === 0,
    'alt text present, so validation does not complain');
}

section('an image in the Highlights section');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    para([image('A highlights screenshot', [4, 5, 6])]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('You can now do the thing')])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();

  check(model.images.length === 1,
    'the image is registered',
    'model.images holds ' + model.images.length);

  check(model.highlights.some((b) => b.kind === 'figure'),
    'it lands in the highlights blocks as a figure',
    JSON.stringify(model.highlights.map((b) => b.kind)));

  // highlightText_ feeds releases.json and the index card, which are text only.
  const text = api.highlightText_(model);
  check(text.length === 1 && /A highlight worth reading/.test(text[0]),
    'the index summary stays text-only and skips the image',
    JSON.stringify(text));
}

section('an image alongside text keeps working');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('Click '), image('the toolbar', [7, 7]), run(' to start.')])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const blocks = model.areas[0].categories[0].blocks;

  check(model.images.length === 1, 'the inline image is registered');
  check(blocks.length === 1 && blocks[0].kind === 'list',
    'it stays inside its list item rather than splitting the list',
    JSON.stringify(blocks.map((b) => b.kind)));
  check(/Click <img[^>]*> to start\./.test(blocks[0].items[0].html),
    'it keeps its place in the sentence',
    blocks[0].items[0].html);
}

section('the same image used twice is stored once');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    para([image('Shared screenshot', [3, 1, 4])]),
    para([image('Shared screenshot', [3, 1, 4])])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  check(model.images.length === 1,
    'identical bytes deduplicate to one upload',
    'model.images holds ' + model.images.length);
}

section('an empty paragraph is still skipped');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    para([run('   ')]),
    para([]),
    item([run('A real entry')])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const blocks = model.areas[0].categories[0].blocks;
  const items = blocks.reduce(
    (n, b) => n + (b.kind === 'list' ? b.items.length : 1), 0);

  check(items === 1, 'blank paragraphs add nothing',
    'got ' + items + ' entr' + (items === 1 ? 'y' : 'ies'));
  check(blocks.every((b) => b.kind !== 'figure'),
    'a blank paragraph does not become an empty figure');
}

section('an image with no alt text blocks publication');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    para([image('', [2, 2, 2])])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const problems = api.validate_(model);

  check(model.images.length === 1, 'the image is registered');
  check(problems.some((p) => /alt text/.test(p)),
    'validation reports the missing alt text',
    problems.join(' | '));
}

section('indented bullets keep their nesting');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('Admin Manager')], { level: 0 }),
    item([run('Publish and manage standards')], { level: 1 }),
    item([run('A second sub-point')], { level: 1 }),
    item([run('Back to the top level')], { level: 0 }),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();

  check(model.highlights.length === 1,
    'the whole highlights list stays one block',
    'got ' + model.highlights.length + ' blocks');

  const levels = model.highlights[0].items.map((i) => i.level);
  check(JSON.stringify(levels) === '[0,1,1,0]',
    'nesting levels are read from the doc',
    JSON.stringify(levels));

  const html = api.renderPage_(model);
  const hl = (html.match(/<section id="highlights"[\s\S]*?<\/section>/) || [""])[0];

  check(/<li>Admin Manager\s*<ul>/.test(hl),
    'the sublist opens inside its parent item',
    hl);

  check((hl.match(/<ul>/g) || []).length === 2 &&
        (hl.match(/<\/ul>/g) || []).length === 2,
    'lists are balanced',
    (hl.match(/<ul>/g) || []).length + ' open, ' +
      (hl.match(/<\/ul>/g) || []).length + ' close');

  check((hl.match(/<li>/g) || []).length === (hl.match(/<\/li>/g) || []).length,
    'list items are balanced',
    (hl.match(/<li>/g) || []).length + ' open, ' +
      (hl.match(/<\/li>/g) || []).length + ' close');

  check(!/<\/li>\s*<ul>/.test(hl),
    'the sublist is not a sibling of the item it belongs to');
}

section('a numbered sublist under a bullet');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('Do this')], { level: 0 }),
    item([run('First')], { level: 1, glyph: GlyphType.NUMBER }),
    item([run('Second')], { level: 1, glyph: GlyphType.NUMBER })
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const blocks = model.areas[0].categories[0].blocks;

  check(blocks.length === 1,
    'a numbered sublist does not split the parent list',
    'got ' + blocks.length + ' blocks');

  const html = api.renderPage_(model);
  check(/<li>Do this\s*<ol>/.test(html),
    'the sublist renders as <ol> inside the bullet',
    (html.match(/<ul>[\s\S]*?<\/ul>/) || [''])[0]);
}

section('a link to a section of the release notes');
{
  // The href Google Docs produces for a heading link, verbatim.
  const docHref = '?tab=t.0#heading=h.qwbm7ug4ekdp';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('Admin Manager', { url: docHref }), run(': ')], { level: 0 }),
    item([run('Publish and manage standards')], { level: 1 }),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();

  check(model.deadLinks.length === 0,
    'the link resolves, so nothing is reported',
    JSON.stringify(model.deadLinks));

  const html = api.renderPage_(model);
  // Scoped to the highlights section: the on-this-page rail emits the same
  // anchor, so an unscoped match passes even when the rewrite never ran.
  const hl = (html.match(/<section id="highlights"[\s\S]*?<\/section>/) || [""])[0];

  check(/<a href="#admin-manager">Admin Manager<\/a>/.test(hl),
    'it points at the published section anchor',
    (hl.match(/<a href="[^"]*">Admin Manager<\/a>/) || ['none'])[0]);

  check(!html.includes('heading=h.'),
    'no Google Docs heading id survives into the page');

  check(/id="admin-manager"/.test(html),
    'the section it targets really has that id');
}

section('a doc-internal link that matches no section');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('Something Else', { url: '?tab=t.0#heading=h.nope' })]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const problems = api.validate_(model);
  const html = api.renderPage_(model);

  check(model.deadLinks.length === 1,
    'the unresolvable link is recorded',
    JSON.stringify(model.deadLinks));
  check(problems.some((p) => /points inside the Google/.test(p)),
    'validation explains it and blocks publishing',
    problems.join(' | '));
  check(/Something Else/.test(html) && !/href="\?tab/.test(html),
    'the text publishes but the dead href does not');
}

section('an external link is left alone');
{
  const url = 'https://docs.snaplogic.com/admin-manager/snapgpt-settings.html#pipeline-standard';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('SnapGPT Standards tab.'), run(' Learn more', { url: url }), run('. ')])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const html = api.renderPage_(model);

  check(html.includes('href="' + url + '"'),
    'the external href is untouched');
  check(model.deadLinks.length === 0,
    'it is not mistaken for a doc-internal link');

  // The reported bug: Docs extended the link over the preceding space, so the
  // underline reached out in front of the word.
  check(/<a href="[^"]*">Learn more<\/a>/.test(html),
    'the leading space sits outside the anchor',
    (html.match(/<a href="[^"]*">[^<]*<\/a>/) || ['none'])[0]);
  check(/\s<a href/.test(html),
    'the space itself is still there, just not underlined');
}

section('link whitespace does not disturb other formatting');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([
      run('Open the '),
      run('Standards', { bold: true }),
      run(' tab, then run '),
      run('snaplogic --help', { font: 'Roboto Mono' }),
      run(' to check.')
    ])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const html = api.renderPage_(model);

  check(/<strong>Standards<\/strong>/.test(html), 'bold still renders');
  check(/<code>snaplogic --help<\/code>/.test(html), 'monospace still renders as code');
  check(/Open the <strong>/.test(html), 'spacing around bold text is preserved');
}

section('a Drive video linked on its own line');
{
  const url = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view?usp=sharing';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('SnapGPT Standards tab.')]),
    para([run('Publishing a standard', { url })])
  ]);

  const api = loadCode(doc, {
    '1AbCdEfGhIjKlMnOpQr': {
      name: 'standards.mp4', mimeType: 'video/mp4',
      size: 4 * 1024 * 1024, bytes: [1, 7, 3]
    }
  });
  const model = api.parseDoc_();

  check(model.videos.length === 1,
    'the video is registered for upload',
    'model.videos holds ' + model.videos.length);

  check(!!model.videos[0] && /^[0-9a-f]{16}\.mp4$/.test(model.videos[0].name),
    'it is named by content hash with an mp4 extension',
    model.videos[0] ? model.videos[0].name : 'no video registered');

  check(model.unsupported.length === 0,
    'it is not reported as unsupported',
    model.unsupported.join(' | '));

  check(api.validate_(model).length === 0,
    'it passes validation',
    api.validate_(model).join(' | '));

  const html = api.renderPage_(model);

  check(/<figure class="rn-video">/.test(html), 'it renders as a figure');
  check(/<video controls preload="metadata">/.test(html), 'the player has controls');
  check(/<source src="\.\.\/videos\/[0-9a-f]+\.mp4" type="video\/mp4">/.test(html),
    'the source points at the copy in the repo, not Drive',
    (html.match(/<source[^>]*>/) || ['none'])[0]);
  check(!/drive\.google\.com/.test(html),
    'no Drive link survives into the page');
  check(/<figcaption>Publishing a standard<\/figcaption>/.test(html),
    'the link text becomes the caption');
  check(/Download it<\/a>/.test(html),
    'there is a fallback for a browser that cannot play it');
}

section('a video with no caption');
{
  const url = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')]),
    // The writer pasted the bare URL, so the link text is the URL.
    para([run(url, { url })])
  ]);

  const api = loadCode(doc, {
    '1AbCdEfGhIjKlMnOpQr': { mimeType: 'video/mp4', size: 1024, bytes: [2] }
  });
  const model = api.parseDoc_();

  check(model.videos.length === 1, 'the video is still registered');
  check(api.validate_(model).some((p) => /has no caption/.test(p)),
    'validation asks for a caption and blocks publishing',
    api.validate_(model).join(' | '));
}

section('a video that is too large');
{
  const url = 'https://drive.google.com/file/d/1TooBigFileeeee/view';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')]),
    para([run('A long demo', { url })])
  ]);

  const api = loadCode(doc, {
    '1TooBigFileeeee': {
      name: 'demo.mp4', mimeType: 'video/mp4', size: 90 * 1024 * 1024
    }
  });
  const model = api.parseDoc_();

  check(model.videos.length === 0, 'it is not uploaded');
  check(model.unsupported.some((u) => /90 MB.*limit is 25 MB/.test(u)),
    'the size and the limit are both named',
    model.unsupported.join(' | '));
  check(api.validate_(model).length > 0, 'publishing is blocked');
}

section('a Drive link to something that is not a video');
{
  const url = 'https://drive.google.com/file/d/1SomeSpreadsheet/view';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')]),
    para([run('The tracking sheet', { url })])
  ]);

  const api = loadCode(doc, {
    '1SomeSpreadsheet': { mimeType: 'application/vnd.google-apps.spreadsheet', size: 10 }
  });
  const model = api.parseDoc_();
  const html = api.renderPage_(model);

  check(model.videos.length === 0, 'it is not treated as a video');
  check(!/<video/.test(html), 'no player is rendered');
  check(html.includes('href="' + url + '"'),
    'it publishes as an ordinary link');
}

section('a video link inside a sentence stays a link');
{
  const url = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('Watch '), run('the demo', { url }), run(' for the details.')])
  ]);

  const api = loadCode(doc, {
    '1AbCdEfGhIjKlMnOpQr': { mimeType: 'video/mp4', size: 1024, bytes: [5] }
  });
  const model = api.parseDoc_();
  const html = api.renderPage_(model);

  check(model.videos.length === 0,
    'a link among other words is not turned into a player');
  check(/Watch <a href="[^"]*">the demo<\/a> for the details\./.test(html),
    'the sentence is left intact',
    (html.match(/Watch[^<]*<a[\s\S]*?details\./) || ['none'])[0]);
}

section('an unreadable Drive file');
{
  const url = 'https://drive.google.com/file/d/1MissingFileeee/view';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')]),
    para([run('A demo', { url })])
  ]);

  const api = loadCode(doc, {}); // the id is not in Drive
  const model = api.parseDoc_();

  check(model.videos.length === 0, 'nothing is uploaded');
  check(model.unsupported.some((u) => /Cannot read the Drive file/.test(u)),
    'the writer is told the link cannot be read',
    model.unsupported.join(' | '));
  check(api.validate_(model).length > 0, 'publishing is blocked');
}

section('a video on a shared drive');
{
  const url = 'https://drive.google.com/file/d/1OnASharedDrive/view';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')]),
    para([run('Publishing a standard', { url })])
  ]);

  const api = loadCode(doc, {
    '1OnASharedDrive': {
      name: 'standards.mp4', mimeType: 'video/mp4',
      size: 2 * 1024 * 1024, bytes: [6, 6, 6], sharedDrive: true
    }
  });
  const model = api.parseDoc_();

  check(model.videos.length === 1,
    'a file on a shared drive is found, not 404d',
    model.unsupported.join(' | ') || 'no video registered');
  check(model.unsupported.length === 0,
    'nothing is reported',
    model.unsupported.join(' | '));
  check(/<video controls/.test(api.renderPage_(model)),
    'it renders a player');
}

section('the same video linked twice');
{
  const a = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')]),
    para([run('The demo', { url: a })]),
    para([run('The demo again', { url: a })])
  ]);

  const api = loadCode(doc, {
    '1AbCdEfGhIjKlMnOpQr': { mimeType: 'video/mp4', size: 2048, bytes: [4, 4] }
  });
  const model = api.parseDoc_();

  check(model.videos.length === 1,
    'identical bytes deduplicate to one upload',
    'model.videos holds ' + model.videos.length);

  const html = api.renderPage_(model);
  check((html.match(/<video /g) || []).length === 2,
    'both places still render a player');
}

/* ------------------------------------------------------------------ report */

console.log('\n' + (checks - failures) + '/' + checks + ' checks passed');
if (failures) {
  console.log(failures + ' failed');
  process.exit(1);
}
