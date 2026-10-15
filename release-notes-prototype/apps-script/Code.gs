/**
 * Release notes publisher — prototype.
 *
 * Bound to a Google Doc. Adds a "Release notes" menu with Check and Publish.
 * Publish renders the document to HTML and commits it to a GitHub repo, which
 * GitHub Pages then serves.
 *
 * In the production design this script posts to a Cloudflare Worker that holds
 * the credential and does the transform. Here the script does both, because a
 * prototype with one moving part is easier to try. See README.md for what that
 * shortcut costs.
 *
 * Settings live in Script Properties (File > Project settings > Script
 * properties). Never put the token in this file.
 *
 *   GITHUB_TOKEN   fine-grained PAT, Contents: read and write, that repo only
 *   GITHUB_REPO    e.g. rstento-sl/snaplogic-ux-showcase
 *   GITHUB_BRANCH  e.g. main
 *   BASE_PATH      e.g. release-notes-prototype
 */

/**
 * Category headings, sentence case, in the order they should appear under a
 * product. Writers delete the ones with nothing in them rather than inventing
 * new names — that is what keeps published pages consistent.
 *
 * Behavior changes is used rarely, but it is a real category.
 */
var CATEGORIES = [
  'New features',
  'Enhancements',
  'Fixed issues',
  'Known issues',
  'Behavior changes'
];

/**
 * The dual-nav site's stylesheets, loaded by URL rather than copied so the
 * prototype tracks that theme instead of drifting from it. The dual-nav site
 * is the target for release notes; the current docs.snaplogic.com theme is
 * deliberately not used here.
 */
var CSS = [
  'https://rstento-sl.github.io/dual-nav-poc/theme/commonltr.css',
  'https://rstento-sl.github.io/dual-nav-poc/theme/sldocs.css'
];

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Release notes')
    .addItem('Check', 'menuCheck')
    .addItem('Publish', 'menuPublish')
    .addSeparator()
    .addItem('Show settings', 'menuSettings')
    .addToUi();
}

/* ---------------------------------------------------------------- settings */

function settings_() {
  var p = PropertiesService.getScriptProperties();
  return {
    token: p.getProperty('GITHUB_TOKEN'),
    repo: p.getProperty('GITHUB_REPO'),
    branch: p.getProperty('GITHUB_BRANCH') || 'main',
    basePath: (p.getProperty('BASE_PATH') || 'release-notes-prototype').replace(/\/+$/, '')
  };
}

function menuSettings() {
  var s = settings_();
  tell_('Settings',
    'Repo: ' + (s.repo || '(not set)') + '\n' +
    'Branch: ' + s.branch + '\n' +
    'Base path: ' + s.basePath + '\n' +
    'Token: ' + (s.token ? 'set' : '(not set)') + '\n\n' +
    'Set these in File > Project settings > Script properties.');
}

/* ------------------------------------------------------------------- menus */

