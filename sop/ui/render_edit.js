/* SOP Builder screen builder for the step edit form (example.md part 7)
   and the editor of one row of the step card (example_flow.md part 20,
   build 35): every input with a short note and a worked example under it,
   from the contract (schema/types.js note and example). Red refusal lines
   go under the input they name. HTML from data only. Classic script
   (global RENDER_EDIT). */
const RENDER_EDIT = (function () {
  const R = RENDER;
  const esc = R.esc;
  /* fields the editor types, in form order; the rest are shown, not typed */
  const TYPED = ['step_no', 'step_type', 'action', 'action_gu', 'why', 'warning', 'tool', 'gauge_id', 'material', 'min', 'max', 'unit', 'limit_status',
    'check', 'if_fail', 'skip_if', 'repeat_count', 'photo_ref', 'photo_required', 'est_min', 'remark'];
  const SHOWN = { seq: 'set by the Builder, cannot type', section: 'the step stays in its section; to move it, retire it and add it again',
    hold: 'N, or the hold number given by the Builder in order (H1, H2)', class: 'from Step type', signed_by: 'from Step type' };
  const WIDE = ['action', 'action_gu', 'why', 'warning', 'check', 'if_fail', 'skip_if', 'remark', 'tool', 'material'];
  /* notes in plain words where the contract's note is about the import (build 33, example_new_sop.md part 11) */
  const NOTE = { action_gu: ['The step in Gujarati, with the Gujarati words of the Glossary. A draft ends with (draft) until Divyal checks it. Empty: the floor copy shows English only.', 'પાઇપના છેડા સાફ કરો'] };

  function def(fieldDefs, name) { return fieldDefs.find(f => f.name === name); }
  /* noteOf(name, d): the note and the example under an input */
  function noteOf(name, d) {
    const note = NOTE[name] ? NOTE[name][0] : d.note, ex = NOTE[name] ? NOTE[name][1] : d.example;
    return '<div class="note">' + esc(note) + ' Example: ' + esc(ex) + (/[.!?)]$/.test(ex) ? '' : '.') + '</div>';
  }
  function val(v) { return v === null || v === undefined ? '' : (Array.isArray(v) ? v.join(' | ') : String(v)); }
  function labelOf(name) { return ENGINE_EDIT.LABEL[name] || name; }

  function input(step, name, d, sets, gauges) {
    const v = step[name];
    const id = 'f-' + name;
    if (d.type === 'set') {
      const opts = (sets[d.set] || []).map(o => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
      if (name === 'step_type') { return (sets[d.set] || []).map(o => '<label class="radio"><input type="radio" name="' + id + '" value="' + esc(o) + '"' + (o === v ? ' checked' : '') + '> ' + esc(o) + '</label>').join(' '); }
      return '<select id="' + id + '" name="' + name + '">' + opts + '</select>';
    }
    if (d.type === 'bool') {
      return '<select id="' + id + '" name="' + name + '"><option value="N"' + (v === false ? ' selected' : '') + '>N</option><option value="Y"' + (v === true ? ' selected' : '') + '>Y</option></select>';
    }
    if (name === 'gauge_id') {
      let opts = '<option value=""' + (v ? '' : ' selected') + '>(none)</option>';
      for (const g of gauges) { opts += '<option value="' + esc(g.gauge_id) + '"' + (g.gauge_id === v ? ' selected' : '') + '>' + esc(g.gauge_id) + ' = ' + esc(g.name) + '</option>'; }
      return '<select id="' + id + '" name="' + name + '">' + opts + '</select>';
    }
    if (WIDE.indexOf(name) >= 0) {
      const rows = (name === 'action' || name === 'check' || name === 'if_fail' || name === 'why') ? 3 : 2;
      return '<textarea id="' + id + '" name="' + name + '" rows="' + rows + '"' + (name === 'action_gu' ? ' lang="gu" class="gu-in"' : '') + '>' + esc(val(v)) + '</textarea>';
    }
    return '<input id="' + id + '" name="' + name + '" value="' + esc(val(v)) + '"' + (d.type === 'number' || d.type === 'int' ? ' size="8"' : ' size="40"') + '>';
  }

  /* editForm(step, fieldDefs, sets, gauges, added): fieldDefs = TYPES.tables.steps.fields; added = { key_rule, kind, renumbered } for a new row */
  function editForm(step, fieldDefs, sets, gauges, added) {
    let h = '<div class="card edit-card" id="edit-' + esc(step.key) + '"><h3>' + (added ? (added.kind === 'sub' ? 'New sub-step ' : 'New step ') : 'Edit step ') + esc(step.step_no) + ' <span class="muted">' + esc(step.sop_id) + ' ' + esc(step.rev) +
      ' · Key ' + esc(step.key) + (added ? ' (new key: ' + esc(added.key_rule) + ')' : ' (cannot change)') + '</span></h3>' +
      (added && added.renumbered && added.renumbered.length ? '<p class="note">On save these steps get a new number: ' + added.renumbered.map(m => esc(m.old) + ' becomes ' + esc(m.new)).join(', ') + '. Keys do not change.</p>' : '') +
      '<form id="edit-form" onsubmit="return false">';
    for (const name of ['seq', 'section', 'hold', 'class', 'signed_by']) {
      h += '<div class="f"><label>' + esc(labelOf(name)) + '</label><div class="v fixed">' + esc(val(step[name])) + ' <span class="muted">(' + esc(SHOWN[name]) + ')</span></div></div>';
    }
    for (const name of TYPED) {
      const d = def(fieldDefs, name);
      if (!d) { throw new Error('ui editForm: the contract has no field "' + name + '"'); }
      h += '<div class="f"><label for="f-' + name + '">' + esc(labelOf(name)) + '</label><div class="v">' + input(step, name, d, sets, gauges) +
        noteOf(name, d) + '<div class="refusal" data-for="' + name + '"></div></div></div>';
    }
    h += '<div class="f"><label></label><div class="v"><button id="btn-save" type="button">Save</button> <button id="btn-cancel" type="button">Cancel</button>' +
      '<div class="note">Save checks the form, then asks the reason for the change.</div><div class="refusal" data-for="form"></div></div></div>';
    return h + '</form></div>';
  }

  /* fieldForm(step, fields, fieldDefs, sets, gauges, row): the editor of one row of the step card (part 20): the inputs of that row's
     fields (ENGINE_MENUS.cardFields), each with its note and example, then Save, Cancel and Edit the whole step. A field gets its own
     label when the row has more than one, or when its name is not the row's (Hold edits Step type). */
  const ROW_NOTE = { Hold: 'Step type Hold makes the step a hold; the Builder gives its number (H1, H2) in order.', Type: 'Class and Signed by follow the Step type.' };
  function fieldForm(step, fields, fieldDefs, sets, gauges, row) {
    let h = '<div class="field-editor" id="field-editor" data-key="' + esc(step.key) + '" data-row="' + esc(row) + '"><form id="field-form" onsubmit="return false">';
    for (const name of fields) {
      const d = def(fieldDefs, name);
      if (!d || TYPED.indexOf(name) < 0) { throw new Error('ui fieldForm: "' + name + '" is not a typed field of the step'); }
      const label = fields.length > 1 || labelOf(name) !== row ? '<label for="f-' + name + '">' + esc(labelOf(name)) + '</label>' : '';
      h += '<div class="ff">' + label + input(step, name, d, sets, gauges) + noteOf(name, d) + '<div class="refusal" data-for="' + name + '"></div></div>';
    }
    if (ROW_NOTE[row]) { h += '<div class="note">' + esc(ROW_NOTE[row]) + '</div>'; }
    h += '<div class="ff-buttons"><button id="btn-fd-save" type="button">Save</button> <button id="btn-fd-cancel" type="button">Cancel</button> ' +
      '<button id="btn-fd-full" type="button">Edit the whole step</button><div class="note">Save checks the row, then asks the reason for the change.</div>' +
      '<div class="refusal" data-for="form"></div></div>';
    return h + '</form></div>';
  }

  /* readFields(form, fields): the typed values of those fields by name; bool fields as Y/N text, lists as text with | */
  function readFields(form, fields) {
    const out = {};
    for (const name of fields) {
      if (name === 'step_type') { const r = form.querySelector('input[name="f-step_type"]:checked'); out.step_type = r ? r.value : ''; continue; }
      const el = form.querySelector('[name="' + name + '"]');
      out[name] = el ? el.value : '';
    }
    return out;
  }
  /* readForm(form): every typed value of the edit form */
  function readForm(form) { return readFields(form, TYPED); }
  /* fillForm(form, typed): values typed in a row editor put into the edit form (Edit the whole step, part 20.2) */
  function fillForm(form, typed) {
    for (const name in typed) {
      if (name === 'step_type') {
        for (const r of form.querySelectorAll('input[name="f-step_type"]')) { r.checked = r.value === typed[name]; }
        continue;
      }
      const el = form.querySelector('[name="' + name + '"]');
      if (el) { el.value = typed[name]; }
    }
  }

  /* showRefusals(form, refusals): a red line under each named input; clears the others */
  function showRefusals(form, refusals) {
    for (const el of form.querySelectorAll('.refusal')) { el.textContent = ''; }
    for (const r of refusals) {
      const el = form.querySelector('.refusal[data-for="' + r.field + '"]') || form.querySelector('.refusal[data-for="form"]');
      el.textContent = (el.textContent ? el.textContent + ' · ' : '') + r.message;
    }
  }

  return { editForm, readForm, fieldForm, readFields, fillForm, showRefusals, TYPED };
})();
