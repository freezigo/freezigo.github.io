/* SOP Builder wiring for the header and the lists typed in the Builder
   (spec/example_new_sop.md parts 9 and 10, job N2, build 32): Edit the
   header on the Header tab; Add a row, Edit and Remove on the tabs 1
   Safety and PPE, 2 Materials, tools and machines, Gauges and Worked
   examples. Each change goes through the Reason pop-up (no pop-up on a
   first draft), shows refusals under its input, writes the tables the
   engine returns and redraws the tab. No logic beyond that. Classic
   script (global APP_LISTS); loaded after ui/app_actions.js. */
const APP_LISTS = (function () {
  const state = APP.state;
  const $ = APP.el, guard = APP.guard, writeTables = APP.writeTables;
  const sopId = () => state.view.sop.sop_id;
  const log = (dir, what) => console.log('[' + dir + '] ' + what);
  const WORD = { safety_items: 'P-1', materials: 'M-1', tools: 'T-1', worked_examples: '', gauges: '', glossary: 'Glossary' };
  const TAB = { safety_items: 'safety', materials: 'materials', tools: 'materials', worked_examples: 'examples', gauges: 'gauges', glossary: 'glossary' };

  /* change(what, call, tab, onRefusals): one change through the Reason pop-up; the tab is drawn again after it */
  function change(what, call, tab, onRefusals) {
    return APP_REASON.ask(what, async function (reason, dry) {
      const ctx = { who: state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: reason };
      const r = call(ctx);
      if (r.refusals) { return r.refusals; }
      if (dry) { return null; }
      log('engine → ui', what + ': ' + r.new_history.length + ' History rows');
      await writeTables(r.tables, ctx);
      await APP.showSop(sopId(), tab);
      return null;
    }, onRefusals);
  }
  const busy = () => !!($('header-form') || $('row-form'));

  function openHeader() {
    if (busy()) { throw new Error('ui header: finish or cancel the open form first'); }
    $('header-slot').innerHTML = RENDER_LISTS.headerForm(state.view);
    const form = $('hd-form');
    $('btn-hd-cancel').onclick = () => { $('header-slot').innerHTML = ''; };
    $('btn-hd-save').onclick = () => guard('ui saveHeader', function () {
      const typed = RENDER_LISTS.readHeader(form, state.view);
      return change('Save the header', ctx => ENGINE_CHART.saveHeader({ tables: state.tables, sop_id: sopId(), changes: typed, ctx: ctx }), 'header', refs => RENDER_EDIT.showRefusals(form, refs));
    });
    $('header-form').scrollIntoView({ block: 'nearest' });
  }

  function rowsOf(table) {
    const v = state.view;
    return table === 'gauges' ? v.gauges : v[table];
  }
  function openRow(table, key) {
    if (busy()) { throw new Error('ui list: finish or cancel the open form first'); }
    const spec = ENGINE_LISTS.LISTS[table];
    const row = key === null ? null : rowsOf(table).find(r => String(r[spec.id]) === String(key));
    if (key !== null && !row) { throw new Error('ui list: no row ' + key + ' in ' + table); }
    const next = row ? null : nextOf(table);
    const slot = document.querySelector('.row-slot[data-table="' + table + '"]');
    slot.innerHTML = RENDER_LISTS.rowForm(table, row, next);
    const form = $('rw-form');
    $('btn-rw-cancel').onclick = () => { slot.innerHTML = ''; };
    $('btn-rw-save').onclick = () => guard('ui saveRow', function () {
      const typed = RENDER_LISTS.readRow(form, table);
      const what = table === 'glossary' ? (row ? 'Save the Glossary term ' + row.term : 'Add a Glossary term')
        : (row ? 'Save ' : 'Add ') + (WORD[table] ? WORD[table] + ' ' : '') + (row ? row[spec.id] : (table === 'gauges' ? 'a gauge' : next));
      return change(what, ctx => ENGINE_CHART.saveRow({ tables: state.tables, sop_id: sopId(), table: table, key: row ? row[spec.id] : null, changes: typed, ctx: ctx }), TAB[table],
        refs => RENDER_EDIT.showRefusals(form, refs));
    });
    slot.scrollIntoView({ block: 'nearest' });
  }
  /* the number a new row will get: the engine gives it on Save; the form shows the same rule */
  function nextOf(table) {
    const spec = ENGINE_LISTS.LISTS[table];
    if (table === 'gauges') { return null; }
    const rows = rowsOf(table);
    if (spec.id === 'we_id') { const n = rows.map(r => /^WE-(\d+)$/.exec(String(r.we_id))).filter(Boolean).map(m => Number(m[1])); return 'WE-' + ((n.length ? Math.max.apply(null, n) : 0) + 1); }
    const n = rows.map(r => Number(r[spec.id])).filter(x => isFinite(x));
    return (n.length ? Math.max.apply(null, n) : 0) + 1;
  }
  function removeRow(table, key) {
    const spec = ENGINE_LISTS.LISTS[table];
    const row = rowsOf(table).find(r => String(r[spec.id]) === String(key));
    const name = row ? row[spec.shown[0]] : '';
    const line = document.querySelector('.btn-row-remove[data-table="' + table + '"][data-key="' + key + '"]').closest('tr');
    return change('Remove ' + (WORD[table] ? WORD[table] + ' ' : '') + key + (name ? ' ' + name : ''),
      ctx => ENGINE_CHART.removeRow({ tables: state.tables, sop_id: sopId(), table: table, key: spec.id === 'we_id' || table === 'gauges' ? key : Number(key), ctx: ctx }), TAB[table],
      refs => { const slot = document.querySelector('.row-slot[data-table="' + table + '"]'); slot.innerHTML = '<p class="refusal">' + RENDER.esc(refs.map(x => x.message).join(' · ')) + '</p>'; line.classList.add('refused'); });
  }

  /* wireGu(area, done): "Gujarati checked" on the step cards of area (build 33); done(r, ctx) writes and redraws */
  function wireGu(area, done) {
    for (const b of area.querySelectorAll('.btn-gu-check')) {
      b.onclick = () => guard('ui checkGujarati', function () {
        const st = state.tables.steps.find(s => s.key === b.dataset.key && s.sop_id === sopId() && s.rev === state.view.sop.current_rev);
        return APP_REASON.ask('Gujarati checked ' + (st ? st.step_no : b.dataset.key), async function (reason, dry) {
          const ctx = { who: state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: reason };
          const r = ENGINE_CHART.checkGujarati({ tables: state.tables, sop_id: sopId(), key: b.dataset.key, ctx: ctx });
          if (r.refusals) { return r.refusals; }
          if (dry) { return null; }
          log('engine → ui', 'checkGujarati ' + b.dataset.key);
          await done(r, ctx);
          return null;
        }, refs => { b.insertAdjacentHTML('afterend', '<span class="refusal"> ' + RENDER.esc(refs.map(x => x.message).join(' · ')) + '</span>'); });
      });
    }
  }

  /* wire(body): the buttons of the tab just drawn */
  function wire(body) {
    if ($('btn-header-edit')) { $('btn-header-edit').onclick = () => guard('ui headerForm', openHeader); }
    for (const b of body.querySelectorAll('.btn-row-add')) { b.onclick = () => guard('ui rowForm', () => openRow(b.dataset.table, null)); }
    for (const b of body.querySelectorAll('.btn-row-edit')) {
      b.onclick = () => guard('ui rowForm', () => openRow(b.dataset.table, (b.dataset.table === 'gauges' || b.dataset.table === 'worked_examples') ? b.dataset.key : Number(b.dataset.key)));
    }
    for (const b of body.querySelectorAll('.btn-row-remove')) { b.onclick = () => guard('ui removeRow', () => removeRow(b.dataset.table, b.dataset.key)); }
  }

  return { wire, wireGu, openHeader, openRow, removeRow };
})();
