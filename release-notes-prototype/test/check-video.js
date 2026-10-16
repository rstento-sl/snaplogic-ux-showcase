#!/usr/bin/env node
'use strict';

/**
 * Click-to-play contract for embedded videos.
 *
 * check-transform.js asserts on the HTML the script produces, and
 * check-layout.js checks the page's grid. Neither can press the play button.
 * The thing most worth protecting here is behavioural: the page must not
 * reach YouTube until the reader asks it to, and the click must actually
 * swap in a working player.
 *
 * Self-contained — builds a page with a video, serves it on a free port, and
 * drives it. No Google account, no published page, no fixtures to maintain.
 *
 * Usage:
 *   node test/check-video.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');

function requirePlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    const root = require('child_process')
      .execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(root, 'playwright'));
  }
}
const { chromium } = requirePlaywright();

const ROOT = path.join(__dirname, '..');
const VIDEO_ID = 'dQw4w9WgXcQ';
const WATCH = 'https://www.youtube.com/watch?v=' + VIDEO_ID + '&t=90';

/* ------------------------------------------------------- build a page */

/** Minimal valid JPEG, standing in for the thumbnail the script downloads. */
const THUMB_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDcyNDP/wAALCAABAAEBAREA/8QAHwAA' +
  'AQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/9oACAEBAAA/AKpgA//Z', 'base64');

function buildPage() {
  const src = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');

  const ET = {
    PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM', TEXT: 'TEXT',
    INLINE_IMAGE: 'INLINE_IMAGE', TABLE: 'TABLE', FOOTNOTE: 'F',
    INLINE_DRAWING: 'D', EQUATION: 'E', HORIZONTAL_RULE: 'HR',
    PAGE_BREAK: 'PB', TABLE_OF_CONTENTS: 'TOC', UNSUPPORTED: 'U'
  };
  const PH = {
    NORMAL: 'NORMAL', HEADING1: 'HEADING1', HEADING2: 'HEADING2',
    HEADING3: 'H3', HEADING4: 'H4', HEADING5: 'H5', HEADING6: 'H6'
  };
  const GT = { BULLET: 'BULLET', NUMBER: 'NUMBER' };

  const run = (s, o) => ({
    getType: () => ET.TEXT, getText: () => s, asText() { return this; },
    isBold: () => false, isItalic: () => false,
    getLinkUrl: () => (o && o.url) || null, getFontFamily: () => 'Arial'
  });
  const para = (kids, h) => ({
    getType: () => ET.PARAGRAPH,
    getText: () => kids.map((k) => k.getText()).join(''),
    getNumChildren: () => kids.length, getChild: (i) => kids[i],
    asParagraph() { return this; }, getHeading: () => h || PH.NORMAL
  });
  const item = (kids) => ({
    getType: () => ET.LIST_ITEM,
    getText: () => kids.map((k) => k.getText()).join(''),
    getNumChildren: () => kids.length, getChild: (i) => kids[i],
    asListItem() { return this; },
    getGlyphType: () => GT.BULLET, getNestingLevel: () => 0
  });

  const doc = [
    para([run('Release: October 2026')]),
    para([run('Date: 2026-10-16')]),
    para([run('Slug: video-check')]),
    para([run('Highlights')], PH.HEADING1),
    item([run('A highlight')]),
    para([run('Admin Manager')], PH.HEADING1),
    para([run('New features')], PH.HEADING2),
    item([run('SnapGPT Standards tab.')]),
    para([run('Publishing a standard', { url: WATCH })])
  ];

  const sandbox = {
    DocumentApp: {
      ElementType: ET, ParagraphHeading: PH, GlyphType: GT,
      getActiveDocument: () => ({
        getId: () => 'doc', getBody: () => ({
          getNumChildren: () => doc.length, getChild: (i) => doc[i]
        })
      }),
      getUi: () => { throw new Error('no ui'); }
    },
    Drive: { Comments: { list: () => ({ comments: [] }) } },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200, getContentText: () => '',
        getBlob: () => ({
          getBytes: () => Array.from(THUMB_JPEG),
          getContentType: () => 'image/jpeg'
        })
      })
    },
    Utilities: {
      DigestAlgorithm: { MD5: 'MD5' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: () => [17, 34, 51, 68, 85, 102, 119, 136, 1, 2, 3, 4, 5, 6, 7, 8],
      base64Encode: () => '', newBlob: () => ({ getDataAsString: () => '' }),
      formatDate: () => '2026-10-16', sleep: () => {}
    },
    Session: { getScriptTimeZone: () => 'UTC' },
    console
  };

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'Code.gs' });

  const model = sandbox.parseDoc_();
  const problems = sandbox.validate_(model);
  if (problems.length) {
    throw new Error('the fixture does not validate: ' + problems.join(' | '));
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-video-'));
  fs.mkdirSync(path.join(dir, 'releases'));
  fs.mkdirSync(path.join(dir, 'images'));
  fs.cpSync(path.join(ROOT, 'assets'), path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'releases', 'video.html'), sandbox.renderPage_(model));
  model.images.forEach((i) => {
    fs.writeFileSync(path.join(dir, 'images', i.name), THUMB_JPEG);
  });
  return dir;
}

