/* SOP Builder logic pieces for editing one step: checkStep (the save
   refusals) and editStep (the saved step and its History rows). Pure: the
   editor name, the time and the next History id come in through ctx.
   Classic script (global ENGINE_EDIT); module in Node.
   Answer key: tests/golden2.js (E and H cases). */
const ENGINE_EDIT = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  const SETSX = (typeof SETS !== 'undefined') ? SETS : require('../schema/sets.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const FIELDS = TYPESX.tables.steps.fields;
  const NAMES = FIELDS.map(f => f.name);
  const LABEL = { key: 'Key', sop_id: 'SOP ID', rev: 'Rev', step_no: 'Step no', seq: 'Seq', section: 'Section', step_type: 'Step type', action: 'Action',
    action_gu: 'Gujarati line', why: 'Why', warning: 'Warning', tool: 'Tool', gauge_id: 'Gauge ID', material: 'Material', min: 'Min', max: 'Max', unit: 'Unit',
    limit_status: 'Limit status', check: 'Check', if_fail: 'If fail', skip_if: 'Skip if', hold: 'Hold', signed_by: 'Signed by', class: 'Class',
    repeat_count: 'Repeat count', photo_ref: 'Photo ref', photo_required: 'Photo required', est_min: 'Est min', remark: 'Remark',
    link_sop: 'Process SOP', link_rev: 'Process SOP revision', link_key: 'Process SOP step', link_mode: 'Use as' };
  /* the link fields change only by an insert or "Make it a Revised copy" (engine/process.js), never in the step form */
  const FIXED = ['key', 'sop_id', 'rev', 'seq', 'section', 'class', 'signed_by', 'link_sop', 'link_rev', 'link_key', 'link_mode'];
  const DERIVED = ['class', 'signed_by'];
  const MAX_WORDS = 7;

  function isNumber(v) { return typeof v === 'number' && !isNaN(v); }
  function isInt(v) { return isNumber(v) && Math.floor(v) === v; }
  function setText(name) { return SETSX[name].join(', '); }
  function words(text) { return String(text).trim().split(/\s+/).filter(w => w).length; }

  /* checkStep(step) → [{ field, message }] in contract field order; [] when the step may be saved */
  function checkStep(step) {
    const out = [];
    const r = (field, message) => out.push({ field: field, message: message });
    for (const f of FIELDS) {
      const v = step[f.name];
      switch (f.name) {
        case 'key': if (!/^[A-Z0-9]+-[0-9]{4}$/.test(String(v || ''))) { r('key', 'Key must look like TANK01-2420'); } break;
        case 'step_no':
          if (empty(v)) { r('step_no', 'Step no is empty'); }
          else if (!/^\d+(\.\d+)+$/.test(String(v))) { r('step_no', 'Step no must be numbers with dots. Example: 9.5.1'); }
          break;
        case 'seq': if (!isInt(v)) { r('seq', 'Seq must be a whole number'); } break;
        case 'section': if (!isInt(v)) { r('section', 'Section must be a whole number'); } break;
        case 'step_type': if (SETSX.step_type.indexOf(v) < 0) { r('step_type', 'Step type must be one of: ' + setText('step_type')); } break;
        case 'action':
          if (empty(v)) { r('action', 'Action is empty'); }
          else {
            const p = T.parts(v);
            p.forEach(function (part, i) {
              const n = words(part);
              if (n > MAX_WORDS) { r('action', (p.length > 1 ? 'Action part ' + T.partLabel(i + 1) : 'Action') + ' has ' + n + ' words. ' + MAX_WORDS + ' or fewer.'); }
            });
          }
          break;
        case 'min': case 'max': case 'est_min': if (!empty(v) && !isNumber(v)) { r(f.name, LABEL[f.name] + ' must be a number'); } break;
        case 'unit':
          if (step.step_type === 'Reading' && empty(v)) { r('unit', 'A Reading step needs a Unit'); }
          if (step.step_type === 'Action' && (!empty(v) || !empty(step.min) || !empty(step.max))) { r('unit', 'An Action step has no Unit, Min or Max'); }
          break;
        case 'limit_status':
          if (SETSX.limit_status.indexOf(v) < 0) { r('limit_status', 'Limit status must be one of: ' + setText('limit_status')); }
          else if (v === 'Given' && empty(step.min) && empty(step.max)) { r('limit_status', 'Limit status Given needs Min or Max'); }
          else if ((v === 'Needed' || v === 'Record only') && (!empty(step.min) || !empty(step.max))) { r('limit_status', 'Limit status ' + v + ' means Min and Max are empty'); }
          else if (v === 'Not applicable' && step.step_type !== 'Action' && (!empty(step.min) || !empty(step.max) || !empty(step.unit))) { r('limit_status', 'Limit status Not applicable means Min, Max and Unit are empty'); }
          if (isNumber(step.min) && isNumber(step.max) && step.min > step.max) { r('min', 'Min ' + step.min + ' is more than Max ' + step.max); }
          break;
        case 'if_fail': if (!empty(step.check) && empty(v)) { r('if_fail', 'Check is filled, so If fail is needed'); } break;
        case 'hold':
          if (!/^(N|H[0-9]+)$/.test(String(v || ''))) { r('hold', 'Hold must be N or a hold number such as H1'); }
          else if (v !== 'N' && step.step_type !== 'Hold') { r('hold', 'Hold ' + v + ' on a step that is not a Hold'); }
          break;
        case 'signed_by': if (SETSX.signed_by.indexOf(v) < 0) { r('signed_by', 'Signed by must be one of: ' + setText('signed_by')); } break;
        case 'class': if (SETSX.class.indexOf(v) < 0) { r('class', 'Class must be one of: ' + setText('class')); } break;
        case 'repeat_count':
          if (!isInt(v)) { r('repeat_count', 'Repeat count must be a whole number'); }
          else if (v < 1) { r('repeat_count', 'Repeat count must be 1 or more'); }
          break;
        case 'photo_ref': if (!empty(v) && !Array.isArray(v)) { r('photo_ref', 'Photo ref must be a list of file names'); } break;
        case 'photo_required': if (v !== true && v !== false) { r('photo_required', 'Photo required must be true or false'); } break;
        default: if (!empty(v) && typeof v !== 'string') { r(f.name, LABEL[f.name] + ' must be text'); }
      }
    }
    return out;
  }

  /* text form of a value for History: null, numbers as text, lists with | between, true/false as Y/N */
  function asText(v) {
    if (v === null || v === undefined) { return null; }
    if (Array.isArray(v)) { return v.join(' | '); }
    if (v === true) { return 'Y'; }
    if (v === false) { return 'N'; }
    return String(v);
  }
  function same(a, b) { return asText(a) === asText(b); }
  /* coerce(field, value): what the form typed into the contract type; a wrong value stays as typed so checkStep names it */
  function coerce(field, v) {
    const f = FIELDS.find(x => x.name === field);
    if (v === undefined) { return null; }
    if (typeof v === 'string' && v.trim() === '') { return null; }
    switch (f.type) {
      case 'number': case 'int': return (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) ? Number(v.trim()) : v;
      case 'bool': return v === 'Y' || v === 'true' ? true : (v === 'N' || v === 'false' ? false : v);
      case 'list_text': return typeof v === 'string' ? v.split('|').map(x => x.trim()).filter(x => x) : v;
      default: return typeof v === 'string' ? v.trim() : v;  /* build 33: a typed text loses the spaces around it */
    }
  }
  function derive(step) {
    step.class = step.step_type === 'Hold' ? 'Critical' : (step.step_type === 'Reading' ? 'Major' : 'Minor');
    step.signed_by = step.step_type === 'Hold' ? 'Operator + Supervisor' : 'Operator';
    return step;
  }
  function checkCtx(ctx, place) {
    if (!ctx || empty(ctx.who)) { fail(place, 'ctx.who (the editor name) is missing'); }
    if (empty(ctx.now)) { fail(place, 'ctx.now (the time) is missing'); }
    if (!isInt(ctx.next_hist_id)) { fail(place, 'ctx.next_hist_id is missing'); }
  }

  /* editStep(step, changes, ctx, sopSteps) → { refusals } or { step, history } */
  function editStep(step, changes, ctx, sopSteps) {
    checkCtx(ctx, 'editStep');
    for (const f in changes) { if (NAMES.indexOf(f) < 0) { fail('editStep', '"' + f + '" is not a field of steps'); } }
    const fixed = FIXED.filter(f => f in changes && !same(changes[f], step[f])).map(f => ({ field: f, message: LABEL[f] + ' cannot change' }));
    if (fixed.length) { return { refusals: fixed }; }
    const next = JSON.parse(JSON.stringify(step));
    for (const f in changes) { if (DERIVED.indexOf(f) < 0) { next[f] = coerce(f, changes[f]); } }
    derive(next);
    const refusals = checkStep(next);
    if ('step_no' in changes && !same(next.step_no, step.step_no) && !refusals.some(x => x.field === 'step_no')) {
      const other = (sopSteps || []).find(s => s.key !== step.key && s.sop_id === step.sop_id && s.rev === step.rev && s.step_no === next.step_no);
      if (other) { refusals.push({ field: 'step_no', message: 'Step no ' + next.step_no + ' is already used by ' + other.key }); }
      else if (T.stepNoParts(next.step_no)[0] !== step.section) { refusals.push({ field: 'step_no', message: 'Step no ' + next.step_no + ' is not in section ' + step.section }); }
    }
    if (refusals.length) { return { refusals: refusals }; }
    const changed = NAMES.filter(f => f in changes && DERIVED.indexOf(f) < 0 && !same(step[f], next[f]));
    if (!changed.length) { return { refusals: [{ field: 'form', message: 'Nothing changed' }] }; }
    if (empty(ctx.reason)) { return { refusals: [{ field: 'reason', message: 'Reason for change is empty' }] }; }
    let id = ctx.next_hist_id;
    const history = changed.map(f => ({ hist_id: id++, at: ctx.now, who: ctx.who, sop_id: step.sop_id, rev: step.rev, table: 'steps', row_id: step.key,
      field: f, old_value: asText(step[f]), new_value: asText(next[f]), reason: ctx.reason }));
    return { step: next, history: history };
  }

  /* checkGujarati(step, ctx, sopSteps) → { step, history } or { refusals }: "(draft)" taken off the Gujarati line ("Gujarati checked",
     example_new_sop.md part 11, build 33) */
  function checkGujarati(step, ctx, sopSteps) {
    checkCtx(ctx, 'checkGujarati');
    if (empty(step.action_gu)) { return { refusals: [{ field: 'action_gu', message: 'Step ' + step.step_no + ' has no Gujarati line.' }] }; }
    if (!T.guDraft(step.action_gu)) { return { refusals: [{ field: 'action_gu', message: 'The Gujarati line of ' + step.step_no + ' is not a draft.' }] }; }
    return editStep(step, { action_gu: T.guChecked(step.action_gu) }, ctx, sopSteps);
  }

  /* historyRows({ table, row_id, sop_id, rev, old, new, fields, ctx, after }) → after plus one row per changed field, ids continuing */
  function historyRows(spec) {
    checkCtx(spec.ctx, 'historyRows');
    const out = spec.after.slice();
    let id = out.length ? out[out.length - 1].hist_id + 1 : spec.ctx.next_hist_id;
    for (const f of spec.fields) {
      if (same(spec.old[f], spec.new[f])) { continue; }
      out.push({ hist_id: id++, at: spec.ctx.now, who: spec.ctx.who, sop_id: spec.sop_id, rev: spec.rev, table: spec.table, row_id: spec.row_id,
        field: f, old_value: asText(spec.old[f]), new_value: asText(spec.new[f]), reason: spec.ctx.reason });
    }
    return out;
  }

  /* draftStep(sop, rev, section, stepNo, key): a new row with every contract field, Action type, nothing filled */
  function draftStep(sop, rev, section, stepNo, key) {
    const d = {};
    for (const f of FIELDS) { d[f.name] = null; }
    return Object.assign(d, { key: key, sop_id: sop.sop_id, rev: rev, step_no: stepNo, seq: 0, section: section, step_type: 'Action',
      limit_status: 'Not applicable', hold: 'N', signed_by: 'Operator', class: 'Minor', repeat_count: 1, photo_required: false });
  }

  /* giveValue(vn, given, ctx) → { refusals } or { vn, history }: a Values Needed row gets value, date_given and sign */
  const VN_LABEL = { value: 'Value', date_given: 'Date given', sign: 'Sign' };
  function giveValue(vn, given, ctx) {
    checkCtx(ctx, 'giveValue');
    const refusals = [];
    for (const f of ['value', 'date_given', 'sign']) { if (empty(given[f])) { refusals.push({ field: f, message: VN_LABEL[f] + ' is empty' }); } }
    if (!empty(given.date_given) && !/^\d{4}-\d{2}-\d{2}$/.test(String(given.date_given).trim())) { refusals.push({ field: 'date_given', message: 'Date given must be YYYY-MM-DD. Example: 2026-11-06' }); }
    if (refusals.length) { return { refusals: refusals }; }
    const next = Object.assign({}, vn, { value: String(given.value).trim(), date_given: String(given.date_given).trim(), sign: String(given.sign).trim() });
    if (['value', 'date_given', 'sign'].every(f => same(vn[f], next[f]))) { return { refusals: [{ field: 'form', message: 'Nothing changed' }] }; }
    if (empty(ctx.reason)) { return { refusals: [{ field: 'reason', message: 'Reason for change is empty' }] }; }
    const history = historyRows({ table: 'values_needed', row_id: vn.vn_id, sop_id: vn.sop_id, rev: null, old: vn, new: next, fields: ['value', 'date_given', 'sign'], ctx: ctx, after: [] });
    return { vn: next, history: history };
  }

  /* the texts that may name a step number, per table (the texts to check, Renumber: build 40, example_renumber.md parts 6 and 7) */
  const TEXT_FIELDS = {
    steps: ['action', 'why', 'warning', 'tool', 'material', 'check', 'if_fail', 'skip_if', 'remark'],
    sections: ['needs_note', 'ends_with', 'max_wait', 'restart_step', 'manpower'],
    values_needed: ['step_text', 'value_needed'],
    sops: ['who_does_it', 'input_from', 'output_to'],
    sop_revisions: ['purpose', 'scope', 'process_flow', 'how_to_use', 'setup_rule', 'hold_points']
  };
  const isText = (table, field) => !!TEXT_FIELDS[table] && TEXT_FIELDS[table].indexOf(field) >= 0;

  /* editVnText(vn, field, text, ctx) → { vn, history } or { refusals }: the Step text or the Value needed of a Values Needed row,
     typed on the Texts to check tab (build 40); History has no revision, as for giveValue */
  const VN_TEXT_LABEL = { step_text: 'Step text', value_needed: 'Value needed' };
  function editVnText(vn, field, text, ctx) {
    checkCtx(ctx, 'editVnText');
    if (!VN_TEXT_LABEL[field]) { throw new Error('engine.editVnText: "' + field + '" is not a text of a Values Needed row (step_text, value_needed)'); }
    const v = empty(text) ? null : String(text).trim();
    if (field === 'value_needed' && v === null) { return { refusals: [{ field: 'text', message: 'Value needed is empty' }] }; }
    if (same(vn[field], v)) { return { refusals: [{ field: 'text', message: 'Nothing changed' }] }; }
    if (empty(ctx.reason)) { return { refusals: [{ field: 'reason', message: 'Reason for change is empty' }] }; }
    const next = Object.assign({}, vn);
    next[field] = v;
    return { vn: next, history: historyRows({ table: 'values_needed', row_id: vn.vn_id, sop_id: vn.sop_id, rev: null, old: vn, new: next, fields: [field], ctx: ctx, after: [] }) };
  }

  /* keepText({ table, row_id, sop_id, rev, field, text, ctx }) → [one History row]: "Keep as it is" on the Texts to check tab (build 40):
     the text written again as it is, so it is no longer listed (old value = new value; the reason says so) */
  function keepText(spec) {
    checkCtx(spec.ctx, 'keepText');
    if (!isText(spec.table, spec.field)) { throw new Error('engine.keepText: ' + spec.table + '.' + spec.field + ' is not a text that names steps'); }
    const t = empty(spec.text) ? null : String(spec.text);
    return [{ hist_id: spec.ctx.next_hist_id, at: spec.ctx.now, who: spec.ctx.who, sop_id: spec.sop_id, rev: spec.rev === undefined ? null : spec.rev, table: spec.table, row_id: spec.row_id,
      field: spec.field, old_value: t, new_value: t, reason: 'Text checked: kept as it is' }];
  }

  return { checkStep, editStep, historyRows, draftStep, giveValue, editVnText, keepText, checkGujarati, asText, coerce, derive, checkCtx, LABEL, TEXT_FIELDS };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_EDIT;
