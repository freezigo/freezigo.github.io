/* SOP Builder screen builders for one section: the section card, the
   step table and the read-only step cards (example.md parts 6 and 8).
   HTML from data only. Classic script (global RENDER_SECTION). */
const RENDER_SECTION = (function () {
  const R = RENDER;
  const esc = R.esc, show = R.show, lines = R.lines, list = R.list;
  /* a draft Gujarati line (it ends with "(draft)", build 33) shows lighter; key given = the card of an open revision: "Gujarati checked";
     attr = more attributes of the line (the step card's data-row, build 35) */
  function gu(text, key, attr) {
    const a = attr || '';
    if (!text) { return '<div class="gu empty"' + a + '>(no Gujarati line: the floor copy shows English only)</div>'; }
    if (!ENGINE_TEXT.guDraft(text)) { return '<div class="gu"' + a + '>' + esc(text) + '</div>'; }
    return '<div class="gu draft"' + a + '>' + esc(text) + (key ? ' <button class="btn-gu-check" data-key="' + esc(key) + '" title="Read it, fix it if needed, then click: (draft) comes off">Gujarati checked</button>' : '') + '</div>';
  }
  function vnLabel(vn) {
    return 'No. ' + esc(vn.no) + ' (' + (vn.state === 'open' ? 'open' + (vn.blocks_release ? ', blocks release' : '') : 'given') + ')';
  }

  /* sectionView(v, vnById): v = ENGINE.sectionView(...); vnById = Values Needed rows by vn_id (for the labels) */
  function sectionView(v, vnById) {
    const s = v.section;
    /* the lock line: a Released or Superseded revision (engine), or build 50 the good version or someone else's copy (APP.showSection) */
    const locked = !!v.sop.lock_text;
    let h = '<div class="card"><h2>Section ' + esc(s.section) + ' ' + esc(s.name) +
      ' <span class="muted">' + esc(s.steps_count) + ' steps' + (s.first_step ? ', ' + esc(s.first_step) + ' to ' + esc(s.last_step) : '') + (s.sub_steps ? ' (' + esc(s.sub_steps) + ' sub-step' + (s.sub_steps > 1 ? 's' : '') + ' not counted)' : '') + '</span></h2>';
    h += s.name_gu ? '<div class="gu">' + esc(s.name_gu) + '</div>' : '<div class="gu empty">(no Gujarati section name: the floor copy shows English only)</div>';
    h += R.kvTable([['Needs note', s.needs_note], ['Ends with', s.ends_with], ['Restart', s.restart_step], ['Max wait', s.max_wait],
      ['Manpower', s.manpower], ['Est min', s.est_min], ['Chart ref', s.source_ref],
      ['Clean Needs (set on the Flow tab)', 'Needs sections ' + list(s.needs_sections) + ' · Needs SOPs ' + list(s.needs_sops) +
        ' · Needs set-up ' + show(s.needs_setup) + ' · Wait after ' + show(s.wait_after) + ' · Wait min ' + show(s.wait_min) +
        ' · Any time steps ' + list(s.any_time_steps) + ' · Manpower people ' + show(s.manpower_people), 'raw'],
      ['Values Needed in this section', esc(s.vn_rows) + ' rows (' + esc(s.vn_open) + ' open, ' + esc(s.vn_given) + ' given)', 'raw']]) +
      (locked ? '<p class="ok">' + esc(v.sop.lock_text) + '</p>'
        : '<p><button class="btn-add" data-section="' + esc(s.section) + '" data-after="" data-kind="step">Add a step at the start of section ' + esc(s.section) + '</button></p>') + '</div>';
    if (!locked) {
      h += '<div class="club-bar">Tick 2 or 3 steps that follow each other (up to 6 checks), then <button id="btn-club">Club the ticked steps</button> ' +
        '<label><input type="checkbox" id="club-screen"> screen settings (up to 6 parts)</label> · the ▲ ▼ buttons move a step inside the section · each change asks its reason' +
        '<div class="refusal" id="club-refusal"></div></div>';
    }
    h += '<table class="grid steps"><tr><th></th><th>Seq</th><th>Step</th><th>Type</th><th>Key</th><th>Action</th><th>Target</th><th>Hold</th><th>Class</th><th></th></tr>';
    for (const st of v.steps) {
      h += '<tr class="step-row" data-key="' + esc(st.key) + '"><td><input type="checkbox" class="club-tick" data-key="' + esc(st.key) + '"></td><td>' + esc(st.seq) + '</td><td>' + esc(st.step_no) + '</td><td>' + esc(st.step_type) +
        '</td><td>' + esc(st.key) + '</td><td>' + lines(st.action) + gu(st.action_gu) +
        '</td><td>' + esc(st.target) + '</td><td>' + esc(st.hold) + '</td><td>' + esc(st.class) + '</td><td class="move">' +
        '<button class="btn-move" data-key="' + esc(st.key) + '" data-dir="up" title="Move up">▲</button><button class="btn-move" data-key="' + esc(st.key) + '" data-dir="down" title="Move down">▼</button></td></tr>';
    }
    h += '</table>';
    for (const st of v.steps) { h += stepCard(st, vnById, locked); }
    return locked ? h.replace(/<td><input type="checkbox" class="club-tick"[^>]*><\/td>/g, '<td></td>').replace(/<td class="move">.*?<\/td>/g, '<td></td>') : h;
  }

  /* the Hold and Photo required values in words (example_flow.md part 19.2) */
  function holdWords(hold) {
    if (hold === null || hold === undefined || hold === '') { return null; }
    return hold === 'N' ? 'N: no hold. The next step starts without a supervisor sign.'
      : hold + ': hold. The operator signs that the hold started; the supervisor signs the result before the next step starts.';
  }
  function photoWords(v) {
    return v === true ? 'Y: the operator takes a photo at this step on the Floor App (📷 photo needed).'
      : v === false ? 'N: the operator takes no photo at this step.' : v;
  }
  /* photoTools(st): the photo names of Photo ref with ✕ (the file stays), Add an OK photo, Add a BAD photo (build 34, example_new_sop.md part 12) */
  function photoTools(st) {
    const refs = Array.isArray(st.photo_ref) ? st.photo_ref : [];
    /* build 43 (example_pictures.md part 5): the Pictures the step names, with ✕, and Add a picture */
    const pics = (st.images || []).filter(m => m.kind === 'picture').map(m => m.name);
    return '<div class="photo-tools" data-key="' + esc(st.key) + '">' + refs.map(n => '<span class="pref">' + esc(n) + ' <button class="btn-photo-del" data-key="' + esc(st.key) + '" data-file="' + esc(n) +
      '" title="Take this photo off the step; the file stays in source\\Photos">✕</button></span>').join('') +
      pics.map(n => '<span class="pref">' + esc(n) + ' <button class="btn-pic-del" data-key="' + esc(st.key) + '" data-pic="' + esc(n) +
      '" title="Take this picture off the step; it stays in the SOP (Pictures tab)">✕</button></span>').join('') +
      '<button class="btn-photo-add" data-key="' + esc(st.key) + '" data-kind="OK">Add an OK photo</button> <button class="btn-photo-add" data-key="' + esc(st.key) + '" data-kind="BAD">Add a BAD photo</button>' +
      ' <button class="btn-pic-add" data-key="' + esc(st.key) + '">Add a picture</button>' +
      '<div class="photo-slot"></div></div>';
  }
  /* stepCard(st, vnById, locked): the read-only card of one step; its title line, Gujarati line and rows carry data-row: a right-click
     there edits only that row (example_flow.md part 20, build 35) */
  function stepCard(st, vnById, locked) {
    const vns = st.vn_ids.map(id => (vnById && vnById[id] ? vnLabel(vnById[id]) : esc(id)));
    /* Warning first, then Check with its Target and If fail, Why after Remark (Samrat 2026-11-12, part 19.2) */
    const rows = [['Warning', st.warning ? '⚠ ' + st.warning : null], ['Check', st.check],
      ['Target', 'Min ' + show(st.min) + ' · Max ' + show(st.max) + ' · Unit ' + show(st.unit) + ' · Limit status ' + esc(st.limit_status) + ' · <b>' + esc(st.target) + '</b>', 'raw'],
      ['If fail', st.if_fail],
      ['Type', esc(st.step_type) + ' · Class ' + esc(st.class) + ' · Signed by ' + esc(st.signed_by), 'raw'], ['Hold', holdWords(st.hold)],
      ['Tool', show(st.tool) + (st.gauge_id ? ' · Gauge ' + esc(st.gauge_id) : ''), 'raw'], ['Material', st.material], ['Skip if', st.skip_if],
      ['Repeat and time', 'Repeat count ' + show(st.repeat_count) + ' · Est min ' + show(st.est_min), 'raw'],
      ['Photo required', photoWords(st.photo_required)],
      ['Photos and pictures', RENDER_POP.thumbs(st.key, st.images || []) + (locked || st.link_mode === 'Standard' ? '' : photoTools(st)), 'raw'],
      ['Remark', st.remark], ['Why', st.why],
      ['Values Needed on this step', vns.length ? vns.join(', ') : 'none', 'raw'],
      ['Defects found at this step', st.defect_codes.length ? esc(st.defect_codes.join(', ')) : 'none listed', 'raw']]
      .concat(st.link_text ? [['Process SOP', RENDER_PROC.cardRow(st)]] : []);
    return '<div class="card step-card" id="step-' + esc(st.key) + '" data-key="' + esc(st.key) + '"><h3 data-row="Action">' + (st.icons ? RENDER_ICONS.icons(st.icons) + ' ' : '') + esc(st.step_no) + ' ' + lines(st.action) +
      (st.hold !== 'N' ? ' <span class="hold">HOLD ' + esc(st.hold) + '</span>' : '') +
      (st.link_text ? ' <span class="link-chip' + (st.link_mode === 'Standard' ? ' std' : '') + '">' + esc(st.link_text) + '</span>' : '') +
      ' <span class="muted">Key ' + esc(st.key) + ' · Seq ' + esc(st.seq) + '</span>' +
      (locked ? '' : ' <button class="btn-edit" data-key="' + esc(st.key) + '">Edit</button>' +
      ' <button class="btn-add" data-section="' + esc(st.section) + '" data-after="' + esc(st.key) + '" data-kind="step">Add a step after this one</button>' +
      ' <button class="btn-add" data-section="' + esc(st.section) + '" data-after="' + esc(st.key) + '" data-kind="sub">Add a sub-step under this one</button>' +
      (st.parts_count > 1 ? ' <button class="btn-split" data-key="' + esc(st.key) + '">Split into ' + esc(st.parts_count) + ' rows</button>' : '')) +
      '</h3><div class="split-slot" id="split-' + esc(st.key) + '"></div>' + gu(st.action_gu, locked || st.link_mode === 'Standard' ? null : st.key, ' data-row="Gujarati line"') + R.kvTable(rows, true) + '</div>';
  }

  /* splitForm(st): which part keeps the reading (Reading steps only), a reason, Split now */
  function splitForm(st) {
    let h = '<div class="split-form">';
    if (st.step_type === 'Reading') {
      h += '<label>The reading (' + esc(st.unit) + ') stays with part <select id="split-part"><option value="">choose</option>';
      for (let i = 1; i <= st.parts_count; i++) { h += '<option value="' + i + '">' + esc(i) + '</option>'; }
      h += '</select></label> ';
    }
    const sub = String(st.step_no).split('.').length > 2;
    h += '<label>New rows are <select id="split-kind"><option value="sub">sub-steps (' + esc(sub ? st.step_no.split('.').slice(0, 2).join('.') : st.step_no) + '.1, ...)</option>' +
      (sub ? '' : '<option value="step">steps (the next steps move up)</option>') + '</select></label> ';
    h += '<button id="btn-split-now">Split now</button> <button id="btn-split-cancel">Cancel</button>' +
      '<div class="refusal" id="split-refusal"></div><div class="note">A sub-step is part of the step above and is not counted. Example: Set laser machine is a step; power 500 W is a sub-step.</div></div>';
    return h;
  }

  return { sectionView, stepCard, splitForm, vnLabel };
})();
