/* SOP Builder main engine: the only thing the screen layer calls. A
   manager, not a worker: it calls the pieces (engine/select.js, text.js,
   links.js, release.js) in order and passes their results along. No
   calculation of its own. Every input comes in as data (tables, files,
   ids); nothing here reads the clock, files or settings.
   Classic script (global ENGINE); module in Node. */
const ENGINE = (function () {
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const L = (typeof ENGINE_LINKS !== 'undefined') ? ENGINE_LINKS : require('./links.js');
  const R = (typeof ENGINE_RELEASE !== 'undefined') ? ENGINE_RELEASE : require('./release.js');
  const MN = (typeof ENGINE_MENUS !== 'undefined') ? ENGINE_MENUS : require('./menus.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const K = (typeof ENGINE_KEYS !== 'undefined') ? ENGINE_KEYS : require('./keys.js');
  const C = (typeof ENGINE_CLUB !== 'undefined') ? ENGINE_CLUB : require('./club.js');
  const CMP = (typeof ENGINE_COMPARE !== 'undefined') ? ENGINE_COMPARE : require('./compare.js');
  const FL = (typeof ENGINE_FLOOR !== 'undefined') ? ENGINE_FLOOR : require('./floor.js');
  const NU = (typeof ENGINE_NUMBER !== 'undefined') ? ENGINE_NUMBER : require('./number.js');
  const NO = (typeof ENGINE_NOTES !== 'undefined') ? ENGINE_NOTES : require('./notes.js');
  const FA = (typeof ENGINE_FACTS !== 'undefined') ? ENGINE_FACTS : require('./flow_facts.js');
  const P = (typeof ENGINE_PROCESS !== 'undefined') ? ENGINE_PROCESS : require('./process.js');
  const CP = (typeof ENGINE_COPIES !== 'undefined') ? ENGINE_COPIES : require('./copies.js');
  const SY = (typeof ENGINE_SYNC !== 'undefined') ? ENGINE_SYNC : require('./sync.js');
  const RT = (typeof ENGINE_RIGHTS !== 'undefined') ? ENGINE_RIGHTS : require('./rights.js');
  /* build 45: how many main changes wait for a copy (example_copy_sync.md part 5.2); 0 for a good version */
  const waiting = (t, sop) => (CP.isCopy(sop) ? SY.pendingChanges(t.history, sop.copy_of, sop.sop_id).length : 0);
  const KINDS = ['step', 'sub'];
  /* a copy (build 39, spec/example_copy.md part 6): never signed, released or walked; no new revision; Values Needed stay the good version's */
  const COPY_LOCK = 'A copy cannot be signed or released: make it the good version first (Header tab).';
  const copyRefusal = field => ({ refusals: [{ field: field, message: COPY_LOCK }] });
  /* vnOf(t, sop) → the Values Needed rows the SOP shows: its own, or for a copy the good version's with the copy's SOP ID (so they link to its steps) */
  function vnOf(t, sop) {
    if (!CP.isCopy(sop)) { return t.values_needed.filter(v => v.sop_id === sop.sop_id); }
    return t.values_needed.filter(v => v.sop_id === sop.copy_of).map(v => Object.assign({}, v, { sop_id: sop.sop_id }));
  }
  /* texts of one SOP revision that may name a step number (sections, steps, Values Needed) */
  function textsOf(t, sopId, rev, steps) {
    const out = [];
    /* ref = what History names the row by (the key, the section number, the vn_id): engine/stale.js matches the rows that wrote each text */
    for (const r of SEL.sectionsOf(t, sopId, rev)) { for (const f of ['needs_note', 'ends_with', 'max_wait', 'restart_step', 'manpower']) { out.push({ table: 'sections', row_id: String(r.section), field: f, text: r[f], ref: r.section }); } }
    for (const r of steps) { for (const f of ['action', 'why', 'warning', 'tool', 'material', 'check', 'if_fail', 'skip_if', 'remark']) { out.push({ table: 'steps', row_id: r.step_no + ' ' + r.key, field: f, text: r[f], ref: r.key }); } }
    for (const r of t.values_needed.filter(v => v.sop_id === sopId)) { for (const f of ['step_text', 'value_needed']) { out.push({ table: 'values_needed', row_id: r.vn_id, field: f, text: r[f], ref: r.vn_id }); } }
    /* build 40: the header texts that name steps (example_renumber.md part 7); ref = the row_id History gives them */
    const sop = t.sops.find(s => s.sop_id === sopId);
    if (sop) { for (const f of E.TEXT_FIELDS.sops) { out.push({ table: 'sops', row_id: 'Header', field: f, text: sop[f], ref: sop.sop_id }); } }
    const revRow = t.sop_revisions.find(r => r.sop_id === sopId && r.rev === rev);
    if (revRow) { for (const f of E.TEXT_FIELDS.sop_revisions) { out.push({ table: 'sop_revisions', row_id: 'Header', field: f, text: revRow[f], ref: sopId + ' ' + rev }); } }
    return out;
  }
  function mentionsAfter(t, sopId, rev, steps, renumbered) {
    const renames = {};
    for (const m of renumbered) { renames[m.old] = m.new; }
    return renumbered.length ? NU.mentionsOf(textsOf(t, sopId, rev, steps), renames) : [];
  }
  /* placeNew(sopSteps, draft, section, afterKey, kind) → { refusals } or { steps (in order, numbers set), number, renumbered } */
  function placeNew(sopSteps, draft, section, afterKey, kind) {
    if (KINDS.indexOf(kind) < 0) { throw new Error('engine.addStep: kind must be step or sub, not ' + kind); }
    const ins = K.insertStep(sopSteps, draft, section, afterKey || null);
    const kinds = {}; kinds[draft.key] = kind;
    const num = NU.numberSection(ins.steps.filter(s => s.section === section), kinds);
    if (num.refusals) { return { refusals: num.refusals }; }
    const steps = ins.steps.map(s => (s.section === section && num.numbers[s.key] !== s.step_no) ? Object.assign({}, s, { step_no: num.numbers[s.key] }) : s);
    return { steps: steps, number: num.numbers[draft.key], renumbered: num.renumbered, before_key: ins.before_key, after_key: ins.after_key };
  }
  const EXTRA_TABLES = ['safety_items', 'materials', 'tools', 'worked_examples', 'ref_tables', 'pictures'];
  function need(input, names, place) {
    if (!input) { throw new Error('engine.' + place + ': no input'); }
    for (const n of names) { if (input[n] === undefined) { throw new Error('engine.' + place + ': input needs ' + names.join(', ') + ' (' + n + ' missing)'); } }
  }

  /* release(tables, files, sop) → { check, label, result, accepted, signers } or null when the SOP has no revision; result = the Result
     line, accepted = the items accepted at its release, signers = the names the sign lists offer (example_release.md part 8) */
  function release(tables, files, sop) {
    if (!sop.current_rev) { return null; }
    const rev = SEL.revisionOf(tables, sop.sop_id, sop.current_rev);
    const check = R.releaseCheck(tables, sop.sop_id, sop.current_rev, files);
    if (CP.isCopy(sop)) { return { check: check, label: 'Copy: not for the floor', result: COPY_LOCK, accepted: [], signers: { checked: [], approved: [] }, copy: true }; }
    const accepted = R.acceptedItems(tables.history, sop.sop_id, sop.current_rev);
    return { check: check, label: R.releaseLabel(rev.status, check, rev.release_note), result: R.releaseResult(rev, check, accepted), accepted: accepted, signers: R.signersFor(rev) };
  }

  /* sopList({ tables, files }) → { meta, rows } for the first screen */
  function sopList(input) {
    need(input, ['tables', 'files'], 'sopList');
    const t = input.tables;
    /* build 39: each copy right under its good version; the status counts are of the SOPs that are not copies */
    const rows = CP.familyOrder(t.sops).map(function (sop) {
      const rel = release(t, input.files, sop);
      return Object.assign({}, sop, {
        steps_count: sop.current_rev ? SEL.stepCount(SEL.stepsOf(t, sop.sop_id, sop.current_rev)).steps : 0,
        release: rel ? rel.label : null, fail_count: rel ? rel.check.fail_count : null, main_changes: waiting(t, sop),
        /* build 50: the owner of a copy (who saved it), shown on its row */
        owner: CP.isCopy(sop) ? RT.ownerOf(t, sop.sop_id) : null });
    });
    const goods = t.sops.filter(s => !CP.isCopy(s));
    return { meta: t.meta[0], rows: rows, by_status: SEL.countBy(goods, 'status'), copies: t.sops.length - goods.length };
  }

  /* sopView({ tables, files, sop_id }) → everything the SOP page and its tabs show */
  function sopView(input) {
    need(input, ['tables', 'files', 'sop_id'], 'sopView');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const rev = sop.current_rev ? SEL.revisionOf(t, sop.sop_id, sop.current_rev) : null;
    const steps = sop.current_rev ? SEL.stepsOf(t, sop.sop_id, sop.current_rev) : [];
    const sections = sop.current_rev ? SEL.sectionsOf(t, sop.sop_id, sop.current_rev) : [];
    const vnAll = vnOf(t, sop);
    const counts = L.vnCounts(vnAll, steps, sections, sop.sop_id);
    const vnRows = vnAll.map(function (v) {
      return Object.assign({}, v, { state: T.empty(v.value) ? 'open' : 'given', links: L.vnLinks(v, steps, sections) });
    });
    const rel = release(t, input.files, sop);
    const goodId = CP.isCopy(sop) ? sop.copy_of : sop.sop_id;
    const sectionRows = sections.map(function (sec) {
      const c = counts.by_section[sec.section] || { open: 0, given: 0, rows: 0 };
      const n = SEL.stepCount(SEL.stepsInSection(steps, sec.section));
      return Object.assign({}, sec, { steps_count: n.steps, sub_steps: n.sub_steps, first_step: n.first, last_step: n.last, vn_open: c.open, vn_given: c.given, vn_rows: c.rows });
    });
    const forRev = name => (rev ? SEL.rowsOf(t, name, sop.sop_id, sop.current_rev) : []);
    return {
      sop: sop, rev: rev, steps_count: SEL.stepCount(steps).steps, sections: sectionRows,
      /* build 36 (example_release.md part 8.1): draft mode, and the revision still on the floor while a newer one is not released */
      draft_mode: rev ? !MN.reasonAsked(rev) : false, floor_rev: rev ? R.floorRev(SEL.revisionsOf(t, sop.sop_id), sop) : null,
      vn: { open: counts.open, given: counts.given, rows: vnRows, owner: CP.isCopy(sop) ? sop.copy_of : sop.sop_id },
      /* build 39: what the SOP is a copy of (null for a good version), and the copies of its good version */
      copy: CP.copyInfo(t, sop.sop_id), copies: CP.copiesOf(t, sop.sop_id), main_changes: waiting(t, sop),
      release: rel, record_sheet: steps.length ? L.recordSheetRows(steps, sections) : null,
      safety_items: forRev('safety_items'), materials: forRev('materials'), tools: forRev('tools'),
      worked_examples: forRev('worked_examples'), ref_tables: forRev('ref_tables'), pictures: forRev('pictures'),
      glossary: t.glossary, gauges: t.gauges,
      /* a copy shows the routing and the revision history of its good version, for reading (build 39) */
      routing: t.routing.filter(r => r.from_id === goodId || r.to_id === goodId),
      revision_history: SEL.rowsOf(t, 'revision_history', goodId),
      validation_log: forRev('validation_log'),
      history: SEL.rowsOf(t, 'history', sop.sop_id)
    };
  }

  /* sectionView({ tables, sop_id, rev, section }) → the section card and its step rows and cards */
  function sectionView(input) {
    need(input, ['tables', 'sop_id', 'rev', 'section'], 'sectionView');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const rev = SEL.revisionOf(t, input.sop_id, input.rev);
    const sections = SEL.sectionsOf(t, input.sop_id, input.rev);
    const sec = sections.find(s => s.section === input.section);
    if (!sec) { throw new Error('engine.sectionView: ' + input.sop_id + ' ' + input.rev + ' has no section ' + input.section); }
    const allSteps = SEL.stepsOf(t, input.sop_id, input.rev);
    const counts = L.vnCounts(vnOf(t, sop), allSteps, sections, sop.sop_id);
    /* a copy's steps find their defect codes under the good version's name (BMC-L1-TANK-01-COPY1 → TANK-01) */
    const goodId = CP.isCopy(sop) ? sop.copy_of : sop.sop_id;
    const steps = SEL.stepsInSection(allSteps, input.section).map(function (s) {
      const pics = T.pictureRefs(s, t.pictures);
      return Object.assign({}, s, {
        target: T.targetText(s), vn_ids: counts.by_key[s.key] || [], parts_count: T.parts(s.action).length,
        defect_codes: T.defectCodes(Object.assign({}, s, { sop_id: goodId }), t.defects), picture_ids: pics, icons: FA.stepIcons(Object.assign({}, s, { picture_ids: pics })),
        images: T.stepImages(s, pics, t.pictures), link_text: FA.linkText(s) });
    });
    const c = counts.by_section[input.section] || { open: 0, given: 0, rows: 0 };
    const n = SEL.stepCount(steps);
    return {
      sop: { sop_id: sop.sop_id, rev: rev.rev, title: sop.title, status: sop.status, edited_in: sop.edited_in, rev_status: rev.status, lock_text: R.lockText(rev), copy_of: CP.isCopy(sop) ? sop.copy_of : null },
      section: Object.assign({}, sec, { steps_count: n.steps, sub_steps: n.sub_steps, first_step: n.first, last_step: n.last, vn_open: c.open, vn_given: c.given, vn_rows: c.rows }),
      steps: steps
    };
  }

  /* after any change to a revision's steps: renumber, the revision back to Draft, the SOP marked Edited in Builder,
     History rows for all of it; returns the four tables to write. First the guard of the Standard uses (build 30):
     a change that touches a step that follows a process SOP as Standard, or puts a step between two of them, is refused. */
  function afterChange(t, sop, revision, orderedSteps, history, ctx, retired) {
    const broken = P.standardBroken(SEL.stepsOf(t, sop.sop_id, revision.rev), orderedSteps);
    if (broken) { return { refusals: broken }; }
    const ren = K.renumber(orderedSteps);
    const newRevision = R.revisionAfterEdit(revision);
    let hist = E.historyRows({ table: 'sop_revisions', row_id: sop.sop_id + ' ' + revision.rev, sop_id: sop.sop_id, rev: revision.rev,
      old: revision, new: newRevision, fields: ['status', 'checked_date', 'approved_date'], ctx: ctx, after: history });
    /* a Listed SOP (kickstarted from a chart) turns Built with its first step */
    const newSop = Object.assign({}, sop, { edited_in: 'Builder' }, sop.status === 'Listed' && ren.steps.length ? { status: 'Built' } : {});
    hist = E.historyRows({ table: 'sops', row_id: sop.sop_id, sop_id: sop.sop_id, rev: null, old: sop, new: newSop, fields: ['edited_in', 'status'], ctx: ctx, after: hist });
    const gone = (retired || []).map(r => r.key);
    const tables = {
      /* a step row is its SOP, key and revision: a copy has the same keys as its good version (build 39) */
      steps: SEL.mergeRows(t.steps, ren.steps, ['sop_id', 'key', 'rev']).filter(s => !(gone.indexOf(s.key) >= 0 && s.sop_id === sop.sop_id && s.rev === revision.rev)),
      sop_revisions: SEL.mergeRows(t.sop_revisions, [newRevision], ['sop_id', 'rev']),
      sops: SEL.mergeRows(t.sops, [newSop], ['sop_id']),
      history: t.history.concat(hist)
    };
    if (retired && retired.length) { tables.retired_keys = t.retired_keys.concat(retired); }
    return { refusals: null, changed_keys: ren.changed, new_history: hist, tables: tables };
  }

  /* saveStep({ tables, sop_id, rev, key, changes, ctx }) → { refusals } or { refusals: null, changed_keys, new_history, tables } */
  function saveStep(input) {
    need(input, ['tables', 'sop_id', 'rev', 'key', 'changes', 'ctx'], 'saveStep');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const revision = SEL.revisionOf(t, input.sop_id, input.rev);
    const sopSteps = SEL.stepsOf(t, input.sop_id, input.rev);
    const step = sopSteps.find(s => s.key === input.key);
    if (!step) { throw new Error('engine.saveStep: ' + input.sop_id + ' ' + input.rev + ' has no step with key ' + input.key); }
    const edit = E.editStep(step, input.changes, input.ctx, sopSteps);
    if (edit.refusals) { return { refusals: edit.refusals }; }
    return afterChange(t, sop, revision, sopSteps.map(s => (s.key === step.key ? edit.step : s)), edit.history, input.ctx);
  }

  /* photoRef({ tables, sop_id, rev, key, add | remove, ctx }) → { refusals } or the tables to write: a photo name added to (or taken off)
     a step's Photo ref (example_new_sop.md part 12); the file itself is copied or kept by the screen */
  function photoRef(input) {
    need(input, ['tables', 'sop_id', 'rev', 'key', 'ctx'], 'photoRef');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const revision = SEL.revisionOf(t, input.sop_id, input.rev);
    const sopSteps = SEL.stepsOf(t, input.sop_id, input.rev);
    const step = sopSteps.find(s => s.key === input.key);
    if (!step) { throw new Error('engine.photoRef: ' + input.sop_id + ' ' + input.rev + ' has no step with key ' + input.key); }
    const now = Array.isArray(step.photo_ref) ? step.photo_ref.slice() : [];
    let next;
    if (input.add) {
      if (now.indexOf(input.add) >= 0) { return { refusals: [{ field: 'file', message: input.add + ' is on step ' + step.step_no + ' already.' }] }; }
      next = now.concat([input.add]);
    } else if (input.remove) {
      if (now.indexOf(input.remove) < 0) { return { refusals: [{ field: 'file', message: input.remove + ' is not on step ' + step.step_no + '.' }] }; }
      next = now.filter(n => n !== input.remove);
    } else { throw new Error('engine.photoRef: input needs add or remove'); }
    const r = E.editStep(step, { photo_ref: next.length ? next : null }, input.ctx, sopSteps);
    if (r.refusals) { return { refusals: r.refusals }; }
    return afterChange(t, sop, revision, sopSteps.map(s => (s.key === step.key ? r.step : s)), r.history, input.ctx);
  }

  /* checkGujarati({ tables, sop_id, rev, key, ctx }) → { refusals } or the tables to write: "(draft)" taken off a step's Gujarati line */
  function checkGujarati(input) {
    need(input, ['tables', 'sop_id', 'rev', 'key', 'ctx'], 'checkGujarati');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const revision = SEL.revisionOf(t, input.sop_id, input.rev);
    const sopSteps = SEL.stepsOf(t, input.sop_id, input.rev);
    const step = sopSteps.find(s => s.key === input.key);
    if (!step) { throw new Error('engine.checkGujarati: ' + input.sop_id + ' ' + input.rev + ' has no step with key ' + input.key); }
    const r = E.checkGujarati(step, input.ctx, sopSteps);
    if (r.refusals) { return { refusals: r.refusals }; }
    return afterChange(t, sop, revision, sopSteps.map(s => (s.key === step.key ? r.step : s)), r.history, input.ctx);
  }

  /* addStep({ tables, sop_id, rev, section, after_key }) → { draft, key_rule, before_key, after_key }; nothing is saved yet */
  function addStep(input) {
    need(input, ['tables', 'sop_id', 'rev', 'section', 'kind'], 'addStep');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    SEL.revisionOf(t, input.sop_id, input.rev);
    const sopSteps = SEL.stepsOf(t, input.sop_id, input.rev);
    const afterStep = input.after_key ? sopSteps.find(s => s.key === input.after_key) : null;
    if (input.after_key && !afterStep) { throw new Error('engine.addStep: no step with key ' + input.after_key); }
    const inside = P.insideStandard(sopSteps, input.after_key || null);
    if (inside) { return { refusals: inside }; }
    const draft = E.draftStep(sop, input.rev, input.section, null, '__new');
    const place = placeNew(sopSteps, draft, input.section, input.after_key, input.kind);
    if (place.refusals) { return { refusals: place.refusals }; }
    const nk = K.newKey(sop.short, SEL.familyKeys(t, sop.sop_id), t.retired_keys, place.before_key, place.after_key);
    draft.key = nk.key; draft.step_no = place.number;
    return { draft: draft, kind: input.kind, key_rule: nk.rule, before_key: place.before_key, after_key: place.after_key, renumbered: place.renumbered };
  }

  /* saveNewStep({ tables, sop_id, rev, draft, kind, key_rule, after_key, changes, ctx }) → { refusals } or the tables to write */
  function saveNewStep(input) {
    need(input, ['tables', 'sop_id', 'rev', 'draft', 'kind', 'key_rule', 'changes', 'ctx'], 'saveNewStep');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const revision = SEL.revisionOf(t, input.sop_id, input.rev);
    const sopSteps = SEL.stepsOf(t, input.sop_id, input.rev);
    const place = placeNew(sopSteps, Object.assign({}, input.draft), input.draft.section, input.after_key, input.kind);
    if (place.refusals) { return { refusals: place.refusals }; }
    const others = place.steps.filter(s => s.key !== input.draft.key);
    const edit = E.editStep(Object.assign({}, input.draft, { step_no: place.number }), input.changes, input.ctx, others);
    if (edit.refusals) { return { refusals: edit.refusals }; }
    const steps = place.steps.map(s => s.key === input.draft.key ? edit.step : s);
    const note = 'added: ' + edit.step.step_no + ' ' + T.firstPart(edit.step.action) + ' (' + (input.kind === 'sub' ? 'sub-step' : 'step') + ', key ' + edit.step.key + ': ' + input.key_rule + ')';
    let hist = E.historyRows({ table: 'steps', row_id: edit.step.key, sop_id: sop.sop_id, rev: input.rev, old: { row: null }, new: { row: note }, fields: ['row'], ctx: input.ctx, after: [] });
    for (const m of place.renumbered) { hist = E.historyRows({ table: 'steps', row_id: m.key, sop_id: sop.sop_id, rev: input.rev, old: { step_no: m.old }, new: { step_no: m.new }, fields: ['step_no'], ctx: input.ctx, after: hist }); }
    return Object.assign(afterChange(t, sop, revision, steps, hist, input.ctx), { renumbered: place.renumbered, mentions: mentionsAfter(t, sop.sop_id, input.rev, steps, place.renumbered) });
  }

  /* clubSteps({ tables, sop_id, rev, keys, ctx }) → { refusals } or the tables to write (steps, retired_keys, history, sop_revisions, sops) */
  function clubSteps(input) {
    need(input, ['tables', 'sop_id', 'rev', 'keys', 'ctx'], 'clubSteps');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const revision = SEL.revisionOf(t, input.sop_id, input.rev);
    const r = C.clubSteps(SEL.stepsOf(t, input.sop_id, input.rev), input.keys, input.ctx);
    if (r.refusals) { return { refusals: r.refusals }; }
    return afterChange(t, sop, revision, r.steps, r.history, input.ctx, r.retired);
  }

  /* splitStep({ tables, sop_id, rev, key, reading_part, ctx }) → { refusals } or the tables to write, plus new_keys */
  function splitStep(input) {
    need(input, ['tables', 'sop_id', 'rev', 'key', 'ctx'], 'splitStep');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const revision = SEL.revisionOf(t, input.sop_id, input.rev);
    const r = C.splitStep(SEL.stepsOf(t, input.sop_id, input.rev), input.key, input.reading_part === undefined ? null : input.reading_part, t.retired_keys, input.ctx, input.kind || 'sub',
      SEL.familyKeys(t, sop.sop_id));
    if (r.refusals) { return { refusals: r.refusals }; }
    return Object.assign(afterChange(t, sop, revision, r.steps, r.history, input.ctx), { new_keys: r.new_keys, renumbered: r.renumbered, mentions: mentionsAfter(t, sop.sop_id, input.rev, r.steps, r.renumbered) });
  }

  /* moveStep({ tables, sop_id, rev, key, direction | after_key, ctx }) → { refusals } or the afterChange result with
     renumbered and mentions. direction = ▲ ▼ (moveTarget); after_key = a drop (null = first of the section).
     The section's new order and numbers come from reorder (example_flow.md part 8). */
  function moveStep(input) {
    need(input, ['tables', 'sop_id', 'rev', 'key', 'ctx'], 'moveStep');
    if (input.direction === undefined && input.after_key === undefined) { throw new Error('engine.moveStep: input needs direction or after_key'); }
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const revision = SEL.revisionOf(t, input.sop_id, input.rev);
    const sopSteps = SEL.stepsOf(t, input.sop_id, input.rev).slice().sort((a, b) => a.seq - b.seq);
    const row = sopSteps.find(s => s.key === input.key);
    if (!row) { throw new Error('engine.moveStep: no step ' + input.key + ' in ' + input.sop_id + ' ' + input.rev); }
    let afterKey = input.after_key;
    if (input.direction !== undefined) {
      const target = K.moveTarget(sopSteps, input.key, input.direction);
      if (target.refusals) { return { refusals: target.refusals }; }
      afterKey = target.after_key;
    } else if (afterKey !== null) {
      const after = sopSteps.find(s => s.key === afterKey);
      if (!after) { throw new Error('engine.moveStep: no step ' + afterKey + ' in ' + input.sop_id + ' ' + input.rev); }
      if (after.section !== row.section) { return { refusals: [{ field: 'move', message: 'A step moves only inside its section.' }] }; }
    }
    const secRows = sopSteps.filter(s => s.section === row.section);
    const ro = NU.reorder(secRows, input.key, afterKey);
    if (ro.refusals) { return { refusals: ro.refusals }; }
    if (T.empty(input.ctx.reason)) { return { refusals: [{ field: 'reason', message: 'Reason for change is empty' }] }; }
    const byKey = {};
    for (const s of secRows) { byKey[s.key] = s; }
    const first = sopSteps.indexOf(secRows[0]);
    const inOrder = sopSteps.slice(0, first).concat(ro.order.map(k => byKey[k])).concat(sopSteps.slice(first + secRows.length));
    const steps = K.renumber(inOrder).steps.map(s => (ro.numbers[s.key] !== undefined && ro.numbers[s.key] !== s.step_no) ? Object.assign({}, s, { step_no: ro.numbers[s.key] }) : s);
    const at = ro.order.indexOf(row.key);
    const before = secRows[secRows.indexOf(row) - 1];
    const prev = at > 0 ? byKey[ro.order[at - 1]] : null;
    let hist = E.historyRows({ table: 'steps', row_id: row.key, sop_id: sop.sop_id, rev: input.rev,
      old: { row: row.step_no + (before ? ' after ' + before.step_no : ' first') }, new: { row: row.step_no + (prev ? ' after ' + prev.step_no : ' first of section ' + row.section) },
      fields: ['row'], ctx: input.ctx, after: [] });
    for (const m of ro.renumbered) { hist = E.historyRows({ table: 'steps', row_id: m.key, sop_id: sop.sop_id, rev: input.rev, old: { step_no: m.old }, new: { step_no: m.new }, fields: ['step_no'], ctx: input.ctx, after: hist }); }
    return Object.assign(afterChange(t, sop, revision, steps, hist, input.ctx), { renumbered: ro.renumbered, mentions: mentionsAfter(t, sop.sop_id, input.rev, steps, ro.renumbered) });
  }

  /* insertProcess({ tables, sop_id, rev, after_key, process_sop_id, mode, ctx }) → { refusals } or the tables to write, with
     new_keys, renumbered, first_no, last_no and the texts that name a moved step (spec/example_process_sop.md part 5) */
  function insertProcess(input) {
    need(input, ['tables', 'sop_id', 'rev', 'after_key', 'process_sop_id', 'mode', 'ctx'], 'insertProcess');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const revision = SEL.revisionOf(t, input.sop_id, input.rev);
    const r = P.insertProcess({ tables: { sops: t.sops, sop_revisions: t.sop_revisions, steps: t.steps, retired_keys: t.retired_keys }, sop_id: sop.sop_id, rev: input.rev,
      after_key: input.after_key, process_sop_id: input.process_sop_id, mode: input.mode, ctx: input.ctx });
    if (r.refusals) { return { refusals: r.refusals }; }
    const done = afterChange(t, sop, revision, r.steps, r.history, input.ctx);
    if (done.refusals) { return done; }
    return Object.assign(done, { new_keys: r.new_keys, renumbered: r.renumbered, first_no: r.first_no, last_no: r.last_no,
      mentions: mentionsAfter(t, sop.sop_id, input.rev, r.steps, r.renumbered) });
  }

  /* reviseLinked({ tables, sop_id, rev, key, ctx }) → { refusals } or the tables to write, with keys: the Standard use of key
     becomes the editor's own Revised copy ("Make it a Revised copy", part 5) */
  function reviseLinked(input) {
    need(input, ['tables', 'sop_id', 'rev', 'key', 'ctx'], 'reviseLinked');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const revision = SEL.revisionOf(t, input.sop_id, input.rev);
    const r = P.reviseLinked(SEL.stepsOf(t, sop.sop_id, input.rev), input.key, input.ctx);
    if (r.refusals) { return { refusals: r.refusals }; }
    const done = afterChange(t, sop, revision, r.steps, r.history, input.ctx);
    return done.refusals ? done : Object.assign(done, { keys: r.keys });
  }

  /* giveValue({ tables, vn_id, given, ctx }) → { refusals } or { refusals: null, new_history, links, tables: { values_needed, history } } */
  function giveValue(input) {
    need(input, ['tables', 'vn_id', 'given', 'ctx'], 'giveValue');
    const t = input.tables;
    const vn = t.values_needed.find(v => v.vn_id === input.vn_id);
    if (!vn) { throw new Error('engine.giveValue: no Values Needed row ' + input.vn_id); }
    const r = E.giveValue(vn, input.given, input.ctx);
    if (r.refusals) { return { refusals: r.refusals }; }
    const sop = t.sops.find(x => x.sop_id === vn.sop_id) || null;
    const steps = sop && sop.current_rev ? SEL.stepsOf(t, sop.sop_id, sop.current_rev) : [];
    const sections = sop && sop.current_rev ? SEL.sectionsOf(t, sop.sop_id, sop.current_rev) : [];
    return { refusals: null, new_history: r.history, links: L.vnLinks(r.vn, steps, sections),
      tables: { values_needed: SEL.mergeRows(t.values_needed, [r.vn], ['vn_id']), history: t.history.concat(r.history) } };
  }

  /* newRevision({ tables, sop_id, ctx, note }) → { refusals } or { refusals: null, rev, new_history, tables } */
  function newRevision(input) {
    need(input, ['tables', 'sop_id', 'ctx', 'note'], 'newRevision');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    if (!sop.current_rev) { throw new Error('engine.newRevision: ' + sop.sop_id + ' has no revision to copy'); }
    if (CP.isCopy(sop)) { return { refusals: [{ field: 'note', message: 'A copy has no new revision: make it the good version first (Header tab).' }] }; }
    const revision = SEL.revisionOf(t, sop.sop_id, sop.current_rev);
    const extras = {};
    for (const name of EXTRA_TABLES) { extras[name] = t[name]; }
    const r = CMP.newRevision(sop, revision, SEL.stepsOf(t, sop.sop_id, sop.current_rev), SEL.sectionsOf(t, sop.sop_id, sop.current_rev), extras, input.ctx, input.note);
    if (r.refusals) { return { refusals: r.refusals }; }
    const tables = {
      sops: SEL.mergeRows(t.sops, [r.sop], ['sop_id']), sop_revisions: t.sop_revisions.concat([r.revision]),
      steps: t.steps.concat(r.steps), sections: t.sections.concat(r.sections),
      revision_history: t.revision_history.concat([r.revision_history_row]), history: t.history.concat(r.history)
    };
    for (const name of EXTRA_TABLES) { tables[name] = t[name].concat(r.extras[name]); }
    if (!Array.isArray(t.chart_notes)) { throw new Error('engine.newRevision: table chart_notes is missing'); }
    const carried = NO.carryNotes(t.chart_notes, sop.sop_id, sop.current_rev, r.revision.rev);
    if (carried.length) { tables.chart_notes = t.chart_notes.concat(carried); }
    return { refusals: null, rev: r.revision.rev, new_history: r.history, notes_carried: carried.length, tables: tables };
  }

  /* compare({ tables, sop_id, rev, against }) → { rev, against, others, rows, counts, retired_before }; against null = the revision before rev */
  function compare(input) {
    need(input, ['tables', 'sop_id', 'rev'], 'compare');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    SEL.revisionOf(t, sop.sop_id, input.rev);
    const all = SEL.revisionsOf(t, sop.sop_id);
    const others = all.filter(r => r.rev !== input.rev).map(r => r.rev);
    const at = all.findIndex(r => r.rev === input.rev);
    const against = input.against || (at > 0 ? all[at - 1].rev : null);
    const retired = t.retired_keys.filter(r => r.sop_id === sop.sop_id);
    if (!against) { return { rev: input.rev, against: null, others: others, rows: [], counts: null, retired_before: retired }; }
    if (others.indexOf(against) < 0) { throw new Error('engine.compare: ' + sop.sop_id + ' has no revision ' + against + ' to compare against'); }
    const cmp = CMP.compareByKey(SEL.stepsOf(t, sop.sop_id, against), SEL.stepsOf(t, sop.sop_id, input.rev), retired);
    return { rev: input.rev, against: against, others: others, rows: cmp.rows, counts: cmp.counts, retired_before: [] };
  }

  /* signRevision({ tables, sop_id, rev, sign, ctx }) → { refusals } or { refusals: null, new_history, tables: { sop_revisions, history } } */
  function signRevision(input) {
    need(input, ['tables', 'sop_id', 'rev', 'sign', 'ctx'], 'signRevision');
    const t = input.tables;
    if (CP.isCopy(SEL.sopOf(t, input.sop_id))) { return copyRefusal(input.sign && input.sign.role ? input.sign.role : 'form'); }
    const r = R.signRevision(SEL.revisionOf(t, input.sop_id, input.rev), input.sign, input.ctx);
    if (r.refusals) { return { refusals: r.refusals }; }
    return { refusals: null, new_history: r.history, tables: { sop_revisions: SEL.mergeRows(t.sop_revisions, [r.revision], ['sop_id', 'rev']), history: t.history.concat(r.history) } };
  }

  /* logWalk({ tables, sop_id, rev, walk, ctx }) → { refusals } or { refusals: null, new_history, tables: { validation_log, history } } */
  function logWalk(input) {
    need(input, ['tables', 'sop_id', 'rev', 'walk', 'ctx'], 'logWalk');
    const t = input.tables;
    if (CP.isCopy(SEL.sopOf(t, input.sop_id))) { return copyRefusal('walk'); }
    const r = R.logWalk(SEL.revisionOf(t, input.sop_id, input.rev), input.walk, input.ctx);
    if (r.refusals) { return { refusals: r.refusals }; }
    return { refusals: null, new_history: r.history, tables: { validation_log: t.validation_log.concat([r.row]), history: t.history.concat(r.history) } };
  }

  /* releaseRevision({ tables, files, sop_id, ctx }) → { refusals } or { refusals: null, new_history, summary, tables } */
  /* releaseRevision({ tables, files, sop_id, ctx, accepted }): accepted = [{ no, reason }] for a floor trial release (spec/example_release.md) */
  function releaseRevision(input) {
    need(input, ['tables', 'files', 'sop_id', 'ctx'], 'releaseRevision');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    if (!sop.current_rev) { throw new Error('engine.releaseRevision: ' + sop.sop_id + ' has no revision'); }
    if (CP.isCopy(sop)) { return copyRefusal('release'); }
    const check = R.releaseCheck(t, sop.sop_id, sop.current_rev, input.files);
    const cmp = compare({ tables: t, sop_id: sop.sop_id, rev: sop.current_rev, against: null });
    const summary = cmp.against ? R.compareSummary(cmp) : 'No step changes.';
    const r = R.releaseRevision(sop, t.sop_revisions, check, summary, input.ctx, input.accepted || []);
    if (r.refusals) { return { refusals: r.refusals }; }
    const released = r.revisions.find(x => x.sop_id === sop.sop_id && x.rev === sop.current_rev);
    const rhRows = SEL.rowsOf(t, 'revision_history', sop.sop_id).filter(x => x.rev === sop.current_rev);
    const rhRow = R.releaseHistoryRow(rhRows.length ? rhRows[rhRows.length - 1] : null, summary, released.approved_by);
    const out = { refusals: null, new_history: r.history, summary: summary, tables: {
      sop_revisions: r.revisions, history: t.history.concat(r.history),
      revision_history: rhRow ? SEL.mergeRows(t.revision_history, [rhRow], ['rh_id']) : t.revision_history } };
    if (sop.sop_type !== 'Process') { return out; }
    /* a Process SOP: the new revision flows into the main SOPs that use it (example_process_sop.md part 6, build 31) */
    const s = syncAfterRelease(t, sop, input.ctx, r.history);
    out.sync_report = s.report;
    if (!s.report.length) { return out; }
    out.new_history = s.history;
    Object.assign(out.tables, { steps: s.steps, retired_keys: s.retired_keys, chart_notes: s.chart_notes, sops: s.sops, history: t.history.concat(s.history) });
    return out;
  }

  /* syncAfterRelease(t, sop, ctx, after) → { steps, retired_keys, chart_notes, sops, history (after plus the new rows), report: [lines] }:
     every revision of a main SOP that is not Superseded (Draft, Checked, Approved or Released: Samrat's 3b) and uses the Process SOP
     takes its new revision through syncRevision; the notes go on the revision the editors open (current_rev) only; the same new step
     of the same use gets the same key in every revision of a main SOP;
     a key is retired only when no revision of its SOP that is not Superseded still has it; the main SOP turns Edited in Builder */
  function syncAfterRelease(t, sop, ctx, after) {
    const procSteps = t.steps.filter(x => x.sop_id === sop.sop_id);
    const reason = sop.sop_id + ' ' + sop.current_rev + ' released';
    let hist = after.slice(), steps = t.steps, notes = t.chart_notes, sops = t.sops, newRetired = [];
    let nextNote = ctx.next_note_id;
    const memos = {}, report = [];
    const nextHist = () => (hist.length ? hist[hist.length - 1].hist_id + 1 : ctx.next_hist_id);
    const revs = t.sop_revisions.filter(x => x.sop_id !== sop.sop_id && x.status !== 'Superseded');
    for (const mr of revs) {
      const revSteps = steps.filter(x => x.sop_id === mr.sop_id && x.rev === mr.rev);
      if (!revSteps.some(x => x.link_sop === sop.sop_id)) { continue; }
      const msop = SEL.sopOf({ sops: sops }, mr.sop_id);
      /* build 39: the keys of the whole family (the good version and its copies), and one memo per family */
      const fam = SEL.familyOf({ sops: sops }, msop.sop_id);
      const res = P.syncRevision({ sop: { sop_id: msop.sop_id, short: msop.short }, steps: revSteps, proc_sop_id: sop.sop_id, new_rev: sop.current_rev,
        proc_steps: procSteps, used_keys: steps.filter(x => fam.indexOf(x.sop_id) >= 0).map(x => x.key), retired: t.retired_keys.concat(newRetired),
        memo: memos[fam[0]] || {}, with_notes: mr.rev === msop.current_rev, ctx: Object.assign({}, ctx, { next_hist_id: nextHist(), next_note_id: nextNote }) });
      if (!res) { continue; }
      memos[fam[0]] = res.memo;
      steps = steps.filter(x => !(x.sop_id === mr.sop_id && x.rev === mr.rev)).concat(res.steps);
      newRetired = newRetired.concat(res.retired.filter(x => !newRetired.some(y => y.key === x.key)));
      notes = notes.concat(res.notes);
      nextNote += res.notes.length;
      hist = hist.concat(res.history);
      if (msop.edited_in !== 'Builder') {
        const ns = Object.assign({}, msop, { edited_in: 'Builder' });
        hist = E.historyRows({ table: 'sops', row_id: msop.sop_id, sop_id: msop.sop_id, rev: null, old: msop, new: ns, fields: ['edited_in'], ctx: Object.assign({}, ctx, { reason: reason }), after: hist });
        sops = SEL.mergeRows(sops, [ns], ['sop_id']);
      }
      report.push(res.report);
    }
    const live = {};
    for (const x of steps) { const r = t.sop_revisions.find(v => v.sop_id === x.sop_id && v.rev === x.rev); if (r && r.status !== 'Superseded') { live[x.sop_id + '|' + x.key] = true; } }
    const retired = newRetired.filter(x => !live[x.sop_id + '|' + x.key]);
    return { steps: steps, retired_keys: t.retired_keys.concat(retired), chart_notes: notes, sops: sops, history: hist, report: report };
  }

  /* ---- copies (spec/example_copy.md, build 39): the pieces of engine/copies.js, called through here ---- */
  /* saveCopy({ tables, sop_id, name, ctx }) → { refusals } or { refusals: null, sop_id, new_history, tables }; ctx needs next_note_id */
  const saveCopy = input => CP.saveCopy(input);
  /* compareCopy({ tables, sop_id }) → the compare of the copy against its good version, in the shape of compare() */
  const compareCopy = input => CP.compareCopy(input);
  /* promoteCopy({ tables, sop_id, note, ctx }) → { refusals } or { refusals: null, sop_id, rev, new_history, tables }; ctx needs next_rh_id */
  const promoteCopy = input => CP.promoteCopy(input);
  /* deleteCopy({ tables, sop_id, ctx }) → { refusals: null, new_history, tables } */
  const deleteCopy = input => CP.deleteCopy(input);

  /* floorView({ tables, sop_id, rev, made_on }) → everything the floor copy prints, in print order */
  function floorView(input) {
    need(input, ['tables', 'sop_id', 'rev', 'made_on'], 'floorView');
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const rev = SEL.revisionOf(t, input.sop_id, input.rev);
    const steps = SEL.stepsOf(t, input.sop_id, input.rev);
    const sections = SEL.sectionsOf(t, input.sop_id, input.rev);
    const forRev = name => SEL.rowsOf(t, name, sop.sop_id, input.rev);
    const pictures = forRev('pictures');
    const copy = CP.copyInfo(t, sop.sop_id);
    return {
      sop: sop, rev: rev, made_on: input.made_on,
      /* build 39: a copy prints for review only (the band on top), with the revision history of its good version */
      copy: copy, copy_band: copy ? 'COPY "' + copy.name + '" of ' + copy.of + ': for review only, never for the floor.' : null,
      revision_history: SEL.rowsOf(t, 'revision_history', copy ? copy.of : sop.sop_id),
      safety_items: forRev('safety_items'), materials: forRev('materials'), tools: forRev('tools'), pictures: pictures,
      sections: sections.map(sec => Object.assign({}, sec, { steps: SEL.stepsInSection(steps, sec.section).map(s => FL.floorStep(s, pictures)) })),
      record_sheet: L.recordSheetRows(steps, sections)
    };
  }

  return { sopList: sopList, sopView: sopView, sectionView: sectionView, saveStep: saveStep, addStep: addStep, saveNewStep: saveNewStep,
    clubSteps: clubSteps, splitStep: splitStep, moveStep: moveStep, checkGujarati: checkGujarati, photoRef: photoRef, insertProcess: insertProcess, reviseLinked: reviseLinked, giveValue: giveValue, newRevision: newRevision, compare: compare,
    signRevision: signRevision, logWalk: logWalk, releaseRevision: releaseRevision, floorView: floorView, textsOf: textsOf,
    saveCopy: saveCopy, compareCopy: compareCopy, promoteCopy: promoteCopy, deleteCopy: deleteCopy, COPY_LOCK: COPY_LOCK };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
