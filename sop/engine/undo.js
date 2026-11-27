/* SOP Builder logic piece for Undo my last change (build 70, spec/example_job1_70.md part 3; plan v2.3 section 4.3; Vishal 2026-11-27:
   "Undo of the last change from History, one click, the History row stays: yes"). undoPlan reads History: the last change of a name on
   an SOP, whether it can be undone, and the old values typed as each field is. Pure: engine/main_undo.js writes the undo through Edit
   step or Edit section. Classic script (global ENGINE_UNDO); module in Node. Answer key: tests/golden42.js. */
const ENGINE_UNDO = (function () {
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const SC = (typeof ENGINE_SECTIONS !== 'undefined') ? ENGINE_SECTIONS : require('./sections.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  function fail(msg) { throw new Error('engine.undoPlan: ' + msg); }
  const empty = v => v === null || v === undefined || String(v).trim() === '';
  const unique = list => list.filter((x, i) => list.indexOf(x) === i);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* the section form's names (ui/render_flow_forms.js) */
  const SEC_LABEL = { name: 'Name', name_gu: 'Gujarati name', needs_note: 'Needs note', ends_with: 'Ends with', max_wait: 'Max wait', restart_step: 'Restart step',
    manpower: 'Manpower', skilled: 'Skilled', helper: 'Helper', est_min: 'Est min', needs_sections: 'Needs sections', needs_sops: 'Needs SOPs',
    needs_setup: 'Set-up this shift', wait_after: 'Wait after section', wait_min: 'Wait minutes', any_time_steps: 'Any time steps' };
  /* the rows an edit adds besides its own (engine/main.js afterChange, main_flow.js sopChanged): they go with it and are not undone */
  const SIDE = { sop_revisions: ['status', 'checked_date', 'approved_date'], sops: ['edited_in', 'status'] };
  const has = (table, field) => !!TYPESX.tables[table] && TYPESX.tables[table].fields.some(f => f.name === field);

  /* whenOf(at) → "27 Nov 14:05" */
  function whenOf(at) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(at || ''));
    return m ? Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[4] + ':' + m[5] : String(at);
  }
  /* typed(table, field, text): a History text back in the field's type (the reverse of edit.js asText) */
  function typed(table, field, text) {
    if (text === null || text === undefined) { return null; }
    const f = TYPESX.tables[table].fields.find(x => x.name === field);
    const parts = () => String(text).split(' | ').map(x => x.trim()).filter(x => x !== '');
    switch (f.type) {
      case 'int': case 'number': return /^-?\d+(\.\d+)?$/.test(String(text).trim()) ? Number(text) : text;
      case 'bool': return text === 'Y' ? true : (text === 'N' ? false : text);
      case 'list_text': return parts();
      case 'list_int': return parts().map(x => (/^-?\d+$/.test(x) ? Number(x) : x));
      default: return text;
    }
  }
  /* kindOf(historyRow) → { main } (a field of a step or a section), { side } (a row an edit adds) or { what } (another kind of change) */
  function kindOf(h) {
    const tb = h.table, f = h.field;
    if (tb === 'steps') {
      if (f === 'row') { return { what: 'a step added, deleted, clubbed or split' }; }
      if (E.FIXED.indexOf(f) >= 0) { return { what: 'a step moved' }; }
      return has(tb, f) ? { main: true } : { what: 'a field that is not in the data layout now (' + f + ')' };
    }
    if (tb === 'sections') {
      if (f === 'row' || (has(tb, f) && SC.EDITABLE.indexOf(f) < 0)) { return { what: 'a section added, deleted or moved' }; }
      return has(tb, f) ? { main: true } : { what: 'a field that is not in the data layout now (' + f + ')' };
    }
    if (SIDE[tb] && SIDE[tb].indexOf(f) >= 0) { return { side: true }; }
    if (tb === 'sops' && f === 'row') { return { what: 'an SOP or a copy added' }; }
    if (tb === 'sops' || tb === 'sop_revisions') { return { what: 'the header or a sign-off' }; }
    if (tb === 'chart_notes') { return { what: 'a note' }; }
    if (tb === 'values_needed') { return { what: 'a Values Needed row' }; }
    return { what: 'a change of the ' + String(tb).replace(/_/g, ' ') + ' list' };
  }

  /* undoPlan(tables, sopId, who) → { can, why, label, when, reason, undo_reason, target }: the last change of this name on this SOP is
     the History rows with the time and the reason of the newest of them; it can be undone when it changed fields of one step or of one
     section of the current revision, each still holding the value the change wrote. target = { table: 'steps', key, rev, fields,
     changes } or { table: 'sections', section, rev, fields, changes }, changes = the old values typed */
  function undoPlan(tables, sopId, who) {
    if (empty(who)) { fail('no name'); }
    const sop = SEL.sopOf(tables, sopId);
    const mine = (tables.history || []).filter(h => h.who === who && h.sop_id === sopId);
    if (!mine.length) { return { can: false, why: 'No change of yours on this SOP to undo.', label: null, when: null, reason: null, undo_reason: null, target: null }; }
    const last = mine.reduce((a, b) => (Number(b.hist_id) > Number(a.hist_id) ? b : a));
    const group = mine.filter(h => h.at === last.at && h.reason === last.reason).sort((a, b) => Number(a.hist_id) - Number(b.hist_id));
    const when = whenOf(last.at), reason = last.reason === undefined ? null : last.reason;
    const no = why => ({ can: false, why: why, label: null, when: when, reason: reason, undo_reason: null, target: null });
    const kind = what => no('Undo works for a change of one step or one section. Your last change here (' + when + ') was ' + what + '.');
    const kinds = group.map(kindOf);
    const other = kinds.find(k => k.what);
    if (other) { return kind(other.what); }
    const main = group.filter((h, i) => kinds[i].main);
    if (!main.length) { return kind('the header or a sign-off'); }
    const tbls = unique(main.map(h => h.table)), ids = unique(main.map(h => h.row_id));
    if (tbls.length > 1) { return kind('steps and sections together'); }
    if (ids.length > 1) { return kind(tbls[0] === 'steps' ? 'more than one step' : 'more than one section'); }
    const h0 = main[0], table = tbls[0];
    if (h0.rev !== sop.current_rev) { return no('Your last change here (' + when + ') was on ' + h0.rev + '; this SOP is now on ' + (sop.current_rev || 'no revision') + '.'); }
    let row, head, labelOf, section = null;
    if (table === 'steps') {
      row = tables.steps.find(s => s.sop_id === sopId && s.rev === h0.rev && s.key === h0.row_id);
      if (!row) { return no('Step ' + h0.row_id + ' is not in ' + h0.rev + ' now.'); }
      head = 'Step ' + row.step_no;
      labelOf = f => E.LABEL[f] || f;
    } else {
      section = Number(String(h0.row_id).split(' ').pop());
      row = tables.sections.find(s => s.sop_id === sopId && s.rev === h0.rev && s.section === section);
      if (!row) { return no('Section ' + section + ' is not in ' + h0.rev + ' now.'); }
      head = 'Section ' + section;
      labelOf = f => SEC_LABEL[f] || f;
    }
    const fields = unique(main.map(h => h.field));
    for (const f of fields) {
      const wrote = main.filter(h => h.field === f).slice(-1)[0].new_value;
      if (E.asText(row[f]) !== (wrote === undefined ? null : wrote)) { return no(head + ' · ' + labelOf(f) + ' was changed again after your change of ' + when + '.'); }
    }
    const changes = {};
    for (const f of fields) { changes[f] = typed(table, f, main.find(h => h.field === f).old_value); }
    const target = table === 'steps' ? { table: 'steps', key: h0.row_id, rev: h0.rev, fields: fields, changes: changes }
      : { table: 'sections', section: section, rev: h0.rev, fields: fields, changes: changes };
    return { can: true, why: null, label: head + ' · ' + fields.map(labelOf).join(', '), when: when, reason: reason,
      undo_reason: 'Undo of the change of ' + when + (empty(reason) ? '' : ': ' + reason), target: target };
  }

  return { undoPlan };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_UNDO;
