/* SOP Builder logic pieces for process SOPs (spec/example_process_sop.md
   part 5, job P2, Builder build 30): findSops (the "type br" search
   list), insertProcess (the steps of the released revision of a Process
   SOP come in after a step, Standard or Revised), reviseLinked (Make it a
   Revised copy), the guard of a Standard use (standardBroken,
   insideStandard) and linkMentions (a copied text that names a step
   number of its process SOP). A use = the rows one insert made:
   consecutive rows of one section with the same process SOP, revision and
   mode, no process step twice (so the same process SOP inserted twice in
   a row makes two uses). Pure. Classic script (global ENGINE_PROCESS);
   module in Node. Answer key: tests/golden11.js. */
const ENGINE_PROCESS = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const K = (typeof ENGINE_KEYS !== 'undefined') ? ENGINE_KEYS : require('./keys.js');
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const N = (typeof ENGINE_NUMBER !== 'undefined') ? ENGINE_NUMBER : require('./number.js');
  const FA = (typeof ENGINE_FACTS !== 'undefined') ? ENGINE_FACTS : require('./flow_facts.js');
  const SETSX = (typeof SETS !== 'undefined') ? SETS : require('../schema/sets.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const copy = v => JSON.parse(JSON.stringify(v));
  const bySeq = (a, b) => a.seq - b.seq;
  const isSub = no => String(no).split('.').length > 2;
  const ref = (field, message) => ({ field: field, message: message });
  const NAMES = TYPESX.tables.steps.fields.map(f => f.name);
  /* fields a renumber may change on a Standard step without touching it */
  const FREE = ['step_no', 'seq', 'hold', 'class', 'signed_by'];
  const TEXT_FIELDS = ['action', 'why', 'warning', 'tool', 'material', 'check', 'if_fail', 'skip_if', 'remark'];
  const LIMIT = 10, CUT = 60;

  /* ---- the search list ---- */
  function revLine(sop, revisions) {
    const mine = revisions.filter(r => r.sop_id === sop.sop_id);
    const rel = mine.find(r => r.status === 'Released');
    if (rel) { return rel.rev + ' · Released'; }
    if (empty(sop.current_rev)) { return 'no revision yet'; }
    const cur = mine.find(r => r.rev === sop.current_rev);
    return sop.current_rev + (cur ? ' ' + cur.status : '') + ': not released yet';
  }
  /* findSops({ sops, sop_revisions }, text, { process_only, leave_out }) → { rows: [{ sop_id, title, sop_type, line }], more }:
     every SOP whose ID or title has the text (small or capital letters), the ID matches first, each group in ID order;
     Retired SOPs, copies (build 39) and the IDs in leave_out are left out; 10 rows at most, more = how many more match */
  function findSops(tables, text, opts) {
    if (!tables || !Array.isArray(tables.sops) || !Array.isArray(tables.sop_revisions)) { fail('findSops', 'tables needs sops and sop_revisions'); }
    const o = opts || {};
    const q = String(text === null || text === undefined ? '' : text).trim().toLowerCase();
    const leave = Array.isArray(o.leave_out) ? o.leave_out : [];
    const pool = tables.sops.filter(s => s.status !== 'Retired' && empty(s.copy_of) && leave.indexOf(s.sop_id) < 0 && (!o.process_only || s.sop_type === 'Process'));
    const byId = (a, b) => (a.sop_id < b.sop_id ? -1 : (a.sop_id > b.sop_id ? 1 : 0));
    const inId = pool.filter(s => String(s.sop_id).toLowerCase().indexOf(q) >= 0).sort(byId);
    const inTitle = pool.filter(s => String(s.sop_id).toLowerCase().indexOf(q) < 0 && String(s.title || '').toLowerCase().indexOf(q) >= 0).sort(byId);
    const all = inId.concat(inTitle);
    const rows = all.slice(0, LIMIT).map(s => ({ sop_id: s.sop_id, title: s.title, sop_type: s.sop_type,
      line: s.sop_id + ' · ' + (empty(s.title) ? '(no title)' : s.title) + ' · ' + (s.sop_type === 'Process' ? revLine(s, tables.sop_revisions) : s.status) }));
    return { rows: rows, more: all.length - rows.length };
  }

  /* ---- uses ---- */
  function sameUse(a, b) {
    return !empty(a.link_sop) && a.link_sop === b.link_sop && a.link_rev === b.link_rev && a.link_mode === b.link_mode && a.section === b.section;
  }
  /* uses(ordered) → [{ keys, rows, link_sop, link_rev, link_mode }] over rows already in order */
  function uses(ordered) {
    const out = [];
    let cur = null;
    for (const s of ordered) {
      if (empty(s.link_sop)) { cur = null; continue; }
      const last = cur ? cur.rows[cur.rows.length - 1] : null;
      if (cur && sameUse(last, s) && !(s.link_key && cur.seen[s.link_key])) {
        cur.rows.push(s); cur.keys.push(s.key);
      } else {
        cur = { rows: [s], keys: [s.key], seen: {}, link_sop: s.link_sop, link_rev: s.link_rev, link_mode: s.link_mode };
        out.push(cur);
      }
      if (s.link_key) { cur.seen[s.link_key] = true; }
    }
    return out;
  }
  const runText = u => (u.rows.length > 1 ? 'Steps ' + u.rows[0].step_no + ' to ' + u.rows[u.rows.length - 1].step_no + ' follow ' : 'Step ' + u.rows[0].step_no + ' follows ') +
    u.link_sop + ' (Standard): ' + (u.rows.length > 1 ? 'they stay together, in the order of ' : 'it stays as in ') + u.link_sop + '.';
  /* lockedText(step) → the line of a step that follows a process SOP as Standard (also the field menu of the step card, build 35) */
  const lockedText = s => 'Step ' + s.step_no + ' follows ' + s.link_sop + ' (Standard): change ' + s.link_sop + ', or make it a Revised copy.';

  /* insideStandard(steps, afterKey) → null, or the refusal when a row put right after afterKey would land between two steps of one Standard use */
  function insideStandard(steps, afterKey) {
    if (empty(afterKey)) { return null; }
    const ordered = steps.slice().sort(bySeq);
    const i = ordered.findIndex(s => s.key === afterKey);
    if (i < 0) { fail('insideStandard', 'no step with key ' + afterKey); }
    const next = ordered[i + 1];
    if (!next) { return null; }
    const u = uses(ordered).find(x => x.link_mode === 'Standard' && x.keys.indexOf(afterKey) >= 0 && x.keys.indexOf(next.key) >= 0);
    return u ? [ref('form', runText(u))] : null;
  }

  /* standardBroken(oldSteps, newSteps) → null, or the refusal when a change touches a Standard use: a Standard step changed
     (any field but its number, Seq and the hold label) or gone, or a use no longer together and in its order.
     newSteps are in their new order (Seq may be old). A step made a Revised copy is no longer checked. */
  function standardBroken(oldSteps, newSteps) {
    const old = oldSteps.slice().sort(bySeq);
    const now = {};
    newSteps.forEach((s, i) => { now[s.key] = { s: s, i: i }; });
    for (const s of old) {
      if (s.link_mode !== 'Standard') { continue; }
      const n = now[s.key];
      if (!n) { return [ref('form', lockedText(s))]; }
      if (n.s.link_mode !== 'Standard') { continue; }
      if (NAMES.some(f => FREE.indexOf(f) < 0 && E.asText(s[f]) !== E.asText(n.s[f]))) { return [ref('form', lockedText(s))]; }
    }
    for (const u of uses(old)) {
      if (u.link_mode !== 'Standard' || u.keys.length < 2 || u.keys.some(k => now[k].s.link_mode !== 'Standard')) { continue; }
      const at = u.keys.map(k => now[k].i);
      if (at.some((p, j) => j > 0 && p !== at[j - 1] + 1)) { return [ref('form', runText(u))]; }
    }
    return null;
  }

  /* ---- insert ---- */
  /* insertProcess({ tables: { sops, sop_revisions, steps, retired_keys }, sop_id, rev, after_key, process_sop_id, mode, ctx })
     → { refusals } or { steps (the revision in order, renumbered), new_keys: [{ key, link_key, rule }], history, renumbered, first_no, last_no }.
     The rows go after the block of after_key (a step and its sub-steps); each gets a new key of the SOP (newKey between the row
     before and the step after), a copy of every field of its process step but the key, SOP, revision, number, Seq and section,
     and the link fields. A process step numbered x.y.z comes in as a sub-step, any other as a step (the first always a step). */
  function insertProcess(input) {
    if (!input || !input.tables) { fail('insertProcess', 'no input tables'); }
    const t = input.tables;
    for (const n of ['sops', 'sop_revisions', 'steps', 'retired_keys']) { if (!Array.isArray(t[n])) { fail('insertProcess', 'tables needs ' + n); } }
    E.checkCtx(input.ctx, 'insertProcess');
    const sop = t.sops.find(s => s.sop_id === input.sop_id);
    if (!sop) { fail('insertProcess', 'SOP ' + input.sop_id + ' is not in sops'); }
    if (sop.sop_type === 'Process') { return { refusals: [ref('form', 'A Process SOP cannot go inside a Process SOP.')] }; }
    const refusals = [];
    const proc = empty(input.process_sop_id) ? null : t.sops.find(s => s.sop_id === String(input.process_sop_id).trim()) || null;
    if (!proc) { refusals.push(ref('process', 'Pick a Process SOP.')); }
    else if (proc.sop_type !== 'Process') { refusals.push(ref('process', proc.sop_id + ' is a Main SOP: pick a Process SOP.')); }
    if (SETSX.link_mode.indexOf(input.mode) < 0) { refusals.push(ref('mode', 'Use as is not set: Standard or Revised.')); }
    if (refusals.length) { return { refusals: refusals }; }
    const rel = t.sop_revisions.find(r => r.sop_id === proc.sop_id && r.status === 'Released');
    if (!rel) { return { refusals: [ref('process', proc.sop_id + ' has no released revision yet.')] }; }
    const pSteps = t.steps.filter(s => s.sop_id === proc.sop_id && s.rev === rel.rev).sort(bySeq);
    if (!pSteps.length) { return { refusals: [ref('process', proc.sop_id + ' ' + rel.rev + ' has no steps.')] }; }
    const sopSteps = t.steps.filter(s => s.sop_id === sop.sop_id && s.rev === input.rev).sort(bySeq);
    let at = sopSteps.findIndex(s => s.key === input.after_key);
    if (at < 0) { fail('insertProcess', 'no step with key ' + input.after_key + ' in ' + sop.sop_id + ' ' + input.rev); }
    const section = sopSteps[at].section;
    while (at + 1 < sopSteps.length && sopSteps[at + 1].section === section && isSub(sopSteps[at + 1].step_no)) { at++; }
    const inside = insideStandard(sopSteps, sopSteps[at].key);
    if (inside) { return { refusals: inside }; }
    if (empty(input.ctx.reason)) { return { refusals: [ref('reason', 'Reason for change is empty')] }; }
    const used = SEL.familyKeys(t, sop.sop_id);   /* build 39: the keys of the good version and its copies */
    const nextKey = at + 1 < sopSteps.length ? sopSteps[at + 1].key : null;
    const rows = [], newKeys = [], kinds = {};
    let prev = sopSteps[at].key;
    pSteps.forEach(function (p, i) {
      const nk = K.newKey(sop.short, used, t.retired_keys, prev, nextKey);
      used.push(nk.key);
      const r = Object.assign(copy(p), { key: nk.key, sop_id: sop.sop_id, rev: input.rev, step_no: null, seq: 0, section: section,
        link_sop: proc.sop_id, link_rev: rel.rev, link_key: p.key, link_mode: input.mode });
      kinds[r.key] = i > 0 && isSub(p.step_no) ? 'sub' : 'step';
      rows.push(r);
      newKeys.push({ key: nk.key, link_key: p.key, rule: nk.rule });
      prev = nk.key;
    });
    let steps = sopSteps.slice(0, at + 1).concat(rows).concat(sopSteps.slice(at + 1));
    const num = N.numberSection(steps.filter(s => s.section === section), kinds);
    if (num.refusals) { return num; }
    steps = steps.map(s => ((s.section === section && num.numbers[s.key] !== s.step_no) ? Object.assign(copy(s), { step_no: num.numbers[s.key] }) : s));
    let history = [];
    for (const r of rows) {
      const note = 'added: ' + num.numbers[r.key] + ' ' + T.firstPart(r.action) + ' (' + input.mode + ', ' + proc.sop_id + ' ' + rel.rev + ' step ' + r.link_key + '; key ' + r.key + ')';
      history = E.historyRows({ table: 'steps', row_id: r.key, sop_id: sop.sop_id, rev: input.rev, old: { row: null }, new: { row: note }, fields: ['row'], ctx: input.ctx, after: history });
    }
    for (const m of num.renumbered) {
      history = E.historyRows({ table: 'steps', row_id: m.key, sop_id: sop.sop_id, rev: input.rev, old: { step_no: m.old }, new: { step_no: m.new }, fields: ['step_no'], ctx: input.ctx, after: history });
    }
    return { steps: K.renumber(steps).steps, new_keys: newKeys, history: history, renumbered: num.renumbered,
      first_no: num.numbers[rows[0].key], last_no: num.numbers[rows[rows.length - 1].key] };
  }

  /* reviseLinked(steps, key, ctx) → { refusals } or { steps (in order), keys, history }: every step of the Standard use of key
     becomes Revised (the editor's own copy; it no longer changes with the process SOP); one History row per step */
  function reviseLinked(steps, key, ctx) {
    E.checkCtx(ctx, 'reviseLinked');
    const ordered = steps.slice().sort(bySeq);
    const s = ordered.find(x => x.key === key);
    if (!s) { fail('reviseLinked', 'no step with key ' + key); }
    if (empty(s.link_sop)) { return { refusals: [ref('form', 'Step ' + s.step_no + ' is not from a process SOP.')] }; }
    if (s.link_mode !== 'Standard') { return { refusals: [ref('form', 'Step ' + s.step_no + ' is already a Revised copy of ' + s.link_sop + '.')] }; }
    if (empty(ctx.reason)) { return { refusals: [ref('reason', 'Reason for change is empty')] }; }
    const u = uses(ordered).find(x => x.keys.indexOf(key) >= 0);
    let history = [];
    const out = ordered.map(function (x) {
      if (u.keys.indexOf(x.key) < 0) { return x; }
      const n = Object.assign(copy(x), { link_mode: 'Revised' });
      history = E.historyRows({ table: 'steps', row_id: x.key, sop_id: x.sop_id, rev: x.rev, old: x, new: n, fields: ['link_mode'], ctx: ctx, after: history });
      return n;
    });
    return { steps: out, keys: u.keys.slice(), history: history };
  }

  /* linkMentions(revisionSteps, allSteps) → [{ table, row_id, field, mentions: [{ old, new }], text, link_sop, link_mode }]: the texts of rows that came
     from a process SOP and name a step number of that process SOP revision; new = the number of that step in the same use here,
     null when the use has no such step. The same shape as the texts to check (engine/stale.js). */
  function linkMentions(revSteps, allSteps) {
    const out = [], numbers = {};
    for (const u of uses(revSteps.slice().sort(bySeq))) {
      const id = u.link_sop + '|' + u.link_rev;
      if (!numbers[id]) {
        numbers[id] = {};
        for (const p of allSteps) { if (p.sop_id === u.link_sop && p.rev === u.link_rev) { numbers[id][String(p.step_no)] = p.key; } }
      }
      const here = {};
      for (const r of u.rows) { if (!empty(r.link_key)) { here[r.link_key] = String(r.step_no); } }
      for (const r of u.rows) {
        if (empty(r.link_key)) { continue; }
        for (const f of TEXT_FIELDS) {
          if (empty(r[f])) { continue; }
          const s = String(r[f]), found = [];
          for (const tok of FA.stepTokens(s)) {
            const pk = numbers[id][tok];
            if (pk === undefined) { continue; }
            const n = here[pk] === undefined ? null : here[pk];
            if (n !== tok && !found.some(x => x.old === tok)) { found.push({ old: tok, new: n }); }
          }
          if (found.length) { out.push({ table: 'steps', row_id: r.step_no + ' ' + r.key, field: f, mentions: found, text: s.length > CUT ? s.slice(0, CUT) + '…' : s, link_sop: u.link_sop, link_mode: u.link_mode }); }
        }
      }
    }
    return out;
  }

  /* ---- the release of a new revision of a process SOP (P3, example_process_sop.md part 6) ---- */
  const KEEP_OUT = ['key', 'sop_id', 'rev', 'step_no', 'seq', 'section', 'hold', 'class', 'signed_by', 'link_sop', 'link_rev', 'link_key', 'link_mode'];
  const COPY = NAMES.filter(n => KEEP_OUT.indexOf(n) < 0);
  const MAX_NOTE = 300;
  const cutText = t => { const x = String(T.firstPart(t) || ''); return x.length > 40 ? x.slice(0, 40).replace(/\s+$/, '') + '…' : x; };
  const val = v => (v === undefined ? null : copy(v));
  /* stayInOrder(oldKeys, newKeys) → { key: true } for the keys that keep their order: the longest such run; when two are
     as long, the one that keeps the earlier keys of the new order. The other keys moved. */
  function stayInOrder(a, b) {
    const n = b.length, m = a.length;
    const L = [];
    for (let i = 0; i <= n; i++) { L.push(new Array(m + 1).fill(0)); }
    for (let i = n - 1; i >= 0; i--) { for (let j = m - 1; j >= 0; j--) { L[i][j] = b[i] === a[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]); } }
    const keep = {};
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (b[i] === a[j]) { keep[b[i]] = true; i++; j++; } else if (L[i][j + 1] >= L[i + 1][j]) { j++; } else { i++; }
    }
    return keep;
  }
  /* syncRevision({ sop: { sop_id, short }, steps (one revision of a main SOP), proc_sop_id, new_rev, proc_steps (every revision of the
     process SOP), used_keys (every key of the main SOP), retired (retired_keys rows), memo, with_notes, ctx (+ next_note_id) })
     → null when no use of the process SOP waits for new_rev; else { steps (in order, renumbered), retired, notes, history, counts, report, memo }.
     A Standard use takes the steps of new_rev in their order: a kept step (same process key) keeps its main key and takes every field
     but key, SOP, revision, number, Seq and section; a new step gets a new key (the same one as in another revision of the main SOP
     for the same use and step: memo, "first key of the use>process key"); a step gone retires its key. Notes, one per step box: changed
     (the fields), moved (the fewest), added, removed (on the step before it). A Revised copy keeps its steps and gets one note on its first
     step. History reason: "<process SOP> <rev> released". with_notes false (an older revision than the one the editors open): no notes. */
  function syncRevision(input) {
    const ctx = input.ctx;
    E.checkCtx(ctx, 'syncRevision');
    if (!Number.isInteger(ctx.next_note_id)) { fail('syncRevision', 'ctx.next_note_id (the next note number) is missing'); }
    const P = input.proc_sop_id, R2 = input.new_rev;
    const ordered = input.steps.slice().sort(bySeq);
    const waiting = uses(ordered).filter(u => u.link_sop === P && u.link_rev !== R2);
    if (!waiting.length) { return null; }
    const sopId = ordered[0].sop_id, rev = ordered[0].rev;
    const newP = input.proc_steps.filter(x => x.sop_id === P && x.rev === R2).sort(bySeq);
    const inNew = {};
    for (const p of newP) { inNew[p.key] = true; }
    const memo = Object.assign({}, input.memo || {});
    const used = input.used_keys.slice();
    for (const k in memo) { used.push(memo[k]); }
    const hctx = Object.assign({}, ctx, { reason: P + ' ' + R2 + ' released' });
    const day = String(ctx.now).slice(0, 10);
    const counts = { standard: 0, revised: 0, changed: 0, added: 0, removed: 0, moved: 0, notes: 0 };
    const own = {}, removedAt = {}, revisedAt = [];
    const replaced = {}, dropped = {}, gone = [], touched = {};
    for (const u of waiting) {
      if (u.link_mode !== 'Standard') { counts.revised++; revisedAt.push(u.rows[0].key); continue; }
      counts.standard++;
      const byLink = {};
      for (const r of u.rows) { byLink[r.link_key] = r; }
      const stay = stayInOrder(u.rows.filter(r => inNew[r.link_key]).map(r => r.link_key), newP.filter(p => byLink[p.key]).map(p => p.key));
      const rows = newP.map(function (p, i) {
        const kind = i > 0 && isSub(p.step_no) ? 'sub' : 'step';
        const r = byLink[p.key];
        if (!r) { return { row: Object.assign(copy(p), { key: null, sop_id: sopId, rev: rev, step_no: null, seq: 0, section: u.rows[0].section, link_sop: P, link_rev: R2, link_key: p.key, link_mode: 'Standard' }), memo: u.keys[0] + '>' + p.key, kind: kind, isNew: true }; }
        const n = Object.assign(copy(r), { link_rev: R2 });
        for (const f of COPY) { n[f] = val(p[f]); }
        return { row: n, old: r, kind: kind, isNew: false, changed: COPY.filter(f => E.asText(r[f]) !== E.asText(p[f])), moved: !stay[p.key] };
      });
      replaced[u.keys[0]] = rows;
      touched[u.rows[0].section] = true;
      for (const r of u.rows) { dropped[r.key] = true; if (!inNew[r.link_key]) { gone.push(r); } }
    }
    /* the new order: each Standard use's rows in the place of its first row */
    const oldNo = {};
    for (const s of ordered) { oldNo[s.key] = s.step_no; }
    const out = [];
    for (const s of ordered) {
      if (replaced[s.key]) { for (const x of replaced[s.key]) { out.push(x.row); } }
      if (!dropped[s.key]) { out.push(copy(s)); }
    }
    const fresh = [];
    for (const k in replaced) { for (const x of replaced[k]) { if (x.isNew) { fresh.push(x); } } }
    for (let i = 0; i < out.length; i++) {
      if (out[i].key !== null) { continue; }
      const x = fresh.find(f => f.row === out[i]);
      let key = memo[x.memo];
      if (!key) {
        let j = i + 1;
        while (j < out.length && out[j].key === null) { j++; }
        key = K.newKey(input.sop.short, used, input.retired, i > 0 ? out[i - 1].key : null, j < out.length ? out[j].key : null).key;
        used.push(key);
        memo[x.memo] = key;
      }
      out[i].key = key;
    }
    /* numbers: every row of a use, and a sub-step right after a use, numbered by its kind; the other rows keep theirs where they fit */
    const kinds = {}, sections = touched;
    for (const k in replaced) {
      const rows = replaced[k];
      for (const x of rows) { kinds[x.row.key] = x.kind; }
      if (!rows.length) { continue; }
      let at = out.indexOf(rows[rows.length - 1].row) + 1;
      while (at < out.length && out[at].section === rows[0].row.section && isSub(out[at].step_no) && kinds[out[at].key] === undefined) { kinds[out[at].key] = 'sub'; at++; }
    }
    for (const sec in sections) {
      const num = N.numberSection(out.filter(x => String(x.section) === sec), kinds);
      if (num.refusals) { fail('syncRevision', 'section ' + sec + ': ' + num.refusals[0].message); }
      for (const x of out) { if (String(x.section) === sec && num.numbers[x.key] !== undefined) { x.step_no = num.numbers[x.key]; } }
    }
    /* History and notes */
    let history = [];
    const pinPart = (key, part, late) => { own[key] = own[key] || { first: [], late: [] }; own[key][late ? 'late' : 'first'].push(part); };
    for (const k in replaced) {
      for (const x of replaced[k]) {
        const r = x.row;
        if (x.isNew) {
          counts.added++;
          history = E.historyRows({ table: 'steps', row_id: r.key, sop_id: sopId, rev: rev, old: { row: null }, new: { row: 'added: ' + r.step_no + ' ' + T.firstPart(r.action) + ' (Standard, ' + P + ' ' + R2 + ' step ' + r.link_key + '; key ' + r.key + ')' },
            fields: ['row'], ctx: hctx, after: history });
          pinPart(r.key, 'added this step');
          continue;
        }
        history = E.historyRows({ table: 'steps', row_id: r.key, sop_id: sopId, rev: rev, old: x.old, new: r, fields: x.changed.concat(['link_rev']), ctx: hctx, after: history });
        if (x.changed.length) { counts.changed++; }
        if (x.moved) { counts.moved++; }
        const what = x.changed.length ? 'changed this step (' + x.changed.map(f => E.LABEL[f] || f).join(', ') + ')' + (x.moved ? ' and moved it' : '') : (x.moved ? 'moved this step' : null);
        if (what) { pinPart(r.key, what); }
      }
    }
    const retired = [];
    const alive = {};
    for (const x of out) { alive[x.key] = true; }
    for (const g of gone) {
      counts.removed++;
      retired.push({ key: g.key, sop_id: sopId, range_to: null, retired_in: rev, reason: 'Removed by ' + P + ' ' + R2, source: 'Builder: ' + ctx.who + ' ' + day });
      history = E.historyRows({ table: 'steps', row_id: g.key, sop_id: sopId, rev: rev, old: { row: null }, new: { row: 'retired: ' + g.step_no + ' ' + T.firstPart(g.action) + ' (' + g.key + '): ' + P + ' ' + R2 + ' removed it' },
        fields: ['row'], ctx: hctx, after: history });
      const at = ordered.indexOf(g);
      let pin = null, where = 'after';
      for (let j = at - 1; j >= 0 && ordered[j].section === g.section; j--) { if (alive[ordered[j].key]) { pin = ordered[j].key; break; } }
      if (!pin) { for (let j = at + 1; j < ordered.length && ordered[j].section === g.section; j++) { if (alive[ordered[j].key]) { pin = ordered[j].key; where = 'before'; break; } } }
      const key = pin || 'section ' + g.section;
      removedAt[key] = removedAt[key] || { where: pin ? where : 'from', section: g.section, list: [] };
      removedAt[key].list.push(g.step_no + ' (' + cutText(g.action) + ')');
    }
    for (const key in removedAt) {
      const m = removedAt[key];
      pinPart(key, 'removed step' + (m.list.length > 1 ? 's ' : ' ') + m.list.join(', ') + (m.where === 'from' ? ' from this section' : ' ' + m.where + ' this step'), true);
    }
    /* the notes, in the order of their boxes; a section box last */
    const pos = {};
    out.forEach((x, i) => { pos[x.key] = i; });
    const pins = input.with_notes === false ? [] : Object.keys(own).concat(revisedAt.filter(k => !own[k])).sort((a, b) => (pos[a] === undefined ? 1e9 : pos[a]) - (pos[b] === undefined ? 1e9 : pos[b]));
    const notes = [];
    let nid = ctx.next_note_id;
    for (const key of pins) {
      let text;
      if (own[key]) { text = P + ' ' + R2 + ' ' + own[key].first.concat(own[key].late).join('; ') + ': confirm.'; }
      else { text = 'Standard ' + P + ' changed on ' + day + ' (' + R2 + '): check your copy.'; }
      if (text.length > MAX_NOTE) { text = text.slice(0, MAX_NOTE - 1) + '…'; }
      const onSection = /^section /.test(key);
      const step = onSection ? null : out.find(x => x.key === key);
      const note = { note_id: nid++, sop_id: sopId, rev: rev, chart: onSection ? 'sections' : 'steps', section: onSection ? null : step.section, pin: 'box',
        pin_ref: onSection ? key.split(' ')[1] : key, x: null, y: null, text: text, status: 'Open', written_by: ctx.who, written_at: ctx.now, closed_by: null, closed_at: null };
      notes.push(note);
      history = E.historyRows({ table: 'chart_notes', row_id: note.note_id + ' ' + rev, sop_id: sopId, rev: rev, old: { row: null }, new: { row: 'added: ✎ ' + note.note_id + ' ' + text + ' (box ' + note.pin_ref + ')' },
        fields: ['row'], ctx: hctx, after: history });
    }
    counts.notes = notes.length;
    for (const x of out) {
      if (oldNo[x.key] !== undefined && oldNo[x.key] !== x.step_no) {
        history = E.historyRows({ table: 'steps', row_id: x.key, sop_id: sopId, rev: rev, old: { step_no: oldNo[x.key] }, new: { step_no: x.step_no }, fields: ['step_no'], ctx: hctx, after: history });
      }
    }
    const parts = [];
    if (counts.standard) { parts.push(counts.changed + ' changed, ' + counts.added + ' added, ' + counts.removed + ' removed' + (counts.moved ? ', ' + counts.moved + ' moved' : '')); }
    if (counts.revised) { parts.push(counts.revised + ' Revised ' + (counts.revised > 1 ? 'copies' : 'copy')); }
    const report = sopId + ' ' + rev + ': ' + parts.join('; ') + ' (' + (counts.notes ? counts.notes + (counts.notes > 1 ? ' notes' : ' note') + ' to confirm' : 'no note') + ')';
    return { steps: K.renumber(out).steps, retired: retired, notes: notes, history: history, counts: counts, report: report, memo: memo };
  }

  /* useOf(steps, key) → the use of key ({ keys, first_no, last_no, link_sop, link_rev, link_mode }) or null, for the forms */
  function useOf(steps, key) {
    const u = uses(steps.slice().sort(bySeq)).find(x => x.keys.indexOf(key) >= 0);
    return u ? { keys: u.keys.slice(), first_no: u.rows[0].step_no, last_no: u.rows[u.rows.length - 1].step_no, link_sop: u.link_sop, link_rev: u.link_rev, link_mode: u.link_mode } : null;
  }

  return { findSops, insertProcess, reviseLinked, standardBroken, insideStandard, linkMentions, useOf, syncRevision, lockedText };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_PROCESS;
