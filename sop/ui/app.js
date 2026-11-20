/* SOP Builder page: state, navigation, tabs and the section view; the
   hand-offs screen → store → engine → screen. No logic here beyond "which
   page". A log line marks every hand-off. The editing actions are in
   ui/app_actions.js (global APP_ACTIONS). Classic script (global APP). */
const APP = (function () {
  /* rightsMode: null = who changes what is checked (build 50, spec/example_rights.md); 'open' = the test seam of the page checks made
     before build 50 (every SOP changes as it did then) */
  const state = { editor: null, tables: null, files: null, sop_id: null, tab: null, section: null, folderName: null,
    builtOnly: true, vnFilter: { state: 'open', section: '' }, glossaryFind: '', pictureUrls: {}, accepts: {}, rightsMode: null,
    viewOnly: false, me: null,   /* build 52: viewOnly = the page inside the Freezigo app (spec/example_online.md part 6); me = the login */
    online: false, master: null, viewLine: null, fileUrls: null };   /* build 56 (spec/example_edit_online.md): online = the page inside the
    Freezigo app; viewOnly there unless editRights lets the login edit (the edit role, switch day come); viewLine = the line of a view-only
    page; fileUrls = the links to the files online */

  function $(id) { return document.getElementById(id); }
  function main() { return $('main'); }

  async function guard(place, fn) {
    try { return await fn(); }
    catch (e) { ERRORS.show(place, e); return undefined; }
  }

  function drawTopBar() {
    if (state.online) {
      /* build 52: the page inside the Freezigo app: the login's name, View only (build 56: or Editing online), the way back to the
         Freezigo app; no folder, no name to pick */
      $('topbar').innerHTML = RENDER.topBarOnline(CONFIG, state.me, !state.viewOnly);
      if ($('btn-home')) { $('btn-home').onclick = function () { guard('ui home', showSopList); }; }
      return;
    }
    $('topbar').innerHTML = RENDER.topBar(CONFIG, STORE.status(), state.folderName, state.editor, SETS.editor);
    if (state.viewOnly) { $('topbar').insertAdjacentHTML('beforeend', ' <span class="tag view-tag" id="archive-tag" title="' + RENDER.esc(state.viewLine || '') + '">Archive: reads only</span>'); }   /* build 57 */
    $('btn-pick').onclick = function () { guard('ui pickFolder', pickFolder); };
    $('btn-open').onclick = function () { guard('ui openFolder', openFolder); };
    $('btn-home').onclick = function () { guard('ui home', showSopList); };
    /* build 50: the name at the top is the login; it is kept in this browser, and the page is drawn again for the new name */
    $('editor').onchange = function (e) {
      state.editor = e.target.value;
      editorKeep(state.editor);
      console.log('[ui] editor: ' + state.editor);
      if (state.sop_id) { guard('ui showSop', function () { return showSop(state.sop_id, state.tab); }); } else if (state.tables) { guard('ui showSopList', showSopList); }
    };
  }
  const EDITOR_KEY = 'sopBuilder.editor';
  function editorKept() { try { const v = window.localStorage.getItem(EDITOR_KEY); return v && SETS.editor.indexOf(v) >= 0 ? v : null; } catch (e) { return null; } }
  function editorKeep(v) { try { window.localStorage.setItem(EDITOR_KEY, v); } catch (e) { /* private window: the name lasts this visit */ } }

  /* ---- who changes what (build 50, spec/example_rights.md) ---- */
  /* rightsOf(sopId) → ENGINE_RIGHTS.rightsOf for the name at the top, or null in the test seam rightsMode 'open' */
  function rightsOf(sopId) {
    if (state.viewOnly) { return ENGINE_ONLINE.viewRights(state.viewLine); }   /* build 52: nothing changes on the view-only page */
    return state.rightsMode === 'open' || !state.tables ? null : ENGINE_RIGHTS.rightsOf(state.tables, sopId, state.editor);
  }
  /* lockOn(v, sopId): a view of an SOP the name at the top does not change is locked with the line of its rights, as a released
     revision is; read_only = someone else's copy (no note buttons either) */
  function lockOn(v, sopId) {
    const r = rightsOf(sopId);
    if (r && !r.can_change) { v.locked = true; v.lock_text = r.lock_text; v.read_only = r.read_only; }
    return v;
  }

  async function pickFolder() {
    console.log('[ui → store] pickFolder');
    await STORE.pickFolder();
    await loadTables();
  }
  async function openFolder() {
    console.log('[ui → store] reopenFolder');
    const name = await STORE.reopenFolder();
    if (!name) { throw new Error('ui openFolder: no folder remembered, or permission not given. Click Pick folder.'); }
    await loadTables();
  }
  async function loadTables() {
    ERRORS.clear();
    return guard('ui loadTables', async function () {
      console.log('[ui → store] readAll');
      state.tables = await STORE.readAll();
      state.files = await STORE.listFiles(CONFIG.photos_dir);
      console.log('[store → ui] ' + Object.keys(state.tables).length + ' tables, ' + state.files.length + ' photo files');
      state.pictureUrls = {};
      /* build 57: a folder archived on switch day only reads; every view is locked with its line */
      const arch = state.online ? null : STORE.archiveInfo();
      if (!state.online) {
        state.viewOnly = !!arch;
        state.viewLine = arch ? arch.line : null;
        document.body.classList.toggle('view-only', !!arch);
        if (arch) { console.log('[store → ui] ' + arch.line); }
      }
      drawTopBar();
      await showSopList();
    });
  }
  /* the screen reads the clock and hands the time in: ISO text with the PC's offset (contract part 1) */
  function nowIso() {
    const d = new Date();
    const p = n => (n < 10 ? '0' : '') + n;
    const off = -d.getTimezoneOffset();
    const a = Math.abs(off);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
      (off < 0 ? '-' : '+') + p(Math.floor(a / 60)) + ':' + p(a % 60);
  }
  async function writeTables(tables, ctx) {
    /* build 45: the History rows written now are the ones above beforeMax (a save of a main SOP with a copy opens the pop-up) */
    if (state.viewOnly) { throw new Error('ui writeTables: ' + (state.viewLine || ENGINE_ONLINE.VIEW_LINE)); }   /* build 52: never a save on the view-only page */
    const beforeMax = state.tables && state.tables.history ? state.tables.history.reduce((m, h) => Math.max(m, Number(h.hist_id) || 0), 0) : 0;
    /* build 50: a save the name at the top may not make is never written (the screens do not offer one) */
    if (state.rightsMode !== 'open' && state.tables && tables.history) {
      const no = ENGINE_RIGHTS.checkSave(state.tables, tables.history.filter(h => h.hist_id > beforeMax), ctx.who);
      if (no) { throw new Error('ui writeTables: ' + no.map(x => x.message).join(' · ')); }
    }
    /* test seam (tests/save_log.cjs): every save handed to a check, as it goes (tools/edit_check.js runs each in the database) */
    if (typeof window !== 'undefined' && typeof window.__saveLog === 'function') { window.__saveLog(JSON.stringify({ who: ctx.who, mode: state.rightsMode, before: state.tables, changed: tables })); }
    if (state.online) {
      /* build 56: online, one save in one call (the database checks it and writes all or nothing), then the newest data; a refused save
         loads the newest data too, draws the page again and says why */
      const after = Object.assign({}, state.tables, tables);
      console.log('[ui → online] save: ' + Object.keys(tables).join(', '));
      try { await ONLINE.save(state.tables, after); }
      catch (e) { await guard('ui online reload', reloadOnline); await guard('ui redraw', redraw); throw new Error('ui writeTables: ' + e.message); }
      await reloadOnline();
      APP_SYNC.afterWrite(tables, beforeMax);
      return;
    }
    for (const name in tables) {
      console.log('[ui → store] writeTable ' + name + ': ' + tables[name].length + ' rows');
      await STORE.writeTable(name, tables[name], 'Builder build ' + CONFIG.builder_build + ' (' + ctx.who + ')', ctx.now);
      state.tables[name] = tables[name];
    }
    APP_SYNC.afterWrite(tables, beforeMax);
  }
  function needData(place) {
    if (!state.tables) { throw new Error('ui ' + place + ': no data loaded. Pick or open the SOP App folder first.'); }
  }

  async function showSopList() {
    needData('showSopList');
    state.sop_id = null; state.section = null; state.tab = null;
    document.body.classList.remove('tab-flow', 'flow-big');
    console.log('[ui → engine] sopList');
    const view = ENGINE.sopList({ tables: state.tables, files: state.files });
    console.log('[engine → ui] sopList: ' + view.rows.length + ' SOPs');
    state.sopListRows = view.rows;
    main().innerHTML = RENDER.sopList(view, state.builtOnly, SETS.sop_status);
    /* build 52: the admin card online; build 57: New SOP online too, for the page that edits (the chart file goes to the file store) */
    if (state.online) { APP_ONLINE.drawCard(main(), state.me, state.switch); }
    if (!state.viewOnly) { APP_KICK.draw(); }
    for (const a of main().querySelectorAll('.sop-link')) {
      a.onclick = function (e) { e.preventDefault(); guard('ui showSop', function () { return showSop(a.dataset.sop, 'header'); }); };
    }
    $('built-only').onchange = function (e) { state.builtOnly = e.target.checked; guard('ui showSopList', showSopList); };
    APP_SYNC.wireTags(main());
  }

  async function showSop(sopId, tab) {
    needData('showSop');
    console.log('[ui → engine] sopView ' + sopId);
    const view = ENGINE.sopView({ tables: state.tables, files: state.files, sop_id: sopId });
    console.log('[engine → ui] sopView: ' + view.sections.length + ' sections, ' + view.vn.rows.length + ' Values Needed rows');
    /* build 50: what the name at the top may do here; lock_text = the line of the rights, else the Released line, else null */
    view.rights = rightsOf(sopId);
    view.lock_text = (view.rights && !view.rights.can_change ? view.rights.lock_text : null) || (view.rev ? ENGINE_RELEASE.lockText(view.rev) : null);
    view.read_only = !!(view.rights && view.rights.read_only);
    view.me = state.editor;
    if (state.sop_id !== sopId) { state.compareAgainst = null; state.flow = null; }
    view.notes_open = ENGINE_CHART.notesOpen({ tables: state.tables, sop_id: sopId });
    state.sop_id = sopId; state.view = view; state.section = null;
    view.texts_count = APP_TEXTS.list().length;   /* the count on the Texts to check tab (build 40) */
    main().innerHTML = RENDER.sopPage(view);
    APP_SYNC.wireTags(main());
    await showTab(tab || 'header');
  }

  /* ---- the SOP line: pinned tabs and the "☰ All tabs" menu (spec/example_look.md part 5); the pins are kept in this browser ---- */
  const PINS_KEY = 'sopBuilder.tabs.pinned';
  const TAB_IDS = RENDER.TABS.map(t => t[0]);
  function pinsKept() {
    try { const v = window.localStorage.getItem(PINS_KEY); const a = v === null ? null : JSON.parse(v); return Array.isArray(a) ? a : null; } catch (e) { return null; }
  }
  function pinsKeep(list) { try { window.localStorage.setItem(PINS_KEY, JSON.stringify(list)); } catch (e) { /* private window: the pins last this visit */ } }
  function pinned() { return state.pins || pinsKept() || ENGINE_MENUS.DEFAULT_PINS.slice(); }
  function drawTabs(menuOpen) {
    const box = $('tabs');
    if (!box || !state.view) { return; }
    box.innerHTML = RENDER.tabsLine(state.view, ENGINE_MENUS.topTabs(TAB_IDS, pinned(), state.tab), pinned(), !!menuOpen);
    for (const b of box.querySelectorAll('.tab')) { b.onclick = function () { guard('ui showTab', function () { return showTab(b.dataset.tab); }); }; }
    $('btn-tabs').onclick = function (e) { e.stopPropagation(); drawTabs($('tab-menu').hidden); };
    for (const b of box.querySelectorAll('.tm-open')) { b.onclick = function () { guard('ui showTab', function () { return showTab(b.dataset.tab); }); }; }
    if ($('btn-quick-copy')) {
      $('btn-quick-copy').onclick = function () {
        guard('ui quickCopy', async function () {
          if (state.tab !== 'header') { await showTab('header'); }
          const card = document.querySelector('.copy-save');
          card.scrollIntoView({ block: 'center' });
          $('cp-name').focus();
        });
      };
    }
    for (const b of box.querySelectorAll('.tm-pin')) {
      b.onclick = function (e) {
        e.stopPropagation();
        state.pins = ENGINE_MENUS.pinToggle(TAB_IDS, pinned(), b.dataset.pin);
        pinsKeep(state.pins);
        console.log('[ui] pins: ' + state.pins.join(', '));
        drawTabs(true);
      };
    }
  }
  let menusWired = false;
  function wireMenus() {
    if (menusWired) { return; }
    menusWired = true;
    /* hide only (no redraw): a click on a tab of the SOP line while the menu is open still opens that tab */
    const close = function (e) {
      const m = $('tab-menu');
      if (!m || m.hidden || (e && e.target && e.target.closest && e.target.closest('.tabmenu'))) { return; }
      m.hidden = true;
      if ($('btn-tabs')) { $('btn-tabs').classList.remove('active'); }
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(null); } });
  }

  async function showTab(tab) {
    const view = state.view;
    if (!view) { throw new Error('ui showTab: no SOP open'); }
    state.tab = tab;
    document.body.classList.toggle('tab-flow', tab === 'flow');
    document.body.classList.toggle('flow-big', tab === 'flow' && !!state.flowBig);
    wireMenus();
    drawTabs(false);
    const body = $('tab-body');
    const T = RENDER_TABS;
    switch (tab) {
      case 'header':
        body.innerHTML = RENDER.headerTab(view);
        if ($('btn-new-rev')) { $('btn-new-rev').onclick = function () { guard('ui newRevision', APP_ACTIONS.newRevision); }; }
        APP_COPIES.wire(body);
        APP_SYNC.wireCard(body);
        APP_LISTS.wire(body);
        break;
      case 'floor':
        body.innerHTML = T.floorTab(view);
        if ($('btn-floor')) { $('btn-floor').onclick = function () { guard('ui floorCopy', function () { return APP_ACTIONS.openFloorCopy(null); }); }; }
        if ($('btn-floor-on')) { $('btn-floor-on').onclick = function () { guard('ui floorCopy', function () { return APP_ACTIONS.openFloorCopy($('btn-floor-on').dataset.rev); }); }; }
        await APP_FINAL.wire(body);   /* build 50: the Final PDF line and its button */
        break;
      case 'compare':
        body.innerHTML = T.compareTab(APP_ACTIONS.compareNow(state.compareAgainst));
        if ($('cmp-against')) { $('cmp-against').onchange = function (e) { state.compareAgainst = e.target.value; guard('ui compareTab', function () { return showTab('compare'); }); }; }
        break;
      case 'flow': await APP_FLOW.showFlow(); break;
      case 'sections':
        body.innerHTML = RENDER.sectionsTab(view);
        for (const b of body.querySelectorAll('.section-btn')) {
          b.onclick = function () { guard('ui showSection', function () { return showSection(Number(b.dataset.section)); }); };
        }
        break;
      case 'vn':
        body.innerHTML = T.vnTab(view, state.vnFilter);
        $('vn-state').onchange = function (e) { state.vnFilter.state = e.target.value; guard('ui vnTab', function () { return showTab('vn'); }); };
        $('vn-section').onchange = function (e) { state.vnFilter.section = e.target.value.trim(); guard('ui vnTab', function () { return showTab('vn'); }); };
        for (const b of body.querySelectorAll('.btn-give')) {
          b.onclick = function () { guard('ui showGive', function () { return APP_ACTIONS.showGive(b.dataset.vn); }); };
        }
        if (state.givenNote) { body.insertAdjacentHTML('afterbegin', state.givenNote); state.givenNote = null; APP_ACTIONS.wireGotoSteps(body); }
        break;
      case 'safety': body.innerHTML = T.safetyTab(view); APP_LISTS.wire(body); break;
      case 'materials': body.innerHTML = T.materialsTab(view); APP_LISTS.wire(body); break;
      case 'glossary':
        body.innerHTML = T.glossaryTab(view, state.glossaryFind);
        $('gl-find').oninput = function (e) { state.glossaryFind = e.target.value; guard('ui glossaryTab', function () { return showTab('glossary'); }); };
        $('gl-find').focus(); $('gl-find').setSelectionRange(state.glossaryFind.length, state.glossaryFind.length);
        APP_LISTS.wire(body);
        break;
      case 'gauges': body.innerHTML = T.gaugesTab(view); APP_LISTS.wire(body); break;
      case 'pictures':
        await loadPictureUrls(view.pictures);
        body.innerHTML = T.picturesTab(view, state.pictureUrls);
        break;
      case 'examples': body.innerHTML = T.examplesTab(view); APP_LISTS.wire(body); break;
      case 'release': {
        view.today = nowIso().slice(0, 10); view.editor = state.editor;
        /* the Accept ticks and reasons stay while the page is open (example_release.md part 8.3), per SOP and revision */
        const keepKey = view.sop.sop_id + '|' + view.sop.current_rev;
        const kept = state.accepts[keepKey] || (state.accepts[keepKey] = {});
        body.innerHTML = T.releaseTab(view, kept);
        const keep = function (no) { kept[no] = { on: $('acc-tick-' + no).checked, reason: $('acc-reason-' + no).value }; };
        for (const t of body.querySelectorAll('.acc-tick')) { t.onchange = function () { keep(t.dataset.no); }; }
        for (const r of body.querySelectorAll('.acc-reason')) { r.oninput = function () { keep(r.dataset.no); }; }
        if ($('btn-sign-checked')) {
          $('btn-sign-checked').onclick = function () { guard('ui sign', function () { return APP_ACTIONS.sign('checked', $('sg-check-name').value, $('sg-check-date').value); }); };
          $('btn-sign-approved').onclick = function () { guard('ui sign', function () { return APP_ACTIONS.sign('approved', $('sg-appr-name').value, $('sg-appr-date').value); }); };
          $('btn-walk').onclick = function () { guard('ui walk', APP_ACTIONS.addWalk); };
          $('btn-release').onclick = function () { guard('ui release', APP_ACTIONS.release); };
          for (const f of body.querySelectorAll('.fail-click')) {
            f.onclick = function () { const t = $('acc-tick-' + f.dataset.no); if (t) { t.checked = true; keep(f.dataset.no); $('acc-reason-' + f.dataset.no).focus(); } };
          }
        }
        break;
      }
      case 'texts': APP_TEXTS.tab(body); break;
      case 'routing': body.innerHTML = T.routingTab(view); break;
      case 'revisions': body.innerHTML = T.revisionsTab(view); break;
      case 'history': body.innerHTML = T.historyTab(view); break;
      default: throw new Error('ui showTab: unknown tab "' + tab + '"');
    }
  }

  async function loadPictureUrls(pictures) {
    if (!STORE.canReadFiles()) { return; }
    for (const p of pictures) {
      if (state.pictureUrls[p.file] === undefined) {
        console.log('[ui → store] fileURL ' + p.file);
        state.pictureUrls[p.file] = await STORE.fileURL(p.file);
      }
    }
  }

  async function showSection(section) {
    const sop = state.view.sop;
    const input = { tables: state.tables, sop_id: sop.sop_id, rev: sop.current_rev, section: section };
    console.log('[ui → engine] sectionView ' + sop.sop_id + ' ' + sop.current_rev + ' section ' + section);
    const view = ENGINE.sectionView(input);
    console.log('[engine → ui] sectionView: ' + (view && view.steps ? view.steps.length : '?') + ' steps');
    if (!view || !view.section || !Array.isArray(view.steps)) { throw new Error('ui showSection: the engine returned no section view'); }
    const rt = rightsOf(sop.sop_id);
    if (rt && !rt.can_change) { view.sop.lock_text = rt.lock_text; view.sop.read_only = rt.read_only; }
    state.section = section;
    state.sectionSteps = view.steps;
    const vnById = {};
    for (const v of state.view.vn.rows) { vnById[v.vn_id] = v; }
    $('section-view').innerHTML = '<div id="sec-texts"></div>' + RENDER_SECTION.sectionView(view, vnById);
    APP_TEXTS.show($('sec-texts'));
    for (const b of main().querySelectorAll('.section-btn')) { b.classList.toggle('active', Number(b.dataset.section) === section); }
    const images = {};
    for (const st of view.steps) { images[st.key] = st.images; }
    APP_PHOTOS.wire($('section-view'), images);
    for (const b of $('section-view').querySelectorAll('.btn-edit')) {
      b.onclick = function () { guard('ui showEdit', function () { return APP_ACTIONS.showEdit(b.dataset.key); }); };
    }
    for (const b of $('section-view').querySelectorAll('.btn-add')) {
      b.onclick = function () { guard('ui showAdd', function () { return APP_ACTIONS.showAdd(Number(b.dataset.section), b.dataset.after || null, b.dataset.kind); }); };
    }
    for (const b of $('section-view').querySelectorAll('.btn-split')) {
      b.onclick = function () { guard('ui showSplit', function () { return APP_ACTIONS.showSplit(b.dataset.key); }); };
    }
    if ($('btn-club')) { $('btn-club').onclick = function () { guard('ui clubTicked', APP_ACTIONS.clubTicked); }; }
    APP_LISTS.wireGu($('section-view'), async function (r, ctx) { await writeTables(r.tables, ctx); await refreshSection(null); });
    APP_PHOTOS.wireAdd($('section-view'), async function (r, ctx) { await writeTables(r.tables, ctx); await refreshSection(null); });
    APP_PICTURES.wireAdd($('section-view'), async function (r, ctx) { await writeTables(r.tables, ctx); await refreshSection(null); });
    for (const b of $('section-view').querySelectorAll('.btn-move')) {
      b.onclick = function () { guard('ui moveStep', function () { return APP_ACTIONS.moveStep(b.dataset.key, b.dataset.dir); }); };
    }
    /* a right-click on a row of a step card edits only that row (example_flow.md part 20, build 35) */
    APP_FIELD.wire($('section-view'), { lockText: view.sop.lock_text, cardOf: k => view.steps.find(s => s.key === k) || null, openFull: k => APP_ACTIONS.showEdit(k),
      done: async function (r, ctx, k, row) { await writeTables(r.tables, ctx); await refreshSection(null); APP_FIELD.reveal(k, row); } });
    /* build 58: the red and blue marks on the step cards of a copy (spec/example_edit_online.md part 10) */
    APP_MARKS.draw($('section-view'), state.tables, sop.sop_id);
  }

  async function refreshSection(scrollKey) {
    const sop = state.view.sop;
    const section = state.section;
    await showSop(sop.sop_id, 'sections');
    await showSection(section);
    const card = $('step-' + scrollKey);
    if (card) { card.scrollIntoView(); }
  }

  async function openFile(relPath) {
    if (!relPath) { throw new Error('ui openFile: no file'); }
    if (!STORE.canReadFiles()) { throw new Error('ui openFile: files open only when the SOP App folder is open (' + relPath + ')'); }
    if (!(await STORE.fileExists(relPath))) { throw new Error('ui openFile: ' + relPath + ' does not exist'); }
    window.open(await STORE.fileURL(relPath), '_blank');
  }

  /* ---- build 52: the page inside the Freezigo app (spec/example_online.md part 6) ---- */
  /* startOnline(): the login of the Freezigo app on this browser, then every table and file from the ERP's Supabase; view only, but
     build 56: a login with the edit role edits once switch day has come (ENGINE_ONLINE.editRights; spec/example_edit_online.md) */
  async function startOnline() {
    state.online = true;
    state.viewOnly = true;
    document.body.classList.add('online', 'view-only');
    main().innerHTML = '<p class="muted">Loading the SOPs …</p>';
    const sess = await guard('ui online session', ONLINE.session);
    if (!sess) { state.me = null; drawTopBar(); main().innerHTML = RENDER.loginFirst(CONFIG); return; }
    await guard('ui online load', async function () {
      state.me = await ONLINE.me(sess);
      console.log('[online → ui] ' + state.me.name + ' (' + (state.me.sop ? state.me.roles.join(', ') : 'not one of the SOP people') + ')');
      state.editor = state.me.name;
      if (!state.me.sop) { drawTopBar(); main().innerHTML = RENDER.noAccess(); return; }   /* build 53: only the SOP people read (Samrat "2. b") */
      /* build 56: the login edits once switch day has come and it has the edit role; else view only, with the line of the login */
      state.switch = ENGINE_ONLINE.switchState(await ONLINE.masterRow());   /* build 57: who switched, and when */
      state.master = state.switch.master;
      const er = ENGINE_ONLINE.editRights(state.me, state.master);
      state.viewOnly = !er.can_edit;
      state.viewLine = er.line;
      document.body.classList.toggle('view-only', state.viewOnly);
      document.body.classList.toggle('online-edit', !state.viewOnly);
      console.log('[online → ui] master ' + state.master + ': ' + (state.viewOnly ? 'view only' : 'editing online'));
      const data = await ONLINE.loadAll();
      state.fileUrls = data.files;
      STORE.useOnline(data, { edit: !state.viewOnly, maxNo: ONLINE.maxNo, putFile: ONLINE.putFile });
      state.tables = await STORE.readAll();
      state.files = await STORE.listFiles(CONFIG.photos_dir);
      state.pictureUrls = {};
      drawTopBar();
      await showSopList();
    });
    if (!state.signOutWired) {
      state.signOutWired = true;
      ONLINE.onSignedOut(function () { state.tables = null; state.me = null; drawTopBar(); main().innerHTML = RENDER.loginFirst(CONFIG); });
    }
  }

  /* build 57: the files the page knows now (from the start, and the ones it put online since), with their links */
  const STORE_FILES = () => Object.assign({}, state.fileUrls || {}, STORE.fileLinks ? STORE.fileLinks() : {});
  /* build 56: reloadOnline() → the newest tables from the database (after a save, or a refused one); the links to the files stay */
  async function reloadOnline() {
    const d = await ONLINE.loadTables();
    STORE.useOnline({ tables: d.tables, files: STORE_FILES() }, { edit: !state.viewOnly, maxNo: ONLINE.maxNo, putFile: ONLINE.putFile });
    state.tables = await STORE.readAll();
    console.log('[online → ui] newest data: ' + Object.keys(state.tables).length + ' tables');
  }
  /* redraw(): the page again on the newest data: the SOP and tab open (the section too), else the SOP list */
  async function redraw() {
    if (!state.sop_id) { return showSopList(); }
    const id = state.sop_id, tab = state.tab, section = state.section;
    if (!state.tables.sops.some(s => s.sop_id === id)) { return showSopList(); }
    await showSop(id, tab);
    if (section !== null && section !== undefined && tab === 'sections') { await showSection(section); }
  }

  async function start() {
    if (CONFIG.online && CONFIG.online.site) { ERRORS.install(); console.log('[ui] ' + CONFIG.app_name + ' build ' + CONFIG.builder_build + ' online'); return startOnline(); }
    ERRORS.install();
    state.editor = editorKept() || SETS.editor[0];
    state.folderName = await guard('ui rememberedFolder', STORE.rememberedFolderName);
    drawTopBar();
    main().innerHTML = '<p class="muted">Pick the SOP App folder (D:\\Claude\\Projects\\SOP App) once. Next time click Open folder.</p>';
    console.log('[ui] ' + CONFIG.app_name + ' build ' + CONFIG.builder_build + ' ready');
  }

  /* the actions (edit, add, club, split, move, give, sign, walk, release, new revision, floor copy) live in ui/app_actions.js;
     APP keeps their names so callers and checks see one object */
  const ACT = ['showEdit', 'saveEdit', 'showAdd', 'saveAdd', 'clubTicked', 'showSplit', 'splitNow', 'moveStep', 'showGive', 'saveGive',
    'newRevision', 'sign', 'addWalk', 'release', 'floorHtml', 'openFloorCopy', 'compareNow', 'wireGotoSteps'];
  const api = { start, startOnline, state, loadTables, showSopList, showSop, showTab, showSection, refreshSection, openFile, guard, nowIso, writeTables, rightsOf, lockOn, el: $, main };
  for (const name of ACT) { api[name] = function () { return APP_ACTIONS[name].apply(null, arguments); }; }
  return api;
})();
