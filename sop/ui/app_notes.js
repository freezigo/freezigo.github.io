/* SOP Builder Flow tab wiring, the notes (example_flow.md parts 14 and
   18.3): the note form pinned to a box, an arrow or a free spot, Done and
   Open again, Edit, a drag that keeps the note with its box, step or arrow,
   Unpin, Delete (a yes or no pop-up) and Minimise (kept in this browser,
   nothing written). Split from ui/app_flow.js on 2026-11-12 (the notes
   are one job; the mouse menus call them too).
   Each action hands the engine its input, shows refusals, writes the
   tables the engine returns and redraws through APP. Classic script
   (global APP_NOTES); loaded after ui/app_flow.js. */
const APP_NOTES = (function () {
  const state = APP.state;
  const $ = APP.el, guard = APP.guard, writeTables = APP.writeTables;
  const F = () => APP_FLOW;
  const FORMS = () => RENDER_FLOW_FORMS;
  const ui = () => APP_FLOW.ui();
  const sopId = () => state.view.sop.sop_id;
  const ctxOf = r => APP_FLOW.ctxOf(r), refuse = r => APP_FLOW.refuse(r), log = (d, w) => APP_FLOW.log(d, w), showForm = h => APP_FLOW.showForm(h);

  function openNoteForm(pin, chart) {
    const u = ui();
    showForm(FORMS().noteForm(pin));
    $('btn-nf-cancel').onclick = () => { $('flow-form').innerHTML = ''; };
    $('btn-nf-save').onclick = () => guard('ui noteAdd', async function () {
      const ctx = Object.assign(await ctxOf('Chart note'), { next_note_id: await STORE.nextId('chart_notes', 'note_id') });
      const fields = { chart: chart, section: chart === 'steps' ? u.section : null, pin: pin.pin, pin_ref: pin.pin_ref === undefined ? null : pin.pin_ref, x: pin.x === undefined ? null : pin.x, y: pin.y === undefined ? null : pin.y, text: $('nf-text').value };
      log('ui → engine', 'noteAdd ' + chart + ' ' + pin.pin + ' ' + (pin.pin_ref || ''));
      const r = ENGINE_CHART.noteAdd({ tables: state.tables, sop_id: sopId(), fields: fields, ctx: ctx });
      if (r.refusals) { RENDER_EDIT.showRefusals($('note-form'), r.refusals.map(x => (x.field === 'pin_ref' || x.field === 'xy' ? Object.assign({}, x, { field: 'form' }) : x))); return; }
      await writeTables(r.tables, ctx);
      await APP.showSop(sopId(), 'flow');
    });
  }
  function noteAt(p, chart) { return openNoteForm({ pin: 'free', pin_ref: null, x: Math.max(0, p.x), y: Math.max(0, p.y), label: 'free, at ' + Math.max(0, p.x) + ', ' + Math.max(0, p.y) }, chart); }
  async function noteChange(fn, noteId) {
    const ctx = await ctxOf('Chart note');
    log('ui → engine', fn + ' ' + noteId);
    const r = ENGINE_CHART[fn]({ tables: state.tables, sop_id: sopId(), note_id: noteId, ctx: ctx });
    if (r.refusals) { return refuse(r); }
    await writeTables(r.tables, ctx);
    await APP.showSop(sopId(), 'flow');
  }
  /* a note let go after a drag (part 18.3): place = { pin, pin_ref, x, y } from APP_FLOW (pinned there, or the same pin at its new distance) */
  async function noteMoved(noteId, place) {
    const ctx = await ctxOf('Chart note');
    log('ui → engine', 'noteMove ' + noteId + ' to ' + place.pin + ' ' + (place.pin_ref || '') + ' ' + place.x + ', ' + place.y);
    const r = ENGINE_CHART.noteMove({ tables: state.tables, sop_id: sopId(), note_id: noteId, place: place, ctx: ctx });
    if (r.refusals) { refuse(r); return APP.showSop(sopId(), 'flow'); }
    await writeTables(r.tables, ctx);
    await APP.showSop(sopId(), 'flow');
  }
  /* Unpin: the note becomes a free note where it is drawn now; v = the view of the chart it is on */
  function unpin(noteId, v) {
    const at = v.note_layout.notes[noteId];
    if (!at) { throw new Error('ui unpin: note ' + noteId + ' is not drawn on this chart'); }
    return noteMoved(noteId, { pin: 'free', pin_ref: null, x: Math.round(at.x), y: Math.round(at.y) });
  }
  /* Delete note: a yes or no pop-up, then status Deleted */
  function askDelete(noteId) {
    APP_REASON.confirm('Delete note ' + noteId + '?', 'It leaves the chart; History keeps its text.', 'Delete', () => noteChange('noteDelete', noteId));
  }
  /* Minimise: the note ids folded into tags, kept in this browser per SOP and revision; nothing is written */
  const MIN_KEY = 'sopBuilder.notes.min';
  let minMem = {};
  function minAll() { try { const v = JSON.parse(window.localStorage.getItem(MIN_KEY) || '{}'); return v && typeof v === 'object' ? v : minMem; } catch (e) { return minMem; } }
  const where = () => sopId() + ' ' + state.view.sop.current_rev;
  function minimised() { const v = minAll()[where()]; return Array.isArray(v) ? v : []; }
  function setMin(noteId, on) {
    const all = minAll(), list = minimised().filter(id => id !== noteId).concat(on ? [noteId] : []);
    all[where()] = list; minMem = all;
    try { window.localStorage.setItem(MIN_KEY, JSON.stringify(all)); } catch (e) { /* a private window: kept for this visit */ }
    log('ui', 'note ' + noteId + (on ? ' minimised' : ' shown in full'));
    return APP_FLOW.showFlow();
  }
  function openNoteEdit(noteId) {
    const note = state.tables.chart_notes.find(n => n.note_id === noteId && n.sop_id === sopId() && n.rev === state.view.sop.current_rev);
    if (!note) { throw new Error('ui noteEdit: no note ' + noteId); }
    showForm(FORMS().noteForm({ label: note.pin === 'free' ? 'free' : note.pin + ' ' + note.pin_ref }, note.text));
    $('btn-nf-cancel').onclick = () => { $('flow-form').innerHTML = ''; };
    $('btn-nf-save').onclick = () => guard('ui noteEdit', async function () {
      const ctx = await ctxOf('Chart note');
      const r = ENGINE_CHART.noteEdit({ tables: state.tables, sop_id: sopId(), note_id: noteId, text: $('nf-text').value, ctx: ctx });
      if (r.refusals) { RENDER_EDIT.showRefusals($('note-form'), r.refusals); return; }
      await writeTables(r.tables, ctx);
      await APP.showSop(sopId(), 'flow');
    });
  }

  return { openNoteForm, noteAt, noteChange, noteMoved, openNoteEdit, unpin, askDelete, minimised, setMin };
})();
