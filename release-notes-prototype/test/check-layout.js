#!/usr/bin/env node
'use strict';

/**
 * Layout contract for the release notes prototype.
 *
 * Why this exists: the first version wrapped the injected header and footer in
 * plain <div>s. The dual-nav theme makes <body> a CSS grid with named areas —
 *
 *   grid-template-areas: 'gheader gheader gheader'
 *                        'gmenu   gmain   gmain'
 *                        'gfooter gfooter gfooter'
 *   header { grid-area: gheader }   nav.toc { grid-area: gmenu }
 *   main   { grid-area: gmain }     footer  { grid-area: gfooter }
 *
 * — so those four must be DIRECT children of <body>. Wrapped, they lost their
 * areas and were auto-placed: the footer rendered in the middle of the page,
 * on top of the content. This script fails if that happens again.
 *
 * Usage:
 *   node test/check-layout.js
 *   node test/check-layout.js http://localhost:8000
 */

/** Playwright is usually installed globally here, which Node won't resolve
 *  from a project with no node_modules. Try local first, then the global root. */
function requirePlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    const path = require('path');
    const root = require('child_process')
      .execSync('npm root -g', { encoding: 'utf8' })
      .trim();
    return require(path.join(root, 'playwright'));
  }
}

const { chromium } = requirePlaywright();

const DEFAULT_BASE =
  'https://rstento-sl.github.io/snaplogic-ux-showcase/release-notes-prototype/';

const base = (process.argv[2] || process.env.BASE_URL || DEFAULT_BASE).replace(/\/?$/, '/');

const PAGES = [
  { name: 'release note', path: 'releases/sample-release.html' },
  { name: 'index', path: '' }
];

/** Elements the theme's grid assigns named areas to. */
const GRID_AREAS = {
  header: 'gheader',
  'nav.toc': 'gmenu',
  main: 'gmain',
  footer: 'gfooter'
};

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

async function auditPage(page, spec) {
  console.log('\n' + spec.name + '  (' + base + spec.path + ')');
  await page.goto(base + spec.path, { waitUntil: 'load' });

  try {
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-chrome') === 'ready',
      null, { timeout: 10000 }
    );
    check(true, 'mock chrome finished injecting');
  } catch (e) {
    check(false, 'mock chrome finished injecting', 'chrome.js never set data-chrome=ready');
    return;
  }

  // 1. The theme actually loaded. Everything else assumes this.
  const display = await page.evaluate(() => getComputedStyle(document.body).display);
  check(display === 'grid', 'body is display:grid from the dual-nav theme',
    'got display:' + display + ' — the theme stylesheet may not have loaded');

  // 2. The four elements participate in the body grid.
  //
  //    Being a direct child of <body> is the obvious way, but a wrapper with
  //    display:contents is also fine — it disappears from the box tree, so its
  //    child becomes the grid item. Anything else (a plain <div>) makes the
  //    wrapper the grid item and strips the element of its named area, which
  //    is the bug this script exists to catch.
  for (const sel of Object.keys(GRID_AREAS)) {
    const verdict = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return { ok: false, why: 'element not found' };
      let node = el.parentElement;
      while (node && node !== document.body) {
        if (getComputedStyle(node).display !== 'contents') {
          return {
            ok: false,
            why: 'blocked by <' + node.tagName.toLowerCase() +
                 (node.id ? '#' + node.id : '') + '> which is display:' +
                 getComputedStyle(node).display + ', not contents'
          };
        }
        node = node.parentElement;
      }
      return { ok: node === document.body, why: 'not inside <body>' };
    }, sel);
    check(verdict.ok, sel + ' is a grid item of <body>', verdict.why);
  }

  // 3. Each lands in its named area.
  for (const [sel, area] of Object.entries(GRID_AREAS)) {
    const got = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? getComputedStyle(el).gridArea : null;
    }, sel);
    check(got !== null && got.indexOf(area) !== -1,
      sel + ' is placed in ' + area, 'grid-area resolved to: ' + got);
  }

  // 4. Geometry: the failure that actually showed up on screen.
  const box = await page.evaluate(() => {
    const r = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width };
    };
    return { header: r('header'), nav: r('nav.toc'), main: r('main'), footer: r('footer') };
  });

  if (box.header && box.main && box.footer && box.nav) {
    check(box.header.top <= 2, 'header is at the top of the page',
      'header top = ' + Math.round(box.header.top));
    check(box.main.top >= box.header.bottom - 2, 'content starts below the header');
    check(box.footer.top >= box.main.bottom - 2, 'footer sits below the content',
      'footer top ' + Math.round(box.footer.top) + ' overlaps main bottom ' +
      Math.round(box.main.bottom) + ' — the footer has lost its grid area');
    check(box.nav.right <= box.main.left + 2, 'side nav is beside the content, not over it');
    check(box.main.width > 300, 'content column has not collapsed',
      'main is ' + Math.round(box.main.width) + 'px wide');
  }

  // 5. No sideways scroll.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check(overflow <= 2, 'page does not scroll sideways', overflow + 'px of overflow');

  // 6. The chrome rendered, and nothing in it navigates.
  const chrome = await page.evaluate(() => ({
    headerImgs: document.querySelectorAll('header img').length,
    footerText: (document.querySelector('footer') || {}).textContent || '',
    liveLinks: document.querySelectorAll(
      'header a:not([data-mock]), footer a:not([data-mock])').length
  }));
  check(chrome.headerImgs > 0, 'header rendered its images');
  check(/SnapLogic/i.test(chrome.footerText), 'footer rendered its content');
  check(chrome.liveLinks === 0, 'every link in the mock chrome is neutralised',
    chrome.liveLinks + ' link(s) would navigate');

  // 7. Web font loaded across origins. Catches a move to a host with no CORS
  //    headers, where the CSS still loads and the type silently falls back.
  const fontOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('400 1em "Acherus Grotesque"');
  });
  check(fontOk, 'Acherus Grotesque loaded cross-origin',
    'font did not load — check CORS headers on the theme host');

  // 8. Index only: the list is built from releases.json at runtime.
  if (spec.path === '') {
    let count = null;
    try {
      await page.waitForFunction(() => {
        const v = document.documentElement.getAttribute('data-releases');
        return v !== null && v !== 'error';
      }, null, { timeout: 10000 });
      count = Number(await page.getAttribute('html', 'data-releases'));
    } catch (e) { /* leave null */ }
    check(count > 0, 'release list built from releases.json',
      count === null ? 'releases.json never loaded' : 'rendered ' + count + ' releases');
    check(await page.locator('#latest').innerText().then(t => /Latest:/.test(t)).catch(() => false),
      'index shows the latest release');
  }
}

(async () => {
  console.log('Checking ' + base);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    for (const spec of PAGES) await auditPage(page, spec);
  } finally {
    await browser.close();
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
