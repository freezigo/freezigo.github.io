/* SOP Builder logic pieces for the header and the lists of an SOP typed in
   the Builder (spec/example_new_sop.md parts 9 and 10, job N2, Builder
   build 32): editHeader (the SOP's header and the revision text),
   saveListRow and removeListRow (rows of 1 Safety and PPE, 2 Materials,
   tools and machines, Gauges and Worked examples). Every typed value is
   trimmed; an empty one is empty (null). Pure: the editor, the time and
   the next History id come in through ctx. Classic script (global
   ENGINE_LISTS); module in Node. Answer key: tests/golden13.js. */
const ENGINE_LISTS = (function () {
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const SETSX = (typeof SETS !== 'undefined') ? SETS : require('../schema/sets.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const copy = v => JSON.parse(JSON.stringify(v));
  const ref = (field, message) => ({ field: field, message: message });
  const defsOf = table => TYPESX.tables[table].fields;
  const clean = v => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());

  /* ---- the header ---- */
  const SOP_TYPED = ['title', 'product', 'level', 'who_does_it', 'input_from', 'output_to', 'output_serial_tracked'];
  const REV_TYPED = ['purpose', 'scope', 'process_flow', 'reference_drawings', 'how_to_use', 'setup_rule', 'hold_points', 'est_min_total', 'revision_note'];
  const MAIN_LEVELS = SETSX.level.filter(l => l !== 'Process');
  const LABEL = { title: 'Title', product: 'Product', level: 'Level', who_does_it: 'Who does it', input_from: 'Input from', output_to: 'Output to',
    output_serial_tracked: 'Output serial tracked', purpose: 'Purpose', scope: 'Scope', process_flow: 'Process flow', reference_drawings: 'Reference drawings',
    how_to_use: 'How to use', setup_rule: 'Set-up rule', hold_points: 'Hold points', est_min_total: 'Est min total', revision_note: 'Revision note',
    status: 'Status', item: 'Item', who: 'Who', used_at: 'Used at', tag: 'Tag', material: 'Material', qty: 'Qty', note: 'Note', type: 'Type', name: 'Name',
    step_text: 'Step', what: 'What to measure', how: 'How', decide: 'Decide', example: 'Example', gauge_id: 'Gauge ID', measures: 'Measures', range: 'Range',
    calibration: 'Calibration', cal_due: 'Cal due', term: 'Term', meaning: 'Meaning', bom_name: 'BOM name', store_label: 'Store label', gujarati: 'Gujarati',
    hindi: 'Hindi', used_in: 'Used in' };
  function yesNo(v) {
    if (v === true || v === false) { return v; }
    const s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
    return s === 'Y' || s === 'YES' || s === 'TRUE' ? true : (s === 'N' || s === 'NO' || s === 'FALSE' ? false : undefined);
  }

  /* editHeader(sop, revision, changes, ctx) → { sop, revision, history } or { refusals }. revision null = no revision (SOP fields only).
     History: the SOP's changed fields (table sops), then the revision's (table sop_revisions), each in contract order. */
  function editHeader(sop, revision, changes, ctx) {
    E.checkCtx(ctx, 'editHeader');
    for (const f in changes) {
      if (SOP_TYPED.indexOf(f) < 0 && REV_TYPED.indexOf(f) < 0) { fail('editHeader', '"' + f + '" is not typed in the header'); }
      if (REV_TYPED.indexOf(f) >= 0 && !revision) { fail('editHeader', sop.sop_id + ' has no revision: "' + f + '" belongs to a revision'); }
    }
    const s = copy(sop), r = revision ? copy(revision) : null;
    const refusals = [];
    const proc = sop.sop_type === 'Process';
    for (const f of SOP_TYPED) {
      if (!(f in changes)) { continue; }
      if (f === 'output_serial_tracked') {
        const v = yesNo(changes[f]);
        if (v === undefined) { refusals.push(ref(f, 'Output serial tracked must be Y or N.')); continue; }
        if (proc && v) { refusals.push(ref(f, 'A Process SOP has no serial of its own: Output serial tracked is N.')); continue; }
        s[f] = v;
        continue;
      }
      s[f] = clean(changes[f]);
    }
    if ('title' in changes && empty(s.title)) { refusals.push(ref('title', 'Title is empty.')); }
    if ('product' in changes && empty(s.product)) { refusals.push(ref('product', 'Product is empty.')); }
    if ('level' in changes) {
      if (proc && s.level !== 'Process') { refusals.push(ref('level', 'A Process SOP has the level Process.')); }
      else if (!proc && MAIN_LEVELS.indexOf(s.level) < 0) { refusals.push(ref('level', 'Level must be one of: ' + MAIN_LEVELS.join(', ') + '.')); }
    }
    for (const f of REV_TYPED) {
      if (!(f in changes)) { continue; }
      if (f === 'est_min_total') {
        const t = clean(changes[f]);
        const n = t === null ? null : Number(t);
        if (t !== null && (!/^\d+(\.\d+)?$/.test(t) || !isFinite(n) || n < 0)) { refusals.push(ref(f, 'Est min total must be a number of minutes, 0 or more. Example: 240.')); continue; }
        r[f] = n;
        continue;
      }
      r[f] = clean(changes[f]);
    }
    refusals.sort((a, b) => order(a.field) - order(b.field));
    if (refusals.length) { return { refusals: refusals }; }
    const sopFields = SOP_TYPED.filter(f => E.asText(sop[f]) !== E.asText(s[f]));
    const revFields = r ? REV_TYPED.filter(f => E.asText(revision[f]) !== E.asText(r[f])) : [];
    if (!sopFields.length && !revFields.length) { return { refusals: [ref('form', 'Nothing changed')] }; }
    if (empty(ctx.reason)) { return { refusals: [ref('reason', 'Reason for change is empty')] }; }
    let history = E.historyRows({ table: 'sops', row_id: sop.sop_id, sop_id: sop.sop_id, rev: null, old: sop, new: s, fields: sopFields, ctx: ctx, after: [] });
    if (r) { history = E.historyRows({ table: 'sop_revisions', row_id: sop.sop_id + ' ' + r.rev, sop_id: sop.sop_id, rev: r.rev, old: revision, new: r, fields: revFields, ctx: ctx, after: history }); }
    return { sop: s, revision: r, history: history };
  }
  const ALL_ORDER = SOP_TYPED.concat(REV_TYPED);
  function order(field) { const i = ALL_ORDER.indexOf(field); return i < 0 ? 999 : i; }

  /* ---- the lists ---- */
  /* id: the field that numbers a row; label: the table's name on the floor copy; typed: the inputs of the form, in form order;
     shown: the words of a row in History; perRev: the rows belong to one revision of one SOP (gauges are shared) */
  const LISTS = {
    safety_items: { id: 'no', label: 'P-1', typed: ['status', 'item', 'who', 'used_at', 'tag'], shown: ['item', 'status'], perRev: true },
    materials: { id: 'sr', label: 'M-1', typed: ['status', 'material', 'qty', 'note', 'used_at'], shown: ['material', 'status'], perRev: true },
    tools: { id: 'no', label: 'T-1', typed: ['type', 'name', 'used_at'], shown: ['name', 'type'], perRev: true },
    worked_examples: { id: 'we_id', label: null, typed: ['step_text', 'what', 'how', 'decide', 'example'], shown: ['what'], perRev: true },
    gauges: { id: 'gauge_id', label: null, typed: ['gauge_id', 'name', 'measures', 'range', 'calibration', 'cal_due'], shown: ['name'], perRev: false },
    /* build 33: the Glossary, shared by every SOP (the Builder's Glossary is the master); named by its term, which is unique (small or capital letters) */
    glossary: { id: 'no', label: 'Glossary', typed: ['term', 'meaning', 'bom_name', 'store_label', 'gujarati', 'hindi', 'used_in'], shown: ['term'], perRev: false, rowKey: 'term', unique: 'term' }
  };
  const GAUGE_ID = /^G-[A-Z0-9]+(-[A-Z0-9]+)*$/;
  function specOf(table, place) {
    const spec = LISTS[table];
    if (!spec) { fail(place, 'no list table "' + table + '"'); }
    return spec;
  }
  const mine = (spec, r, sopId, rev) => !spec.perRev || (r.sop_id === sopId && r.rev === rev);
  function findRow(spec, rows, key, sopId, rev, place) {
    const r = rows.find(x => mine(spec, x, sopId, rev) && String(x[spec.id]) === String(key));
    if (!r) { fail(place, 'no row ' + key + ' in ' + (spec.perRev ? sopId + ' ' + rev : 'the shared list')); }
    return r;
  }
  function rowId(spec, r) { return spec.perRev ? r.sop_id + ' ' + r.rev + ' ' + r[spec.id] : String(r[spec.rowKey || spec.id]); }
  /* words(spec, r): "P-1 6 Leather apron (Available)", "WE-19 Fillet length", "G-TAPE Measuring tape (3 m)" */
  function words(spec, r) {
    const main = r[spec.shown[0]], extra = spec.shown[1] ? r[spec.shown[1]] : null;
    return (spec.label ? spec.label + ' ' : '') + r[spec.id] + ' ' + (main === null || main === undefined ? '' : main) + (extra ? ' (' + extra + ')' : '');
  }
  function nextId(spec, rows, sopId, rev) {
    const own = rows.filter(x => mine(spec, x, sopId, rev));
    if (spec.id === 'we_id') {
      const n = own.map(x => /^WE-(\d+)$/.exec(String(x.we_id))).filter(Boolean).map(m => Number(m[1]));
      return 'WE-' + ((n.length ? Math.max.apply(null, n) : 0) + 1);
    }
    const n = own.map(x => Number(x[spec.id])).filter(x => isFinite(x));
    return (n.length ? Math.max.apply(null, n) : 0) + 1;
  }

  /* saveListRow({ table, rows (the whole table), key (null = a new row), changes, sop_id, rev, ctx })
     → { row, rows, history } or { refusals }. A new row takes the next number of its revision (WE-n: the next n); a gauge's ID is typed
     (G- then capitals) and never changes. History row_id: "<SOP ID> <rev> <number>", or the gauge ID with the open SOP and no revision. */
  function saveListRow(input) {
    const spec = specOf(input.table, 'saveListRow');
    const ctx = input.ctx;
    E.checkCtx(ctx, 'saveListRow');
    const changes = input.changes || {};
    for (const f in changes) { if (spec.typed.indexOf(f) < 0) { fail('saveListRow', '"' + f + '" is not typed in ' + input.table); } }
    const isNew = input.key === null || input.key === undefined;
    const old = isNew ? null : findRow(spec, input.rows, input.key, input.sop_id, input.rev, 'saveListRow');
    const defs = defsOf(input.table);
    let next;
    if (old) { next = copy(old); } else {
      next = {};
      for (const d of defs) { next[d.name] = null; }
      if (spec.perRev) { next.sop_id = input.sop_id; next.rev = input.rev; }
      if (spec.typed.indexOf(spec.id) < 0) { next[spec.id] = nextId(spec, input.rows, input.sop_id, input.rev); }
    }
    const refusals = [];
    for (const f of spec.typed) {
      if (!(f in changes)) { continue; }
      let v = clean(changes[f]);
      if (f === 'gauge_id' && v !== null) { v = v.toUpperCase(); }
      if (f === 'gauge_id' && old) { if (v !== old.gauge_id) { refusals.push(ref('gauge_id', 'Gauge ID cannot change')); } continue; }
      next[f] = v;
    }
    for (const f of spec.typed) {
      const d = defs.find(x => x.name === f);
      const v = next[f];
      if (f === 'gauge_id' && old) { continue; }
      if (d.req && empty(v)) { refusals.push(ref(f, LABEL[f] + ' is empty.')); continue; }
      if (d.type === 'set' && !empty(v) && SETSX[d.set].indexOf(v) < 0) { refusals.push(ref(f, LABEL[f] + ' must be one of: ' + SETSX[d.set].join(', ') + '.')); continue; }
      if (spec.unique === f && !empty(v)) {
        const same = input.rows.find(x => x !== old && String(x[f] || '').toLowerCase() === String(v).toLowerCase());
        if (same) { refusals.push(ref(f, LABEL[f] + ' ' + same[f] + ' is already in the Glossary.')); continue; }
      }
      if (f === 'gauge_id' && !empty(v)) {
        if (!GAUGE_ID.test(v)) { refusals.push(ref(f, 'Gauge ID must look like G-TAPE: G- then capitals, digits or dashes.')); }
        else if (input.rows.some(x => x.gauge_id === v)) { refusals.push(ref(f, 'Gauge ID ' + v + ' is already on the list.')); }
      }
    }
    if (refusals.length) { return { refusals: refusals }; }
    const changed = old ? spec.typed.filter(f => E.asText(old[f]) !== E.asText(next[f])) : spec.typed;
    if (!changed.length) { return { refusals: [ref('form', 'Nothing changed')] }; }
    if (empty(ctx.reason)) { return { refusals: [ref('reason', 'Reason for change is empty')] }; }
    const where = { table: input.table, row_id: rowId(spec, old || next), sop_id: input.sop_id, rev: spec.perRev ? input.rev : null, ctx: ctx, after: [] };
    const history = old ? E.historyRows(Object.assign(where, { old: old, new: next, fields: changed }))
      : E.historyRows(Object.assign(where, { old: { row: null }, new: { row: 'added: ' + words(spec, next) }, fields: ['row'] }));
    const rows = old ? input.rows.map(x => (x === old ? next : x)) : input.rows.concat([next]);
    return { row: next, rows: rows, history: history };
  }

  /* removeListRow({ table, rows, key, sop_id, rev, ctx, steps }) → { rows, history } or { refusals }: the row goes; History keeps its words.
     A gauge that a step names stays: steps = the step rows to look in (the open revisions of every SOP). */
  function removeListRow(input) {
    const spec = specOf(input.table, 'removeListRow');
    const ctx = input.ctx;
    E.checkCtx(ctx, 'removeListRow');
    const row = findRow(spec, input.rows, input.key, input.sop_id, input.rev, 'removeListRow');
    if (input.table === 'gauges') {
      const by = {};
      for (const s of (input.steps || []).slice().sort((a, b) => (a.sop_id < b.sop_id ? -1 : a.sop_id > b.sop_id ? 1 : a.seq - b.seq))) {
        if (s.gauge_id === row.gauge_id) { (by[s.sop_id] = by[s.sop_id] || []).push(s.step_no); }
      }
      const ids = Object.keys(by);
      if (ids.length) { return { refusals: [ref('form', row.gauge_id + ' is used by ' + ids.map(id => id + ' ' + by[id].join(', ')).join('; ') + ': change those steps first.')] }; }
    }
    if (empty(ctx.reason)) { return { refusals: [ref('reason', 'Reason for change is empty')] }; }
    const history = E.historyRows({ table: input.table, row_id: rowId(spec, row), sop_id: input.sop_id, rev: spec.perRev ? input.rev : null,
      old: { row: null }, new: { row: 'removed: ' + words(spec, row) }, fields: ['row'], ctx: ctx, after: [] });
    return { rows: input.rows.filter(x => x !== row), history: history };
  }

  return { editHeader, saveListRow, removeListRow, LISTS, SOP_TYPED, REV_TYPED, LABEL };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_LISTS;
