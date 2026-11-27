/* SOP Builder: the SOP line of build 71 (spec/example_job4_71.md parts 1 to 6): "+ details", the release door, Compare, Edit in my
   copy and Back to main SOP at the same tab, section, box and step, the search box, the ☰ items Another copy and Delete this copy,
   and the Header tab's "+ n more fields", copies door and double-click. The engine (ENGINE_LINE) gives the words, the copy to open and
   the steps found; this file wires the buttons and opens the screens. What a person opened last ("+ details", "+ more fields") is kept
   in this browser (plan rule 1); the page works without storage. Classic script (global APP_LINE); loaded after ui/app.js,
   ui/app_flow.js, ui/app_lists.js and ui/app_copies.js. */
const APP_LINE = (function () {
  const $ = APP.el, guard = APP.guard, state = APP.state;
  const KEYS = { details: 'sopBuilder.line.details', hdr: 'sopBuilder.header.more' };
  const kept = k => { try { return window.localStorage.getItem(KEYS[k]) === '1'; } catch (e) { return false; } };
  const keep = (k, on) => { try { window.localStorage.setItem(KEYS[k], on ? '1' : '0'); } catch (e) { /* private window: it lasts this visit */ } };
  const log = what => console.log('[ui] ' + what);
  async function ctxOf() {
    return { who: state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), next_note_id: await STORE.nextId('chart_notes', 'note_id'), reason: '' };
  }
  /* toggle(btn, box, k): a "+" button that opens and closes box in place ("+ details" open reads "− details", "1 copy ▸" reads "1 copy ▾");
     k = the key kept in this browser */
  function toggle(btn, box, k) {
    if (!btn || !box) { return; }
    btn.onclick = function () {
      box.hidden = !box.hidden;
      btn.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      btn.textContent = RENDER.plusWords(btn.textContent, !box.hidden);
      if (k) { keep(k, !box.hidden); }
    };
  }

  /* ---- the place: the same tab, section, box and step in another SOP of the family (a copy has the same Keys) ---- */
  function place() {
    const f = state.flow || {};
    return { tab: state.tab || 'header', section: state.section, sel: f.selected || null, step: f.step || null };
  }
  async function openAt(sopId, p) {
    const at = p || { tab: 'header' };
    await APP.showSop(sopId, at.tab === 'flow' && at.sel ? 'header' : at.tab);
    if (at.tab === 'flow' && at.sel) {
      const u = APP_FLOW.ui();
      u.selected = at.sel; u.step = at.step;
      await APP.showTab('flow');
    } else if (at.tab === 'sections' && at.section !== null && at.section !== undefined) {
      await APP.showSection(at.section);
    }
    log('opened ' + sopId + ' at ' + JSON.stringify(at));
  }

  /* ---- the SOP line ---- */
  function wire() {
    toggle($('btn-details'), $('sop-details'), 'details');
    if ($('line-door')) { $('line-door').onclick = e => { e.preventDefault(); guard('ui releaseDoor', () => APP.showTab('release')); }; }
    if ($('btn-line-compare')) { $('btn-line-compare').onclick = () => guard('ui compare', () => APP.showTab('compare')); }
    if ($('btn-my-copy')) { $('btn-my-copy').onclick = () => guard('ui editMyCopy', editMyCopy); }
    if ($('btn-back-main')) { $('btn-back-main').onclick = () => guard('ui backToMain', () => openAt(state.view.line.main_id, place())); }
    for (const a of document.querySelectorAll('#crumbs .crumb-main')) {
      a.onclick = e => { e.preventDefault(); guard('ui backToMain', () => openAt(a.dataset.sop, place())); };
    }
    if ($('sop-find')) {
      $('sop-find').onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); guard('ui find', findNow); }
        if (e.key === 'Escape') { e.preventDefault(); $('sop-find').value = ''; $('find-out').textContent = ''; state.find = null; }
      };
      if (state.find && state.find.sop === state.sop_id) { $('sop-find').value = state.find.q; $('find-out').textContent = state.find.out || ''; }
    }
  }

  /* Edit in my copy (plan 4.1): your copy of this SOP opens; with none, one is saved as "<Name> <dd.mm.yy>" and opens; the same place */
  async function editMyCopy() {
    const at = place(), sopId = state.sop_id;
    log('→ engine myCopy ' + sopId + ' for ' + state.editor);
    const r = ENGINE_LINE.myCopy(state.tables, sopId, state.editor, APP.nowIso());
    if (r.refusals) { throw new Error('ui editMyCopy: ' + r.refusals.map(x => x.message).join(' · ')); }
    let id = r.open;
    if (!id) {
      const ctx = await ctxOf();
      const s = ENGINE.saveCopy({ tables: state.tables, sop_id: sopId, name: r.make, ctx: ctx });
      if (s.refusals) { throw new Error('ui editMyCopy: ' + s.refusals.map(x => x.message).join(' · ')); }
      log('engine → saveCopy ' + s.sop_id + ' "' + r.make + '"');
      await APP.writeTables(s.tables, ctx);
      id = s.sop_id;
    }
    await openAt(id, at);
  }

  /* ---- ☰ All tabs: Another copy, Delete this copy ---- */
  function wireMenu(box) {
    if ($('tm-copy')) { $('tm-copy').onclick = e => { e.stopPropagation(); guard('ui anotherCopy', openCopyForm); }; }
    if ($('btn-copy-delete')) { $('btn-copy-delete').onclick = e => { e.stopPropagation(); closeMenu(); guard('ui deleteCopy', APP_COPIES.remove); }; }
  }
  function closeMenu() { if ($('tab-menu')) { $('tab-menu').hidden = true; } if ($('btn-tabs')) { $('btn-tabs').classList.remove('active'); } }
  /* the form under the SOP line, the name filled (plan rule 3: "<Name> <dd.mm.yy>", " 2" when taken); Enter saves, Esc cancels */
  function openCopyForm() {
    closeMenu();
    const mine = ENGINE_LINE.myCopy(state.tables, state.sop_id, state.editor, APP.nowIso());
    if (mine.refusals) { throw new Error('ui anotherCopy: ' + mine.refusals.map(x => x.message).join(' · ')); }
    $('line-form').innerHTML = RENDER.copyForm(state.view, mine.free);
    const box = $('cp-name');
    const cancel = () => { $('line-form').innerHTML = ''; };
    $('btn-save-copy').onclick = () => guard('ui saveCopy', () => APP_COPIES.saveCopy(place()));
    $('btn-copy-cancel').onclick = cancel;
    box.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); guard('ui saveCopy', () => APP_COPIES.saveCopy(place())); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    };
    box.focus(); box.select();
  }

  /* ---- the search box (plan 4.6): Enter selects on the open tab; Enter again, the next match ---- */
  async function findNow() {
    const q = $('sop-find').value;
    const again = state.find && state.find.sop === state.sop_id && state.find.q === q && state.find.r;
    const r = again ? state.find.r : ENGINE_LINE.findStep({ tables: state.tables, sop_id: state.sop_id, query: q });
    const i = again && r.matches.length ? (state.find.i + 1) % r.matches.length : 0;
    const out = (r.matches.length > 1 ? (i + 1) + ' of ' + r.matches.length + ' · ' : '') + r.line;
    state.find = { sop: state.sop_id, q: q, r: r, i: i, out: out };
    log('find "' + q + '": ' + out);
    if (r.kind === 'none') { $('find-out').textContent = out; return; }
    const m = r.matches[i] || null;
    const tab = state.tab, sec = m ? m.section : r.section;
    if (r.kind === 'vn' && (tab === 'vn' || (!m && r.section === null))) { await markVn(r.vn_id); }
    else if (tab === 'sections') { await markSection(sec, m ? m.key : null); }
    else { await selectFlow(sec, m ? m.key : null); }
    if ($('find-out')) { $('find-out').textContent = out; }
    if ($('sop-find')) { $('sop-find').value = q; $('sop-find').focus(); }
  }
  async function selectFlow(section, key) {
    const u = APP_FLOW.ui();
    u.selected = section === null || section === undefined ? null : String(section); u.step = key; u.selectedArrow = null;
    if (state.tab !== 'flow') { await APP.showTab('flow'); } else { await APP_FLOW.showFlow(); }
    const box = key ? document.querySelector('#steps-svg .fbox[data-id="' + key + '"]') : document.querySelector('#flow-svg .fbox[data-id="' + section + '"]');
    if (box && box.scrollIntoView) { box.scrollIntoView({ block: 'nearest' }); }
  }
  async function markSection(section, key) {
    if (section === null || section === undefined) { return; }
    await APP.showSection(section);
    const row = key ? document.querySelector('#section-view tr.step-row[data-key="' + key + '"]') : null;
    if (row) { row.classList.add('row-mark'); row.scrollIntoView({ block: 'center' }); }
  }
  async function markVn(vnId) {
    if (state.tab !== 'vn') { await APP.showTab('vn'); }
    let b = document.querySelector('#tab-body .btn-give[data-vn="' + vnId + '"]');
    if (!b && state.vnFilter) { state.vnFilter.state = 'all'; state.vnFilter.section = ''; await APP.showTab('vn'); b = document.querySelector('#tab-body .btn-give[data-vn="' + vnId + '"]'); }
    const row = b ? b.closest('tr') : null;
    if (row) { row.classList.add('row-mark'); row.scrollIntoView({ block: 'center' }); }
  }

  /* ---- the Header tab: "+ n more fields", the copies door, the double-click, Make this the good version's "+ details" ---- */
  function wireHeader(body) {
    toggle($('btn-hdr-more'), $('hdr-more'), 'hdr');
    const list = body.querySelector('.copies-list');
    if ($('btn-copies') && list) { toggle($('btn-copies'), list, null); }
    toggle($('btn-promote-details'), $('promote-line'), null);
    if (!state.view || !state.view.hdr_edit) { return; }
    for (const tr of body.querySelectorAll('table.kv.hdr-edit tr[data-row]')) {
      tr.ondblclick = e => {
        e.preventDefault();
        if (window.getSelection) { window.getSelection().removeAllRanges(); }
        guard('ui headerRow', () => openHeaderAt(tr.dataset.field || null));
      };
    }
  }
  /* openHeaderAt(field): the header form, the field ready to type (the row editor for header rows is job 7) */
  function openHeaderAt(field) {
    if (!$('header-form')) { APP_LISTS.openHeader(); }
    const el = field ? document.querySelector('#hd-form [name="' + field + '"]') : null;
    if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
    log('header form' + (field ? ' at ' + field : ''));
  }

  return { wire, wireMenu, wireHeader, place, openAt, editMyCopy, openCopyForm, findNow, openHeaderAt, kept };
})();
