/* SOP Builder screen builders: the top bar, the SOP list and the SOP page
   shell with its tabs. HTML strings from data; no arithmetic, no decisions
   beyond "is it empty". Classic script (global RENDER). Section screens:
   ui/render_section.js. Tab tables: ui/render_tabs.js. */
const RENDER = (function () {
  function esc(v) {
    if (v === null || v === undefined) { return ''; }
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function show(v) { return (v === null || v === undefined || v === '') ? '<span class="empty">(empty)</span>' : esc(v); }
  function lines(v) { return show(v).replace(/\n/g, '<br>'); }
  function list(v) { return Array.isArray(v) ? (v.length ? esc(v.join(', ')) : '<span class="empty">(empty)</span>') : show(v); }
  function yn(v) { return v === true ? 'Y' : (v === false ? 'N' : show(v)); }
  /* kvTable(pairs, named): named = each row carries its name as data-row (the step card, a right-click edits that row, build 35) */
  function kvTable(pairs, named) {
    let h = '<table class="kv">';
    for (const p of pairs) { h += '<tr' + (named ? ' data-row="' + esc(p[0]) + '"' : '') + '><th>' + esc(p[0]) + '</th><td>' + (p[2] === 'raw' ? p[1] : lines(p[1])) + '</td></tr>'; }
    return h + '</table>';
  }
  /* grid(columns, rows, cell): columns = [[label, field]]; cell(row, field) may give HTML */
  function grid(columns, rows, cell, cls) {
    let h = '<table class="grid' + (cls ? ' ' + cls : '') + '"><tr>';
    for (const c of columns) { h += '<th>' + esc(c[0]) + '</th>'; }
    h += '</tr>';
    if (!rows.length) { h += '<tr><td colspan="' + columns.length + '" class="empty">(no rows)</td></tr>'; }
    for (const r of rows) {
      h += '<tr' + (r.__attr || '') + '>';
      for (const c of columns) { h += '<td>' + (cell ? cell(r, c[1]) : lines(r[c[1]])) + '</td>'; }
      h += '</tr>';
    }
    return h + '</table>';
  }

  function topBar(cfg, status, folderName, editor, editors) {
    const folder = status.mode === 'folder' ? 'Folder: ' + esc(status.folder)
      : status.mode === 'memory' ? 'Test data in memory'
      : (folderName ? 'Folder remembered: ' + esc(folderName) + ' (click Open folder)' : 'No folder yet');
    let opts = '';
    for (const e of editors) { opts += '<option' + (e === editor ? ' selected' : '') + '>' + esc(e) + '</option>'; }
    /* How to read in the right corner (example_flow.md part 19.1); RENDER_FLOW loads after this file */
    const how = typeof RENDER_FLOW !== 'undefined' ? RENDER_FLOW.howTo('howto') : '';
    return how + '<span class="app">' + esc(cfg.app_name) + '</span> <span class="build">Build ' + esc(cfg.builder_build) + '</span>' +
      ' <span id="folder-status">' + folder + '</span>' +
      ' <button id="btn-open">Open folder</button> <button id="btn-pick">Pick folder</button>' +
      ' <label>Editor <select id="editor">' + opts + '</select></label>' +
      ' <button id="btn-home">SOP list</button>';
  }

  /* topBarOnline(cfg, me): the view-only page inside the Freezigo app (build 52): the way back, the name of the login, View only */
  function topBarOnline(cfg, me) {
    const back = '<a class="erp-back" href="' + esc((cfg.online && cfg.online.erp_url) || '../') + '">← Freezigo</a>';
    const who = me ? ' <span class="who">' + esc(me.name) + '</span> <span class="tag view-tag">View only</span>' : '';
    return back + ' <span class="app">' + esc(cfg.app_name) + '</span> <span class="build">Build ' + esc(cfg.builder_build) + '</span>' + who +
      (me ? ' <button id="btn-home">SOP list</button>' : '');
  }
  /* loginFirst(cfg): not logged in to the Freezigo app on this browser */
  function loginFirst(cfg) {
    return '<div class="card"><b>Log in to the Freezigo app first.</b><p>Then open SOP Builder from the menu (Make and service, after BOMs).</p>' +
      '<p><a href="' + esc((cfg.online && cfg.online.erp_url) || '../') + '">Open the Freezigo app</a></p></div>';
  }

  /* noAccess(): an ERP login that is not one of the SOP people (build 53; Samrat 2026-11-17 "2. b") */
  function noAccess() {
    return '<div class="card"><b>This login cannot read the SOPs.</b><p>Only the SOP people (Samrat, Raj, Divyal) read them. Ask Samrat.</p></div>';
  }

  /* sopList(view, builtOnly, statusOrder): view = ENGINE.sopList(...); statusOrder = SETS.sop_status */
  function sopList(view, builtOnly, statusOrder) {
    const meta = view.meta;
    let h = '<h1>SOP list</h1>';
    if (meta) {
      h += '<p class="muted">Data: build ' + esc(meta.data_build) + ', imported ' + esc(String(meta.imported_at).slice(0, 16).replace('T', ' ')) +
        ' (' + esc(meta.import_note) + ') · contract ' + esc(meta.contract_version) + '</p>';
    }
    h += '<p><label><input type="checkbox" id="built-only"' + (builtOnly ? ' checked' : '') + '> Built only</label> <span class="muted">(and SOPs started in the Builder)</span> ';
    const bs = view.by_status || {};
    h += '<span class="muted">' + (statusOrder || Object.keys(bs)).filter(k => bs[k]).map(k => esc(bs[k]) + ' ' + esc(k)).join(', ') +
      (view.copies ? ', ' + esc(view.copies) + (view.copies === 1 ? ' copy' : ' copies') : '') + '</span></p>';
    const rows = builtOnly ? view.rows.filter(r => r.status === 'Built' || r.current_rev) : view.rows;
    h += grid([['SOP ID', 'sop_id'], ['Rev', 'current_rev'], ['Status', 'status'], ['Edited in', 'edited_in'], ['Release', 'release'], ['Steps', 'steps_count'], ['Type', 'sop_type'], ['Level', 'level'], ['Title', 'title']],
      rows, function (r, f) {
        if (f === 'sop_id') {
          /* build 39: a copy sits right under its good version, with its name; build 50: and its owner */
          const tag = r.copy_of ? ' <span class="copy-tag">COPY: ' + esc(r.copy_name) + (r.owner ? ' (' + esc(r.owner) + ')' : '') + '</span>' +
            (r.main_changes ? ' · ' + RENDER_SYNC.tag(r.main_changes, r.sop_id) : '') : '';
          return (r.current_rev ? '<a href="#" class="sop-link" data-sop="' + esc(r.sop_id) + '">' + esc(r.sop_id) + '</a>' : esc(r.sop_id)) + tag;
        }
        if (f === 'release') { return r.release === null ? '<span class="empty">(no revision)</span>' : esc(r.release); }
        if (f === 'steps_count') { return r.current_rev ? esc(r.steps_count) : ''; }
        return show(r[f]);
      });
    return h;
  }

  const TABS = [['header', 'Header'], ['sections', 'Sections'], ['flow', 'Flow'], ['vn', 'Values Needed'], ['texts', 'Texts to check'], ['safety', '1 Safety and PPE'], ['materials', '2 Materials, tools and machines'],
    ['glossary', 'Glossary'], ['gauges', 'Gauges'], ['pictures', 'Pictures'], ['examples', 'Worked examples and tables'], ['release', 'Release check'],
    ['compare', 'Compare'], ['floor', 'Floor PDF'], ['routing', 'Routing'], ['revisions', 'Revisions'], ['history', 'History']];

  /* tabLabel(view, id): a tab's name with its count ("Values Needed (25 open)") */
  function tabLabel(view, id) {
    const t = TABS.find(x => x[0] === id);
    let label = t[1];
    if (id === 'vn') { label += ' (' + view.vn.open + ' open)'; }
    if (id === 'texts') { label += ' (' + (view.texts_count || 0) + ')'; }
    if (id === 'sections') { label += ' (' + view.sections.length + ')'; }
    if (id === 'release' && view.release) { label += ' (' + view.release.check.fail_count + ' open)'; }
    if (id === 'flow' && view.notes_open) { label += ' (' + view.notes_open + (view.notes_open === 1 ? ' note open)' : ' notes open)'); }
    return label;
  }
  /* sopPage(view): the SOP line (the heading, then the tabs drawn by tabsLine into #tabs) and an empty tab body (#tab-body);
     spec/example_look.md part 5. The SOP title shows under the pointer on the heading. */
  function sopPage(view) {
    const sop = view.sop, rev = view.rev;
    const h = '<h1 title="' + esc(sop.title) + '">' + esc(sop.sop_id) + ' <span class="muted">' + show(sop.current_rev) + ' · ' + esc(sop.status) + ' · Edited in: ' + esc(sop.edited_in) +
      (rev ? ' · Revision status: ' + esc(rev.status) : '') + (view.release ? ' · ' + esc(view.release.label) : '') +
      /* build 39: a copy says what it is a copy of; build 36 (example_release.md part 8.1): draft mode, and the revision still on the floor */
      (view.copy ? ' · <span class="copy-tag">' + esc(view.copy.line) + '</span>' + (view.main_changes ? ' · ' + RENDER_SYNC.tag(view.main_changes, sop.sop_id) : '') : '') +
      (view.draft_mode ? ' · <span class="draft-mode">Draft mode: no reason asked</span>' : '') +
      /* build 50 (example_rights.md part 5): what the open SOP is to the name at the top */
      (view.rights ? ' · <span class="rights-tag ' + esc(view.rights.kind.replace(' ', '-')) + '">' + esc(view.rights.tag) + '</span>' : '') +
      (view.floor_rev ? ' · <span class="floor-rev">On the floor: ' + esc(view.floor_rev.rev) + ' (' + esc(view.floor_rev.label) + ')</span>' : '') + '</span></h1>';
    return '<div class="sop-line">' + h + '<div class="tabs" id="tabs"></div></div><div id="tab-body"></div>';
  }
  /* tabsLine(view, top, pinned, menuOpen): the tabs on the SOP line (top = ENGINE_MENUS.topTabs(...)) and the "☰ All tabs" menu with a pin per tab */
  function tabsLine(view, top, pinned, menuOpen) {
    let h = '';
    for (const t of top) { h += '<button class="tab' + (t.active ? ' active' : '') + (t.pinned ? '' : ' unpinned') + '" data-tab="' + t.id + '">' + esc(tabLabel(view, t.id)) + '</button> '; }
    h += '<span class="tabmenu"><button id="btn-tabs" aria-haspopup="true"' + (menuOpen ? ' class="active"' : '') + '>☰ All tabs ▾</button><div class="tab-menu" id="tab-menu" role="menu"' + (menuOpen ? '' : ' hidden') + '>';
    for (const t of TABS) {
      const on = pinned.indexOf(t[0]) >= 0;
      h += '<div class="tm-row"><button class="tm-open" role="menuitem" data-tab="' + t[0] + '">' + esc(tabLabel(view, t[0])) + '</button>' +
        '<button class="tm-pin' + (on ? ' on' : '') + '" data-pin="' + t[0] + '" title="' + (on ? 'Unpin' : 'Pin to the SOP line') + '" aria-pressed="' + (on ? 'true' : 'false') + '">📌</button></div>';
    }
    h += '</div></span>';
    /* build 39: Save a copy from any tab (it opens the Save a copy card of the Header tab) */
    return h + (view.rev ? ' <button id="btn-quick-copy" class="quick-copy" title="Save a copy of this SOP under your own name; this SOP stays as it is">Save a copy</button>' : '');
  }

  /* headerTab(view): example.md part 5 plus the revision text fields */
  function headerTab(view) {
    const sop = view.sop, rev = view.rev || {};
    const kv = [['Title', sop.title], ['Type', sop.sop_type === 'Process' ? 'Process SOP: one process used inside main SOPs' : 'Main SOP: makes a main part with its own serial'],
      ['Product', sop.product], ['Level', sop.level], ['Who does it', sop.who_does_it],
      ['Input from', sop.input_from], ['Output to', sop.output_to], ['Output serial tracked', yn(sop.output_serial_tracked)],
      ['Hold points', rev.hold_points], ['Est min total', rev.est_min_total], ['Prepared by', rev.prepared_by],
      ['Checked by', show(rev.checked_by) + ' <span class="muted">Checked date:</span> ' + show(rev.checked_date), 'raw'],
      ['Approved by', show(rev.approved_by) + ' <span class="muted">Approved date:</span> ' + show(rev.approved_date), 'raw'],
      ['Release', view.release ? esc(view.release.label) + ' <span class="muted">(see the Release check tab)</span>' : '<span class="empty">(no revision)</span>', 'raw'],
      ['Steps', view.steps_count]];
    /* build 50: no Edit the header where the name at the top does not change the SOP (lock_text: example_rights.md part 5) */
    const canEdit = !!view.rev && !view.lock_text;
    /* build 39: a copy shows the This copy card first */
    let h = (view.rev && view.copy ? thisCopyCard(view) + '<div id="sync-slot"></div>' : '') +
      '<h2>Header' + (canEdit ? ' <button id="btn-header-edit">Edit the header</button>' : '') + '</h2>' +
      (view.rev && view.rights && !view.rights.can_change ? '<p class="ok rights-line" id="rights-line">' + esc(view.lock_text) + '</p>' : '') + '<div id="header-slot"></div>' + kvTable(kv);
    if (view.rev) {
      h += '<h2>Revision ' + esc(rev.rev) + '</h2>' + kvTable([['Revision date', rev.rev_date], ['Purpose', rev.purpose], ['Scope', rev.scope],
        ['Process flow', rev.process_flow], ['Reference drawings', rev.reference_drawings], ['How to use', rev.how_to_use],
        ['Set-up rule', rev.setup_rule], ['Revision note', rev.revision_note], ['Release note', rev.release_note]]);
      /* build 50: no New revision while who changes what is checked: Make this the good version makes it (example_rights.md part 4) */
      h += view.copy || view.rights ? '' : '<div class="card new-rev"><b>New revision</b> <span class="muted">copies every step and section of ' + esc(rev.rev) + ' into a new Draft revision; ' + esc(rev.rev) + ' stays as it is' +
        (rev.status === 'Released' ? ' and stays on the floor until the new revision is released' : '') + '. In the new draft no change asks a reason: the revision note is the reason.</span>' +
        '<div class="f"><label for="nr-note">Revision note</label><div class="v"><input id="nr-note" size="60">' +
        '<div class="note">What changes in the new revision and why; written to the revision history. Example: Datum of 9.5 given by Divyal.</div><div class="refusal" data-for="note"></div></div></div>' +
        '<div class="f"><label></label><div class="v"><button id="btn-new-rev">Make the new revision</button><div class="refusal" data-for="form"></div></div></div></div>';
      h += saveCopyCard(view) + copiesCard(view);
    }
    return h;
  }
  /* ---- copies (spec/example_copy.md parts 4 and 6, build 39) ---- */
  const when = (at, who) => (at ? ', ' + esc(String(at).slice(0, 16).replace('T', ' ')) : '') + (who ? ' by ' + esc(who) : '');
  /* saveCopyCard(view): Save a copy under a name; the SOP stays as it is */
  function saveCopyCard(view) {
    const sop = view.sop, rev = view.rev;
    return '<div class="card copy-save"><b>Save a copy</b> <span class="muted">' + esc(sop.sop_id) + ' ' + esc(rev.rev) + ' stays as it is</span>' +
      '<div class="f"><label for="cp-name">Copy name</label><div class="v"><input id="cp-name" size="40" maxlength="40">' +
      '<div class="note">A name you will know the copy by, 40 letters at most. Example: Club trial 13 Nov.</div><div class="refusal" data-for="name"></div></div></div>' +
      '<div class="f"><label></label><div class="v"><button id="btn-save-copy">Save a copy</button><div class="refusal" data-for="form"></div></div></div>' +
      '<div class="note">The copy has every section, step, list and open note of ' + esc(rev.rev) + ' as it is now, with the same Keys and photos. Edit the copy freely: no reason is asked, ' +
      'the good version does not change, and a copy never goes to the floor.' + (view.copy ? ' A copy of this copy is a copy of ' + esc(view.copy.of) + '.' : '') + '</div></div>';
  }
  /* promoteLine(c): what Make this the good version does (build 50, example_rights.md part 6.4): the copy replaces the newest revision
     while it is not released, else it becomes the next one */
  function promoteLine(c) {
    const p = c.promote;
    if (p && p.kind === 'replace') {
      return 'Make this the good version: the copy replaces ' + esc(c.of) + ' ' + esc(p.rev) + ', a draft not yet released: ' + esc(p.rev) + ' stays ' + esc(p.rev) +
        ' and its sign-offs are cleared. The copy is then removed.';
    }
    return 'Make this the good version: the copy becomes ' + esc(c.of) + ' ' + esc(p ? p.rev : 'the next revision') + ', a draft, with the same Keys; ' +
      esc(p ? p.newest : c.good_rev) + ' stays as it is. The copy is then removed.';
  }
  /* thisCopyCard(view): what the copy is, Compare (with the good version or another copy), Make this the good version and Delete this
     copy for its owner; someone else's copy is read only (build 50); a copy made the good version since this one was saved is named */
  function thisCopyCard(view) {
    const c = view.copy, r = view.rights, mine = !r || r.can_change;
    const since = (c.since || []).length ? '<div class="copy-since" id="copy-since"><b>Since this copy was saved:</b> ' + c.since.map(x => esc(x.line)).join('; ') +
      '. Compare with the good version to see what is different.</div>' : '';
    let h = '<div class="card this-copy"><b>This copy: ' + esc(c.name) + '</b> <span class="muted">' + (c.saved_from ? 'saved from ' + esc(c.saved_from) + when(c.saved_at, c.saved_by) : 'a copy of ' + esc(c.of)) + '</span>' +
      (r ? ' · <span class="rights-tag ' + esc(r.kind.replace(' ', '-')) + '">' + esc(r.tag) + '</span>' : '') + since;
    if (!mine) {
      return h + '<p>It never goes to the floor. Only ' + esc(r.owner) + ' changes it, makes it the good version or deletes it. To work on it, Save a copy: the new copy is your own.</p>' +
        '<p><button id="btn-copy-compare">Compare with the good version or another copy</button></p></div>';
    }
    return h + '<p>It never goes to the floor. The good version (' + esc(c.of) + ', now ' + esc(c.good_rev) + ') does not change while you edit the copy.</p>' +
      '<p><button id="btn-copy-compare">Compare with the good version or another copy</button></p>' +
      '<div class="f"><label for="pc-note">Revision note</label><div class="v"><input id="pc-note" size="60">' +
      '<div class="note">What changes and why; written to the revision history of ' + esc(c.of) + '. Example: 3.3 to 3.6 clubbed into one check step.</div><div class="refusal" data-for="note"></div></div></div>' +
      '<div class="f"><label></label><div class="v"><button id="btn-copy-promote">Make this the good version</button> <button id="btn-copy-delete">Delete this copy</button>' +
      '<div class="note" id="promote-line">' + promoteLine(c) + '</div>' +
      '<div class="refusal" data-for="form"></div></div></div></div>';
  }
  /* copiesCard(view): the copies of a good version, each a link with its owner (build 50: your own say "yours") */
  function copiesCard(view) {
    if (view.copy || !view.copies || !view.copies.length) { return ''; }
    const yours = c => !!c.saved_by && !!view.me && String(c.saved_by).trim().toLowerCase() === String(view.me).trim().toLowerCase();
    return '<div class="card copies-list"><b>Copies of this SOP</b> <span class="muted">' + esc(view.copies.length) + '; each one is worked on without changing ' + esc(view.sop.sop_id) + '</span><ul>' +
      view.copies.map(c => '<li><a href="#" class="sop-link" data-sop="' + esc(c.sop_id) + '">' + esc(c.sop_id) + '</a> · <span class="copy-tag">COPY: ' + esc(c.copy_name) + '</span>' +
        (c.saved_by ? ' · ' + esc(c.saved_by) + (yours(c) ? ' <b class="yours">(yours)</b>' : '') : '') +
        (c.saved_from ? ' <span class="muted">saved from ' + esc(c.saved_from) + when(c.saved_at, null) + '</span>' : '') + '</li>').join('') + '</ul></div>';
  }

  /* sectionsTab(view): one button per section with its counts; the section view opens under it */
  function sectionsTab(view) {
    let h = '<h2>Sections</h2>';
    if (!view.sections.length) { return h + '<p class="empty">' + (view.rev ? '(no sections yet: add the first on the Flow tab, ＋ Add, then Add a section at the end)' : '(no sections: this SOP has no revision yet)') + '</p>'; }
    h += '<p>';
    for (const s of view.sections) {
      h += '<button class="section-btn" data-section="' + esc(s.section) + '">' + esc(s.section) + ' ' + esc(s.name) +
        ' <span class="muted">' + esc(s.steps_count) + (s.steps_count === 1 ? ' step · ' : ' steps · ') + esc(s.vn_open) + ' open</span></button> ';
    }
    return h + '</p><div id="section-view"><p class="muted">Click a section.</p></div>';
  }

  return { esc, show, lines, list, yn, kvTable, grid, topBar, topBarOnline, loginFirst, noAccess, sopList, sopPage, tabsLine, tabLabel, headerTab, sectionsTab, TABS };
})();
