/* SOP Builder New SOP wiring. Blank (example_new_sop.md parts 4 to 6):
   take the SOP ID, ask the Reason (pop-up), hand the engine the blank
   start, write the tables, open the new SOP's Flow tab with the report.
   From a chart (example_flow.md parts 9 and 10): read the chart file the
   editor picks, show the groups and the plan, take the SOP ID, ask the
   Reason, hand the engine the kickstart, write the tables, copy the file
   under source\chart with a manifest line, open the new SOP's Flow tab
   with the report. Build 50 (spec/example_rights.md part 8): a new SOP is
   written through a copy too: after the start, the starter's own copy
   "First draft" is saved and its Flow tab opens. Build 60
   (spec/example_draft_file.md part 6): from a draft file: read the file
   the editor picks, show what the reader found, ask the Reason, hand the
   engine the import, write the tables; a new SOP or an SOP on the list
   opens its "First draft" on the Flow tab, a copy of an SOP that has a
   revision opens on its Compare tab. Classic script (global APP_KICK). */
const APP_KICK = (function () {
  const state = APP.state;
  const $ = APP.el, main = APP.main, guard = APP.guard, nowIso = APP.nowIso, writeTables = APP.writeTables;
  const kick = () => (state.kick = state.kick || { type: 'main', proc: {}, start: 'blank', chart: null, text: null, file_name: null, groups: null, group: null, unticked: [], plan: null, sop_choice: 'list', sop_id: null,
    new_sop: {}, reason: '', kept: null, draft: null, draft_name: null, read: null, copy_name: '' });

  function listed() { return state.sopListRows.filter(r => !r.current_rev); }
  /* firstDraft(sopId) → the SOP to open after a start: the starter's copy "First draft" (build 50), or the SOP itself in the test seam
     rightsMode 'open' */
  const FIRST_DRAFT = 'First draft';
  async function firstDraft(sopId) {
    if (state.rightsMode === 'open') { return sopId; }
    const ctx = { who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), next_note_id: await STORE.nextId('chart_notes', 'note_id'), reason: '' };
    const r = ENGINE.saveCopy({ tables: state.tables, sop_id: sopId, name: FIRST_DRAFT, ctx: ctx });
    if (r.refusals) { console.log('[engine → ui] saveCopy First draft refused: ' + r.refusals.map(x => x.message).join('; ')); return sopId; }
    console.log('[engine → ui] saveCopy ' + FIRST_DRAFT + ' of ' + sopId + ': ' + r.sop_id);
    await writeTables(r.tables, ctx);
    return r.sop_id;
  }
  const draftLine = (sopId, openId) => (openId === sopId ? '' : ' Your copy ' + FIRST_DRAFT + ' is open: write the SOP here, then Make this the good version (Header tab).');
  function draw() {
    const old = $('kick-card');
    const html = RENDER_KICK.card(kick(), listed(), SETS.level);
    if (old) { old.outerHTML = html; } else { main().insertAdjacentHTML('beforeend', html); }
    wire();
  }
  function replan() {
    const k = kick();
    const sopId = k.sop_choice === 'new' ? null : k.sop_id;
    const sop = sopId ? state.tables.sops.find(s => s.sop_id === sopId) : null;
    k.kept = sop ? [['title', 'title'], ['level', 'level'], ['product', 'product'], ['who_does_it', 'who does it'], ['input_from', 'input from'], ['output_to', 'output to']].filter(f => sop[f[0]]).map(f => f[1]).join(', ') : null;
    if (k.start !== 'chart' || !k.chart || k.group === null) { k.plan = null; return; }
    console.log('[ui → engine] chartPlan ' + (k.group || 'no group') + (sopId ? ' for ' + sopId : ''));
    k.plan = ENGINE_CHART.chartPlan({ tables: state.tables, chart: k.chart, group: k.group, unticked: k.unticked, sop_id: sopId, new_sop_id: k.new_sop.sop_id || null });
  }
  function readProcess() {
    const k = kick();
    if (k.type !== 'process' || !$('kp-code')) { return; }
    k.proc = { code: $('kp-code').value, name: $('kp-name').value, product: $('kp-product').value };
  }
  function readNewSop() {
    const k = kick();
    readProcess();
    if (k.sop_choice !== 'new' || !$('kn-id')) { return; }
    const serial = document.querySelector('input[name="kn-serial"]:checked');
    k.new_sop = { sop_id: $('kn-id').value.trim(), level: $('kn-level').value, product: $('kn-product').value, title: $('kn-title').value, output_serial_tracked: serial ? serial.value === 'Y' : null };
  }
  function wire() {
    const k = kick();
    for (const radio of document.querySelectorAll('input[name="kick-type"]')) {
      radio.onchange = e => guard('ui kickType', () => { readNewSop(); k.type = e.target.value; replan(); draw(); });
    }
    for (const radio of document.querySelectorAll('input[name="kick-start"]')) {
      radio.onchange = e => guard('ui kickStart', () => { readNewSop(); k.start = e.target.value; replan(); draw(); });
    }
    if ($('btn-blank-make')) { $('btn-blank-make').onclick = () => guard('ui startBlank', makeBlank); }
    if ($('kick-draft')) { wireDraft(k); return; }
    if (!$('kick-file')) { wireSop(k); return; }
    $('kick-file').onchange = e => {
      const f = e.target.files[0];
      if (!f) { return; }
      const r = new FileReader();
      r.onload = () => guard('ui kickFile', () => readChart(f.name, r.result));
      r.onerror = () => { throw new Error('ui kickFile: ' + f.name + ' cannot be read'); };
      r.readAsText(f);
    };
    for (const radio of document.querySelectorAll('input[name="kick-group"]')) {
      radio.onchange = e => guard('ui kickGroup', () => { k.group = e.target.value; k.unticked = []; replan(); draw(); });
    }
    for (const tick of document.querySelectorAll('.kick-use')) {
      tick.onchange = e => guard('ui kickTick', () => { k.unticked = k.unticked.filter(x => x !== e.target.dataset.id).concat(e.target.checked ? [] : [e.target.dataset.id]); replan(); draw(); });
    }
    wireSop(k);
    if ($('btn-kick-make')) { $('btn-kick-make').onclick = () => guard('ui kickstart', make); }
  }
  /* the SOP ID part, the same in both starts */
  function wireSop(k) {
    for (const radio of document.querySelectorAll('input[name="kick-sop"]')) {
      radio.onchange = e => guard('ui kickSopChoice', () => { readNewSop(); k.sop_choice = e.target.value; replan(); draw(); });
    }
    if ($('kick-sop-id')) { $('kick-sop-id').onchange = e => guard('ui kickSop', () => { k.sop_id = e.target.value || null; k.sop_choice = 'list'; replan(); draw(); }); }
  }
  /* ---- build 60: a draft file (spec/example_draft_file.md part 6) ---- */
  function wireDraft(k) {
    $('kick-draft').onchange = e => {
      const f = e.target.files[0];
      if (!f) { return; }
      const r = new FileReader();
      r.onload = () => guard('ui readDraft', () => readDraftFile(f.name, r.result));
      r.onerror = () => { throw new Error('ui readDraft: ' + f.name + ' cannot be read'); };
      r.readAsText(f);
    };
    if ($('kd-name')) { $('kd-name').oninput = e => { k.copy_name = e.target.value; }; }
    if ($('btn-draft-make')) { $('btn-draft-make').onclick = () => guard('ui importDraft', bringDraft); }
  }
  /* readDraftFile(name, text): the reader's checks; nothing is written */
  function readDraftFile(name, text) {
    const k = kick();
    let draft = null;
    try { draft = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (e) { draft = null; }
    k.draft = draft; k.draft_name = name; k.copy_name = '';
    k.read = draft === null ? { refusals: [{ field: 'file', message: 'Not a draft file: ' + name + ' is not a JSON file.' }] } : ENGINE_DRAFT.readDraft(draft, state.tables);
    console.log('[engine → ui] readDraft ' + name + ': ' + (k.read.refusals ? k.read.refusals.length + ' refusals' : k.read.line + '; ' + k.read.warnings.length + ' warnings; ' + k.read.target.kind));
    draw();
  }
  /* Bring it in: checked first, then the Reason pop-up; a new SOP or an SOP on the list: Rev 01, then the starter's First draft; an SOP
     with a revision: the starter's own copy, on its Compare tab */
  function bringDraft() {
    const k = kick();
    if (!k.draft || !k.read || k.read.refusals) { return null; }
    const id = k.read.target.sop_id;
    return APP_REASON.ask('Bring in the draft file of ' + id, async function (reason, dry) {
      const ctx = { who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), next_rh_id: await STORE.nextId('revision_history', 'rh_id'),
        next_vn_no: await STORE.nextId('values_needed', 'no'), next_note_id: await STORE.nextId('chart_notes', 'note_id'), reason: reason };
      const r = ENGINE_DRAFT.importDraft({ tables: state.tables, draft: k.draft, ctx: ctx, copy_name: String(k.copy_name || '').trim() || null });
      if (r.refusals) { return r.refusals; }
      if (dry) { return null; }
      console.log('[engine → ui] importDraft ' + r.kind + ' ' + r.sop_id + ': ' + r.new_history.length + ' History rows');
      await writeTables(r.tables, ctx);
      const openId = r.kind === 'copy' ? r.sop_id : await firstDraft(r.sop_id);
      state.kickReport = r.report.join(' ') + (r.kind === 'copy' ? ' Your copy is open: the Compare tab shows every difference from ' + id + '.' : draftLine(r.sop_id, openId));
      state.kick = null;
      await APP.showSop(openId, r.kind === 'copy' ? 'compare' : 'flow');
      return null;
    }, refs => { console.log('[engine → ui] importDraft refused: ' + refs.map(x => x.message).join('; ')); RENDER_EDIT.showRefusals($('kick-card'), refs); });
  }
  function readChart(name, text) {
    const k = kick();
    let chart;
    try { chart = JSON.parse(text); } catch (e) { chart = { nodes: [] }; }
    const g = ENGINE_CHART.chartGroups(chart);
    if (g.refusals) { k.chart = null; k.groups = null; k.plan = null; draw(); RENDER_EDIT.showRefusals($('kick-card'), g.refusals); return; }
    console.log('[engine → ui] chartGroups: ' + g.boxes + ' boxes, ' + g.groups.length + ' groups');
    k.chart = chart; k.text = text; k.file_name = name; k.groups = g; k.group = null; k.unticked = []; k.plan = null;
    draw();
  }
  /* Make the SOP: checked first, then the Reason pop-up (example_flow.md part 18.4) */
  function make() {
    const k = kick();
    readNewSop();
    const target = k.sop_choice === 'new' ? (String(k.new_sop.sop_id || '').trim().toUpperCase() || '(new SOP)') : (k.sop_id || '(no SOP picked)');
    return APP_REASON.ask('New SOP ' + target + ' from a chart', async function (reason, dry) {
      const ctx = { who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), next_rh_id: await STORE.nextId('revision_history', 'rh_id'),
        next_routing_no: await STORE.nextId('routing', 'no'), next_vn_no: await STORE.nextId('values_needed', 'no'), reason: reason };
      const r = ENGINE_CHART.kickstart({ tables: state.tables, chart: k.chart, file_name: k.file_name, group: k.group, unticked: k.unticked,
        sop_id: k.sop_choice === 'new' ? null : k.sop_id, new_sop: k.sop_choice === 'new' ? k.new_sop : null, ctx: ctx });
      if (r.refusals) { return r.refusals; }
      if (dry) { return null; }
      console.log('[engine → ui] kickstart ' + (k.group || 'no group') + ': ' + r.sop_id + ', ' + r.new_history.length + ' History rows');
      await writeTables(r.tables, ctx);
      console.log('[ui → store] copyChart ' + k.file_name);
      const copied = await STORE.copyChart(k.file_name, k.text, k.chart.name || '', ctx.now, ctx.who);
      console.log('[store → ui] ' + copied);
      const openId = await firstDraft(r.sop_id);
      state.kickReport = r.report + draftLine(r.sop_id, openId);
      state.kick = null;
      await APP.showSop(openId, 'flow');
      return null;
    }, refs => { console.log('[engine → ui] kickstart refused: ' + refs.map(x => x.message).join('; ')); RENDER_EDIT.showRefusals($('kick-card'), refs); });
  }
  /* Start the blank SOP: checked first, then the Reason pop-up (example_new_sop.md part 4) */
  function makeBlank() {
    const k = kick();
    readNewSop();
    if (k.type === 'process') {
      const code = String(k.proc.code || '').trim().toUpperCase();
      return startBlank(code || '(new Process SOP)', null, { sop_type: 'Process', sop_id: k.proc.code, title: k.proc.name, product: k.proc.product },
        refs => RENDER_EDIT.showRefusals($('kick-card'), refs));
    }
    const target = k.sop_choice === 'new' ? (String(k.new_sop.sop_id || '').trim().toUpperCase() || '(new SOP)') : (k.sop_id || '(no SOP picked)');
    return startBlank(target, k.sop_choice === 'new' ? null : k.sop_id, k.sop_choice === 'new' ? k.new_sop : null, refs => RENDER_EDIT.showRefusals($('kick-card'), refs));
  }
  /* startBlank(target, sopId, newSop, onRefusals): the engine's blank start through the Reason pop-up; writes the tables and opens
     the new SOP's Flow tab with the report (parts 5 and 6) */
  function startBlank(target, sopId, newSop, onRefusals) {
    return APP_REASON.ask('Start ' + target + ' blank', async function (reason, dry) {
      const ctx = { who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), next_rh_id: await STORE.nextId('revision_history', 'rh_id'), reason: reason };
      const r = ENGINE_CHART.startBlank({ tables: state.tables, sop_id: sopId, new_sop: newSop, ctx: ctx });
      if (r.refusals) { return r.refusals; }
      if (dry) { return null; }
      console.log('[engine → ui] startBlank ' + r.sop_id + ': ' + r.new_history.length + ' History rows');
      await writeTables(r.tables, ctx);
      const openId = await firstDraft(r.sop_id);
      state.kickReport = r.report + draftLine(r.sop_id, openId);
      state.kick = null;
      await APP.showSop(openId, 'flow');
      return null;
    }, refs => { console.log('[engine → ui] startBlank refused: ' + refs.map(x => x.message).join('; ')); onRefusals(refs); });
  }
  return { draw };
})();
