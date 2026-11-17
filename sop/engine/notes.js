/* SOP Builder logic pieces for notes on the charts (example_flow.md part
   14, and part 18.3 of build 23): checkNote, addNote, editNote, closeNote,
   reopenNote, deleteNote, moveNote, notesCount, carryNotes. Notes are talk
   between editors, not SOP content. A Deleted note keeps its row (contract
   1.3) and changes no more. Pure. Classic script (global ENGINE_NOTES);
   module in Node. Answer key: tests/golden4.js and tests/golden9.js. */
const ENGINE_NOTES = (function () {
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const SETSX = (typeof SETS !== 'undefined') ? SETS : require('../schema/sets.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = v => v === null || v === undefined || String(v).trim() === '';
  const isNum = v => typeof v === 'number' && isFinite(v);
  const MAX = 300;
  const r = (field, message) => ({ field: field, message: message });

  function textRefusals(text) {
    if (empty(text)) { return [r('text', 'Note is empty.')]; }
    const n = String(text).trim().length;
    return n > MAX ? [r('text', 'A note has ' + MAX + ' characters at most (this one has ' + n + ').')] : [];
  }

  /* checkNote(note, chartRefs) → refusals; chartRefs = { boxes: [..], arrows: [..] } of the chart the note is on */
  function checkNote(note, chartRefs) {
    const out = textRefusals(note.text);
    if (SETSX.note_chart.indexOf(note.chart) < 0) { out.push(r('chart', 'Chart must be one of: ' + SETSX.note_chart.join(', '))); }
    if (note.chart === 'steps' && !Number.isInteger(note.section)) { out.push(r('section', 'A note on a steps chart needs its section.')); }
    if (SETSX.note_pin.indexOf(note.pin) < 0) { out.push(r('pin', 'Pin must be one of: ' + SETSX.note_pin.join(', '))); return out; }
    if (note.pin === 'free') {
      if (!isNum(note.x) || !isNum(note.y)) { out.push(r('xy', 'A free note needs a place on the chart (x and y).')); }
    } else if (note.pin === 'box') {
      if ((chartRefs.boxes || []).indexOf(String(note.pin_ref)) < 0) { out.push(r('pin_ref', 'Box ' + note.pin_ref + ' is not on this chart.')); }
    } else if ((chartRefs.arrows || []).indexOf(String(note.pin_ref)) < 0) {
      out.push(r('pin_ref', 'Arrow ' + note.pin_ref + ' is not on this chart.'));
    }
    return out;
  }

  function hist(note, field, oldV, newV, ctx, after) {
    return E.historyRows({ table: 'chart_notes', row_id: note.note_id + ' ' + note.rev, sop_id: note.sop_id, rev: note.rev,
      old: { [field]: oldV }, new: { [field]: newV }, fields: [field], ctx: ctx, after: after || [] });
  }
  function where(n) {
    return n.pin === 'free' ? 'free, at ' + n.x + ', ' + n.y : n.pin + ' ' + n.pin_ref;
  }

  /* addNote(fields, chartRefs, ctx) → { note, history } or { refusals }; ctx.next_note_id from store.js */
  function addNote(fields, chartRefs, ctx) {
    E.checkCtx(ctx, 'addNote');
    if (!Number.isInteger(ctx.next_note_id)) { fail('addNote', 'ctx.next_note_id (the next note number) is missing'); }
    const refusals = checkNote(fields, chartRefs);
    if (refusals.length) { return { refusals: refusals }; }
    const free = fields.pin === 'free';
    const note = { note_id: ctx.next_note_id, sop_id: fields.sop_id, rev: fields.rev, chart: fields.chart,
      section: fields.chart === 'steps' ? fields.section : null, pin: fields.pin, pin_ref: free ? null : String(fields.pin_ref),
      x: free ? fields.x : null, y: free ? fields.y : null, text: String(fields.text).trim(), status: 'Open',
      written_by: ctx.who, written_at: ctx.now, closed_by: null, closed_at: null };
    return { note: note, history: hist(note, 'row', null, 'added: ✎ ' + note.note_id + ' ' + note.text + ' (' + where(note) + ')', ctx) };
  }

  const deleted = note => note.status === 'Deleted' ? [r('status', 'Note ' + note.note_id + ' is Deleted.')] : null;

  /* editNote(note, text, ctx) → { note, history } or { refusals } */
  function editNote(note, text, ctx) {
    E.checkCtx(ctx, 'editNote');
    if (deleted(note)) { return { refusals: deleted(note) }; }
    const refusals = textRefusals(text);
    if (refusals.length) { return { refusals: refusals }; }
    const t = String(text).trim();
    if (t === note.text) { return { refusals: [r('text', 'Nothing changed.')] }; }
    return { note: Object.assign({}, note, { text: t }), history: hist(note, 'text', note.text, t, ctx) };
  }

  function closeNote(note, ctx) {
    E.checkCtx(ctx, 'closeNote');
    if (deleted(note)) { return { refusals: deleted(note) }; }
    if (note.status === 'Done') { return { refusals: [r('status', 'Note ' + note.note_id + ' is already Done.')] }; }
    return { note: Object.assign({}, note, { status: 'Done', closed_by: ctx.who, closed_at: ctx.now }), history: hist(note, 'status', 'Open', 'Done', ctx) };
  }
  function reopenNote(note, ctx) {
    E.checkCtx(ctx, 'reopenNote');
    if (deleted(note)) { return { refusals: deleted(note) }; }
    if (note.status === 'Open') { return { refusals: [r('status', 'Note ' + note.note_id + ' is already Open.')] }; }
    return { note: Object.assign({}, note, { status: 'Open', closed_by: null, closed_at: null }), history: hist(note, 'status', 'Done', 'Open', ctx) };
  }

  /* deleteNote(note, ctx) → { note, history } or { refusals }: status Deleted with who and when (part 18.3); the row stays */
  function deleteNote(note, ctx) {
    E.checkCtx(ctx, 'deleteNote');
    if (note.status === 'Deleted') { return { refusals: [r('status', 'Note ' + note.note_id + ' is already Deleted.')] }; }
    return { note: Object.assign({}, note, { status: 'Deleted', closed_by: ctx.who, closed_at: ctx.now }), history: hist(note, 'status', note.status, 'Deleted', ctx) };
  }

  /* moveNote(note, place, chartRefs, ctx) → { note, history } or { refusals }: a dragged note (part 18.3). place = { pin, pin_ref, x, y }:
     a pinned note keeps or changes its box or arrow (chartRefs: the boxes and arrows of its chart) and its x, y from the top-right corner
     of the box or the label point of the arrow (whole numbers, below 0 allowed; both empty = the automatic place); a free note has x, y
     on the chart (whole numbers of 0 or more) */
  const XY = "A note's place is x and y, whole numbers (0 or more for a free note).";
  function moveNote(note, place, chartRefs, ctx) {
    E.checkCtx(ctx, 'moveNote');
    if (deleted(note)) { return { refusals: deleted(note) }; }
    if (!place || SETSX.note_pin.indexOf(place.pin) < 0) { return { refusals: [r('pin', 'Pin must be one of: ' + SETSX.note_pin.join(', '))] }; }
    const whole = v => Number.isInteger(v);
    let next;
    if (place.pin === 'free') {
      if (!whole(place.x) || !whole(place.y) || place.x < 0 || place.y < 0) { return { refusals: [r('xy', XY)] }; }
      next = { pin: 'free', pin_ref: null, x: place.x, y: place.y };
    } else {
      const auto = place.x === null && place.y === null;
      if (!auto && (!whole(place.x) || !whole(place.y))) { return { refusals: [r('xy', XY)] }; }
      const refs = place.pin === 'box' ? (chartRefs.boxes || []) : (chartRefs.arrows || []);
      if (refs.indexOf(String(place.pin_ref)) < 0) { return { refusals: [r('pin_ref', (place.pin === 'box' ? 'Box ' : 'Arrow ') + place.pin_ref + ' is not on this chart.')] }; }
      next = { pin: place.pin, pin_ref: String(place.pin_ref), x: auto ? null : place.x, y: auto ? null : place.y };
    }
    if (['pin', 'pin_ref', 'x', 'y'].every(f => note[f] === next[f])) { return { refusals: [r('xy', 'Nothing changed.')] }; }
    const moved = Object.assign({}, note, next);
    return { note: moved, history: E.historyRows({ table: 'chart_notes', row_id: note.note_id + ' ' + note.rev, sop_id: note.sop_id, rev: note.rev,
      old: note, new: moved, fields: ['pin', 'pin_ref', 'x', 'y'], ctx: ctx, after: [] }) };
  }

  /* notesCount(notes, sopId, rev, chart, section) → { open, done, open_here } */
  function notesCount(notes, sopId, rev, chart, section) {
    const mine = notes.filter(n => n.sop_id === sopId && n.rev === rev);
    const here = mine.filter(n => n.chart === chart && (chart !== 'steps' || n.section === section));
    return { open: mine.filter(n => n.status === 'Open').length, done: mine.filter(n => n.status === 'Done').length,
      open_here: here.filter(n => n.status === 'Open').length };
  }

  /* carryNotes(notes, sopId, fromRev, toRev) → the Open notes of fromRev with the new label and the same ids */
  function carryNotes(notes, sopId, fromRev, toRev) {
    return notes.filter(n => n.sop_id === sopId && n.rev === fromRev && n.status === 'Open').map(n => Object.assign({}, n, { rev: toRev }));
  }

  return { checkNote, addNote, editNote, closeNote, reopenNote, deleteNote, moveNote, notesCount, carryNotes };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_NOTES;
