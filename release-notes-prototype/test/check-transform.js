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

/**
 * A PNG header carrying a given pixel size — all imageSize_ reads. `salt`
 * varies the bytes so two images of the same size still hash differently.
 */
function pngBytes(w, h, salt) {
  const be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return [137, 80, 78, 71, 13, 10, 26, 10]
    .concat([0, 0, 0, 13], [73, 72, 68, 82], be(w), be(h),
            [8, 6, 0, 0, 0, salt || 0]);
}

function para(children, heading, indentStart) {
  const kids = [].concat(children);
  return {
    getType: () => ElementType.PARAGRAPH,
    getText: () => kids.map((k) => k.getText()).join(''),
    getNumChildren: () => kids.length,
    getChild: (i) => kids[i],
    asParagraph() { return this; },
    getHeading: () => heading || ParagraphHeading.NORMAL,
    getIndentStart: () => indentStart || 0
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
 * `videos` describes the YouTube videos that exist, keyed by video id:
 * { bytes, httpStatus }. An id that is absent behaves like a 404 thumbnail,
 * which is how a wrong or private link presents itself.
 */
function loadCode(children, videos) {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

  const known = videos || {};
  const fetched = [];

  const sandbox = {
    __fetched: fetched,
    Drive: {
      // No unresolved comments, so validate_ reports only what a test sets up.
      Comments: { list: () => ({ comments: [] }) }
    },
    UrlFetchApp: {
      fetch: (url) => {
        fetched.push(String(url));
        const m = String(url).match(/\/vi\/([-\w]+)\/\w+\.jpg/);
        const v = m ? known[m[1]] : null;
        const status = v ? (v.httpStatus || 200) : 404;
        return {
          getResponseCode: () => status,
          getContentText: () => '',
          getBlob: () => ({
            getBytes: () => (v && v.bytes) || [8, 8, 8],
            getContentType: () => 'image/jpeg'
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

/** A doc with the metadata and a Highlights section already in place. */
function docWith(tail) {
  return [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('An entry')])
  ], tail);
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
  const items = blocks[0] && blocks[0].kind === 'list' ? blocks[0].items : [];

  check(items.length === 1 && (items[0].figures || []).length === 1,
    'it becomes a figure on the bullet above it, not a list item of its own',
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

section('the template\'s instructions never publish');
{
  // The skeleton explains each field above the field itself, including the
  // steps for adding a screenshot and a video. Those live before the first
  // heading, which is the only place the parser drops text — so a writer who
  // leaves them in place can still publish. If that stopped being true the
  // instructions would appear on the public page.
  const doc = [
    para([run('Fill in the three lines below, keeping them as Normal text.')]),
    para([run('Release: October 2026')]),
    para([run('Date: 2026-10-16')]),
    para([run('Slug: 2026-oct')]),
    para([run('To add a screenshot:')]),
    item([run('Paste the image into the doc on its own line.')], { glyph: GlyphType.NUMBER }),
    item([run('Right-click the image and select Alt text.')], { glyph: GlyphType.NUMBER }),
    para([run('To add a video:')]),
    item([run('Upload the video to YouTube.')], { glyph: GlyphType.NUMBER }),
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('You can now do the thing')])
  ];

  const api = loadCode(doc);
  const model = api.parseDoc_();

  check(model.strays.length === 0,
    'none of it is reported as stranded text',
    model.strays.join(' | '));

  check(api.validate_(model).length === 0,
    'so it does not block publishing',
    api.validate_(model).join(' | '));

  const html = api.renderPage_(model);

  check(!/To add a screenshot|To add a video/.test(html),
    'the headings of the two procedures do not reach the page');

  check(!/Right-click|Upload the video to YouTube|Normal text/.test(html),
    'nor do the numbered steps under them');

  check(/A highlight worth reading/.test(html) && model.release === 'October 2026',
    'while the three metadata lines and the real content come through');
}

section('an image under a bullet renders inside that bullet');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('Open the dialog.')]),
    para([image('Step one', pngBytes(900, 500, 1))]),
    item([run('Choose a node type.')]),
    para([image('Step two', pngBytes(900, 500, 2))])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const blocks = model.areas.find((a) => a.name === 'Admin Manager')
    .categories[0].blocks;

  check(blocks.length === 1 && blocks[0].kind === 'list',
    'the images do not break the list into pieces',
    'blocks: ' + JSON.stringify(blocks.map((b) => b.kind)));

  const items = blocks[0].items || [];

  check(items.length === 2,
    'both bullets are still bullets',
    'items: ' + items.length);

  check(items[0] && (items[0].figures || []).length === 1,
    'the first screenshot attaches to the first bullet',
    JSON.stringify((items[0] || {}).figures));

  check(items[1] && (items[1].figures || []).length === 1,
    'and the second to the second');

  const html = api.renderPage_(model);

  check(/<li>Open the dialog\.<p class="rn-figure"><img [^>]*><\/p>\s*<\/li>/.test(html),
    'the figure sits inside the <li>, so it takes the list indent',
    (html.match(/<li>Open the dialog[\s\S]{0,160}/) || ['none'])[0]);

  check(!/<\/ul>\s*<p class="rn-figure"/.test(html),
    'and not after the list, back at the margin');

  check((html.match(/<ul[ >]/g) || []).length === (html.match(/<\/ul>/g) || []).length,
    'the list tags still balance',
    (html.match(/<ul[ >]/g) || []).length + ' open, ' +
      (html.match(/<\/ul>/g) || []).length + ' close');
}

section('an image under a nested bullet goes in the nested bullet');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('Open the dialog.')]),
    item([run('Pick a node type.')], { level: 1 }),
    para([image('The node list', pngBytes(900, 500, 3))])
  ]);

  const api = loadCode(doc);
  const html = api.renderPage_(api.parseDoc_());

  check(/<li>Pick a node type\.<p class="rn-figure">/.test(html),
    'it lands in the deeper bullet, which carries the deeper indent',
    (html.match(/<li>Pick a node type[\s\S]{0,140}/) || ['none'])[0]);

  check(/<ul>\s*<li>Open the dialog\.\s*<ul>\s*<li>Pick a node type\./.test(html),
    'the nesting that gives it that indent is intact',
    (html.match(/<li>Open the dialog[\s\S]{0,120}/) || ['none'])[0]);
}

