/* SOP Builder logic pieces for copies of an SOP (spec/example_copy.md,
   build 39, contract 1.5): copyIdFor, saveCopy, compareCopy, promoteCopy
   (Make this the good version) and deleteCopy. A copy is an SOP row with
   copy_of (the good version) and copy_name; its rows carry the copy's
   sop_id and the revision label it was saved from. Nothing done in a copy
   changes the good version, and a copy never reaches the floor. Build 50
   (spec/example_rights.md): promotePlan (a copy replaces the newest
   revision while it is not released, else it becomes the next one),
   promotedSince (copies made the good version after a copy was saved),
   compareCopy against another copy of the same SOP. Build 58
   (spec/example_edit_online.md part 10): stepMarks (the red and blue
   marks on a copy's steps), stepCompare (Compare for one step). Pure.
   Classic script (global ENGINE_COPIES); module in Node. Answer keys:
   tests/golden20.js, golden28.js, golden34.js. */
const ENGINE_COPIES = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const R = (typeof ENGINE_RELEASE !== 'undefined') ? ENGINE_RELEASE : require('./release.js');
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const RT = (typeof ENGINE_RIGHTS !== 'undefined') ? ENGINE_RIGHTS : require('./rights.js');
  const CMP = (typeof ENGINE_COMPARE !== 'undefined') ? ENGINE_COMPARE : require('./compare.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const copy = v => JSON.parse(JSON.stringify(v));
  const refuse = (field, message) => ({ refusals: [{ field: field, message: message }] });
  function need(input, fields, place) {
    if (!input || typeof input !== 'object') { fail(place, 'input is missing'); }
    for (const f of fields) { if (input[f] === undefined) { fail(place, 'input.' + f + ' is missing'); } }
    for (const name of ['sops', 'sop_revisions', 'steps', 'retired_keys', 'history']) {
      if (!Array.isArray(input.tables[name])) { fail(place, 'table ' + name + ' is missing'); }
    }
  }
  /* the rows of one revision that a copy carries, besides the SOP and revision rows and the open notes */
  const PER_REV = ['steps', 'sections', 'safety_items', 'materials', 'tools', 'worked_examples', 'ref_tables', 'pictures'];
  /* the SOP fields that stay the good version's when a copy becomes the good version; the rest (title, level, who does it,
     input, output) come from the copy */
  /* owner (contract 1.6) is a copy's own: the good version keeps its own (none) */
  const KEEP_GOOD = ['sop_id', 'sop_type', 'short', 'status', 'current_rev', 'edited_in', 'copy_of', 'copy_name', 'owner'];
  const SOP_FIELDS = TYPESX.tables.sops.fields.map(f => f.name).filter(n => ['sop_id', 'copy_of', 'copy_name', 'owner'].indexOf(n) < 0);
  const NAME_MAX = 40;
  const isCopy = sop => !empty(sop.copy_of);
  const today = ctx => String(ctx.now).slice(0, 10);
  const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function keyNo(key) { const m = /^([A-Z0-9]+)-(\d{4})$/.exec(String(key || '')); return m ? { short: m[1], n: Number(m[2]) } : null; }
  /* retiredRow(key, rows) → the retired row that covers the key (one key or a range), or null */
  function retiredRow(key, rows) {
    const k = keyNo(key);
    if (!k) { return rows.find(r => r.key === key) || null; }
    return rows.find(function (r) {
      const a = keyNo(r.key);
      if (!a || a.short !== k.short) { return false; }
      const b = empty(r.range_to) ? a : keyNo(r.range_to);
      return k.n >= a.n && k.n <= (b ? b.n : a.n);
    }) || null;
  }
  function theCopy(t, sopId, place) {
    const cp = SEL.sopOf(t, sopId);
    if (!isCopy(cp)) { fail(place, cp.sop_id + ' is not a copy'); }
    if (empty(cp.current_rev)) { fail(place, 'copy ' + cp.sop_id + ' has no revision'); }
    return cp;
  }

  /* saved(tables, cp) → { from, at, who } of the History row Save a copy wrote ("added: copy <name> of <SOP> <rev>"), or nulls */
  function saved(tables, cp) {
    const lead = 'added: copy ' + cp.copy_name + ' of ';
    const h = (tables.history || []).find(x => x.sop_id === cp.sop_id && x.table === 'sops' && x.row_id === cp.sop_id && x.field === 'row' && String(x.new_value || '').indexOf(lead) === 0);
    return h ? { from: String(h.new_value).slice(lead.length), at: h.at, who: h.who } : { from: null, at: null, who: null };
  }
  /* copyInfo(tables, sopId) → null for an SOP that is not a copy; else { of, name, good_rev, saved_from, saved_at, saved_by, line,
     promote (promotePlan), since (promotedSince) } */
  function copyInfo(tables, sopId) {
    const cp = SEL.sopOf(tables, sopId);
    if (!isCopy(cp)) { return null; }
    const good = SEL.sopOf(tables, cp.copy_of);
    const sv = saved(tables, cp);
    return { of: good.sop_id, name: cp.copy_name, good_rev: good.current_rev, saved_from: sv.from, saved_at: sv.at, saved_by: sv.who,
      line: 'COPY of ' + good.sop_id + ': ' + cp.copy_name, promote: promotePlan(tables, sopId), since: promotedSince(tables, sopId) };
  }
  /* promotePlan(tables, copyId) → { kind, rev, of, newest, status }: build 50 (Samrat 14 Nov, answer g): while the newest revision of the
     good version is not released (Draft, Checked, Approved) the copy replaces it and the number stays; else it becomes the next revision */
  const CLOSED = ['Released', 'Superseded'];
  function promotePlan(tables, copyId) {
    const cp = theCopy(tables, copyId, 'promotePlan');
    const revs = SEL.revisionsOf(tables, cp.copy_of);
    if (!revs.length) { fail('promotePlan', cp.copy_of + ' has no revision'); }
    const newest = revs[revs.length - 1];
    const next = CLOSED.indexOf(newest.status) >= 0;
    return { kind: next ? 'next' : 'replace', rev: next ? R.nextRev(newest.rev) : newest.rev, of: cp.copy_of, newest: newest.rev, status: newest.status };
  }
  /* promotedSince(tables, copyId) → [{ at, who, copy_name, rev, kind, line }]: the copies made the good version after this copy was saved
     (the History rows "replaced: Rev 02 by copy <name>" and "added: Rev 03 from copy <name>" of the good version), oldest first */
  function promotedSince(tables, copyId) {
    const cp = theCopy(tables, copyId, 'promotedSince');
    const lead = 'added: copy ' + cp.copy_name + ' of ';
    const sv = (tables.history || []).find(x => x.sop_id === cp.sop_id && x.table === 'sops' && x.row_id === cp.sop_id && x.field === 'row' && String(x.new_value || '').indexOf(lead) === 0);
    const from = sv ? sv.hist_id : null;
    const out = [];
    for (const h of (tables.history || []).slice().sort((a, b) => a.hist_id - b.hist_id)) {
      if (h.sop_id !== cp.copy_of || h.table !== 'sop_revisions' || h.field !== 'row' || (from !== null && h.hist_id <= from)) { continue; }
      const v = String(h.new_value || '');
      const m = /^replaced: (Rev \d+) by copy (.+)$/.exec(v) || /^added: (Rev \d+) from copy (.+)$/.exec(v);
      if (!m) { continue; }
      const kind = v.indexOf('replaced: ') === 0 ? 'replace' : 'next';
      out.push({ at: h.at, who: h.who, copy_name: m[2], rev: m[1], kind: kind,
        line: 'copy ' + m[2] + ' (' + h.who + ') ' + (kind === 'replace' ? 'replaced ' : 'became ') + cp.copy_of + ' ' + m[1] + ' on ' + String(h.at).slice(0, 16).replace('T', ' ') });
    }
    return out;
  }
  /* copiesOf(tables, sopId) → the copies of the SOP's good version, in copy-number order: [{ sop_id, copy_name, rev, saved_from, saved_at, saved_by }] */
  function copiesOf(tables, sopId) {
    return SEL.familyOf(tables, sopId).slice(1).map(function (id) {
      const cp = SEL.sopOf(tables, id), sv = saved(tables, cp);
      return { sop_id: id, copy_name: cp.copy_name, rev: cp.current_rev, saved_from: sv.from, saved_at: sv.at, saved_by: sv.who };
    });
  }
  /* familyOrder(sops) → the SOP rows in their order, each good version followed by its copies (copy-number order); a copy whose good
     version is missing stays at the end */
  function familyOrder(sops) {
    const no = s => { const m = /-COPY(\d+)$/.exec(String(s.sop_id)); return m ? Number(m[1]) : 0; };
    const copiesOfId = {};
    for (const s of sops) { if (isCopy(s)) { (copiesOfId[s.copy_of] = copiesOfId[s.copy_of] || []).push(s); } }
    const out = [], placed = {};
    for (const s of sops) {
      if (isCopy(s)) { continue; }
      out.push(s);
      for (const c of (copiesOfId[s.sop_id] || []).slice().sort((a, b) => no(a) - no(b))) { out.push(c); placed[c.sop_id] = true; }
    }
    for (const s of sops) { if (isCopy(s) && !placed[s.sop_id]) { out.push(s); } }
    return out;
  }

  /* copyIdFor(tables, goodId) → "<goodId>-COPYn": the next number never used, also by a deleted copy (its History rows stay) */
  function copyIdFor(tables, goodId) {
    const re = new RegExp('^' + escapeRe(goodId) + '-COPY(\\d+)$');
    let top = 0;
    const see = v => { const m = re.exec(String(v === null || v === undefined ? '' : v)); if (m) { top = Math.max(top, Number(m[1])); } };
    for (const s of tables.sops) { see(s.sop_id); }
    for (const h of tables.history || []) { see(h.sop_id); see(h.row_id); }
    return goodId + '-COPY' + (top + 1);
  }

  /* saveCopy({ tables, sop_id, name, ctx }) → { refusals } or { refusals: null, sop_id, new_history, tables }: the SOP's current
     revision as it is now (sections, steps, lists, open notes) under a new SOP ID; the good version does not change; ctx needs
     next_note_id when the revision has open notes */
  function saveCopy(input) {
    need(input, ['tables', 'sop_id', 'name', 'ctx'], 'saveCopy');
    const t = input.tables, ctx = input.ctx;
    E.checkCtx(ctx, 'saveCopy');
    const src = SEL.sopOf(t, input.sop_id);
    if (empty(src.current_rev)) { fail('saveCopy', src.sop_id + ' has no revision to copy'); }
    const good = isCopy(src) ? src.copy_of : src.sop_id;
    const name = String(input.name === null || input.name === undefined ? '' : input.name).trim().replace(/\s+/g, ' ');
    if (!name) { return refuse('name', 'Copy name is empty. Example: Club trial 13 Nov.'); }
    if (name.length > NAME_MAX) { return refuse('name', 'Copy name: ' + NAME_MAX + ' letters at most.'); }
    const same = t.sops.find(s => s.copy_of === good && String(s.copy_name || '').trim().toLowerCase() === name.toLowerCase());
    if (same) { return refuse('name', 'A copy named ' + same.copy_name + ' already exists: ' + same.sop_id + '.'); }
    const id = copyIdFor(t, good);
    const rev = src.current_rev;
    const revision = SEL.revisionOf(t, src.sop_id, rev);
    /* contract 1.6: the copy is owned by the one who saves it (a copy of someone else's copy too) */
    const sop = Object.assign(copy(src), { sop_id: id, copy_of: good, copy_name: name, edited_in: 'Builder', owner: ctx.who });
    const revRow = Object.assign(copy(revision), { sop_id: id, status: 'Draft', checked_by: null, checked_date: null, approved_by: null, approved_date: null,
      release_note: null, revision_note: 'Copy ' + name + ' of ' + src.sop_id + ' ' + rev + ', saved ' + today(ctx) + ' by ' + ctx.who + '.' });
    const tables = { sops: t.sops.concat([sop]), sop_revisions: t.sop_revisions.concat([revRow]) };
    for (const table of PER_REV) {
      if (!Array.isArray(t[table])) { fail('saveCopy', 'table ' + table + ' is missing'); }
      tables[table] = t[table].concat(t[table].filter(r => r.sop_id === src.sop_id && r.rev === rev).map(r => Object.assign(copy(r), { sop_id: id })));
    }
    if (!Array.isArray(t.chart_notes)) { fail('saveCopy', 'table chart_notes is missing'); }
    const open = t.chart_notes.filter(n => n.sop_id === src.sop_id && n.rev === rev && n.status === 'Open');
    if (open.length && !Number.isInteger(ctx.next_note_id)) { fail('saveCopy', 'ctx.next_note_id (the next note number) is missing'); }
    tables.chart_notes = t.chart_notes.concat(open.map((n, i) => Object.assign(copy(n), { note_id: ctx.next_note_id + i, sop_id: id })));
    const history = E.historyRows({ table: 'sops', row_id: id, sop_id: id, rev: null, old: { row: null }, new: { row: 'added: copy ' + name + ' of ' + src.sop_id + ' ' + rev },
      fields: ['row'], ctx: Object.assign({}, ctx, { reason: 'Copy ' + name }), after: [] });
    tables.history = t.history.concat(history);
    return { refusals: null, sop_id: id, new_history: history, tables: tables };
  }

  /* compareCopy({ tables, sop_id, against }) → { rev, against, against_id, choices, copy_of, copy_name, others, rows, counts,
     retired_before }: the copy's steps against the good version's current revision (against null, empty or the good version's ID) or
     against another copy of the same SOP (build 50), by Key (example.md part 10); choices = what the copy can be compared with: the
     good version, then the other copies with their owners; a step that is not in one of them says which */
  function compareCopy(input) {
    if (!input || !input.tables) { fail('compareCopy', 'input.tables is missing'); }
    const t = input.tables;
    const cp = theCopy(t, input.sop_id, 'compareCopy');
    const good = SEL.sopOf(t, cp.copy_of);
    const owner = id => RT.ownerOf(t, id);
    const label = s => 'copy ' + s.copy_name + (owner(s.sop_id) ? ' (' + owner(s.sop_id) + ')' : '');
    const goodLabel = good.sop_id + ' ' + good.current_rev;
    const choices = [{ id: '', label: 'the good version ' + goodLabel }].concat(SEL.familyOf(t, good.sop_id).slice(1).filter(id => id !== cp.sop_id).map(id => ({ id: id, label: label(SEL.sopOf(t, id)) })));
    const againstId = empty(input.against) || input.against === good.sop_id ? null : input.against;
    let other = null;
    if (againstId !== null) {
      if (againstId === cp.sop_id) { fail('compareCopy', cp.sop_id + ' cannot be compared with itself'); }
      other = SEL.sopOf(t, againstId);
      if (other.copy_of !== good.sop_id) { fail('compareCopy', againstId + ' is not a copy of ' + good.sop_id); }
    }
    const asGood = s => Object.assign({}, s, { sop_id: good.sop_id });
    const oldSteps = other ? SEL.stepsOf(t, other.sop_id, other.current_rev).map(asGood) : SEL.stepsOf(t, good.sop_id, good.current_rev);
    const newSteps = SEL.stepsOf(t, cp.sop_id, cp.current_rev).map(asGood);
    const cmp = CMP.compareByKey(oldSteps, newSteps, t.retired_keys.filter(r => r.sop_id === cp.sop_id));
    const rows = cmp.rows.map(function (r) {
      if (r.change === 'New') { return Object.assign({}, r, { note: other ? 'Not in copy ' + other.copy_name : 'Made in copy ' + cp.copy_name }); }
      if (r.change === 'Retired' && empty(r.note)) { return Object.assign({}, r, { note: 'Not in copy ' + cp.copy_name }); }
      return r;
    });
    return { rev: cp.current_rev, against: other ? label(other) : goodLabel, against_id: againstId, choices: choices, copy_of: good.sop_id, copy_name: cp.copy_name,
      others: [], rows: rows, counts: cmp.counts, retired_before: [] };
  }

  /* ---- build 58 (example_edit_online.md part 10, Vishal 2026-11-20, "b"): the marks on the steps of a copy ---- */
  /* family(t, cp) → { good, goodSteps (by Key, the good version's current revision), others: [{ sop, owner, steps (by Key) }] } */
  function family(t, cp) {
    const good = SEL.sopOf(t, cp.copy_of);
    const byKey = list => { const o = {}; for (const s of list) { o[s.key] = s; } return o; };
    const others = SEL.familyOf(t, good.sop_id).slice(1).filter(id => id !== cp.sop_id).map(function (id) {
      const sop = SEL.sopOf(t, id);
      return { sop: sop, owner: RT.ownerOf(t, id), steps: byKey(SEL.stepsOf(t, id, sop.current_rev)) };
    });
    return { good: good, goodSteps: byKey(SEL.stepsOf(t, good.sop_id, good.current_rev)), others: others };
  }
  /* behind(f, st) → the other copies that changed the step (theirs differs from the good version's, or the good version has none) and
     differ from this copy's step: [{ sop_id, copy_name, owner, fields, step }], copy-number order */
  function behind(f, st) {
    const g = f.goodSteps[st.key] || null;
    const out = [];
    for (const o of f.others) {
      const x = o.steps[st.key];
      if (!x || (g && !CMP.differ(g, x).length)) { continue; }
      const fields = CMP.differ(st, x);
      if (fields.length) { out.push({ sop_id: o.sop.sop_id, copy_name: o.sop.copy_name, owner: o.owner, fields: fields, step: x }); }
    }
    return out;
  }
  /* stepMarks({ tables, sop_id }) → { good, count, marks: { Key: { red, red_new, red_fields, blue, blue_by: [{ sop_id, copy_name, owner,
     fields }] } } }: the steps of the copy's revision that carry a mark; red = differs from the good version's current revision in the
     fields Compare compares (red_fields), or a step the good version has not (red_new); blue = another copy changed the step and
     differs from this one (blue_by, with the fields that differ from this copy) */
  function stepMarks(input) {
    if (!input || !input.tables) { fail('stepMarks', 'input.tables is missing'); }
    const t = input.tables;
    const cp = theCopy(t, input.sop_id, 'stepMarks');
    const f = family(t, cp);
    const marks = {};
    for (const st of SEL.stepsOf(t, cp.sop_id, cp.current_rev)) {
      const g = f.goodSteps[st.key] || null;
      const redFields = g ? CMP.differ(g, st) : [];
      const by = behind(f, st).map(b => ({ sop_id: b.sop_id, copy_name: b.copy_name, owner: b.owner, fields: b.fields }));
      if (!g || redFields.length || by.length) {
        marks[st.key] = { red: !g || redFields.length > 0, red_new: !g, red_fields: redFields, blue: by.length > 0, blue_by: by };
      }
    }
    return { good: f.good.sop_id + ' ' + f.good.current_rev, count: Object.keys(marks).length, marks: marks };
  }
  /* stepCompare({ tables, sop_id, key }) → { key, step_no, columns: [{ sop_id, kind (this, good, copy), label, missing, step_no }], rows:
     [{ field, label, values }] }: one step of the copy beside the good version's and the copies' behind its blue mark; rows = the
     fields Compare compares whose text is not the same in every column; values as text, null where empty or missing */
  function stepCompare(input) {
    if (!input || !input.tables) { fail('stepCompare', 'input.tables is missing'); }
    const t = input.tables;
    const cp = theCopy(t, input.sop_id, 'stepCompare');
    const mine = SEL.stepsOf(t, cp.sop_id, cp.current_rev).find(s => s.key === input.key);
    if (!mine) { fail('stepCompare', input.key + ' is not a step of copy ' + cp.copy_name); }
    const f = family(t, cp);
    const g = f.goodSteps[mine.key] || null;
    const cols = [{ sop_id: cp.sop_id, kind: 'this', label: 'This copy: ' + cp.copy_name, step: mine },
      { sop_id: f.good.sop_id, kind: 'good', label: 'The good version: ' + f.good.sop_id + ' ' + f.good.current_rev, step: g }]
      .concat(behind(f, mine).map(b => ({ sop_id: b.sop_id, kind: 'copy', label: 'Copy ' + b.copy_name + (b.owner ? ' (' + b.owner + ')' : ''), step: b.step })));
    const text = (c, field) => (c.step ? E.asText(c.step[field]) : null);
    const rows = CMP.COMPARED.filter(field => cols.some(c => text(c, field) !== text(cols[0], field)))
      .map(field => ({ field: field, label: E.LABEL[field] || field, values: cols.map(c => text(c, field)) }));
    return { key: mine.key, step_no: mine.step_no, rows: rows,
      columns: cols.map(c => ({ sop_id: c.sop_id, kind: c.kind, label: c.label, missing: !c.step, step_no: c.step ? c.step.step_no : null })) };
  }

  /* promoteCopy({ tables, sop_id, note, ctx }) → { refusals } or { refusals: null, sop_id, rev, kind, new_history, tables }: Make this the
     good version. kind next (build 39): the copy as the next revision of the good version (a Draft, prepared by ctx.who, the same
     Keys). kind replace (build 50, example_rights.md part 7): the newest revision is not released, so the copy goes in its place under
     the same number; its sign-offs are cleared; the draft's open notes from before the copy was saved are marked Deleted. Either way
     one revision history row more, and the copy's rows are removed; ctx needs next_rh_id */
  const REV_FIELDS = TYPESX.tables.sop_revisions.fields.map(f => f.name).filter(n => n !== 'sop_id' && n !== 'rev');
  /* vnOfSop(tables, sopId) → the Values Needed rows the SOP shows: its own; a copy: the good version's under the copy's SOP ID (so they link to
     its steps) and, since build 64, the copy's own rows (from its draft file: example_draft_file.md part 12) */
  function vnOfSop(tables, sopId) {
    const sop = SEL.sopOf(tables, sopId), rows = tables.values_needed || [];
    if (!isCopy(sop)) { return rows.filter(v => v.sop_id === sop.sop_id); }
    return rows.filter(v => v.sop_id === sop.copy_of).map(v => Object.assign({}, v, { sop_id: sop.sop_id })).concat(rows.filter(v => v.sop_id === sop.sop_id));
  }

  function promoteCopy(input) {
    need(input, ['tables', 'sop_id', 'note', 'ctx'], 'promoteCopy');
    const t = input.tables, ctx = input.ctx;
    E.checkCtx(ctx, 'promoteCopy');
    const cp = theCopy(t, input.sop_id, 'promoteCopy');
    if (empty(input.note)) { return refuse('note', 'Revision note is empty: say what changed and why'); }
    if (!Number.isInteger(ctx.next_rh_id)) { fail('promoteCopy', 'ctx.next_rh_id (the next revision history id) is missing'); }
    const good = SEL.sopOf(t, cp.copy_of);
    const name = cp.copy_name;
    const note = String(input.note).trim();
    const day = today(ctx);
    const plan = promotePlan(t, cp.sop_id);
    const rev = plan.rev, replace = plan.kind === 'replace';
    const isCp = r => r.sop_id === cp.sop_id;
    const dropGood = r => replace && r.sop_id === good.sop_id && r.rev === rev;
    const cpSteps = SEL.stepsOf(t, cp.sop_id, cp.current_rev);
    const goodRetired = t.retired_keys.filter(r => r.sop_id === good.sop_id);
    /* a step the good version retired after the copy was saved cannot come back with the same Key */
    for (const s of cpSteps) {
      const gone = retiredRow(s.key, goodRetired);
      if (gone) {
        return refuse('note', 'Step ' + s.step_no + ' (' + s.key + ') was retired in ' + good.sop_id + ' ' + gone.retired_in + ' after the copy was saved' +
          (empty(gone.reason) ? '' : ' (' + gone.reason + ')') + '. Remove step ' + s.step_no + ' from the copy first.');
      }
    }
    const cpRetired = t.retired_keys.filter(isCp);
    const inCopy = {};
    for (const s of cpSteps) { inCopy[s.key] = true; }
    const moved = cpRetired.filter(r => !retiredRow(r.key, goodRetired)).map(r => Object.assign(copy(r), { sop_id: good.sop_id, retired_in: rev }));
    const missing = SEL.stepsOf(t, good.sop_id, replace ? rev : good.current_rev).filter(s => !inCopy[s.key] && !retiredRow(s.key, cpRetired))
      .map(s => ({ key: s.key, sop_id: good.sop_id, range_to: null, retired_in: rev, reason: 'Not in copy ' + name, source: 'Builder: ' + ctx.who + ' ' + day }));
    const newRev = Object.assign(copy(SEL.revisionOf(t, cp.sop_id, cp.current_rev)), { sop_id: good.sop_id, rev: rev, status: 'Draft', rev_date: day,
      prepared_by: ctx.who, checked_by: null, checked_date: null, approved_by: null, approved_date: null, revision_note: note, release_note: null });
    const oldRev = replace ? SEL.revisionOf(t, good.sop_id, rev) : null;
    const newGood = copy(cp);
    for (const f of KEEP_GOOD) { if (f in good) { newGood[f] = good[f]; } else { delete newGood[f]; } }
    newGood.current_rev = rev;
    newGood.edited_in = 'Builder';
    const relabel = r => Object.assign(copy(r), { sop_id: good.sop_id, rev: rev });
    const revRows = t.sop_revisions.filter(r => !isCp(r));
    const tables = {
      sops: t.sops.filter(s => !isCp(s)).map(s => (s.sop_id === good.sop_id ? newGood : s)),
      sop_revisions: replace ? revRows.map(r => (dropGood(r) ? newRev : r)) : revRows.concat([newRev])
    };
    for (const table of PER_REV) {
      if (!Array.isArray(t[table])) { fail('promoteCopy', 'table ' + table + ' is missing'); }
      tables[table] = t[table].filter(r => !isCp(r) && !dropGood(r)).concat(t[table].filter(r => isCp(r) && r.rev === cp.current_rev).map(relabel));
    }
    if (!Array.isArray(t.chart_notes)) { fail('promoteCopy', 'table chart_notes is missing'); }
    /* replace: the draft's open notes written before the copy was saved went into the copy; the copy's open notes stand in for them */
    const savedTime = saved(t, cp).at;
    const before = n => !empty(savedTime) && !empty(n.written_at) && Date.parse(n.written_at) <= Date.parse(savedTime);
    const deleted = [];
    const goodNotes = t.chart_notes.filter(n => !isCp(n)).map(function (n) {
      if (!(dropGood(n) && n.status === 'Open' && before(n))) { return n; }
      const d = Object.assign(copy(n), { status: 'Deleted', closed_by: ctx.who, closed_at: ctx.now });
      deleted.push({ old: n, new: d });
      return d;
    });
    tables.chart_notes = goodNotes.concat(t.chart_notes.filter(n => isCp(n) && n.rev === cp.current_rev && n.status === 'Open').map(relabel));
    tables.retired_keys = t.retired_keys.filter(r => !isCp(r)).concat(moved, missing);
    if (!Array.isArray(t.revision_history)) { fail('promoteCopy', 'table revision_history is missing'); }
    tables.revision_history = t.revision_history.concat([{ rh_id: ctx.next_rh_id, sop_id: good.sop_id, rev: rev, date: day, what_changed: note, changed_by: ctx.who, approved_by: R.TO_SIGN }]);
    const ctx2 = Object.assign({}, ctx, { reason: note });
    const revRowId = good.sop_id + ' ' + rev;
    let history = replace
      ? E.historyRows({ table: 'sop_revisions', row_id: revRowId, sop_id: good.sop_id, rev: rev, old: { row: rev }, new: { row: 'replaced: ' + rev + ' by copy ' + name }, fields: ['row'], ctx: ctx2, after: [] })
      : E.historyRows({ table: 'sop_revisions', row_id: revRowId, sop_id: good.sop_id, rev: rev, old: { row: null }, new: { row: 'added: ' + rev + ' from copy ' + name }, fields: ['row'], ctx: ctx2, after: [] });
    if (replace) { history = E.historyRows({ table: 'sop_revisions', row_id: revRowId, sop_id: good.sop_id, rev: rev, old: oldRev, new: newRev, fields: REV_FIELDS, ctx: ctx2, after: history }); }
    history = E.historyRows({ table: 'sops', row_id: good.sop_id, sop_id: good.sop_id, rev: null, old: good, new: newGood, fields: SOP_FIELDS, ctx: ctx2, after: history });
    for (const d of deleted) {
      history = E.historyRows({ table: 'chart_notes', row_id: d.old.note_id + ' ' + d.old.rev, sop_id: good.sop_id, rev: rev, old: d.old, new: d.new, fields: ['status'], ctx: ctx2, after: history });
    }
    /* build 64: the copy's own Values Needed rows (from its draft file) go to the good version */
    const ownVn = (t.values_needed || []).filter(isCp);
    if (ownVn.length) {
      tables.values_needed = t.values_needed.map(v => (isCp(v) ? Object.assign(copy(v), { sop_id: good.sop_id }) : v));
      for (const v of ownVn) {
        history = E.historyRows({ table: 'values_needed', row_id: v.vn_id, sop_id: good.sop_id, rev: null, old: { sop_id: cp.sop_id }, new: { sop_id: good.sop_id }, fields: ['sop_id'], ctx: ctx2, after: history });
      }
    }
    history = E.historyRows({ table: 'sops', row_id: cp.sop_id, sop_id: cp.sop_id, rev: null, old: { row: 'copy ' + name },
      new: { row: 'removed: copy ' + name + ', now ' + rev + ' of ' + good.sop_id }, fields: ['row'], ctx: ctx2, after: history });
    tables.history = t.history.concat(history);
    return { refusals: null, sop_id: good.sop_id, rev: rev, kind: plan.kind, new_history: history, tables: tables };
  }

  /* deleteCopy({ tables, sop_id, ctx }) → { refusals: null, new_history, tables }: every row of the copy goes (History stays); a key
     made only in the copy is retired on the good version so it is never used again; build 64: the copy's own Values Needed rows go too */
  function deleteCopy(input) {
    need(input, ['tables', 'sop_id', 'ctx'], 'deleteCopy');
    const t = input.tables, ctx = input.ctx;
    E.checkCtx(ctx, 'deleteCopy');
    const cp = theCopy(t, input.sop_id, 'deleteCopy');
    const good = SEL.sopOf(t, cp.copy_of);
    const name = cp.copy_name;
    const isCp = r => r.sop_id === cp.sop_id;
    const fam = SEL.familyOf(t, good.sop_id).filter(id => id !== cp.sop_id);
    const kept = {};
    for (const s of t.steps) { if (fam.indexOf(s.sop_id) >= 0) { kept[s.key] = true; } }
    const otherRetired = t.retired_keys.filter(r => !isCp(r));
    const own = [];
    for (const k of t.steps.filter(isCp).map(s => s.key).concat(t.retired_keys.filter(isCp).map(r => r.key))) {
      if (own.indexOf(k) < 0 && !kept[k] && !retiredRow(k, otherRetired)) { own.push(k); }
    }
    const retire = own.map(k => ({ key: k, sop_id: good.sop_id, range_to: null, retired_in: good.current_rev, reason: 'Made in copy ' + name + '; the copy was deleted',
      source: 'Builder: ' + ctx.who + ' ' + today(ctx) }));
    const tables = { sops: t.sops.filter(s => !isCp(s)), sop_revisions: t.sop_revisions.filter(r => !isCp(r)) };
    for (const table of PER_REV.concat(['chart_notes'])) {
      if (!Array.isArray(t[table])) { fail('deleteCopy', 'table ' + table + ' is missing'); }
      tables[table] = t[table].filter(r => !isCp(r));
    }
    tables.retired_keys = otherRetired.concat(retire);
    const ctx2 = Object.assign({}, ctx, { reason: 'Delete copy ' + name });
    let history = E.historyRows({ table: 'sops', row_id: cp.sop_id, sop_id: cp.sop_id, rev: null, old: { row: 'copy ' + name }, new: { row: 'removed: copy ' + name },
      fields: ['row'], ctx: ctx2, after: [] });
    /* build 64: the copy's own Values Needed rows (from its draft file) go with it */
    const ownVn = (t.values_needed || []).filter(isCp);
    if (ownVn.length) {
      tables.values_needed = t.values_needed.filter(v => !isCp(v));
      for (const v of ownVn) {
        history = E.historyRows({ table: 'values_needed', row_id: v.vn_id, sop_id: cp.sop_id, rev: null, old: { row: v.vn_id + ' ' + v.value_needed },
          new: { row: 'removed: ' + v.vn_id + ' ' + v.value_needed }, fields: ['row'], ctx: ctx2, after: history });
      }
    }
    tables.history = t.history.concat(history);
    return { refusals: null, new_history: history, tables: tables };
  }

  return { copyInfo, copiesOf, familyOrder, copyIdFor, saveCopy, compareCopy, promotePlan, promotedSince, promoteCopy, deleteCopy, isCopy, stepMarks, stepCompare, vnOfSop,
    NAME_MAX, PER_REV };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_COPIES;
