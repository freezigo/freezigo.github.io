/* SOP Builder logic pieces for editing sections on the chart
   (example_flow.md parts 5 to 8 and 14): coerceSection, checkSection,
   editSection, arrowChanges, sectionMoveTarget, moveSection, addSection,
   retireSection, retireStep, sectionMentionsOf. Process sections are
   numbered 3, 4, 5 ... with no gap; a move, an add after a box and a
   retire renumber the later sections, their steps, the clean Needs fields
   and the notes pinned to them. Pure. Classic script (global
   ENGINE_SECTIONS); module in Node. Answer key: tests/golden6.js. */
const ENGINE_SECTIONS = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const K = (typeof ENGINE_KEYS !== 'undefined') ? ENGINE_KEYS : require('./keys.js');
  const FL = (typeof ENGINE_FLOW !== 'undefined') ? ENGINE_FLOW : require('./flow.js');
  const FA = (typeof ENGINE_FACTS !== 'undefined') ? ENGINE_FACTS : require('./flow_facts.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const copy = v => JSON.parse(JSON.stringify(v));
  const r = (field, message) => ({ field: field, message: message });
  const refuse = (field, message) => ({ refusals: [r(field, message)] });
  const FIELDS = TYPESX.tables.sections.fields;
  const NAMES = FIELDS.map(f => f.name);
  const EDITABLE = NAMES.filter(n => ['sop_id', 'rev', 'section', 'source_ref'].indexOf(n) < 0);
  const list = v => Array.isArray(v) ? v : [];
  const rowId = s => s.sop_id + ' ' + s.rev + ' ' + s.section;
  const isNum = v => typeof v === 'number' && isFinite(v);

  /* coerceSection(changes): what the form typed into the contract types; a wrong value stays as typed */
  function coerceSection(changes) {
    const out = {};
    for (const k in changes) {
      const f = FIELDS.find(x => x.name === k);
      let v = changes[k];
      if (typeof v === 'string') { v = v.trim(); }
      if (v === '' || v === undefined) { out[k] = null; continue; }
      if (!f || typeof v !== 'string') { out[k] = v; continue; }
      if (f.type === 'int' || f.type === 'number') { out[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; } else if (f.type === 'bool') { out[k] = v === 'Y' ? true : (v === 'N' ? false : v); } else if (f.type === 'list_int') { const p = v.split(',').map(x => x.trim()); out[k] = p.every(x => /^\d+$/.test(x)) ? p.map(Number) : v; } else if (f.type === 'list_text') { out[k] = v.split(',').map(x => x.trim()).filter(x => x); } else { out[k] = v; }
    }
    return out;
  }

  /* checkSection(section, sopSections, sopSteps, sopIds) → refusals ([] = may be saved) */
  function checkSection(sec, sopSections, sopSteps, sopIds) {
    const out = [];
    if (empty(sec.name)) { out.push(r('name', 'Name is empty.')); }
    for (const id of list(sec.needs_sops)) { if (sopIds.indexOf(id) < 0) { out.push(r('needs_sops', 'Needs SOP ' + id + ' is not on the SOP list.')); } }
    const ns = sec.needs_sections;
    if (ns !== null && ns !== undefined && !(Array.isArray(ns) && ns.every(n => Number.isInteger(n)))) {
      out.push(r('needs_sections', 'Needs sections must be section numbers with commas. Example: 7, 8.'));
    } else if (list(ns).indexOf(sec.section) >= 0) {
      out.push(r('needs_sections', 'A section cannot need itself.'));
    } else {
      const nums = sopSections.map(s => s.section);
      const missing = list(ns).find(n => nums.indexOf(n) < 0);
      if (missing !== undefined) { out.push(r('needs_sections', 'Needs section ' + missing + ' is not a section of this revision.')); } else {
        const loop = FL.loopOf(sopSections.map(s => s.section === sec.section ? sec : s));
        if (loop) { out.push(r('needs_sections', loop)); }
      }
    }
    const wa = sec.wait_after, wm = sec.wait_min;
    const hasA = wa !== null && wa !== undefined, hasM = wm !== null && wm !== undefined;
    if (hasA !== hasM) { out.push(r(hasA ? 'wait_min' : 'wait_after', 'Wait after needs both the section and the minutes.')); } else if (hasA) {
      if (list(ns).indexOf(wa) < 0) { out.push(r('wait_after', 'Wait after section ' + wa + ' is not in Needs sections.')); }
      if (!isNum(wm) || wm < 0) { out.push(r('wait_min', 'Wait minutes must be a number of 0 or more.')); }
    }
    const mine = sopSteps.filter(s => s.section === sec.section).map(s => s.step_no);
    for (const st of list(sec.any_time_steps)) { if (mine.indexOf(st) < 0) { out.push(r('any_time_steps', 'Any time step ' + st + ' is not a step of section ' + sec.section + '.')); } }
    /* contract 1.7 (build 69): Skilled and Helper, whole numbers of 0 or more; empty = not given */
    for (const [f, word, ex] of [['skilled', 'Skilled', '1'], ['helper', 'Helper', '0']]) {
      const v = sec[f];
      if (v !== null && v !== undefined && !(Number.isInteger(v) && v >= 0)) { out.push(r(f, word + ' must be a whole number of 0 or more. Example: ' + ex + '.')); }
    }
    const m = sec.est_min;
    if (m !== null && m !== undefined && !(isNum(m) && m >= 0)) { out.push(r('est_min', 'Est min must be a number of 0 or more.')); }
    return out;
  }

  /* editSection(section, changes, ctx, sopSections, sopSteps, sopIds) → { section, history } or { refusals } */
  function editSection(sec, changes, ctx, sopSections, sopSteps, sopIds) {
    E.checkCtx(ctx, 'editSection');
    const typed = coerceSection(changes);
    if ('section' in typed && typed.section !== sec.section) { return refuse('section', 'Section number changes only by a move.'); }
    for (const k in typed) { if (k !== 'section' && EDITABLE.indexOf(k) < 0) { fail('editSection', 'field ' + k + ' cannot be changed here'); } }
    const next = Object.assign(copy(sec), typed);
    const refusals = checkSection(next, sopSections, sopSteps, sopIds);
    if (refusals.length) { return { refusals: refusals }; }
    if (EDITABLE.every(f => E.asText(sec[f]) === E.asText(next[f]))) { return refuse('form', 'Nothing changed.'); }
    if (empty(ctx.reason)) { return refuse('reason', 'Reason for change is empty.'); }
    return { section: next, history: E.historyRows({ table: 'sections', row_id: rowId(sec), sop_id: sec.sop_id, rev: sec.rev, old: sec, new: next, fields: EDITABLE, ctx: ctx, after: [] }) };
  }

  /* arrowChanges(section, fromId, action) → changes for editSection, or { refusals }; fromId = section number as text or an SOP ID */
  function arrowChanges(sec, fromId, action) {
    const isSec = /^\d+$/.test(String(fromId));
    const field = isSec ? 'needs_sections' : 'needs_sops';
    const v = isSec ? Number(fromId) : String(fromId);
    const cur = list(sec[field]).slice();
    const has = cur.indexOf(v) >= 0;
    const name = 'Arrow ' + fromId + ' → ' + sec.section;
    if (action === 'add') {
      if (has) { return refuse('arrow', name + ' is already there.'); }
      cur.push(v);
      const out = {}; out[field] = isSec ? cur.sort((a, b) => a - b) : cur.sort(); return out;
    }
    if (action !== 'remove') { fail('arrowChanges', 'action must be add or remove'); }
    if (!has) {
      if (isSec && sec.needs_setup === true) { return refuse('arrow', name + ' is a same shift arrow: set Set-up this shift on the form of section ' + sec.section + '.'); }
      return refuse('arrow', name + ' is not there.');
    }
    const out = {}; out[field] = cur.filter(x => x !== v); return out;
  }

  /* sectionMoveTarget(sections, n, direction) → { after } (0 = first) or { refusals } */
  function sectionMoveTarget(sections, n, direction) {
    const order = sections.map(s => s.section).sort((a, b) => a - b);
    const i = order.indexOf(n);
    if (i < 0) { fail('sectionMoveTarget', 'no section ' + n); }
    if (direction === 'up') { return i === 0 ? refuse('move', 'Section ' + n + ' is already first.') : { after: i >= 2 ? order[i - 2] : 0 }; }
    if (direction === 'down') { return i === order.length - 1 ? refuse('move', 'Section ' + n + ' is already last.') : { after: order[i + 1] }; }
    fail('sectionMoveTarget', 'direction must be up or down');
  }

  /* renumber(sections, steps, notes, map, ctx, history) → the rows with every number moved by map { old: new } (new null = gone) */
  function renumber(sections, steps, notes, map, ctx, history) {
    const to = n => (map[n] === undefined ? n : map[n]);
    const stepNo = no => { const p = String(no).split('.'); const m = map[Number(p[0])]; return m === undefined || m === null ? no : [m].concat(p.slice(1)).join('.'); };
    let hist = history;
    const secs = sections.filter(s => to(s.section) !== null).map(function (s) {
      const n = copy(s);
      n.section = to(s.section);
      if (Array.isArray(s.needs_sections)) { n.needs_sections = s.needs_sections.filter(x => to(x) !== null).map(to).sort((a, b) => a - b); }
      if (s.wait_after !== null && s.wait_after !== undefined) { n.wait_after = to(s.wait_after); }
      if (Array.isArray(s.any_time_steps)) { n.any_time_steps = s.any_time_steps.map(stepNo); }
      return n;
    }).sort((a, b) => a.section - b.section);
    const moved = sections.filter(s => map[s.section] !== undefined && map[s.section] !== null && map[s.section] !== s.section).sort((a, b) => a.section - b.section);
    for (const s of moved) { hist = E.historyRows({ table: 'sections', row_id: rowId(s), sop_id: s.sop_id, rev: s.rev, old: { section: s.section }, new: { section: map[s.section] }, fields: ['section'], ctx: ctx, after: hist }); }
    const order = secs.map(s => s.section);
    const st = steps.filter(s => to(s.section) !== null).map(s => Object.assign(copy(s), { section: to(s.section), step_no: stepNo(s.step_no) }))
      .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || a.seq - b.seq);
    const nt = notes.map(function (n) {
      const x = copy(n);
      if (n.chart === 'steps' && n.section !== null) { x.section = to(n.section); }
      if (n.chart === 'sections' && n.pin === 'box' && /^\d+$/.test(String(n.pin_ref))) { const m = to(Number(n.pin_ref)); x.pin_ref = m === null ? null : String(m); }
      if (n.chart === 'sections' && n.pin === 'arrow') {
        const parts = String(n.pin_ref).split('>').map(p => (/^\d+$/.test(p) ? to(Number(p)) : p));
        x.pin_ref = parts.indexOf(null) >= 0 ? null : parts.join('>');
      }
      return x;
    });
    return { sections: secs, steps: K.renumber(st).steps, notes: nt, history: hist };
  }
  /* a note whose box or arrow is gone becomes a loose note (free, no place), with a History row */
  function loosen(oldNotes, notes, ctx, history) {
    let hist = history;
    const out = notes.map(function (n, i) {
      const o = oldNotes[i];
      const gone = (n.chart === 'sections' && n.pin !== 'free' && n.pin_ref === null) || (n.chart === 'steps' && n.section === null);
      if (!gone) { return n; }
      hist = E.historyRows({ table: 'chart_notes', row_id: o.note_id + ' ' + o.rev, sop_id: o.sop_id, rev: o.rev, old: { pin_ref: o.pin_ref }, new: { pin_ref: null }, fields: ['pin_ref'], ctx: ctx, after: hist });
      return Object.assign(n, { chart: 'sections', section: null, pin: 'free', pin_ref: null, x: null, y: null });
    });
    return { notes: out, history: hist };
  }
  const maps = (steps) => ({ step_nos: steps.reduce((m, s) => { m[s.key] = s.step_no; return m; }, {}), seqs: steps.reduce((m, s) => { m[s.key] = s.seq; return m; }, {}) });

  /* moveSection(sections, steps, notes, n, after, ctx) → { sections, steps, notes, map, history, step_nos, seqs } or { refusals }; after 0 = first */
  function moveSection(sections, steps, notes, n, after, ctx) {
    E.checkCtx(ctx, 'moveSection');
    const order = sections.map(s => s.section).sort((a, b) => a - b);
    if (order.indexOf(n) < 0) { fail('moveSection', 'no section ' + n); }
    if (after === n) { return refuse('move', 'A section cannot go after itself.'); }
    const rest = order.filter(x => x !== n);
    const at = after === 0 ? 0 : rest.indexOf(after) + 1;
    if (after !== 0 && at === 0) { fail('moveSection', 'no section ' + after); }
    rest.splice(at, 0, n);
    const map = {};
    rest.forEach((old, i) => { if (old !== order[i]) { map[old] = order[i]; } });
    if (!Object.keys(map).length) { return refuse('move', 'Section ' + n + ' is already there.'); }
    if (empty(ctx.reason)) { return refuse('reason', 'Reason for change is empty.'); }
    const out = renumber(sections, steps, notes, map, ctx, []);
    return Object.assign(out, { map: map }, maps(out.steps));
  }

  /* addSection(sections, steps, notes, name, after, ctx, home) → { sections, steps, notes, added, new_section, map, history } or { refusals };
     after null = at the end; home = { sop_id, rev } names the revision while it has no sections: its first section is 3, as sections 1
     and 2 are Safety and PPE, and Materials, tools and machines (example_new_sop.md part 6) */
  function addSection(sections, steps, notes, name, after, ctx, home) {
    E.checkCtx(ctx, 'addSection');
    if (empty(name)) { return refuse('name', 'Name is empty.'); }
    if (empty(ctx.reason)) { return refuse('reason', 'Reason for change is empty.'); }
    const base = sections.length ? sections[0] : (home && !empty(home.sop_id) && !empty(home.rev) ? home : fail('addSection', 'no sections given: the SOP and revision are not known'));
    const last = sections.length ? Math.max.apply(null, sections.map(s => s.section)) : 2;
    if (!sections.length) { after = null; }
    const row = {};
    for (const f of NAMES) { row[f] = null; }
    Object.assign(row, { sop_id: base.sop_id, rev: base.rev, section: last + 1, name: String(name).trim() });
    let hist = E.historyRows({ table: 'sections', row_id: rowId(row), sop_id: row.sop_id, rev: row.rev, old: { row: null }, new: { row: 'added: ' + row.section + ' ' + row.name }, fields: ['row'], ctx: ctx, after: [] });
    const all = sections.concat([row]);
    if (after === null || after === undefined || after === last) {
      return Object.assign({ sections: all.sort((a, b) => a.section - b.section), steps: steps, notes: notes, added: row, new_section: row.section, map: {}, history: hist }, maps(steps));
    }
    const mv = moveSection(all, steps, notes, row.section, after, ctx);
    if (mv.refusals) { return mv; }
    hist = hist.concat(mv.history.map((h, i) => Object.assign(h, { hist_id: hist[hist.length - 1].hist_id + 1 + i })));
    return Object.assign(mv, { added: mv.sections.find(s => s.section === mv.map[row.section]), new_section: mv.map[row.section], history: hist });
  }

  /* retireSection(sections, steps, notes, n, ctx) → { sections, steps, notes, retired, map, history } or { refusals } */
  function retireSection(sections, steps, notes, n, ctx) {
    E.checkCtx(ctx, 'retireSection');
    const sec = sections.find(s => s.section === n) || fail('retireSection', 'no section ' + n);
    const needer = sections.filter(s => s.section !== n && (list(s.needs_sections).indexOf(n) >= 0 || s.wait_after === n)).sort((a, b) => a.section - b.section)[0];
    if (needer) { return refuse('retire', 'Section ' + needer.section + ' needs section ' + n + '. Remove that arrow first.'); }
    if (empty(ctx.reason)) { return refuse('reason', 'Reason for change is empty.'); }
    const gone = steps.filter(s => s.section === n).sort((a, b) => a.seq - b.seq);
    const source = 'Builder: ' + ctx.who + ' ' + String(ctx.now).slice(0, 10);
    const retired = gone.map(s => ({ key: s.key, sop_id: s.sop_id, range_to: null, retired_in: s.rev, reason: String(ctx.reason).trim(), source: source }));
    let hist = E.historyRows({ table: 'sections', row_id: rowId(sec), sop_id: sec.sop_id, rev: sec.rev, old: { row: null }, new: { row: 'retired: ' + n + ' ' + sec.name }, fields: ['row'], ctx: ctx, after: [] });
    for (const s of gone) { hist = E.historyRows({ table: 'steps', row_id: s.key, sop_id: s.sop_id, rev: s.rev, old: { row: null }, new: { row: 'retired: ' + s.step_no + ' ' + T.firstPart(s.action) + ' (' + s.key + ')' }, fields: ['row'], ctx: ctx, after: hist }); }
    const map = {}; map[n] = null;
    for (const s of sections) { if (s.section > n) { map[s.section] = s.section - 1; } }
    const out = renumber(sections, steps, notes, map, ctx, hist);
    const lo = loosen(notes, out.notes, ctx, out.history);
    return Object.assign(out, { notes: lo.notes, history: lo.history, retired: retired, map: map }, maps(out.steps));
  }

  /* retirePreview(sections, steps, n) → { rows, steps, sub_steps, keys, renumber_from, renumber_to, needed_by }: what a retire would do */
  function retirePreview(sections, steps, n) {
    const mine = steps.filter(s => s.section === n).sort((a, b) => a.seq - b.seq);
    const subs = mine.filter(s => String(s.step_no).split('.').length > 2).length;
    const later = sections.map(s => s.section).filter(x => x > n).sort((a, b) => a - b);
    return { rows: mine.length, steps: mine.length - subs, sub_steps: subs, keys: mine.map(s => s.key), renumber_from: later, renumber_to: later.map(x => x - 1),
      needed_by: sections.filter(s => s.section !== n && (list(s.needs_sections).indexOf(n) >= 0 || s.wait_after === n)).map(s => s.section).sort((a, b) => a - b) };
  }

  /* retireStep(steps, notes, key, ctx) → { steps, notes, retired, history, step_nos, seqs } or { refusals } */
  function retireStep(steps, notes, key, ctx) {
    E.checkCtx(ctx, 'retireStep');
    const st = steps.find(s => s.key === key) || fail('retireStep', 'no step with key ' + key);
    const subs = steps.filter(s => s.section === st.section && String(s.step_no).indexOf(st.step_no + '.') === 0).sort((a, b) => a.seq - b.seq);
    if (subs.length) { return refuse('retire', st.step_no + ' has sub-steps (' + subs.map(s => s.step_no).join(', ') + '). Retire them first.'); }
    if (empty(ctx.reason)) { return refuse('reason', 'Reason for change is empty.'); }
    const retired = [{ key: st.key, sop_id: st.sop_id, range_to: null, retired_in: st.rev, reason: String(ctx.reason).trim(), source: 'Builder: ' + ctx.who + ' ' + String(ctx.now).slice(0, 10) }];
    let hist = E.historyRows({ table: 'steps', row_id: st.key, sop_id: st.sop_id, rev: st.rev, old: { row: null }, new: { row: 'retired: ' + st.step_no + ' ' + T.firstPart(st.action) + ' (' + st.key + ')' }, fields: ['row'], ctx: ctx, after: [] });
    const left = K.renumber(steps.filter(s => s.key !== key).sort((a, b) => a.seq - b.seq)).steps;
    const nt = notes.map(function (n) {
      if (n.chart !== 'steps') { return copy(n); }
      const hit = (n.pin === 'box' && n.pin_ref === key) || (n.pin === 'arrow' && String(n.pin_ref).split('>').indexOf(key) >= 0);
      return hit ? Object.assign(copy(n), { section: null }) : copy(n);
    });
    const lo = loosen(notes, nt, ctx, hist);
    return Object.assign({ steps: left, notes: lo.notes, retired: retired, history: lo.history }, maps(left));
  }

  /* sectionMentionsOf(texts, sectionMap) → texts naming a renumbered or retired section: a step token whose first
     number is in the map ("7.6"), or the words "section 7"; new null = retired. Text cut at 60. */
  function sectionMentionsOf(texts, sectionMap) {
    const out = [];
    const has = n => Object.prototype.hasOwnProperty.call(sectionMap, n);
    for (const t of texts) {
      if (empty(t.text)) { continue; }
      const s = String(t.text), found = [];
      const add = (old, nw) => { if (!found.some(f => f.old === old)) { found.push({ old: old, new: nw }); } };
      for (const tok of FA.stepTokens(s)) {
        const first = Number(tok.split('.')[0]);
        if (has(first)) { const m = sectionMap[first]; add(tok, m === null ? null : [m].concat(tok.split('.').slice(1)).join('.')); }
      }
      const re = /\b[Ss]ection (\d+)\b/g;
      let m;
      while ((m = re.exec(s)) !== null) { const n = Number(m[1]); if (has(n)) { add('section ' + n, sectionMap[n] === null ? null : 'section ' + sectionMap[n]); } }
      if (found.length) { out.push({ table: t.table, row_id: t.row_id, field: t.field, mentions: found, text: s.length > 60 ? s.slice(0, 60) + '…' : s }); }
    }
    return out;
  }

  return { coerceSection, checkSection, editSection, arrowChanges, sectionMoveTarget, moveSection, addSection, retireSection, retirePreview, retireStep, sectionMentionsOf, EDITABLE };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_SECTIONS;