section('an image that follows no bullet stays a block');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    para([image('Straight under the heading', pngBytes(800, 600))]),
    item([run('And then a bullet')])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const blocks = model.areas.find((a) => a.name === 'Admin Manager')
    .categories[0].blocks;

  check(blocks[0] && blocks[0].kind === 'figure',
    'it is a figure block of its own, at the margin',
    'blocks: ' + JSON.stringify(blocks.map((b) => b.kind)));

  check(!/<li><p class="rn-figure"/.test(api.renderPage_(model)),
    'it is not forced into a bullet that does not exist');
}

section('an image with text beside it stays part of the bullet');
{
  // Only a paragraph holding nothing but an image becomes a figure. One with
  // words in it is a sentence, so it keeps its link and its place in the list.
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('Open the dialog.')]),
    para([
      image('Step one', pngBytes(900, 500, 4)),
      run(' see '),
      run('Admin Manager', { url: '?tab=t.0#heading=h.abc123' })
    ])
  ]);

  const api = loadCode(doc);
  const model = api.parseDoc_();
  const items = model.areas.find((a) => a.name === 'Admin Manager')
    .categories[0].blocks[0].items;

  check(items.length === 2 && !items[1].figures,
    'it is a bullet, not a figure hung off the one above',
    'items: ' + items.length);

  check(model.deadLinks.length === 0,
    'its doc-internal link still resolves',
    model.deadLinks.join(' | '));

  check(/<a href="#admin-manager">/.test(api.renderPage_(model)),
    'and reaches the page as the published anchor');
}

section('an image publishes at its real pixel size');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('You can now do the thing')]),
    // 1600x900 screenshot, dragged down to 300pt wide in the doc.
    para([image('The new Snaplex dialog', pngBytes(1600, 900), 300)])
  ]);

  const api = loadCode(doc);
  const html = api.renderPage_(api.parseDoc_());

  check(/width="1600"/.test(html),
    'the width comes from the file, not from the size in the doc',
    (html.match(/<img [^>]*>/) || ['none'])[0]);

  check(/height="900"/.test(html),
    'the height comes with it, so the page reserves the right space');

  check(!/width="300"/.test(html),
    'the shrunken size in the doc is not what publishes');
}

section('an image in a format imageSize_ cannot read');
{
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('You can now do the thing')]),
    para([image('Unknown format', [1, 2, 3], 300)])
  ]);

  const api = loadCode(doc);
  const html = api.renderPage_(api.parseDoc_());

  // 300pt is 400px. Carrying the number across unconverted shrank it by a quarter.
  check(/width="400"/.test(html),
    "it falls back to the doc's width, converted from points to pixels",
    (html.match(/<img [^>]*>/) || ['none'])[0]);

  check(!/height=/.test(html),
    'and claims no height it does not know');
}

section('a JPEG size is read from its start-of-frame');
{
  // SOI, an APP0 segment to be skipped, then SOF0 carrying 1200x800.
  const jpeg = [0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x06, 1, 2, 3, 4,
    0xFF, 0xC0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x04, 0xB0, 3, 1, 2, 3, 4, 5, 6];
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('You can now do the thing')]),
    para([image('A photo', jpeg, 300)])
  ]);

  const api = loadCode(doc);
  const html = api.renderPage_(api.parseDoc_());

  check(/width="1200"/.test(html) && /height="800"/.test(html),
    'the markers are walked to the frame header',
    (html.match(/<img [^>]*>/) || ['none'])[0]);
}

