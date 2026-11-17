/* SOP Builder screen builders for the header and the lists typed in the
   Builder (spec/example_new_sop.md parts 9 and 10, job N2, build 32):
   the header form (the SOP and the revision text), the row form of a
   list (1 Safety and PPE, Materials, Tools and machines, Gauges, Worked
   examples) and the grids with Add a row, Edit and Remove. Every input
   has its note and example from the contract (schema/types.js). HTML
   from data only. Classic script (global RENDER_LISTS). */
const RENDER_LISTS = (function () {
  const R = RENDER;
  const esc = R.esc, show = R.show;
  const L = () => ENGINE_LISTS;
  const val = v => (v === null || v === undefined ? '' : String(v));
  const WIDE = ['meaning', 'who_does_it', 'input_from', 'output_to', 'purpose', 'scope', 'process_flow', 'reference_drawings', 'how_to_use', 'setup_rule', 'hold_points',
    'revision_note', 'item', 'used_at', 'how', 'decide', 'example', 'calibration', 'note', 'measures'];
  /* plain words where the contract's note is written for the data (build 27 wording for the serial) */
  const OVER = { output_serial_tracked: ['Y when each piece this SOP makes gets its own serial number. N for a lot check or site work.', 'Y for BMC-L1-TANK-01'],
    level: ['L0 incoming check, L1 part, L2 sub-assembly, L3 final assembly, L4 test and handover, Site.', 'L1'],
    est_min_total: ['Minutes for the whole SOP, a number. Leave it empty when not known.', '240'],
    gauge_id: ['G- then capitals, digits or dashes; small letters are taken in capitals. It cannot change later.', 'G-TORQUE'] };
  function noteOf(d) {
    const o = OVER[d.name];
    const note = o ? o[0] : d.note, ex = o ? o[1] : d.example;
    return '<div class="note">' + esc(note) + ' Example: ' + esc(ex) + (/[.!?)]$/.test(String(ex)) ? '' : '.') + '</div>';
  }
  function input(prefix, d, v, options) {
    const id = prefix + d.name;
    if (options) {
      return '<select id="' + id + '" name="' + d.name + '">' + (options.indexOf(v) < 0 ? '<option value=""' + (v ? '' : ' selected') + '>choose</option>' : '') +
        options.map(o => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
    }
    if (WIDE.indexOf(d.name) >= 0) { return '<textarea id="' + id + '" name="' + d.name + '" rows="2">' + esc(val(v)) + '</textarea>'; }
    return '<input id="' + id + '" name="' + d.name + '" value="' + esc(val(v)) + '" size="' + (d.type === 'number' || d.type === 'int' ? 8 : (d.name === 'gauge_id' ? 20 : 40)) + '">';
  }
  const fixedRow = (label, html) => '<div class="f"><label>' + esc(label) + '</label><div class="v fixed">' + html + '</div></div>';
  const typedRow = (prefix, d, v, options) => '<div class="f"><label for="' + prefix + d.name + '">' + esc(L().LABEL[d.name] || d.name) + '</label><div class="v">' +
    input(prefix, d, v, options) + noteOf(d) + '<div class="refusal" data-for="' + d.name + '"></div></div></div>';
  const buttons = (save, cancel, what) => '<div class="f"><label></label><div class="v"><button id="' + save + '" type="button">Save</button> <button id="' + cancel + '" type="button">Cancel</button>' +
    '<div class="note">' + esc(what) + '</div><div class="refusal" data-for="form"></div></div></div>';

  /* headerForm(view): the SOP's fields, then the current revision's text */
  function headerForm(view) {
    const sop = view.sop, rev = view.rev, proc = sop.sop_type === 'Process';
    const sd = TYPES.tables.sops.fields, rd = TYPES.tables.sop_revisions.fields;
    const def = (defs, n) => defs.find(f => f.name === n);
    let h = '<div class="card edit-card" id="header-form"><h3>Edit the header <span class="muted">' + esc(sop.sop_id) + ' ' + esc(rev.rev) + '</span></h3><form id="hd-form" onsubmit="return false">' +
      '<div class="fhead">SOP (every revision)</div>' +
      fixedRow('SOP ID', esc(sop.sop_id) + ' <span class="muted">· ' + esc(sop.sop_type) + ' SOP · short ' + esc(sop.short) + ' · ' + esc(sop.status) + ' · Edited in ' + esc(sop.edited_in) + ' (cannot be typed)</span>');
    for (const n of L().SOP_TYPED) {
      if (proc && n === 'level') { h += fixedRow('Level', 'Process <span class="muted">(a Process SOP)</span>'); continue; }
      if (proc && n === 'output_serial_tracked') { h += fixedRow('Output serial tracked', 'N <span class="muted">(a Process SOP works on the main part\'s serial)</span>'); continue; }
      const d = def(sd, n);
      if (n === 'output_serial_tracked') { h += typedRow('hd-', d, sop[n] === true ? 'Y' : (sop[n] === false ? 'N' : ''), ['Y', 'N']); continue; }
      h += typedRow('hd-', d, sop[n], n === 'level' ? SETS.level.filter(l => l !== 'Process') : null);
    }
    h += '<div class="fhead">This revision (' + esc(rev.rev) + ')</div>' +
      fixedRow('Revision', esc(rev.status) + ' · ' + show(rev.rev_date) + ' · prepared by ' + show(rev.prepared_by) + ' <span class="muted">(Checked and Approved are signed on the Release check tab)</span>');
    for (const n of L().REV_TYPED) { h += typedRow('hd-', def(rd, n), rev[n], null); }
    return h + buttons('btn-hd-save', 'btn-hd-cancel', 'Save checks the form, then asks the reason for the change.') + '</form></div>';
  }
  function readHeader(form, view) {
    const out = {};
    for (const n of L().SOP_TYPED.concat(L().REV_TYPED)) { const el = form.querySelector('[name="' + n + '"]'); if (el) { out[n] = el.value; } }
    return out;
  }

  /* rowForm(table, row): row null = a new row; next = its number (shown) */
  function rowForm(table, row, next) {
    const spec = L().LISTS[table], defs = TYPES.tables[table].fields;
    const title = { safety_items: '1 Safety and PPE (P-1)', materials: 'Materials (M-1)', tools: 'Tools and machines (T-1)', worked_examples: 'Worked example', gauges: 'Gauge', glossary: 'Glossary term' }[table];
    let h = '<div class="card edit-card row-form" id="row-form" data-table="' + esc(table) + '"><h3>' + (row ? 'Edit ' : 'New row: ') + esc(title) + (row ? ' ' + esc(row[spec.id]) : '') + '</h3><form id="rw-form" onsubmit="return false">';
    if (spec.id !== 'gauge_id') { h += fixedRow(L().LABEL[spec.id] || (spec.id === 'we_id' ? 'No.' : 'No.'), esc(row ? row[spec.id] : next) + ' <span class="muted">(' + (row ? 'cannot change' : 'the next number') + ')</span>'); }
    for (const n of spec.typed) {
      const d = defs.find(f => f.name === n);
      if (n === 'gauge_id' && row) { h += fixedRow('Gauge ID', esc(row.gauge_id) + ' <span class="muted">(cannot change)</span>'); continue; }
      h += typedRow('rw-', d, row ? row[n] : null, d.type === 'set' ? SETS[d.set] : null);
    }
    const what = table === 'gauges' || table === 'glossary' ? (table === 'gauges' ? 'Gauges' : 'The Glossary') + ' is shared by every SOP. Save asks the reason for the change.' : 'Save checks the form, then asks the reason for the change.';
    return h + buttons('btn-rw-save', 'btn-rw-cancel', what) + '</form></div>';
  }
  function readRow(form, table) {
    const out = {};
    for (const n of L().LISTS[table].typed) { const el = form.querySelector('[name="' + n + '"]'); if (el) { out[n] = el.value; } }
    return out;
  }

  /* listGrid(table, columns, rows, editable): the grid with Edit and Remove on every row, and Add a row under it, when editable */
  function listGrid(table, columns, rows, editable) {
    const id = L().LISTS[table].id;
    if (!editable) { return R.grid(columns, rows); }
    const cols = columns.concat([['', '__btn']]);
    const cell = (r, f) => (f === '__btn' ? '<button class="btn-row-edit" data-table="' + esc(table) + '" data-key="' + esc(r[id]) + '">Edit</button> ' +
      '<button class="btn-row-remove" data-table="' + esc(table) + '" data-key="' + esc(r[id]) + '">Remove</button>' : R.lines(r[f]));
    return R.grid(cols, rows, cell, 'list-grid') + '<p class="list-add"><button class="btn-row-add" data-table="' + esc(table) + '">Add a row</button></p><div class="row-slot" data-table="' + esc(table) + '"></div>';
  }

  return { headerForm, readHeader, rowForm, readRow, listGrid };
})();