function menuCheck() {
  var model = parseDoc_();
  var problems = validate_(model);
  if (!problems.length) {
    tell_('Check passed',
      model.release + ' — ' + model.date + '\n' +
      model.areas.length + ' areas, ' + countEntries_(model) + ' entries, ' +
      model.highlights.length + ' highlights.\n\nReady to publish.');
    return;
  }
  tell_('Check found ' + problems.length + ' problem' + (problems.length === 1 ? '' : 's'),
    problems.map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n'));
}

function menuPublish() {
  var s = settings_();
  if (!s.token || !s.repo) {
    tell_('Not configured', 'Set GITHUB_TOKEN and GITHUB_REPO in Script properties first.');
    return;
  }

  var model = parseDoc_();
  var problems = validate_(model);
  if (problems.length) {
    tell_('Publish blocked',
      'Fix these first, or run Check for the full list:\n\n' +
      problems.map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n'));
    return;
  }

  if (isFuture_(model.date)) {
    var go = ask_('Release date is in the future',
      model.release + ' is dated ' + model.date + ', which has not arrived.\n\n' +
      'Publish anyway?');
    if (!go) return;
  }

  var html = renderPage_(model);
  var pagePath = s.basePath + '/releases/' + model.slug + '.html';
  putFile_(s, pagePath, html, 'Publish ' + model.release + ' release notes');

  var index = updateIndex_(s, model);
  putFile_(s, s.basePath + '/releases.json',
    JSON.stringify(index, null, 2), 'Update release index for ' + model.release);

  var url = 'https://' + s.repo.split('/')[0] + '.github.io/' + s.repo.split('/')[1] +
    '/' + s.basePath + '/releases/' + model.slug + '.html';

  tell_('Published',
    model.release + ' is committed.\n\n' + url +
    '\n\nGitHub Pages usually takes under a minute to rebuild.');
}

/* ------------------------------------------------------------------ parsing */

/**
 * Walks the document body once and builds a model:
 *
 *   Release: <name>        metadata, before the first heading
 *   Date: <YYYY-MM-DD>
 *   Slug: <url-segment>
 *
 *   Heading 1 "Highlights" -> highlights (list items)
 *   Heading 1 <other>      -> a product area
 *   Heading 2              -> a category within the current area
 *   List item / paragraph  -> an entry in the current category
 */
function parseDoc_() {
  var body = DocumentApp.getActiveDocument().getBody();
  var model = {
    release: '', date: '', slug: '',
    highlights: [], areas: [], images: [], strays: [], unsupported: []
  };

  var area = null, category = null, inHighlights = false;

  /** Where we are, for error messages. */
  function place() {
    if (inHighlights) return 'Highlights';
    if (area && category) return area.name + ' > ' + category.name;
    if (area) return area.name;
    return 'before the first heading';
  }

  /** The block list currently being appended to, or null. */
  function target() {
    if (inHighlights) return model.highlights;
    if (category) return category.blocks;
    return null;
  }

  /** Appends a list item, starting a new list block when the kind changes. */
  function pushItem(list, html, ordered) {
    var last = list[list.length - 1];
    if (!last || last.kind !== 'list' || last.ordered !== ordered) {
      last = { kind: 'list', ordered: ordered, items: [] };
      list.push(last);
    }
    last.items.push(html);
  }

  for (var i = 0; i < body.getNumChildren(); i++) {
    var el = body.getChild(i);
    var type = el.getType();

    // ---------------------------------------------------------------- tables
    if (type === DocumentApp.ElementType.TABLE) {
      var list = target();
      if (!list) {
        model.unsupported.push('A table sits ' + place() + ', where there is no ' +
          'category to put it in.');
        continue;
      }
      list.push(readTable_(el.asTable(), model));
      continue;
    }

    // ------------------------------------------------- paragraphs and bullets
    if (type === DocumentApp.ElementType.PARAGRAPH ||
        type === DocumentApp.ElementType.LIST_ITEM) {

      collectImages_(el, model, place());

      var text = el.getText().trim();
      var heading = (type === DocumentApp.ElementType.PARAGRAPH)
        ? el.asParagraph().getHeading()
        : DocumentApp.ParagraphHeading.NORMAL;

      if (!text) continue;

      if (heading === DocumentApp.ParagraphHeading.HEADING1) {
        if (/^highlights$/i.test(text)) {
          inHighlights = true; area = null; category = null;
        } else {
          inHighlights = false;
          area = { name: text, categories: [] };
          model.areas.push(area);
          category = null;
        }
        continue;
      }

      if (heading === DocumentApp.ParagraphHeading.HEADING2) {
        inHighlights = false;
        if (!area) { model.strays.push(text); continue; }
        category = { name: text, blocks: [] };
        area.categories.push(category);
        continue;
      }

      // Heading 3 and deeper have no place in the structure. Say so rather
      // than letting them fall through and publish as ordinary bullets.
      if (heading === DocumentApp.ParagraphHeading.HEADING3 ||
          heading === DocumentApp.ParagraphHeading.HEADING4 ||
          heading === DocumentApp.ParagraphHeading.HEADING5 ||
          heading === DocumentApp.ParagraphHeading.HEADING6) {
        model.unsupported.push('"' + text.slice(0, 50) + '" (' + place() +
          ') is a Heading 3 or deeper. Only Heading 1 for products and ' +
          'Heading 2 for categories are published.');
        continue;
      }

      var html = inlineHtml_(el);
      var ordered = false;
      if (type === DocumentApp.ElementType.LIST_ITEM) {
        var glyph = el.asListItem().getGlyphType();
        ordered = glyph === DocumentApp.GlyphType.NUMBER ||
                  glyph === DocumentApp.GlyphType.LATIN_UPPER ||
                  glyph === DocumentApp.GlyphType.LATIN_LOWER ||
                  glyph === DocumentApp.GlyphType.ROMAN_UPPER ||
                  glyph === DocumentApp.GlyphType.ROMAN_LOWER;
      }

      var here = target();
      if (here) { pushItem(here, html, ordered); continue; }

      var meta = text.match(/^(Release|Date|Slug)\s*:\s*(.+)$/i);
      if (meta && !area) {
        model[meta[1].toLowerCase()] = meta[2].trim();
        continue;
      }
      if (area) { model.strays.push(text); }
      continue;
    }

    // ----------------------------------------------------------- everything else
    // Anything the transform cannot render is reported, never dropped quietly.
    // A page that refuses to publish is recoverable; one that publishes with a
    // table missing is found by a customer.
    if (type === DocumentApp.ElementType.HORIZONTAL_RULE ||
        type === DocumentApp.ElementType.PAGE_BREAK ||
        type === DocumentApp.ElementType.TABLE_OF_CONTENTS ||
        type === DocumentApp.ElementType.UNSUPPORTED) {
      continue; // decorative or generated — safe to skip
    }
    model.unsupported.push('A ' + String(type).toLowerCase().replace(/_/g, ' ') +
      ' sits ' + place() + '. The transform cannot publish it.');
  }
  return model;
}

/**
 * Reads a Google Docs table into a block. The first row is treated as the
 * header, which is the convention in the release notes we looked at.
 */
function readTable_(table, model) {
  var rows = [];
  for (var r = 0; r < table.getNumRows(); r++) {
    var row = table.getRow(r);
    var cells = [];
    for (var c = 0; c < row.getNumCells(); c++) {
      var cell = row.getCell(c);
      var parts = [];
      for (var k = 0; k < cell.getNumChildren(); k++) {
        var child = cell.getChild(k);
        var t = child.getType();
        if (t === DocumentApp.ElementType.PARAGRAPH ||
            t === DocumentApp.ElementType.LIST_ITEM) {
          collectImages_(child, model, 'a table cell');
          var h = inlineHtml_(child);
          if (h) parts.push(h);
        }
      }
      cells.push(parts.join('<br>'));
    }
    rows.push(cells);
  }
  return { kind: 'table', rows: rows };
}

/** Collects images, with where they are, and flags any without alt text. */
function collectImages_(el, model, where) {
  for (var i = 0; i < el.getNumChildren(); i++) {
    var child = el.getChild(i);
    if (child.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
      var img = child.asInlineImage();
      model.images.push({ alt: img.getAltDescription() || '', where: where || '' });
    }
  }
}

/** Renders a paragraph's text runs, preserving bold, italic, code and links. */
function inlineHtml_(el) {
  var text = el.editAsText();
  var raw = text.getText();
  if (!raw) return '';
  var out = '', run = '', attrs = null;

  function flush() {
    if (!run) return;
    var piece = esc_(run);
    if (attrs) {
      if (attrs.code) piece = '<code>' + piece + '</code>';
      if (attrs.bold) piece = '<strong>' + piece + '</strong>';
      if (attrs.italic) piece = '<em>' + piece + '</em>';
      if (attrs.url) piece = '<a href="' + esc_(attrs.url) + '">' + piece + '</a>';
    }
    out += piece;
    run = '';
  }

  for (var i = 0; i < raw.length; i++) {
    var a = {
      bold: text.isBold(i) || false,
      italic: text.isItalic(i) || false,
      url: text.getLinkUrl(i) || null,
      code: (text.getFontFamily(i) || '').indexOf('Mono') > -1 ||
            (text.getFontFamily(i) || '') === 'Consolas'
    };
    var key = JSON.stringify(a);
    if (attrs === null) { attrs = a; }
    else if (JSON.stringify(attrs) !== key) { flush(); attrs = a; }
    run += raw.charAt(i);
  }
  flush();
  return out;
}

/* --------------------------------------------------------------- validation */

function validate_(m) {
  var problems = [];

  if (!m.release) problems.push('No "Release:" line before the first heading.');
  if (!m.date) problems.push('No "Date:" line before the first heading.');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date))
    problems.push('Date must be YYYY-MM-DD. Found: "' + m.date + '".');
  if (!m.slug) problems.push('No "Slug:" line before the first heading.');
  else if (!/^[a-z0-9-]+$/.test(m.slug))
    problems.push('Slug must be lowercase letters, digits and hyphens. Found: "' + m.slug + '".');

  if (!m.highlights.length)
    problems.push('No Highlights. Add a "Highlights" Heading 1 with at least one item.');

  if (!m.areas.length)
    problems.push('No product areas. Each area is a Heading 1, with categories as Heading 2.');

  m.areas.forEach(function (a) {
    if (!a.categories.length)
      problems.push('"' + a.name + '" has no categories. Add a Heading 2 such as New Features.');
    a.categories.forEach(function (c) {
      if (CATEGORIES.indexOf(c.name) === -1)
        problems.push('"' + a.name + ' > ' + c.name + '" is not a known category. Use one of: ' +
          CATEGORIES.join(', ') + '.');
      if (!c.blocks.length)
        problems.push('"' + a.name + ' > ' + c.name + '" has no entries.');
    });
  });

  // Images are counted but not published yet, so say so plainly rather than
  // letting a page go out silently missing its screenshots.
  if (m.images.length) {
    problems.push(m.images.length + ' image' + (m.images.length === 1 ? '' : 's') +
      ' in this document. The prototype does not publish images yet, so they ' +
      'would be missing from the page. Remove them, or publish without them ' +
      'knowingly.');
  }
  var noAlt = m.images.filter(function (i) { return !i.alt; }).length;
  if (noAlt) problems.push(noAlt + ' of those image' + (noAlt === 1 ? ' has' : 's have') +
    ' no alt text either. Right-click the image > Alt text.');

  m.unsupported.forEach(function (u) { problems.push(u); });

  m.strays.forEach(function (s) {
    problems.push('Text outside any category: "' + s.slice(0, 60) + '".');
  });

  problems = problems.concat(reviewProblems_());
  return problems;
}

