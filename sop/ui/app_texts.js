/* SOP Builder: the texts to check (example_flow.md part 18.1), on the Flow
   tab (the top of the right column) and on the Sections tab (above the
   section), and their own tab (build 40, example_renumber.md part 7:
   each text saved in its own place, or kept as it is). The list comes from
   ENGINE_CHART.textsToCheck; Close hides it until its content changes; the
   tile "N texts to check" opens the tab.
   Classic script (global APP_TEXTS); loaded after ui/app.js. */
const APP_TEXTS = (function () {
  const state = APP.state;
  const sig = list => JSON.stringify(list.map(x => [x.table, x.row_id, x.field, x.mentions]));
  /* list() → the texts to check of the open SOP's current revision */
  function list() {
    if (!state.view || !state.view.sop || !state.view.sop.current_rev) { return []; }
    return ENGINE_CHART.textsToCheck({ tables: state.tables, sop_id: state.view.sop.sop_id });
  }
  /* show(slot, force): the list into slot while it holds something and was not closed (force: shown even when closed) */
  function show(slot, force) {
    if (!slot) { return 0; }
    const l = list();
    state.textsClosed = state.textsClosed || {};
    const id = state.view.sop.sop_id;
    if (force) { delete state.textsClosed[id]; }
    if (!l.length || state.textsClosed[id] === sig(l)) { slot.innerHTML = ''; return l.length; }
    slot.innerHTML = RENDER_FLOW.textsList(l);
    console.log('[engine → ui] textsToCheck: ' + l.length + ' texts');
    const b = slot.querySelector('#btn-texts-close');
    if (b) { b.onclick = () => { state.textsClosed[id] = sig(l); slot.innerHTML = ''; console.log('[ui] texts to check closed'); }; }
    const o = slot.querySelector('#btn-texts-open');
    if (o) { o.onclick = () => APP.guard('ui textsTab', () => APP.showTab('texts')); }
    return l.length;
  }

  /* ---- the Texts to check tab (example_renumber.md part 7, build 40): Save in the text's own place, or Keep as it is ---- */
  function tab(body) {
    const l = list();
    /* the lock line of the open SOP (APP.showSop): a Released or Superseded revision, or build 50 the good version or someone else's copy */
    const lockText = state.view.rev ? state.view.lock_text || null : null;
    body.innerHTML = RENDER_TABS.textsTab(l, lockText);
    console.log('[engine → ui] texts to check tab: ' + l.length + ' texts');
    if (lockText) { return; }
    const sopId = state.view.sop.sop_id;
    const ctxOf = async reason => ({ who: state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: reason });
    const done = async (r, ctx) => { await APP.writeTables(r.tables, ctx); await APP.showSop(sopId, 'texts'); };
    for (const b of body.querySelectorAll('.tc-save')) {
      b.onclick = () => APP.guard('ui saveText', function () {
        const m = l[Number(b.dataset.i)], card = APP.el('tc-' + b.dataset.i), text = APP.el('tc-text-' + b.dataset.i).value;
        return APP_REASON.ask('Save the text of ' + RENDER_FLOW.whereOf(m), async function (reason, dry) {
          const ctx = await ctxOf(reason);
          const r = ENGINE_CHART.saveText({ tables: state.tables, sop_id: sopId, table: m.table, ref: m.ref, field: m.field, text: text, ctx: ctx });
          if (r.refusals) { return r.refusals; }
          if (dry) { return null; }
          console.log('[ui → engine] saveText ' + m.table + ' ' + m.ref + ' ' + m.field);
          await done(r, ctx);
          return null;
        }, refs => RENDER_EDIT.showRefusals(card, refs.map(x => (x.field === 'text' || x.field === 'form' ? x : Object.assign({}, x, { field: 'text' })))));
      });
    }
    /* build 41: an option puts its number in the box (Save saves it) */
    for (const b of body.querySelectorAll('.tc-opt')) {
      b.onclick = () => APP.guard('ui textOption', function () {
        const m = l[Number(b.dataset.i)], o = m.options[Number(b.dataset.o)], box = APP.el('tc-text-' + b.dataset.i);
        box.value = ENGINE_CHART.applyFix({ text: box.value, options: [o] });
        b.disabled = true;
        console.log('[ui] text option ' + o.label + ' on ' + m.id);
      });
    }
    if (APP.el('btn-tc-all')) { APP.el('btn-tc-all').onclick = () => APP.guard('ui applyFixes', () => applyAll(l)); }
    for (const b of body.querySelectorAll('.tc-keep')) {
      b.onclick = () => APP.guard('ui keepText', async function () {
        const m = l[Number(b.dataset.i)];
        const ctx = await ctxOf('Text checked: kept as it is');
        const r = ENGINE_CHART.keepText({ tables: state.tables, sop_id: sopId, table: m.table, ref: m.ref, field: m.field, ctx: ctx });
        if (r.refusals) { RENDER_EDIT.showRefusals(APP.el('tc-' + b.dataset.i), r.refusals); return; }
        console.log('[ui → engine] keepText ' + m.table + ' ' + m.ref + ' ' + m.field);
        await done(r, ctx);
      });
    }
  }
  /* Apply all suggestions: the list first (untick to leave a text), then the Reason pop-up (none in draft mode), one save */
  function applyAll(l) {
    const sopId = state.view.sop.sop_id;
    const close = () => { const b = APP.el('pop-back'); if (b) { b.remove(); } };
    close();
    document.body.insertAdjacentHTML('beforeend', RENDER_POP.fixesPop(l));
    APP.el('btn-fixes-cancel').onclick = () => { close(); console.log('[ui] apply all suggestions cancelled'); };
    APP.el('pop-back').onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    APP.el('btn-fixes-ok').onclick = function () {
      const skip = Array.from(document.querySelectorAll('#fixes-pop .renum-tick')).filter(x => !x.checked).map(x => x.dataset.id);
      close();
      APP.guard('ui applyFixes', () => APP_REASON.ask('Apply the suggested numbers', async function (reason, dry) {
        const ctx = { who: state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: reason };
        const r = ENGINE_CHART.applyFixes({ tables: state.tables, sop_id: sopId, skip: skip, ctx: ctx });
        if (r.refusals) { return r.refusals; }
        if (dry) { return null; }
        console.log('[ui → engine] applyFixes ' + sopId + ': ' + r.texts + ' texts, ' + skip.length + ' left');
        await APP.writeTables(r.tables, ctx);
        await APP.showSop(sopId, 'texts');
        return null;
      }, refs => { const b = APP.el('tab-body'); if (b) { RENDER_EDIT.showRefusals(b, refs); } }));
    };
    APP.el('btn-fixes-ok').focus();
  }
  return { list, show, tab };
})();
