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

  // Media first, so the page never references a file that is not there yet.
  var uploaded = publishImages_(s, model);
  var uploadedVideos = publishVideos_(s, model);

  var html = renderPage_(model);
  var pagePath = s.basePath + '/releases/' + model.slug + '.html';
  putFile_(s, pagePath, html, 'Publish ' + model.release + ' release notes');

  var index = updateIndex_(s, model);
  putFile_(s, s.basePath + '/releases.json',
    JSON.stringify(index, null, 2), 'Update release index for ' + model.release);

  var url = 'https://' + s.repo.split('/')[0] + '.github.io/' + s.repo.split('/')[1] +
    '/' + s.basePath + '/releases/' + model.slug + '.html';

  tell_('Published',
    model.release + ' is committed.' +
    (model.images.length
      ? '\n' + model.images.length + ' image' + (model.images.length === 1 ? '' : 's') +
        ', ' + uploaded + ' newly uploaded.'
      : '') +
    (model.videos.length
      ? '\n' + model.videos.length + ' video' + (model.videos.length === 1 ? '' : 's') +
        ', ' + uploadedVideos + ' newly uploaded.'
      : '') +
    '\n\n' + url +
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
    highlights: [], areas: [], images: [], videos: [], strays: [],
    unsupported: [], deadLinks: []
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
    // Entries directly under a Heading 1, before any Heading 2. Sections like
    // "In this Release" and "Recommended Snaplex Version" are written this way
    // on purpose: they are prose, not a list of changes, so they take no
    // categories. They publish as a lead paragraph under the section title.
    if (area) return area.lead;
    return null;
  }

  /**
   * Appends a list item, starting a new list block when the kind changes.
   *
   * Each item carries its nesting level from the doc. Only a change of kind at
   * the top level starts a new block — a numbered sublist under a bullet is
   * part of the same list, not a sibling of it.
   */
  function pushItem(list, html, ordered, level) {
    level = level || 0;
    var last = list[list.length - 1];
    if (!last || last.kind !== 'list' || (level === 0 && last.ordered !== ordered)) {
      last = { kind: 'list', ordered: ordered, items: [] };
      list.push(last);
    }
    last.items.push({ html: html, level: level, ordered: ordered });
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

      var text = el.getText().trim();
      var heading = (type === DocumentApp.ElementType.PARAGRAPH)
        ? el.asParagraph().getHeading()
        : DocumentApp.ParagraphHeading.NORMAL;

      // A paragraph holding only an image has no text. Skipping on text alone
      // dropped the image before inlineHtml_ ever saw it.
      if (!text && !hasInlineImage_(el)) continue;

      if (text && heading === DocumentApp.ParagraphHeading.HEADING1) {
        if (/^highlights$/i.test(text)) {
          inHighlights = true; area = null; category = null;
        } else {
          inHighlights = false;
          area = { name: text, lead: [], categories: [] };
          model.areas.push(area);
          category = null;
        }
        continue;
      }

      if (text && heading === DocumentApp.ParagraphHeading.HEADING2) {
        inHighlights = false;
        if (!area) { model.strays.push(text); continue; }
        category = { name: text, blocks: [] };
        area.categories.push(category);
        continue;
      }

      // Heading 3 and deeper have no place in the structure. Say so rather
      // than letting them fall through and publish as ordinary bullets.
      if (text && (heading === DocumentApp.ParagraphHeading.HEADING3 ||
          heading === DocumentApp.ParagraphHeading.HEADING4 ||
          heading === DocumentApp.ParagraphHeading.HEADING5 ||
          heading === DocumentApp.ParagraphHeading.HEADING6)) {
        model.unsupported.push('"' + text.slice(0, 50) + '" (' + place() +
          ') is a Heading 3 or deeper. Only Heading 1 for products and ' +
          'Heading 2 for categories are published.');
        continue;
      }

      // A paragraph that is nothing but a link to a Drive video publishes as
      // an embedded player. Docs cannot hold a video file, so a link to one in
      // Drive is the only way a writer can put a video in the source.
      if (type === DocumentApp.ElementType.PARAGRAPH) {
        var only = soleLink_(el);
        if (only) {
          var video = videoBlock_(only.url, only.text, model, place());
          if (video) {
            var dest = target();
            if (dest) { dest.push(video); continue; }
            model.unsupported.push('A video sits ' + place() + ', where there ' +
              'is no category to put it in.');
            continue;
          }
        }
      }

      var html = inlineHtml_(el, model, place());
      var ordered = false;
      var level = 0;
      if (type === DocumentApp.ElementType.LIST_ITEM) {
        var listItem = el.asListItem();
        var glyph = listItem.getGlyphType();
        ordered = glyph === DocumentApp.GlyphType.NUMBER ||
                  glyph === DocumentApp.GlyphType.LATIN_UPPER ||
                  glyph === DocumentApp.GlyphType.LATIN_LOWER ||
                  glyph === DocumentApp.GlyphType.ROMAN_UPPER ||
                  glyph === DocumentApp.GlyphType.ROMAN_LOWER;
        level = listItem.getNestingLevel() || 0;
      }

      var here = target();
      if (here) {
        // An image on its own line is a block, not a bullet. Sending it through
        // pushItem would wrap the screenshot in a stray <ul><li>.
        if (!text && type === DocumentApp.ElementType.PARAGRAPH) {
          here.push({ kind: 'figure', html: html });
        } else {
          pushItem(here, html, ordered, level);
        }
        continue;
      }

      var meta = text.match(/^(Release|Date|Slug)\s*:\s*(.+)$/i);
      if (meta && !area) {
        model[meta[1].toLowerCase()] = meta[2].trim();
        continue;
      }
      // Text before the first heading that is not one of the three metadata
      // lines is instruction text from the template. It is dropped on purpose:
      // the skeleton explains each field above the field itself, and a writer
      // who leaves those notes in place should still be able to publish.
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

  // Needs the full area list, so it runs once the walk is done.
  resolveLinks_(model);
  return model;
}

