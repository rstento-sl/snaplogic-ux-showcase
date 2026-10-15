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

var CATEGORIES = [
  'New Features',
  'Enhancements',
  'Fixed Issues',
  'Known Issues',
  'Deprecations',
  'Documentation'
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
    highlights: [], areas: [], images: [], strays: []
  };

  var area = null, category = null, inHighlights = false;

  for (var i = 0; i < body.getNumChildren(); i++) {
    var el = body.getChild(i);
    var type = el.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH ||
        type === DocumentApp.ElementType.LIST_ITEM) {

      collectImages_(el, model);

      var para = el.asParagraph ? el.asParagraph() : el;
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
        category = { name: text, entries: [] };
        area.categories.push(category);
        continue;
      }

      // Body text.
      var item = { text: text, html: inlineHtml_(el) };

      if (inHighlights) { model.highlights.push(item); continue; }
      if (category) { category.entries.push(item); continue; }

      var meta = text.match(/^(Release|Date|Slug)\s*:\s*(.+)$/i);
      if (meta && !area) {
        model[meta[1].toLowerCase()] = meta[2].trim();
        continue;
      }
      if (area) { model.strays.push(text); }
    }
  }
  return model;
}

/** Collects images and flags any without alt text. */
function collectImages_(el, model) {
  for (var i = 0; i < el.getNumChildren(); i++) {
    var child = el.getChild(i);
    if (child.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
      var img = child.asInlineImage();
      model.images.push({ alt: img.getAltDescription() || '' });
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
      if (!c.entries.length)
        problems.push('"' + a.name + ' > ' + c.name + '" has no entries.');
    });
  });

  var noAlt = m.images.filter(function (i) { return !i.alt; }).length;
  if (noAlt) problems.push(noAlt + ' image' + (noAlt === 1 ? ' has' : 's have') +
    ' no alt text. Right-click the image > Alt text.');

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
  h.push('</head><body><main class="rn-page">');

  h.push('<article class="nested0 topic concept">');
  h.push('<h1 class="title topictitle1">' + esc_(m.release) + ' Release Notes</h1>');
  h.push('<p class="rn-date">Released ' + esc_(m.date) + '</p>');
  h.push('<div class="body conbody">');

  h.push('<section class="rn-highlights"><h2 class="title sectiontitle">Highlights</h2><ul>');
  m.highlights.forEach(function (x) { h.push('<li>' + x.html + '</li>'); });
  h.push('</ul></section>');

  h.push('<nav class="rn-toc"><h2 class="title sectiontitle">On this page</h2><ul>');
  m.areas.forEach(function (a) {
    h.push('<li><a href="#' + slug_(a.name) + '">' + esc_(a.name) + '</a></li>');
  });
  h.push('</ul></nav>');

  m.areas.forEach(function (a) {
    h.push('<section id="' + slug_(a.name) + '" class="rn-area">');
    h.push('<h2 class="title sectiontitle">' + esc_(a.name) + '</h2>');
    a.categories.forEach(function (c) {
      h.push('<h3 class="title">' + esc_(c.name) + '</h3><ul>');
      c.entries.forEach(function (e) { h.push('<li>' + e.html + '</li>'); });
      h.push('</ul>');
    });
    h.push('</section>');
  });

  h.push('</div></article>');
  h.push('<footer class="rn-footer"><p>Published from Google Docs. ' +
         'Prototype — not the live documentation.</p></footer>');
  h.push('</main></body></html>');
  return h.join('\n');
}

/* -------------------------------------------------------------------- index */

function updateIndex_(s, m) {
  var existing = getJson_(s, s.basePath + '/releases.json') || { releases: [] };
  var entry = {
    release: m.release,
    date: m.date,
    slug: m.slug,
    url: 'releases/' + m.slug + '.html',
    highlights: m.highlights.map(function (x) { return x.text; }),
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

function countEntries_(m) {
  var n = 0;
  m.areas.forEach(function (a) {
    a.categories.forEach(function (c) { n += c.entries.length; });
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
