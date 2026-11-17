/* SOP Builder logic pieces for clubbing and splitting steps (the skill's
   clubbing rule): clubSteps joins 2 or 3 rows of one section into one
   row with parts i, ii, iii (up to 6 checks, build 37) and retires the
   other keys; splitStep makes
   the parts rows again with new keys. Pure. Classic script (global
   ENGINE_CLUB); module in Node. Answer key: tests/golden2.js (CL, SP). */
const ENGINE_CLUB = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const K = (typeof ENGINE_KEYS !== 'undefined') ? ENGINE_KEYS : require('./keys.js');
  const N = (typeof ENGINE_NUMBER !== 'undefined') ? ENGINE_NUMBER : require('./number.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const NAMES = TYPESX.tables.steps.fields.map(f => f.name);
  const COMPARED = NAMES.filter(n => ['class', 'signed_by'].indexOf(n) < 0);
  const copy = v => JSON.parse(JSON.stringify(v));
  const refuse = (field, message) => ({ refusals: [{ field: field, message: message }] });
  const bySeq = (a, b) => a.seq - b.seq;

  /* unique non-empty texts in order, joined with sep */
  function joinUnique(texts, sep) {
    const out = [];
    for (const t of texts) { if (!empty(t) && out.indexOf(t) < 0) { out.push(t); } }
    return out.length ? out.join(sep) : null;
  }
  /* comma lists merged: items unique (case blind), None dropped; all None → None */
  function mergeList(texts) {
    const out = [], seen = {};
    for (const t of texts) {
      if (empty(t)) { continue; }
      for (const item of String(t).split(', ')) {
        const k = item.trim().toLowerCase();
        if (!k || k === 'none' || seen[k]) { continue; }
        seen[k] = true; out.push(item.trim());
      }
    }
    return out.length ? out.join(', ') : 'None';
  }
  function retiredRow(step, into, ctx) {
    return { key: step.key, sop_id: step.sop_id, range_to: null, retired_in: step.rev, reason: 'Clubbed into ' + into.step_no + ' (' + into.key + ')',
      source: 'Builder: ' + ctx.who + ' ' + String(ctx.now).slice(0, 10) };
  }
  function fieldHistory(oldRow, newRow, ctx, after) {
    return E.historyRows({ table: 'steps', row_id: oldRow.key, sop_id: oldRow.sop_id, rev: oldRow.rev, old: oldRow, new: newRow, fields: COMPARED, ctx: ctx, after: after });
  }
  function rowHistory(key, sopId, rev, oldText, newText, ctx, after) {
    return E.historyRows({ table: 'steps', row_id: key, sop_id: sopId, rev: rev, old: { row: oldText }, new: { row: newText }, fields: ['row'], ctx: ctx, after: after });
  }

  /* a check: every part of its Action starts with Check or Inspect, small or capital letters (spec/example_flow.md part 21.1, build 37) */
  const CHECK_VERB = /^(check|inspect)\b/i;
  const isCheck = row => { const p = T.parts(row.action); return p.length > 0 && p.every(x => CHECK_VERB.test(String(x).trim())); };
  const MAX_CHECKS = 6;

  /* clubSteps(sopSteps, keys, ctx) → { refusals } or { steps, retired, history }; 2 or 3 steps, or up to 6 when every step is a check
     (Samrat 2026-11-13, answer 2b); ctx.screen_settings allows 6 parts */
  function clubSteps(sopSteps, keys, ctx) {
    E.checkCtx(ctx, 'clubSteps');
    if (!Array.isArray(keys) || keys.length < 2) { return refuse('keys', 'Pick 2 or 3 steps'); }
    const ordered = sopSteps.slice().sort(bySeq);
    const rows = keys.map(function (k) {
      const s = ordered.find(x => x.key === k);
      if (!s) { fail('clubSteps', 'no step with key ' + k); }
      return s;
    }).sort(bySeq);
    const checks = rows.every(isCheck);
    if (keys.length > MAX_CHECKS && checks) { return refuse('keys', 'Up to ' + MAX_CHECKS + ' checks can be clubbed (' + keys.length + ' picked).'); }
    if (keys.length > 3 && !checks) { return refuse('keys', 'Pick 2 or 3 steps. Up to ' + MAX_CHECKS + ' when every step is a check (its Action starts with Check or Inspect).'); }
    if (rows.some(r => r.section !== rows[0].section)) { return refuse('keys', 'Steps must be in one section: ' + rows.map(r => r.step_no + ' (' + r.section + ')').join(', ')); }
    const at = rows.map(r => ordered.indexOf(r));
    if (at.some((p, i) => p !== at[0] + i)) { return refuse('keys', 'Steps must follow each other: ' + rows.map(r => r.step_no).join(', ')); }
    const hold = rows.find(r => r.step_type === 'Hold');
    if (hold) { return refuse('keys', 'A Hold step cannot be clubbed: ' + hold.step_no); }
    const readings = rows.filter(r => r.step_type === 'Reading');
    if (readings.length > 1) { return refuse('keys', 'Two Reading steps: a clubbed row takes one reading'); }
    if (rows.some(r => E.asText(r.skip_if) !== E.asText(rows[0].skip_if))) { return refuse('keys', 'Skip if differs: ' + rows.map(r => r.step_no).join(', ')); }
    if (rows.some(r => r.repeat_count !== rows[0].repeat_count)) { return refuse('keys', 'Repeat count differs: ' + rows.map(r => r.step_no + ' (' + r.repeat_count + ')').join(', ')); }
    const limit = ctx.screen_settings || checks ? 6 : 3;
    const nParts = rows.reduce((n, r) => n + T.parts(r.action).length, 0);
    if (nParts > limit) { return refuse('keys', 'More than ' + limit + ' parts (' + nParts + ').' + (limit === 6 ? '' : ' Tick "screen settings" for up to 6.')); }
    if (empty(ctx.reason)) { return refuse('reason', 'Reason for change is empty'); }
    /* parts of why, check and if_fail follow the action's numbering; a missing part is left out */
    const aligned = { action: [], why: [], check: [], if_fail: [] };
    for (const r of rows) {
      const n = T.parts(r.action).length;
      for (const f in aligned) {
        const p = T.parts(r[f]);
        if (p.length > n) { return refuse('keys', E.LABEL[f] + ' of ' + r.step_no + ' has ' + p.length + ' parts, Action has ' + n); }
        for (let i = 0; i < n; i++) { aligned[f].push(i < p.length ? p[i] : null); }
      }
    }
    const first = rows[0];
    const kept = copy(first);
    for (const f in aligned) { kept[f] = T.joinParts(aligned[f]); }
    kept.warning = joinUnique(rows.map(r => r.warning), '\n');
    kept.tool = mergeList(rows.map(r => r.tool));
    kept.material = mergeList(rows.map(r => r.material));
    kept.remark = joinUnique(rows.map(r => r.remark), '\n');
    const reading = readings[0] || null;
    kept.step_type = reading ? 'Reading' : 'Action';
    for (const f of ['min', 'max', 'unit', 'limit_status', 'gauge_id']) { kept[f] = reading ? reading[f] : (f === 'limit_status' ? 'Not applicable' : null); }
    const photos = [].concat.apply([], rows.map(r => r.photo_ref || []));
    kept.photo_ref = photos.length ? photos.filter((p, i) => photos.indexOf(p) === i) : null;
    kept.photo_required = rows.some(r => r.photo_required === true);
    kept.est_min = rows.every(r => !empty(r.est_min)) ? rows.reduce((n, r) => n + r.est_min, 0) : null;
    kept.hold = 'N';
    E.derive(kept);
    let history = fieldHistory(first, kept, ctx, []);
    const retired = [];
    for (const r of rows.slice(1)) {
      retired.push(retiredRow(r, kept, ctx));
      history = rowHistory(r.key, r.sop_id, r.rev, r.step_no + ' ' + T.firstPart(r.action), 'retired: clubbed into ' + kept.step_no + ' (' + kept.key + ')', ctx, history);
    }
    const gone = rows.slice(1).map(r => r.key);
    const steps = ordered.filter(s => gone.indexOf(s.key) < 0).map(s => (s.key === first.key ? kept : s));
    return { steps: K.renumber(steps).steps, retired: retired, history: history };
  }

  /* splitStep(sopSteps, key, readingPart, retiredRows, ctx, kind, otherKeys) → { refusals } or { steps, history, new_keys };
     otherKeys = the keys used elsewhere in the SOP's family (its other revisions, its copies: build 39), never given to a new part */
  function splitStep(sopSteps, key, readingPart, retiredRows, ctx, kind, otherKeys) {
    E.checkCtx(ctx, 'splitStep');
    kind = kind || 'sub';
    if (kind !== 'step' && kind !== 'sub') { fail('splitStep', 'kind must be step or sub, not ' + kind); }
    const ordered = sopSteps.slice().sort(bySeq);
    const row = ordered.find(s => s.key === key);
    if (!row) { fail('splitStep', 'no step with key ' + key); }
    const aParts = T.parts(row.action);
    if (aParts.length < 2) { return refuse('key', 'Only one part: nothing to split'); }
    const partsOf = { why: T.parts(row.why), check: T.parts(row.check), if_fail: T.parts(row.if_fail) };
    for (const f in partsOf) { if (partsOf[f].length > aParts.length) { return refuse('key', E.LABEL[f] + ' has ' + partsOf[f].length + ' parts, Action has ' + aParts.length); } }
    const hasReading = row.step_type === 'Reading';
    if (hasReading && empty(readingPart)) { return refuse('reading_part', 'Say which part keeps the reading (1 to ' + aParts.length + ')'); }
    if (!hasReading && !empty(readingPart)) { return refuse('reading_part', 'This step has no reading'); }
    if (hasReading && (readingPart < 1 || readingPart > aParts.length)) { return refuse('reading_part', 'Part ' + readingPart + ' does not exist (1 to ' + aParts.length + ')'); }
    if (kind === 'step' && String(row.step_no).split('.').length > 2) { return refuse('kind', row.step_no + ' is a sub-step: its parts can only be sub-steps'); }
    if (empty(ctx.reason)) { return refuse('reason', 'Reason for change is empty'); }
    const short = String(row.key).split('-')[0];
    const at = ordered.indexOf(row);
    const nextKey = at + 1 < ordered.length ? ordered[at + 1].key : null;
    const used = ordered.map(s => s.key).concat(otherKeys || []);
    const rows = [], newKeys = [];
    const kinds = {};
    for (let i = 0; i < aParts.length; i++) {
      const r = copy(row);
      r.action = aParts[i];
      for (const f in partsOf) { r[f] = i < partsOf[f].length ? partsOf[f][i] : null; }
      const keepsReading = hasReading && (i + 1) === Number(readingPart);
      r.step_type = keepsReading ? 'Reading' : 'Action';
      if (!keepsReading) { r.min = null; r.max = null; r.unit = null; r.limit_status = 'Not applicable'; r.gauge_id = null; }
      if (i > 0) {
        const nk = K.newKey(short, used, retiredRows, rows[i - 1].key, nextKey);
        used.push(nk.key); newKeys.push(nk);
        r.key = nk.key; r.seq = 0; r.step_no = null; kinds[r.key] = kind;
        r.photo_ref = null; r.photo_required = false; r.est_min = null; r.remark = null; r.action_gu = null;
      }
      r.hold = 'N';
      E.derive(r);
      rows.push(r);
    }
    let steps = ordered.slice(0, at).concat(rows).concat(ordered.slice(at + 1));
    const num = N.numberSection(steps.filter(s => s.section === row.section), kinds);
    if (num.refusals) { return num; }
    steps = steps.map(s => (s.section === row.section && num.numbers[s.key] !== s.step_no) ? Object.assign(copy(s), { step_no: num.numbers[s.key] }) : s);
    let history = fieldHistory(row, rows[0], ctx, []);
    for (const r of rows.slice(1)) { history = rowHistory(r.key, r.sop_id, r.rev, null, 'added: split from ' + row.step_no + ' (' + row.key + ')', ctx, history); }
    for (const m of num.renumbered) { history = E.historyRows({ table: 'steps', row_id: m.key, sop_id: row.sop_id, rev: row.rev, old: { step_no: m.old }, new: { step_no: m.new }, fields: ['step_no'], ctx: ctx, after: history }); }
    return { steps: K.renumber(steps).steps, history: history, new_keys: newKeys, renumbered: num.renumbered };
  }

  return { clubSteps, splitStep, mergeList, joinUnique };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_CLUB;
