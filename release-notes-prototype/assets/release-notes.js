/**
 * Click-to-play for embedded YouTube videos.
 *
 * The published page ships a thumbnail and a link to YouTube. Nothing is
 * requested from YouTube until the reader clicks, so reading a release note
 * does not tell YouTube who read it. On click the link is replaced by the
 * player, already playing.
 *
 * Without this script the thumbnail stays a link to the video, which is the
 * honest fallback: the reader still gets there, just in a new tab.
 */
(function () {
  'use strict';

  var NOCOOKIE = 'https://www.youtube-nocookie.com/embed/';

  function play(holder) {
    var id = holder.getAttribute('data-youtube');
    if (!id || holder.querySelector('iframe')) return;

    var start = parseInt(holder.getAttribute('data-start'), 10);
    var src = NOCOOKIE + encodeURIComponent(id) +
      '?autoplay=1&rel=0&modestbranding=1' +
      (start > 0 ? '&start=' + start : '');

    var frame = document.createElement('iframe');
    frame.setAttribute('src', src);
    frame.setAttribute('title', holder.getAttribute('data-title') || 'Video');
    frame.setAttribute('allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('frameborder', '0');

    holder.textContent = '';
    holder.appendChild(frame);
    holder.classList.add('is-playing');
    frame.focus();
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest ? e.target.closest('.rn-yt-play') : null;
    if (!trigger) return;
    var holder = trigger.closest('.rn-yt');
    if (!holder) return;
    e.preventDefault(); // the href is the no-JavaScript fallback
    play(holder);
  });

  // The thumbnail is a link, so Enter already activates it and reaches the
  // click handler above. Space does not, and readers expect it on a play
  // control, so it is handled here.
  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Spacebar') return;
    var trigger = e.target.closest ? e.target.closest('.rn-yt-play') : null;
    if (!trigger) return;
    e.preventDefault();
    var holder = trigger.closest('.rn-yt');
    if (holder) play(holder);
  });
}());
