/* SOP Builder logic pieces for who changes what (spec/example_rights.md, build 50; Samrat 2026-11-14: "any one login in can view
   any sop but only can change in their own copy"): ownerOf (who saved a copy), rightsOf (what the name at the top may do on one SOP or
   copy, and the line that says why not), checkSave (the History rows of one save, checked before it is written). Nobody changes the
   good version directly: a change is made in your own copy and Make this the good version brings it in; on the good version only
   the Values Needed, the sign-offs, the floor trial walks, the release, Done or Open again on a note and the shared lists (Glossary,
   Gauges) change. Pure. Classic script (global ENGINE_RIGHTS); module in Node. Answer key: tests/golden28.js. */
const ENGINE_RIGHTS = (function () {
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const empty = v => v === null || v === undefined || String(v).trim() === '';
  const norm = v => String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  const isCopy = sop => !!sop && !empty(sop.copy_of);
  /* the tables that every SOP shares: changed from a good version, any time (build 33) */
  const SHARED = ['glossary', 'gauges'];
  /* what a save may write on a good version besides a release, a copy made the good version and a new SOP's first revision */
  const GOOD_TABLES = ['values_needed', 'validation_log', 'revision_history'];
  const SIGN_FIELDS = ['status', 'checked_by', 'checked_date', 'approved_by', 'approved_date', 'release_note'];
  const NOTE_STATES = ['Open', 'Done'];

  const goodLine = id => id + ' is the good version: change it in your own copy, then Make this the good version (Header tab).';
  const otherLine = owner => 'This copy is ' + owner + '\'s: only ' + owner + ' changes it. Save a copy to work on your own.';

  /* ownerOf(tables, sopId) → who owns a copy: its owner field (contract 1.6, build 51), else the name on its "added: copy" History row
     (Save a copy, build 39; the copies saved before 1.6), else null; a good version has no owner */
  function ownerOf(tables, sopId) {
    const sop = (tables.sops || []).find(s => s.sop_id === sopId);
    if (sop && !isCopy(sop)) { return null; }
    if (sop && !empty(sop.owner)) { return String(sop.owner).trim(); }
    const h = (tables.history || []).find(x => x.sop_id === sopId && x.table === 'sops' && x.row_id === sopId && x.field === 'row' && /^added: copy /.test(String(x.new_value || '')));
    return h && !empty(h.who) ? String(h.who).trim() : null;
  }

  /* rightsOf(tables, sopId, who) → { kind, owner, can_change, read_only, lock_text, tag }: kind good (nobody changes it directly), own
     copy, other copy (read only, notes too), or copy (owner not known: anyone changes it) */
  function rightsOf(tables, sopId, who) {
    const sop = SEL.sopOf(tables, sopId);
    if (!isCopy(sop)) { return { kind: 'good', owner: null, can_change: false, read_only: false, lock_text: goodLine(sop.sop_id), tag: 'Good version: change it through a copy' }; }
    const owner = ownerOf(tables, sop.sop_id);
    if (owner === null) { return { kind: 'copy', owner: null, can_change: true, read_only: false, lock_text: null, tag: 'Copy (owner not known)' }; }
    if (norm(owner) === norm(who)) { return { kind: 'own copy', owner: owner, can_change: true, read_only: false, lock_text: null, tag: 'Your copy' }; }
    return { kind: 'other copy', owner: owner, can_change: false, read_only: true, lock_text: otherLine(owner), tag: owner + '\'s copy: read only' };
  }

  /* a History row a save may write on a good version */
  function goodOk(r) {
    if (GOOD_TABLES.indexOf(r.table) >= 0) { return true; }
    if (r.table === 'sop_revisions') { return SIGN_FIELDS.indexOf(r.field) >= 0 || /^accepted item \d+$/.test(String(r.field)); }
    if (r.table === 'chart_notes') { return r.field === 'status' && NOTE_STATES.indexOf(r.old_value) >= 0 && NOTE_STATES.indexOf(r.new_value) >= 0; }
    return false;
  }
  const PROMOTED = /^removed: copy .*, now (Rev \d+) of (.+)$/;

  /* checkSave(tables, rows, who) → null, or [{ field: 'form', message }] (each line once): tables = before the save, rows = the History
     rows the save writes. A release passes whole (it may write into the main SOPs and copies that use a process SOP, build 31); Make
     this the good version and Delete this copy pass for the copy's owner only; Save a copy passes for anyone; a new SOP's first
     revision passes; then each row: no SOP or a shared list passes, a copy passes for its owner, a good version for the rows of goodOk */
  function checkSave(tables, rows, who) {
    if (!Array.isArray(rows) || !rows.length) { return null; }
    if (rows.some(r => r.table === 'sop_revisions' && r.field === 'status' && r.new_value === 'Released')) { return null; }
    const sopOf = id => tables.sops.find(s => s.sop_id === id) || null;
    const nameOf = id => { const s = sopOf(id); return s && !empty(s.copy_name) ? s.copy_name : id; };
    const freed = {};
    for (const r of rows) {
      if (r.table !== 'sops' || r.field !== 'row' || empty(r.sop_id)) { continue; }
      const v = String(r.new_value || '');
      const m = PROMOTED.exec(v);
      if (m || /^removed: copy /.test(v)) {
        const owner = ownerOf(tables, r.sop_id);
        if (owner !== null && norm(owner) !== norm(who)) {
          return [{ field: 'form', message: 'Not saved: Only ' + owner + (m ? ' makes copy ' + nameOf(r.sop_id) + ' the good version.' : ' deletes copy ' + nameOf(r.sop_id) + '.') }];
        }
        freed[r.sop_id] = true;
        if (m) { freed[m[2]] = true; }
      } else if (/^added: copy /.test(v)) { freed[r.sop_id] = true; }
    }
    const out = [];
    const say = line => { const message = 'Not saved: ' + line; if (!out.some(x => x.message === message)) { out.push({ field: 'form', message: message }); } };
    for (const r of rows) {
      const id = r.sop_id;
      if (empty(id) || freed[id] || SHARED.indexOf(r.table) >= 0) { continue; }
      const sop = sopOf(id);
      if (!sop || empty(sop.current_rev)) { continue; }   /* a new SOP: its first revision */
      if (isCopy(sop)) {
        const rt = rightsOf(tables, id, who);
        if (!rt.can_change) { say(rt.lock_text); }
        continue;
      }
      if (!goodOk(r)) { say(goodLine(id)); }
    }
    return out.length ? out : null;
  }

  return { ownerOf, rightsOf, checkSave };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_RIGHTS;