/**
 * Unresolved comments and pending suggestions block publication.
 *
 * Comments come from the Drive API, which is an advanced service and has to be
 * enabled (Services > Drive API v3). If it is not enabled we say so rather than
 * passing silently, because a check that quietly succeeds is worse than none.
 */
function reviewProblems_() {
  var id = DocumentApp.getActiveDocument().getId();
  try {
    var res = Drive.Comments.list(id, { fields: 'comments(resolved,quotedFileContent/value)', pageSize: 100 });
    var open = (res.comments || []).filter(function (c) { return !c.resolved; });
    if (!open.length) return [];
    return open.slice(0, 10).map(function (c) {
      var q = (c.quotedFileContent && c.quotedFileContent.value) || '';
      return 'Unresolved comment' + (q ? ' on "' + q.slice(0, 40) + '"' : '') + '.';
    });
  } catch (e) {
    return ['Could not check comments — enable the Drive API advanced service ' +
            '(Services > Drive API v3). Publishing without this check is not safe.'];
  }
}

/* ----------------------------------------------------------------- rendering */

function renderPage_(m) {
  var h = [];
  h.push('<!doctype html>');
  h.push('<html lang="en"><head><meta charset="utf-8">');
  h.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  h.push('<title>' + esc_(m.release) + ' Release Notes</title>');
  CSS.forEach(function (href) {
    h.push('<link rel="stylesheet" href="' + href + '">');
  });
  h.push('<link rel="stylesheet" href="../assets/release-notes.css">');
  h.push('</head><body>');

  // The dual-nav theme makes <body> a grid with named areas and assigns them
  // to header, nav.toc, main and footer. Those four must be DIRECT children of
  // body or they lose their grid area — the placeholders below are
  // display:contents so the injected <header> and <footer> become the grid
  // items rather than the wrapper divs.
  h.push('<div id="site-header"></div>');

  // Left column (gmenu) is site navigation, so it carries the release list.
  h.push('<nav class="toc" role="navigation"><ul class="rn-nav">');
  h.push('<li class="rn-nav-title">Release notes</li>');
  h.push('<li><a href="../index.html">All releases</a></li>');
  h.push('</ul></nav>');

  h.push('<main role="main">');
  h.push('<article role="article">');
  h.push('<p class="rn-mock-note">Header and footer are a static mock of the ' +
         'dual-nav site. Nothing in them navigates.</p>');
  h.push('<h1 class="title topictitle1">' + esc_(m.release) + ' Release Notes</h1>');
  h.push('<p class="rn-date">Released ' + esc_(m.date) + '</p>');
  h.push('<div class="body conbody">');

  h.push('<section id="highlights" class="rn-highlights">' +
         '<h2 class="title sectiontitle">Highlights</h2>');
  renderBlocks_(h, m.highlights);
  h.push('</section>');

  m.areas.forEach(function (a) {
    h.push('<section id="' + slug_(a.name) + '" class="rn-area">');
    h.push('<h2 class="title sectiontitle">' + esc_(a.name) + '</h2>');
    a.categories.forEach(function (c) {
      h.push('<h3 class="title">' + esc_(c.name) + '</h3>');
      renderBlocks_(h, c.blocks);
    });
    h.push('</section>');
  });

  h.push('<p class="rn-footer-note">Published from Google Docs. ' +
         'Prototype — not the live documentation.</p>');
  h.push('</div></article>');

  // main is itself a grid, 1fr plus a reserved 240px column. On this page goes
  // in that column, beside the content, not in the site navigation.
  h.push('<aside class="rn-onthispage" aria-label="On this page">');
  h.push('<p class="rn-onthispage-title">On this page</p><ul>');
  h.push('<li><a href="#highlights">Highlights</a></li>');
  m.areas.forEach(function (a) {
    h.push('<li><a href="#' + slug_(a.name) + '">' + esc_(a.name) + '</a></li>');
  });
  h.push('</ul></aside>');

  h.push('</main>');
  h.push('<div id="site-footer"></div>');
  h.push('<script src="../assets/chrome.js"><\/script>');
  h.push('</body></html>');
  return h.join('\n');
}

