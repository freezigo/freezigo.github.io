/* SOP Builder logic pieces for the changes of a main SOP offered to its copies (spec/example_copy_sync.md, build 45):
   offeredRow, savedAt, mainChanges, decisionsOf, pendingChanges, decisionText, decisionOf, summaryOf, fieldState, shortDiff,
   coerceValue, rowAsAfter, predecessorKey, opsOf, moveOfMap; build 46 copyWhere, copyAtText, numberOfRow; build 47 placeOptions,
   defaultPlace, placeWords. A main change is one save of the main SOP (its History rows with the
   same time, editor and reason); a copy decides each one once, Apply or Skip, and its History keeps the decision on the copy's SOP
   row ("applied: main change 89 (...)"). Everything is read from History and the rows handed in. Pure. Classic script (global
   ENGINE_SYNC); module in Node. Answer keys: tests/golden25.js, golden26.js, golden27.js. */
const ENGINE_SYNC = (function () {
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  const NU = (typeof ENGINE_NUMBER !== 'undefined') ? ENGINE_NUMBER : require('./number.js');
  const text = v => (v === null || v === undefined ? null : String(v));
  const empty = v => v === null || v === undefined || String(v).trim() === '';
  const copy = v => JSON.parse(JSON.stringify(v));

  /* ---- which History rows a copy is asked about (example part 4) ---- */
  const STEP_DERIVED = ['seq', 'class', 'signed_by', 'hold', 'key', 'sop_id', 'rev'];
  const HEADER_SOP = ['title', 'product', 'level', 'who_does_it', 'input_from', 'output_to', 'output_serial_tracked'];
  const HEADER_REV = ['purpose', 'scope', 'process_flow', 'reference_drawings', 'how_to_use', 'setup_rule', 'hold_points', 'est_min_total'];
  const LIST_TABLES = ['safety_items', 'materials', 'tools', 'worked_examples'];
  const MOVE = /^\S+ (after \S+|first of section \d+)$/;
  const isAdded = v => /^added: /.test(String(v || ''));
  const isRetired = v => /^retired: /.test(String(v || ''));
  const isRemoved = v => /^removed: /.test(String(v || ''));
  const isMove = v => MOVE.test(String(v || ''));
  const PROMOTE_ROW = /^(replaced: Rev \d+ by copy |added: Rev \d+ from copy )/;

  /* offeredRow(row) → true when a copy is asked about this History row */
  function offeredRow(row) {
    if (!row || text(row.old_value) === text(row.new_value)) { return false; }
    const f = row.field;
    switch (row.table) {
      case 'steps': return f === 'row' ? (isAdded(row.new_value) || isRetired(row.new_value) || isMove(row.new_value)) : STEP_DERIVED.indexOf(f) < 0;
      case 'sections': return f === 'row' ? (isAdded(row.new_value) || isRetired(row.new_value)) : ['sop_id', 'rev'].indexOf(f) < 0;
      case 'sop_revisions': return HEADER_REV.indexOf(f) >= 0;
      case 'sops': return HEADER_SOP.indexOf(f) >= 0;
      case 'pictures': return f === 'row' ? isAdded(row.new_value) : ['sop_id', 'rev', 'picture_id'].indexOf(f) < 0;
      default:
        if (LIST_TABLES.indexOf(row.table) >= 0) { return f === 'row' ? (isAdded(row.new_value) || isRemoved(row.new_value)) : ['sop_id', 'rev'].indexOf(f) < 0; }
        return false;
    }
  }

  /* savedAt(history, copyId) → the History number of the copy's "added: copy ..." row (Save a copy, build 39), or null */
  function savedAt(history, copyId) {
    const h = (history || []).find(x => x.sop_id === copyId && x.table === 'sops' && x.row_id === copyId && x.field === 'row' && /^added: copy /.test(String(x.new_value || '')));
    return h ? h.hist_id : null;
  }

  /* mainChanges(history, mainId, afterId) → [{ change_id, last, at, who, rev, reason, rows }]: the saves of the main SOP after History
     afterId, oldest first; a save = its rows one after another with the same time, editor and reason; rows = the offered ones; a save
     with none is left out */
  function mainChanges(history, mainId, afterId) {
    const mine = (history || []).filter(h => h.sop_id === mainId && h.hist_id > afterId).sort((a, b) => a.hist_id - b.hist_id);
    const groups = [];
    for (const h of mine) {
      const g = groups[groups.length - 1];
      if (g && g.at === h.at && g.who === h.who && g.reason === h.reason) { g.all.push(h); } else { groups.push({ at: h.at, who: h.who, reason: h.reason, all: [h] }); }
    }
    const out = [];
    for (const g of groups) {
      /* build 50 (example_rights.md part 3.3): a copy made the good version is not offered to the other copies */
      if (g.all.some(h => h.table === 'sop_revisions' && h.field === 'row' && PROMOTE_ROW.test(String(h.new_value || '')))) { continue; }
      const rows = g.all.filter(offeredRow);
      if (!rows.length) { continue; }
      const withRev = g.all.find(h => !empty(h.rev));
      out.push({ change_id: g.all[0].hist_id, last: g.all[g.all.length - 1].hist_id, at: g.at, who: g.who, rev: withRev ? withRev.rev : null, reason: g.reason, rows: rows });
    }
    return out;
  }

  /* decisionText(state, changeId, summary) → "applied: main change 89 (Step 3.2 · Check)"; decisionOf(text) → { state, change_id } or null */
  function decisionText(state, changeId, summary) {
    return state + ': main change ' + changeId + (empty(summary) ? '' : ' (' + summary + ')');
  }
  function decisionOf(value) {
    const m = /^(applied|skipped): main change (\d+)\b/.exec(String(value === null || value === undefined ? '' : value));
    return m ? { state: m[1], change_id: Number(m[2]) } : null;
  }
  /* summaryOf(labels) → the first three labels with "; " between, "and n more" after */
  function summaryOf(labels) {
    const l = (labels || []).filter(x => !empty(x));
    return l.slice(0, 3).join('; ') + (l.length > 3 ? ' and ' + (l.length - 3) + ' more' : '');
  }

  /* decisionsOf(history, copyId) → { change_id: { state, hist_id, at, who } }: the copy's Apply and Skip rows */
  function decisionsOf(history, copyId) {
    const out = {};
    for (const h of history || []) {
      if (h.sop_id !== copyId || h.table !== 'sops' || h.row_id !== copyId || h.field !== 'row') { continue; }
      const d = decisionOf(h.new_value);
      if (d) { out[d.change_id] = { state: d.state, hist_id: h.hist_id, at: h.at, who: h.who }; }
    }
    return out;
  }

  /* pendingChanges(history, mainId, copyId) → the main changes saved after the copy and not yet applied or skipped by it */
  function pendingChanges(history, mainId, copyId) {
    const from = savedAt(history, copyId);
    if (from === null) { return []; }
    const done = decisionsOf(history, copyId);
    return mainChanges(history, mainId, from).filter(c => !done[c.change_id]);
  }

  /* fieldState(copyText, mainOld, mainNew) → 'same' (the copy has the new words), 'change' (it has the old words), 'pick' (its own) */
  function fieldState(copyText, mainOld, mainNew) {
    const c = text(copyText);
    if (c === text(mainNew)) { return 'same'; }
    if (c === text(mainOld)) { return 'change'; }
    return 'pick';
  }

  /* shortDiff(a, b, around) → { lead, old, new, tail }: the words that differ, with up to "around" equal words before and after
     ("…" where words are left out); line breaks read as spaces */
  function shortDiff(a, b, around) {
    const wa = String(a === null || a === undefined ? '' : a).split(/\s+/).filter(w => w);
    const wb = String(b === null || b === undefined ? '' : b).split(/\s+/).filter(w => w);
    let p = 0;
    while (p < wa.length && p < wb.length && wa[p] === wb[p]) { p++; }
    if (p === wa.length && p === wb.length) { return { lead: '', old: '', new: '', tail: '' }; }
    let s = 0;
    while (s < wa.length - p && s < wb.length - p && wa[wa.length - 1 - s] === wb[wb.length - 1 - s]) { s++; }
    const n = around === undefined ? 6 : around;
    const pre = wa.slice(0, p), suf = wa.slice(wa.length - s);
    const lead = (pre.length > n ? ['…'] : []).concat(pre.slice(Math.max(0, pre.length - n))).join(' ');
    const tail = suf.slice(0, n).concat(suf.length > n ? ['…'] : []).join(' ');
    return { lead: lead, old: wa.slice(p, wa.length - s).join(' '), new: wb.slice(p, wb.length - s).join(' '), tail: tail };
  }

  /* coerceValue(table, field, text) → the History text (null, numbers as text, lists with | between, Y or N) in the contract type */
  function coerceValue(table, field, value) {
    if (value === null || value === undefined) { return null; }
    const def = ((TYPESX.tables[table] || {}).fields || []).find(f => f.name === field);
    const s = String(value);
    if (!def) { return s; }
    switch (def.type) {
      case 'int': case 'number': return /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : s;
      case 'bool': return s === 'Y' ? true : (s === 'N' ? false : s);
      case 'list_text': { const l = s.split('|').map(x => x.trim()).filter(x => x); return l.length ? l : null; }
      case 'list_int': { const l = s.split('|').map(x => x.trim()).filter(x => x); return l.length ? (l.every(x => /^\d+$/.test(x)) ? l.map(Number) : l) : null; }
      default: return s;
    }
  }

  /* rowAsAfter(table, row, laterRows) → the row as it was right after a change: the field changes of later rows undone, newest first */
  function rowAsAfter(table, row, laterRows) {
    const out = copy(row);
    const later = (laterRows || []).filter(h => h.field !== 'row' && h.field in out).sort((a, b) => b.hist_id - a.hist_id);
    for (const h of later) { out[h.field] = coerceValue(table, h.field, h.old_value); }
    return out;
  }

  /* predecessorKey(mainKeys, key, copyKeys) → the nearest key before key in the main's order that the copy has, or null */
  function predecessorKey(mainKeys, key, copyKeys) {
    const i = (mainKeys || []).indexOf(key);
    for (let j = i - 1; j >= 0; j--) { if ((copyKeys || []).indexOf(mainKeys[j]) >= 0) { return mainKeys[j]; } }
    return null;
  }

  /* opsOf(rows) → { fields, added, retired, moved, section, lists, pictures }: what one save did, from its offered rows. A section
     added, moved or retired carries its steps and numbers with it (section: { kind, ... }); new and moved steps carry the step
     numbers they changed; the rest are field changes to apply as they are. */
  function opsOf(rows) {
    const out = { fields: [], added: [], retired: [], moved: [], section: null, lists: [], pictures: [] };
    const secRow = rows.find(h => h.table === 'sections' && h.field === 'row');
    const secNos = rows.filter(h => h.table === 'sections' && h.field === 'section');
    const num = v => Number(v);
    if (secRow && isAdded(secRow.new_value)) {
      const m = /^added: (\d+) (.*)$/.exec(String(secRow.new_value));
      const own = secNos.find(h => num(h.old_value) === num(m[1]));
      const n = own ? num(own.new_value) : num(m[1]);
      out.section = { kind: 'add', number: n, name: m[2], after: own ? (n - 1 >= 3 ? n - 1 : 0) : null };
      return out;
    }
    if (secRow && isRetired(secRow.new_value)) {
      const m = /^retired: (\d+) (.*)$/.exec(String(secRow.new_value));
      out.section = { kind: 'retire', number: num(m[1]), name: m[2] };
      return out;
    }
    if (secNos.length) {
      const map = {};
      for (const h of secNos) { map[num(h.old_value)] = num(h.new_value); }
      out.section = { kind: 'move', map: map };
      return out;
    }
    const stepRows = rows.filter(h => h.table === 'steps' && h.field === 'row');
    for (const h of stepRows) {
      if (isAdded(h.new_value)) { out.added.push(h.row_id); } else if (isRetired(h.new_value)) { out.retired.push(h.row_id); } else if (isMove(h.new_value)) { out.moved.push(h.row_id); }
    }
    const renumbers = out.added.length || out.moved.length;
    for (const h of rows) {
      if (h.field === 'row') {
        if (LIST_TABLES.indexOf(h.table) >= 0) { out.lists.push(h); }
        if (h.table === 'pictures') { out.pictures.push(h); }
        continue;
      }
      if (h.table === 'steps' && h.field === 'step_no' && renumbers) { continue; }
      out.fields.push(h);
    }
    return out;
  }

  /* moveOfMap(map) → { section, after }: the section moved and the section it goes after (0 = first), for moveSection; map = { old: new } */
  function moveOfMap(map) {
    const olds = Object.keys(map).map(Number).sort((a, b) => a - b);
    let n = olds[0], far = -1;
    for (const o of olds) { const d = Math.abs(map[o] - o); if (d > far) { far = d; n = o; } }
    const before = map[n] - 1;
    let after = before;
    for (const o of olds) { if (map[o] === before) { after = o; } }
    return { section: n, after: before < 3 ? 0 : after };
  }

  /* ---- build 46: where a step is in the copy, and where a new or moved step can go (example parts 5.4 and 5.5) ---- */
  function keyNo(key) { const m = /^([A-Z0-9]+)-(\d{4})$/.exec(String(key || '')); return m ? { short: m[1], n: Number(m[2]) } : null; }
  /* copyWhere(copySteps, copyRetired, key) → { state: 'here', step_no, section } | { state: 'deleted', retired_in, reason } | { state: 'never' } */
  function copyWhere(copySteps, copyRetired, key) {
    const s = (copySteps || []).find(x => x.key === key);
    if (s) { return { state: 'here', step_no: s.step_no, section: s.section }; }
    const k = keyNo(key);
    const r = (copyRetired || []).find(function (x) {
      if (x.key === key) { return true; }
      const a = keyNo(x.key), b = empty(x.range_to) ? null : keyNo(x.range_to);
      return !!(k && a && b && a.short === k.short && k.n >= a.n && k.n <= b.n);
    });
    if (r) { return { state: 'deleted', retired_in: r.retired_in, reason: empty(r.reason) ? null : r.reason }; }
    return { state: 'never' };
  }
  /* copyAtText(where) → the words after "In the copy:" */
  function copyAtText(w) {
    if (w.state === 'here') { return 'step ' + w.step_no; }
    if (w.state === 'deleted') { return 'deleted in the copy' + (empty(w.reason) ? '' : ' (' + w.reason + ')'); }
    return 'not in the copy (it never had this step)';
  }
  /* numberOfRow(text) → the step number a History text starts with ("3.4 Check ...", "retired: 6.1 ...", "added: 3.2.1 ...", "3.1 after 3.2"), or null */
  function numberOfRow(value) {
    const m = /^(?:added: |retired: )?(\d+(?:\.\d+)+)(?:\s|$)/.exec(String(value === null || value === undefined ? '' : value));
    return m ? m[1] : null;
  }
  /* ---- build 47: where a new or moved step can go, each place with the number the step takes there (example part 5.5; Samrat 14 Nov:
     "after 3.1 comes 3.2 and inside 3.1 gives 3.1.1 and after 3.1.1 goes 3.1.2"). A place is "kind|after key": step| = first in the
     section (a step, x.1: build 48); step|K = after step K and its sub-steps (a step); sub|K = inside step K (its first sub-step), or after
     sub-step K. The numbers come from the Builder's own rules: numberSection for a new step, reorder for a move. ---- */
  const isSubNo = no => String(no).split('.').length > 2;
  const firstWords = a => {
    const s = String(a === null || a === undefined ? '' : a).split('\n')[0].trim();
    if (s.length <= 45) { return s; }
    let t = s.slice(0, 45);
    const sp = t.lastIndexOf(' ');
    if (sp > 20) { t = t.slice(0, sp); }
    return t.replace(/[\s,.:;]+$/, '') + '…';
  };
  /* placeWords(target, kind, hasSubs) → the words of a place: 'first', 'inside 3.2 <first line>', 'after 3.1 and its sub-steps' or
     'after 3.1 <first line>' (the first line of the action, cut at the last space before 45 letters) */
  function placeWords(target, kind, hasSubs) {
    if (!target) { return 'first'; }
    if (kind === 'sub' && !isSubNo(target.step_no)) { return 'inside ' + target.step_no + ' ' + firstWords(target.action); }
    if (kind === 'step' && hasSubs) { return 'after ' + target.step_no + ' and its sub-steps'; }
    return 'after ' + target.step_no + ' ' + firstWords(target.action);
  }
  const sectionRows = (copySteps, section) => (copySteps || []).filter(s => s.section === section).sort((a, b) => a.seq - b.seq);
  const placeLabel = (words, number, stays) => words.charAt(0).toUpperCase() + words.slice(1) + (stays ? ' · stays ' : ' · as ') + number;
  /* placeOptions(copySteps, section, movingKey) → [{ id, after_key, kind, number, label }]: the places in one section of the copy, in
     order. movingKey null: a new step (first; inside and after each step; after each sub-step). Else the copy's step being moved,
     which keeps its kind as Move does: a step goes first or after a step (with its sub-steps); a sub-step inside a step or after a
     sub-step; the place it has now says "stays" (and has stays: true). */
  function placeOptions(copySteps, section, movingKey) {
    const rows = sectionRows(copySteps, section), out = [];
    const blockEnds = i => i === rows.length - 1 || !isSubNo(rows[i + 1].step_no);
    const parentAt = i => { let p = i; while (p > 0 && isSubNo(rows[p].step_no)) { p--; } return rows[p]; };
    if (movingKey === null || movingKey === undefined) {
      const NEW = '\u0000new';
      const numberAt = (pos, kind) => {
        const n = NU.numberSection(rows.slice(0, pos).concat([{ key: NEW, section: section }]).concat(rows.slice(pos)), { [NEW]: kind });
        return n.refusals ? null : n.numbers[NEW];
      };
      const add = (kind, after, words, pos) => { const n = numberAt(pos, kind); if (n) { out.push({ id: kind + '|' + (after || ''), after_key: after, kind: kind, number: n, label: placeLabel(words, n, false) }); } };
      add('step', null, 'first in section ' + section, 0);
      rows.forEach((r, i) => {
        if (!isSubNo(r.step_no)) {
          add('sub', r.key, placeWords(r, 'sub', false), i + 1);
          if (blockEnds(i)) { add('step', r.key, placeWords(r, 'step', false), i + 1); }
          return;
        }
        add('sub', r.key, placeWords(r, 'sub', false), i + 1);
        if (blockEnds(i)) { add('step', parentAt(i).key, placeWords(parentAt(i), 'step', true), i + 1); }
      });
      return out;
    }
    const me = rows.find(r => r.key === movingKey);
    if (!me) { return out; }
    const kind = isSubNo(me.step_no) ? 'sub' : 'step';
    const add = (after, words) => {
      const r = NU.reorder(rows, movingKey, after);
      const here = !!r.refusals && /is already there\.$/.test(r.refusals[0].message);
      if (r.refusals && !here) { return; }
      const n = here ? me.step_no : r.numbers[movingKey];
      out.push(Object.assign({ id: kind + '|' + (after || ''), after_key: after, kind: kind, number: n, label: placeLabel(words, n, here) }, here ? { stays: true } : {}));
    };
    if (kind === 'step') {
      add(null, 'first in section ' + section);
      rows.forEach((r, i) => { if (!isSubNo(r.step_no) && r.key !== movingKey) { add(r.key, placeWords(r, 'step', !blockEnds(i))); } });
      return out;
    }
    rows.forEach(r => { if (r.key !== movingKey) { add(r.key, placeWords(r, 'sub', false)); } });
    return out;
  }
  /* defaultPlace(copySteps, section, prevKey, kind, movingKey) → the place marked first: after prevKey (the step before it in the main
     that the copy has) at the level the main gives it; nothing before it: first (a step), or for a moved sub-step the place it has now */
  function defaultPlace(copySteps, section, prevKey, kind, movingKey) {
    const rows = sectionRows(copySteps, section);
    const at = prevKey ? rows.findIndex(r => r.key === prevKey) : -1;
    if (kind === 'step') {
      if (at < 0) { return 'step|'; }
      let p = at;
      while (p > 0 && isSubNo(rows[p].step_no)) { p--; }
      return 'step|' + rows[p].key;
    }
    if (at >= 0) { return 'sub|' + rows[at].key; }
    const i = movingKey ? rows.findIndex(r => r.key === movingKey) : -1;
    return i > 0 ? 'sub|' + rows[i - 1].key : 'step|';
  }

  return { offeredRow, savedAt, mainChanges, decisionText, decisionOf, summaryOf, decisionsOf, pendingChanges, fieldState, shortDiff, coerceValue,
    rowAsAfter, predecessorKey, opsOf, moveOfMap, copyWhere, copyAtText, numberOfRow, placeOptions, defaultPlace, placeWords, HEADER_SOP, HEADER_REV, LIST_TABLES };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_SYNC;
