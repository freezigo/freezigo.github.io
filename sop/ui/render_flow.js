/* SOP Builder screen builders for the Flow tab (example_flow.md parts 4,
   6, 8, 11, 14, 15, 16 and 18): the toolbar with the Short / Full switch,
   the number tiles, the how-to-read line with the icon legend, the three
   columns with the lines that resize them (Before you start and chart B
   with the section boxes; chart C of the clicked section with its head;
   the details: the step card or the section details), the notes and
   their tags, the drop line, the loose notes and the texts to check. Charts are SVG from
   the engine's layout, boxes and notes as foreignObject HTML so text
   wraps; the icons come from ui/render_icons.js. The forms live in
   ui/render_flow_forms.js. HTML from data only. Classic script (global
   RENDER_FLOW). */
const RENDER_FLOW = (function () {
  const R = RENDER;
  const esc = R.esc, show = R.show;
  const CLASS = { name: 'l1', count: 'l2', readings: 'lr', rules: 'lk', ends: 'le', est: 'l3', note: 'l4', text: 'lt', ids: 'li' };
  const PAD = 20;   // a column's padding, border and scroll bar, added to a chart's width for the column's width

  /* ---- boxes, notes, arrows ---- */
  /* a section box and a grey input box carry the connect dot (part 17.2) while the revision can change */
  function boxHtml(b, sel, locked) {
    let inner = b.ref ? '<span class="fref">' + esc(b.ref) + '</span>' : '';
    for (const l of b.lines) { inner += l.k === 'icons' ? '<div class="lic">' + RENDER_ICONS.counts(l.icons) + '</div>' : '<div class="' + (CLASS[l.k] || 'lx') + '">' + esc(l.t) + '</div>'; }
    if (b.kind === 'input') { inner += '<div class="l2 muted">input from another SOP</div>'; }
    if (!locked && (b.kind === 'section' || b.kind === 'input')) { inner += '<span class="fdot" data-dot="' + esc(b.id) + '" title="Drag onto another box to draw a Needs arrow"></span>'; }
    /* build 65: the Input and Output boxes say what a click does */
    const tip = b.kind === 'io' ? ' title="Click: ' + (b.id === 'output' ? 'Output to' : 'Input from') + ' on the Header tab"' : '';
    return '<div class="fbox kind-' + esc(b.kind) + (b.band ? ' band-' + esc(b.band) : '') + (sel === b.id ? ' selected' : '') + '" data-id="' + esc(b.id) + '" data-kind="' + esc(b.kind) + '"' + tip + '>' + inner + '</div>';
  }
  /* a note: drag it by any part but its buttons; it stays with its box, step or arrow (parts 14 and 18.3) */
  /* build 66 (spec/example_notes_list.md part 2): a note in another person's copy: Done or Open again on every note, Edit and ✕ on
     one's own, the fold button on all */
  function otherCopyButtons(n, v) {
    const done = n.status === 'Done', id = esc(n.note_id);
    const mine = String(n.written_by || '').trim().toLowerCase() === String(v.me || '').trim().toLowerCase();
    return '<div class="nbtn"><button class="btn-note-' + (done ? 'reopen' : 'done') + '" data-note="' + id + '">' + (done ? 'Open again' : 'Done') + '</button> ' +
      (mine && !done ? '<button class="btn-note-edit" data-note="' + id + '">Edit</button> ' : '') +
      '<button class="btn-note-min" data-note="' + id + '" title="Minimise: fold into a small tag">–</button>' +
      (mine ? ' <button class="btn-note-del" data-note="' + id + '" title="Delete note">✕</button>' : '') + '</div>';
  }
  function noteHtml(n, locked, readOnly, v) {
    const done = n.status === 'Done', id = esc(n.note_id);
    return '<div class="fnote' + (done ? ' done' : '') + (locked ? '' : ' movable') + '" data-note="' + id + '" title="' + (locked ? '' : 'Drag the note to move it') + '">' +
      '<div class="nhead">✎ ' + id + ' <span class="muted">' + esc(n.written_by) + ' ' + esc(String(n.written_at).slice(0, 10)) + (done ? ' · Done ' + esc(n.closed_by) + ' ' + esc(String(n.closed_at).slice(0, 10)) : '') + '</span></div>' +
      '<div class="ntext" title="' + esc(n.text) + '">' + esc(n.text) + '</div>' +
      /* build 50: someone else's copy: no button (example_rights.md part 6.7) */
      (readOnly ? (v && v.notes_ok ? otherCopyButtons(n, v) : '') :
      /* a Released revision: Done or Open again only (build 31) */
      locked ? '<div class="nbtn"><button class="btn-note-' + (done ? 'reopen' : 'done') + '" data-note="' + id + '">' + (done ? 'Open again' : 'Done') + '</button></div>' :
        '<div class="nbtn"><button class="btn-note-' + (done ? 'reopen' : 'done') + '" data-note="' + id + '">' + (done ? 'Open again' : 'Done') + '</button> ' +
        (done ? '' : '<button class="btn-note-edit" data-note="' + id + '">Edit</button> ') +
        '<button class="btn-note-min" data-note="' + id + '" title="Minimise: fold into a small tag">–</button> <button class="btn-note-del" data-note="' + id + '" title="Delete note">✕</button></div>') + '</div>';
  }
  /* a minimised note: a small tag at the corner of its box (part 18.3); a click shows it in full */
  function tagHtml(n) { return '<button class="ftag" data-note="' + esc(n.note_id) + '" title="Note ' + esc(n.note_id) + ': ' + esc(n.text) + ' (click to show in full)">✎' + esc(n.note_id) + '</button>'; }
  function notesSvg(v) {
    let h = '';
    for (const n of v.notes) {
      const p = v.note_layout.notes[n.note_id];
      if (p) { h += p.min ? fo(p, tagHtml(n), 'fo-note fo-tag') : fo(p, noteHtml(n, v.locked, v.read_only, v), 'fo-note'); }
    }
    return h;
  }
  function arrowSvg(a, g, selected) {
    const dashed = g && g.style === 'dashed';
    const id = a.id || (a.from + '>' + a.to);
    const cls = 'farrow' + (dashed ? ' dashed' : '') + (selected === id ? ' selected' : '') + (g && g.needs === false ? ' setup' : '');
    let h = '<g class="' + cls + '" data-arrow="' + esc(id) + '"><line class="line" x1="' + a.x1 + '" y1="' + a.y1 + '" x2="' + a.x2 + '" y2="' + a.y2 + '" marker-end="url(#fhead)"></line>' +
      '<line class="hit" x1="' + a.x1 + '" y1="' + a.y1 + '" x2="' + a.x2 + '" y2="' + a.y2 + '"></line>';
    if (g && g.label) { h += '<text class="flabel" x="' + a.lx + '" y="' + a.ly + '">' + esc(g.label) + '</text>'; }
    return h + '</g>';
  }
  function fo(p, html, cls) { return '<foreignObject' + (cls ? ' class="' + cls + '"' : '') + ' x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '"><div xmlns="http://www.w3.org/1999/xhtml" class="fo">' + html + '</div></foreignObject>'; }
  const DEFS = '<defs><marker id="fhead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#333"></path></marker></defs>';
  const size = v => ({ w: Math.max(v.note_layout.width, v.layout.width) + 4, h: Math.max(v.note_layout.height, v.layout.height) + 4 });

  /* chartB(v, ui): v = ENGINE_CHART.flowView(...); ui = { selected, selectedArrow }; the chart never grows past 100 % (CSS max-width) */
  function chartB(v, ui) {
    if (v.layout.error) { return '<p class="refusal flow-error">' + esc(v.layout.error) + '</p>'; }
    const L = v.layout, S = size(v);
    let h = '<svg class="flow-svg" id="flow-svg" data-chart="sections" viewBox="0 0 ' + S.w + ' ' + S.h + '" width="' + S.w + '" height="' + S.h + '" xmlns="http://www.w3.org/2000/svg">' + DEFS;
    for (const a of L.arrows) { h += arrowSvg(a, L.graph.arrows.find(x => x.id === a.id), ui.selectedArrow); }
    for (const b of L.graph.boxes) { h += fo(L.boxes[b.id], boxHtml(b, ui.selected, v.locked)); }
    return h + notesSvg(v) + '</svg>';
  }
  /* chartC(sv, ui): sv = ENGINE_CHART.stepsChartView(...); ui = { step }; with a hidden drop line for drags (part 8) */
  function chartC(sv, ui) {
    const L = sv.layout, S = size(sv);
    let h = '<svg class="flow-svg steps" id="steps-svg" data-chart="steps" viewBox="-2 -10 ' + (S.w + 2) + ' ' + (S.h + 10) + '" width="' + (S.w + 2) + '" height="' + (S.h + 10) + '" xmlns="http://www.w3.org/2000/svg">' + DEFS;
    for (const a of L.chain) { h += arrowSvg(Object.assign({ id: a.from + '>' + a.to }, a), { style: 'solid' }, null); }
    for (const r of L.refs) {
      const rid = r.from + '>' + r.to;
      const d = 'M' + r.x1 + ' ' + r.y1 + ' Q ' + r.mx + ' ' + r.y1 + ' ' + r.mx + ' ' + r.my + ' Q ' + r.mx + ' ' + r.y2 + ' ' + r.x2 + ' ' + r.y2;
      h += '<g class="farrow dashed ref" data-arrow="' + esc(rid) + '"><path class="line" d="' + d + '" marker-end="url(#fhead)"></path><path class="hit" d="' + d + '" fill="none"></path>' +
        '<text class="flabel" x="' + (r.mx + 4) + '" y="' + (r.ly === undefined ? r.my : r.ly) + '">' + esc(r.label) + '</text></g>';
    }
    for (const b of L.graph.boxes) {
      const linked = b.link ? (/^Standard/.test(b.link) ? ' linked-std' : ' linked-rev') : '';
      h += fo(L.boxes[b.id], '<div class="fbox sbox' + (b.band ? ' band-' + esc(b.band) : '') + linked + (ui.step === b.id ? ' selected' : '') + '" data-id="' + esc(b.id) + '" data-kind="step"' + (b.link ? ' data-link="' + esc(b.link) + '"' : '') + '>' +
        '<div class="l1" title="' + esc(b.line1 + (b.link ? ' · ' + b.link : '')) + '">' + RENDER_ICONS.icons(b.icons, b.link ? { link: b.link } : null) + ' ' + esc(b.line1) + '</div><div class="l2' + (b.link && b.line2 === b.link ? ' lk' : '') + '">' + esc(b.line2) + '</div></div>');
    }
    h += '<line class="drop-line" id="drop-line" x1="-2" y1="0" x2="' + (L.width ? 302 : 0) + '" y2="0" visibility="hidden"></line>';
    return h + notesSvg(sv) + '</svg>';
  }

  /* bar(v, ui): the toolbar, one line; the mode, pending and refusal lines under it. ui.boxes = 'short' | 'full';
     its How to read shows only in Big view (CSS), at its right end, as the top line is hidden then (part 19.1) */
  function bar(v, ui) {
    const big = '<button id="btn-big"' + (ui.big ? ' class="active"' : '') + '>' + (ui.big ? 'Exit big view' : '⛶ Big view') + '</button>';
    const seg = '<span class="seg" id="boxes-switch">Boxes: <button id="btn-boxes-short"' + (v.boxes === 'short' ? ' class="on"' : '') + '>Short</button><button id="btn-boxes-full"' + (v.boxes === 'full' ? ' class="on"' : '') + '>Full</button></span>';
    const help = howTo('howto-big');
    /* build 72 (spec/example_fix_72.md part 4, page review rule 7.8): Boxes and Big view at the right end, the same place on every SOP */
    const view = '<span class="bar-view" id="bar-view">' + seg + ' ' + big + '</span>';
    /* build 66: another person's copy keeps its line and offers ✎ Add a note (spec/example_notes_list.md part 2) */
    if (v.locked) {
      /* build 71: the lock is said on the SOP line, once */
      return '<div class="flow-bar" id="flow-bar">' + help +
        (v.notes_ok ? '<button id="btn-add-note"' + (ui.mode === 'note' ? ' class="active"' : '') + '>✎ Add a note</button> ' : '') + view +
        (v.notes_ok ? '<div class="flow-mode muted" id="flow-mode">' + esc(ui.modeText || '') + '</div><div class="refusal" id="flow-refusal"></div>' : '') + '</div>';
    }
    /* the ＋ Add menu holds the three old buttons (part 17.4) */
    const add = '<span class="addmenu"><button id="btn-add-menu" aria-haspopup="true">＋ Add ▾</button><div class="ctx-menu add-menu" id="add-menu" hidden>' +
      '<button class="ctx-item" id="btn-add-section">Add a section at the end</button><button class="ctx-item" id="btn-draw-arrow">Draw a Needs arrow</button>' +
      '<button class="ctx-item" id="btn-add-note">Add a note</button></div></span>';
    return '<div class="flow-bar" id="flow-bar">' + help + add + ' ' + (ui.selectedArrow ? '<button id="btn-remove-arrow">Remove this arrow</button> ' : '') + view +
      '<div class="flow-mode muted" id="flow-mode">' + esc(ui.modeText || '') + '</div><div class="refusal" id="flow-refusal"></div></div>';
  }
  /* tiles(v, counts): the line of number tiles (part 16.3); counts = { vn_open, notes_open, release_fail, release_label } from the SOP view;
     release_label (a Released or Superseded revision) shows in place of the items that fail (example_release.md part 8.4) */
  function tiles(v, counts) {
    const st = v.stats;
    const tile = (n, word, id, tab) => (tab ? '<button class="tile link" id="' + id + '" data-tab="' + tab + '"' : '<div class="tile" id="' + id + '"') + '><b>' + esc(n) + '</b> <span>' + esc(word) + (tab ? ' ▸' : '') + '</span>' + (tab ? '</button>' : '</div>');
    const w = (n, one, many) => (n === 1 ? one : many);
    return '<div class="flow-tiles" id="flow-tiles">' + tile(st.sections, w(st.sections, 'section', 'sections'), 'tile-sections') + tile(st.steps, w(st.steps, 'step', 'steps'), 'tile-steps') +
      tile(st.sub_steps, w(st.sub_steps, 'sub-step', 'sub-steps'), 'tile-subs') + tile(st.holds, w(st.holds, 'hold', 'holds'), 'tile-holds') + tile(st.readings, w(st.readings, 'reading', 'readings'), 'tile-readings') +
      tile(counts.vn_open, w(counts.vn_open, 'value needed', 'values needed'), 'tile-vn', 'vn') + tile(counts.notes_open, w(counts.notes_open, 'note open', 'notes open'), 'tile-notes') +
      (counts.release_label ? '<button class="tile link" id="tile-release" data-tab="release"><span>' + esc(counts.release_label) + ' ▸</span></button>'
        : (counts.release_fail === null || counts.release_fail === undefined ? '' : tile(counts.release_fail + ' of 8', 'release items fail', 'tile-release', 'release'))) +
      (counts.texts ? '<button class="tile link" id="tile-texts"><b>' + esc(counts.texts) + '</b> <span>' + w(counts.texts, 'text to check', 'texts to check') + ' ▸</span></button>' : '') + '</div>';
  }
  /* howTo(id): "ⓘ How to read" and its panel, opened by the mouse over it (CSS :hover) or a click (:focus):
     the Flow tab in seven lines (the step card line of part 20.5, the pick line of part 21.2), then the marks (part 19.1). In the top line on every page; in Big view at the
     right end of the toolbar */
  const HOW = ['Read top to bottom. Each box is a section. An arrow means the lower box needs the upper box done first.',
    'Click a box: its steps show in the middle column. Click a step: its full card shows in the right column.',
    'Right-click a box, an arrow, a note or an empty spot for its menu. Double-click a box or a step to edit it.',
    'Right-click a row of the step card to edit only that field.',
    'Ctrl+click steps in the middle column to pick several; right-click a picked one to club them.',
    'Drag a box or a step to change the order. Drag the dot under a box onto another box to draw a Needs arrow.',
    'Drag the line between two columns to make a column wider.'];
  function howTo(id) {
    return '<div class="howto" id="' + esc(id) + '" tabindex="0"><span class="howto-label">ⓘ How to read</span><div class="howto-pop" role="tooltip">' +
      '<div class="howto-head">The Flow tab</div><ul class="howto-list">' + HOW.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
      '<div class="howto-head">The marks</div>' + RENDER_ICONS.legendList() + '</div></div>';
  }
  /* before(v): the cards of sections 1 and 2 at the top of the sections column (part 16.4) */
  function before(v) {
    return '<div class="before" id="flow-before"><div class="bhead">Before you start</div>' + v.before.map(c => '<button class="bcard" data-tab="' + esc(c.tab) + '" id="bcard-' + esc(c.section) + '"><b>' + esc(c.section) + ' ' + esc(c.name) + '</b>' +
      '<span class="' + (c.warn ? 'warn' : 'muted') + '">' + esc(c.line) + '</span></button>').join('') + '</div>';
  }
  /* ctxMenu(m): a right-click menu (part 17.1); m = ENGINE_MENUS.menuFor(...); m.line = why an item is missing (the step card, part 20) */
  function ctxMenu(m) {
    return '<div class="ctx-menu" id="ctx-menu" role="menu"><div class="ctx-title">' + esc(m.title) + '</div>' +
      m.items.map(i => '<button class="ctx-item" role="menuitem" data-act="' + esc(i.act) + '">' + esc(i.label) + '</button>').join('') +
      (m.line ? '<div class="ctx-line">' + esc(m.line) + '</div>' : '') + (m.lock ? '<div class="ctx-lock">' + esc(m.lock) + '</div>' : '') + '</div>';
  }
  /* flowTab(v, ui, counts): the toolbar, the tiles and the three columns; the middle and the right column
     are filled by APP_STEPS; counts as tiles() */
  function flowTab(v, ui, counts) {
    /* a revision with no sections yet (a blank start, example_new_sop.md part 6): the frame as usual and the way to the first section */
    const none = !v.sections.length;
    const hint = none ? (v.locked ? '' : '<p class="muted hint" id="flow-empty">No sections yet. Click ＋ Add, then Add a section at the end. The first section is 3: sections 1 and 2 are Safety and PPE, and Materials, tools and machines.</p>')
      : (!v.layout.error && !v.has_needs && !v.locked && v.sections.length > 1 ? (v.sections.some(x => x.needs_note)
        ? '<p class="muted hint">No Needs arrows yet. Draw them from the Needs note on each box. The build 15 import fills only the Needs fields that are still empty.</p>'
        : '<p class="muted hint">No Needs arrows yet. Drag the dot under a box onto the box that needs it.</p>') : '');
    const wb = v.layout.error ? 320 : Math.max(280, size(v).w + PAD);
    return bar(v, ui) + tiles(v, counts) + '<div class="flow-work" id="flow-work">' +
      '<div class="flow-col col-b" id="col-b" style="flex-basis:' + wb + 'px">' + before(v) + hint + chartB(v, ui) + looseNotes(v) + '</div>' + split('b') +
      '<div class="flow-col col-c" id="col-c"></div>' + split('c') +
      '<div class="flow-col col-d" id="col-d"><div id="flow-mentions"></div><div id="flow-form"></div><div id="step-area"></div></div></div>';
  }
  /* the line between two columns: drag it to change the width of the column on its left, double-click for its own width (part 18.2) */
  function split(col) {
    return '<div class="col-split" id="split-' + col + '" data-col="' + col + '" role="separator" aria-orientation="vertical" title="Drag to change the width; double-click for its own width"></div>';
  }
  /* middle(v, sv, ui): the middle column (part 15); sv = stepsChartView of the selected section, or null */
  function middle(v, sv, ui) {
    if (!sv) { return '<p class="muted pane-empty">Click a section box to see its steps here.</p>'; }
    const s = sv.section;
    const needs = Array.isArray(s.needs_sections) && s.needs_sections.length ? s.needs_sections.join(', ') : (Array.isArray(s.needs_sops) && s.needs_sops.length ? s.needs_sops.join(', ') : 'none');
    const num = x => (x === null || x === undefined || x === '' ? 'needed' : esc(x));
    let h = '<div class="pane-head"><h3>Section ' + esc(s.section) + ' ' + esc(s.name) + '</h3><p class="pane-btns">';
    h += '<button id="btn-sec-edit">' + (v.locked ? 'Section fields' : 'Edit section') + '</button> ';
    /* build 40 (example_renumber.md part 8): short names; a section moves by a drag on the sections chart */
    if (!v.locked) { h += '<button id="btn-sec-add-after" title="Add a section after this one">Add section</button> <button id="btn-sec-retire">Delete section</button> <button id="btn-sec-renumber" title="Number the steps of this section in order: ' + esc(s.section) + '.1, ' + esc(s.section) + '.2, …">Renumber</button>'; }
    h += '</p><div class="muted">Needs: ' + esc(needs) + ' · Est min: ' + num(s.est_min) + ' · Skilled: ' + num(s.skilled) + ' · Helper: ' + num(s.helper) + ' · Notes: ' + esc(sv.count.open_here) + ' open</div></div>';
    /* a section with no steps yet: the way to its first step (example_new_sop.md part 6) */
    const first = !sv.steps.length && !v.locked ? '<p class="pane-empty" id="steps-empty">No steps yet. <button id="btn-step-first">Add the first step</button></p>' : '';
    return h + first + chartC(sv, ui);
  }
  /* the middle column's width: chart C's width, at least the head's */
  const middleWidth = sv => (sv ? Math.max(300, size(sv).w + 2 + PAD) : 280);
  /* sectionDetails(sec): the right column while a section is clicked and no step (part 15) */
  function sectionDetails(sec) {
    const list = v => (Array.isArray(v) ? (v.length ? v.join(', ') : '(none)') : null);
    const setup = sec.needs_setup === true ? 'Y' : (sec.needs_setup === false ? 'N' : null);
    const wait = sec.wait_after === null || sec.wait_after === undefined ? null : 'after section ' + sec.wait_after + (sec.wait_min === null || sec.wait_min === undefined ? '' : ', ' + sec.wait_min + ' min');
    return '<div class="card sec-details" id="sec-details"><h3>Section ' + esc(sec.section) + ' details</h3>' + R.kvTable([['Needs note', sec.needs_note], ['Ends with', sec.ends_with], ['Restart step', sec.restart_step],
      ['Max wait', sec.max_wait], ['Manpower', sec.manpower], ['Skilled', sec.skilled], ['Helper', sec.helper], ['Est min', sec.est_min], ['Needs sections', list(sec.needs_sections)], ['Needs SOPs', list(sec.needs_sops)],
      ['Set-up this shift', setup], ['Wait', wait], ['Any time steps', list(sec.any_time_steps)], ['Chart ref', sec.source_ref]]) +
      '<p class="muted">Click a step to see its details here.</p></div>';
  }
  /* stepButtons(sv, ui): ▲ ▼, Add step, Add sub-step and Delete for the selected step, above its card (build 40) */
  function stepButtons(sv, ui) {
    if (!ui.step || sv.locked || !sv.steps.some(s => s.key === ui.step)) { return ''; }
    const st = sv.steps.find(s => s.key === ui.step), sub = String(st.step_no).split('.').length > 2;
    return '<p class="step-btns"><button class="btn-move" id="btn-step-up" data-dir="up" title="Move up (with its sub-steps)">▲</button> <button class="btn-move" id="btn-step-down" data-dir="down" title="Move down (with its sub-steps)">▼</button>' +
      ' <button id="btn-step-add" title="A step after ' + esc(st.step_no) + (sub ? '' : ' and its sub-steps') + '">Add step</button> <button id="btn-step-sub" title="A sub-step under ' + esc(st.step_no) + '">Add sub-step</button>' +
      ' <button id="btn-step-retire">' + (sub ? 'Delete sub-step' : 'Delete step') + '</button>' +
      (sv.sop && sv.sop.sop_type === 'Process' ? '' : ' <button id="btn-step-insert">Insert a process SOP after this step</button>') + '</p>';
  }
  function looseNotes(v) {
    if (!v.loose_notes.length) { return ''; }
    return '<div class="card loose" id="flow-loose"><b>Loose notes</b> <span class="muted">their box or arrow is gone</span>' + v.loose_notes.map(n => noteHtml(n, v.locked, v.read_only, v)).join('') + '</div>';
  }
  /* textsList(list): the texts to check (part 18.1); list = ENGINE_CHART.textsToCheck(...) */
  const FIELD = { needs_note: 'Needs note', ends_with: 'Ends with', max_wait: 'Max wait', restart_step: 'Restart step', manpower: 'Manpower', action: 'Action', why: 'Why',
    warning: 'Warning', tool: 'Tool', material: 'Material', check: 'Check', if_fail: 'If fail', skip_if: 'Skip if', remark: 'Remark', step_text: 'Step text', value_needed: 'Value needed',
    who_does_it: 'Who does it', input_from: 'Input from', output_to: 'Output to', purpose: 'Purpose', scope: 'Scope', process_flow: 'Process flow', how_to_use: 'How to use',
    setup_rule: 'Set-up rule', hold_points: 'Hold points' };
  /* whereOf(m): "Step 3.7 · Check", "Section 3 · Ends with", "VN-0007 · Step text", "Header · Hold points" */
  function whereOf(m) {
    return (m.table === 'sections' ? 'Section ' + m.row_id : (m.table === 'steps' ? 'Step ' + String(m.row_id).split(' ')[0] : m.row_id)) + ' · ' + (FIELD[m.field] || m.field);
  }
  function textsList(list) {
    if (!list || !list.length) { return ''; }
    const where = m => whereOf(m);
    /* a text from a process SOP names a step number of that SOP (build 30): "3.1 of BRAZE-CU (here 6.5)" */
    const of = (m, x) => x.of || m.link_sop || null;
    const name = (m, x) => (of(m, x) ? x.old + ' of ' + of(m, x) + (x.new === null ? ' (not in this copy)' : ' (here ' + x.new + ')') : x.old + (x.new === null ? ' (retired)' : ' (now ' + x.new + ')'));
    const rows = list.map(m => ({ where: where(m), names: m.mentions.map(x => name(m, x)).join(', '), text: m.text }));
    const linked = list.some(m => m.link_sop || m.mentions.some(x => x.of));
    return '<div class="card texts-check" id="texts-check"><div class="tc-head"><b>Texts to check:</b> they name a step number that has changed since they were written. Fix them on the Texts to check tab. ' +
      (linked ? 'A text from a process SOP that names one of its own step numbers is fixed in that process SOP (Standard) or here (Revised). ' : '') +
      '<button id="btn-texts-open">Open Texts to check</button> <button id="btn-texts-close">Close</button></div>' + R.grid([['Where', 'where'], ['Names', 'names'], ['Text', 'text']], rows) + '</div>';
  }

  return { flowTab, middle, middleWidth, sectionDetails, stepButtons, ctxMenu, chartB, chartC, textsList, whereOf, noteHtml, show, howTo, FIELD };
})();
