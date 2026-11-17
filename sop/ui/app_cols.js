/* SOP Builder: the Flow columns resize like columns in Excel
   (example_flow.md part 18.2). Drag the line between two columns: the
   column on its left gets that width, the details column takes the rest;
   a double-click gives the column back its own width. The widths are kept
   in this browser; ENGINE_MENUS.colWidths keeps every column at its least
   width. Classic script (global APP_COLS); loaded after ui/app_flow.js. */
const APP_COLS = (function () {
  const $ = APP.el;
  const KEY = 'sopBuilder.flow.cols';
  const GAP = 36;   // two 6 px lines and four 6 px gaps of .flow-work (ui/style.css)
  let want = null;
  function kept() {
    if (want) { return want; }
    try { const v = JSON.parse(window.localStorage.getItem(KEY) || 'null'); want = v && typeof v === 'object' ? { b: num(v.b), c: num(v.c) } : { b: null, c: null }; }
    catch (e) { want = { b: null, c: null }; }
    return want;
  }
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
  function keep() { try { window.localStorage.setItem(KEY, JSON.stringify(want)); } catch (e) { /* a private window: kept for this visit */ } }
  /* apply(moving): the kept widths, fitted to the window, onto the columns */
  function apply(moving) {
    const w = $('flow-work');
    if (!w) { return null; }
    const fit = ENGINE_MENUS.colWidths(w.clientWidth, kept(), GAP, moving || null);
    for (const k of ['b', 'c']) {
      const col = $('col-' + k);
      if (!col) { continue; }
      if (fit[k] === null) { col.style.flexGrow = ''; col.style.flexShrink = ''; col.style.maxWidth = ''; col.style.width = ''; col.classList.remove('sized'); }
      else { col.style.flexGrow = '0'; col.style.flexShrink = '0'; col.style.flexBasis = fit[k] + 'px'; col.style.maxWidth = 'none'; col.style.width = fit[k] + 'px'; col.classList.add('sized'); }
    }
    return fit;
  }
  function wire() {
    for (const line of document.querySelectorAll('.col-split')) {
      const k = line.dataset.col;
      line.onpointerdown = e => {
        if (e.button !== 0) { return; }
        e.preventDefault();
        const col = $('col-' + k), x0 = e.clientX, w0 = col.getBoundingClientRect().width;
        try { line.setPointerCapture(e.pointerId); } catch (x) { /* the drag still works */ }
        line.classList.add('dragging');
        line.onpointermove = m => { kept()[k] = Math.round(w0 + m.clientX - x0); apply(k); };
        line.onpointerup = () => {
          line.onpointermove = null; line.onpointerup = null; line.classList.remove('dragging');
          const fit = apply(k);
          if (fit) { want[k] = fit[k]; }
          keep();
          console.log('[ui] column ' + k + ': ' + want[k] + ' px');
        };
      };
      line.ondblclick = () => { kept()[k] = null; keep(); apply(null); console.log('[ui] column ' + k + ': its own width'); APP_FLOW.showFlow(); };
    }
    apply(null);
  }
  return { wire, apply };
})();