/**
 * True for a link that only resolves inside the Google Doc.
 *
 * A link to a heading gives "?tab=t.0#heading=h.qwbm7ug4ekdp", which is
 * relative to the published page and lands nowhere. Bookmarks and links back
 * to the document itself have the same problem.
 */
function isDocInternal_(href) {
  return /^[?#]/.test(href) ||
         /#(heading|bookmark)=/.test(href) ||
         /docs\.google\.com\/document\//.test(href);
}

/**
 * Rewrites doc-internal links to the anchors the page actually publishes.
 *
 * The section ids come from the Heading 1 text, so a link whose text names a
 * section resolves to it. A link that names nothing we publish keeps its text
 * and loses the href, and is reported — a visibly dead link on a customer page
 * is worse than a publish that stops and says which link is broken.
 */
function resolveLinks_(m) {
  var byName = { highlights: 'highlights' };
  m.areas.forEach(function (a) {
    byName[a.name.trim().toLowerCase().replace(/:$/, '')] = slug_(a.name);
  });

  function fix(html) {
    return html.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g,
      function (whole, href, label) {
        if (!isDocInternal_(href)) return whole;
        var plain = label.replace(/<[^>]+>/g, '').trim()
                         .replace(/[:.]$/, '').toLowerCase();
        var target = byName[plain];
        if (target) return '<a href="#' + target + '">' + label + '</a>';
        m.deadLinks.push(label.replace(/<[^>]+>/g, '').trim() || href);
        return label;
      });
  }

  function walk(blocks) {
    blocks.forEach(function (b) {
      if (b.kind === 'list') {
        b.items.forEach(function (it) { it.html = fix(it.html); });
      } else if (b.kind === 'figure') {
        b.html = fix(b.html);
      } else if (b.kind === 'table') {
        b.rows = b.rows.map(function (row) { return row.map(fix); });
      }
    });
  }

  walk(m.highlights);
  m.areas.forEach(function (a) {
    walk(a.lead);
    a.categories.forEach(function (c) { walk(c.blocks); });
  });
}

/* -------------------------------------------------------------------- video */

/** Largest video we will carry into the repo, in bytes. */
var VIDEO_MAX_BYTES = 25 * 1024 * 1024;

var VIDEO_EXT = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v'
};

/**
 * Returns {url, text} when a paragraph is a single link and nothing else, so a
 * link on its own line can be treated as a block. A link inside a sentence is
 * left as a link, because replacing it with a player would break the sentence.
 */
function soleLink_(el) {
  var url = null, text = '';
  for (var i = 0; i < el.getNumChildren(); i++) {
    var child = el.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.TEXT) return null;
    var t = child.asText();
    var raw = t.getText();
    for (var c = 0; c < raw.length; c++) {
      var ch = raw.charAt(c);
      var href = t.getLinkUrl(c);
      if (!href) {
        if (/\s/.test(ch)) continue; // whitespace around the link is fine
        return null;                 // unlinked words, so not a link-only line
      }
      if (url === null) url = href;
      else if (url !== href) return null;
      text += ch;
    }
  }
  return url ? { url: url, text: text.trim() } : null;
}