section('the page does not repeat "Release Notes" in its title');
{
  const doc = [
    para([run('Release: October 2026 Release Notes')]),
    para([run('Date: 2026-10-16')]),
    para([run('Slug: 2026-oct')]),
    h1('Highlights'),
    item([run('A highlight worth reading')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('You can now do the thing')])
  ];

  const api = loadCode(doc);
  const model = api.parseDoc_();

  check(model.release === 'October 2026',
    'the trailing words are stripped from the release name',
    'release: ' + JSON.stringify(model.release));

  const html = api.renderPage_(model);

  check(/<title>October 2026 Release Notes<\/title>/.test(html),
    'the page title says it once',
    (html.match(/<title>[^<]*<\/title>/) || ['none'])[0]);

  check(!/Release Notes Release Notes/.test(html),
    'and the heading does too');

  // releases.json and the index read the same field, so they stay consistent.
  check(api.releaseName_('October 2026') === 'October 2026',
    'a name that does not end in those words is left alone');

  check(api.releaseName_('October 2026 release note') === 'October 2026',
    'the singular and lower case are caught too');

  check(api.releaseName_('Release Notes') === 'Release Notes',
    'a name made only of those words is kept, rather than emptied');
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

  check(model.highlights.some(
    (b) => b.kind === 'list' && b.items.some((i) => (i.figures || []).length)),
    'it attaches to the highlight above it, where the list sets the indent',
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

section('a YouTube link on its own line');
{
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const api = loadCode(
    docWith([para([run('Publishing a standard', { url })])]),
    { dQw4w9WgXcQ: { bytes: [1, 2, 3] } });

  const model = api.parseDoc_();

  check(model.videos.length === 1,
    'the video is registered',
    'model.videos holds ' + model.videos.length);
  check(model.unsupported.length === 0,
    'nothing is reported as unsupported',
    model.unsupported.join(' | '));
  check(api.validate_(model).length === 0,
    'it passes validation',
    api.validate_(model).join(' | '));

  const html = api.renderPage_(model);

  check(/<figure class="rn-video">/.test(html), 'it renders as a figure');
  check(/data-youtube="dQw4w9WgXcQ"/.test(html), 'the video id is on the holder');
  check(/<figcaption>Publishing a standard<\/figcaption>/.test(html),
    'the link text becomes the caption');
  check(/Play video: Publishing a standard/.test(html),
    'the play control has an accessible name');
}

section('the page makes no request to YouTube until clicked');
{
  const url = 'https://youtu.be/dQw4w9WgXcQ';
  const api = loadCode(
    docWith([para([run('A demo', { url })])]),
    { dQw4w9WgXcQ: { bytes: [4, 5] } });

  const model = api.parseDoc_();
  const html = api.renderPage_(model);

  check(!/ytimg\.com/.test(html) && !/youtube\.com\/embed/.test(html) &&
        !/youtube-nocookie/.test(html),
    'no YouTube asset or iframe is in the published HTML',
    (html.match(/https?:\/\/[^"']*(ytimg|youtube)[^"']*/) || ['none'])[0]);

  check(/<img src="\.\.\/images\/[0-9a-f]{16}\.jpg"/.test(html),
    'the thumbnail is served from this repo',
    (html.match(/<img src="[^"]*"/g) || ['none']).join(' '));

  check(model.images.some((i) => /\.jpg$/.test(i.name) && i.decorative),
    'the thumbnail is queued for commit, marked decorative',
    JSON.stringify(model.images.map((i) => i.name)));

  // The only outbound call at publish time is for the thumbnail.
  check(api.__fetched.length === 1 && /i\.ytimg\.com/.test(api.__fetched[0]),
    'publish fetches only the thumbnail',
    JSON.stringify(api.__fetched));

  check(/href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/.test(html),
    'the thumbnail links to YouTube as the no-JavaScript fallback');
}

section('a thumbnail needs no alt text');
{
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const api = loadCode(
    docWith([para([run('A demo', { url })])]),
    { dQw4w9WgXcQ: { bytes: [7] } });

  const model = api.parseDoc_();
  const problems = api.validate_(model);

  check(!problems.some((p) => /alt text/.test(p)),
    'the missing-alt-text check does not fire on it',
    problems.join(' | '));
  check(/<img src="[^"]*" alt=""/.test(api.renderPage_(model)),
    'it publishes with empty alt, since the caption describes the video');
}

section('link forms and start times');
{
  const cases = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90', 'dQw4w9WgXcQ', 90],
    ['https://youtu.be/dQw4w9WgXcQ?t=1m30s', 'dQw4w9WgXcQ', 90],
    ['https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0]
  ];

  const api = loadCode(docWith([]), { dQw4w9WgXcQ: { bytes: [1] } });

  cases.forEach(function (c) {
    check(api.youTubeId_(c[0]) === c[1],
      'id from ' + c[0], 'got ' + api.youTubeId_(c[0]));
    check(api.youTubeStart_(c[0]) === c[2],
      'start ' + c[2] + 's from ' + c[0], 'got ' + api.youTubeStart_(c[0]));
  });

  check(api.youTubeId_('https://docs.snaplogic.com/a.html') === null,
    'a docs link is not a video');
  check(api.youTubeId_('https://drive.google.com/file/d/1AbCdEfGhIj/view') === null,
    'a Drive link is not a video');
}

section('a start time reaches the player');
{
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90';
  const api = loadCode(
    docWith([para([run('Skip to the demo', { url })])]),
    { dQw4w9WgXcQ: { bytes: [9] } });

  const html = api.renderPage_(api.parseDoc_());
  check(/data-start="90"/.test(html), 'the holder carries the start time');
  check(/watch\?v=dQw4w9WgXcQ&amp;t=90/.test(html),
    'the fallback link keeps it too',
    (html.match(/href="[^"]*watch[^"]*"/) || ['none'])[0]);
}

section('a video with no caption');
{
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  // The writer pasted the bare URL, so the link text is the URL.
  const api = loadCode(
    docWith([para([run(url, { url })])]),
    { dQw4w9WgXcQ: { bytes: [3] } });

  const model = api.parseDoc_();

  check(model.videos.length === 1, 'the video is still registered');
  check(api.validate_(model).some((p) => /has no caption/.test(p)),
    'validation asks for a caption and blocks publishing',
    api.validate_(model).join(' | '));
}

section('a link to a video that does not exist');
{
  const url = 'https://www.youtube.com/watch?v=notARealVideo';
  const api = loadCode(docWith([para([run('A demo', { url })])]), {});

  const model = api.parseDoc_();
  const html = api.renderPage_(model);

  check(model.videos.length === 0, 'it is not registered');
  check(model.unsupported.some((u) => /No YouTube video found/.test(u)),
    'the writer is told the link is wrong',
    model.unsupported.join(' | '));
  check(api.validate_(model).length > 0, 'publishing is blocked');
  check(!/<figure class="rn-video">/.test(html), 'no player is rendered');
}

section('a YouTube link inside a sentence stays a link');
{
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const doc = [].concat(metaLines(), [
    h1('Highlights'),
    item([run('A highlight')]),
    h1('Admin Manager'),
    h2('New features'),
    item([run('Watch '), run('the demo', { url }), run(' for the details.')])
  ]);

  const api = loadCode(doc, { dQw4w9WgXcQ: { bytes: [2] } });
  const model = api.parseDoc_();
  const html = api.renderPage_(model);

  check(model.videos.length === 0,
    'a link among other words is not turned into a player');
  check(/Watch <a href="[^"]*">the demo<\/a> for the details\./.test(html),
    'the sentence is left intact',
    (html.match(/Watch[\s\S]{0,90}details\./) || ['none'])[0]);
}

section('a non-video link on its own line');
{
  const url = 'https://docs.snaplogic.com/admin-manager/snapgpt-settings.html';
  const api = loadCode(docWith([para([run('The settings page', { url })])]), {});

  const model = api.parseDoc_();
  const html = api.renderPage_(model);

  check(model.videos.length === 0, 'it is not treated as a video');
  check(model.unsupported.length === 0,
    'it is not reported either',
    model.unsupported.join(' | '));
  check(html.includes('href="' + url + '"'),
    'it publishes as an ordinary link');
}

section('the same video linked twice');
{
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const api = loadCode(
    docWith([
      para([run('The demo', { url })]),
      para([run('The demo again', { url })])
    ]),
    { dQw4w9WgXcQ: { bytes: [6, 6] } });

  const model = api.parseDoc_();

  check(model.images.filter((i) => /\.jpg$/.test(i.name)).length === 1,
    'the thumbnail is committed once',
    JSON.stringify(model.images.map((i) => i.name)));
  check(model.videos.length === 2,
    'both videos are counted, so an uncaptioned one is still caught');

  const html = api.renderPage_(model);
  check((html.match(/data-youtube=/g) || []).length === 2,
    'both places render a player');
}

/* ------------------------------------------------------------------ report */

console.log('\n' + (checks - failures) + '/' + checks + ' checks passed');
if (failures) {
  console.log(failures + ' failed');
  process.exit(1);
}
