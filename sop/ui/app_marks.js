/* SOP Builder screen code for the marks on the steps of a copy (spec/example_edit_online.md part 10, build 58; Vishal 2026-11-20, "b"):
   a small red mark at the bottom right of a step card that differs from the good version (or is not in it), a blue one where another
   copy changed the step and differs from this copy; a click on a mark opens Compare for that step. Only shows: nothing is saved.
   Classic script (global APP_MARKS). */
const APP_MARKS = (function () {
  const $ = id => document.getElementById(id);
  function close() { const b = $('pop-back'); if (b) { b.remove(); } }

  /* draw(root, tables, sopId) → the number of step cards in root that got a mark; nothing on the good version or an SOP that is not a copy */
  function draw(root, tables, sopId) {
    if (!root) { return 0; }
    const sop = (tables.sops || []).find(s => s.sop_id === sopId);
    if (!sop || !ENGINE_COPIES.isCopy(sop)) { return 0; }
    const r = ENGINE_COPIES.stepMarks({ tables: tables, sop_id: sopId });
    let n = 0;
    for (const card of root.querySelectorAll('.step-card')) {
      const old = card.querySelector('.step-marks');
      if (old) { old.remove(); }
      const m = r.marks[card.dataset.key];
      card.classList.toggle('has-marks', !!m);
      if (!m) { continue; }
      card.insertAdjacentHTML('beforeend', RENDER_POP.marks(card.dataset.key, m, r.good));
      n++;
    }
    for (const b of root.querySelectorAll('.step-marks .mark')) {
      b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); APP.guard('ui stepCompare', () => open(tables, sopId, b.dataset.key)); };
    }
    console.log('[marks] ' + sopId + ': ' + n + (n === 1 ? ' step card' : ' step cards') + ' marked here, ' + r.count + ' in the copy');
    return n;
  }

  /* open(tables, sopId, key): Compare for one step in a pop-up; Close, Esc or a click outside shuts it */
  function open(tables, sopId, key) {
    const c = ENGINE_COPIES.stepCompare({ tables: tables, sop_id: sopId, key: key });
    console.log('[ui → engine] stepCompare ' + sopId + ' ' + key + ': ' + c.columns.length + ' columns, ' + c.rows.length + ' rows');
    close();
    document.body.insertAdjacentHTML('beforeend', RENDER_POP.stepComparePop(c));
    $('btn-stepcmp-close').onclick = close;
    $('pop-back').onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    $('pop-back').onmousedown = e => { if (e.target.id === 'pop-back') { e.preventDefault(); close(); } };
    $('btn-stepcmp-close').focus();
  }

  return { draw, open, close };
})();
