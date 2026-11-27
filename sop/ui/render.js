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
  /* plusWords(text, open): the words of a "+" button open ("− details", "1 copy ▾") or closed ("+ details", "1 copy ▸") (build 71) */
  function plusWords(text, open) {
    const t = String(text).replace(/^[+−] /, '').replace(/ [▸▾]$/, '');
    const arrow = / [▸▾]$/.test(String(text));
    return arrow ? t + (open ? ' ▾' : ' ▸') : (open ? '− ' : '+ ') + t;
  }
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
    /* build 71 (spec/example_job4_71.md part 1, rule 7.1): where you are on the left, as links; who you are and the build on the right */
    return how + crumbs(false) + '<span class="bar-right"><span id="folder-status">' + folder + '</span>' +
      ' <button id="btn-open">Open folder</button> <button id="btn-pick">Pick folder</button>' +
      ' <label>Editor <select id="editor">' + opts + '</select></label>' +
      ' <span class="app">' + esc(cfg.app_name) + '</span> <span class="build">Build ' + esc(cfg.builder_build) + '</span></span>';
  }
  /* crumbs(online, cfg): "Freezigo › SOPs" (online) or "SOPs", then #crumb-rest (the SOP open: APP fills it, crumbRest) */
  function crumbs(online, cfg) {
    const erp = online ? '<a class="erp-back" href="' + esc((cfg.online && cfg.online.erp_url) || '../') + '">Freezigo</a> › ' : '';
    return '<span class="crumbs" id="crumbs">' + erp + '<a href="#" id="btn-home">SOPs</a><span id="crumb-rest"></span></span>';
  }
  /* crumbRest(line): " › BMC-L1-TANK-01" (the main SOP), " › BMC-L1-TANK-01 › Samrat 13.11.26" (a copy: the main SOP a link) */
  function crumbRest(line) {
    if (!line) { return ''; }
    return line.label === null ? ' › <span>' + esc(line.main_id) + '</span>'
      : ' › <a href="#" class="crumb-main" data-sop="' + esc(line.main_id) + '">' + esc(line.main_id) + '</a> › <span>' + esc(line.label) + '</span>';
  }

  /* topBarOnline(cfg, me, editing): the page inside the Freezigo app (build 52): where you are (Freezigo › SOPs), the name of the login
     and View only on the right (build 71: "Editing online" is behind + details of the SOP line) */
  function topBarOnline(cfg, me, editing) {
    if (!me) { return '<a class="erp-back" href="' + esc((cfg.online && cfg.online.erp_url) || '../') + '">← Freezigo</a> <span class="bar-right"><span class="app">' + esc(cfg.app_name) + '</span> <span class="build">Build ' + esc(cfg.builder_build) + '</span></span>'; }
    return crumbs(true, cfg) + '<span class="bar-right"><span class="who">' + esc(me.name) + '</span>' + (editing ? '' : ' <span class="tag view-tag">View only</span>') +
      ' <span class="app">' + esc(cfg.app_name) + '</span> <span class="build">Build ' + esc(cfg.builder_build) + '</span></span>';
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
        /* build 66 (spec/example_notes_list.md part 3): open notes turn the Status box orange */
        if (f === 'status' && r.open_notes) { return '<div class="st-notes">' + show(r.status) + '<div class="st-notes-n">' + esc(r.open_notes) + (r.open_notes === 1 ? ' note open' : ' notes open') + '</div></div>'; }
        return show(r[f]);
      });
    return h;
  }

  const TABS = [['header', 'Header'], ['sections', 'Sections'], ['flow', 'Flow'], ['vn', 'Values Needed'], ['texts', 'Texts to check'], ['safety', '1 Safety and PPE'], ['materials', '2 Materials, tools and machines'],
    ['glossary', 'Glossary'], ['gauges', 'Gauges'], ['pictures', 'Pictures'], ['examples', 'Worked examples and tables'], ['release', 'Release check'],
    ['compare', 'Compare'], ['floor', 'Floor PDF'], ['routing', 'Routing'], ['revisions', 'Revisions'], ['history', 'History']];

  /* tabLabel(view, id): a tab's name with its count ("Values Needed (25 open)"); build 71 (rule 6): no count of zero, and the Release
     check's count is said on the SOP line */
  function tabLabel(view, id) {
    const t = TABS.find(x => x[0] === id);
    let label = t[1];
    if (id === 'vn' && view.vn.open) { label += ' (' + view.vn.open + ' open)'; }
    if (id === 'texts' && view.texts_count) { label += ' (' + view.texts_count + ')'; }
    if (id === 'sections' && view.sections.length) { label += ' (' + view.sections.length + ')'; }
    if (id === 'flow' && view.notes_open) { label += ' (' + view.notes_open + (view.notes_open === 1 ? ' note open)' : ' notes open)'); }
    return label;
  }
  /* sopPage(view): the SOP line (build 71, spec/example_job4_71.md part 2: view.line = ENGINE_LINE.sopLine) with its "+ details", the
     search box and the actions at the right end, the form slot of ☰ Another copy, then the tabs row (tabsLine into #tabs) and an
     empty tab body (#tab-body). The SOP title shows under the pointer on the heading. */
  function sopPage(view) {
    const sop = view.sop, ln = view.line;
    const fact = f => (f === ln.door ? '<a href="#" class="line-door" id="line-door" data-tab="release">' + esc(f) + '</a>' : esc(f));
    const head = esc(ln.main_id) + (ln.label === null ? '' : ' › ' + esc(ln.label)) +
      ' <span class="muted">· ' + ln.facts.map(fact).join(' · ') + '</span>' +
      (ln.changes ? ' · <a href="#" class="sync-tag" data-sop="' + esc(sop.sop_id) + '" title="Open the list on the Header tab">' + esc(ln.changes) + ' ▸</a>' : '');
    const btn = { 'compare': '<button id="btn-line-compare">Compare</button>', 'edit-my-copy': '<button id="btn-my-copy" class="primary">Edit in my copy</button>',
      'back-to-main': '<button id="btn-back-main">Back to main SOP</button>' };
    const acts = '<span class="line-acts" id="line-acts">' + (ln.actions.indexOf('undo') >= 0 ? '<span id="undo-slot"></span> ' : '') +
      ln.actions.filter(a => btn[a]).map(a => btn[a]).join(' ') + '</span>';
    const find = sop.current_rev ? '<span class="find"><input id="sop-find" size="26" placeholder="Find: 9.5, TANK01-2420, VN-0012 or words" ' +
      'title="Find a step: its number (9.5), its Key (TANK01-2420), a Values Needed number (VN-0012) or words of its Action. Enter selects it; Enter again, the next one.">' +
      '<span class="muted" id="find-out"></span></span>' : '';
    const details = ln.details.length ? ' <button class="plus" id="btn-details" aria-expanded="' + (view.details_open ? 'true' : 'false') + '">' + plusWords('+ details', !!view.details_open) + '</button>' : '';
    const h = '<div class="sop-head" id="sop-head"><h1 title="' + esc(sop.title) + '">' + head + '</h1>' +
      (ln.ro ? ' <span class="ro-bar" id="ro-bar">' + esc(ln.ro) + '</span>' : '') + details + ' ' + find + acts + '</div>' +
      (ln.details.length ? '<div class="sop-details" id="sop-details"' + (view.details_open ? '' : ' hidden') + '>' +
        ln.details.map(d => '<div' + (d.indexOf('Since this copy was saved: ') === 0 ? ' id="copy-since"' : '') + '>' + esc(d) + '</div>').join('') + '</div>' : '') +
      '<div id="line-form"></div>';
    return '<div class="sop-line">' + h + '<div class="tabs" id="tabs"></div></div><div id="tab-body"></div>';
  }
  /* tabsLine(view, top, pinned, menuOpen): the tabs row (top = ENGINE_MENUS.topTabs(...)) and the "☰ All tabs" menu with a pin per tab;
     build 71 (part 3): after the tabs, Another copy, then a gap and Delete this copy (view.line.menu) */
  function tabsLine(view, top, pinned, menuOpen) {
    let h = '';
    for (const t of top) { h += '<button class="tab' + (t.active ? ' active' : '') + (t.pinned ? '' : ' unpinned') + '" data-tab="' + t.id + '">' + esc(tabLabel(view, t.id)) + '</button> '; }
    h += '<span class="tabmenu"><button id="btn-tabs" aria-haspopup="true"' + (menuOpen ? ' class="active"' : '') + '>☰ All tabs ▾</button><div class="tab-menu" id="tab-menu" role="menu"' + (menuOpen ? '' : ' hidden') + '>';
    for (const t of TABS) {
      const on = pinned.indexOf(t[0]) >= 0;
      h += '<div class="tm-row"><button class="tm-open" role="menuitem" data-tab="' + t[0] + '">' + esc(tabLabel(view, t[0])) + '</button>' +
        '<button class="tm-pin' + (on ? ' on' : '') + '" data-pin="' + t[0] + '" title="' + (on ? 'Unpin' : 'Pin to the SOP line') + '" aria-pressed="' + (on ? 'true' : 'false') + '">📌</button></div>';
    }
    const menu = (view.line && view.line.menu) || [];
    if (menu.indexOf('another-copy') >= 0) {
      h += '<div class="tm-sep"></div><button class="tm-act" id="tm-copy" role="menuitem" title="Save a copy of this SOP under a name; this SOP stays as it is">Another copy</button>';
    }
    if (menu.indexOf('delete-copy') >= 0) { h += '<div class="tm-gap"></div><button class="tm-act danger" id="btn-copy-delete" role="menuitem">Delete this copy</button>'; }
    return h + '</div></span>';
  }
  /* undoButton(plan): Undo my last change (build 70, spec/example_job1_70.md part 3) for the top bar's slot, so the SOP line keeps one
     line at 1536 px (example_look.md part 2); plan = ENGINE_UNDO.undoPlan, or null where the page does not change the open SOP */
  function undoButton(u) {
    if (!u) { return ''; }
    return '<button id="btn-undo" class="undo"' + (u.can ? '' : ' disabled') + ' title="' + esc(u.can ? 'Undo my last change: ' + u.label + ' (' + u.when + ')' : u.why) + '">↶ Undo</button>';
  }

  /* headerTab(view): example.md part 5 plus the revision text fields; build 71 (spec/example_job4_71.md part 6, plan 4.6): six rows first
     (ENGINE_LINE.HEADER_FIRST), the rest behind "+ n more fields" (view.hdr_open: open last time in this browser); a double-click on a
     row opens the header form at its field (data-field) where the header can be changed (view.hdr_edit) */
  function headerTab(view) {
    const sop = view.sop, rev = view.rev || {};
    const rows = [['Title', sop.title, 'title'], ['Product', sop.product, 'product'], ['Level', sop.level, 'level'], ['Who does it', sop.who_does_it, 'who_does_it'],
      ['Input from', sop.input_from, 'input_from'], ['Output to', sop.output_to, 'output_to'], ['Type', ENGINE_LINE.typeWord(sop.sop_type), null],
      ['Output serial tracked', yn(sop.output_serial_tracked), 'output_serial_tracked'], ['Hold points', rev.hold_points, 'hold_points'], ['Est min total', rev.est_min_total, 'est_min_total'],
      ['Prepared by', rev.prepared_by, null],
      ['Checked by', show(rev.checked_by) + ' <span class="muted">Checked date:</span> ' + show(rev.checked_date), null, 'raw'],
      ['Approved by', show(rev.approved_by) + ' <span class="muted">Approved date:</span> ' + show(rev.approved_date), null, 'raw']];
    if (view.rev) {
      rows.push(['Revision date', rev.rev_date, null], ['Purpose', rev.purpose, 'purpose'], ['Scope', rev.scope, 'scope'], ['Process flow', rev.process_flow, 'process_flow'],
        ['Reference drawings', rev.reference_drawings, 'reference_drawings'], ['How to use', rev.how_to_use, 'how_to_use'], ['Set-up rule', rev.setup_rule, 'setup_rule'],
        ['Revision note', rev.revision_note, 'revision_note'], ['Release note', rev.release_note, null]);
    }
    const FIRST = ENGINE_LINE.HEADER_FIRST;
    const table = (list, cls, attr) => '<table class="kv ' + cls + (view.hdr_edit ? ' hdr-edit' : '') + '"' + (attr || '') + '>' +
      list.map(r => '<tr data-row="' + esc(r[0]) + '"' + (r[2] ? ' data-field="' + esc(r[2]) + '"' : '') + (view.hdr_edit ? ' title="Double-click to change"' : '') + '><th>' + esc(r[0]) + '</th><td>' +
        (r[3] === 'raw' ? r[1] : lines(r[1])) + '</td></tr>').join('') + '</table>';
    const more = rows.filter(r => FIRST.indexOf(r[0]) < 0);
    /* build 39: a copy shows its card first (build 71: Make this the good version and its note only, until job 2) */
    let h = (view.rev && view.copy ? thisCopyCard(view) + '<div id="sync-slot"></div>' : '') + '<div id="header-slot"></div>' +
      table(rows.filter(r => FIRST.indexOf(r[0]) >= 0), 'hdr-first') +
      '<p><button class="plus" id="btn-hdr-more" aria-expanded="' + (view.hdr_open ? 'true' : 'false') + '">' + plusWords('+ ' + more.length + ' more fields', !!view.hdr_open) + '</button></p>' +
      '<div id="hdr-more"' + (view.hdr_open ? '' : ' hidden') + '>' + table(more, 'hdr-more') + '</div>';
    if (view.rev) {
      /* build 50: no New revision while who changes what is checked: Make this the good version makes it (example_rights.md part 4) */
      h += view.copy || view.rights ? '' : '<div class="card new-rev"><b>New revision</b> <span class="muted">copies every step and section of ' + esc(rev.rev) + ' into a new Draft revision; ' + esc(rev.rev) + ' stays as it is' +
        (rev.status === 'Released' ? ' and stays on the floor until the new revision is released' : '') + '. In the new draft no change asks a reason: the revision note is the reason.</span>' +
        '<div class="f"><label for="nr-note">Revision note</label><div class="v"><input id="nr-note" size="60">' +
        '<div class="note">What changes in the new revision and why; written to the revision history. Example: Datum of 9.5 given by Divyal.</div><div class="refusal" data-for="note"></div></div></div>' +
        '<div class="f"><label></label><div class="v"><button id="btn-new-rev">Make the new revision</button><div class="refusal" data-for="form"></div></div></div></div>';
      h += copiesDoor(view);
    }
    return h;
  }
  /* ---- copies (spec/example_copy.md parts 4 and 6, build 39) ---- */
  /* copyForm(name): ☰ Another copy (build 71, part 3): the form under the SOP line, the name filled ("Samrat 27.11.26") */
  function copyForm(view, name) {
    return '<div class="card copy-save"><div class="f"><label for="cp-name">Copy name</label><div class="v"><input id="cp-name" size="40" maxlength="40" value="' + esc(name) + '">' +
      '<div class="note">A name you will know the copy by, 40 letters at most. Example: Club trial 13 Nov.</div><div class="refusal" data-for="name"></div></div></div>' +
      '<div class="f"><label></label><div class="v"><button id="btn-save-copy">Save</button> <button id="btn-copy-cancel">Cancel</button>' +
      '<div class="note">A copy of ' + esc(view.sop.sop_id) + ' ' + esc(view.rev.rev) + ' as it is now. Enter saves, Esc cancels.</div><div class="refusal" data-for="form"></div></div></div></div>';
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
  /* thisCopyCard(view): build 71 (part 6): your copy, until job 2: the Revision note and Make this the good version, what it does behind
     "+ details"; someone else's copy: nothing (the SOP line says whose it is) */
  function thisCopyCard(view) {
    const c = view.copy, r = view.rights, mine = !r || r.can_change;
    if (!mine) { return ''; }
    return '<div class="card this-copy"><div class="f"><label for="pc-note">Revision note</label><div class="v"><input id="pc-note" size="60">' +
      '<div class="note">What changes and why; written to the revision history of ' + esc(c.of) + '. Example: 3.3 to 3.6 clubbed into one check step.</div><div class="refusal" data-for="note"></div></div></div>' +
      '<div class="f"><label></label><div class="v"><button id="btn-copy-promote">Make this the good version</button> <button class="plus" id="btn-promote-details">+ details</button>' +
      '<div class="note" id="promote-line" hidden>' + promoteLine(c) + '</div>' +
      '<div class="refusal" data-for="form"></div></div></div></div>';
  }
  /* copiesDoor(view): the copies of a main SOP (build 71, part 6): "4 copies ▸" opens the list in place; view.copy_rows =
     ENGINE_LINE.copyRows; nothing when there are none */
  function copiesDoor(view) {
    const list = view.copy || !view.copy_rows ? [] : view.copy_rows;
    if (!list.length) { return ''; }
    return '<p><button class="plus" id="btn-copies">' + list.length + (list.length === 1 ? ' copy' : ' copies') + ' ▸</button></p>' +
      '<div class="card copies-list" hidden><ul>' + list.map(c => '<li><a href="#" class="sop-link" data-sop="' + esc(c.sop_id) + '">' + esc(c.label) + '</a>' +
        (c.name !== c.label ? ' · ' + esc(c.name) : '') + (c.yours ? ' · <b class="yours">yours</b>' : '') + '</li>').join('') + '</ul></div>';
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

  return { esc, show, lines, list, yn, plusWords, kvTable, grid, topBar, topBarOnline, crumbRest, loginFirst, noAccess, sopList, sopPage, tabsLine, undoButton, tabLabel, headerTab, copyForm, sectionsTab, TABS };
})();