/* ------------------------------------------------------------- serve */

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml'
};

function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(dir, rel);
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* ----------------------------------------------------------- harness */

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

function isYouTube(url) {
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { host = ''; }
  return /(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com)$/.test(host);
}

/* ------------------------------------------------------------- tests */

(async () => {
  const dir = buildPage();
  const { server, port } = await serve(dir);
  const url = 'http://127.0.0.1:' + port + '/releases/video.html';
  const browser = await chromium.launch();

  try {
    console.log('\nbefore the click');
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await ctx.newPage();
    const external = [];
    page.on('request', (r) => { if (isYouTube(r.url())) external.push(r.url()); });

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(900);

    // The reason the thumbnail is copied into the repo at all.
    check(external.length === 0,
      'the page makes no request to YouTube', external.join('\n      '));

    const holder = page.locator('.rn-yt');
    check(await holder.count() === 1, 'the video rendered');

    const box = await holder.boundingBox();
    check(!!box && Math.abs(box.width / box.height - 16 / 9) < 0.05,
      'it keeps a 16:9 frame', box ? (box.width / box.height).toFixed(3) : 'no box');

    const badge = await page.locator('.rn-yt-badge').boundingBox();
    check(!!badge && badge.width > 40, 'the play badge is visible');

    check(/^Play video: Publishing a standard$/.test(
      (await page.locator('.rn-yt-play').textContent()).trim()),
      'the control has an accessible name');

    const labelBox = await page.locator('.rn-yt-label').boundingBox();
    check(!labelBox || labelBox.width <= 2,
      'that name is visually hidden, not printed under the thumbnail');

    check(await page.locator('.rn-video figcaption').innerText() === 'Publishing a standard',
      'the caption renders');

    check(await page.locator('.rn-yt-play').getAttribute('href') === WATCH.replace('&', '&'),
      'without JavaScript it is still a link to the video',
      await page.locator('.rn-yt-play').getAttribute('href'));

    console.log('\nafter the click');
    await page.locator('.rn-yt-play').click();
    await page.waitForTimeout(700);

    const frame = page.locator('.rn-yt iframe');
    check(await frame.count() === 1, 'the player replaces the thumbnail');

    const src = await frame.getAttribute('src');
    check(!!src && src.indexOf('https://www.youtube-nocookie.com/embed/' + VIDEO_ID) === 0,
      'it loads from the nocookie host', src);
    check(/autoplay=1/.test(src || ''), 'it plays, because the click asked for it');
    check(/start=90/.test(src || ''), 'the start time carries through', src);
    check(await frame.getAttribute('title') === 'Publishing a standard',
      'the player is titled for screen readers');
    check(await page.locator('.rn-yt-play').count() === 0,
      'the thumbnail is gone, so there is no doubled control');

    const fbox = await frame.boundingBox();
    check(!!fbox && fbox.width > 300, 'the player fills the frame');

    console.log('\nat phone width');
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await ctx2.newPage();
    await p2.goto(url, { waitUntil: 'load' });
    await p2.waitForTimeout(700);

    // The page itself overflows at this width: the mock chrome's ul.topmenu is
    // a fixed 1000px, which predates the video and shows on the live page too.
    // So this asks about the video, not the page.
    const right = await p2.locator('.rn-yt').evaluate((el) => el.getBoundingClientRect().right);
    check(right <= 390, 'the video stays inside the viewport',
      Math.round(right) + 'px against a 390px window');
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('\n' + (checks - failures) + '/' + checks + ' checks passed');
  if (failures) {
    console.log(failures + ' failed');
    process.exit(1);
  }
})().catch((err) => {
  console.error('\nCheck aborted:', err.message);
  process.exit(2);
});
