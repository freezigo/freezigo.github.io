/* SOP Builder Flow tab wiring, the frame and chart B (example_flow.md
   parts 4 to 7, 11, 15 to 18): the toolbar with ＋ Add, the window-filling
   three columns, Big view, selection, drag and drop of boxes and notes,
   every change through the Reason pop-up (ui/app_reason.js), the Needs
   arrows, the section form, add, move and retire. The middle and right
   columns (chart C, the step card) are drawn by ui/app_steps.js, the notes
   by ui/app_notes.js, the menus, the connect dot and the double-click by
   ui/app_mouse.js, the column widths by ui/app_cols.js, the texts to check
   by ui/app_texts.js. Each action hands the engine its input,
   shows refusals, writes the tables the engine returns and redraws
   through APP. No logic beyond that. Classic script (global APP_FLOW);
   loaded after ui/app_actions.js. */
const APP_FLOW = (function () {
  const state = APP.state;
  const $ = APP.el, guard = APP.guard, nowIso = APP.nowIso, writeTables = APP.writeTables;
  const FORMS = () => RENDER_FLOW_FORMS;
  /* the Short / Full choice is kept in this browser (part 16); the page works without storage. How to read is in the top line (part 19.1) */
  const KEEP = { boxes: 'sopBuilder.flow.boxes' };
  const kept = (k, d) => { try { const v = window.localStorage.getItem(KEEP[k]); return v === null ? d : v; } catch (e) { return d; } };
  const keep = (k, v) => { try { window.localStorage.setItem(KEEP[k], v); } catch (e) { /* private window: the choice lasts this visit */ } };
  const ui = () => (state.flow = state.flow || { section: null, selected: null, selectedArrow: null, step: null, mode: null, modeText: '', arrowFrom: null,
    boxes: kept('boxes', 'short') === 'full' ? 'full' : 'short' });
  const sopId = () => state.view.sop.sop_id;
  const ctxOf = async reason => ({ who: state.editor, now: nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: reason });
  const refuse = r => { if ($('flow-refusal')) { $('flow-refusal').textContent = r.refusals.map(x => x.message).join(' · '); } console.log('[engine → ui] refused: ' + r.refusals.map(x => x.message).join('; ')); };
  const log = (dir, what) => console.log('[' + dir + '] ' + what);
  /* change(what, call, done, onRefusals): one change through the Reason pop-up (part 18.4): call(ctx) → the engine's answer;
     done(r, ctx) writes and redraws; refusals go under the toolbar unless onRefusals says where */
  function change(what, call, done, onRefusals) {
    return APP_REASON.ask(what, async function (reason, dry) {
      const ctx = await ctxOf(reason);
      const r = await call(ctx);
      if (r.refusals) { return r.refusals; }
      if (dry) { return null; }
      await done(r, ctx);
      return null;
    }, onRefusals || (refs => refuse({ refusals: refs })));
  }

  /* ---- the frame: the columns fill the window (part 11) ---- */
  function sizeWork() {
    const w = $('flow-work');
    if (!w) { return; }
    const top = w.getBoundingClientRect().top + window.scrollY;
    w.style.height = Math.max(280, Math.floor(window.innerHeight - top - 10)) + 'px';
  }
  let wired = false;
  function wireWindow() {
    if (wired) { return; }
    wired = true;
    window.addEventListener('resize', () => { sizeWork(); APP_COLS.apply(null); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.flowBig && state.tab === 'flow') { guard('ui bigView', () => setBig(false)); } });
  }
  /* each column keeps its scroll place across redraws (a click redraws the columns) */
  const COLS = ['col-b', 'col-c', 'col-d'];
  function keepScroll() {
    const u = ui();
    u.scroll = u.scroll || {};
    for (const id of COLS) {
      const el = $(id);
      if (!el) { continue; }
      el.scrollTop = u.scroll[id] || 0;
      el.onscroll = () => { u.scroll[id] = el.scrollTop; };
    }
  }
  function resetScroll(ids) { const u = ui(); u.scroll = u.scroll || {}; for (const id of ids) { u.scroll[id] = 0; } }
  function setBig(on) {
    state.flowBig = on;
    document.body.classList.toggle('flow-big', on);
    if ($('btn-big')) { $('btn-big').textContent = on ? 'Exit big view' : '⛶ Big view'; $('btn-big').classList.toggle('active', on); }
    window.scrollTo(0, 0);
    sizeWork();
  }

  /* ---- draw ---- */
  async function showFlow() {
    const u = ui();
    wireWindow();
    log('ui → engine', 'flowView ' + sopId() + ' (' + u.boxes + ' boxes)');
    /* build 50: the good version and someone else's copy are locked with the line of the rights (example_rights.md part 6.7) */
    const v = APP.lockOn(ENGINE_CHART.flowView({ tables: state.tables, sop_id: sopId(), boxes: u.boxes, minimised: APP_NOTES.minimised() }), sopId());
    u.view = v;
    log('engine → ui', 'flowView: ' + v.sections.length + ' sections, ' + (v.layout.error ? 'error' : v.layout.arrows.length + ' arrows') + ', ' + v.notes.length + ' notes');
    const sv = state.view;
    /* a Released or Superseded revision: the tile says so in place of the items that fail (example_release.md part 8.4) */
    const closed = !!sv.rev && (sv.rev.status === 'Released' || sv.rev.status === 'Superseded');
    const counts = { vn_open: sv.vn.open, notes_open: sv.notes_open || 0, release_fail: sv.release && !closed ? sv.release.check.fail_count : null,
      release_label: sv.release && closed ? sv.release.label : null, texts: APP_TEXTS.list().length };
    $('tab-body').innerHTML = RENDER_FLOW.flowTab(v, Object.assign({}, u, { big: !!state.flowBig }), counts);
    if (state.kickReport) { $('tab-body').insertAdjacentHTML('afterbegin', '<div class="given-note kick-report">' + RENDER.esc(state.kickReport) + '</div>'); state.kickReport = null; }
    document.body.classList.toggle('flow-big', !!state.flowBig);
    APP_TEXTS.show($('flow-mentions'));
    wireBar(v);
    wireSvg($('flow-svg'), 'sections', v);
    if (u.selected && !v.sections.some(s => String(s.section) === u.selected)) { u.selected = null; u.step = null; }
    u.section = u.selected && /^\d+$/.test(u.selected) ? Number(u.selected) : null;
    sizeWork();
    APP_COLS.wire();
    await APP_STEPS.draw(v);
    keepScroll();
  }
  /* the toolbar, Big view, the tiles, and the buttons and tags of the notes on either chart */
  function wireBar(v) {
    const u = ui();
    u.mode = null; u.modeText = ''; u.arrowFrom = null;
    $('btn-big').onclick = () => guard('ui bigView', () => setBig(!state.flowBig));
    $('btn-boxes-short').onclick = () => guard('ui boxes', () => setBoxes('short'));
    $('btn-boxes-full').onclick = () => guard('ui boxes', () => setBoxes('full'));
    for (const b of $('tab-body').querySelectorAll('.tile.link[data-tab], .bcard')) { b.onclick = () => guard('ui openTab', () => APP.showTab(b.dataset.tab)); }
    /* build 40: the tile opens the Texts to check tab */
    if ($('tile-texts')) { $('tile-texts').onclick = () => guard('ui textsTab', () => APP.showTab('texts')); }
    /* ＋ Add holds the three old buttons (part 17.4) */
    if ($('btn-add-menu')) {
      const shut = () => { $('add-menu').hidden = true; };
      $('btn-add-menu').onclick = e => { e.stopPropagation(); $('add-menu').hidden = !$('add-menu').hidden; };
      $('btn-add-section').onclick = () => { shut(); guard('ui addSectionForm', () => openAddSection(null)); };
      $('btn-draw-arrow').onclick = () => { shut(); guard('ui drawArrow', () => setMode(u.mode === 'arrow-from' ? null : 'arrow-from')); };
      $('btn-add-note').onclick = () => { shut(); guard('ui addNote', () => setMode(u.mode === 'note' ? null : 'note')); };
    }
    /* build 66: another person's copy: the bar holds only ✎ Add a note */
    if ($('btn-add-note') && !$('btn-add-menu')) { $('btn-add-note').onclick = () => guard('ui addNote', () => setMode(u.mode === 'note' ? null : 'note')); }
    if ($('btn-remove-arrow')) { $('btn-remove-arrow').onclick = () => guard('ui removeArrow', removeArrow); }
    $('tab-body').onclick = e => {
      const b = e.target.closest('button');
      if (!b) { return; }
      if (b.classList.contains('btn-note-done')) { guard('ui noteClose', () => APP_NOTES.noteChange('noteClose', Number(b.dataset.note))); }
      if (b.classList.contains('btn-note-reopen')) { guard('ui noteReopen', () => APP_NOTES.noteChange('noteReopen', Number(b.dataset.note))); }
      if (b.classList.contains('btn-note-edit')) { guard('ui noteEdit', () => APP_NOTES.openNoteEdit(Number(b.dataset.note))); }
      if (b.classList.contains('btn-note-min')) { guard('ui noteMin', () => APP_NOTES.setMin(Number(b.dataset.note), true)); }
      if (b.classList.contains('ftag')) { guard('ui noteShow', () => APP_NOTES.setMin(Number(b.dataset.note), false)); }
      if (b.classList.contains('btn-note-del')) { guard('ui noteDelete', () => APP_NOTES.askDelete(Number(b.dataset.note))); }
    };
  }

  /* Short or Full boxes (part 16): kept in this browser, the chart redrawn with the same selection */
  function setBoxes(mode) {
    const u = ui();
    if (u.boxes === mode) { return; }
    u.boxes = mode; keep('boxes', mode);
    log('ui', 'boxes ' + mode);
    return showFlow();
  }

  /* one chart's clicks and drags; chart = 'sections' | 'steps'; v = that chart's view */
  function wireSvg(svg, chart, v) {
    if (!svg) { return; }
    const u = ui();
    for (const g of svg.querySelectorAll('.farrow')) { g.onclick = e => { e.stopPropagation(); guard('ui arrowClick', () => arrowClicked(g.dataset.arrow, chart)); }; }
    /* a press on a box captures the pointer, so the click that follows names the chart, not the box: ask what is under the pointer */
    svg.onclick = e => {
      const el = document.elementFromPoint(e.clientX, e.clientY) || e.target;
      const on = el && el.closest ? el.closest('.fbox, .fnote, .farrow') : null;
      if (u.mode === 'note' && !on) { const p = svgPoint(svg, e); setMode(null); guard('ui noteFree', () => APP_NOTES.noteAt(p, chart)); }
      else if ((u.mode === 'arrow-from' || u.mode === 'arrow-to') && !on) { setMode(null); }
    };
    wireDrag(svg, chart, v);
    APP_MOUSE.wire(svg, chart, v);
  }
  function svgPoint(svg, e) {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.round(q.x), y: Math.round(q.y) };
  }
  /* drag with pointer events, so it works at any zoom; a press without movement is a click.
     A note: it follows the pointer and stays where it is let go (part 14). A section box: dropped onto another box.
     A step box: the drop line between two steps shows where it lands (part 8; APP_STEPS.slotAt). */
  function wireDrag(svg, chart, v) {
    let src = null, start = null, dragged = false, over = null, note = null, slot = null;
    const boxAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const b = el ? el.closest('.fbox') : null; return b && svg.contains(b) ? b : null; };
    const movable = box => box.dataset.kind === 'section' || box.dataset.kind === 'step';
    svg.onpointerdown = e => {
      if (e.button !== 0 || v.locked && !e.target.closest('.fbox')) { return; }
      if (APP_MOUSE.dotDown(svg, e, chart, v)) { return; }
      const n = e.target.closest('.fnote');
      if (n) {
        if (e.target.closest('button') || v.locked) { return; }
        const f = n.closest('foreignObject'), p = svgPoint(svg, e);
        note = { el: n, fo: f, id: Number(n.dataset.note), x0: Number(f.getAttribute('x')), y0: Number(f.getAttribute('y')), px: p.x, py: p.y, moved: false };
        f.style.pointerEvents = 'none';   /* while it moves, the pointer sees what is under the note */
        try { svg.setPointerCapture(e.pointerId); } catch (x) { /* a click still works */ }
        e.preventDefault();
        return;
      }
      const box = e.target.closest('.fbox');
      if (!box || e.target.closest('button, input, textarea, a')) { return; }
      src = box; start = { x: e.clientX, y: e.clientY }; dragged = false; slot = null;
      try { svg.setPointerCapture(e.pointerId); } catch (x) { /* an old browser: a click still works */ }
    };
    svg.onpointermove = e => {
      if (APP_MOUSE.dotMove(svg, e)) { return; }
      if (note) {
        const p = svgPoint(svg, e), dx = p.x - note.px, dy = p.y - note.py;
        if (!note.moved && Math.abs(dx) + Math.abs(dy) < 4) { return; }
        note.moved = true; note.el.classList.add('dragging');
        note.fo.setAttribute('x', Math.max(0, note.x0 + dx)); note.fo.setAttribute('y', Math.max(0, note.y0 + dy));
        return;
      }
      if (!src) { return; }
      if (!dragged && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 6 && !v.locked && movable(src)) { dragged = true; src.classList.add('dragging'); }
      if (!dragged) { return; }
      if (chart === 'steps') { slot = APP_STEPS.slotAt(svg, v, src.dataset.id, svgPoint(svg, e).y); return; }
      const t = boxAt(e);
      if (over && over !== t) { over.classList.remove('drop-target'); }
      over = t && t !== src && movable(t) ? t : null;
      if (over) { over.classList.add('drop-target'); }
    };
    svg.onpointerup = e => {
      if (APP_MOUSE.dotUp(svg, e)) { return; }
      if (note) {
        const n = note, under = boxAt(e); note = null; n.el.classList.remove('dragging'); n.fo.style.pointerEvents = '';
        if (n.moved) { const place = notePlace(v, n, under); guard('ui noteMove', () => APP_NOTES.noteMoved(n.id, place)); }
        return;
      }
      if (!src) { return; }
      const s = src, wasDrag = dragged, target = wasDrag && chart !== 'steps' ? boxAt(e) : null, at = slot;
      src.classList.remove('dragging'); if (over) { over.classList.remove('drop-target'); }
      src = null; over = null; dragged = false; slot = null;
      if (chart === 'steps') { APP_STEPS.hideDropLine(svg); }
      if (!wasDrag) {
        /* Ctrl+click on a step of chart C picks it, or lets it go (part 21.2); a plain click clears the picks */
        if (chart === 'steps' && s.dataset.kind === 'step' && (e.ctrlKey || e.metaKey)) { if (!v.locked) { APP_STEPS.togglePick(s.dataset.id); } return; }
        if (chart === 'steps') { APP_STEPS.clearPicks(); }
        if (APP_MOUSE.clicked(s.dataset.id, s.dataset.kind, chart, v)) { return; }
        guard('ui boxClick', () => boxClicked(s.dataset.id, s.dataset.kind, chart)); return;
      }
      if (chart === 'steps') { if (at) { guard('ui dropStep', () => APP_STEPS.dropped(s.dataset.id, at)); } return; }
      if (target && target !== s && s.dataset.kind === 'section' && target.dataset.kind === 'section') { guard('ui drop', () => moveSectionTo(Number(s.dataset.id), Number(target.dataset.id))); }
    };
  }

  /* notePlace(v, n, box) → where a dragged note goes (part 18.3): let go on another box or step = pinned there; else a pinned note keeps
     its box or arrow at its new distance from the anchor (the engine's note layout gives ax, ay), a free note stays free there */
  function notePlace(v, n, box) {
    const x = Math.round(Number(n.fo.getAttribute('x'))), y = Math.round(Number(n.fo.getAttribute('y')));
    const row = v.notes.find(m => m.note_id === n.id), at = v.note_layout.notes[n.id];
    if (box && !(row.pin === 'box' && String(row.pin_ref) === box.dataset.id)) {
      const b = v.layout.boxes[box.dataset.id];
      return { pin: 'box', pin_ref: box.dataset.id, x: x - (b.x + b.w), y: y - b.y };
    }
    if (row.pin === 'free') { return { pin: 'free', pin_ref: null, x: Math.max(0, x), y: Math.max(0, y) }; }
    return { pin: row.pin, pin_ref: row.pin_ref, x: x - at.ax, y: y - at.ay };
  }

  /* ---- modes and clicks ---- */
  function setMode(mode) {
    const u = ui();
    u.mode = mode; u.arrowFrom = null;
    u.modeText = mode === 'arrow-from' ? 'Click the box that must be done first (a section or a grey input).' : mode === 'arrow-to' ? 'Now click the box that needs it.' :
      mode === 'note' ? 'Click a box, an arrow or an empty spot for the note.' : '';
    if ($('flow-mode')) { $('flow-mode').textContent = u.modeText; }
    if ($('btn-add-note')) { $('btn-add-note').classList.toggle('active', mode === 'note'); }
    if ($('btn-draw-arrow')) { $('btn-draw-arrow').classList.toggle('active', mode === 'arrow-from' || mode === 'arrow-to'); }
  }
  function boxLabel(id, kind) {
    if (kind === 'step') { return 'step ' + id; }
    if (kind === 'input') { return 'input ' + id; }
    if (kind === 'io') { return 'box ' + id; }
    return 'box ' + id + ' (' + sectionName(Number(id)) + ')';
  }
  async function boxClicked(id, kind, chart) {
    const u = ui();
    if (u.mode === 'arrow-from' && chart === 'sections') { if (kind === 'io') { return; } setMode('arrow-to'); u.arrowFrom = id; return; }
    if (u.mode === 'arrow-to' && chart === 'sections') { const from = u.arrowFrom; setMode(null); if (kind === 'io') { return; } return arrow(from, id, 'add'); }
    if (u.mode === 'note') { setMode(null); return APP_NOTES.openNoteForm({ pin: 'box', pin_ref: id, label: boxLabel(id, kind) }, chart); }
    if (chart === 'steps') { return selectStep(id); }
    /* build 65 (Vishal 21 Nov: "why cant i click on input"): the Input and Output boxes open their field of the Header tab */
    if (kind === 'io') { return headerField(id === 'output' ? 'output_to' : 'input_from'); }
    if (kind === 'input') { return; }
    return selectSection(id);
  }
  /* headerField(field): the Header tab; where the header can be changed, the header form open with the field ready to type; else the
     field's row of the Header table marked (build 65, spec/example_flow.md part 22) */
  async function headerField(field) {
    const label = field === 'output_to' ? 'Output to' : 'Input from';
    await APP.showTab('header');
    if ($('btn-header-edit') && !$('header-form') && !$('row-form')) { $('btn-header-edit').click(); }
    const el = document.querySelector('#hd-form [name="' + field + '"]');
    if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); log('ui', 'header form at ' + field); return; }
    const row = document.querySelector('table.kv tr[data-row="' + label + '"]');
    if (row) { row.classList.add('row-mark'); row.scrollIntoView({ block: 'center' }); log('ui', 'header row ' + label + ' marked'); }
  }
  /* select a section box (its steps in the middle) or a step box (its card on the right); the menus and the double-click use them too */
  async function selectSection(id) {
    const u = ui();
    if (u.selected === String(id)) { return; }
    u.selected = String(id); u.selectedArrow = null; u.step = null;
    resetScroll(['col-c', 'col-d']);
    return showFlow();
  }
  async function selectStep(key) {
    const u = ui();
    u.step = key; resetScroll(['col-d']);
    await APP_STEPS.draw(u.view);
    return keepScroll();
  }
  /* Connect to… (part 17.1): the next click on a section box draws the Needs arrow from this box */
  function connectFrom(id) {
    setMode('arrow-to');
    const u = ui();
    u.arrowFrom = String(id);
    u.modeText = 'Now click the box that needs box ' + id + '.';
    if ($('flow-mode')) { $('flow-mode').textContent = u.modeText; }
  }
  function sectionName(n) { const s = ui().view.sections.find(x => x.section === n); return s ? s.name : ''; }
  async function arrowClicked(id, chart) {
    const u = ui();
    if (u.mode === 'note') { setMode(null); return APP_NOTES.openNoteForm({ pin: 'arrow', pin_ref: id, label: 'arrow ' + id.replace('>', ' → ') }, chart); }
    if (chart === 'steps') { return; }
    if (/^input>|>output$/.test(id)) { return; }
    u.selectedArrow = u.selectedArrow === id ? null : id;
    return showFlow();
  }

  /* ---- arrows: a new or removed arrow asks its reason (part 18.4) ---- */
  function arrow(from, to, action) {
    const label = (action === 'add' ? 'Draw the Needs arrow ' : 'Remove the Needs arrow ') + from + ' → ' + to;
    return change(label, ctx => ENGINE_CHART.arrow({ tables: state.tables, sop_id: sopId(), from: from, to: to, action: action, ctx: ctx }), async function (r, ctx) {
      log('ui → engine', 'arrow ' + action + ' ' + from + ' → ' + to);
      await writeTables(r.tables, ctx);
      const u = ui(); u.selectedArrow = null; u.selected = String(to); u.step = null;
      await APP.showSop(sopId(), 'flow');
    });
  }
  async function removeArrow() {
    const a = ui().selectedArrow.split('>');
    return arrow(a[0], a[1], 'remove');
  }

  /* ---- forms in the right column ---- */
  function showForm(html) {
    $('flow-form').innerHTML = html;
    const f = $('flow-form').firstElementChild;
    if (f) { f.scrollIntoView({ block: 'nearest' }); }
  }
  function openSectionForm(n) {
    const u = ui(), v = u.view;
    const sec = v.sections.find(s => s.section === n);
    if (!sec) { throw new Error('ui sectionForm: no section ' + n); }
    showForm(FORMS().sectionForm(sec, TYPES.tables.sections.fields, v.locked));
    $('btn-sec-cancel').onclick = () => { $('flow-form').innerHTML = ''; };
    if (v.locked) { return; }
    $('btn-sec-save').onclick = () => guard('ui saveSection', () => saveSection(n));
    APP_PROC.wireNeedsFind();
  }
  function saveSection(n) {
    const form = $('sec-form');
    const typed = FORMS().readSectionForm(form);
    return change('Save section ' + n, ctx => ENGINE_CHART.saveSection({ tables: state.tables, sop_id: sopId(), section: n, changes: typed, ctx: ctx }), async function (r, ctx) {
      log('engine → ui', 'saveSection ' + n + ': ' + r.new_history.length + ' History rows');
      await writeTables(r.tables, ctx);
      await APP.showSop(sopId(), 'flow');
    }, refs => RENDER_EDIT.showRefusals(form, refs));
  }
  async function afterRenumber(r, ctx, what) {
    log('engine → ui', what + ': ' + r.new_history.length + ' History rows');
    await writeTables(r.tables, ctx);
    await APP.showSop(sopId(), 'flow');
  }
  function moveSection(n, label, how) {
    return change(label, ctx => ENGINE_CHART.moveSection(Object.assign({ tables: state.tables, sop_id: sopId(), section: n, ctx: ctx }, how)), function (r, ctx) {
      log('ui → engine', 'moveSection ' + n + ' ' + JSON.stringify(how));
      ui().selected = String(r.map[n] !== undefined ? r.map[n] : n);
      return afterRenumber(r, ctx, 'moveSection');
    });
  }
  const moveSectionDir = (n, direction) => moveSection(n, 'Move section ' + n + (direction === 'up' ? ' earlier' : ' later'), { direction: direction });
  const moveSectionTo = (n, after) => moveSection(n, 'Move section ' + n + ' after ' + after, { after: after });
  /* openAddSection(after): after = null for the end (the toolbar) or a section number (the middle column's head) */
  function openAddSection(after) {
    const v = ui().view;
    showForm(FORMS().addSectionForm(after, v.sections.length ? v.sections[v.sections.length - 1].section : null));
    $('btn-as-cancel').onclick = () => { $('flow-form').innerHTML = ''; };
    $('btn-as-add').onclick = () => guard('ui addSection', function () {
      const name = $('as-name').value;
      return change('Add section ' + name.trim(), ctx => ENGINE_CHART.addSection({ tables: state.tables, sop_id: sopId(), name: name, after: after, ctx: ctx }), function (r, ctx) {
        log('ui → engine', 'addSection ' + (after === null ? 'at the end' : 'after ' + after));
        ui().selected = String(r.new_section); ui().step = null;
        return afterRenumber(r, ctx, 'addSection');
      }, refs => RENDER_EDIT.showRefusals($('add-section-form'), refs));
    });
  }
  function openRetireSection(n) {
    const v = ui().view;
    const p = ENGINE_CHART.retirePreview({ tables: state.tables, sop_id: sopId(), section: n });
    showForm(FORMS().retireSectionForm(v.sections.find(s => s.section === n), p));
    $('btn-rs-cancel').onclick = () => { $('flow-form').innerHTML = ''; };
    $('btn-rs-retire').onclick = () => guard('ui retireSection', function () {
      return change('Delete section ' + n, ctx => ENGINE_CHART.retireSection({ tables: state.tables, sop_id: sopId(), section: n, ctx: ctx }), function (r, ctx) {
        log('ui → engine', 'retireSection ' + n);
        ui().selected = null; ui().step = null;
        return afterRenumber(r, ctx, 'retireSection');
      }, refs => RENDER_EDIT.showRefusals($('retire-section-form'), refs.map(x => (x.field === 'retire' ? Object.assign({}, x, { field: 'form' }) : x))));
    });
  }

  return { showFlow, selectSection, selectStep, connectFrom, arrow, svgPoint, boxLabel, keepScroll, setMode, setBig, sizeWork, ui, ctxOf, refuse, log, change, afterRenumber, wireSvg, showForm,
    openSectionForm, openAddSection, openRetireSection, moveSectionDir };
})();
