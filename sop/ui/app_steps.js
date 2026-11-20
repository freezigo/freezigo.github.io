/* SOP Builder Flow tab wiring, the middle and right columns
   (example_flow.md parts 8, 15 and 18): the head and chart C of the
   clicked section, the drop line of a step drag, the section details, the
   card of the clicked step with its photos and pictures (ui/app_photos.js),
   edit, add, ▲ ▼ and retire from there, a right-click on a card row
   (ui/app_field.js, part 20); every change through the Reason
   pop-up. Each action hands the engine its input, shows
   refusals, writes the tables the engine returns and redraws through APP.
   No logic beyond that. Classic script (global APP_STEPS); loaded after
   ui/app_flow.js. */
const APP_STEPS = (function () {
  const state = APP.state;
  const $ = APP.el, guard = APP.guard, writeTables = APP.writeTables;
  const ui = () => APP_FLOW.ui();
  const sopId = () => state.view.sop.sop_id;
  const rev = () => state.view.sop.current_rev;
  const refuse = APP_FLOW.refuse, log = APP_FLOW.log, afterRenumber = APP_FLOW.afterRenumber, change = APP_FLOW.change;

  /* ---- the middle and right columns ---- */
  async function draw(v) {
    const u = ui();
    const mid = $('col-c');
    if (!mid) { return; }
    let sv = null;
    if (u.section !== null) {
      log('ui → engine', 'stepsChartView ' + sopId() + ' section ' + u.section);
      sv = APP.lockOn(ENGINE_CHART.stepsChartView({ tables: state.tables, sop_id: sopId(), section: u.section, minimised: APP_NOTES.minimised() }), sopId());   /* build 50 */
      log('engine → ui', 'stepsChartView: ' + sv.steps.length + ' steps, ' + sv.layout.refs.length + ' reference arrows, ' + sv.notes.length + ' notes');
      if (u.step && !sv.steps.some(s => s.key === u.step)) { u.step = null; }
    } else { u.step = null; }
    u.stepsView = sv;
    mid.style.flexBasis = RENDER_FLOW.middleWidth(sv) + 'px';
    mid.innerHTML = RENDER_FLOW.middle(v, sv, u);
    APP_COLS.apply(null);
    $('step-area').innerHTML = '';
    if (!sv) { return; }
    $('btn-sec-edit').onclick = () => guard('ui sectionForm', () => APP_FLOW.openSectionForm(u.section));
    if (!v.locked) {
      $('btn-sec-add-after').onclick = () => guard('ui addSectionForm', () => APP_FLOW.openAddSection(u.section));
      if ($('btn-step-first')) { $('btn-step-first').onclick = () => guard('ui addStep', () => openAddStep('step', null)); }
      $('btn-sec-retire').onclick = () => guard('ui retireSectionForm', () => APP_FLOW.openRetireSection(u.section));
      $('btn-sec-renumber').onclick = () => guard('ui renumber', () => APP_RENUMBER.open(u.section));
    }
    APP_FLOW.wireSvg($('steps-svg'), 'steps', sv);
    paintPicks();
    if (!u.step) { $('step-area').innerHTML = RENDER_FLOW.sectionDetails(sv.section); return; }
    await showCard(u.step);
  }

  /* ---- a step drag (part 8): which gap between two steps the pointer is at, and the drop line there ---- */
  /* slotAt(svg, sv, key, y) → null (its own place) or { after_key, label }; y in chart units */
  function slotAt(svg, sv, key, y) {
    const steps = sv.steps, boxes = sv.layout.boxes, line = svg.querySelector('.drop-line');
    const i = steps.findIndex(s => s.key === key);
    const own = steps[i].step_no + '.';
    let n = 1; while (i + n < steps.length && String(steps[i + n].step_no).indexOf(own) === 0) { n++; }
    let k = steps.filter(s => boxes[s.key].y + boxes[s.key].h / 2 < y).length;
    /* a step never lands between a step and its sub-steps: the gap moves to the end of that block, so the line and the words show where it lands */
    if (String(steps[i].step_no).split('.').length === 2) { while (k > 0 && k < steps.length && String(steps[k].step_no).split('.').length > 2) { k++; } }
    if (k >= i && k <= i + n) { line.setAttribute('visibility', 'hidden'); return null; }
    const ly = k === 0 ? boxes[steps[0].key].y - 7 : boxes[steps[k - 1].key].y + boxes[steps[k - 1].key].h + 7;
    line.setAttribute('y1', ly); line.setAttribute('y2', ly); line.setAttribute('visibility', 'visible');
    return { after_key: k === 0 ? null : steps[k - 1].key, label: 'Move ' + steps[i].step_no + (k < steps.length ? ' above ' + steps[k].step_no : ' to the end of section ' + sv.section.section) };
  }
  function hideDropLine(svg) { const l = svg.querySelector('.drop-line'); if (l) { l.setAttribute('visibility', 'hidden'); } }
  function dropped(key, at) {
    return change(at.label, ctx => ENGINE_CHART.moveStepTo({ tables: state.tables, sop_id: sopId(), key: key, after_key: at.after_key, ctx: ctx }), function (r, ctx) {
      log('ui → engine', 'moveStepTo ' + key + ' after ' + at.after_key);
      ui().step = key;
      return afterRenumber(r, ctx, 'moveStepTo');
    });
  }
  function moveStepDir(direction) {
    const u = ui(), step = u.stepsView.steps.find(s => s.key === u.step);
    return change('Move ' + step.step_no + (direction === 'up' ? ' up' : ' down'), ctx => ENGINE.moveStep({ tables: state.tables, sop_id: sopId(), rev: rev(), key: step.key, direction: direction, ctx: ctx }), function (r, ctx) {
      log('ui → engine', 'moveStep ' + step.key + ' ' + direction);
      return afterRenumber(r, ctx, 'moveStep');
    });
  }

  /* ---- the step card: the Sections tab's card with its links (example.md part 6), Edit and Add from it ---- */
  async function showCard(key) {
    const u = ui(), sv = u.stepsView;
    const sec = ENGINE.sectionView({ tables: state.tables, sop_id: sopId(), rev: rev(), section: u.section });
    const st = sec.steps.find(s => s.key === key);
    if (!st) { throw new Error('ui stepCard: no step ' + key + ' in section ' + u.section); }
    const vnById = {};
    for (const v of state.view.vn.rows) { vnById[v.vn_id] = v; }
    const area = $('step-area');
    area.innerHTML = RENDER_FLOW.stepButtons(sv, u) + RENDER_SECTION.stepCard(st, vnById, sv.locked).replace(/ <button class="btn-split"[^>]*>[^<]*<\/button>/, '');
    if ($('btn-step-up')) {
      $('btn-step-up').onclick = () => guard('ui moveStep', () => moveStepDir('up'));
      $('btn-step-down').onclick = () => guard('ui moveStep', () => moveStepDir('down'));
      $('btn-step-add').onclick = () => guard('ui addStep', () => openAddStep('step', key));
      $('btn-step-sub').onclick = () => guard('ui addStep', () => openAddStep('sub', key));
      $('btn-step-retire').onclick = () => guard('ui retireStepForm', openRetireStep);
    }
    if ($('btn-step-insert')) { $('btn-step-insert').onclick = () => guard('ui insertProcessForm', () => APP_PROC.openInsert(key)); }
    APP_PHOTOS.wire(area, { [st.key]: st.images });
    APP_LISTS.wireGu(area, (r, ctx) => afterRenumber(r, ctx, 'checkGujarati'));
    APP_PHOTOS.wireAdd(area, (r, ctx) => afterRenumber(r, ctx, 'photoRef'));
    APP_PICTURES.wireAdd(area, (r, ctx) => afterRenumber(r, ctx, 'addPicture'));
    for (const b of area.querySelectorAll('.btn-edit')) { b.onclick = () => guard('ui editStepChart', () => openStepForm(key)); }
    for (const b of area.querySelectorAll('.btn-add')) { b.onclick = () => guard('ui addStep', () => openAddStep(b.dataset.kind, b.dataset.after || null)); }
    /* a right-click on a row of the card edits only that row (part 20, build 35) */
    APP_FIELD.wire(area, { lockText: sv.locked ? sv.lock_text : null, cardOf: k => (k === st.key ? st : null), openFull: k => openStepForm(k),
      done: async (r, ctx, k, row) => { await afterRenumber(r, ctx, 'saveStep'); APP_FIELD.reveal(k, row); } });
    /* build 58: the marks of a copy's step (spec/example_edit_online.md part 10) */
    APP_MARKS.draw(area, state.tables, sopId());
  }
  /* the edit form of Builder step 7 replaces the card; Save redraws with the same section and step */
  function openStepForm(key) {
    const step = ui().stepsView.steps.find(s => s.key === key);
    if ($('edit-form') || $('field-form')) { throw new Error('ui editStep: finish or cancel the open edit first'); }
    const card = $('step-' + key);
    /* a step that follows a process SOP as Standard: the note and Make it a Revised copy instead of the form (build 30) */
    if (APP_PROC.openLocked(step, card, (r, ctx) => afterRenumber(r, ctx, 'reviseLinked'))) { return; }
    card.insertAdjacentHTML('beforebegin', RENDER_EDIT.editForm(step, TYPES.tables.steps.fields, SETS, state.view.gauges));
    card.hidden = true;
    $('btn-cancel').onclick = () => { $('edit-' + key).remove(); card.hidden = false; };
    $('btn-save').onclick = () => guard('ui saveStepChart', function () {
      const form = $('edit-form');
      const typed = RENDER_EDIT.readForm(form);
      return change('Save step ' + step.step_no, ctx => ENGINE.saveStep({ tables: state.tables, sop_id: sopId(), rev: rev(), key: key, changes: typed, ctx: ctx }), async function (r, ctx) {
        log('engine → ui', 'saveStep ' + key + ' (steps chart): ' + r.new_history.length + ' History rows');
        await writeTables(r.tables, ctx);
        await APP.showSop(sopId(), 'flow');
      }, refs => RENDER_EDIT.showRefusals(form, refs));
    });
    $('edit-' + key).scrollIntoView({ block: 'nearest' });
  }
  /* add a step or a sub-step after a step: the form opens under the card */
  function openAddStep(kind, afterKey) {
    const u = ui();
    if ($('edit-form') || $('field-form')) { throw new Error('ui addStep: finish or cancel the open edit first'); }
    const a = ENGINE.addStep({ tables: state.tables, sop_id: sopId(), rev: rev(), section: u.section, after_key: afterKey, kind: kind });
    if (a.refusals) { return refuse(a); }
    log('engine → ui', 'addStep: ' + a.draft.step_no + ' ' + a.draft.key + ' (' + a.key_rule + ')');
    $('step-area').insertAdjacentHTML('beforeend', RENDER_EDIT.editForm(a.draft, TYPES.tables.steps.fields, SETS, state.view.gauges, { key_rule: a.key_rule, kind: a.kind, renumbered: a.renumbered }));
    $('btn-cancel').onclick = () => { $('edit-' + a.draft.key).remove(); };
    $('btn-save').onclick = () => guard('ui saveNewStepChart', function () {
      const form = $('edit-form');
      const typed = RENDER_EDIT.readForm(form);
      return change('Add ' + (a.kind === 'sub' ? 'sub-step ' : 'step ') + a.draft.step_no, ctx => ENGINE.saveNewStep({ tables: state.tables, sop_id: sopId(), rev: rev(), draft: a.draft, kind: a.kind,
        key_rule: a.key_rule, after_key: afterKey, changes: typed, ctx: ctx }), function (r, ctx) {
        u.step = a.draft.key;
        return afterRenumber(r, ctx, 'saveNewStep');
      }, refs => RENDER_EDIT.showRefusals(form, refs));
    });
    $('edit-' + a.draft.key).scrollIntoView({ block: 'nearest' });
  }
  function openRetireStep() {
    const u = ui(), step = u.stepsView.steps.find(s => s.key === u.step);
    $('step-area').innerHTML = RENDER_FLOW_FORMS.retireStepForm(step);
    $('btn-rt-cancel').onclick = () => guard('ui showCard', () => showCard(step.key));
    $('btn-rt-retire').onclick = () => guard('ui retireStep', function () {
      return change((String(step.step_no).split('.').length > 2 ? 'Delete sub-step ' : 'Delete step ') + step.step_no, ctx => ENGINE_CHART.retireStep({ tables: state.tables, sop_id: sopId(), key: step.key, ctx: ctx }), function (r, ctx) {
        log('ui → engine', 'retireStep ' + step.key);
        u.step = null;
        return afterRenumber(r, ctx, 'retireStep');
      }, refs => RENDER_EDIT.showRefusals($('retire-step-form'), refs.map(x => (x.field === 'retire' ? Object.assign({}, x, { field: 'form' }) : x))));
    });
  }

  /* ---- picks (part 21.2): Ctrl+click steps of chart C, then right-click a picked one to club them ---- */
  function picks() {
    const u = ui(), sv = u.stepsView;
    u.picks = (Array.isArray(u.picks) ? u.picks : []).filter(k => !!sv && sv.steps.some(s => s.key === k));
    return u.picks;
  }
  /* the picked steps in chart order */
  function pickedRows() { const p = picks(), sv = ui().stepsView; return sv ? sv.steps.filter(s => p.indexOf(s.key) >= 0) : []; }
  function pickedKeys() { return pickedRows().map(s => s.key); }
  function pickedNos() { return pickedRows().map(s => s.step_no); }
  function paintPicks() {
    const svg = $('steps-svg'), p = picks();
    if (svg) { for (const b of svg.querySelectorAll('.fbox.sbox')) { b.classList.toggle('picked', p.indexOf(b.dataset.id) >= 0); } }
    let line = $('pick-line');
    if (!p.length) { if (line) { line.remove(); } return; }
    if (!line) {
      const head = $('col-c') && $('col-c').querySelector('.pane-head');
      if (!head) { return; }
      head.insertAdjacentHTML('afterend', '<p class="pick-line" id="pick-line"></p>');
      line = $('pick-line');
    }
    line.textContent = p.length + ' picked: ' + pickedNos().join(', ') + '. ' + (p.length > 1 ? 'Right-click a picked step to club them. ' : 'Ctrl+click more steps to club them. ') + 'Esc clears.';
  }
  function togglePick(key) {
    const p = picks(), i = p.indexOf(key);
    if (i >= 0) { p.splice(i, 1); } else { p.push(key); }
    log('ui', 'picked: ' + (pickedNos().join(', ') || 'none'));
    paintPicks();
  }
  function clearPicks() { const u = ui(); if (Array.isArray(u.picks) && u.picks.length) { u.picks = []; paintPicks(); } }
  function clubPicked() {
    const u = ui(), rows = pickedRows(), keys = rows.map(s => s.key);
    return change('Club ' + rows.map(s => s.step_no).join(', '), ctx => ENGINE.clubSteps({ tables: state.tables, sop_id: sopId(), rev: rev(), keys: keys, ctx: ctx }), function (r, ctx) {
      log('ui → engine', 'clubSteps ' + keys.join(', '));
      u.picks = []; u.step = keys[0];
      return afterRenumber(r, ctx, 'clubSteps');
    });
  }

  return { draw, slotAt, hideDropLine, dropped, showCard, openStepForm, openAddStep, moveStepDir, openRetireStep, togglePick, clearPicks, pickedKeys, pickedNos, clubPicked };
})();