/**
 * Renders a category's blocks in document order, so a table between two
 * bullets stays between them.
 */
function renderBlocks_(h, blocks) {
  blocks.forEach(function (b) {
    if (b.kind === 'list') {
      var tag = b.ordered ? 'ol' : 'ul';
      h.push('<' + tag + '>');
      b.items.forEach(function (html) { h.push('<li>' + html + '</li>'); });
      h.push('</' + tag + '>');
      return;
    }
    if (b.kind === 'table') {
      if (!b.rows.length) return;
      // The theme styles .table / .thead / .tbody, so release note tables look
      // like every other table on the docs site.
      h.push('<table class="table rn-table"><thead class="thead"><tr>');
      b.rows[0].forEach(function (cell) {
        h.push('<th class="entry">' + cell + '</th>');
      });
      h.push('</tr></thead><tbody class="tbody">');
      b.rows.slice(1).forEach(function (row) {
        h.push('<tr>');
        row.forEach(function (cell) { h.push('<td class="entry">' + cell + '</td>'); });
        h.push('</tr>');
      });
      h.push('</tbody></table>');
    }
  });
}

/* -------------------------------------------------------------------- index */

function updateIndex_(s, m) {
  var existing = getJson_(s, s.basePath + '/releases.json') || { releases: [] };
  var entry = {
    release: m.release,
    date: m.date,
    slug: m.slug,
    url: 'releases/' + m.slug + '.html',
    highlights: highlightText_(m),
    areas: m.areas.map(function (a) { return a.name; }),
    published: new Date().toISOString()
  };
  var rest = (existing.releases || []).filter(function (r) { return r.slug !== m.slug; });
  rest.unshift(entry);
  rest.sort(function (a, b) { return b.date.localeCompare(a.date); });
  return { generated: new Date().toISOString(), latest: rest[0] || null, releases: rest };
}

