/* SOP Builder loud errors: every unexpected condition shows a red banner
   with the place it happened. Never a blank screen, never a swallowed
   error. Classic script (global ERRORS). */
const ERRORS = (function () {
  function el() { return document.getElementById('error-banner'); }
  function show(place, err) {
    const msg = (err && err.message) ? err.message : String(err);
    const text = (msg.indexOf(place) === 0 ? '' : place + ': ') + msg;
    console.error('[error] ' + text, err);
    const b = el();
    if (!b) { alert(text); return; }
    const line = document.createElement('div');
    line.className = 'error-line';
    line.textContent = text;
    b.appendChild(line);
    b.hidden = false;
  }
  function clear() {
    const b = el();
    if (b) { b.innerHTML = ''; b.hidden = true; }
  }
  function install() {
    window.addEventListener('error', function (e) {
      show('window', e.error || e.message);
    });
    window.addEventListener('unhandledrejection', function (e) {
      show('promise', e.reason);
    });
  }
  return { show: show, clear: clear, install: install };
})();
