/* SOP Builder logic pieces for the SOP line (build 71, spec/example_job4_71.md; plan v2.4 jobs 3 and 4, project docs
   claude/ui_plan_user_friendly.md 4.1 and 4.6, claude/ui_page_review_build68.md): copyLabel (a copy's name on the line, "Samrat
   13.11.26"), myCopy (Edit in my copy: open your copy or make one), sopLine (the words of the SOP line, its "+ details", its actions
   and the ☰ items), findStep (the search box) and typeWord (Type on the Header tab). Pure. Classic script (global ENGINE_LINE); module
   in Node. Answer key: tests/golden43.js. */
const ENGINE_LINE = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const L = (typeof ENGINE_LINKS !== 'undefined') ? ENGINE_LINKS : require('./links.js');
  const CP = (typeof ENGINE_COPIES !== 'undefined') ? ENGINE_COPIES : require('./copies.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const same = (a, b) => !empty(a) && !empty(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = /^(\d{4})-(\d{2})-(\d{2})(T(\d{2}):(\d{2}))?/;
  /* parts(at, place) → { y, m, d, hm } of an ISO date or time, or an error naming place */
  function parts(at, place) {
    const m = DAY.exec(String(at));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) { fail(place, 'the date "' + at + '" is not YYYY-MM-DD'); }
    return { y: m[1], m: Number(m[2]), mm: m[2], d: Number(m[3]), dd: m[3], hm: m[4] ? m[5] + ':' + m[6] : null };
  }
  /* "13 Nov 2026 14:05" (the time only when there is one) */
  const longDay = at => { const p = parts(at, 'sopLine'); return p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y + (p.hm ? ' ' + p.hm : ''); };

  /* copyLabel(name, at) → "Samrat 13.11.26": the owner and the day the copy was saved, dd.mm.yy (plan rule 3); no day: the name alone */
  function copyLabel(name, at) {
    if (empty(name)) { fail('copyLabel', 'no name'); }
    const n = String(name).trim();
    if (empty(at)) { return n; }
    const p = parts(at, 'copyLabel');
    return n + ' ' + p.dd + '.' + p.mm + '.' + p.y.slice(2);
  }

  /* typeWord(sopType) → "Main" or "Process" (the Header tab; the long words stay in the edit form's note) */
  function typeWord(sopType) {
    if (empty(sopType) || sopType === 'Main') { return 'Main'; }
    if (sopType === 'Process') { return 'Process'; }
    fail('typeWord', 'unknown SOP type "' + sopType + '"');
  }

  /* ownerOfCopy(cp, saved) → the copy's owner (contract 1.6), else the one who saved it (a copy saved before 1.6) */
  const ownerOfCopy = (sop, savedBy) => (!empty(sop && sop.owner) ? String(sop.owner).trim() : (empty(savedBy) ? null : String(savedBy).trim()));

  /* myCopy(tables, sopId, who, now) → { refusals: null, open, make, free }: Edit in my copy (plan 4.1). The copies of the SOP's main SOP owned
     by who: the newest saved opens (no day saved = the oldest; the same day: the higher copy number), a copy named with the word test
     only when every one is (a test is not the working copy); none: make = the name of the new
     copy, "<Name> <dd.mm.yy>", with " 2", " 3" when a copy of the SOP has the name already (any case); free = that name in every case
     (☰ Another copy fills its box with it). An SOP with no revision: a refusal. */
  function myCopy(tables, sopId, who, now) {
    if (empty(who)) { fail('myCopy', 'no name'); }
    if (!tables || !Array.isArray(tables.sops)) { fail('myCopy', 'table sops is missing'); }
    const sop = SEL.sopOf(tables, sopId);
    const mainId = CP.isCopy(sop) ? sop.copy_of : sop.sop_id;
    const main = SEL.sopOf(tables, mainId);
    if (empty(main.current_rev)) { return { refusals: [{ field: 'form', message: main.sop_id + ' has no revision yet: start it from the SOP list.' }] }; }
    const name = copyLabel(who, now);
    const no = id => { const m = /-COPY(\d+)$/.exec(String(id)); return m ? Number(m[1]) : 0; };
    const time = at => (empty(at) ? '' : String(at));
    const mine = CP.copiesOf(tables, mainId).filter(c => same(ownerOfCopy(SEL.sopOf(tables, c.sop_id), c.saved_by), who))
      .sort((a, b) => (time(a.saved_at) < time(b.saved_at) ? -1 : time(a.saved_at) > time(b.saved_at) ? 1 : no(a.sop_id) - no(b.sop_id)));
    /* a copy named with the word test is a test, not the working copy (Samrat 27 Nov: "name every test with the word test in it") */
    const work = mine.filter(c => !/\btest\b/i.test(String(c.copy_name || '')));
    const pick = work.length ? work : mine;
    const taken = tables.sops.filter(s => s.copy_of === mainId).map(s => String(s.copy_name || '').trim().toLowerCase());
    let free = name, n = 1;
    while (taken.indexOf(free.toLowerCase()) >= 0) { n += 1; free = name + ' ' + n; }
    if (pick.length) { return { refusals: null, open: pick[pick.length - 1].sop_id, make: null, free: free }; }
    return { refusals: null, open: null, make: free, free: free };
  }

  /* sopLine(input) → the words of the SOP line (plan 4.6, rule 6: a fact once):
     { main_id, label, facts, door, ro, changes, details, actions, menu }.
     input = { sop, rev, copy (ENGINE_COPIES.copyInfo or null), rights (ENGINE_RIGHTS.rightsOf, ENGINE_ONLINE.viewRights, or null in the
     test seam), release (the SOP view's release or null), draft_mode, floor_rev, main_changes, online, editing, who }.
     label: a copy's "Samrat 13.11.26" (null for a main SOP); facts: the words after the ID or label; door: the fact that opens the
     Release check tab; ro: the read-only bar; changes: the main changes a copy has to decide; details: the lines behind "+ details";
     actions: undo, compare, edit-my-copy, back-to-main (in this order); menu: the ☰ items another-copy and delete-copy. */
  const CLOSED = ['Released', 'Superseded'];
  function sopLine(input) {
    if (!input || typeof input !== 'object') { fail('sopLine', 'input is missing'); }
    const sop = input.sop;
    if (!sop) { fail('sopLine', 'input.sop is missing'); }
    const rev = input.rev || null, copy = input.copy || null, rt = input.rights || null;
    const kind = rt ? rt.kind : null;
    const view = kind === 'view';
    const isCp = !!copy;
    const mainId = isCp ? copy.of : sop.sop_id;
    const owner = isCp ? ownerOfCopy(sop, copy.saved_by) : null;
    const out = { main_id: mainId, label: null, facts: [], door: null, ro: null, changes: null, details: [], actions: [], menu: [] };
    if (isCp) {
      out.label = owner ? copyLabel(owner, copy.saved_at) : String(copy.name);
      out.facts.push(view ? (same(owner, input.who) ? 'your copy' : (owner ? owner + '\'s copy' : 'copy'))
        : kind === 'other copy' ? (rt.owner || owner) + '\'s copy: read only'
        : kind === 'own copy' ? 'your copy' : 'copy');
    }
    if (!rev) {
      out.facts.push('no revision yet');
    } else {
      out.facts.push(rev.rev);
      const closed = CLOSED.indexOf(rev.status) >= 0;
      out.facts.push(closed && input.release ? input.release.label : rev.status);
      if (!isCp && !closed && input.release && input.release.check) {
        const n = input.release.check.fail_count;
        out.door = n ? n + (n === 1 ? ' release item open' : ' release items open') : 'ready to release';
        out.facts.push(out.door);
      }
      if (!isCp && input.floor_rev) { out.facts.push(input.floor_rev.rev + ' on the floor'); }
      if (!isCp && (kind === 'good' || view)) { out.ro = 'Read only: main SOP'; }
      /* the test seam (no rights): a Released or Superseded revision is read only (ENGINE_RELEASE.lockText) */
      if (!isCp && !rt && closed) { out.ro = 'Read only: ' + rev.rev + ' ' + rev.status; }
    }
    if (isCp && input.main_changes) {
      const n = input.main_changes;
      out.changes = n + (n === 1 ? ' change' : ' changes') + ' in the main SOP to decide';
    }
    /* + details: what the SOP is, then the lines of its state */
    const d = out.details;
    if (isCp) {
      if (out.label !== String(copy.name)) { d.push('Copy name: ' + copy.name + '.'); }
      d.push(!empty(copy.saved_at) ? 'Saved from ' + (copy.saved_from || mainId) + ' on ' + longDay(copy.saved_at) + (copy.saved_by ? ' by ' + copy.saved_by : '') + '.' : 'A copy of ' + mainId + '.');
      d.push('ID: ' + sop.sop_id + '.');
      d.push('A copy never goes to the floor; ' + mainId + ' does not change while you edit the copy.');
      if ((copy.since || []).length) { d.push('Since this copy was saved: ' + copy.since.map(x => x.line).join('; ') + '.'); }
    } else if (rev && kind === 'good') {
      d.push('The main SOP changes through a copy: Edit in my copy makes or opens your copy; Make this the good version on the copy\'s Header tab brings it back.');
    }
    if (rev && !isCp && !rt && CLOSED.indexOf(rev.status) >= 0) { d.push(rev.rev + ' is ' + rev.status + ': make a new revision on the Header tab to change it.'); }
    if (kind === 'other copy') { d.push('Only ' + (rt.owner || owner) + ' changes this copy. To work on it: ☰ All tabs, Another copy.'); }
    if (view) { d.push(rt.lock_text); }
    if (sop.edited_in === 'SOP project') { d.push('Edited in: SOP project.'); }
    if (rev && input.draft_mode && !view && kind !== 'other copy') { d.push('Draft mode: no reason is asked while ' + rev.rev + ' is a Draft with no sign-off.'); }
    if (input.online && input.editing && !empty(input.who)) { d.push('Editing online as ' + input.who + '.'); }
    /* the actions at the right end of the line, and the ☰ items */
    const changes = !rt || kind === 'own copy' || kind === 'copy';
    if (rev) {
      if (changes) { out.actions.push('undo'); }
      out.actions.push('compare');
      if (isCp) { out.actions.push('back-to-main'); } else if (kind === 'good') { out.actions.push('edit-my-copy'); }
      if (!view) { out.menu.push('another-copy'); }
      if (isCp && changes) { out.menu.push('delete-copy'); }
    }
    return out;
  }

  /* findStep({ tables, sop_id, query }) → { kind, matches: [{ key, section, step_no }], section, vn_id, line }: the search box of the
     SOP line (plan 4.6). In this order: a Values Needed number (VN-0012, VN-12; a copy: its main SOP's rows), a Key (any case), a step
     number with a dot, a whole number that is a section, words (Action or Gujarati line, any case, spaces as one), in Seq order.
     kind: vn, key, step, section, text or none; line: the words beside the box. */
  const NUM = /^\d+(\.\d+)+$/, WHOLE = /^\d+$/, KEY = /^[A-Za-z0-9]+-\d{4}$/, VN = /^VN-?0*(\d{1,4})$/i;
  function findStep(input) {
    if (!input || !input.tables) { fail('findStep', 'input.tables is missing'); }
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    const q = String(input.query === null || input.query === undefined ? '' : input.query).trim().replace(/\s+/g, ' ');
    const none = line => ({ kind: 'none', matches: [], section: null, vn_id: null, line: line });
    if (!q) { return none('Type a step number (9.5), a Key (TANK01-2420), a Values Needed number (VN-0012) or words.'); }
    if (empty(sop.current_rev)) { return none(sop.sop_id + ' has no steps yet.'); }
    const rev = sop.current_rev;
    const steps = SEL.stepsOf(t, sop.sop_id, rev).slice().sort((a, b) => a.seq - b.seq);
    const sections = SEL.sectionsOf(t, sop.sop_id, rev);
    const at = s => ({ key: s.key, section: s.section, step_no: s.step_no });
    const found = (kind, list, line, extra) => Object.assign({ kind: kind, matches: list.map(at), section: list.length ? list[0].section : null, vn_id: null, line: line }, extra || {});
    let m;
    if ((m = VN.exec(q))) {
      const id = 'VN-' + ('000' + Number(m[1])).slice(-4);
      const vn = CP.vnOfSop(t, sop.sop_id).find(v => v.vn_id === id);
      if (!vn) { return none('No ' + id + ' in this SOP.'); }
      const ln = L.vnLinks(vn, steps, sections);
      if (ln.scope === 'Step') {
        const list = ln.keys.map(k => steps.find(s => s.key === k));
        return found('vn', list, id + ' · ' + (list.length === 1 ? 'step ' : 'steps ') + list.map(s => s.step_no).join(', '), { vn_id: id });
      }
      if (ln.scope === 'Section') { return { kind: 'vn', matches: [], section: ln.sections[0], vn_id: id, line: id + ' · ' + (ln.sections.length === 1 ? 'section ' : 'sections ') + ln.sections.join(', ') }; }
      return { kind: 'vn', matches: [], section: null, vn_id: id, line: id + ' · the whole SOP' };
    }
    if (KEY.test(q)) {
      const s = steps.find(x => String(x.key).toUpperCase() === q.toUpperCase());
      return s ? found('key', [s], s.key + ' · step ' + s.step_no) : none(q.toUpperCase() + ' is not a step of ' + rev + '.');
    }
    if (NUM.test(q)) {
      const s = steps.find(x => x.step_no === q);
      return s ? found('step', [s], 'Step ' + s.step_no) : none('No step ' + q + ' in ' + rev + '.');
    }
    if (WHOLE.test(q)) {
      const sec = sections.find(x => x.section === Number(q));
      if (sec) { return { kind: 'section', matches: [], section: sec.section, vn_id: null, line: 'Section ' + sec.section + ' · ' + sec.name }; }
    }
    const low = q.toLowerCase();
    const flat = v => String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').toLowerCase();
    const list = steps.filter(s => flat(s.action).indexOf(low) >= 0 || flat(s.action_gu).indexOf(low) >= 0);
    if (!list.length) { return none('Nothing found for "' + q + '".'); }
    return found('text', list, list.length + (list.length === 1 ? ' step' : ' steps') + ' with "' + q + '"');
  }

  /* copyRows(tables, sopId, who) → [{ sop_id, label, name, yours }]: the copies of the main SOP for its Header tab ("4 copies ▸"), in
     copy-number order; label as on the SOP line, yours = owned by who */
  function copyRows(tables, sopId, who) {
    return CP.copiesOf(tables, sopId).map(function (c) {
      const owner = ownerOfCopy(SEL.sopOf(tables, c.sop_id), c.saved_by);
      return { sop_id: c.sop_id, label: owner ? copyLabel(owner, c.saved_at) : String(c.copy_name), name: c.copy_name, yours: same(owner, who) };
    });
  }

  /* the six header rows shown first (plan 4.6); the rest sit behind "+ n more fields" */
  const HEADER_FIRST = ['Title', 'Product', 'Level', 'Who does it', 'Input from', 'Output to'];

  return { copyLabel, typeWord, myCopy, sopLine, findStep, copyRows, HEADER_FIRST };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_LINE;
