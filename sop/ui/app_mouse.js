/* SOP Builder Flow tab, the mouse (example_flow.md parts 17 and 18.3): the
   right-click menus on both charts, connect by dragging the dot under a
   box, and the double-click. What a menu shows comes from
   ENGINE_MENUS.menuFor; each item calls the same action as the button it
   stands for. No logic beyond picking the action. Classic script (global
   APP_MOUSE); loaded after ui/app_notes.js. */
const APP_MOUSE = (function () {
  const $ = APP.el, guard = APP.guard;
  const F = () => APP_FLOW, S = () => APP_STEPS, N = () => APP_NOTES;
  const ui = () => APP_FLOW.ui();
  const log = what => console.log('[ui] ' + what);

  /* ---- the menu: opens where the pointer is, kept inside the window; Esc, a click elsewhere or a scroll closes it ---- */
  function closeMenu() { const m = $('ctx-menu'); if (m) { m.remove(); } }
  function closeAdd() { const m = $('add-menu'); if (m) { m.hidden = true; } }
  let wired = false;
  function wireWindow() {
    if (wired) { return; }
    wired = true;
    document.addEventListener('pointerdown', e => {
      if (!(e.target.closest && e.target.closest('#ctx-menu'))) { closeMenu(); }
      if (!(e.target.closest && e.target.closest('.addmenu'))) { closeAdd(); }
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') { return; }
      closeMenu(); closeAdd();
      if (ui().mode) { F().setMode(null); }
      S().clearPicks();
    });
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
    document.addEventListener('scroll', closeMenu, true);
  }
  /* openMenu(m, x, y, run): also the menu of a step card row (ui/app_field.js, build 35) */
  function openMenu(m, x, y, run) {
    wireWindow();
    closeMenu();
    document.body.insertAdjacentHTML('beforeend', RENDER_FLOW.ctxMenu(m));
    const el = $('ctx-menu');
    el.style.left = Math.max(4, Math.min(x, window.innerWidth - el.offsetWidth - 4)) + 'px';
    el.style.top = Math.max(4, Math.min(y, window.innerHeight - el.offsetHeight - 4)) + 'px';
    for (const b of el.querySelectorAll('.ctx-item')) { b.onclick = () => { closeMenu(); guard('ui menu ' + b.dataset.act, () => run(b.dataset.act)); }; }
    log('menu: ' + m.title + ' (' + (m.items.map(i => i.act).join(', ') || 'locked') + ')');
  }

  /* ---- what was right-clicked: a note, a box, an arrow or an empty spot ---- */
  function targetOf(e, chart, v) {
    const n = e.target.closest('.fnote, .ftag');
    if (n) {
      const id = Number(n.dataset.note), note = v.notes.concat(v.loose_notes || []).find(x => x.note_id === id);
      return { kind: 'note', chart: chart, id: id, status: note ? note.status : 'Open', pinned: !!note && note.pin !== 'free', min: n.classList.contains('ftag') };
    }
    const b = e.target.closest('.fbox');
    if (b) {
      const id = b.dataset.id, kind = b.dataset.kind;
      if (kind === 'step') { const s = v.steps.find(x => x.key === id); return { kind: 'step', chart: chart, id: id, step_no: s.step_no, name: s.action, sop_type: v.sop ? v.sop.sop_type : null }; }
      if (kind === 'section') { const s = v.sections.find(x => String(x.section) === id); return { kind: 'section', chart: chart, id: id, name: s ? s.name : '' }; }
      return { kind: kind, chart: chart, id: id };
    }
    const a = e.target.closest('.farrow');
    if (a) {
      const id = a.dataset.arrow;
      if (chart === 'steps') {
        const p = id.split('>'), no = k => (v.steps.find(x => x.key === k) || {}).step_no;
        return { kind: 'arrow', chart: chart, id: id, needs: false, from_no: no(p[0]), to_no: no(p[1]) };
      }
      const g = v.layout.graph.arrows.find(x => x.id === id);
      return { kind: 'arrow', chart: chart, id: id, needs: !!(g && g.needs) };
    }
    return { kind: 'empty', chart: chart, section: chart === 'steps' ? v.section.section : null };
  }
  /* wire(svg, chart, v): the right-click menu of one chart; v = that chart's view */
  function wire(svg, chart, v) {
    wireWindow();
    svg.oncontextmenu = e => {
      e.preventDefault();
      let t = targetOf(e, chart, v);
      /* a right-click on one of 2 or more picked steps: the menu of the picks (part 21.2) */
      const picked = chart === 'steps' ? S().pickedKeys() : [];
      if (t.kind === 'step' && picked.length > 1 && picked.indexOf(t.id) >= 0) { t = { kind: 'picked', chart: chart, nos: S().pickedNos() }; }
      const m = ENGINE_MENUS.menuFor(t, v.locked ? v.lock_text : null, !!v.read_only);
      const p = F().svgPoint(svg, e);
      openMenu(m, e.clientX, e.clientY, act => run(act, t, chart, p));
    };
  }
  /* ---- the actions: each one does what its button does ---- */
  async function run(act, t, chart, p) {
    const f = F();
    switch (act) {
      case 'edit-section': case 'view-section': await f.selectSection(t.id); return f.openSectionForm(Number(t.id));
      case 'connect': return f.connectFrom(t.id);
      case 'add-after': return f.openAddSection(Number(t.id));
      case 'add-end': return f.openAddSection(null);
      case 'earlier': return f.moveSectionDir(Number(t.id), 'up');
      case 'later': return f.moveSectionDir(Number(t.id), 'down');
      case 'retire-section': return f.openRetireSection(Number(t.id));
      case 'renumber': return APP_RENUMBER.open(Number(t.id));
      case 'renumber-all': return APP_RENUMBER.open(null);
      case 'note': return N().openNoteForm(t.kind === 'arrow' ? { pin: 'arrow', pin_ref: t.id, label: 'arrow ' + t.id.replace('>', ' → ') } : { pin: 'box', pin_ref: t.id, label: f.boxLabel(t.id, t.kind) }, chart);
      case 'note-here': return N().noteAt(p, chart);
      case 'remove-arrow': { const a = t.id.split('>'); return f.arrow(a[0], a[1], 'remove'); }
      case 'edit-note': return N().openNoteEdit(Number(t.id));
      case 'done': return N().noteChange('noteClose', Number(t.id));
      case 'reopen': return N().noteChange('noteReopen', Number(t.id));
      case 'min': return N().setMin(Number(t.id), true);
      case 'show': return N().setMin(Number(t.id), false);
      case 'unpin': return N().unpin(Number(t.id), chart === 'steps' ? ui().stepsView : ui().view);
      case 'delete-note': return N().askDelete(Number(t.id));
      case 'edit-step': await f.selectStep(t.id); return S().openStepForm(t.id);
      case 'add-step': await f.selectStep(t.id); return S().openAddStep('step', t.id);
      case 'add-sub': await f.selectStep(t.id); return S().openAddStep('sub', t.id);
      case 'insert-proc': await f.selectStep(t.id); return APP_PROC.openInsert(t.id);
      case 'up': await f.selectStep(t.id); return S().moveStepDir('up');
      case 'down': await f.selectStep(t.id); return S().moveStepDir('down');
      case 'retire-step': await f.selectStep(t.id); return S().openRetireStep();
      case 'club': return S().clubPicked();
      case 'unpick': return S().clearPicks();
      default: throw new Error('ui menu: no action "' + act + '"');
    }
  }

  /* ---- double-click (part 17.3): two clicks on the same box within 0.45 s, also across a redraw ---- */
  let last = null;
  /* clicked(id, kind, chart, v) → true when this click makes a double-click (handled here) */
  function clicked(id, kind, chart, v) {
    const now = Date.now();
    const dbl = !!last && last.id === id && last.chart === chart && now - last.t < 450;
    last = dbl ? null : { id: id, chart: chart, t: now };
    if (!dbl) { return false; }
    if (kind === 'section') { log('double-click: section ' + id); guard('ui doubleClick', async () => { await F().selectSection(id); return F().openSectionForm(Number(id)); }); return true; }
    if (kind === 'step' && !v.locked) { log('double-click: step ' + id); guard('ui doubleClick', async () => { await F().selectStep(id); return S().openStepForm(id); }); return true; }
    return false;
  }

  /* ---- connect by dragging the dot (part 17.2): a dashed line follows the pointer; let go on a section box ---- */
  let link = null;
  function boxAt(svg, e) { const el = document.elementFromPoint(e.clientX, e.clientY); const b = el ? el.closest('.fbox') : null; return b && svg.contains(b) ? b : null; }
  function dotDown(svg, e, chart, v) {
    const d = e.target.closest('.fdot');
    if (!d || chart !== 'sections' || v.locked) { return false; }
    const from = d.dataset.dot, box = v.layout.boxes[from];
    const x = box.x + box.w / 2, y = box.y + box.h;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'connect-line');
    for (const [k, val] of [['x1', x], ['y1', y], ['x2', x], ['y2', y]]) { line.setAttribute(k, val); }
    svg.appendChild(line);
    link = { from: from, line: line, over: null };
    try { svg.setPointerCapture(e.pointerId); } catch (x2) { /* the drag still works without capture */ }
    e.preventDefault();
    return true;
  }
  function dotMove(svg, e) {
    if (!link) { return false; }
    const p = F().svgPoint(svg, e);
    link.line.setAttribute('x2', p.x); link.line.setAttribute('y2', p.y);
    const t = boxAt(svg, e);
    if (link.over && link.over !== t) { link.over.classList.remove('drop-target'); }
    link.over = t && t.dataset.kind === 'section' && t.dataset.id !== link.from ? t : null;
    if (link.over) { link.over.classList.add('drop-target'); }
    return true;
  }
  function dotUp(svg, e) {
    if (!link) { return false; }
    const l = link;
    link = null;
    l.line.remove();
    if (l.over) { l.over.classList.remove('drop-target'); }
    const t = boxAt(svg, e);
    if (t && t.dataset.kind === 'section' && t.dataset.id !== l.from) { log('connect ' + l.from + ' → ' + t.dataset.id); guard('ui connect', () => F().arrow(l.from, t.dataset.id, 'add')); }
    return true;
  }

  return { wire, openMenu, clicked, dotDown, dotMove, dotUp, closeMenu };
})();
