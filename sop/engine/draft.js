/* SOP Builder logic pieces for a draft file from any chat (spec/example_draft_file.md, build 60; Vishal 2026-11-20): exportDraft (an
   SOP's current revision as a draft file, format freezigo-sop-draft version 1), readDraft (the reader: what the file holds, what is
   refused, what is warned, where it goes) and importDraft (a new SOP or an SOP on the list with no revision: its Rev 01; an SOP that has
   a revision: the starter's own copy of it, each step with the Key of the good version's step of the same number). The chat makes the
   file from the fixed prompt (engine/prompt.js); the reader trusts nothing in it. Pure. Classic script (global ENGINE_DRAFT); module in
   Node. Answer key: tests/golden36.js. */
const ENGINE_DRAFT = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const K = (typeof ENGINE_KEYS !== 'undefined') ? ENGINE_KEYS : require('./keys.js');
  const R = (typeof ENGINE_RELEASE !== 'undefined') ? ENGINE_RELEASE : require('./release.js');
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const CP = (typeof ENGINE_COPIES !== 'undefined') ? ENGINE_COPIES : require('./copies.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  const SETSX = (typeof SETS !== 'undefined') ? SETS : require('../schema/sets.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;
  const copy = v => JSON.parse(JSON.stringify(v));
  const pad4 = n => String(n).padStart(4, '0');
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

  /* ---- the format (part 5): the parts of a draft file and the fields of each, in order ---- */
  const FORMAT = 'freezigo-sop-draft', VERSION = 1;
  const PARTS = {
    sop: ['sop_id', 'sop_type', 'level', 'product', 'title', 'who_does_it', 'input_from', 'output_to', 'output_serial_tracked'],
    revision: ['purpose', 'scope', 'process_flow', 'reference_drawings', 'how_to_use', 'setup_rule', 'hold_points', 'est_min_total', 'prepared_by', 'revision_note'],
    sections: ['section', 'name', 'name_gu', 'needs_note', 'ends_with', 'max_wait', 'restart_step', 'manpower', 'est_min', 'needs_sections', 'needs_sops', 'needs_setup',
      'wait_after', 'wait_min', 'any_time_steps', 'manpower_people'],
    steps: ['step_no', 'section', 'step_type', 'action', 'action_gu', 'why', 'warning', 'tool', 'gauge_id', 'material', 'min', 'max', 'unit', 'limit_status', 'check',
      'if_fail', 'skip_if', 'hold', 'repeat_count', 'photo_ref', 'photo_required', 'est_min', 'remark'],
    safety_items: ['no', 'status', 'item', 'who', 'used_at', 'tag'],
    materials: ['sr', 'status', 'material', 'qty', 'note', 'used_at'],
    tools: ['no', 'type', 'name', 'used_at'],
    worked_examples: ['we_id', 'step_text', 'what', 'how', 'decide', 'example'],
    ref_tables: ['table_id', 'title', 'columns', 'rows'],
    values_needed: ['step_text', 'value_needed', 'unit', 'owner', 'blocks_release']
  };
  /* the contract table of each part, and the fields of that table the Builder gives itself (never read from a file) */
  const TABLE = { sop: 'sops', revision: 'sop_revisions', sections: 'sections', steps: 'steps', safety_items: 'safety_items', materials: 'materials', tools: 'tools',
    worked_examples: 'worked_examples', ref_tables: 'ref_tables', values_needed: 'values_needed' };
  const GIVEN = { sop: ['short', 'status', 'current_rev', 'edited_in', 'copy_of', 'copy_name', 'owner'],
    revision: ['sop_id', 'rev', 'status', 'rev_date', 'checked_by', 'checked_date', 'approved_by', 'approved_date', 'release_note'],
    sections: ['sop_id', 'rev', 'source_ref'], steps: ['key', 'sop_id', 'rev', 'seq', 'class', 'signed_by', 'link_sop', 'link_rev', 'link_key', 'link_mode'],
    safety_items: ['sop_id', 'rev'], materials: ['sop_id', 'rev'], tools: ['sop_id', 'rev'], worked_examples: ['sop_id', 'rev'], ref_tables: ['sop_id', 'rev'],
    values_needed: ['vn_id', 'no', 'sop_id', 'value', 'date_given', 'sign'] };
  const LISTS = ['safety_items', 'materials', 'tools', 'worked_examples', 'ref_tables'];
  const TOP = ['format', 'version', 'prompt', 'made_on', 'made_by', 'source', 'sop', 'revision', 'sections', 'steps'].concat(LISTS, ['values_needed']);
  /* the field that numbers a list row, and the words of a list in a line */
  const LIST_ID = { safety_items: 'no', materials: 'sr', tools: 'no', worked_examples: 'we_id', ref_tables: 'table_id' };
  const LIST_WORDS = { safety_items: ['safety item', 'safety items'], materials: ['material', 'materials'], tools: ['tool', 'tools'],
    worked_examples: ['worked example', 'worked examples'], ref_tables: ['table', 'tables'] };
  const ROW_NAME = { safety_items: 'Safety item', materials: 'Material', tools: 'Tool', worked_examples: 'Worked example', ref_tables: 'Table' };
  /* the SOP fields a file may change on an SOP that is already on the list, with their words */
  const SOP_KEEP = [['level', 'level'], ['product', 'product'], ['title', 'title'], ['who_does_it', 'who does it'], ['input_from', 'input from'], ['output_to', 'output to'],
    ['output_serial_tracked', 'output serial tracked']];
  const MAIN_ID = /^[A-Z]+-(L[0-4]|S[1-4])-[A-Z0-9]+-\d{2}$/, PROCESS_ID = /^[A-Z0-9](?:[A-Z0-9-]{1,18})[A-Z0-9]$/;
  const STEP_NO = /^\d+(\.\d+)+$/;
  const LABELS = { sop_id: 'SOP ID', sop_type: 'SOP type', step_no: 'Step no', action_gu: 'Gujarati line', name_gu: 'Gujarati name', gauge_id: 'Gauge ID', we_id: 'WE ID',
    table_id: 'Table ID', needs_sops: 'Needs SOPs', est_min: 'Est min', est_min_total: 'Est min total', if_fail: 'If fail', skip_if: 'Skip if', photo_ref: 'Photo ref',
    photo_required: 'Photo required', repeat_count: 'Repeat count' };
  const label = name => LABELS[name] || (name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '));
  const defOf = (part, name) => TYPESX.tables[TABLE[part]].fields.find(f => f.name === name);
  const pick = (r, fields) => { const o = {}; for (const f of fields) { o[f] = r[f] === undefined ? null : r[f]; } return o; };
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  /* ---- exportDraft ---- */
  /* exportDraft(tables, sopId, made) → the draft file of the SOP's current revision (a copy: under the SOP ID of its good version);
     made = { on, by } (optional): who saved it. The lists in their table order; the open Values Needed rows of the good version (build 64:
     and a copy's own open rows) */
  function exportDraft(tables, sopId, made) {
    if (!tables || !Array.isArray(tables.sops)) { fail('exportDraft', 'tables.sops is missing'); }
    const sop = SEL.sopOf(tables, sopId);
    if (empty(sop.current_rev)) { fail('exportDraft', sopId + ' has no revision'); }
    const rev = sop.current_rev, good = CP.isCopy(sop) ? sop.copy_of : sop.sop_id;
    const mine = name => (tables[name] || []).filter(r => r.sop_id === sopId && r.rev === rev);
    const out = { format: FORMAT, version: VERSION, prompt: null, made_on: made && !empty(made.on) ? made.on : null, made_by: made && !empty(made.by) ? made.by : 'SOP Builder',
      source: 'SOP Builder: ' + sopId + ' ' + rev + (good === sopId ? '' : ' (copy ' + sop.copy_name + ' of ' + good + ')'),
      sop: Object.assign(pick(sop, PARTS.sop), { sop_id: good }), revision: pick(SEL.revisionOf(tables, sopId, rev), PARTS.revision),
      sections: SEL.sectionsOf(tables, sopId, rev).map(r => pick(r, PARTS.sections)), steps: SEL.stepsOf(tables, sopId, rev).map(r => pick(r, PARTS.steps)) };
    for (const name of LISTS) { out[name] = mine(name).map(r => pick(r, PARTS[name])); }
    const vnAll = tables.values_needed || [];
    out.values_needed = vnAll.filter(v => v.sop_id === good && empty(v.value)).concat(good === sopId ? [] : vnAll.filter(v => v.sop_id === sopId && empty(v.value)))
      .map(r => pick(r, PARTS.values_needed));
    return out;
  }

  /* ---- the reader ---- */
  const asNumber = v => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) ? Number(v.trim()) : v;
  const asBool = v => (v === 'Y' || v === 'true') ? true : ((v === 'N' || v === 'false') ? false : v);
  /* value(def, v) → { v, msg }: a value of the file in its contract kind; msg when it is of the wrong kind; v null when empty */
  function value(def, v) {
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) { return { v: null, msg: null }; }
    const L = label(def.name);
    switch (def.type) {
      case 'text':
        if (typeof v === 'string') { return { v: v, msg: null }; }
        if (typeof v === 'number') { return { v: String(v), msg: null }; }
        return { v: v, msg: L + ' must be text' };
      case 'int': { const n = asNumber(v); return Number.isInteger(n) ? { v: n, msg: null } : { v: v, msg: L + ' must be a whole number' }; }
      case 'number': { const n = asNumber(v); return (typeof n === 'number' && !isNaN(n)) ? { v: n, msg: null } : { v: v, msg: L + ' must be a number' }; }
      case 'bool': { const b = asBool(v); return (b === true || b === false) ? { v: b, msg: null } : { v: v, msg: L + ' must be true or false' }; }
      case 'set': return SETSX[def.set].indexOf(v) >= 0 ? { v: v, msg: null } : { v: v, msg: L + ' must be one of: ' + SETSX[def.set].join(', ') };
      case 'list_int': {
        const list = typeof v === 'string' ? v.split(',').map(x => x.trim()).filter(x => x) : v;
        if (!Array.isArray(list)) { return { v: v, msg: L + ' must be a list of whole numbers' }; }
        const out = list.map(asNumber);
        return out.every(n => Number.isInteger(n)) ? { v: out, msg: null } : { v: v, msg: L + ' must be a list of whole numbers' };
      }
      case 'list_text': {
        if (def.db === 'jsonb') {   // the rows of a table: each a list of cells
          const ok = Array.isArray(v) && v.every(row => Array.isArray(row) && row.every(x => x === null || typeof x === 'string' || typeof x === 'number'));
          return ok ? { v: v, msg: null } : { v: v, msg: L + ' must be a list of rows, each a list of cells' };
        }
        const list = typeof v === 'string' ? v.split(def.name === 'photo_ref' ? '|' : ',').map(x => x.trim()).filter(x => x) : v;
        if (!Array.isArray(list) || !list.every(x => typeof x === 'string' || typeof x === 'number')) { return { v: v, msg: L + ' must be a list of texts' }; }
        return { v: list.map(String), msg: null };
      }
      default: return { v: v, msg: null };
    }
  }
  /* fields(part, row, place, req, out): the row's fields of the part, each in its kind; an unknown field or a field the Builder gives
     is warned and left out; a wrong kind, or an empty field named in req, is refused */
  function fields(part, row, place, req, out) {
    const clean = {};
    for (const k of Object.keys(row)) {
      if (PARTS[part].indexOf(k) >= 0) { continue; }
      out.warn(place + k + (GIVEN[part].indexOf(k) >= 0 ? ' is given by the Builder: left out.' : ' is not a field of the Builder: left out.'));
    }
    for (const name of PARTS[part]) {
      const r = value(defOf(part, name), row[name]);
      if (r.msg) { out.refuse(part, place + r.msg); }
      else if (r.v === null && req.indexOf(name) >= 0) { out.refuse(part, place + label(name) + ' is empty'); }
      clean[name] = r.v;
    }
    return clean;
  }
  const dayMonth = now => { const d = String(now).slice(0, 10).split('-'); return Number(d[2]) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d[1]) - 1]; };
  /* the step numbers a text names ("2.1 item 4, 11.1" names 2.1 and 11.1) */
  const namedSteps = text => String(text === null || text === undefined ? '' : text).match(/\d+(?:\.\d+)+/g) || [];

  /* parse(draft, tables) → { refusals } or { refusals: null, target, clean, counts, line, made, warnings }: the reader's work */
  function parse(draft, tables) {
    if (!tables || !Array.isArray(tables.sops)) { fail('readDraft', 'tables.sops is missing'); }
    const refusals = [], warnings = [];
    const out = { refuse: (field, message) => { if (!refusals.some(r => r.message === message)) { refusals.push({ field: field, message: message }); } },
      warn: message => { if (warnings.indexOf(message) < 0) { warnings.push(message); } } };
    if (!isObj(draft) || draft.format !== FORMAT) { return { refusals: [{ field: 'file', message: 'Not a draft file: format is not ' + FORMAT + '.' }] }; }
    const version = typeof draft.version === 'string' && /^\s*\d+\s*$/.test(draft.version) ? Number(draft.version) : draft.version;   /* "1" is 1 */
    if (version !== VERSION) {
      return { refusals: [{ field: 'file', message: (version === undefined || version === null || version === '' ? 'This draft file has no version number' : 'This draft file is version ' + version) +
        '; this SOP Builder reads version ' + VERSION + '.' }] };
    }
    const d = copy(draft);
    for (const k of Object.keys(d)) { if (TOP.indexOf(k) < 0) { out.warn(k + ' is not a part of a draft file: left out.'); } }
    if (!isObj(d.sop)) { return { refusals: [{ field: 'sop', message: 'The file has no sop part (the SOP ID and its header).' }] }; }
    for (const part of ['sections', 'steps'].concat(LISTS, ['values_needed'])) {
      if (d[part] === undefined || d[part] === null) { d[part] = []; }
      if (!Array.isArray(d[part])) { out.refuse(part, part + ' must be a list.'); d[part] = []; }
    }
    if (d.revision === undefined || d.revision === null) { d.revision = {}; }
    if (!isObj(d.revision)) { out.refuse('revision', 'revision must be a part of fields.'); d.revision = {}; }

    /* the SOP: where the file goes */
    const id = String(d.sop.sop_id === undefined || d.sop.sop_id === null ? '' : d.sop.sop_id).trim().toUpperCase();
    const found = id ? tables.sops.find(s => s.sop_id === id) : null;
    let target = null;
    const sopRow = Object.assign({}, d.sop, { sop_id: id || null });
    if (!id) { out.refuse('sop_id', 'SOP ID is empty.'); }
    else if (found && CP.isCopy(found)) { out.refuse('sop_id', id + ' is a copy: use the SOP ID of its good version, ' + found.copy_of + '.'); }
    else if (found && found.status === 'Retired') { out.refuse('sop_id', id + ' is Retired: no draft goes into it.'); }
    else if (found && !empty(d.sop.sop_type) && d.sop.sop_type !== found.sop_type) { out.refuse('sop_type', id + ' is a ' + found.sop_type + ' SOP; the file says ' + d.sop.sop_type + '.'); }
    else if (found) {
      const sop = fields('sop', sopRow, 'SOP: ', [], out);
      target = { kind: empty(found.current_rev) ? 'listed' : 'copy', sop_id: id, rev: found.current_rev || null, sop: sop };
    } else {
      const type = empty(d.sop.sop_type) ? 'Main' : d.sop.sop_type;
      if (type === 'Process' ? !PROCESS_ID.test(id) : !MAIN_ID.test(id)) {
        out.refuse('sop_id', type === 'Process' ? 'SOP ID ' + id + ': the code of a Process SOP is 3 to 20 capitals, digits or dashes. Example: BRAZE-CU.'
          : 'SOP ID ' + id + ': SOP ID must look like BMC-L1-NAME-01: the product, the level (L0 to L4, or S1 to S4), a name and a two-digit number, with a dash between each.');
      } else {
        const sop = fields('sop', Object.assign(sopRow, { sop_type: type, output_serial_tracked: type === 'Process' && (d.sop.output_serial_tracked === undefined || d.sop.output_serial_tracked === null) ? false : d.sop.output_serial_tracked }), 'SOP: ', [], out);
        const lev = SETSX.level;
        if (empty(sop.level)) { out.refuse('level', 'Level is empty.'); }
        else if (lev.indexOf(sop.level) >= 0 && type === 'Process' && sop.level !== 'Process') { out.refuse('level', 'A Process SOP has the level Process.'); }
        if (empty(sop.product)) { out.refuse('product', 'Product is empty.'); }
        if (empty(sop.title)) { out.refuse('title', 'Title is empty.'); }
        if (sop.output_serial_tracked !== true && sop.output_serial_tracked !== false) { out.refuse('output_serial_tracked', 'Output serial tracked is not set.'); }
        target = { kind: 'new', sop_id: id, rev: null, sop: sop };
      }
    }
    if (target && MAIN_ID.test(id) && !empty(target.sop.level)) {
      const said = id.split('-')[1], should = said.charAt(0) === 'L' ? said : 'Site';
      if (target.sop.level !== should) { out.warn('SOP: Level ' + target.sop.level + ', but the SOP ID ' + id + ' says ' + said + '.'); }
    }
    const revision = fields('revision', d.revision, 'Revision: ', [], out);

    /* the sections: 3 and on, each once */
    const sections = [], seenSec = {};
    d.sections.forEach(function (row, i) {
      if (!isObj(row)) { out.refuse('sections', 'Section row ' + (i + 1) + ' is not a row of fields.'); return; }
      const no = asNumber(row.section);
      const place = 'Section ' + (row.section === undefined || row.section === null || row.section === '' ? 'row ' + (i + 1) : row.section) + ': ';
      const s = fields('sections', row, place, ['section', 'name'], out);
      if (!Number.isInteger(no)) { return; }
      if (no === 1 || no === 2) { out.refuse('sections', 'Section ' + no + ': sections 1 (Safety and PPE) and 2 (Materials, tools and machines) are the lists safety_items, materials and tools, not section rows. Process sections start at 3.'); return; }
      if (no < 3) { out.refuse('sections', 'Section ' + no + ': process sections start at 3.'); return; }
      if (seenSec[no]) { out.refuse('sections', 'Section ' + no + ' is there twice.'); return; }
      seenSec[no] = true;
      sections.push(s);
    });
    if (!d.sections.length) { out.refuse('sections', 'The file has no sections.'); }
    sections.sort((a, b) => a.section - b.section);

    /* the steps: numbers as text, x.1 and x.1.1, each once, in their own section, sections in order */
    const steps = [], seenNo = {};
    let top = -Infinity;
    d.steps.forEach(function (row, i) {
      if (!isObj(row)) { out.refuse('steps', 'Step row ' + (i + 1) + ' is not a row of fields.'); return; }
      const raw = row.step_no;
      const no = raw === undefined || raw === null ? '' : String(raw).trim();
      const place = 'Step ' + (no || 'row ' + (i + 1)) + ': ';
      const fix = Object.assign({}, row);
      if (fix.repeat_count === undefined || fix.repeat_count === null || fix.repeat_count === '') { fix.repeat_count = 1; }
      if (fix.photo_required === undefined || fix.photo_required === null || fix.photo_required === '') { fix.photo_required = false; }
      if (fix.hold === undefined || fix.hold === null || fix.hold === '') { fix.hold = 'N'; }
      if (empty(fix.limit_status) && empty(fix.min) && empty(fix.max) && empty(fix.unit)) { fix.limit_status = 'Not applicable'; }
      if (typeof raw === 'number') { fix.step_no = String(raw); }
      const s = fields('steps', fix, place, ['step_no', 'section', 'step_type', 'action', 'limit_status', 'hold', 'repeat_count', 'photo_required'], out);
      if (!empty(s.hold) && !/^(N|H[0-9]+)$/.test(String(s.hold))) { out.refuse('steps', place + 'Hold must be N or a hold number such as H1'); }
      if (typeof raw === 'number') { out.refuse('steps', place + 'the step number must be text in quotes ("' + no + '"): as a number, 3.10 turns into 3.1.'); }
      else if (no && !STEP_NO.test(no)) { out.refuse('steps', place + 'Step no must be numbers with dots. Example: 9.5.1'); }
      else if (no) {
        const p = no.split('.');
        const z = p.findIndex((x, j) => j > 0 && Number(x) === 0);
        if (z === 1) { out.refuse('steps', place + 'the first step of a section is ' + p[0] + '.1, never ' + p[0] + '.0.'); }
        else if (z > 1) { const head = p.slice(0, z).join('.'); out.refuse('steps', place + 'the first sub-step is ' + head + '.1, never ' + head + '.0.'); }
        if (seenNo[no]) { out.refuse('steps', 'Step ' + no + ' is there twice.'); }
        seenNo[no] = true;
        const sec = asNumber(row.section);
        if (Number.isInteger(sec)) {
          if (!seenSec[sec] && sec >= 3) { out.refuse('steps', place + 'section ' + sec + ' is not in the sections.'); }
          if (Number(p[0]) !== sec) { out.refuse('steps', 'Step ' + no + ' is in section ' + sec + ': its first number says section ' + p[0] + '.'); }
          else {   /* the order: only a step in its own section counts, so one wrong section is one line */
            if (sec < top) { out.refuse('steps', 'Step ' + no + ' comes after section ' + top + ': keep the steps of a section together, sections in number order.'); }
            top = Math.max(top, sec);
          }
        }
      }
      steps.push(s);
    });
    if (!d.steps.length) { out.refuse('steps', 'The file has no steps.'); }

    /* the lists (sections 1 and 2 of the floor copy, worked examples, reference tables): a missing number is the row's place */
    const lists = {};
    for (const name of LISTS) {
      const idf = LIST_ID[name], seen = {};
      const req = TYPESX.tables[name].fields.filter(f => f.req && f.name !== 'sop_id' && f.name !== 'rev').map(f => f.name);
      lists[name] = [];
      d[name].forEach(function (row, i) {
        if (!isObj(row)) { out.refuse(name, ROW_NAME[name] + ' row ' + (i + 1) + ' is not a row of fields.'); return; }
        const fix = Object.assign({}, row);
        if (fix[idf] === undefined || fix[idf] === null || fix[idf] === '') {
          if (name === 'ref_tables') { out.refuse(name, ROW_NAME[name] + ' row ' + (i + 1) + ': Table ID is empty'); return; }
          fix[idf] = name === 'worked_examples' ? 'WE-' + (i + 1) : i + 1;
        }
        const r = fields(name, fix, ROW_NAME[name] + ' ' + fix[idf] + ': ', req, out);
        if (seen[String(r[idf])]) { out.refuse(name, ROW_NAME[name] + ' ' + r[idf] + ' is there twice.'); return; }
        seen[String(r[idf])] = true;
        lists[name].push(r);
      });
    }
    /* Values Needed: the rows the file adds (the Builder numbers them) */
    const vn = [];
    d.values_needed.forEach(function (row, i) {
      if (!isObj(row)) { out.refuse('values_needed', 'Values Needed row ' + (i + 1) + ' is not a row of fields.'); return; }
      vn.push(fields('values_needed', row, 'Values Needed ' + (i + 1) + ': ', ['step_text', 'value_needed', 'owner', 'blocks_release'], out));
    });
    if (refusals.length) { return { refusals: refusals }; }

    /* warned: the Builder's step rules, the Gujarati line, Values Needed */
    const keys = steps.map((s, i) => 'DRAFT-' + pad4(i + 1));
    const rows = K.renumber(steps.map((s, i) => Object.assign(E.draftStep({ sop_id: 'DRAFT' }, 'Rev 00', s.section, s.step_no, keys[i]), s, { key: keys[i], sop_id: 'DRAFT', rev: 'Rev 00' }))).steps;
    const inFile = {};
    for (const s of rows) { inFile[s.step_no] = true; }
    let prev = null;
    for (const s of rows) {
      const place = 'Step ' + s.step_no + ': ';
      for (const m of E.checkStep(s)) { out.warn(place + m.message); }
      if (empty(s.action_gu)) { out.warn(place + 'no Gujarati line.'); }
      if (s.limit_status === 'Needed' && !vn.some(v => namedSteps(v.step_text).indexOf(s.step_no) >= 0)) { out.warn(place + 'Limit status Needed, and no Values Needed row names step ' + s.step_no + '.'); }
      if (prev && prev.section === s.section && T.compareStepNo(s.step_no, prev.step_no) < 0) { out.warn(place + 'comes after ' + prev.step_no + ' in the file: the order of the file is the order of the work (Seq).'); }
      prev = s;
    }
    for (const s of sections) { if (!rows.some(x => x.section === s.section)) { out.warn('Section ' + s.section + ' has no steps.'); } }
    for (const v of vn) {
      if (STEP_NO.test(String(v.step_text).trim()) && !inFile[String(v.step_text).trim()]) { out.warn('Values Needed "' + v.value_needed + '": step ' + String(v.step_text).trim() + ' is not in the steps.'); }
    }

    const counts = { sections: sections.length, steps: steps.length };
    for (const name of LISTS) { counts[name] = lists[name].length; }
    counts.values_needed = vn.length;
    const line = [id, plural(counts.sections, 'section'), plural(counts.steps, 'step')]
      .concat(LISTS.filter(n => counts[n] > 0).map(n => plural(counts[n], LIST_WORDS[n][0], LIST_WORDS[n][1])), [counts.values_needed + ' Values Needed']).join(' · ');
    const tl = target.kind === 'new' ? 'A new SOP ' + id + ': the file becomes its Rev 01, then your own copy First draft opens.'
      : (target.kind === 'listed' ? id + ' is on the SOP list with no revision: the file becomes its Rev 01, then your own copy First draft opens.'
        : id + ' has ' + target.rev + ': the file becomes your own copy of it, and its Compare tab shows every difference.');
    const made = { prompt: empty(d.prompt) ? null : String(d.prompt), made_on: empty(d.made_on) ? null : String(d.made_on), made_by: empty(d.made_by) ? null : String(d.made_by),
      source: empty(d.source) ? null : String(d.source) };
    return { refusals: null, target: { kind: target.kind, sop_id: id, rev: target.rev, line: tl }, sop: target.sop, revision: revision, sections: sections, steps: steps,
      lists: lists, values_needed: vn, counts: counts, line: line, made: made, warnings: warnings };
  }

  /* readDraft(draft, tables) → { refusals } or { refusals: null, target: { kind, sop_id, rev, line }, counts, line, made, warnings } */
  function readDraft(draft, tables) {
    const p = parse(draft, tables);
    if (p.refusals) { return { refusals: p.refusals }; }
    return { refusals: null, target: p.target, counts: p.counts, line: p.line, made: p.made, warnings: p.warnings };
  }

  /* ---- importDraft ---- */
  /* the words of where the file came from: Draft file "<source>" (made <day> by <who>, <prompt>) */
  function fromWords(m) {
    const a = [];
    if (!empty(m.made_on)) { a.push('made ' + m.made_on); }
    if (!empty(m.made_by)) { a.push('by ' + m.made_by); }
    let s = a.join(' ');
    if (!empty(m.prompt)) { s = s ? s + ', ' + m.prompt : m.prompt; }
    return 'Draft file' + (empty(m.source) ? '' : ' "' + m.source + '"') + (s ? ' (' + s + ')' : '');
  }
  /* the numbers of the keys of a short that are taken (any SOP's steps, retired keys and ranges) */
  function takenOf(short, t) {
    const taken = {};
    const see = k => { const m = /^([A-Z0-9]+)-(\d{4})$/.exec(String(k || '')); return m && m[1] === short ? Number(m[2]) : null; };
    for (const s of t.steps) { const n = see(s.key); if (n !== null) { taken[n] = true; } }
    for (const r of t.retired_keys || []) {
      const a = see(r.key);
      if (a === null) { continue; }
      const b = empty(r.range_to) ? a : see(r.range_to);
      for (let n = a; n <= (b === null ? a : b); n++) { taken[n] = true; }
    }
    return taken;
  }
  /* firstKeys(short, n, t): the Keys of a new SOP's steps in first-build order: SHORT-0100, 0200 (more than 99 steps: 0010, 0020) */
  function firstKeys(short, n, t) {
    const taken = takenOf(short, t), gap = n <= 99 ? 100 : (n <= 999 ? 10 : 1), out = [];
    let last = 0;
    for (let i = 1; i <= n; i++) {
      let k = Math.max(i * gap, last + 1);
      while (taken[k]) { k++; }
      if (k > 9999) { fail('importDraft', 'no free key left under ' + short + '-9999'); }
      out.push(short + '-' + pad4(k));
      taken[k] = true; last = k;
    }
    return out;
  }
  const sameText = (a, b) => String(a === null || a === undefined ? '' : a).trim().toLowerCase() === String(b === null || b === undefined ? '' : b).trim().toLowerCase();
  function vnRows(p, sopId, existing, ctx) {
    const fresh = p.values_needed.filter(v => !existing.some(x => sameText(x.step_text, v.step_text) && sameText(x.value_needed, v.value_needed)));
    if (fresh.length && !Number.isInteger(ctx.next_vn_no)) { fail('importDraft', 'ctx.next_vn_no (the next Values Needed number) is missing'); }
    return { rows: fresh.map((v, i) => ({ vn_id: 'VN-' + pad4(ctx.next_vn_no + i), no: ctx.next_vn_no + i, sop_id: sopId, step_text: v.step_text, value_needed: v.value_needed,
      unit: v.unit, owner: v.owner, blocks_release: v.blocks_release, value: null, date_given: null, sign: null })), already: p.values_needed.length - fresh.length };
  }
  const vnLine = rows => rows.length === 1 ? rows[0].vn_id : rows[0].vn_id + ' to ' + rows[rows.length - 1].vn_id;
  function listRows(p, sopId, rev) {
    const out = {};
    for (const name of LISTS) { out[name] = p.lists[name].map(r => Object.assign({ sop_id: sopId, rev: rev }, r)); }
    return out;
  }
  const listLine = p => { const parts = LISTS.filter(n => p.counts[n] > 0).map(n => plural(p.counts[n], LIST_WORDS[n][0], LIST_WORDS[n][1])); return parts.length ? 'Lists: ' + parts.join(', ') + '.' : null; };
  const listWords = (name, r) => (ROW_NAME[name] + ' ' + r[LIST_ID[name]] + ' ' + (r.item || r.material || r.name || r.what || r.title || '')).trim();
  const oneLine = text => String(text === null || text === undefined ? '' : text).replace(/\s*\n\s*/g, ' ');
  function stepRows(p, sop, rev, keys) {
    return K.renumber(p.steps.map((s, i) => Object.assign(E.draftStep(sop, rev, s.section, s.step_no, keys[i]), s, { key: keys[i], sop_id: sop.sop_id, rev: rev }))).steps;
  }
  function sectionRows(p, sopId, rev, refOf) {
    const names = TYPESX.tables.sections.fields.map(f => f.name);
    return p.sections.map(function (s) { const row = {}; for (const f of names) { row[f] = null; } return Object.assign(row, s, { sop_id: sopId, rev: rev, source_ref: refOf ? refOf(s.section) : null }); });
  }

  /* importDraft({ tables, draft, ctx, copy_name }) → { refusals } or { refusals: null, kind, sop_id, report, warnings, new_history, tables }:
     ctx needs who, now, next_hist_id, reason; next_rh_id (a new SOP or an SOP on the list), next_vn_no (Values Needed rows to add),
     next_note_id (a copy of a revision with open notes) */
  function importDraft(input) {
    if (!input || !input.tables || input.draft === undefined || !input.ctx) { fail('importDraft', 'input needs tables, draft and ctx'); }
    const p = parse(input.draft, input.tables);
    if (p.refusals) { return { refusals: p.refusals }; }
    E.checkCtx(input.ctx, 'importDraft');
    if (empty(input.ctx.reason)) { return { refusals: [{ field: 'reason', message: 'Reason for change is empty.' }] }; }
    return p.target.kind === 'copy' ? intoCopy(input, p) : intoRev01(input, p);
  }

  /* a new SOP, or an SOP on the list with no revision: its Rev 01 Draft with the file's content (the start of example_new_sop.md) */
  function intoRev01(input, p) {
    const t = input.tables, ctx = input.ctx, rev = 'Rev 01', today = String(ctx.now).slice(0, 10), id = p.target.sop_id;
    if (!Number.isInteger(ctx.next_rh_id)) { fail('importDraft', 'ctx.next_rh_id (the next revision history id) is missing'); }
    const isNew = p.target.kind === 'new';
    const before = isNew ? null : copy(SEL.sopOf(t, id));
    let sop;
    if (isNew) {
      sop = {};
      for (const f of TYPESX.tables.sops.fields) { sop[f.name] = null; }
      Object.assign(sop, p.sop, { sop_id: id, short: p.sop.sop_type === 'Process' ? id.replace(/-/g, '') : id.split('-')[2] + id.split('-')[3] });
    } else {
      sop = copy(before);
      for (const f of SOP_KEEP) { if (p.sop[f[0]] !== null && p.sop[f[0]] !== undefined) { sop[f[0]] = p.sop[f[0]]; } }
    }
    Object.assign(sop, { status: 'Built', current_rev: rev, edited_in: 'Builder' });
    const keys = firstKeys(sop.short, p.steps.length, t);
    const steps = stepRows(p, sop, rev, keys);
    const sections = sectionRows(p, id, rev, null);
    const lists = listRows(p, id, rev);
    const vn = vnRows(p, id, (t.values_needed || []).filter(v => v.sop_id === id), ctx).rows;
    const lines = [fromWords(p.made) + ' brought in as ' + id + ' ' + rev + ': ' + plural(sections.length, 'section') + ', ' + plural(steps.length, 'step') +
      ' (' + (keys.length === 1 ? 'Key ' + keys[0] : 'Keys ' + keys[0] + ' to ' + keys[keys.length - 1]) + ').'];
    if (listLine(p)) { lines.push(listLine(p)); }
    lines.push('Values Needed: ' + (vn.length ? vnLine(vn) + '.' : 'none in the file.'));
    const changed = isNew ? [] : SOP_KEEP.filter(f => E.asText(before[f[0]]) !== E.asText(sop[f[0]])).map(f => f[1]);
    if (changed.length) { lines.push('Changed from the SOP list: ' + changed.join(', ') + '.'); }
    const revision = {};
    for (const f of TYPESX.tables.sop_revisions.fields) { revision[f.name] = null; }
    for (const f of PARTS.revision) { if (p.revision[f] !== null && p.revision[f] !== undefined) { revision[f] = p.revision[f]; } }
    Object.assign(revision, { sop_id: id, rev: rev, status: 'Draft', rev_date: today, prepared_by: empty(p.revision.prepared_by) ? ctx.who : p.revision.prepared_by,
      revision_note: lines[0] + (empty(p.revision.revision_note) ? '' : ' Note in the file: ' + p.revision.revision_note) });
    const summary = 'Rev 01 brought in from ' + (empty(p.made.source) ? 'a draft file' : 'the draft file "' + p.made.source + '"') + ': ' + plural(sections.length, 'section') + ', ' + plural(steps.length, 'step') + '.';
    const rh = { rh_id: ctx.next_rh_id, sop_id: id, rev: rev, date: today, what_changed: summary, changed_by: ctx.who, approved_by: R.TO_SIGN };
    const H = (table, rowId, rev2, old, nw, flds, after) => E.historyRows({ table: table, row_id: rowId, sop_id: id, rev: rev2, old: old, new: nw, fields: flds, ctx: ctx, after: after });
    const added = (table, rowId, rev2, words, after) => H(table, rowId, rev2, { row: null }, { row: 'added: ' + words }, ['row'], after);
    let hist = added('sop_revisions', id + ' ' + rev, rev, 'Rev 01 (from a draft file)', []);
    for (const s of sections) { hist = added('sections', id + ' ' + rev + ' ' + s.section, rev, s.section + ' ' + s.name, hist); }
    for (const s of steps) { hist = added('steps', s.key, rev, s.step_no + ' ' + oneLine(s.action), hist); }
    for (const name of LISTS) { for (const r of lists[name]) { hist = added(name, id + ' ' + rev + ' ' + r[LIST_ID[name]], rev, listWords(name, r), hist); } }
    hist = isNew ? added('sops', id, null, id + ' ' + sop.title, hist)
      : H('sops', id, null, before, sop, SOP_KEEP.map(f => f[0]).concat(['status', 'current_rev', 'edited_in']), hist);
    for (const v of vn) { hist = added('values_needed', v.vn_id, null, v.vn_id + ' ' + v.value_needed, hist); }
    hist = added('revision_history', String(rh.rh_id), rev, summary, hist);
    const tables = { sops: SEL.mergeRows(t.sops, [sop], ['sop_id']), sop_revisions: t.sop_revisions.concat([revision]), sections: t.sections.concat(sections),
      steps: t.steps.concat(steps), values_needed: (t.values_needed || []).concat(vn), revision_history: (t.revision_history || []).concat([rh]), history: t.history.concat(hist) };
    for (const name of LISTS) { tables[name] = (t[name] || []).concat(lists[name]); }
    return { refusals: null, kind: p.target.kind, sop_id: id, report: lines, warnings: p.warnings, new_history: hist, tables: tables };
  }

  /* an SOP that has a revision: the starter's own copy (Save a copy), then the file's content in it; each step takes the Key of the good
     version's step with the same number, a new number a new Key between its neighbours (contract part 3) */
  function intoCopy(input, p) {
    const t = input.tables, ctx = input.ctx;
    const good = SEL.sopOf(t, p.target.sop_id), rev = good.current_rev;
    let name = input.copy_name;
    if (empty(name)) {
      const base = 'Draft file ' + dayMonth(ctx.now);
      const taken = n => t.sops.some(s => s.copy_of === good.sop_id && sameText(s.copy_name, n));
      name = base;
      for (let i = 2; taken(name); i++) { name = base + ' (' + i + ')'; }
    }
    const sc = CP.saveCopy({ tables: t, sop_id: good.sop_id, name: name, ctx: ctx });
    if (sc.refusals) { return sc; }
    const cid = sc.sop_id, st = sc.tables;
    name = String(name).trim().replace(/\s+/g, ' ');
    const goodSteps = SEL.stepsOf(t, good.sop_id, rev), byNo = {};
    for (const s of goodSteps) { byNo[s.step_no] = s.key; }
    const keys = p.steps.map(s => byNo[s.step_no] || null);
    const matched = keys.filter(k => k).length;
    const used = SEL.familyKeys(t, good.sop_id).slice();
    for (let i = 0; i < keys.length; i++) {
      if (keys[i]) { continue; }
      let j = i + 1;
      while (j < keys.length && !keys[j]) { j++; }
      keys[i] = K.newKey(good.short, used, t.retired_keys || [], i > 0 ? keys[i - 1] : null, j < keys.length ? keys[j] : null).key;
      used.push(keys[i]);
    }
    const cpSop = st.sops.find(s => s.sop_id === cid);
    const newSop = copy(cpSop);
    for (const f of SOP_KEEP) { if (p.sop[f[0]] !== null && p.sop[f[0]] !== undefined) { newSop[f[0]] = p.sop[f[0]]; } }
    const steps = stepRows(p, newSop, rev, keys);
    /* build 64 (the SS tank test, example_draft_file.md part 11): the prompt leaves photo names to the Builder, and a chat may leave a gauge
       empty: an empty one keeps the good version's of the same Key (a gauge only on a Reading) */
    const goodByKey = {};
    for (const s of goodSteps) { goodByKey[s.key] = s; }
    let keptPhoto = 0, keptGauge = 0;
    for (const s of steps) {
      const g = goodByKey[s.key];
      if (!g) { continue; }
      if (!(Array.isArray(s.photo_ref) && s.photo_ref.length) && Array.isArray(g.photo_ref) && g.photo_ref.length) { s.photo_ref = copy(g.photo_ref); keptPhoto++; }
      if (empty(s.gauge_id) && !empty(g.gauge_id) && s.step_type === 'Reading') { s.gauge_id = g.gauge_id; keptGauge++; }
    }
    const goodSec = {};
    for (const s of SEL.sectionsOf(t, good.sop_id, rev)) { goodSec[s.section] = s.source_ref === undefined ? null : s.source_ref; }
    const sections = sectionRows(p, cid, rev, n => (goodSec[n] === undefined ? null : goodSec[n]));
    const lists = listRows(p, cid, rev);
    const v = vnRows(p, cid, (t.values_needed || []).filter(x => x.sop_id === good.sop_id), ctx);
    const inFile = {};
    for (const s of p.steps) { inFile[s.step_no] = true; }
    const missing = goodSteps.filter(s => !inFile[s.step_no]).map(s => s.step_no);
    const lines = [fromWords(p.made) + ' brought in as copy ' + name + ' of ' + good.sop_id + ' ' + rev + '.',
      plural(matched, 'step') + ' take' + (matched === 1 ? 's' : '') + ' the Key of the step with the same number in ' + good.sop_id + ' ' + rev + '; ' + plural(keys.length - matched, 'new Key') + '.'];
    if (missing.length) {
      const shown = missing.length > 12 ? missing.slice(0, 12).join(', ') + ' and ' + (missing.length - 12) + ' more' : missing.join(', ');
      lines.push(plural(missing.length, 'step') + ' of ' + good.sop_id + ' ' + rev + (missing.length === 1 ? ' is' : ' are') + ' not in the file (' + shown + '): the Compare tab shows ' +
        (missing.length === 1 ? 'it' : 'them') + ' as not in the copy.');
    }
    if (keptPhoto || keptGauge) {
      lines.push('Kept from ' + good.sop_id + ' ' + rev + ' by Key (empty in the file): ' + [keptPhoto ? 'the photo names of ' + plural(keptPhoto, 'step') : null,
        keptGauge ? 'the gauge of ' + plural(keptGauge, 'step') : null].filter(x => x).join(', ') + '.');
    }
    const changed = SOP_KEEP.filter(f => E.asText(cpSop[f[0]]) !== E.asText(newSop[f[0]])).map(f => f[1]);
    if (changed.length) { lines.push('Changed from ' + good.sop_id + ': ' + changed.join(', ') + '.'); }
    /* build 64: the file's new rows stay with the copy until Make this the good version (Delete this copy takes them out) */
    lines.push('Values Needed: ' + (!p.values_needed.length ? 'none in the file.'
      : (v.rows.length ? vnLine(v.rows) + ' added to this copy (' + (v.rows.length === 1 ? 'it goes' : 'they go') + ' to ' + good.sop_id + ' with Make this the good version)' +
        (v.already ? '; ' + v.already + ' already in the list of ' + good.sop_id : '') + '.'
        : p.values_needed.length + ' in the file, all already in the list of ' + good.sop_id + '.')));
    const revRow = copy(st.sop_revisions.find(r => r.sop_id === cid && r.rev === rev));
    for (const f of PARTS.revision) { if (f !== 'revision_note' && p.revision[f] !== null && p.revision[f] !== undefined) { revRow[f] = p.revision[f]; } }
    revRow.revision_note = 'Copy ' + name + ' of ' + good.sop_id + ' ' + rev + ' from the ' + fromWords(p.made).charAt(0).toLowerCase() + fromWords(p.made).slice(1) + ', brought in ' +
      String(ctx.now).slice(0, 10) + ' by ' + ctx.who + '.' + (empty(p.revision.revision_note) ? '' : ' Note in the file: ' + p.revision.revision_note);
    const mine = r => r.sop_id === cid;
    const tables = { sops: st.sops.map(s => (s.sop_id === cid ? newSop : s)), sop_revisions: st.sop_revisions.map(r => (mine(r) && r.rev === rev ? revRow : r)),
      steps: st.steps.filter(r => !mine(r)).concat(steps), sections: st.sections.filter(r => !mine(r)).concat(sections), pictures: st.pictures, chart_notes: st.chart_notes,
      values_needed: (t.values_needed || []).concat(v.rows) };
    for (const n of LISTS) { tables[n] = st[n].filter(r => !mine(r)).concat(lists[n]); }
    const H = (table, rowId, sopId, rev2, old, nw, flds, after) => E.historyRows({ table: table, row_id: rowId, sop_id: sopId, rev: rev2, old: old, new: nw, fields: flds, ctx: ctx, after: after });
    let hist = H('sops', cid, cid, null, { row: null }, { row: 'draft file: ' + lines[0] + ' ' + lines[1] }, ['row'], sc.new_history);
    for (const r of v.rows) { hist = H('values_needed', r.vn_id, cid, null, { row: null }, { row: 'added: ' + r.vn_id + ' ' + r.value_needed }, ['row'], hist); }
    tables.history = t.history.concat(hist);
    return { refusals: null, kind: 'copy', sop_id: cid, report: lines, warnings: p.warnings, new_history: hist, tables: tables };
  }

  return { exportDraft, readDraft, importDraft, FORMAT: FORMAT, VERSION: VERSION, PARTS: PARTS };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_DRAFT;
