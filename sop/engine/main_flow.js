/* SOP Builder main engine for the Flow tab (example_flow.md): composes the
   chart, section, kickstart and note pieces into what the screens show and
   the tables to write. No logic of its own beyond choosing rows. Classic
   script (global ENGINE_CHART); module in Node. Checked by the page check
   and tests/flow_check.js. */
const ENGINE_CHART = (function () {
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const R = (typeof ENGINE_RELEASE !== 'undefined') ? ENGINE_RELEASE : require('./release.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const NU = (typeof ENGINE_NUMBER !== 'undefined') ? ENGINE_NUMBER : require('./number.js');
  const NO = (typeof ENGINE_NOTES !== 'undefined') ? ENGINE_NOTES : require('./notes.js');
  const FL = (typeof ENGINE_FLOW !== 'undefined') ? ENGINE_FLOW : require('./flow.js');
  const FA = (typeof ENGINE_FACTS !== 'undefined') ? ENGINE_FACTS : require('./flow_facts.js');
  const SC = (typeof ENGINE_SECTIONS !== 'undefined') ? ENGINE_SECTIONS : require('./sections.js');
  const KS = (typeof ENGINE_KICK !== 'undefined') ? ENGINE_KICK : require('./kickstart.js');
  const MAIN = (typeof ENGINE !== 'undefined') ? ENGINE : require('./main.js');
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const ST = (typeof ENGINE_STALE !== 'undefined') ? ENGINE_STALE : require('./stale.js');
  const P = (typeof ENGINE_PROCESS !== 'undefined') ? ENGINE_PROCESS : require('./process.js');
  const LI = (typeof ENGINE_LISTS !== 'undefined') ? ENGINE_LISTS : require('./lists.js');
  const PH = (typeof ENGINE_PHOTOS !== 'undefined') ? ENGINE_PHOTOS : require('./photos.js');
  const PI = (typeof ENGINE_PICTURES !== 'undefined') ? ENGINE_PICTURES : require('./pictures.js');
  /* the view's copy of a step with the Pictures it names, for the picture frame (part 18.5); never written back */
  const withPictures = (t, steps) => steps.map(s => Object.assign({}, s, { picture_ids: T.pictureRefs(s, t.pictures || []) }));
  const live = notes => notes.filter(n => n.status !== 'Deleted');
  function need(input, names, place) {
    for (const n of names) { if (input[n] === undefined) { throw new Error('engine.' + place + ': input needs ' + names.join(', ') + ' (' + n + ' missing)'); } }
    if (!Array.isArray(input.tables.chart_notes)) { throw new Error('engine.' + place + ': table chart_notes is missing'); }
  }
  /* the current revision of an SOP (or the revision named, for the floor copy of the revision on the floor, build 36), and whether it is locked */
  function current(t, sopId, place, revName) {
    const sop = SEL.sopOf(t, sopId);
    if (!sop.current_rev) { throw new Error('engine.' + place + ': ' + sopId + ' has no revision'); }
    const rev = SEL.revisionOf(t, sopId, revName || sop.current_rev);
    const lockText = R.lockText(rev);
    return { sop: sop, rev: rev, locked: lockText !== null, lockText: lockText };
  }
  const lockedRefusal = c => ({ refusals: [{ field: 'form', message: c.lockText }] });
  /* an SOP change: Checked or Approved back to Draft, Edited in Builder, with History rows after the given ones */
  function sopChanged(t, c, history, ctx) {
    const newRev = R.revisionAfterEdit(c.rev);
    let hist = E.historyRows({ table: 'sop_revisions', row_id: c.sop.sop_id + ' ' + c.rev.rev, sop_id: c.sop.sop_id, rev: c.rev.rev, old: c.rev, new: newRev, fields: ['status', 'checked_date', 'approved_date'], ctx: ctx, after: history });
    const newSop = Object.assign({}, c.sop, { edited_in: 'Builder' });
    hist = E.historyRows({ table: 'sops', row_id: c.sop.sop_id, sop_id: c.sop.sop_id, rev: null, old: c.sop, new: newSop, fields: ['edited_in'], ctx: ctx, after: hist });
    return { sop_revisions: SEL.mergeRows(t.sop_revisions, [newRev], ['sop_id', 'rev']), sops: SEL.mergeRows(t.sops, [newSop], ['sop_id']), history: t.history.concat(hist), hist: hist };
  }
  const others = (rows, c) => rows.filter(r => !(r.sop_id === c.sop.sop_id && r.rev === c.rev.rev));

  /* flowView({ tables, sop_id, rev, compact, boxes, minimised }) → chart B with its notes, the tile numbers and the cards of sections 1 and 2;
     rev = another revision than the current one (the floor copy of the revision on the floor, build 36), else the current one;
     compact = the floor page layout (example_flow.md part 11); boxes = 'short' or 'full' (part 16.2; 'full' when not given);
     minimised = the note ids this browser folds into tags (part 18.3). Deleted notes are left out. */
  function flowView(input) {
    need(input, ['tables', 'sop_id'], 'flowView');
    const t = input.tables, c = current(t, input.sop_id, 'flowView', input.rev || null);
    const sections = SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev), steps = withPictures(t, SEL.stepsOf(t, c.sop.sop_id, c.rev.rev));
    const boxes = input.boxes === 'short' ? 'short' : 'full';
    const layout = FL.layoutGraph(sections, steps, t.values_needed, c.sop, { compact: !!input.compact, boxes: boxes });
    const rowsOf = name => (Array.isArray(t[name]) ? SEL.rowsOf(t, name, c.sop.sop_id, c.rev.rev) : []);
    const notes = live(t.chart_notes.filter(n => n.sop_id === c.sop.sop_id && n.rev === c.rev.rev));
    const shown = notes.filter(n => n.chart === 'sections' && !(n.pin === 'free' && (n.x === null || n.y === null)));
    const list = v => (Array.isArray(v) ? v : []);
    return { sop: c.sop, rev: c.rev, locked: c.locked, lock_text: c.lockText, sections: sections, layout: layout,
      notes: shown, note_layout: layout.error ? { notes: {}, width: 0, height: 0 } : FL.noteLayout(layout, shown, input.minimised || []),
      loose_notes: notes.filter(n => n.pin === 'free' && (n.x === null || n.y === null)),
      has_needs: sections.some(x => list(x.needs_sections).length > 0 || list(x.needs_sops).length > 0),
      setup_section: FL.setupSection(sections),
      count: NO.notesCount(t.chart_notes, c.sop.sop_id, c.rev.rev, 'sections', null), sop_ids: t.sops.map(s => s.sop_id).sort(),
      boxes: boxes, stats: FA.flowStats(sections, steps), before: FA.beforeStart(rowsOf('safety_items'), rowsOf('materials'), rowsOf('tools')) };
  }
  /* stepsChartView({ tables, sop_id, section, minimised }) → chart C with its notes (Deleted ones left out) */
  function stepsChartView(input) {
    need(input, ['tables', 'sop_id', 'section'], 'stepsChartView');
    const t = input.tables, c = current(t, input.sop_id, 'stepsChartView');
    const sec = SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev).find(s => s.section === input.section);
    if (!sec) { throw new Error('engine.stepsChartView: no section ' + input.section); }
    const steps = withPictures(t, SEL.stepsInSection(SEL.stepsOf(t, c.sop.sop_id, c.rev.rev), input.section));
    const layout = FL.layoutSteps(steps);
    const notes = live(t.chart_notes.filter(n => n.sop_id === c.sop.sop_id && n.rev === c.rev.rev && n.chart === 'steps' && n.section === input.section));
    const arrows = layout.chain.concat(layout.refs).map(a => Object.assign({ id: a.from + '>' + a.to }, a, a.lx === undefined ? { lx: a.mx !== undefined ? a.mx : a.x1, ly: a.my !== undefined ? a.my : a.y1 } : {}));
    return { sop: c.sop, rev: c.rev, locked: c.locked, lock_text: c.lockText, section: sec, steps: steps, layout: layout,
      notes: notes, note_layout: FL.noteLayout({ width: layout.width, height: layout.height, boxes: layout.boxes, arrows: arrows }, notes, input.minimised || []),
      count: NO.notesCount(t.chart_notes, c.sop.sop_id, c.rev.rev, 'steps', input.section) };
  }
  /* the boxes and arrows a note may be pinned to */
  function chartRefs(t, c, chart, section) {
    if (chart === 'sections') {
      const l = FL.layoutGraph(SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev), SEL.stepsOf(t, c.sop.sop_id, c.rev.rev), t.values_needed, c.sop, {});
      return l.error ? { boxes: [], arrows: [] } : { boxes: Object.keys(l.boxes), arrows: l.graph.arrows.map(a => a.id) };
    }
    const g = FL.stepGraph(SEL.stepsInSection(SEL.stepsOf(t, c.sop.sop_id, c.rev.rev), section));
    return { boxes: g.boxes.map(b => b.id), arrows: g.chain.concat(g.refs).map(a => a.from + '>' + a.to) };
  }

  /* saveSection({ tables, sop_id, section, changes, ctx }) → { refusals } or { tables } */
  function saveSection(input) {
    need(input, ['tables', 'sop_id', 'section', 'changes', 'ctx'], 'saveSection');
    const t = input.tables, c = current(t, input.sop_id, 'saveSection');
    if (c.locked) { return lockedRefusal(c); }
    const secs = SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev);
    const sec = secs.find(s => s.section === input.section) || (function () { throw new Error('engine.saveSection: no section ' + input.section); })();
    const r = SC.editSection(sec, input.changes, input.ctx, secs, SEL.stepsOf(t, c.sop.sop_id, c.rev.rev), t.sops.map(s => s.sop_id));
    if (r.refusals) { return r; }
    const done = sopChanged(t, c, r.history, input.ctx);
    return { refusals: null, new_history: done.hist, tables: { sections: SEL.mergeRows(t.sections, [r.section], ['sop_id', 'rev', 'section']), sop_revisions: done.sop_revisions, sops: done.sops, history: done.history } };
  }
  /* arrow({ tables, sop_id, from, to, action: add | remove, ctx }) → saveSection of the To box */
  function arrow(input) {
    need(input, ['tables', 'sop_id', 'from', 'to', 'action', 'ctx'], 'arrow');
    const t = input.tables, c = current(t, input.sop_id, 'arrow');
    const sec = SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev).find(s => s.section === Number(input.to));
    if (!sec) { return { refusals: [{ field: 'arrow', message: 'An arrow ends on a section box.' }] }; }
    if (String(input.from) === String(input.to)) { return { refusals: [{ field: 'arrow', message: 'A section cannot need itself.' }] }; }
    const ch = SC.arrowChanges(sec, String(input.from), input.action);
    if (ch.refusals) { return ch; }
    return saveSection({ tables: t, sop_id: input.sop_id, section: sec.section, changes: ch, ctx: input.ctx });
  }
  /* a renumbering change (move, add after, retire): every table it touches, with the mentions to fix */
  function renumbered(t, c, r, ctx, extraMap) {
    const done = sopChanged(t, c, r.history, ctx);
    const tables = { sections: others(t.sections, c).concat(r.sections), steps: others(t.steps, c).concat(r.steps),
      chart_notes: others(t.chart_notes, c).concat(r.notes), sop_revisions: done.sop_revisions, sops: done.sops, history: done.history };
    if (r.retired && r.retired.length) { tables.retired_keys = t.retired_keys.concat(r.retired); }
    const after = Object.assign({}, t, tables);
    const texts = MAIN.textsOf(after, c.sop.sop_id, c.rev.rev, SEL.stepsOf(after, c.sop.sop_id, c.rev.rev));
    const map = Object.assign({}, r.map || {}, extraMap || {});
    return { refusals: null, new_history: done.hist, tables: tables, map: map, mentions: Object.keys(map).length ? SC.sectionMentionsOf(texts, map) : [] };
  }
  /* moveSection({ tables, sop_id, section, after | direction, ctx }) */
  function moveSection(input) {
    need(input, ['tables', 'sop_id', 'section', 'ctx'], 'moveSection');
    const t = input.tables, c = current(t, input.sop_id, 'moveSection');
    if (c.locked) { return lockedRefusal(c); }
    const secs = SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev);
    let after = input.after;
    if (input.direction) { const tg = SC.sectionMoveTarget(secs, input.section, input.direction); if (tg.refusals) { return tg; } after = tg.after; }
    const notes = t.chart_notes.filter(n => n.sop_id === c.sop.sop_id && n.rev === c.rev.rev);
    const r = SC.moveSection(secs, SEL.stepsOf(t, c.sop.sop_id, c.rev.rev), notes, input.section, after, input.ctx);
    return r.refusals ? r : renumbered(t, c, r, input.ctx);
  }
  /* addSection({ tables, sop_id, name, after, ctx }) */
  function addSection(input) {
    need(input, ['tables', 'sop_id', 'name', 'ctx'], 'addSection');
    const t = input.tables, c = current(t, input.sop_id, 'addSection');
    if (c.locked) { return lockedRefusal(c); }
    const notes = t.chart_notes.filter(n => n.sop_id === c.sop.sop_id && n.rev === c.rev.rev);
    const r = SC.addSection(SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev), SEL.stepsOf(t, c.sop.sop_id, c.rev.rev), notes, input.name, input.after === undefined ? null : input.after, input.ctx,
      { sop_id: c.sop.sop_id, rev: c.rev.rev });
    if (r.refusals) { return r; }
    return Object.assign(renumbered(t, c, r, input.ctx), { new_section: r.new_section });
  }
  /* retirePreview({ tables, sop_id, section }) → what a retire would do, for the form */
  function retirePreview(input) {
    need(input, ['tables', 'sop_id', 'section'], 'retirePreview');
    const t = input.tables, c = current(t, input.sop_id, 'retirePreview');
    return SC.retirePreview(SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev), SEL.stepsOf(t, c.sop.sop_id, c.rev.rev), input.section);
  }
  /* notesOpen({ tables, sop_id }) → open notes of the current revision (0 when it has none) */
  function notesOpen(input) {
    need(input, ['tables', 'sop_id'], 'notesOpen');
    const sop = SEL.sopOf(input.tables, input.sop_id);
    return sop.current_rev ? NO.notesCount(input.tables.chart_notes, sop.sop_id, sop.current_rev, 'sections', null).open : 0;
  }
  /* moveStepTo({ tables, sop_id, key, after_key, ctx }): a drop on chart C (example_flow.md part 8): the step goes after
     after_key (null = first), with its sub-steps; numbers and History as for ▲ ▼ (main moveStep) */
  function moveStepTo(input) {
    need(input, ['tables', 'sop_id', 'key', 'after_key', 'ctx'], 'moveStepTo');
    const t = input.tables, c = current(t, input.sop_id, 'moveStepTo');
    if (c.locked) { return lockedRefusal(c); }
    return MAIN.moveStep({ tables: t, sop_id: c.sop.sop_id, rev: c.rev.rev, key: input.key, after_key: input.after_key, ctx: input.ctx });
  }
  /* retireSection({ tables, sop_id, section, ctx }) */
  function retireSection(input) {
    need(input, ['tables', 'sop_id', 'section', 'ctx'], 'retireSection');
    const t = input.tables, c = current(t, input.sop_id, 'retireSection');
    if (c.locked) { return lockedRefusal(c); }
    const notes = t.chart_notes.filter(n => n.sop_id === c.sop.sop_id && n.rev === c.rev.rev);
    const r = SC.retireSection(SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev), SEL.stepsOf(t, c.sop.sop_id, c.rev.rev), notes, input.section, input.ctx);
    return r.refusals ? r : renumbered(t, c, r, input.ctx);
  }
  /* retireStep({ tables, sop_id, key, ctx }) → the tables, and the texts that name the retired step number */
  function retireStep(input) {
    need(input, ['tables', 'sop_id', 'key', 'ctx'], 'retireStep');
    const t = input.tables, c = current(t, input.sop_id, 'retireStep');
    if (c.locked) { return lockedRefusal(c); }
    const steps = SEL.stepsOf(t, c.sop.sop_id, c.rev.rev);
    const gone = steps.find(s => s.key === input.key);
    const notes = t.chart_notes.filter(n => n.sop_id === c.sop.sop_id && n.rev === c.rev.rev);
    const r = SC.retireStep(steps, notes, input.key, input.ctx);
    if (r.refusals) { return r; }
    const broken = P.standardBroken(steps, r.steps);
    if (broken) { return { refusals: broken }; }
    const done = sopChanged(t, c, r.history, input.ctx);
    const tables = { steps: others(t.steps, c).concat(r.steps), chart_notes: others(t.chart_notes, c).concat(r.notes), retired_keys: t.retired_keys.concat(r.retired),
      sop_revisions: done.sop_revisions, sops: done.sops, history: done.history };
    const after = Object.assign({}, t, tables);
    const ren = {}; ren[gone.step_no] = null;
    return { refusals: null, new_history: done.hist, tables: tables, mentions: NU.mentionsOf(MAIN.textsOf(after, c.sop.sop_id, c.rev.rev, SEL.stepsOf(after, c.sop.sop_id, c.rev.rev)), ren) };
  }

  /* notes: noteAdd({ tables, sop_id, fields, ctx }), noteEdit({ tables, note_id, text, ctx }), noteClose, noteReopen ({ tables, note_id, ctx }) */
  function noteAdd(input) {
    need(input, ['tables', 'sop_id', 'fields', 'ctx'], 'noteAdd');
    const t = input.tables, c = current(t, input.sop_id, 'noteAdd');
    if (c.locked) { return lockedRefusal(c); }
    const f = Object.assign({}, input.fields, { sop_id: c.sop.sop_id, rev: c.rev.rev });
    const r = NO.addNote(f, chartRefs(t, c, f.chart, f.section), input.ctx);
    if (r.refusals) { return r; }
    return { refusals: null, note: r.note, tables: { chart_notes: t.chart_notes.concat([r.note]), history: t.history.concat(r.history) } };
  }
  /* lockedOk: Done and Open again work on a Released revision too (build 31: the notes of a process SOP's new revision) */
  function noteChange(input, place, fn, lockedOk) {
    need(input, ['tables', 'sop_id', 'note_id', 'ctx'], place);
    const t = input.tables, c = current(t, input.sop_id, place);
    if (c.locked && !lockedOk) { return lockedRefusal(c); }
    const note = t.chart_notes.find(n => n.note_id === input.note_id && n.sop_id === c.sop.sop_id && n.rev === c.rev.rev);
    if (!note) { throw new Error('engine.' + place + ': no note ' + input.note_id + ' in ' + c.sop.sop_id + ' ' + c.rev.rev); }
    const r = fn(note, t, c);
    if (r.refusals) { return r; }
    return { refusals: null, note: r.note, tables: { chart_notes: SEL.mergeRows(t.chart_notes, [r.note], ['note_id', 'rev']), history: t.history.concat(r.history) } };
  }
  const noteEdit = input => noteChange(input, 'noteEdit', n => NO.editNote(n, input.text, input.ctx));
  const noteClose = input => noteChange(input, 'noteClose', n => NO.closeNote(n, input.ctx), true);
  const noteReopen = input => noteChange(input, 'noteReopen', n => NO.reopenNote(n, input.ctx), true);
  const noteDelete = input => noteChange(input, 'noteDelete', n => NO.deleteNote(n, input.ctx));
  /* noteMove({ tables, sop_id, note_id, place: { pin, pin_ref, x, y }, ctx }): a dragged, re-pinned or unpinned note (part 18.3) */
  const noteMove = input => noteChange(input, 'noteMove', (n, t, c) => NO.moveNote(n, input.place, chartRefs(t, c, n.chart, n.section), input.ctx));

  /* textsToCheck({ tables, sop_id }) → the texts of the current revision that name a moved or retired step or section (part 18.1);
     build 30: a step from a process SOP is also listed when its text names a step number of that process SOP that is another
     number here (example_process_sop.md part 5); the texts of Standard steps are read only that way (they are the process SOP's) */
  function textsToCheck(input) {
    need(input, ['tables', 'sop_id'], 'textsToCheck');
    const t = input.tables, c = current(t, input.sop_id, 'textsToCheck');
    const steps = SEL.stepsOf(t, c.sop.sop_id, c.rev.rev);
    const own = steps.filter(s => s.link_mode !== 'Standard');
    const list = ST.textsToCheck({ texts: MAIN.textsOf(t, c.sop.sop_id, c.rev.rev, own), steps: steps, sections: SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev),
      history: t.history, sop_id: c.sop.sop_id, rev: c.rev.rev });
    for (const m of P.linkMentions(steps, t.steps)) {
      const same = list.find(x => x.table === m.table && x.row_id === m.row_id && x.field === m.field);
      if (!same) {
        const key = String(m.row_id).split(' ').pop(), st = steps.find(s => s.key === key);
        list.push(Object.assign({ ref: key, full: st ? st[m.field] : m.text }, m));
        continue;
      }
      for (const x of m.mentions) { if (!same.mentions.some(y => y.old === x.old)) { same.mentions.push(Object.assign({ of: m.link_sop }, x)); } }
    }
    /* build 40 (example_renumber.md part 7): a gone step says why, and where a club put it ("clubbed into TANK01-0120, now 3.3");
       build 42: the retired Keys of every SOP of the line (a copy's good version, the copy a revision came from) */
    const mine = ST.lineage(t.history, c.sop.sop_id, c.rev.rev).map(s => s.sop_id).concat(T.empty(c.sop.copy_of) ? [] : [c.sop.copy_of]);
    for (const m of list) {
      for (const x of m.mentions) {
        if (x.new !== null || !x.key) { continue; }
        const r = t.retired_keys.find(k => k.key === x.key && mine.indexOf(k.sop_id) >= 0);
        if (!r) { continue; }
        x.reason = r.reason;
        const into = /^Clubbed into [\d.]+ \(([^)]+)\)/.exec(String(r.reason || ''));
        const st = into ? steps.find(s => s.key === into[1]) : null;
        if (st) { x.into = into[1]; x.into_now = st.step_no; }
      }
    }
    /* build 41 (example_renumber.md part 10): the options of each text and the text with all of them; none for a text of a process SOP */
    for (const m of list) {
      const fo = m.link_sop ? { options: [], suggested: null } : NU.fixOptions(m.full === undefined ? m.text : m.full, m.mentions);
      m.id = textId(m); m.options = fo.options; m.suggested = fo.suggested;
    }
    return list;
  }

  /* ---- Renumber and the Texts to check tab (example_renumber.md parts 4 to 7, build 40) ---- */
  const textId = x => x.table + '|' + x.ref + '|' + x.field;
  /* the History row id of a text (as the save of that row writes it) and its revision (null for the SOP row and Values Needed) */
  function historyId(c, x) {
    switch (x.table) {
      case 'steps': return { row_id: x.ref, rev: c.rev.rev };
      case 'sections': return { row_id: c.sop.sop_id + ' ' + c.rev.rev + ' ' + x.ref, rev: c.rev.rev };
      case 'values_needed': return { row_id: x.ref, rev: null };
      case 'sops': return { row_id: c.sop.sop_id, rev: null };
      case 'sop_revisions': return { row_id: c.sop.sop_id + ' ' + c.rev.rev, rev: c.rev.rev };
      default: throw new Error('engine.historyId: no texts in table ' + x.table);
    }
  }
  /* renumberPreview({ tables, sop_id, section }) → { refusals } or { refusals: null, section, steps: [{ key, old, new }], texts: [{ id, table,
     row_id, ref, field, text, new_text, mentions }], stale: [the texts to check], collide: [{ id, nos }]: a text to check that names a gone step
     whose number Renumber gives to another step };
     section null = every section */
  function renumberPreview(input) {
    need(input, ['tables', 'sop_id', 'section'], 'renumberPreview');
    const t = input.tables, c = current(t, input.sop_id, 'renumberPreview');
    if (c.locked) { return lockedRefusal(c); }
    const steps = SEL.stepsOf(t, c.sop.sop_id, c.rev.rev);
    const secs = SEL.sectionsOf(t, c.sop.sop_id, c.rev.rev).map(s => s.section);
    if (input.section !== null && secs.indexOf(input.section) < 0) { throw new Error('engine.renumberPreview: ' + c.sop.sop_id + ' ' + c.rev.rev + ' has no section ' + input.section); }
    const changes = [];
    for (const n of (input.section === null ? secs : [input.section])) {
      const r = NU.renumberSection(SEL.stepsInSection(steps, n));
      if (r.refusals) { return r; }
      for (const x of r.renumbered) { changes.push(x); }
    }
    if (!changes.length) {
      return { refusals: [{ field: 'renumber', message: input.section === null ? 'Every section is already numbered in order: nothing to renumber.'
        : 'Section ' + input.section + ' is already numbered in order: nothing to renumber.' }] };
    }
    const renames = {};
    for (const x of changes) { renames[x.old] = x.new; }
    const before = textsToCheck({ tables: t, sop_id: c.sop.sop_id });
    const staleIds = {};
    for (const x of before) { staleIds[textId(x)] = true; }
    const texts = [];
    for (const x of MAIN.textsOf(t, c.sop.sop_id, c.rev.rev, steps.filter(s => s.link_mode !== 'Standard'))) {
      if (staleIds[textId(x)]) { continue; }
      const r = NU.renumberText(x.text, renames);
      if (r.mentions.length) { texts.push({ id: textId(x), table: x.table, row_id: x.row_id, ref: x.ref, field: x.field, text: x.text, new_text: r.text, mentions: r.mentions }); }
    }
    /* the texts to check: they stay as they are; one that names a gone step whose number Renumber gives to another step points to that step until fixed */
    const newNos = {};
    for (const s of steps) { newNos[renames[s.step_no] || s.step_no] = true; }
    const collide = before.filter(x => x.mentions.some(m => m.new === null && newNos[m.old]))
      .map(x => ({ id: textId(x), nos: x.mentions.filter(m => m.new === null && newNos[m.old]).map(m => m.old) }));
    return { refusals: null, section: input.section, steps: changes, texts: texts, stale: before, collide: collide };
  }
  /* renumber({ tables, sop_id, section, skip: [text ids], ctx }) → { refusals } or { refusals: null, new_history, tables, steps, texts }: the new
     numbers, the texts of the preview not in skip, one save; History: step_no rows, then the texts, then the revision status and Edited in */
  /* writeTexts(t, c, take, newNo, ctx) → { tables, hist, content }: new step numbers (newNo: key → number) and new texts (take: [{ table,
     ref, field, new_text }]) in the current revision, with their History rows in that order; content = a step, section or header row
     changed (the revision then goes back to Draft, as for any edit); a Values Needed text alone does not */
  function writeTexts(t, c, take, newNo, ctx) {
    let hist = [];
    const mineRow = r => r.sop_id === c.sop.sop_id && r.rev === c.rev.rev;
    const stepRows = {};
    for (const s of SEL.stepsOf(t, c.sop.sop_id, c.rev.rev)) {
      if (!newNo[s.key] && !take.some(x => x.table === 'steps' && x.ref === s.key)) { continue; }
      const n = Object.assign({}, s);
      if (newNo[s.key]) { n.step_no = newNo[s.key]; hist = E.historyRows({ table: 'steps', row_id: s.key, sop_id: s.sop_id, rev: s.rev, old: s, new: n, fields: ['step_no'], ctx: ctx, after: hist }); }
      stepRows[s.key] = n;
    }
    const textHist = (x, oldRow, newRow) => {
      const id = historyId(c, x);
      hist = E.historyRows({ table: x.table, row_id: id.row_id, sop_id: c.sop.sop_id, rev: id.rev, old: oldRow, new: newRow, fields: [x.field], ctx: ctx, after: hist });
    };
    for (const x of take.filter(x => x.table === 'steps')) { const o = Object.assign({}, stepRows[x.ref]); stepRows[x.ref][x.field] = x.new_text; textHist(x, o, stepRows[x.ref]); }
    const secRows = {};
    for (const x of take.filter(x => x.table === 'sections')) {
      const s = secRows[x.ref] || Object.assign({}, t.sections.find(r => mineRow(r) && String(r.section) === String(x.ref)));
      const o = Object.assign({}, s); s[x.field] = x.new_text; secRows[x.ref] = s; textHist(x, o, s);
    }
    const vnRows = {};
    for (const x of take.filter(x => x.table === 'values_needed')) {
      const v = vnRows[x.ref] || Object.assign({}, t.values_needed.find(r => r.vn_id === x.ref));
      const o = Object.assign({}, v); v[x.field] = x.new_text; vnRows[x.ref] = v; textHist(x, o, v);
    }
    const sop = Object.assign({}, c.sop), rev = Object.assign({}, c.rev);
    for (const x of take.filter(x => x.table === 'sops')) { const o = Object.assign({}, sop); sop[x.field] = x.new_text; textHist(x, o, sop); }
    for (const x of take.filter(x => x.table === 'sop_revisions')) { const o = Object.assign({}, rev); rev[x.field] = x.new_text; textHist(x, o, rev); }
    const content = Object.keys(stepRows).length > 0 || Object.keys(secRows).length > 0 || take.some(x => x.table === 'sops' || x.table === 'sop_revisions');
    const tables = {};
    if (content) {
      const done = sopChanged(t, { sop: sop, rev: rev }, hist, ctx);
      hist = done.hist;
      Object.assign(tables, { sop_revisions: done.sop_revisions, sops: done.sops, history: done.history });
    } else {
      tables.history = t.history.concat(hist);
    }
    if (Object.keys(stepRows).length) { tables.steps = t.steps.map(s => (mineRow(s) && stepRows[s.key] ? stepRows[s.key] : s)); }
    if (Object.keys(secRows).length) { tables.sections = t.sections.map(s => (mineRow(s) && secRows[String(s.section)] ? secRows[String(s.section)] : s)); }
    if (Object.keys(vnRows).length) { tables.values_needed = t.values_needed.map(v => vnRows[v.vn_id] || v); }
    return { tables: tables, hist: hist, content: content };
  }
  function renumber(input) {
    need(input, ['tables', 'sop_id', 'section', 'ctx'], 'renumber');
    const t = input.tables, c = current(t, input.sop_id, 'renumber');
    const p = renumberPreview({ tables: t, sop_id: input.sop_id, section: input.section });
    if (p.refusals) { return p; }
    E.checkCtx(input.ctx, 'renumber');
    if (T.empty(input.ctx.reason)) { return { refusals: [{ field: 'reason', message: 'Reason for change is empty' }] }; }
    const skip = Array.isArray(input.skip) ? input.skip : [];
    const take = p.texts.filter(x => skip.indexOf(x.id) < 0);
    const newNo = {};
    for (const x of p.steps) { newNo[x.key] = x.new; }
    const w = writeTexts(t, c, take, newNo, input.ctx);
    return { refusals: null, new_history: w.hist, tables: w.tables, steps: p.steps.length, texts: take.length };
  }
  /* applyFixes({ tables, sop_id, skip: [text ids], ctx }) → { refusals } or { refusals: null, new_history, tables, texts }: "Apply all
     suggestions" on the Texts to check tab (build 41, example_renumber.md part 10): every listed text with options, all its options used,
     except the ids in skip; one save */
  function applyFixes(input) {
    need(input, ['tables', 'sop_id', 'ctx'], 'applyFixes');
    const t = input.tables, c = current(t, input.sop_id, 'applyFixes');
    if (c.locked) { return lockedRefusal(c); }
    E.checkCtx(input.ctx, 'applyFixes');
    if (T.empty(input.ctx.reason)) { return { refusals: [{ field: 'reason', message: 'Reason for change is empty' }] }; }
    const skip = Array.isArray(input.skip) ? input.skip : [];
    const take = textsToCheck({ tables: t, sop_id: c.sop.sop_id }).filter(x => x.suggested !== null && x.suggested !== undefined && skip.indexOf(textId(x)) < 0)
      .map(x => ({ table: x.table, ref: x.ref, field: x.field, new_text: x.suggested }));
    if (!take.length) { return { refusals: [{ field: 'form', message: 'No text has a suggestion to apply.' }] }; }
    const w = writeTexts(t, c, take, {}, input.ctx);
    return { refusals: null, new_history: w.hist, tables: w.tables, texts: take.length };
  }
  /* applyFix({ text, options }) → the text with these options used (one option clicked on the Texts to check tab) */
  const applyFix = input => NU.applyFix(input.text, input.options);
  /* saveText({ tables, sop_id, table, ref, field, text, ctx }) → the save of one text from the Texts to check tab, in its own place:
     a step (saveStep), a section (saveSection), a Values Needed row (editVnText), the header (saveHeader) */
  function saveText(input) {
    need(input, ['tables', 'sop_id', 'table', 'ref', 'field', 'text', 'ctx'], 'saveText');
    const t = input.tables, c = current(t, input.sop_id, 'saveText');
    if (c.locked) { return lockedRefusal(c); }
    if (!E.TEXT_FIELDS[input.table] || E.TEXT_FIELDS[input.table].indexOf(input.field) < 0) { throw new Error('engine.saveText: ' + input.table + '.' + input.field + ' is not a text that names steps'); }
    const changes = {};
    changes[input.field] = input.text;
    switch (input.table) {
      case 'steps': return MAIN.saveStep({ tables: t, sop_id: c.sop.sop_id, rev: c.rev.rev, key: input.ref, changes: changes, ctx: input.ctx });
      case 'sections': return saveSection({ tables: t, sop_id: c.sop.sop_id, section: Number(input.ref), changes: changes, ctx: input.ctx });
      case 'sops': case 'sop_revisions': return saveHeader({ tables: t, sop_id: c.sop.sop_id, changes: changes, ctx: input.ctx });
      case 'values_needed': {
        const vn = t.values_needed.find(v => v.vn_id === input.ref && v.sop_id === c.sop.sop_id);
        if (!vn) { throw new Error('engine.saveText: ' + c.sop.sop_id + ' has no Values Needed row ' + input.ref); }
        const r = E.editVnText(vn, input.field, input.text, input.ctx);
        if (r.refusals) { return r; }
        return { refusals: null, new_history: r.history, tables: { values_needed: SEL.mergeRows(t.values_needed, [r.vn], ['vn_id']), history: t.history.concat(r.history) } };
      }
      default: throw new Error('engine.saveText: no texts in table ' + input.table);
    }
  }
  /* keepText({ tables, sop_id, table, ref, field, ctx }) → { refusals } or { refusals: null, new_history, tables: { history } }: "Keep as it is" */
  function keepText(input) {
    need(input, ['tables', 'sop_id', 'table', 'ref', 'field', 'ctx'], 'keepText');
    const t = input.tables, c = current(t, input.sop_id, 'keepText');
    if (c.locked) { return lockedRefusal(c); }
    const x = MAIN.textsOf(t, c.sop.sop_id, c.rev.rev, SEL.stepsOf(t, c.sop.sop_id, c.rev.rev)).find(y => y.table === input.table && String(y.ref) === String(input.ref) && y.field === input.field);
    if (!x) { throw new Error('engine.keepText: no text ' + input.table + ' ' + input.ref + ' ' + input.field + ' in ' + c.sop.sop_id + ' ' + c.rev.rev); }
    const id = historyId(c, { table: input.table, ref: input.ref });
    const rows = E.keepText({ table: input.table, row_id: id.row_id, sop_id: c.sop.sop_id, rev: id.rev, field: input.field, text: x.text, ctx: input.ctx });
    return { refusals: null, new_history: rows, tables: { history: t.history.concat(rows) } };
  }

  /* ---- the header and the lists (example_new_sop.md parts 9 and 10, build 32) ---- */
  /* saveHeader({ tables, sop_id, changes, ctx }): the header and the text of the current revision, unless it is locked */
  function saveHeader(input) {
    need(input, ['tables', 'sop_id', 'changes', 'ctx'], 'saveHeader');
    const t = input.tables, c = current(t, input.sop_id, 'saveHeader');
    if (c.locked) { return lockedRefusal(c); }
    const r = LI.editHeader(c.sop, c.rev, input.changes, input.ctx);
    if (r.refusals) { return r; }
    const done = sopChanged(t, { sop: r.sop, rev: r.revision }, r.history, input.ctx);
    return { refusals: null, new_history: done.hist, tables: { sops: done.sops, sop_revisions: done.sop_revisions, history: done.history } };
  }
  /* a list changed: the revision back to Draft and the SOP Edited in Builder, unless the list is shared (Gauges, Glossary) */
  const shared = table => !LI.LISTS[table].perRev;
  /* build 39: a copy changes only itself; the shared lists are changed from a good version */
  const sharedInCopy = (c, table) => (shared(table) && !T.empty(c.sop.copy_of)
    ? { refusals: [{ field: 'form', message: (table === 'glossary' ? 'The Glossary' : 'The Gauges list') + ' is shared by every SOP: change it from the good version (' + c.sop.copy_of + ').' }] } : null);
  function listDone(t, c, table, rows, history, ctx, row) {
    if (shared(table)) { const tb = { history: t.history.concat(history) }; tb[table] = rows; return { refusals: null, row: row, new_history: history, tables: tb }; }
    const done = sopChanged(t, c, history, ctx);
    const tables = { sop_revisions: done.sop_revisions, sops: done.sops, history: done.history };
    tables[table] = rows;
    return { refusals: null, row: row, new_history: done.hist, tables: tables };
  }
  /* saveRow({ tables, sop_id, table, key, changes, ctx }): a new row (key null) or a changed row of a list of the current revision,
     or of a shared list (Gauges, Glossary: any time) */
  function saveRow(input) {
    need(input, ['tables', 'sop_id', 'table', 'key', 'changes', 'ctx'], 'saveRow');
    const t = input.tables, c = current(t, input.sop_id, 'saveRow');
    if (c.locked && !shared(input.table)) { return lockedRefusal(c); }
    const inCopy = sharedInCopy(c, input.table);
    if (inCopy) { return inCopy; }
    const r = LI.saveListRow({ table: input.table, rows: t[input.table], key: input.key, changes: input.changes, sop_id: c.sop.sop_id, rev: c.rev.rev, ctx: input.ctx });
    return r.refusals ? r : listDone(t, c, input.table, r.rows, r.history, input.ctx, r.row);
  }
  /* removeRow({ tables, sop_id, table, key, ctx }): a gauge stays while a step of an open revision (not Superseded) names it */
  function removeRow(input) {
    need(input, ['tables', 'sop_id', 'table', 'key', 'ctx'], 'removeRow');
    const t = input.tables, c = current(t, input.sop_id, 'removeRow');
    if (c.locked && !shared(input.table)) { return lockedRefusal(c); }
    const inCopy = sharedInCopy(c, input.table);
    if (inCopy) { return inCopy; }
    const open = {};
    for (const r of t.sop_revisions) { if (r.status !== 'Superseded') { open[r.sop_id + '|' + r.rev] = true; } }
    const r = LI.removeListRow({ table: input.table, rows: t[input.table], key: input.key, sop_id: c.sop.sop_id, rev: c.rev.rev, ctx: input.ctx,
      steps: t.steps.filter(s => open[s.sop_id + '|' + s.rev]) });
    return r.refusals ? r : listDone(t, c, input.table, r.rows, r.history, input.ctx, null);
  }

  /* checkGujarati({ tables, sop_id, key, ctx }): "Gujarati checked" on a step of the current revision (example_new_sop.md part 11) */
  function checkGujarati(input) {
    need(input, ['tables', 'sop_id', 'key', 'ctx'], 'checkGujarati');
    const t = input.tables, c = current(t, input.sop_id, 'checkGujarati');
    if (c.locked) { return lockedRefusal(c); }
    return MAIN.checkGujarati({ tables: t, sop_id: c.sop.sop_id, rev: c.rev.rev, key: input.key, ctx: input.ctx });
  }

  /* photoName({ files, key, kind, defect, upload_name }) and photoRef({ tables, sop_id, key, add | remove, ctx }) (example_new_sop.md part 12) */
  const photoName = input => PH.photoName(input);
  function photoRef(input) {
    need(input, ['tables', 'sop_id', 'key', 'ctx'], 'photoRef');
    const t = input.tables, c = current(t, input.sop_id, 'photoRef');
    if (c.locked) { return lockedRefusal(c); }
    return MAIN.photoRef({ tables: t, sop_id: c.sop.sop_id, rev: c.rev.rev, key: input.key, add: input.add, remove: input.remove, ctx: input.ctx });
  }

  /* ---- process SOPs (example_process_sop.md part 5, build 30) ---- */
  /* findSops({ tables, text, process_only, leave_out }) → { rows, more }: the search list */
  function findSops(input) {
    if (!input || !input.tables) { throw new Error('engine.findSops: input needs tables'); }
    return P.findSops({ sops: input.tables.sops, sop_revisions: input.tables.sop_revisions }, input.text, { process_only: !!input.process_only, leave_out: input.leave_out || [] });
  }
  /* insertProcess({ tables, sop_id, after_key, process_sop_id, mode, ctx }): the current revision, unless it is locked */
  function insertProcess(input) {
    need(input, ['tables', 'sop_id', 'after_key', 'process_sop_id', 'mode', 'ctx'], 'insertProcess');
    const t = input.tables, c = current(t, input.sop_id, 'insertProcess');
    if (c.locked) { return lockedRefusal(c); }
    return MAIN.insertProcess({ tables: t, sop_id: c.sop.sop_id, rev: c.rev.rev, after_key: input.after_key, process_sop_id: input.process_sop_id, mode: input.mode, ctx: input.ctx });
  }
  /* reviseLinked({ tables, sop_id, key, ctx }): Make it a Revised copy, on the current revision unless it is locked */
  function reviseLinked(input) {
    need(input, ['tables', 'sop_id', 'key', 'ctx'], 'reviseLinked');
    const t = input.tables, c = current(t, input.sop_id, 'reviseLinked');
    if (c.locked) { return lockedRefusal(c); }
    return MAIN.reviseLinked({ tables: t, sop_id: c.sop.sop_id, rev: c.rev.rev, key: input.key, ctx: input.ctx });
  }
  /* useOf({ tables, sop_id, key }) → the use of a step of the current revision ({ keys, first_no, last_no, link_sop, link_rev, link_mode }) or null */
  function useOf(input) {
    need(input, ['tables', 'sop_id', 'key'], 'useOf');
    const t = input.tables, c = current(t, input.sop_id, 'useOf');
    return P.useOf(SEL.stepsOf(t, c.sop.sop_id, c.rev.rev), input.key);
  }

  /* kickstart({ tables, chart, file_name, group, unticked, sop_id, new_sop, ctx }) → { refusals } or { tables, sop_id, report } */
  function kickstart(input) {
    need(input, ['tables', 'chart', 'file_name', 'group', 'ctx'], 'kickstart');
    const t = input.tables;
    const r = KS.sopFromChart({ chart: input.chart, file_name: input.file_name, group: input.group, unticked: input.unticked || [], sop_id: input.sop_id || null,
      new_sop: input.new_sop || null, tables: { sops: t.sops, routing: t.routing }, ctx: input.ctx });
    if (r.refusals) { return r; }
    return { refusals: null, sop_id: r.sop.sop_id, report: r.report, plan: r.plan, new_history: r.history,
      tables: { sops: SEL.mergeRows(t.sops, [r.sop], ['sop_id']), sop_revisions: t.sop_revisions.concat([r.revision]), sections: t.sections.concat(r.sections),
        routing: t.routing.concat(r.routing_rows), values_needed: t.values_needed.concat(r.vn_rows), revision_history: t.revision_history.concat([r.rh_row]),
        history: t.history.concat(r.history) } };
  }
  /* startBlank({ tables, sop_id, new_sop, ctx }) → { refusals } or { tables, sop_id, report, new_history }: Rev 01 with no sections
     (example_new_sop.md parts 4 and 5); ctx needs next_rh_id */
  function startBlank(input) {
    need(input, ['tables', 'ctx'], 'startBlank');
    const t = input.tables;
    const r = KS.sopBlank({ sop_id: input.sop_id || null, new_sop: input.new_sop || null, tables: { sops: t.sops }, ctx: input.ctx });
    if (r.refusals) { return r; }
    return { refusals: null, sop_id: r.sop.sop_id, report: r.report, new_history: r.history,
      tables: { sops: SEL.mergeRows(t.sops, [r.sop], ['sop_id']), sop_revisions: t.sop_revisions.concat([r.revision]), revision_history: t.revision_history.concat([r.rh_row]),
        history: t.history.concat(r.history) } };
  }
  /* ---- pictures on steps (example_pictures.md, build 43) ---- */
  const PIC_FIELDS = ['action', 'warning', 'check', 'if_fail', 'skip_if'];   // the fields a step's pictures are read from (ENGINE_TEXT.pictureRefs)
  const namesPicture = (text, id) => new RegExp('\\b' + String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(String(text === null || text === undefined ? '' : text));
  function pictureStep(t, c, key, place) {
    const step = SEL.stepsOf(t, c.sop.sop_id, c.rev.rev).find(s => s.key === key);
    if (!step) { throw new Error('engine.' + place + ': ' + c.sop.sop_id + ' ' + c.rev.rev + ' has no step with key ' + key); }
    return step;
  }
  const stepRefusals = (step, refs) => ({ refusals: refs.map(r => ({ field: r.field, message: 'Step ' + step.step_no + ' ' + r.message })) });
  const standardRefusal = step => ({ refusals: [{ field: 'picture', message: 'Step ' + step.step_no + ' follows ' + step.link_sop + ' as Standard: its text is the process SOP\'s. Add the picture there.' }] });
  /* addPicture({ tables, sop_id, key, picture_id, ctx }) for a picture of the revision, or addPicture({ tables, sop_id, key, caption, upload_name,
     files, ctx }) for a new one (the next Picture number, its file name in source/Pictures) → { refusals } or { refusals: null, picture_id,
     file: { name, path } | null, new_history, tables }: the step's Check (its Action when the Check is empty) ends with "(Picture n)";
     the screen copies the file */
  function addPicture(input) {
    need(input, ['tables', 'sop_id', 'key', 'ctx'], 'addPicture');
    const t = input.tables, c = current(t, input.sop_id, 'addPicture');
    if (c.locked) { return lockedRefusal(c); }
    const step = pictureStep(t, c, input.key, 'addPicture');
    if (step.link_mode === 'Standard') { return standardRefusal(step); }
    const pics = t.pictures || [];
    let id, file = null, row = null;
    if (!T.empty(input.picture_id)) {
      id = input.picture_id;
      if (!pics.some(p => p.sop_id === c.sop.sop_id && p.rev === c.rev.rev && p.picture_id === id)) { throw new Error('engine.addPicture: ' + c.sop.sop_id + ' ' + c.rev.rev + ' has no ' + id); }
    } else {
      if (T.empty(input.caption)) { return { refusals: [{ field: 'caption', message: 'Caption is empty. Example: Nipple, coupling and end plug on the RHS wall.' }] }; }
      id = PI.nextPictureId(pics, c.sop.sop_id, c.rev.rev);
      const f = PI.pictureFile(c.sop.short, c.sop.sop_id, c.rev.rev, id, input.upload_name, input.files || []);
      if (f.refusals) { return f; }
      file = { name: f.file, path: f.path };
      row = { sop_id: c.sop.sop_id, rev: c.rev.rev, picture_id: id, caption: id + ': ' + String(input.caption).trim().replace(/\s+/g, ' '), file: f.path, used_at: null };
    }
    const field = T.empty(step.check) ? 'action' : 'check';
    const named = PI.namePicture(step[field], id);
    if (named.refusals) { return stepRefusals(step, named.refusals); }
    const changes = {};
    changes[field] = named.text;
    const r = MAIN.saveStep({ tables: t, sop_id: c.sop.sop_id, rev: c.rev.rev, key: step.key, changes: changes, ctx: input.ctx });
    if (r.refusals) { return r; }
    if (!row) { return Object.assign({}, r, { picture_id: id, file: null }); }
    const all = E.historyRows({ table: 'pictures', row_id: id, sop_id: c.sop.sop_id, rev: c.rev.rev, old: { row: null }, new: { row: 'added: ' + row.caption + ' (' + file.name + ')' },
      fields: ['row'], ctx: input.ctx, after: r.new_history });
    const tables = Object.assign({}, r.tables, { pictures: pics.concat([row]), history: r.tables.history.concat(all.slice(r.new_history.length)) });
    return { refusals: null, changed_keys: r.changed_keys, picture_id: id, file: file, new_history: all, tables: tables };
  }
  /* removePicture({ tables, sop_id, key, picture_id, ctx }) → { refusals } or the tables to write: "(Picture n)" taken off the step's
     texts; the picture stays in the SOP for other steps */
  function removePicture(input) {
    need(input, ['tables', 'sop_id', 'key', 'picture_id', 'ctx'], 'removePicture');
    const t = input.tables, c = current(t, input.sop_id, 'removePicture');
    if (c.locked) { return lockedRefusal(c); }
    const step = pictureStep(t, c, input.key, 'removePicture');
    if (step.link_mode === 'Standard') { return standardRefusal(step); }
    const changes = {};
    for (const f of PIC_FIELDS) {
      if (!namesPicture(step[f], input.picture_id)) { continue; }
      const u = PI.unnamePicture(step[f], input.picture_id);
      if (u.refusals) { return stepRefusals(step, u.refusals); }
      changes[f] = u.text;
    }
    if (!Object.keys(changes).length) { return stepRefusals(step, [{ field: 'picture', message: 'does not name ' + input.picture_id + '.' }]); }
    return MAIN.saveStep({ tables: t, sop_id: c.sop.sop_id, rev: c.rev.rev, key: step.key, changes: changes, ctx: input.ctx });
  }

  /* chartPlan({ tables, chart, group, unticked, sop_id, new_sop_id }) → the table of the kickstart screen */
  function chartPlan(input) {
    const sop = input.sop_id ? SEL.sopOf(input.tables, input.sop_id) : { sop_id: input.new_sop_id || '(new SOP)', input_from: null, output_to: null };
    return KS.chartPlan(input.chart, input.group, input.unticked || [], sop, input.tables.routing);
  }

  return { flowView, stepsChartView, saveSection, arrow, moveSection, addSection, retirePreview, retireSection, retireStep, moveStepTo, notesOpen,
    noteAdd, noteEdit, noteClose, noteReopen, noteDelete, noteMove, textsToCheck, kickstart, startBlank, chartPlan, chartGroups: KS.chartGroups,
    findSops, insertProcess, reviseLinked, useOf, saveHeader, saveRow, removeRow, checkGujarati, photoName, photoRef, renumberPreview, renumber, saveText, keepText,
    applyFixes, applyFix, addPicture, removePicture };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_CHART;