/* ------------------------------------------------------------------- GitHub */

function api_(s, path) {
  return 'https://api.github.com/repos/' + s.repo + '/contents/' + path;
}

function headers_(s) {
  return {
    Authorization: 'Bearer ' + s.token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function getFileMeta_(s, path) {
  var res = UrlFetchApp.fetch(api_(s, path) + '?ref=' + encodeURIComponent(s.branch), {
    headers: headers_(s), muteHttpExceptions: true
  });
  if (res.getResponseCode() === 404) return null;
  if (res.getResponseCode() >= 300) {
    throw new Error('GitHub read failed (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200));
  }
  return JSON.parse(res.getContentText());
}

function getJson_(s, path) {
  var meta = getFileMeta_(s, path);
  if (!meta) return null;
  return JSON.parse(Utilities.newBlob(Utilities.base64Decode(meta.content)).getDataAsString());
}

/**
 * Writes a file, re-reading the SHA on conflict so two people pressing Publish
 * at the same time do not clobber each other.
 */
function putFile_(s, path, content, message) {
  for (var attempt = 0; attempt < 3; attempt++) {
    var meta = getFileMeta_(s, path);
    var payload = {
      message: message,
      content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
      branch: s.branch
    };
    if (meta && meta.sha) payload.sha = meta.sha;

    var res = UrlFetchApp.fetch(api_(s, path), {
      method: 'put',
      headers: headers_(s),
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    if (code < 300) return;
    if (code === 409 || code === 422) { Utilities.sleep(800); continue; }
    throw new Error('GitHub write failed (' + code + '): ' + res.getContentText().slice(0, 300));
  }
  throw new Error('GitHub write failed after 3 attempts — someone else may be publishing.');
}

/* -------------------------------------------------------------------- utils */

/** Highlights as plain strings, for releases.json and the index page. */
function highlightText_(m) {
  var out = [];
  m.highlights.forEach(function (b) {
    if (b.kind !== 'list') return;
    b.items.forEach(function (html) {
      out.push(html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                   .replace(/&quot;/g, '"').trim());
    });
  });
  return out;
}

function countEntries_(m) {
  var n = 0;
  m.areas.forEach(function (a) {
    a.categories.forEach(function (c) {
      c.blocks.forEach(function (b) {
        n += b.kind === 'list' ? b.items.length : 1;
      });
    });
  });
  return n;
}

function isFuture_(date) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return date > today;
}

function slug_(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function esc_(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tell_(title, msg) {
  DocumentApp.getUi().alert(title, msg, DocumentApp.getUi().ButtonSet.OK);
}

function ask_(title, msg) {
  var ui = DocumentApp.getUi();
  return ui.alert(title, msg, ui.ButtonSet.YES_NO) === ui.Button.YES;
}
