/* Injects a static mock of the dual-nav site's header and footer.
 *
 * The markup is a snapshot of the dual-nav POC, loaded at runtime from
 * assets/chrome-header.html and assets/chrome-footer.html rather than baked
 * into every published page — so refreshing the chrome does not mean
 * republishing every release note.
 *
 * Nothing in it navigates. Every link was rewritten to href="#" and the
 * scripts stripped, because this is here to show release notes in context,
 * not to be a working copy of the site.
 */
(function () {
  var script = document.currentScript ||
    (function () {
      var all = document.getElementsByTagName('script');
      return all[all.length - 1];
    })();

  // assets/chrome.js -> assets/
  var base = script.src.replace(/chrome\.js(\?.*)?$/, '');

  function inject(file, id, position) {
    var host = document.getElementById(id);
    if (!host) return;
    fetch(base + file)
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        if (!html) { host.remove(); return; }
        host.innerHTML = html;
        if (position === 'header') markMock(host);
      })
      .catch(function () { host.remove(); });
  }

  function markMock(host) {
    var note = document.createElement('div');
    note.className = 'rn-mock-note';
    note.textContent =
      'Header and footer are a static mock of the dual-nav site. Nothing here navigates.';
    host.appendChild(note);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-mock]');
    if (a) e.preventDefault();
  });

  inject('chrome-header.html', 'site-header', 'header');
  inject('chrome-footer.html', 'site-footer', 'footer');
})();
