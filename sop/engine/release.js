/* SOP Builder logic pieces for release and revisions: releaseCheck (the
   skill's 8 items), releaseLabel, nextRev, revisionAfterEdit, lockText. Pure.
   Classic script (global ENGINE_RELEASE); module in Node.
   Answer key: tests/golden.js (C, RL cases), tests/golden2.js (NR, RA). */
const ENGINE_RELEASE = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const L = (typeof ENGINE_LINKS !== 'undefined') ? ENGINE_LINKS : require('./links.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const NAMES = ['Approved by Samrat or Raj, with a date', 'Checked by Raj or Divyal, not the preparer, with a date',
    'No [VALUE NEEDED] in a hold, reading or safety step', 'Every check has an If fail', 'Every safety item is Available',
    'Every photo check has a real OK photo', 'The record sheet matches the steps', 'The floor trial passed'];
  const READ_FIELDS = ['action', 'warning', 'check', 'if_fail', 'skip_if', 'unit'];
  function firstWord(name) { return String(name).trim().split(/\s+/)[0].replace(/[^A-Za-z]/g, '').toLowerCase(); }
  /* the sign-off names of the skill: Checked by Raj or Divyal (never the preparer), Approved by Samrat or Raj (example_release.md parts 8.2
     and 9; Samrat 2026-11-13: "raj and samrat can approve anything and anywhere"). TO_SIGN: the approver a waiting revision history row names */
  const SIGNERS = { checked: ['Raj', 'Divyal'], approved: ['Samrat', 'Raj'] };
  const TO_SIGN = SIGNERS.approved.join(' or ') + ' (to sign)';
  /* signerOf(role, name) → the listed name whose first word is the name's (small or capital letters), or null */
  function signerOf(role, name) {
    if (empty(name)) { return null; }
    const w = firstWord(name);
    return SIGNERS[role].find(n => firstWord(n) === w) || null;
  }
  const onlyWho = role => 'only ' + SIGNERS[role].join(' or ') + (role === 'approved' ? ' approves' : ' check');
  function item(no, pass, detail, details) { return { no: no, name: NAMES[no - 1], pass: pass, detail: detail, details: details || [] }; }
  function uniq(list) { return list.filter((x, i) => list.indexOf(x) === i); }

  function releaseCheck(tables, sopId, rev, files) {
    if (!tables.sops.some(s => s.sop_id === sopId)) { fail('releaseCheck', 'SOP ' + sopId + ' is not in sops'); }
    const rv = tables.sop_revisions.find(r => r.sop_id === sopId && r.rev === rev);
    if (!rv) { fail('releaseCheck', sopId + ' has no revision ' + rev); }
    if (!Array.isArray(tables.validation_log)) { fail('releaseCheck', 'tables.validation_log is missing'); }
    const steps = tables.steps.filter(s => s.sop_id === sopId && s.rev === rev).slice().sort((a, b) => a.seq - b.seq);
    const sections = tables.sections.filter(s => s.sop_id === sopId && s.rev === rev);
    const items = [];

    // 1 approved, by Samrat or Raj (build 36: the name is read too; build 38: Raj too)
    if (empty(rv.approved_by)) { items.push(item(1, false, 'Approved by is empty')); }
    else if (!signerOf('approved', rv.approved_by)) { items.push(item(1, false, 'Approved by ' + rv.approved_by + ': ' + onlyWho('approved'))); }
    else if (empty(rv.approved_date)) { items.push(item(1, false, 'Approved date is empty')); }
    else { items.push(item(1, true, 'Approved by ' + rv.approved_by + ' on ' + rv.approved_date)); }

    // 2 checked by Raj or Divyal, not by the preparer
    if (empty(rv.checked_by)) { items.push(item(2, false, 'Checked by is empty')); }
    else if (!signerOf('checked', rv.checked_by)) { items.push(item(2, false, 'Checked by ' + rv.checked_by + ': ' + onlyWho('checked'))); }
    else if (!empty(rv.prepared_by) && firstWord(rv.checked_by) === firstWord(rv.prepared_by)) { items.push(item(2, false, 'Checked by the preparer (' + rv.checked_by + ')')); }
    else if (empty(rv.checked_date)) { items.push(item(2, false, 'Checked date is empty')); }
    else { items.push(item(2, true, 'Checked by ' + rv.checked_by + ' on ' + rv.checked_date)); }

    // 3 no [VALUE NEEDED] in the floor fields of a Reading step, a Hold step or a step with a Warning; a blank limit counts
    const vn = [];
    for (const s of steps) {
      const reads = s.step_type === 'Reading' || s.step_type === 'Hold';
      if (!reads && empty(s.warning)) { continue; }
      for (const f of READ_FIELDS) { if (!empty(s[f]) && String(s[f]).indexOf('[VALUE NEEDED') >= 0) { vn.push(s.step_no + ' ' + f); } }
      if (reads && s.limit_status === 'Needed') { vn.push(s.step_no + ' limit'); }
    }
    items.push(item(3, vn.length === 0, vn.length ? vn.length + ' open' : 'No [VALUE NEEDED] in a hold, reading or warning step', vn));

    // 4 every check has an If fail
    const withCheck = steps.filter(s => !empty(s.check));
    const noIfFail = withCheck.filter(s => empty(s.if_fail)).map(s => s.step_no);
    items.push(item(4, noIfFail.length === 0, (withCheck.length - noIfFail.length) + ' of ' + withCheck.length + ' steps with a check have an If fail', noIfFail));

    // 5 every safety item Available
    const safety = tables.safety_items.filter(x => x.sop_id === sopId && x.rev === rev);
    if (!safety.length) { items.push(item(5, false, 'No safety item list')); }
    else {
      const notAvail = safety.filter(x => x.status !== 'Available').map(x => x.item + ': ' + x.status);
      items.push(item(5, notAvail.length === 0, notAvail.length ? notAvail.length + ' of ' + safety.length + ' safety items not Available' : safety.length + ' of ' + safety.length + ' safety items Available', notAvail));
    }

    // 6 every photo check has a real OK photo (file named in Photo ref ending -OK.jpg exists in files)
    const fileNames = files.map(f => String(f).split('/').pop());
    const found = [], missing = [];
    for (const s of steps) {
      if (!Array.isArray(s.photo_ref) || !s.photo_ref.length) { continue; }
      const ok = s.photo_ref.find(n => /-OK\.jpe?g$/i.test(n));
      if (!ok) { missing.push(s.step_no + ' has no OK photo in Photo ref'); }
      else if (fileNames.indexOf(ok) >= 0) { found.push(ok); }
      else { missing.push(ok + ' missing'); }
    }
    const photoSteps = steps.some(s => Array.isArray(s.photo_ref) && s.photo_ref.length);
    items.push(item(6, missing.length === 0, photoSteps ? (missing.length ? uniq(missing).length + ' missing' : uniq(found).length + (uniq(found).length === 1 ? ' OK photo found' : ' OK photos found')) : 'No photo checks', missing.length ? uniq(missing) : uniq(found)));

    // 7 the record sheet can show every Reading and Hold step
    const bad = [];
    for (const s of steps) {
      if (s.step_type === 'Reading' && empty(s.unit)) { bad.push(s.step_no + ' no unit'); }
      if (s.step_type === 'Hold' && (empty(s.hold) || s.hold === 'N')) { bad.push(s.step_no + ' no hold label'); }
    }
    if (bad.length) { items.push(item(7, false, bad.length + ' steps cannot make a record row', bad)); }
    else {
      const secNos = L.recordSheetRows(steps, sections).rows.map(r => r.section);
      items.push(item(7, true, 'Rows for sections ' + secNos.join(', '), secNos));
    }

    // 8 floor trial: the last two walk-throughs of this revision had 0 questions
    const logs = tables.validation_log.filter(v => v.sop_id === sopId && v.rev === rev).slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.val_id - b.val_id));
    const last = logs.slice(-2);
    if (last.length === 2 && last.every(v => v.questions_asked === 0)) { items.push(item(8, true, 'Walked twice with 0 questions: ' + last[0].date + ', ' + last[1].date)); }
    else { items.push(item(8, false, 'No Validation_Log row for ' + rev + ' with 0 questions, twice in a row')); }

    const failCount = items.filter(i => !i.pass).length;
    return { released: failCount === 0, fail_count: failCount, items: items };
  }

  const TRIAL = 'Released for floor trial';
  /* releaseLabel(revStatus, check, releaseNote): the Release column; a note starting "Released for floor trial" says which kind of release */
  function releaseLabel(revStatus, check, releaseNote) {
    switch (revStatus) {
      case 'Released': return String(releaseNote || '').indexOf(TRIAL) === 0 ? TRIAL : 'Released';
      case 'Superseded': return 'Superseded';
      case 'Draft': case 'Checked': case 'Approved': return check.fail_count ? 'Not released: ' + check.fail_count + ' open' : 'Ready to release';
      default: fail('releaseLabel', 'unknown rev_status "' + revStatus + '"');
    }
  }

  function nextRev(current) {
    if (empty(current)) { return 'Rev 01'; }
    const m = /^Rev\s+(\d+)$/.exec(String(current).trim());
    if (!m) { fail('nextRev', '"' + current + '" is not a revision label (Rev 02)'); }
    const n = Number(m[1]) + 1;
    return 'Rev ' + (n < 10 ? '0' + n : String(n));
  }

  function revisionAfterEdit(revision) {
    switch (revision.status) {
      case 'Draft': case 'Checked': case 'Approved':
        return Object.assign({}, revision, { status: 'Draft', checked_date: null, approved_date: null });
      case 'Released': case 'Superseded':
        fail('revisionAfterEdit', 'a ' + revision.status + ' revision cannot be edited (' + revision.sop_id + ' ' + revision.rev + ')');
        break;
      default: fail('revisionAfterEdit', 'unknown status "' + revision.status + '"');
    }
  }

  /* signersFor(revision) → { checked, approved }: the names the sign lists offer; the preparer cannot check */
  function signersFor(revision) {
    if (!revision) { fail('signersFor', 'no revision'); }
    return { checked: SIGNERS.checked.filter(n => empty(revision.prepared_by) || firstWord(n) !== firstWord(revision.prepared_by)), approved: SIGNERS.approved.slice() };
  }
  /* acceptedItems(history, sopId, rev) → the numbers of the items accepted at the release of that revision (History "accepted item n") */
  function acceptedItems(history, sopId, rev) {
    const out = [];
    for (const h of history || []) {
      if (h.table !== 'sop_revisions' || h.sop_id !== sopId || h.rev !== rev) { continue; }
      const m = /^accepted item (\d+)$/.exec(String(h.field));
      if (m && out.indexOf(Number(m[1])) < 0) { out.push(Number(m[1])); }
    }
    return out.sort((a, b) => a - b);
  }
  /* releaseResult(revision, check, accepted) → the Result line of the Release check tab (example_release.md part 8.4) */
  function releaseResult(revision, check, accepted) {
    switch (revision.status) {
      case 'Released': {
        if (String(revision.release_note || '').indexOf(TRIAL) !== 0) { return 'RELEASED'; }
        const n = (accepted || []).length;
        return 'RELEASED FOR FLOOR TRIAL' + (n ? ' (' + n + (n === 1 ? ' item' : ' items') + ' accepted: ' + accepted.join(', ') + ')' : '');
      }
      case 'Superseded': return 'SUPERSEDED';
      default: return check.released ? 'RELEASED' : 'NOT RELEASED (' + check.fail_count + ' of 8 fail)';
    }
  }
  /* floorRev(revisions, sop) → { rev, label } of the revision still on the floor while the current one is not released, or null */
  function floorRev(revisions, sop) {
    for (const r of revisions) { if (r.sop_id !== sop.sop_id) { fail('floorRev', 'revision ' + r.rev + ' belongs to ' + r.sop_id + ', not ' + sop.sop_id); } }
    const cur = revisions.find(r => r.rev === sop.current_rev);
    if (cur && cur.status === 'Released') { return null; }
    const num = r => { const m = /(\d+)/.exec(String(r.rev)); return m ? Number(m[1]) : -1; };
    const rel = revisions.filter(r => r.status === 'Released').sort((a, b) => num(b) - num(a))[0];
    return rel ? { rev: rel.rev, label: releaseLabel('Released', { fail_count: 0 }, rel.release_note) } : null;
  }

  /* lockText(revision) → the line a Released or Superseded revision shows where a change would be ("Rev 02 is Released: make a new
     revision on the Header tab to change it."), or null while the revision can change (example_flow.md parts 17.1 and 20.3) */
  function lockText(revision) {
    if (!revision) { fail('lockText', 'no revision'); }
    if (revision.status !== 'Released' && revision.status !== 'Superseded') { return null; }
    return revision.rev + ' is ' + revision.status + ': make a new revision on the Header tab to change it.';
  }

  /* signRevision(revision, sign, ctx) → { refusals } or { revision, history }; sign = { role: checked | approved, name, date } */
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  function signRevision(revision, sign, ctx) {
    const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
    E.checkCtx(ctx, 'signRevision');
    if (sign.role !== 'checked' && sign.role !== 'approved') { fail('signRevision', 'role must be checked or approved, not "' + sign.role + '"'); }
    if (revision.status === 'Released' || revision.status === 'Superseded') { fail('signRevision', 'a ' + revision.status + ' revision cannot be signed (' + revision.sop_id + ' ' + revision.rev + ')'); }
    const refusals = [];
    if (empty(sign.name)) { refusals.push({ field: 'name', message: 'Name is empty' }); }
    if (empty(sign.date) || !DATE.test(String(sign.date).trim())) { refusals.push({ field: 'date', message: 'Date must be YYYY-MM-DD. Example: 2026-11-06' }); }
    if (refusals.length) { return { refusals: refusals }; }
    /* build 36: only the names of the skill sign; "raj" signs as Raj */
    const name = signerOf(sign.role, sign.name), date = String(sign.date).trim();
    if (!name) { return { refusals: [{ field: 'name', message: (sign.role === 'checked' ? 'Checked by is ' : 'Approved by is ') + SIGNERS[sign.role].join(' or ') + '.' }] }; }
    if (sign.role === 'checked' && !empty(revision.prepared_by) && firstWord(name) === firstWord(revision.prepared_by)) {
      return { refusals: [{ field: 'name', message: 'The checker cannot be the preparer (' + revision.prepared_by + ')' }] };
    }
    if (sign.role === 'approved' && (empty(revision.checked_by) || empty(revision.checked_date))) {
      return { refusals: [{ field: 'form', message: 'Checked by and the check date are needed before approval' }] };
    }
    const next = Object.assign({}, revision);
    if (sign.role === 'checked') {
      next.checked_by = name; next.checked_date = date; next.status = 'Checked';
      /* a new check after an approval clears the approval: Samrat approves again after the new check (build 36) */
      if (!empty(revision.approved_date)) { next.approved_by = null; next.approved_date = null; }
    } else { next.approved_by = name; next.approved_date = date; next.status = 'Approved'; }
    const what = (sign.role === 'checked' ? 'Checked by ' : 'Approved by ') + name + ' on ' + date;
    const history = E.historyRows({ table: 'sop_revisions', row_id: revision.sop_id + ' ' + revision.rev, sop_id: revision.sop_id, rev: revision.rev, old: revision, new: next,
      fields: ['status', 'checked_by', 'checked_date', 'approved_by', 'approved_date'], ctx: Object.assign({}, ctx, { reason: what }), after: [] });
    return { revision: next, history: history };
  }

  /* logWalk(revision, walk, ctx) → { refusals } or { row, history }: one Validation_Log row (ctx.next_val_id from the store) */
  function logWalk(revision, walk, ctx) {
    const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
    E.checkCtx(ctx, 'logWalk');
    if (!Number.isInteger(ctx.next_val_id)) { fail('logWalk', 'ctx.next_val_id (the next Validation_Log id) is missing'); }
    const refusals = [];
    if (empty(walk.date)) { refusals.push({ field: 'date', message: 'Date is empty' }); }
    else if (!DATE.test(String(walk.date).trim())) { refusals.push({ field: 'date', message: 'Date must be YYYY-MM-DD. Example: 2026-11-06' }); }
    if (empty(walk.walked_by)) { refusals.push({ field: 'walked_by', message: 'Walked by is empty' }); }
    if (empty(walk.watched_by)) { refusals.push({ field: 'watched_by', message: 'Watched by is empty' }); }
    const q = empty(walk.questions_asked) ? NaN : Number(String(walk.questions_asked).trim());
    if (!Number.isInteger(q) || q < 0) { refusals.push({ field: 'questions_asked', message: 'Questions asked must be a whole number, 0 or more' }); }
    if (refusals.length) { return { refusals: refusals }; }
    const row = { val_id: ctx.next_val_id, sop_id: revision.sop_id, rev: revision.rev, date: String(walk.date).trim(), walked_by: String(walk.walked_by).trim(),
      watched_by: String(walk.watched_by).trim(), questions_asked: q, defects_found: empty(walk.defects_found) ? null : String(walk.defects_found).trim(), fixed_in_rev: null };
    const history = E.historyRows({ table: 'validation_log', row_id: String(row.val_id), sop_id: revision.sop_id, rev: revision.rev, old: { row: null },
      new: { row: 'added: walked by ' + row.walked_by + ' on ' + row.date + ', ' + q + ' questions' }, fields: ['row'], ctx: Object.assign({}, ctx, { reason: 'Floor trial' }), after: [] });
    return { row: row, history: history };
  }

  /* compareSummary(compare) → the revision history text: removed steps first, then changed, new, renumbered */
  function compareSummary(cmp) {
    const parts = [];
    const removed = cmp.rows.filter(r => r.change === 'Retired').map(r => r.old_step_no + ' ' + r.old_action + ' (' + r.key + (r.note ? ', ' + r.note : '') + ')');
    const changed = cmp.rows.filter(r => r.change.indexOf('Changed') === 0).map(r => r.new_step_no + ' (' + r.fields.join(', ') + ')');
    const added = cmp.rows.filter(r => r.change === 'New').map(r => r.new_step_no + ' (' + r.key + ')');
    const renum = cmp.rows.filter(r => r.change.indexOf('(new step number)') > 0).map(r => r.old_step_no + ' to ' + r.new_step_no + ' (' + r.key + ')');
    if (removed.length) { parts.push('Removed: ' + removed.join('; ') + '.'); }
    if (changed.length) { parts.push('Changed: ' + changed.join('; ') + '.'); }
    if (added.length) { parts.push('New: ' + added.join('; ') + '.'); }
    if (renum.length) { parts.push('Renumbered: ' + renum.join('; ') + '.'); }
    return parts.length ? parts.join(' ') : 'No step changes.';
  }

  /* releaseRevision(sop, revisions, check, summary, ctx, accepted) → { refusals } or { revisions, history };
     accepted = [{ no, reason }] (spec/example_release.md): every failing item must be accepted with a reason, or the release is refused */
  function releaseRevision(sop, revisions, check, summary, ctx, accepted) {
    const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
    E.checkCtx(ctx, 'releaseRevision');
    const mine = revisions.filter(r => r.sop_id === sop.sop_id);
    const current = mine.find(r => r.rev === sop.current_rev);
    if (!current) { fail('releaseRevision', 'the current revision ' + sop.current_rev + ' of ' + sop.sop_id + ' is not in the list'); }
    const num = r => { const m = /(\d+)/.exec(String(r.rev)); return m ? Number(m[1]) : -1; };
    const newer = mine.find(r => num(r) > num(current));
    if (newer) { fail('releaseRevision', 'the current revision ' + current.rev + ' is not the newest (' + newer.rev + ' exists)'); }
    if (current.status === 'Released') { fail('releaseRevision', sop.sop_id + ' ' + current.rev + ' is already Released'); }
    const acc = Array.isArray(accepted) ? accepted : [];
    if (!check.released && !acc.length) {
      const nos = (check.items || []).filter(i => !i.pass).map(i => i.no);
      return { refusals: [{ field: 'form', message: 'Not released: ' + check.fail_count + ' of 8 items fail' + (nos.length ? ' (' + nos.join(', ') + ')' : '') +
        '. Tick Accept on each and type a reason, or make them pass.' }] };
    }
    const failing = (check.items || []).filter(i => !i.pass);
    const refusals = [], taken = [];
    for (const it of failing) {
      const a = acc.find(x => Number(x.no) === it.no);
      if (!a) { refusals.push({ field: 'form', message: 'Item ' + it.no + ' fails and is not accepted.' }); }
      else if (empty(a.reason)) { refusals.push({ field: 'form', message: 'Item ' + it.no + ': a reason is needed to accept it.' }); }
      else { taken.push({ no: it.no, name: it.name, detail: it.detail, reason: String(a.reason).trim() }); }
    }
    if (refusals.length) { return { refusals: refusals }; }
    const day = String(ctx.now).slice(0, 10);
    const what = taken.length ? TRIAL + ' on ' + day + ' by ' + ctx.who : 'Released on ' + day + ' by ' + ctx.who;
    const note = taken.length
      ? what + ' with ' + taken.length + (taken.length === 1 ? ' item' : ' items') + ' accepted: ' + taken.map(t => t.no + ' ' + t.name + ' (' + t.detail + '): ' + t.reason).join(' | ') + '. ' + summary
      : what + '. ' + summary;
    const ctx2 = Object.assign({}, ctx, { reason: what });
    const released = Object.assign({}, current, { status: 'Released', release_note: note });
    let history = E.historyRows({ table: 'sop_revisions', row_id: current.sop_id + ' ' + current.rev, sop_id: current.sop_id, rev: current.rev, old: current, new: released, fields: ['status', 'release_note'], ctx: ctx2, after: [] });
    const oldAcc = {}, newAcc = {};
    for (const t of taken) { oldAcc['accepted item ' + t.no] = null; newAcc['accepted item ' + t.no] = t.detail + ': ' + t.reason; }
    history = E.historyRows({ table: 'sop_revisions', row_id: current.sop_id + ' ' + current.rev, sop_id: current.sop_id, rev: current.rev, old: oldAcc, new: newAcc, fields: Object.keys(newAcc), ctx: ctx2, after: history });
    const out = revisions.map(function (r) {
      if (r.sop_id !== sop.sop_id) { return r; }
      if (r.rev === current.rev) { return released; }
      if (r.status !== 'Released') { return r; }
      const next = Object.assign({}, r, { status: 'Superseded' });
      history = E.historyRows({ table: 'sop_revisions', row_id: r.sop_id + ' ' + r.rev, sop_id: r.sop_id, rev: r.rev, old: r, new: next, fields: ['status'], ctx: ctx2, after: history });
      return next;
    });
    return { revisions: out, history: history };
  }

  /* releaseHistoryRow(rhRow, summary, approvedBy) → the revision history row with the summary first and the approver named */
  function releaseHistoryRow(rhRow, summary, approvedBy) {
    if (!rhRow) { return null; }
    const text = summary === 'No step changes.' ? rhRow.what_changed : summary + ' ' + rhRow.what_changed;
    return Object.assign({}, rhRow, { what_changed: text, approved_by: approvedBy });
  }

  /* ---- build 59 (spec/example_edit_online.md part 11) ---- */
  /* releaseAsk(tables, sopId, accepted) → { title, line, lines, ok, cancel }: the pop-up after a click on Release (Vishal 2026-11-20: "a
     catchy line with warning and option to go ahead or cancel"); accepted = the ticked items [{ no, reason }] */
  function releaseAsk(tables, sopId, accepted) {
    const sop = tables.sops.find(s => s.sop_id === sopId);
    if (!sop) { fail('releaseAsk', 'SOP ' + sopId + ' is not in sops'); }
    if (!empty(sop.copy_of)) { fail('releaseAsk', sopId + ' is a copy: a copy is not released'); }
    if (empty(sop.current_rev)) { fail('releaseAsk', sopId + ' has no revision'); }
    const lines = [sopId + ' ' + sop.current_rev + ' goes to the floor now: every operator works from it.'];
    const nos = uniq((accepted || []).map(a => Number(a.no))).sort((a, b) => a - b);
    if (nos.length) { lines.push('For a floor trial: ' + nos.length + (nos.length === 1 ? ' item' : ' items') + ' accepted: ' + nos.join(', ') + '.'); }
    const old = tables.sop_revisions.filter(r => r.sop_id === sopId && r.rev !== sop.current_rev && r.status === 'Released').map(r => r.rev);
    if (old.length) { lines.push(old.join(' and ') + (old.length === 1 ? ' becomes' : ' become') + ' Superseded.'); }
    if (sop.sop_type === 'Process') {
      const into = uniq(tables.steps.filter(s => s.link_sop === sopId && s.sop_id !== sopId).map(s => s.sop_id)).sort();
      if (into.length) { lines.push('It flows into the SOPs that use it: ' + into.join(', ') + '.'); }
    }
    lines.push('A release cannot be taken back: a change after it needs a new revision.');
    return { title: 'Release to the floor', line: 'Check twice, release once.', lines: lines, ok: 'Go ahead, release', cancel: 'Cancel' };
  }
  /* signState(revision, me) → null on the PC (me null: the names are picked from the lists); online, for the login me = { name, roles }:
     { checked, approved, release }, each { can, name (the login's, when it can), line (why not, else null) }: Checked by needs the check
     role and not the preparer; Approved by and Release need the approve role */
  function signState(revision, me) {
    if (!revision) { fail('signState', 'no revision'); }
    if (!me) { return null; }
    const roles = Array.isArray(me.roles) ? me.roles : [];
    const checkers = signersFor(revision).checked;
    const left = SIGNERS.checked.filter(n => checkers.indexOf(n) < 0);
    const isPreparer = !empty(revision.prepared_by) && firstWord(me.name) === firstWord(revision.prepared_by);
    const canCheck = roles.indexOf('check') >= 0 && !isPreparer, canApprove = roles.indexOf('approve') >= 0;
    const checkLine = (checkers.length ? checkers.join(' or ') + ' checks' : 'Nobody checks') + (left.length ? ': ' + left[0] + ' prepared this revision.' : '.');
    return {
      checked: { can: canCheck, name: canCheck ? me.name : null, line: canCheck ? null : checkLine },
      approved: { can: canApprove, name: canApprove ? me.name : null, line: canApprove ? null : SIGNERS.approved.join(' or ') + ' approves.' },
      release: { can: canApprove, line: canApprove ? null : SIGNERS.approved.join(' or ') + ' releases.' }
    };
  }

  return { releaseCheck, releaseLabel, nextRev, revisionAfterEdit, lockText, signersFor, acceptedItems, releaseResult, floorRev, signRevision, logWalk, compareSummary, releaseRevision, releaseHistoryRow,
    releaseAsk, signState, SIGNERS, TO_SIGN };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_RELEASE;
