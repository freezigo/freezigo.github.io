/* SOP Builder logic pieces for the screen's small rules (example_flow.md
   parts 17, 18 and 20, spec/example_look.md part 5): what a right-click
   menu on a chart or on a row of the step card shows (menuFor), the
   fields a card row edits (cardFields), which tabs sit on the SOP line (topTabs), a
   pin turned on or off (pinToggle), the last reasons of the Reason pop-up
   (keepReason), whether the pop-up asks at all (reasonAsked, build 27; draft mode, build 36)
   and the widths of the Flow columns (colWidths). Build 70: a double-click
   on a card row (rowDouble) and the sign line (signLine). Pure: the screens
   draw what these return. Classic script (global ENGINE_MENUS); module in
   Node. Answer key: tests/golden8.js, golden9.js, golden10.js, golden16.js and golden42.js. */
const ENGINE_MENUS = (function () {
  const I = (act, label) => ({ act: act, label: label });
  const DEFAULT_PINS = ['sections', 'flow', 'vn', 'release'];
  const TITLE_CUT = 50;
  function oneLine(text) {
    const s = String(text || '').split('\n')[0].trim();
    return s.length > TITLE_CUT ? s.slice(0, TITLE_CUT).replace(/\s+$/, '') + '…' : s;
  }
  function fail(msg) { throw new Error('engine.menuFor: ' + msg); }
  const PR = () => ((typeof ENGINE_PROCESS !== 'undefined') ? ENGINE_PROCESS : require('./process.js'));

  function titleOf(t) {
    switch (t.kind) {
      case 'section': return 'Section ' + t.id + ' ' + t.name;
      case 'input': return 'Input ' + t.id;
      case 'io': return t.id === 'input' ? 'Input' : 'Output';
      case 'step': return 'Step ' + t.step_no + ' ' + oneLine(t.name);
      case 'arrow': {
        const p = String(t.id).split('>');
        const word = x => (x === 'input' ? 'Input' : (x === 'output' ? 'Output' : x));
        return 'Arrow ' + (t.chart === 'steps' ? t.from_no + ' → ' + t.to_no : word(p[0]) + ' → ' + word(p[1]));
      }
      case 'note': return 'Note ' + t.id;
      case 'empty': return t.chart === 'steps' ? 'Steps of section ' + t.section : 'Sections chart';
      default: return fail('unknown kind "' + t.kind + '"');
    }
  }
  function itemsOf(t) {
    switch (t.kind) {
      /* build 40 (example_renumber.md part 8): short names, Delete for Retire, Renumber; a section moves by a drag */
      case 'section': return [I('edit-section', 'Edit section'), I('add-after', 'Add section'), I('retire-section', 'Delete section'), I('renumber', 'Renumber the steps of section ' + t.id),
        I('connect', 'Connect to…'), I('note', 'Add a note')];
      case 'input': return [I('connect', 'Connect to…'), I('note', 'Add a note')];
      case 'io': return [I('note', 'Add a note')];
      case 'step': return [I('edit-step', 'Edit step'), I('add-step', 'Add step'), I('add-sub', 'Add sub-step')]
        .concat(t.sop_type === 'Process' ? [] : [I('insert-proc', 'Insert a process SOP after this step')])
        .concat([I('up', 'Move up ▲'), I('down', 'Move down ▼'), I('note', 'Add a note'), I('retire-step', String(t.step_no).split('.').length > 2 ? 'Delete sub-step' : 'Delete step')]);
      case 'arrow': return t.needs === true ? [I('remove-arrow', 'Remove this arrow'), I('note', 'Add a note')] : [I('note', 'Add a note')];
      case 'note': {
        /* part 18.3: Minimise or Show in full; Unpin for a pinned open note; Delete note */
        const fold = t.min === true ? I('show', 'Show in full') : I('min', 'Minimise');
        if (t.status === 'Done') { return [I('reopen', 'Open again'), fold, I('delete-note', 'Delete note')]; }
        return [I('edit-note', 'Edit note'), I('done', 'Done'), fold].concat(t.pinned === true ? [I('unpin', 'Unpin')] : []).concat([I('delete-note', 'Delete note')]);
      }
      case 'empty': return t.chart === 'steps' ? [I('note-here', 'Add a note here')] : [I('add-end', 'Add a section at the end'), I('renumber-all', 'Renumber all sections'), I('note-here', 'Add a note here')];
      default: return fail('unknown kind "' + t.kind + '"');
    }
  }
  /* ---- the step card (part 20, build 35): a right-click on one of its rows edits only that row's fields ---- */
  /* the rows of the card (part 19.2), its title line (Action) and its Gujarati line, each with the step fields it edits in the edit
     form's order; Hold edits Step type (the Builder gives the hold number). A row with no fields is not typed on the step: its line
     says where it changes. */
  const CARD_ROWS = { 'Action': ['action'], 'Gujarati line': ['action_gu'], 'Warning': ['warning'], 'Check': ['check'],
    'Target': ['min', 'max', 'unit', 'limit_status'], 'If fail': ['if_fail'], 'Type': ['step_type'], 'Hold': ['step_type'], 'Tool': ['tool', 'gauge_id'],
    'Material': ['material'], 'Skip if': ['skip_if'], 'Repeat and time': ['repeat_count', 'est_min'], 'Photo required': ['photo_required'],
    'Photos and pictures': ['photo_ref'], 'Remark': ['remark'], 'Why': ['why'], 'Values Needed on this step': [], 'Defects found at this step': [], 'Process SOP': [] };
  const NOT_TYPED = { 'Values Needed on this step': 'Give these values on the Values Needed tab.',
    'Defects found at this step': 'The Defects list comes with the master build (Defects CSV); the Builder does not change it.',
    'Process SOP': 'Insert a process SOP sets this link; it cannot be typed.' };
  const isRow = row => Object.prototype.hasOwnProperty.call(CARD_ROWS, row);
  /* cardFields(row) → the fields the row's editor shows; [] for a row not typed on the step */
  function cardFields(row) {
    if (!isRow(row)) { throw new Error('engine.cardFields: unknown card row "' + row + '"'); }
    return CARD_ROWS[row].slice();
  }
  /* fieldMenu(t, lockText): t = { kind: 'field', step_no, row, link_mode, link_sop }. A locked revision: the lock line, no items. A step that
     follows a process SOP as Standard: Edit the whole step (it opens Make it a Revised copy) and the Standard line. A row not typed: Edit
     the whole step and the line saying where it changes. Else Edit <row>, then Edit the whole step. */
  function fieldMenu(t, lockText) {
    if (!isRow(t.row)) { fail('unknown card row "' + t.row + '"'); }
    const title = 'Step ' + t.step_no + ' · ' + t.row;
    if (lockText) { return { title: title, items: [], lock: lockText, line: null }; }
    const whole = I('edit-step', 'Edit the whole step');
    if (t.link_mode === 'Standard') { return { title: title, items: [whole], lock: null, line: PR().lockedText(t) }; }
    if (!CARD_ROWS[t.row].length) { return { title: title, items: [whole], lock: null, line: NOT_TYPED[t.row] }; }
    return { title: title, items: [I('edit-field', 'Edit ' + t.row), whole], lock: null, line: null };
  }

  /* rowDouble(target, lockText) → 'edit-field' when a double-click on the row opens its editor (the row's menu has Edit <row>), else null
     (a row not typed on the step, a Standard step, a locked revision): build 70, spec/example_job1_70.md part 2 */
  function rowDouble(t, lockText) {
    return fieldMenu(t, lockText).items.some(i => i.act === 'edit-field') ? 'edit-field' : null;
  }

  /* signLine(name, date) → "Divyal · 27 Nov": the name at the top and the day, one line in place of a typed name and date (build 70,
     plan rule 3); date = YYYY-MM-DD or a time that starts with it */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function signLine(name, date) {
    if (name === null || name === undefined || String(name).trim() === '') { throw new Error('engine.signLine: no name'); }
    const m = /^(\d{4})-(\d{2})-(\d{2})(T|$)/.exec(String(date || ''));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) { throw new Error('engine.signLine: the date "' + date + '" is not YYYY-MM-DD'); }
    return String(name).trim() + ' · ' + Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1];
  }

  /* pickedMenu(t, lockText): t = { kind: 'picked', chart: 'steps', nos } (2 or more steps picked with Ctrl+click, part 21.2): Club them,
     or clear the picks; a locked revision: the lock line */
  function pickedMenu(t, lockText) {
    if (!Array.isArray(t.nos) || t.nos.length < 2) { fail('a picked menu needs 2 or more steps'); }
    const title = 'Picked: ' + t.nos.join(', ');
    if (lockText) { return { title: title, items: [], lock: lockText, line: null }; }
    return { title: title, items: [I('club', 'Club the ' + t.nos.length + ' picked steps into one'), I('unpick', 'Clear the picked steps')], lock: null, line: null };
  }

  /* menuFor(target, lockText, readOnly) → { title, items: [{ act, label }], lock, line }; lockText = the Released line (build 50: or the
     line of the rights, the good version or someone else's copy), or null when the revision can change; readOnly = someone else's copy
     (build 50: its notes keep no item either); line = a line that says why an item is missing (the step card only, else null).
     A locked revision keeps only "Section fields" on a section box, and Done or Open again on a note (build 31: the notes a new revision
     of a process SOP writes on a Released main SOP are confirmed there); any other menu shows the lock line and no items. */
  function menuFor(target, lockText, readOnly) {
    if (!target || !target.kind) { fail('no target'); }
    if (target.kind === 'field') { return fieldMenu(target, lockText); }
    if (target.kind === 'picked') { return pickedMenu(target, lockText); }
    const title = titleOf(target);
    if (lockText) {
      if (target.kind === 'section') { return { title: title, items: [I('view-section', 'Section fields')], lock: null, line: null }; }
      if (target.kind === 'note' && !readOnly && (target.status === 'Open' || target.status === 'Done')) {
        return { title: title, items: [target.status === 'Done' ? I('reopen', 'Open again') : I('done', 'Done')], lock: lockText, line: null };
      }
      return { title: title, items: [], lock: lockText, line: null };
    }
    return { title: title, items: itemsOf(target), lock: null, line: null };
  }

  /* topTabs(tabIds, pinned, active) → [{ id, pinned, active }]: the pinned tabs in tab order, then the open tab when it is not pinned;
     pinned = null when nothing is kept yet (the default pins) */
  function topTabs(tabIds, pinned, active) {
    const pins = Array.isArray(pinned) ? pinned : DEFAULT_PINS;
    const out = tabIds.filter(id => pins.indexOf(id) >= 0).map(id => ({ id: id, pinned: true, active: id === active }));
    if (active && pins.indexOf(active) < 0 && tabIds.indexOf(active) >= 0) { out.push({ id: active, pinned: false, active: true }); }
    return out;
  }
  /* pinToggle(tabIds, pinned, id) → the new pinned list, in tab order */
  function pinToggle(tabIds, pinned, id) {
    const pins = (Array.isArray(pinned) ? pinned : DEFAULT_PINS).filter(p => tabIds.indexOf(p) >= 0);
    const next = pins.indexOf(id) >= 0 ? pins.filter(p => p !== id) : pins.concat([id]);
    return tabIds.filter(t => next.indexOf(t) >= 0);
  }

  /* keepReason(list, reason) → the last three reasons, newest first, no repeats; an empty reason changes nothing (part 18.4) */
  const REASONS = 3;
  function keepReason(list, reason) {
    const old = Array.isArray(list) ? list.slice() : [];
    const r = String(reason === null || reason === undefined ? '' : reason).trim();
    if (!r) { return old; }
    return [r].concat(old.filter(x => x !== r)).slice(0, REASONS);
  }

  /* reasonAsked(revision) → false while the revision is in draft mode: Draft, and nobody has signed Checked or Approved (an edit after
     a check sends it back to Draft but keeps the names, so the question stays). Build 27 kept this for the first draft of a new SOP
     (example_new_sop.md part 8); build 36 widens it to every revision, so a New revision of a released SOP is a draft too
     (example_release.md part 8.1, Samrat 2026-11-13). The Builder then writes draftReason as the reason itself. True otherwise, and
     with no revision (a new SOP being started). */
  const signedName = v => v !== null && v !== undefined && String(v).trim() !== '';
  function reasonAsked(revision) {
    if (!revision) { return true; }
    return !(revision.status === 'Draft' && !signedName(revision.checked_by) && !signedName(revision.approved_by));
  }
  /* draftReason(revision, sop) → the History reason of a change in draft mode: "First draft" for Rev 01, "Draft Rev 02" after,
     "Copy Club trial" in a copy (build 39: sop given with copy_of and copy_name) */
  function draftReason(revision, sop) {
    if (!revision || !revision.rev) { throw new Error('engine.draftReason: no revision'); }
    if (sop && sop.copy_of !== null && sop.copy_of !== undefined && String(sop.copy_of).trim() !== '') { return 'Copy ' + sop.copy_name; }
    return revision.rev === 'Rev 01' ? 'First draft' : 'Draft ' + revision.rev;
  }

  /* colWidths(total, want, gap, moving) → { b, c } (part 18.2): the kept widths of the sections column (b) and the steps column (c),
     null = the column's own width. Least widths: b 200, c 220, the details column 280; gap = the room of the lines and gaps.
     The column not being dragged (moving 'b' or 'c'; null = b first) keeps its width first; the least widths win over the room. */
  const LEAST = { b: 200, c: 220, d: 280 };
  function colWidths(total, want, gap, moving) {
    const w = { b: want && want.b !== undefined ? want.b : null, c: want && want.c !== undefined ? want.c : null };
    const room = (other, otherLeast) => total - gap - (other === null ? otherLeast : other) - LEAST.d;
    const fit = (v, least, max) => (v === null ? null : Math.round(Math.max(least, Math.min(v, max))));
    if (moving === 'b') {
      const c = fit(w.c, LEAST.c, room(null, LEAST.b));
      return { b: fit(w.b, LEAST.b, room(c, LEAST.c)), c: c };
    }
    const b = fit(w.b, LEAST.b, room(null, LEAST.c));
    return { b: b, c: fit(w.c, LEAST.c, room(b, LEAST.b)) };
  }

  return { menuFor, cardFields, rowDouble, signLine, topTabs, pinToggle, keepReason, reasonAsked, draftReason, colWidths, DEFAULT_PINS, LEAST };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_MENUS;
