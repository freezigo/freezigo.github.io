/* SOP Builder actions: edit, add, club, split, move, give a value, sign,
   walk-through, release, new revision, floor copy. Each one reads the
   form, hands the engine its input (with the time and the next ids from
   the store), shows refusals, writes the tables the engine returns and
   refreshes the screen through APP. No logic beyond that. Classic script
   (global APP_ACTIONS); loaded after ui/app.js. */
const APP_ACTIONS = (function () {
  const state = APP.state;
  const $ = APP.el, main = APP.main, guard = APP.guard, nowIso = APP.nowIso, writeTables = APP.writeTables;
  const showSop = APP.showSop, showTab = APP.showTab, showSection = APP.showSection, refreshSection = APP.refreshSection;

  /* change(what, call, done, onRefusals): one change through the Reason pop-up (example_flow.md part 18.4); call(ctx) → the engine's
     answer, done(r, ctx) writes and redraws; ctxOver adds next ids or flags to the context */
  function change(what, call, done, onRefusals, ctxOver) {
    return APP_REASON.ask(what, async function (reason, dry) {
      const ctx = Object.assign({ who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: reason }, ctxOver ? await ctxOver() : {});
      const r = call(ctx);
      if (r.refusals) { return r.refusals; }
      if (dry) { return null; }
      await done(r, ctx);
      return null;
    }, onRefusals);
  }
  function refusalLine(sel, refusals) {
    const el = $('tab-body').querySelector(sel);
    el.textContent = refusals.map(x => x.message).join(' · ');
  }
  async function sign(role, name, date) {
    const sop = state.view.sop;
    const ctx = { who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: '' };
    console.log('[ui → engine] signRevision ' + role + ' ' + name);
    const r = ENGINE.signRevision({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, sign: { role: role, name: name, date: date }, ctx: ctx });
    if (r.refusals) { console.log('[engine → ui] signRevision refused'); refusalLine('.refusal[data-for="' + role + '"]', r.refusals); return; }
    await writeTables(r.tables, ctx);
    await showSop(sop.sop_id, 'release');
  }
  async function addWalk() {
    const sop = state.view.sop;
    const walk = { date: $('wk-date').value, walked_by: $('wk-walked').value, watched_by: $('wk-watched').value, questions_asked: $('wk-q').value, defects_found: $('wk-defects').value };
    const ctx = { who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), next_val_id: await STORE.nextId('validation_log', 'val_id'), reason: '' };
    console.log('[ui → engine] logWalk');
    const r = ENGINE.logWalk({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, walk: walk, ctx: ctx });
    if (r.refusals) { console.log('[engine → ui] logWalk refused'); refusalLine('.refusal[data-for="walk"]', r.refusals); return; }
    await writeTables(r.tables, ctx);
    await showSop(sop.sop_id, 'release');
  }
  /* release: every failing item ticked as accepted goes to the engine with its reason (spec/example_release.md); build 50
     (example_rights.md part 9.3): then the older PDFs of the SOP move to Final SOPs/Old and the floor copy opens in a new tab with
     Chrome's print window, named as the final PDF */
  async function release() {
    const sop = state.view.sop;
    const accepted = [];
    for (const t of main().querySelectorAll('.acc-tick')) {
      if (t.checked) { accepted.push({ no: Number(t.dataset.no), reason: $('acc-reason-' + t.dataset.no).value }); }
    }
    /* the release is checked first (nothing written), so the tab of the final PDF opens at the click only when the release goes through */
    const dry = ENGINE.releaseRevision({ tables: state.tables, files: state.files, sop_id: sop.sop_id, accepted: accepted,
      ctx: { who: state.editor, now: nowIso(), next_hist_id: 1, next_note_id: 1, reason: '' } });
    if (dry.refusals) { console.log('[engine → ui] releaseRevision refused'); refusalLine('.refusal[data-for="release"]', dry.refusals); return; }
    const w = window.open('', '_blank');
    if (w) { w.document.write('<p style="font-family: Arial, sans-serif">Making the floor copy…</p>'); }
    /* next_note_id: the release of a Process SOP writes notes on the main SOPs that use it (build 31) */
    const ctx = { who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), next_note_id: await STORE.nextId('chart_notes', 'note_id'), reason: '' };
    console.log('[ui → engine] releaseRevision ' + sop.sop_id + ' ' + sop.current_rev);
    const r = ENGINE.releaseRevision({ tables: state.tables, files: state.files, sop_id: sop.sop_id, ctx: ctx, accepted: accepted });
    if (r.refusals) { if (w) { w.close(); } console.log('[engine → ui] releaseRevision refused'); refusalLine('.refusal[data-for="release"]', r.refusals); return; }
    delete state.accepts[sop.sop_id + '|' + sop.current_rev];
    console.log('[engine → ui] releaseRevision: ' + r.summary + (r.sync_report ? ' · into main SOPs: ' + (r.sync_report.join(' | ') || 'none') : ''));
    try { await writeTables(r.tables, ctx); } catch (e) { if (w) { w.close(); } throw e; }
    await showSop(sop.sop_id, 'release');
    const f = APP_FINAL.onFloor(state.view);
    let line = null;
    if (f && w) {
      const moved = await APP_FINAL.save(f, w);
      line = 'Released. The floor copy is open in a new tab: save it as ' + f.name + '.pdf in Final SOPs (Chrome\'s print window, Save as PDF).' +
        (moved.length ? ' Moved to Final SOPs\\Old: ' + moved.join(', ') + '.' : '');
    } else if (f) { line = 'Released. The browser blocked the new tab: allow pop-ups for this page, then click Save the final PDF on the Floor PDF tab.'; }
    else if (w) { w.close(); }
    if (line) { $('tab-body').insertAdjacentHTML('afterbegin', '<div class="given-note final-note" id="final-note">' + RENDER.esc(line) + '</div>'); }
    if (r.sync_report) { $('tab-body').insertAdjacentHTML('afterbegin', RENDER_PROC.syncReport(sop.sop_id + ' ' + sop.current_rev, r.sync_report)); }
  }
  /* the floor copy: engine.floorView → RENDER_FLOOR.page → a new tab; rev = the revision on the floor while a draft sits over it
     (example_release.md part 8.1), else null for the current revision */
  async function floorHtml(rev, opts) {
    const sop = state.view.sop, which = rev || sop.current_rev;
    console.log('[ui → engine] floorView ' + sop.sop_id + ' ' + which);
    const v = ENGINE.floorView({ tables: state.tables, sop_id: sop.sop_id, rev: which, made_on: nowIso().slice(0, 16).replace('T', ' ') });
    console.log('[engine → ui] floorView: ' + v.sections.length + ' sections');
    const urls = {};
    if (STORE.canReadFiles()) {   /* the folder, or the file store online (build 52) */
      for (const sec of v.sections) {
        for (const st of sec.steps) {
          for (const id of st.picture_ids) {
            const p = v.pictures.find(x => x.picture_id === id);
            if (p && urls[p.file] === undefined) { urls[p.file] = await STORE.fileDataURL(p.file); }
          }
          if (st.photo && urls[st.photo] === undefined) {
            const rel = CONFIG.photos_dir + '/' + st.photo;
            urls[st.photo] = (await STORE.fileExists(rel)) ? await STORE.fileDataURL(rel) : null;
          }
        }
      }
    }
    const flow = ENGINE_CHART.flowView({ tables: state.tables, sop_id: sop.sop_id, rev: which, compact: true });
    console.log('[engine → ui] flowView for page 1: ' + (flow.has_needs ? 'chart printed' : 'no Needs, no chart'));
    return RENDER_FLOOR.page(v, urls, flow, opts || null);
  }
  async function openFloorCopy(rev) {
    const html = await floorHtml(rev || null);
    const w = window.open('', '_blank');
    if (!w) { throw new Error('ui floorCopy: the browser blocked the new tab. Allow pop-ups for this page and click again.'); }
    w.document.open(); w.document.write(html); w.document.close();
    console.log('[ui] floor copy opened: ' + html.length + ' characters');
  }
  function compareNow(against) {
    const sop = state.view.sop;
    /* build 39: a copy compares with its good version */
    if (state.view.copy) {
      /* build 50 (example_rights.md part 6.6): against the good version (empty) or another copy of the same SOP */
      console.log('[ui → engine] compareCopy ' + sop.sop_id + (against ? ' against ' + against : ''));
      const cc = ENGINE.compareCopy({ tables: state.tables, sop_id: sop.sop_id, against: against || null });
      console.log('[engine → ui] compareCopy: ' + cc.rows.length + ' rows, ' + cc.counts.changed + ' changed');
      return cc;
    }
    console.log('[ui → engine] compare ' + sop.sop_id + ' ' + sop.current_rev + (against ? ' against ' + against : ''));
    const cmp = ENGINE.compare({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, against: against || null });
    console.log('[engine → ui] compare: ' + cmp.rows.length + ' rows' + (cmp.counts ? ', ' + cmp.counts.changed + ' changed' : ''));
    return cmp;
  }
  async function newRevision() {
    const sop = state.view.sop;
    const ctx = { who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), next_rh_id: await STORE.nextId('revision_history', 'rh_id'), reason: '' };
    console.log('[ui → engine] newRevision ' + sop.sop_id + ' from ' + sop.current_rev);
    const r = ENGINE.newRevision({ tables: state.tables, sop_id: sop.sop_id, ctx: ctx, note: $('nr-note').value });
    if (r.refusals) {
      console.log('[engine → ui] newRevision refused: ' + r.refusals.map(x => x.message).join('; '));
      RENDER_EDIT.showRefusals($('tab-body').querySelector('.new-rev'), r.refusals);
      return;
    }
    console.log('[engine → ui] newRevision: ' + r.rev + ', ' + r.new_history.length + ' History rows');
    await writeTables(r.tables, ctx);
    state.compareAgainst = null;
    await showSop(sop.sop_id, 'compare');
  }

  /* give a Values Needed value: the form under the row; Save = engine.giveValue, values_needed and history written */
  async function showGive(vnId) {
    const vn = state.view.vn.rows.find(v => v.vn_id === vnId);
    if (!vn) { throw new Error('ui showGive: no Values Needed row ' + vnId); }
    for (const slot of main().querySelectorAll('.give-slot')) { slot.innerHTML = ''; }
    $('give-' + vnId).innerHTML = RENDER_TABS.giveForm(vn, nowIso().slice(0, 10), state.editor);
    $('btn-give-save').onclick = function () { guard('ui saveGive', function () { return saveGive(vnId); }); };
    $('btn-give-cancel').onclick = function () { $('give-' + vnId).innerHTML = ''; };
  }
  function saveGive(vnId) {
    const given = { value: $('g-value').value, date_given: $('g-date').value, sign: $('g-sign').value };
    const vn = state.view.vn.rows.find(v => v.vn_id === vnId);
    return change('Give value No. ' + (vn ? vn.no : vnId), ctx => ENGINE.giveValue({ tables: state.tables, vn_id: vnId, given: given, ctx: ctx }), async function (r, ctx) {
      console.log('[engine → ui] giveValue ' + vnId + ': ' + r.new_history.length + ' History rows; links ' + r.links.scope);
      await writeTables(r.tables, ctx);
      const byKey = {};
      for (const s of state.tables.steps) { byKey[s.key] = s; }
      state.givenNote = RENDER_TABS.givenNote(vnId, r.links, byKey);
      await showSop(state.view.sop.sop_id, 'vn');
    }, refs => RENDER_EDIT.showRefusals($('give-' + vnId), refs));
  }
  function wireGotoSteps(root) {
    for (const a of root.querySelectorAll('.goto-step')) {
      a.onclick = function (e) {
        e.preventDefault();
        guard('ui gotoStep', async function () {
          await showTab('sections');
          await showSection(Number(a.dataset.section));
          await showEdit(a.dataset.key);
        });
      };
    }
  }

  /* edit a step: the form replaces the card; Save = engine.saveStep, then the four tables are written */
  async function showEdit(key) {
    const sop = state.view.sop;
    const step = state.tables.steps.find(s => s.key === key && s.sop_id === sop.sop_id && s.rev === sop.current_rev);
    if (!step) { throw new Error('ui showEdit: no step ' + key + ' in ' + sop.sop_id + ' ' + sop.current_rev); }
    if ($('edit-form') || $('field-form')) { throw new Error('ui showEdit: finish or cancel the open edit first'); }
    const card = $('step-' + key);
    /* a step that follows a process SOP as Standard: the note and Make it a Revised copy instead of the form (build 30) */
    if (APP_PROC.openLocked(step, card, async function (r, ctx) {
      await writeTables(r.tables, ctx);
      const section = state.section;
      await showSop(sop.sop_id, 'sections');
      await showSection(section);
    })) { return; }
    card.insertAdjacentHTML('beforebegin', RENDER_EDIT.editForm(step, TYPES.tables.steps.fields, SETS, state.view.gauges));
    card.hidden = true;
    $('btn-save').onclick = function () { guard('ui saveEdit', function () { return saveEdit(key); }); };
    $('btn-cancel').onclick = function () { guard('ui cancelEdit', function () { $('edit-' + key).remove(); card.hidden = false; }); };
    $('edit-' + key).scrollIntoView();
  }
  function saveEdit(key) {
    const sop = state.view.sop;
    const form = $('edit-form');
    const typed = RENDER_EDIT.readForm(form);
    const step = state.tables.steps.find(s => s.key === key && s.sop_id === sop.sop_id && s.rev === sop.current_rev);
    return change('Save step ' + step.step_no, ctx => ENGINE.saveStep({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, key: key, changes: typed, ctx: ctx }), async function (r, ctx) {
      console.log('[engine → ui] saveStep ' + key + ' by ' + ctx.who + ': ' + r.new_history.length + ' History rows, ' + r.changed_keys.length + ' steps renumbered');
      await writeTables(r.tables, ctx);
      const section = state.section;
      await showSop(sop.sop_id, 'sections');
      await showSection(section);
      const card = $('step-' + key);
      if (card) { card.scrollIntoView(); }
    }, refs => { console.log('[engine → ui] saveStep refused: ' + refs.map(x => x.field + ': ' + x.message).join('; ')); RENDER_EDIT.showRefusals(form, refs); });
  }

  /* add a step: the engine makes a draft (number and key), the form opens on it; Save = engine.saveNewStep */
  async function showAdd(section, afterKey, kind) {
    const sop = state.view.sop;
    if ($('edit-form') || $('field-form')) { throw new Error('ui showAdd: finish or cancel the open edit first'); }
    console.log('[ui → engine] addStep section ' + section + ' kind ' + kind + (afterKey ? ' after ' + afterKey : ' at the start'));
    const a = ENGINE.addStep({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, section: section, after_key: afterKey, kind: kind });
    if (a.refusals) {
      console.log('[engine → ui] addStep refused: ' + a.refusals.map(x => x.message).join('; '));
      const slot = afterKey ? $('split-' + afterKey) : null;
      if (slot) { slot.innerHTML = '<div class="refusal add-refusal">' + RENDER.esc(a.refusals.map(x => x.message).join(' · ')) + '</div>'; }
      return;
    }
    console.log('[engine → ui] addStep: ' + a.draft.step_no + ' ' + a.draft.key + ' (' + a.key_rule + '), renumbered ' + a.renumbered.length);
    const html = RENDER_EDIT.editForm(a.draft, TYPES.tables.steps.fields, SETS, state.view.gauges, { key_rule: a.key_rule, kind: a.kind, renumbered: a.renumbered });
    const anchor = afterKey ? $('step-' + afterKey) : $('section-view').querySelector('table.grid.steps');
    anchor.insertAdjacentHTML(afterKey ? 'afterend' : 'beforebegin', html);
    $('btn-save').onclick = function () { guard('ui saveAdd', function () { return saveAdd(a, afterKey); }); };
    $('btn-cancel').onclick = function () { guard('ui cancelAdd', function () { $('edit-' + a.draft.key).remove(); }); };
    $('edit-' + a.draft.key).scrollIntoView();
  }
  function saveAdd(a, afterKey) {
    const sop = state.view.sop;
    const form = $('edit-form');
    const typed = RENDER_EDIT.readForm(form);
    return change('Add ' + (a.kind === 'sub' ? 'sub-step ' : 'step ') + a.draft.step_no, ctx => ENGINE.saveNewStep({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, draft: a.draft, kind: a.kind,
      key_rule: a.key_rule, after_key: afterKey, changes: typed, ctx: ctx }), async function (r, ctx) {
      console.log('[engine → ui] saveNewStep ' + a.draft.key + ': ' + r.new_history.length + ' History rows, ' + r.changed_keys.length + ' steps renumbered');
      await writeTables(r.tables, ctx);
      const section = state.section;
      await showSop(sop.sop_id, 'sections');
      await showSection(section);
      const card = $('step-' + a.draft.key);
      if (card) { card.scrollIntoView(); }
    }, refs => RENDER_EDIT.showRefusals(form, refs));
  }

  /* club the ticked steps: engine.clubSteps, then the tables are written */
  const clubRefusal = refs => { console.log('[engine → ui] refused: ' + refs.map(x => x.message).join('; ')); $('club-refusal').textContent = refs.map(x => x.message).join(' · '); };
  function clubTicked() {
    const sop = state.view.sop;
    const keys = Array.from($('section-view').querySelectorAll('.club-tick:checked')).map(x => x.dataset.key);
    const nos = keys.map(k => (state.sectionSteps.find(s => s.key === k) || { step_no: k }).step_no);
    const screen = $('club-screen').checked;
    return change('Club ' + nos.join(', '), ctx => ENGINE.clubSteps({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, keys: keys, ctx: ctx }), async function (r, ctx) {
      console.log('[engine → ui] clubSteps ' + keys.join(', ') + ': ' + r.tables.steps.length + ' steps, ' + r.new_history.length + ' History rows');
      await writeTables(r.tables, ctx);
      await refreshSection(keys[0]);
    }, clubRefusal, () => ({ screen_settings: screen }));
  }
  /* move a step up or down inside its section: engine.moveStep, then the tables are written */
  function moveStep(key, direction) {
    const sop = state.view.sop;
    const st = state.sectionSteps.find(s => s.key === key);
    return change('Move ' + (st ? st.step_no : key) + (direction === 'up' ? ' up' : ' down'), ctx => ENGINE.moveStep({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, key: key, direction: direction, ctx: ctx }),
      async function (r, ctx) {
        console.log('[engine → ui] moveStep ' + key + ' ' + direction + ': ' + r.changed_keys.length + ' steps renumbered');
        await writeTables(r.tables, ctx);
        await refreshSection(key);
      }, clubRefusal);
  }
  async function showSplit(key) {
    const st = state.sectionSteps.find(s => s.key === key);
    if (!st) { throw new Error('ui showSplit: no step ' + key + ' in the section view'); }
    $('split-' + key).innerHTML = RENDER_SECTION.splitForm(st);
    $('btn-split-now').onclick = function () { guard('ui splitNow', function () { return splitNow(key); }); };
    $('btn-split-cancel').onclick = function () { $('split-' + key).innerHTML = ''; };
  }
  function splitNow(key) {
    const sop = state.view.sop;
    const sel = $('split-part');
    const part = sel ? (sel.value === '' ? null : Number(sel.value)) : null;
    const kind = $('split-kind') ? $('split-kind').value : 'sub';
    const st = state.sectionSteps.find(s => s.key === key);
    return change('Split ' + (st ? st.step_no : key), ctx => ENGINE.splitStep({ tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, key: key, reading_part: part, kind: kind, ctx: ctx }),
      async function (r, ctx) {
        console.log('[engine → ui] splitStep ' + key + ': new keys ' + r.new_keys.map(k => k.key + ' (' + k.rule + ')').join(', '));
        await writeTables(r.tables, ctx);
        await refreshSection(key);
      }, refs => { $('split-refusal').textContent = refs.map(x => x.message).join(' · '); });
  }

  return { refusalLine, sign, addWalk, release, floorHtml, openFloorCopy, compareNow, newRevision, showGive, saveGive, wireGotoSteps,
    showEdit, saveEdit, showAdd, saveAdd, clubTicked, moveStep, showSplit, splitNow };
})();
