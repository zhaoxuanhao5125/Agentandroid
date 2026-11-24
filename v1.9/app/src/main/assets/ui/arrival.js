/* A one-shot frontispiece, not a loading screen. The host and deck initialize independently. */
(function () {
  'use strict';

  function start() {
    var plate = document.getElementById('arrival');
    if (!plate || plate.hasAttribute('data-arrival-seen')) return;
    plate.setAttribute('data-arrival-seen', '');
    if (document.hidden || document.documentElement.classList.contains('reduce') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        window.getComputedStyle(plate).getPropertyValue('--arrival-ready').trim() !== '1') return;

    // No remote assets, focusable content, image decode waits or native bridge calls.
    function piece(parent, tag, name, text) {
      var child = document.createElement(tag);
      child.className = name;
      if (text) child.textContent = text;
      parent.appendChild(child);
      return child;
    }
    var frame = piece(plate, 'div', 'arrival-frame');
    var legend = piece(frame, 'div', 'arrival-legend');
    piece(legend, 'span', 'arrival-index', 'OPTICAL STUDY');
    piece(legend, 'span', 'arrival-folio', 'FIG. 01');
    var stage = piece(frame, 'div', 'arrival-stage');
    piece(stage, 'span', 'arrival-orbit');
    var prism = piece(stage, 'img', 'arrival-prism');
    prism.alt = '';
    prism.draggable = false;
    prism.src = 'optic.webp';
    var title = piece(frame, 'div', 'arrival-wordmark');
    piece(title, 'strong', '', 'pilot');
    title.appendChild(document.createTextNode(' one thing'));
    var foot = piece(frame, 'div', 'arrival-foot');
    piece(foot, 'span', 'arrival-edition', 'FLIGHT DECK');
    piece(foot, 'span', 'arrival-hint', '轻触跳过');

    var closed = false;
    var deadline;
    function close() {
      if (closed) return;
      closed = true;
      window.clearTimeout(deadline);
      plate.removeEventListener('click', tap);
      plate.removeEventListener('animationend', ended);
      window.removeEventListener('pagehide', close);
      window.removeEventListener('pilot-visibility', close);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('keydown', close, true);
      document.removeEventListener('focusin', close, true);
      if (plate.parentNode) plate.parentNode.removeChild(plate);
    }
    function tap(event) {
      // Dismiss on the completed tap, not pointerdown: never activate a button underneath.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    function ended(event) {
      if (event.target === plate && event.animationName === 'arrival-expose') close();
    }
    function visibility() { if (document.hidden) close(); }
    plate.addEventListener('click', tap);
    plate.addEventListener('animationend', ended);
    window.addEventListener('pagehide', close);
    window.addEventListener('pilot-visibility', close);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('keydown', close, true);
    document.addEventListener('focusin', close, true);
    // Also retire when an embedded compositor doesn't dispatch animationend.
    deadline = window.setTimeout(close, 1280);
    plate.classList.add('arrival-live');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}());
