/* SOP Builder: the changes of a main SOP offered to its copies (spec/example_copy_sync.md, build 45). afterWrite(tables, before):
   called by APP.writeTables; when a save of a good version that has a copy is offered (ENGINE_SYNC.offeredRow), the pop-up opens
   (ENGINE_SYNC_MAIN.changeAfterSave). wireCard(body): the list on the copy's Header tab (ENGINE_SYNC_MAIN.copyChanges). Apply and
   Skip go to the engine (applyMainChange, skipMainChange), which checks and builds the tables; this file writes them. No reason is
   asked: a copy never asks one (the copy's History carries "Main change N: " and the main's reason). Build 47 (part 5.5): a new or
   moved step shows Put it and where it goes before Apply (wireBody: another place draws the change again from previewMainChange);
   Apply of such a change asks once more (confirm) and writes after Yes. Classic script (global APP_SYNC); loaded after ui/app.js. */
const APP_SYNC = (function () {
  const $ = APP.el, guard = APP.guard, state = APP.state;
  const ctxOf = async () => ({ who: state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: '' });
  function close() { const b = $('sync-back'); if (b) { b.remove(); } }
  const picksOf = box => {
    const out = {};
    for (const r of box.querySelectorAll('.sync-pick input[type=radio]:checked')) { if (r.value === 'main') { out[r.dataset.id] = 'main'; } }
    return out;
  };
  /* decide(box, copyId, changeId, how, places): Apply or Skip of one change for one copy; the words of the result go in the box */
  async function decide(box, copyId, changeId, how, places) {
    const ctx = await ctxOf();
    const r = how === 'apply'
      ? ENGINE_SYNC_MAIN.applyMainChange({ tables: state.tables, sop_id: copyId, change_id: changeId, picks: picksOf(box), places: places || {}, ctx: ctx })
      : ENGINE_SYNC_MAIN.skipMainChange({ tables: state.tables, sop_id: copyId, change_id: changeId, ctx: ctx });
    if (r.refusals) {
      console.log('[engine → ui] ' + how + ' main change ' + changeId + ' for ' + copyId + ' refused: ' + r.refusals.map(x => x.message).join('; '));
      const slot = box.querySelector('.sync-confirm-refusal') || box.querySelector('.sync-refusal');
      slot.textContent = r.refusals.map(x => x.message).join(' · ');
      return false;
    }
    console.log('[engine → ui] ' + how + ' main change ' + changeId + ' for ' + copyId + ': ' + r.new_history.length + ' History rows');
    await APP.writeTables(r.tables, ctx);
    return true;
  }

  const placesOf = box => {
    const out = {};
    for (const sel of box.querySelectorAll('.sync-place-sel')) { out[sel.dataset.key] = sel.value; }
    return out;
  };
  const whyOf = p => (p.refusals ? p.refusals.map(x => x.message).join(' · ') : (p.can_apply ? '' : p.why));
  /* wireBody(box, o): build 47 (example part 5.5): another place in Put it draws the change again with where it goes and the numbers it
     changes (previewMainChange; nothing is written); Apply of a change with a new or moved step asks once more (confirm); Skip.
     o = { copyId, changeId, plan, words (RENDER_SYNC.popWords or cardWords), run(how, places) } */
  function wireBody(box, o) {
    const body = box.querySelector('.sync-body');
    for (const sel of body.querySelectorAll('.sync-place-sel')) {
      sel.onchange = () => guard('ui previewPlace', function () {
        const picks = picksOf(box), places = placesOf(box);
        const p = ENGINE_SYNC_MAIN.previewMainChange({ tables: state.tables, sop_id: o.copyId, change_id: o.changeId, picks: picks, places: places });
        console.log('[engine → ui] previewMainChange ' + o.changeId + ' for ' + o.copyId + ' (' + sel.value + '): ' + (whyOf(p) || 'can apply'));
        if (p.refusals) { body.querySelector('.sync-refusal').textContent = whyOf(p); return; }
        body.outerHTML = RENDER_SYNC.body(p, o.words, picks);
        wireBody(box, Object.assign({}, o, { plan: p }));
        const again = box.querySelector('.sync-place-sel[data-key="' + sel.dataset.key + '"]');
        if (again) { again.focus(); }
      });
    }
    body.querySelector('.btn-sync-apply').onclick = () => guard('ui applyMainChange', () => (o.plan.places.length ? confirm(box, o) : o.run('apply', {})));
    body.querySelector('.btn-sync-skip').onclick = () => o.run('skip');
  }
  /* confirm(box, o): Apply asks once more, with where each new or moved step goes (the places shown); Yes writes it, No goes back */
  function confirm(box, o) {
    const body = box.querySelector('.sync-body'), btns = body.querySelector('.sync-btns');
    const places = placesOf(box);
    const p = ENGINE_SYNC_MAIN.previewMainChange({ tables: state.tables, sop_id: o.copyId, change_id: o.changeId, picks: picksOf(box), places: places });
    if (whyOf(p)) { body.querySelector('.sync-refusal').textContent = whyOf(p); return; }
    btns.hidden = true;
    const off = Array.from(body.querySelectorAll('select, input')).filter(e => !e.disabled);
    for (const e of off) { e.disabled = true; }
    btns.insertAdjacentHTML('afterend', RENDER_SYNC.confirmStrip(p, o.words.whom));
    const strip = body.querySelector('.sync-confirm');
    strip.querySelector('.btn-sync-yes').onclick = () => o.run('apply', places);
    strip.querySelector('.btn-sync-no').onclick = () => guard('ui applyNo', function () {
      strip.remove(); btns.hidden = false;
      for (const e of off) { e.disabled = false; }
      body.querySelector('.btn-sync-apply').focus();
    });
    strip.querySelector('.btn-sync-yes').focus();
    console.log('[ui] main change ' + o.changeId + ' for ' + o.copyId + ': Apply asks once more');
  }

  /* afterWrite(tables, beforeMax): the History rows just written; a save of a good version with a copy opens the pop-up */
  function afterWrite(tables, beforeMax) {
    if (!tables.history || !state.tables) { return; }
    const fresh = tables.history.filter(h => h.hist_id > beforeMax);
    const goods = {};
    for (const h of fresh) {
      if (!ENGINE_SYNC.offeredRow(h)) { continue; }
      const hasCopy = state.tables.sops.some(s => s.copy_of === h.sop_id);
      if (hasCopy) { goods[h.sop_id] = Math.min(goods[h.sop_id] || Infinity, ...fresh.filter(x => x.sop_id === h.sop_id).map(x => x.hist_id)); }
    }
    for (const id of Object.keys(goods)) { setTimeout(() => guard('ui offerToCopies', () => offer(id, goods[id])), 0); }
  }
  /* offer(mainId, changeId): the pop-up of part 5.1 */
  function offer(mainId, changeId) {
    /* build 50 (example_rights.md part 6.8): only the copies of the name at the top */
    const list = ENGINE_SYNC_MAIN.changeAfterSave({ tables: state.tables, sop_id: mainId, change_id: changeId }).filter(x => { const r = APP.rightsOf(x.copy_id); return !r || r.can_change; });
    if (!list.length) { return; }
    close();
    document.body.insertAdjacentHTML('beforeend', RENDER_SYNC.syncPop(mainId, list));
    console.log('[ui] main change ' + changeId + ' of ' + mainId + ' offered to ' + list.map(x => x.copy_id).join(', '));
    const left = () => Array.from($('sync-pop').querySelectorAll('.sync-copy')).filter(b => !b.classList.contains('decided')).length;
    for (const box of $('sync-pop').querySelectorAll('.sync-copy')) {
      const copyId = box.dataset.copy, x = list.find(y => y.copy_id === copyId);
      const run = (how, places) => guard('ui ' + how + 'MainChange', async function () {
        if (!(await decide(box, copyId, changeId, how, places))) { return; }
        box.classList.add('decided');
        const strip = box.querySelector('.sync-confirm');
        if (strip) { strip.remove(); box.querySelector('.sync-btns').hidden = false; }
        for (const b of box.querySelectorAll('button, input, select')) { b.disabled = true; }
        box.querySelector('.sync-done').textContent = how === 'apply' ? 'Applied' : 'Skipped';
        if (!left()) { close(); }
      });
      wireBody(box, { copyId: copyId, changeId: changeId, plan: x.plan, words: RENDER_SYNC.popWords(x), run: run });
    }
    $('btn-sync-later').onclick = close;
    $('sync-back').onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    $('btn-sync-later').focus();
  }

  /* wireCard(body): the list on the Header tab of a copy (part 5.2) */
  function wireCard(body) {
    const slot = body.querySelector('#sync-slot');
    if (!slot || !state.view || !state.view.copy) { return; }
    const v = ENGINE_SYNC_MAIN.copyChanges({ tables: state.tables, sop_id: state.view.sop.sop_id });
    slot.innerHTML = RENDER_SYNC.changesCard(v);
    /* build 50 (example_rights.md part 6.8): someone else's copy shows its list without Apply and Skip */
    const rt = state.view.rights;
    if (rt && !rt.can_change) {
      for (const b of slot.querySelectorAll('.sync-btns')) { b.remove(); }
      for (const e of slot.querySelectorAll('select, input')) { e.disabled = true; }
      if (v.changes.length) { slot.querySelector('#sync-card').insertAdjacentHTML('beforeend', '<p class="muted" id="sync-owner-only">Only ' + RENDER.esc(rt.owner) + ' applies or skips these.</p>'); }
      return;
    }
    for (const box of slot.querySelectorAll('.sync-change')) {
      const changeId = Number(box.dataset.change), plan = v.changes.find(x => x.change_id === changeId);
      const run = (how, places) => guard('ui ' + how + 'MainChange', async function () {
        if (!(await decide(box, v.copy_id, changeId, how, places))) { return; }
        await APP.showSop(v.copy_id, 'header');
        const card = $('sync-card');
        if (card) { card.scrollIntoView({ block: 'nearest' }); }
      });
      wireBody(box, { copyId: v.copy_id, changeId: changeId, plan: plan, words: RENDER_SYNC.cardWords(plan), run: run });
    }
  }
  /* wireTags(area): "N main changes to decide" on the SOP line or the SOP list opens the list on the copy's Header tab */
  function wireTags(area) {
    for (const a of area.querySelectorAll('.sync-tag')) {
      a.onclick = e => {
        e.preventDefault();
        const id = a.dataset.sop || state.sop_id;
        guard('ui openMainChanges', async function () { await APP.showSop(id, 'header'); const card = $('sync-card'); if (card) { card.scrollIntoView({ block: 'start' }); } });
      };
    }
  }

  return { afterWrite, offer, wireCard, wireTags, close };
})();