/** The file id out of a Drive link, or null when it is not one. */
function driveFileId_(url) {
  var m = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^#]*id=)([-\w]{10,})/);
  return m ? m[1] : null;
}

/**
 * Registers a Drive video for publication and returns the block that renders
 * it, or null when the link is not a video we can carry.
 *
 * The file is copied into the repo rather than embedded from Drive: a Drive
 * link needs a signed-in viewer with access, which a public docs page does not
 * have. Anything that cannot be published is reported, never dropped quietly.
 */
function videoBlock_(url, label, model, where) {
  var id = driveFileId_(url);
  if (!id) return null;

  var meta;
  try {
    // supportsAllDrives defaults to false in v3, which 404s a file that lives
    // on a shared drive — where a docs team's videos actually sit.
    meta = Drive.Files.get(id, {
      fields: 'name,mimeType,size',
      supportsAllDrives: true
    });
  } catch (e) {
    // Publish runs as whoever clicks it, so the file has to be readable by
    // that account — not by the person who wrote the video.
    model.unsupported.push('Cannot read the Drive file linked in ' + where +
      '. Publish runs as you, so the video has to be one your own account can ' +
      'open: either in your Drive, on a shared drive you belong to, or shared ' +
      'with you by whoever made it. (' + e.message + ')');
    return null;
  }

  var mime = String(meta.mimeType || '');
  if (mime.indexOf('video/') !== 0) return null; // a link to something else

  var ext = VIDEO_EXT[mime];
  if (!ext) {
    model.unsupported.push('The video "' + meta.name + '" in ' + where + ' is ' +
      mime + '. Publish it as MP4, which every browser plays.');
    return null;
  }

  var size = Number(meta.size || 0);
  if (size > VIDEO_MAX_BYTES) {
    model.unsupported.push('The video "' + meta.name + '" in ' + where + ' is ' +
      Math.round(size / 1048576) + ' MB. The limit is ' +
      Math.round(VIDEO_MAX_BYTES / 1048576) + ' MB. Shorten it, export it ' +
      'smaller, or host it on YouTube instead.');
    return null;
  }

  var res = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + id +
    '?alt=media&supportsAllDrives=true', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
  if (res.getResponseCode() >= 300) {
    model.unsupported.push('Could not download the video "' + meta.name +
      '" in ' + where + ' (HTTP ' + res.getResponseCode() + ').');
    return null;
  }

  var blob = res.getBlob();
  var name = hashBytes_(blob.getBytes()) + '.' + ext;

  var seen = model.videos.some(function (v) { return v.name === name; });
  if (!seen) {
    model.videos.push({ name: name, blob: blob, label: label, where: where || '' });
  }
  return { kind: 'video', name: name, type: mime, label: label };
}

/** Short content hash, used for image and video filenames alike. */
function hashBytes_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes);
  return digest.map(function (b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('').slice(0, 16);
}

/** True when a paragraph or list item carries an inline image. */
function hasInlineImage_(el) {
  for (var i = 0; i < el.getNumChildren(); i++) {
    if (el.getChild(i).getType() === DocumentApp.ElementType.INLINE_IMAGE) return true;
  }
  return false;
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
          var h = inlineHtml_(child, model, 'a table cell');
          if (h) parts.push(h);
        }
      }
      cells.push(parts.join('<br>'));
    }
    rows.push(cells);
  }
  return { kind: 'table', rows: rows };
}

/**
 * Renders a paragraph's children in order: text runs with their formatting,
 * and inline images as <img> pointing at a file we commit alongside the page.
 *
 * Walking children rather than just the text is what lets an image keep its
 * place in the sentence it sits in.
 */
function inlineHtml_(el, model, where) {
  var out = '';
  for (var i = 0; i < el.getNumChildren(); i++) {
    var child = el.getChild(i);
    var type = child.getType();

    if (type === DocumentApp.ElementType.TEXT) {
      out += textHtml_(child.asText());
      continue;
    }

    if (type === DocumentApp.ElementType.INLINE_IMAGE) {
      out += imageHtml_(child.asInlineImage(), model, where);
      continue;
    }

    if (type === DocumentApp.ElementType.FOOTNOTE ||
        type === DocumentApp.ElementType.INLINE_DRAWING ||
        type === DocumentApp.ElementType.EQUATION) {
      if (model) {
        model.unsupported.push('A ' + String(type).toLowerCase().replace(/_/g, ' ') +
          ' sits in ' + (where || 'the document') + '. The transform cannot publish it.');
      }
    }
  }
  return out;
}

