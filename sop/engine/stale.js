/* SOP Builder logic piece: the texts to check (example_flow.md part 18.1,
   Samrat 2026-11-12). A text is listed when a step number (3.1, 9.5.1) or
   "section N" in it now points to another step or section than when the
   text was last written, or to a retired one. The numbers of that time
   are worked back from History: step number rows, section renumber rows,
   and the rows that add or retire a step or a section. A move and its
   move back list nothing; a text fixed by hand after a move is not
   listed. Build 42: the History read is the revision's line (a copy:
   the rows it was saved from, up to the save; a new revision: the
   revision it came from; a copy made the good version: the copy's line),
   example_renumber.md part 11. Pure. Classic script (global
   ENGINE_STALE); module in Node. Answer key: tests/golden9.js (TC),
   tests/golden23.js (LN, LR, TC16 to TC21). */
const ENGINE_STALE = (function () {
  const FA = (typeof ENGINE_FACTS !== 'undefined') ? ENGINE_FACTS : require('./flow_facts.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  /* the texts per table (build 40 adds the header texts and the Values Needed texts the Builder now writes) */
  const FIELDS = E.TEXT_FIELDS;
  const CUT = 60;
  function fail(msg) { throw new Error('engine.textsToCheck: ' + msg); }
  const lastNumber = rowId => Number(String(rowId).split(' ').pop());

  /* textsToCheck({ texts, steps, sections, history, sop_id, rev }) → [{ table, row_id, ref, field, mentions: [{ old, new, key }], text, full }]
     (build 40: ref = the text's ref, full = the whole text, key = the step the old number named; a number that reads as a value,
     1.5 mm or 3.5 bar, is never a step: FA.stepMentions)
     texts: [{ table, row_id (shown), field, text, ref }]: ref = the step key, the section number or the vn_id;
     steps: the revision's rows now ({ key, step_no }); sections: its rows now ({ section });
     history: History rows (any SOP or revision: only this SOP and revision are read, in hist_id order).
     Values Needed texts count from the start of the revision until the Builder writes them (Texts to check, Renumber: build 40). */
  function textsToCheck(input) {
    if (!input || !Array.isArray(input.texts) || !Array.isArray(input.steps) || !Array.isArray(input.sections) || !Array.isArray(input.history)) {
      fail('input needs texts, steps, sections and history lists');
    }
    /* build 42: the rows of the revision's line, named as the revision (lineageRows) */
    const rows = lineageRows(input.history, input.sop_id, input.rev);
    /* the numbers now; the walk below turns num and sec back in time */
    const cur = {}, num = {};
    for (const s of input.steps) { cur[s.key] = String(s.step_no); num[s.key] = String(s.step_no); }
    const secCur = {}, sec = {};
    for (const s of input.sections) { secCur['c' + s.section] = s.section; sec['c' + s.section] = s.section; }
    const idOfSection = n => Object.keys(sec).filter(id => sec[id] === n);

    const keyOf = (table, id, field) => table + '|' + id + '|' + field;
    const index = {};
    input.texts.forEach(function (t, i) { index[keyOf(t.table, t.table === 'sections' ? 'c' + t.ref : t.ref, t.field)] = i; });
    const result = new Array(input.texts.length).fill(null), done = {};

    function evaluate(i) {
      if (done[i]) { return; }
      done[i] = true;
      const t = input.texts[i];
      if (t.text === null || t.text === undefined || String(t.text).trim() === '') { return; }
      const s = String(t.text), found = [];
      const add = (o, n, k) => { if (!found.some(f => f.old === o)) { found.push(k === undefined ? { old: o, new: n } : { old: o, new: n, key: k }); } };
      for (const mt of FA.stepMentions(s)) {
        if (mt.value_like) { continue; }
        const tok = mt.tok;
        const k = Object.keys(num).find(x => num[x] === tok);
        if (k === undefined) { continue; }
        const now = cur[k] === undefined ? null : cur[k];
        if (now !== tok) { add(tok, now, k); }
      }
      const re = /\b[Ss]ection (\d+)\b/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        const n = Number(m[1]), id = idOfSection(n)[0];
        if (id === undefined) { continue; }
        const now = secCur[id] === undefined ? null : secCur[id];
        if (now !== n) { add('section ' + n, now === null ? null : 'section ' + now); }
      }
      if (found.length) { result[i] = { table: t.table, row_id: t.row_id, ref: t.ref, field: t.field, mentions: found, text: s.length > CUT ? s.slice(0, CUT) + '…' : s, full: s }; }
    }
    /* the texts one History row writes, as keys of index (the numbers are those right after its change) */
    function written(h) {
      const list = FIELDS[h.table];
      if (!list) { return []; }
      const added = h.field === 'row' && /^added/.test(String(h.new_value || ''));
      const fields = added ? list : (list.indexOf(h.field) >= 0 ? [h.field] : []);
      if (!fields.length) { return []; }
      const ids = h.table === 'sections' ? idOfSection(lastNumber(h.row_id)) : [h.row_id];
      const out = [];
      for (const id of ids) { for (const f of fields) { out.push(keyOf(h.table, id, f)); } }
      return out;
    }
    /* one section renumber change, all its rows at once: map new → old for the sections and the first part of every step number */
    function undoSections(batch, moved) {
      const m = {};
      for (const h of batch) { m[Number(h.new_value)] = Number(h.old_value); }
      for (const id of Object.keys(sec)) { if (m[sec[id]] !== undefined) { sec[id] = m[sec[id]]; moved[id] = true; } }
      for (const k of Object.keys(num)) {
        const p = num[k].split('.');
        const f = Number(p[0]);
        if (m[f] !== undefined) { num[k] = [m[f]].concat(p.slice(1)).join('.'); }
      }
    }
    function undoRow(h, moved) {
      const nv = String(h.new_value || '');
      if (h.table === 'steps' && h.field === 'step_no') { num[h.row_id] = String(h.old_value); return; }
      if (h.table === 'steps' && h.field === 'row') {
        if (/^added/.test(nv)) { delete num[h.row_id]; return; }
        if (/^retired: clubbed/.test(nv)) { num[h.row_id] = String(h.old_value).split(' ')[0]; return; }
        if (/^retired: /.test(nv)) { num[h.row_id] = nv.split(' ')[1]; }
        return;
      }
      if (h.table === 'sections' && h.field === 'row') {
        const n = Number(nv.split(' ')[1]);
        if (/^added: /.test(nv)) {
          const ids = idOfSection(n);
          const id = ids.find(x => !moved[x]) || ids[0];
          if (id !== undefined) { delete sec[id]; }
          return;
        }
        if (/^retired: /.test(nv)) { sec['r' + h.hist_id] = n; }
      }
    }

    /* one change = the rows of one save (the same time, editor and reason, one after the other) */
    const groups = [];
    for (const h of rows) {
      const g = groups[groups.length - 1];
      if (g && g.at === h.at && g.who === h.who && g.reason === h.reason) { g.rows.push(h); } else { groups.push({ at: h.at, who: h.who, reason: h.reason, rows: [h] }); }
    }
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi].rows;
      for (const h of g) { for (const k of written(h)) { if (index[k] !== undefined) { evaluate(index[k]); } } }
      const moved = {};
      let j = g.length - 1;
      while (j >= 0) {
        if (g[j].table === 'sections' && g[j].field === 'section') {
          /* a renumber writes its rows by old number, lowest first: a lower or equal old number starts another change */
          let k = j;
          while (k - 1 >= 0 && g[k - 1].table === 'sections' && g[k - 1].field === 'section' && Number(g[k - 1].old_value) < Number(g[k].old_value)) { k--; }
          undoSections(g.slice(k, j + 1), moved);
          j = k - 1;
          continue;
        }
        undoRow(g[j], moved);
        j--;
      }
    }
    input.texts.forEach(function (t, i) { evaluate(i); });
    return result.filter(Boolean);
  }

  /* ---- the line of a revision (build 42, example_renumber.md part 11) ---- */
  const COPY_LEAD = 'added: copy ';
  const text = v => (v === null || v === undefined ? '' : String(v));
  /* copySource(history, goodId, rev, name) → { sop, rev } of the copy "name" that became rev of goodId (its "removed: copy ..., now rev
     of goodId" row names it; its own save row gives its revision label), or null */
  function copySource(history, goodId, rev, name) {
    const gone = history.find(h => h.table === 'sops' && h.field === 'row' && text(h.new_value) === 'removed: copy ' + name + ', now ' + rev + ' of ' + goodId);
    if (!gone) { return null; }
    const lead = COPY_LEAD + name + ' of ';
    const saved = history.find(h => h.table === 'sops' && h.field === 'row' && h.sop_id === gone.sop_id && h.row_id === gone.sop_id && text(h.new_value).indexOf(lead) === 0);
    if (!saved) { return null; }
    const rest = text(saved.new_value).slice(lead.length), sp = rest.indexOf(' ');
    return sp > 0 ? { sop: gone.sop_id, rev: rest.slice(sp + 1) } : null;
  }
  /* madeBy(history, sopId, rev, before) → { hist_id, sop, rev } of the save that made the revision from other rows (Save a copy: "added:
     copy <name> of <SOP> <rev>"; a new revision: "added: <rev> from <rev>"; a copy made the good version: "added: <rev> from copy
     <name>", or build 50, a copy that replaced a draft: "replaced: <rev> by copy <name>"), the last one before hist_id before (null =
     now), or null */
  function madeBy(history, sopId, rev, before) {
    let best = null;
    for (const h of history) {
      if (h.field !== 'row' || h.sop_id !== sopId || (before !== null && h.hist_id >= before)) { continue; }
      const nv = text(h.new_value);
      let src = null;
      if (h.table === 'sops' && h.row_id === sopId && nv.indexOf(COPY_LEAD) === 0) {
        const tail = ' ' + rev;
        const m = nv.length > tail.length && nv.slice(-tail.length) === tail ? / of (\S+)$/.exec(nv.slice(0, -tail.length)) : null;
        if (m) { src = { sop: m[1], rev: rev }; }
      } else if (h.table === 'sop_revisions' && h.rev === rev && h.row_id === sopId + ' ' + rev && nv.indexOf('added: ' + rev + ' from ') === 0) {
        const from = nv.slice(('added: ' + rev + ' from ').length);
        src = from.indexOf('copy ') === 0 ? copySource(history, sopId, rev, from.slice(5)) : { sop: sopId, rev: from };
      } else if (h.table === 'sop_revisions' && h.rev === rev && h.row_id === sopId + ' ' + rev && nv.indexOf('replaced: ' + rev + ' by copy ') === 0) {
        src = copySource(history, sopId, rev, nv.slice(('replaced: ' + rev + ' by copy ').length));
      }
      if (src && (!best || h.hist_id > best.hist_id)) { best = { hist_id: h.hist_id, sop: src.sop, rev: src.rev }; }
    }
    return best;
  }
  /* afterSave(history, id) → the first hist_id after the save row id belongs to (the rows one after the other with its time, editor and reason) */
  function afterSave(history, id) {
    const byId = {};
    for (const h of history) { byId[h.hist_id] = h; }
    const first = byId[id];
    let last = id;
    while (byId[last + 1] && byId[last + 1].at === first.at && byId[last + 1].who === first.who && byId[last + 1].reason === first.reason) { last++; }
    return last + 1;
  }
  /* lineage(history, sopId, rev) → [{ sop_id, rev, from, before }]: the revision, then the rows it was made from up to that save, and so
     on back; from = the first hist_id after the save that made it (null = from the start), before = that save of the one after (null = now) */
  function lineage(history, sopId, rev) {
    if (!Array.isArray(history)) { throw new Error('engine.lineage: history must be a list'); }
    const out = [];
    let cur = { sop_id: sopId, rev: rev, before: null };
    while (cur) {
      const made = madeBy(history, cur.sop_id, cur.rev, cur.before);
      out.push({ sop_id: cur.sop_id, rev: cur.rev, from: made ? afterSave(history, made.hist_id) : null, before: cur.before });
      cur = made ? { sop_id: made.sop, rev: made.rev, before: made.hist_id } : null;
    }
    return out;
  }
  /* relabel(h, seg, sopId, rev) → a History row of an earlier part of the line, named as the revision */
  function relabel(h, seg, sopId, rev) {
    const r = Object.assign({}, h, { sop_id: sopId, rev: h.rev === null ? null : rev });
    const id = text(h.row_id), was = seg.sop_id + ' ' + seg.rev;
    if (h.table === 'sops' && id === seg.sop_id) { r.row_id = sopId; }
    if (h.table === 'sop_revisions' && id === was) { r.row_id = sopId + ' ' + rev; }
    if (h.table === 'sections' && id.indexOf(was + ' ') === 0) { r.row_id = sopId + ' ' + rev + id.slice(was.length); }
    return r;
  }
  /* lineageRows(history, sopId, rev) → the History rows of the line in hist_id order, named as the revision: per part, its rows and its
     SOP row's (rev null) inside its window; the save that made a part is in no window; the Values Needed rows (rev null) are the SOP's
     own, from the start */
  function lineageRows(history, sopId, rev) {
    const segs = lineage(history, sopId, rev);
    const out = [];
    for (const h of history) {
      if (h.sop_id === sopId && h.rev === null && h.table === 'values_needed') { out.push(h); continue; }
      const seg = segs.find(s => h.sop_id === s.sop_id && (h.rev === s.rev || (h.rev === null && h.table === 'sops')) &&
        (s.from === null || h.hist_id >= s.from) && (s.before === null || h.hist_id < s.before));
      if (seg) { out.push(seg.sop_id === sopId && seg.rev === rev ? h : relabel(h, seg, sopId, rev)); }
    }
    return out.sort((a, b) => a.hist_id - b.hist_id);
  }

  return { textsToCheck, lineage, lineageRows };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_STALE;
