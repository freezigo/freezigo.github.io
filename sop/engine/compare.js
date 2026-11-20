/* SOP Builder logic pieces for revisions: compareByKey (two revisions'
   step lists side by side, by key), newRevision (the next revision
   copied from the current one as a Draft) and differ (build 58: the
   fields of one step that differ, for the marks on a copy). Pure. Classic script (global
   ENGINE_COMPARE); module in Node. Answer key: tests/golden2.js (CB, NRV). */
const ENGINE_COMPARE = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const R = (typeof ENGINE_RELEASE !== 'undefined') ? ENGINE_RELEASE : require('./release.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const copy = v => JSON.parse(JSON.stringify(v));
  const COMPARED = TYPESX.tables.steps.fields.map(f => f.name).filter(n => ['key', 'sop_id', 'rev', 'step_no', 'seq', 'class', 'signed_by'].indexOf(n) < 0);
  const bySeq = (a, b) => a.seq - b.seq;
  /* differ(a, b) → the COMPARED fields whose text differs between two rows of the same step (build 58: the marks on a copy's steps) */
  const differ = (a, b) => COMPARED.filter(f => E.asText(a[f]) !== E.asText(b[f]));

  /* compareByKey(oldSteps, newSteps, retiredRows) → { rows, counts }: rows in the new order, a retired row right after
     the row that preceded it in the old list; change = Kept, Kept (new step number), Changed, Changed (new step number), New, Retired */
  function compareByKey(oldSteps, newSteps, retiredRows) {
    const sops = {};
    for (const s of oldSteps.concat(newSteps)) { sops[s.sop_id] = true; }
    if (Object.keys(sops).length > 1) { fail('compareByKey', 'steps of one SOP only (' + Object.keys(sops).join(', ') + ')'); }
    const oldList = oldSteps.slice().sort(bySeq), newList = newSteps.slice().sort(bySeq);
    const oldByKey = {}, newByKey = {};
    for (const s of oldList) { oldByKey[s.key] = s; }
    for (const s of newList) { newByKey[s.key] = s; }
    const newRev = newList.length ? newList[0].rev : null;
    const rows = [];
    const counts = { kept: 0, changed: 0, new: 0, retired: 0 };
    function rowFor(o, n) {
      const r = { key: (o || n).key, old_step_no: o ? o.step_no : null, new_step_no: n ? n.step_no : null, change: null, fields: [], old_action: o ? o.action : null, note: null };
      if (o && n) {
        r.fields = differ(o, n);
        const renumbered = o.step_no !== n.step_no;
        r.change = (r.fields.length ? 'Changed' : 'Kept') + (renumbered ? ' (new step number)' : '');
        counts[r.fields.length ? 'changed' : 'kept']++;
      } else if (n) {
        r.change = 'New'; r.note = newRev ? newRev + ' step' : 'New step'; counts.new++;
      } else {
        r.change = 'Retired';
        const ret = retiredRows.find(x => x.key === o.key);
        r.note = ret ? ret.reason : null;
        counts.retired++;
      }
      return r;
    }
    /* retired rows are grouped by the nearest old predecessor that still exists (null = before everything) */
    const retiredAfter = {};
    let lastKept = null;
    for (const o of oldList) {
      if (newByKey[o.key]) { lastKept = o.key; }
      else { (retiredAfter[lastKept] = retiredAfter[lastKept] || []).push(o); }
    }
    for (const o of retiredAfter[null] || []) { rows.push(rowFor(o, null)); }
    for (const n of newList) {
      rows.push(rowFor(oldByKey[n.key] || null, n));
      for (const o of retiredAfter[n.key] || []) { rows.push(rowFor(o, null)); }
    }
    return { rows: rows, counts: counts };
  }

  /* newRevision(sop, revision, steps, sections, extras, ctx, note) → { refusals } or
     { sop, revision, steps, sections, extras, revision_history_row, history } with the next label, all copies as Draft */
  function newRevision(sop, revision, steps, sections, extras, ctx, note) {
    E.checkCtx(ctx, 'newRevision');
    if (!Number.isInteger(ctx.next_rh_id)) { fail('newRevision', 'ctx.next_rh_id (the next revision history id) is missing'); }
    if (revision.sop_id !== sop.sop_id) { fail('newRevision', 'revision ' + revision.rev + ' belongs to ' + revision.sop_id + ', not ' + sop.sop_id); }
    const wrong = steps.find(s => s.sop_id !== sop.sop_id || s.rev !== revision.rev) || sections.find(s => s.sop_id !== sop.sop_id || s.rev !== revision.rev);
    if (wrong) { fail('newRevision', 'row of ' + wrong.sop_id + ' ' + wrong.rev + ' given; expected ' + sop.sop_id + ' ' + revision.rev); }
    if (empty(note)) { return { refusals: [{ field: 'note', message: 'Revision note is empty: say what changed and why' }] }; }
    const rev = R.nextRev(revision.rev);
    const today = String(ctx.now).slice(0, 10);
    const newRev = Object.assign(copy(revision), { rev: rev, status: 'Draft', rev_date: today, prepared_by: ctx.who, checked_by: null, checked_date: null,
      approved_by: null, approved_date: null, revision_note: String(note).trim(), release_note: null });
    const relabel = rows => rows.filter(r => r.sop_id === sop.sop_id && r.rev === revision.rev).map(r => Object.assign(copy(r), { rev: rev }));
    const newExtras = {};
    for (const name in extras) { newExtras[name] = relabel(extras[name]); }
    const newSop = Object.assign(copy(sop), { current_rev: rev, edited_in: 'Builder' });
    const reason = String(note).trim();
    const ctx2 = Object.assign({}, ctx, { reason: reason });
    let history = E.historyRows({ table: 'sop_revisions', row_id: sop.sop_id + ' ' + rev, sop_id: sop.sop_id, rev: rev, old: { row: null }, new: { row: 'added: ' + rev + ' from ' + revision.rev }, fields: ['row'], ctx: ctx2, after: [] });
    history = E.historyRows({ table: 'sops', row_id: sop.sop_id, sop_id: sop.sop_id, rev: null, old: sop, new: newSop, fields: ['current_rev', 'edited_in'], ctx: ctx2, after: history });
    const rh = { rh_id: ctx.next_rh_id, sop_id: sop.sop_id, rev: rev, date: today, what_changed: reason, changed_by: ctx.who, approved_by: R.TO_SIGN };
    return { sop: newSop, revision: newRev, steps: relabel(steps.slice().sort(bySeq)), sections: relabel(sections), extras: newExtras, revision_history_row: rh, history: history };
  }

  return { compareByKey, newRevision, differ, COMPARED };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_COMPARE;