/**
 * Registers an image for publication and returns the <img> that references it.
 *
 * The filename is a hash of the bytes, so the same screenshot used twice is
 * stored once, and republishing an unchanged image costs nothing.
 */
function imageHtml_(img, model, where) {
  var blob = img.getBlob();
  var hash = hashBytes_(blob.getBytes());

  var ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
               'image/gif': 'gif', 'image/webp': 'webp'
             })[blob.getContentType()] || 'png';
  var name = hash + '.' + ext;
  var alt = img.getAltDescription() || '';

  if (model) {
    var seen = model.images.some(function (x) { return x.name === name; });
    if (!seen) model.images.push({ name: name, blob: blob, alt: alt, where: where || '' });
  }

  var w = img.getWidth();
  return '<img src="../images/' + name + '" alt="' + esc_(alt) + '"' +
         (w ? ' width="' + Math.round(w) + '"' : '') + ' loading="lazy">';
}

/** Renders one text run, preserving bold, italic, code and links. */
function textHtml_(text) {
  var raw = text.getText();
  if (!raw) return '';
  var out = '', run = '', attrs = null;

  function flush() {
    if (!run) return;

    // Docs usually extends a link over the space in front of it, which
    // published an underline reaching out ahead of the word. Keep the
    // surrounding whitespace, but leave it outside the anchor.
    var lead = '', tail = '', body = run;
    if (attrs && attrs.url) {
      var edges = run.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (edges[2]) { lead = edges[1]; body = edges[2]; tail = edges[3]; }
    }

    var piece = esc_(body);
    if (attrs) {
      if (attrs.code) piece = '<code>' + piece + '</code>';
      if (attrs.bold) piece = '<strong>' + piece + '</strong>';
      if (attrs.italic) piece = '<em>' + piece + '</em>';
      if (attrs.url) piece = '<a href="' + esc_(attrs.url) + '">' + piece + '</a>';
    }
    out += lead + piece + tail;
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

  if (!m.release) problems.push('No "Release:" line before the first heading, ' +
    'or the line is there but empty. Type the release name after the colon.');
  if (!m.date) problems.push('No "Date:" line before the first heading, ' +
    'or the line is there but empty. Type the release date after the colon.');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date))
    problems.push('Date must be YYYY-MM-DD. Found: "' + m.date + '".');
  if (!m.slug) problems.push('No "Slug:" line before the first heading, ' +
    'or the line is there but empty. Type the URL segment after the colon.');
  else if (!/^[a-z0-9-]+$/.test(m.slug))
    problems.push('Slug must be lowercase letters, digits and hyphens. Found: "' + m.slug + '".');

  if (!m.highlights.length)
    problems.push('No Highlights. Add a "Highlights" Heading 1 with at least one item.');

  if (!m.areas.length)
    problems.push('No product areas. Each area is a Heading 1, with categories as Heading 2.');

  m.areas.forEach(function (a) {
    if (!a.categories.length && !a.lead.length)
      problems.push('"' + a.name + '" is empty. Give it a category as a Heading 2, ' +
        'or write the section directly under the title, or delete it.');
    a.categories.forEach(function (c) {
      if (CATEGORIES.indexOf(c.name) === -1)
        problems.push('"' + a.name + ' > ' + c.name + '" is not a known category. Use one of: ' +
          CATEGORIES.join(', ') + '.');
      if (!c.blocks.length)
        problems.push('"' + a.name + ' > ' + c.name + '" has no entries.');
    });
  });

  m.images.filter(function (i) { return !i.alt; }).forEach(function (i) {
    problems.push('An image in ' + (i.where || 'the document') +
      ' has no alt text. Right-click the image > Alt text.');
  });

  // The link text becomes the player's caption, so a bare pasted URL leaves
  // the video with nothing to describe it.
  m.videos.filter(function (v) {
    return !v.label || /^https?:\/\//i.test(v.label);
  }).forEach(function (v) {
    problems.push('The video in ' + (v.where || 'the document') +
      ' has no caption. Select the link, type a short description of the ' +
      'video, and keep it linked to the Drive file.');
  });

  m.unsupported.forEach(function (u) { problems.push(u); });

  m.deadLinks.forEach(function (t) {
    problems.push('The link on "' + t.slice(0, 40) + '" points inside the Google ' +
      'Doc, and no published section matches its text. Link to a section by ' +
      'using its exact Heading 1 name, or link to a page on docs.snaplogic.com.');
  });

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
    renderBlocks_(h, a.lead);
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
 * Commits any image the repo does not already have, and returns how many were
 * new. Filenames are content hashes, so an unchanged image is skipped: the
 * cost of republishing a page with twelve screenshots is twelve cheap checks,
 * not twelve uploads.
 */
