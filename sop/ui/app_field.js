/* SOP Builder: right-click a row of the step card to edit only that field
   (spec/example_flow.md part 20, build 35), on the Flow tab's right
   column and on the Sections tab. The menu comes from ENGINE_MENUS.menuFor
   (kind 'field'), the row's fields from ENGINE_MENUS.cardFields. The
   editor opens in the row; Save hands ENGINE.saveStep only those fields
   through the Reason pop-up, then the caller writes and redraws. The
   browser's own menu stays inside inputs and while text is selected.
   Build 70 (spec/example_job1_70.md part 2): a double-click on a row opens
   the same editor; Enter saves in a one-line box, Esc cancels.
   No logic beyond that. Classic script (global APP_FIELD); loaded after
   ui/app_mouse.js. */
const APP_FIELD = (function () {
  const state = APP.state;
  const $ = APP.el, guard = APP.guard;
  const log = what => console.log('[ui] ' + what);
  /* text was selected when the right button went down: the browser's menu (Copy) shows. Read before the press can change the selection. */
  let selected = false;

  /* wire(area, how): the step cards inside area. how = { lockText (the Released line, or null), cardOf(key) → the card's step view,
     openFull(key) → the edit form of the whole step, done(r, ctx, key, row) → writes and redraws } */
  function wire(area, how) {
    area.__field = how;
    if (area.__fieldWired) { return; }
    area.__fieldWired = true;
    area.addEventListener('mousedown', e => {
      if (e.button !== 2) { return; }
      const s = window.getSelection();
      selected = !!s && !s.isCollapsed && String(s).trim() !== '';
    }, true);
    area.addEventListener('contextmenu', e => { guard('ui fieldMenu', () => menu(area, e)); });
    area.addEventListener('dblclick', e => { guard('ui fieldDouble', () => double(area, e)); });
  }

  /* double(area, e): a double-click on a row of the step card opens the same editor as Edit <row> (build 70, spec/example_job1_70.md
     part 2; ENGINE_MENUS.rowDouble); nothing for a row with no editor, a Standard step, a locked revision, an open editor or an input */
  function double(area, e) {
    const how = area.__field;
    if (!how || e.target.closest('input, textarea, select, button, #field-editor, .edit-card')) { return; }
    const row = e.target.closest('[data-row]'), card = e.target.closest('.step-card');
    if (!row || !card || !card.contains(row)) { return; }
    const key = card.dataset.key, st = how.cardOf(key);
    if (!st) { throw new Error('ui fieldDouble: no step ' + key + ' on the screen'); }
    const t = { kind: 'field', step_no: st.step_no, row: row.dataset.row, link_mode: st.link_mode, link_sop: st.link_sop };
    if (ENGINE_MENUS.rowDouble(t, how.lockText) !== 'edit-field') { return; }
    e.preventDefault();
    const s = window.getSelection();
    if (s) { s.removeAllRanges(); }
    log('double-click: ' + row.dataset.row + ' of ' + st.step_no);
    open(key, row, how);
  }

  function menu(area, e) {
    const how = area.__field;
    if (!how || e.target.closest('input, textarea, select, #field-editor')) { return; }
    if (selected) { selected = false; log('text selected: the browser menu'); return; }
    const row = e.target.closest('[data-row]'), card = e.target.closest('.step-card');
    if (!row || !card || !card.contains(row)) { return; }
    e.preventDefault();
    const key = card.dataset.key, st = how.cardOf(key);
    if (!st) { throw new Error('ui fieldMenu: no step ' + key + ' on the screen'); }
    const m = ENGINE_MENUS.menuFor({ kind: 'field', step_no: st.step_no, row: row.dataset.row, link_mode: st.link_mode, link_sop: st.link_sop }, how.lockText);
    APP_MOUSE.openMenu(m, e.clientX, e.clientY, act => run(act, key, row, how));
  }
  function run(act, key, row, how) {
    if (act === 'edit-step') { return how.openFull(key); }
    if (act === 'edit-field') { return open(key, row, how); }
    throw new Error('ui fieldMenu: no action "' + act + '"');
  }

  /* open(key, rowEl, how): the editor in the row; a table row gives way to a row with the editor, the Gujarati line to the editor, the
     title line keeps its buttons and gets the editor under it */
  function open(key, rowEl, how) {
    if ($('edit-form') || $('field-form')) { throw new Error('ui fieldForm: finish or cancel the open edit first'); }
    const sop = state.view.sop;
    const step = state.tables.steps.find(s => s.key === key && s.sop_id === sop.sop_id && s.rev === sop.current_rev);
    if (!step) { throw new Error('ui fieldForm: no step ' + key + ' in ' + sop.sop_id + ' ' + sop.current_rev); }
    const row = rowEl.dataset.row, fields = ENGINE_MENUS.cardFields(row);
    const html = RENDER_EDIT.fieldForm(step, fields, TYPES.tables.steps.fields, SETS, state.view.gauges, row);
    if (rowEl.tagName === 'TR') {
      rowEl.insertAdjacentHTML('afterend', '<tr class="field-edit-row" id="field-row" data-for-row="' + RENDER.esc(row) + '"><th>' + RENDER.esc(row) + '</th><td>' + html + '</td></tr>');
      rowEl.hidden = true;
    } else {
      rowEl.insertAdjacentHTML('afterend', html);
      if (rowEl.tagName !== 'H3') { rowEl.hidden = true; }
    }
    log('field editor: ' + row + ' of ' + step.step_no + ' (' + fields.join(', ') + ')');
    const form = $('field-form');
    const close = () => { const box = $('field-row') || $('field-editor'); if (box) { box.remove(); } rowEl.hidden = false; };
    $('btn-fd-cancel').onclick = () => { close(); log('field editor cancelled: ' + row + ' of ' + step.step_no); };
    /* Esc cancels; Enter saves in a one-line box, a list or a choice (build 70); in a box of several lines Enter starts a new line */
    form.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Enter' && !e.isComposing && !e.shiftKey && e.target && /^(INPUT|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); e.stopPropagation(); $('btn-fd-save').click(); }
    };
    $('btn-fd-full').onclick = () => guard('ui fieldFull', async function () {
      const typed = RENDER_EDIT.readFields(form, fields);
      close();
      await how.openFull(key);
      if ($('edit-form')) { RENDER_EDIT.fillForm($('edit-form'), typed); }
    });
    $('btn-fd-save').onclick = () => guard('ui saveField', function () {
      const typed = RENDER_EDIT.readFields(form, fields);
      return APP_REASON.ask('Save ' + row + ' of step ' + step.step_no, async function (reason, dry) {
        const ctx = { who: state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: reason };
        const r = ENGINE.saveStep({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, key: key, changes: typed, ctx: ctx });
        if (r.refusals) { return r.refusals; }
        if (dry) { return null; }
        console.log('[engine → ui] saveStep ' + key + ' (' + fields.join(', ') + '): ' + r.new_history.length + ' History rows');
        await how.done(r, ctx, key, row);
        return null;
      }, refs => RENDER_EDIT.showRefusals(form, refs));
    });
    const first = form.querySelector('textarea, input:not([type="radio"]), select, input[type="radio"]:checked');
    if (first) { first.focus({ preventScroll: true }); }
    ($('field-row') || $('field-editor')).scrollIntoView({ block: 'nearest' });
  }

  /* reveal(key, row): after a save the same row of the redrawn card is in view */
  function reveal(key, row) {
    const card = $('step-' + key);
    const el = card ? Array.from(card.querySelectorAll('[data-row]')).find(x => x.dataset.row === row) : null;
    if (el) { el.scrollIntoView({ block: 'nearest' }); }
  }

  return { wire, open, reveal };
})();
