/* SOP Builder screen builders for the forms of the Flow tab
   (example_flow.md parts 5, 7 and 14): the section form with a note and
   an example per input, the add-section, retire-section, retire-step and
   note forms. HTML from data only. Classic script (global
   RENDER_FLOW_FORMS); split from ui/render_flow.js on 2026-11-07 (forms
   are one job, the charts another). */
const RENDER_FLOW_FORMS = (function () {
  const R = RENDER;
  const esc = R.esc, show = R.show;
  const val = v => (v === null || v === undefined ? '' : (Array.isArray(v) ? v.join(', ') : String(v)));
  const LABEL = { name: 'Name', name_gu: 'Gujarati name', needs_sections: 'Needs sections', needs_sops: 'Needs SOPs', needs_setup: 'Set-up this shift',
    wait_after: 'Wait after section', wait_min: 'Wait minutes', any_time_steps: 'Any time steps', ends_with: 'Ends with', max_wait: 'Max wait',
    restart_step: 'Restart step', manpower: 'Manpower', skilled: 'Skilled', helper: 'Helper', est_min: 'Est min', needs_note: 'Needs note', source_ref: 'Chart ref' };
  const TYPED = ['name', 'name_gu', 'needs_sops', 'needs_setup', 'wait_after', 'wait_min', 'any_time_steps', 'ends_with', 'max_wait', 'restart_step', 'manpower', 'skilled', 'helper', 'est_min', 'needs_note'];
  const WIDE = ['ends_with', 'max_wait', 'manpower', 'needs_note'];

  /* sectionForm(sec, fieldDefs, locked): example_flow.md part 5; opens in the right pane (part 15) */
  function input(sec, name, d) {
    const v = sec[name], id = 'sf-' + name;
    if (d.type === 'bool') {
      return ['', 'Y', 'N'].map(o => '<label class="radio"><input type="radio" name="' + id + '" value="' + o + '"' + ((o === '' && (v === null || v === undefined)) || (o === 'Y' && v === true) || (o === 'N' && v === false) ? ' checked' : '') + '> ' + (o === '' ? 'no value' : o) + '</label>').join(' ');
    }
    if (WIDE.indexOf(name) >= 0) { return '<textarea id="' + id + '" name="' + name + '" rows="2">' + esc(val(v)) + '</textarea>'; }
    return '<input id="' + id + '" name="' + name + '" value="' + esc(val(v)) + '"' + (d.type === 'int' || d.type === 'number' ? ' size="8"' : ' size="40"') + '>';
  }
  function sectionForm(sec, fieldDefs, locked) {
    const def = n => fieldDefs.find(f => f.name === n);
    let h = '<div class="card edit-card section-form" id="section-form"><h3>Section ' + esc(sec.section) + ' <span class="muted">' + esc(sec.sop_id) + ' ' + esc(sec.rev) + (locked ? ' · read-only' : '') + '</span></h3><form id="sec-form" onsubmit="return false">';
    h += '<div class="f"><label>Section</label><div class="v fixed">' + esc(sec.section) + ' <span class="muted">(set by the Builder; Earlier, Later or a drag changes it)</span></div></div>';
    h += '<div class="f"><label>' + LABEL.needs_sections + '</label><div class="v fixed">' + (Array.isArray(sec.needs_sections) && sec.needs_sections.length ? esc(sec.needs_sections.join(', ')) : (sec.needs_sections === null || sec.needs_sections === undefined ? '<span class="empty">(not given)</span>' : '<span class="empty">(none)</span>')) +
      ' <span class="muted">(from the arrows on the chart; draw or remove an arrow to change)</span><div class="note">' + esc(def('needs_sections').note) + ' Example: ' + esc(def('needs_sections').example) + '.</div></div></div>';
    for (const name of TYPED) {
      const d = def(name);
      /* Needs SOPs: a search list under it (build 30, example_process_sop.md part 5): type part of an ID or title, click to add */
      const find = name === 'needs_sops' && !locked ? '<div class="find-box"><input id="sf-find" size="30" autocomplete="off" spellcheck="false" placeholder="find an SOP: type part of its ID or title">' +
        '<div class="find-list" id="sf-find-list"></div></div>' : '';
      /* the Gujarati name (build 33): a note in plain words; the contract's note is about the import */
      const gu = name === 'name_gu';
      const note = gu ? 'The section name in Gujarati. A draft ends with (draft) until Divyal checks it. Empty: the floor copy shows English only.' : d.note;
      const ex = gu ? 'લીક ટેસ્ટ અને રિપેર' : d.example;
      h += '<div class="f"><label for="sf-' + name + '">' + esc(LABEL[name]) + '</label><div class="v">' + input(sec, name, d) + find +
        '<div class="note">' + esc(note) + (find ? ' Type part of an SOP ID or title in the box under it, then click the SOP to add it.' : '') + ' Example: ' + esc(ex) + (/[.!?)]$/.test(ex) ? '' : '.') + '</div><div class="refusal" data-for="' + name + '"></div></div></div>';
    }
    h += '<div class="f"><label>' + LABEL.source_ref + '</label><div class="v fixed">' + show(sec.source_ref) + '<div class="note">' + esc(def('source_ref').note) + ' Example: ' + esc(def('source_ref').example) + '.</div></div></div>';
    if (!locked) {
      h += '<div class="f"><label></label><div class="v"><button id="btn-sec-save" type="button">Save</button> <button id="btn-sec-cancel" type="button">Cancel</button><div class="refusal" data-for="form"></div></div></div>';
    } else { h += '<div class="f"><label></label><div class="v"><button id="btn-sec-cancel" type="button">Close</button></div></div>'; }
    return h + '</form></div>';
  }
  function readSectionForm(form) {
    const out = {};
    for (const name of TYPED) {
      if (name === 'needs_setup') { const r = form.querySelector('input[name="sf-needs_setup"]:checked'); out.needs_setup = r ? r.value : ''; continue; }
      out[name] = form.querySelector('[name="' + name + '"]').value;
    }
    return out;
  }

  /* addSectionForm(after, last): last = the last section, null when the revision has none yet (its first section is 3) */
  function addSectionForm(after, last) {
    return '<div class="card edit-card" id="add-section-form"><h3>Add a section</h3><form onsubmit="return false">' +
      '<div class="f"><label for="as-name">Name</label><div class="v"><input id="as-name" size="40"><div class="note">Section name. Example: Leak test and repair.</div><div class="refusal" data-for="name"></div></div></div>' +
      '<div class="f"><label>After</label><div class="v fixed">' + (last === null ? 'none yet: this is section 3 (sections 1 and 2 are Safety and PPE, and Materials, tools and machines)' : after === null ? 'section ' + esc(last) + ' (the last)' : 'section ' + esc(after) + ' (the sections after it move down by one)') + '</div></div>' +
      '<div class="f"><label></label><div class="v"><button id="btn-as-add" type="button">Add</button> <button id="btn-as-cancel" type="button">Cancel</button><div class="refusal" data-for="form"></div></div></div></form></div>';
  }
  function retireSectionForm(sec, p) {
    /* build 40: Delete in the words (the Keys are kept as retired, never used again) */
    const what = 'This deletes ' + esc(p.rows) + ' rows (' + esc(p.steps) + ' steps, ' + esc(p.sub_steps) + ' sub-steps' + (p.keys.length ? '; keys ' + esc(p.keys[0]) + (p.keys.length > 1 ? ' to ' + esc(p.keys[p.keys.length - 1]) : '') : '') + ')' +
      (p.renumber_from.length ? ' and renumbers sections ' + esc(p.renumber_from.join(', ')) + ' as ' + esc(p.renumber_to.join(', ')) : '') + '. Their Keys are kept as retired and never used again.';
    return '<div class="card edit-card" id="retire-section-form"><h3>Delete section ' + esc(sec.section) + ' ' + esc(sec.name) + '</h3><p>' + what + '</p>' +
      (p.needed_by.length ? '<p class="refusal">Section ' + esc(p.needed_by[0]) + ' needs section ' + esc(sec.section) + '. Remove that arrow first.</p>' : '') +
      '<form onsubmit="return false"><div class="f"><label></label><div class="v"><button id="btn-rs-retire" type="button">Delete</button> <button id="btn-rs-cancel" type="button">Cancel</button><div class="refusal" data-for="form"></div></div></div></form></div>';
  }
  function retireStepForm(step) {
    const sub = String(step.step_no).split('.').length > 2;
    return '<div class="card edit-card" id="retire-step-form"><h3>Delete ' + (sub ? 'sub-step ' : 'step ') + esc(step.step_no) + ' <span class="muted">' + esc(step.key) + '</span></h3>' +
      '<p class="muted">The Key ' + esc(step.key) + ' is kept as retired and never used again. The numbers after it stay; Renumber closes the gap.</p>' +
      '<form onsubmit="return false"><div class="f"><label></label><div class="v"><button id="btn-rt-retire" type="button">Delete</button> <button id="btn-rt-cancel" type="button">Cancel</button><div class="refusal" data-for="form"></div></div></div></form></div>';
  }
  /* noteForm(pin, text): pin = { pin, pin_ref, label } */
  function noteForm(pin, text) {
    return '<div class="card edit-card note-form" id="note-form"><h3>' + (text === undefined ? 'New note' : 'Edit note') + '</h3><form onsubmit="return false">' +
      '<div class="f"><label for="nf-text">Note</label><div class="v"><textarea id="nf-text" rows="3">' + esc(text || '') + '</textarea><div class="note">One short note for the editors, 300 characters at most. The floor never sees it. Example: Ask Divyal: max repairs?</div><div class="refusal" data-for="text"></div></div></div>' +
      '<div class="f"><label>Pinned to</label><div class="v fixed">' + esc(pin.label) + '</div></div>' +
      '<div class="f"><label></label><div class="v"><button id="btn-nf-save" type="button">Save note</button> <button id="btn-nf-cancel" type="button">Cancel</button><div class="refusal" data-for="form"></div></div></div></form></div>';
  }

  return { sectionForm, readSectionForm, addSectionForm, retireSectionForm, retireStepForm, noteForm, TYPED, LABEL };
})();