function publishImages_(s, model) {
  var uploaded = 0;
  model.images.forEach(function (img) {
    var path = s.basePath + '/images/' + img.name;
    if (getFileMeta_(s, path)) return; // same bytes, same name — already there
    putBinary_(s, path, img.blob, 'Add release note image ' + img.name);
    uploaded++;
  });
  return uploaded;
}

/** The same write-once treatment for videos, which live beside the images. */
function publishVideos_(s, model) {
  var uploaded = 0;
  model.videos.forEach(function (v) {
    var path = s.basePath + '/videos/' + v.name;
    if (getFileMeta_(s, path)) return;
    putBinary_(s, path, v.blob, 'Add release note video ' + v.name);
    uploaded++;
  });
  return uploaded;
}

/**
 * Renders a category's blocks in document order, so a table between two
 * bullets stays between them.
 */
function renderBlocks_(h, blocks) {
  blocks.forEach(function (b) {
    if (b.kind === 'list') {
      renderList_(h, b);
      return;
    }
    if (b.kind === 'figure') {
      h.push('<p class="rn-figure">' + b.html + '</p>');
      return;
    }
    if (b.kind === 'video') {
      var src = '../videos/' + b.name;
      h.push('<figure class="rn-video">');
      h.push('<video controls preload="metadata">' +
             '<source src="' + src + '" type="' + esc_(b.type) + '">' +
             'Your browser cannot play this video. ' +
             '<a href="' + src + '">Download it</a>.' +
             '</video>');
      if (b.label) h.push('<figcaption>' + esc_(b.label) + '</figcaption>');
      h.push('</figure>');
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

/**
 * Renders one list block, nesting sublists inside the item they sit under.
 *
 * A nested list belongs inside the parent <li>, not after it, so the parent's
 * </li> is held open until its children are closed. Writers indent in the doc
 * and expect the published page to indent too.
 */
function renderList_(h, block) {
  var tags = [];   // open list tags, outermost first
  var liOpen = []; // whether an <li> is currently open at that depth

  function tagFor(ordered) { return ordered ? 'ol' : 'ul'; }

  block.items.forEach(function (it) {
    // A doc cannot jump from level 0 straight to level 2, but a malformed
    // model could. Clamp rather than emit a list with no parent item.
    var level = Math.min(it.level || 0, tags.length);

    while (tags.length <= level) {
      tags.push(tagFor(tags.length === 0 ? block.ordered : it.ordered));
      h.push('<' + tags[tags.length - 1] + '>');
      liOpen.push(false);
    }
    while (tags.length > level + 1) {
      if (liOpen.pop()) h.push('</li>');
      h.push('</' + tags.pop() + '>');
    }
    if (liOpen[liOpen.length - 1]) h.push('</li>');
    h.push('<li>' + it.html);
    liOpen[liOpen.length - 1] = true;
  });

  while (tags.length) {
    if (liOpen.pop()) h.push('</li>');
    h.push('</' + tags.pop() + '>');
  }
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

/** Commits a binary blob. Images are write-once, so no SHA dance is needed. */
function putBinary_(s, path, blob, message) {
  var res = UrlFetchApp.fetch(api_(s, path), {
    method: 'put',
    headers: headers_(s),
    contentType: 'application/json',
    payload: JSON.stringify({
      message: message,
      content: Utilities.base64Encode(blob.getBytes()),
      branch: s.branch
    }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 300 && code !== 422) {
    throw new Error('Image upload failed (' + code + '): ' +
      res.getContentText().slice(0, 200));
  }
}

/* -------------------------------------------------------------------- utils */

/** Highlights as plain strings, for releases.json and the index page. */
function highlightText_(m) {
  var out = [];
  m.highlights.forEach(function (b) {
    if (b.kind !== 'list') return;
    b.items.forEach(function (it) {
      out.push(it.html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
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
