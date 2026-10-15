/* Injects a static mock of the dual-nav site's header and footer.
 *
 * The theme makes <body> a grid with named areas (gheader, gmenu, gmain,
 * gfooter) and assigns them to header, nav.toc, main and footer. Those four
 * have to be direct children of body to land in their areas, so the
 * placeholders are display:contents — the fetched <header> and <footer>
 * become the grid items, not the wrapper divs. Wrapping them in a plain div
 * is what broke the layout the first time: the footer lost its grid area and
 * was auto-placed into the middle of the page.
 *
 * The markup loads at runtime rather than being baked into every published
 * page, so refreshing the chrome does not mean republishing every release
 * note. Nothing in it navigates: links were rewritten to href="#" and the
 * scripts stripped.
 */
(function () {
  var script = document.currentScript ||
    (function () {
      var all = document.getElementsByTagName('script');
      return all[all.length - 1];
    })();

  var base = script.src.replace(/chrome\.js(\?.*)?$/, '');

  function inject(file, id) {
    var host = document.getElementById(id);
    if (!host) return Promise.resolve();
    return fetch(base + file)
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        if (html) host.innerHTML = html;
      })
      .catch(function () { /* leave the placeholder empty */ });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-mock]');
    if (a) e.preventDefault();
  });

  Promise.all([
    inject('chrome-header.html', 'site-header'),
    inject('chrome-footer.html', 'site-footer')
  ]).then(function () {
    document.documentElement.setAttribute('data-chrome', 'ready');
  });
})();
