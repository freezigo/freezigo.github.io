/* SOP Builder: the final PDFs (spec/example_rights.md part 9, build 50; Samrat 2026-11-14: "make one folder where all final sops are
   saved in pdf"). The folder is Final SOPs in the SOP App folder; the older PDFs of an SOP go to Final SOPs/Old. At release (APP_ACTIONS
   .release) and with Save the final PDF (Floor PDF tab) the older PDFs move first, then the floor copy of the revision on the floor
   opens in a new tab named as the final PDF ("BMC-L1-TANK-01 Rev 02") and Chrome's print window opens on it: Save as PDF, in Final
   SOPs. The names and the moves come from the engine (ENGINE_FLOOR.finalPdfName, oldPdfMoves); the store moves the files.
   Test seam: state.noPrint = true opens the floor copy without the print window. Classic script (global APP_FINAL); loaded after
   ui/app_actions.js. */
const APP_FINAL = (function () {
  const $ = APP.el, guard = APP.guard, state = APP.state;
  const FINAL = ENGINE_FLOOR.FINAL_DIR, OLD = ENGINE_FLOOR.OLD_DIR;

  /* onFloor(view) → { sop_id, rev, name } of the revision of a good version that is on the floor (the current one when it is Released,
     else the one still on the floor, build 36), or null */
  function onFloor(view) {
    if (!view || !view.rev || view.copy) { return null; }
    const id = view.sop.sop_id;
    const row = view.rev.status === 'Released' ? view.rev
      : (view.floor_rev ? state.tables.sop_revisions.find(r => r.sop_id === id && r.rev === view.floor_rev.rev) || null : null);
    const name = row ? ENGINE_FLOOR.finalPdfName(id, row) : null;
    return name ? { sop_id: id, rev: row.rev, name: name } : null;
  }
  /* saved(name) → true when Final SOPs/<name>.pdf is there */
  async function saved(name) {
    if (STORE.status().mode === 'none') { return false; }
    try { return await STORE.fileExists(FINAL + '/' + name + '.pdf'); } catch (e) { return false; }
  }
  /* moveOld(sopId, keepName) → the names moved from Final SOPs to Final SOPs/Old (the folders are made when missing) */
  async function moveOld(sopId, keepName) {
    await STORE.makeDir(OLD);
    const moves = ENGINE_FLOOR.oldPdfMoves(await STORE.listFiles(FINAL), await STORE.listFiles(OLD), sopId, keepName);
    for (const m of moves) {
      console.log('[ui → store] moveFile ' + m.from + ' → ' + m.to);
      await STORE.moveFile(m.from, m.to);
    }
    return moves.map(m => m.from.split('/').pop());
  }
  /* save(f, w) → the names moved to Old: the older PDFs move, then tab w (opened at the click) gets the floor copy named f.name */
  async function save(f, w) {
    const moved = state.online ? [] : await moveOld(f.sop_id, f.name);   /* build 56: online there is no Final SOPs folder to tidy */
    const html = await APP_ACTIONS.floorHtml(f.rev === state.view.sop.current_rev ? null : f.rev, { title: f.name, auto_print: !state.noPrint });
    w.document.open(); w.document.write(html); w.document.close();
    console.log('[ui] final PDF ' + f.name + ': floor copy opened' + (state.noPrint ? '' : ' with the print window') + (moved.length ? '; moved to Old: ' + moved.join(', ') : ''));
    return moved;
  }

  /* wire(body): the Final PDF line of the Floor PDF tab (part 9.4) and its button */
  async function wire(body) {
    const slot = body.querySelector('#final-slot');
    const f = onFloor(state.view);
    if (!slot || !f) { return; }
    if (state.online) { return; }   /* build 54: online, no Final PDF line: the final PDFs stay on Samrat's PC (Vishal 2026-11-17) */
    slot.innerHTML = RENDER_TABS.finalCard(Object.assign({ saved: await saved(f.name) }, f));
    $('btn-final-save').onclick = function () {
      const w = window.open('', '_blank');   /* at the click, so the browser lets the tab open */
      guard('ui finalPdf', async function () {
        const out = slot.querySelector('.refusal[data-for="final"]');
        if (!w) { out.textContent = 'The browser blocked the new tab: allow pop-ups for this page, then click again.'; return; }
        const moved = await save(f, w);
        out.className = 'given-note'; out.id = 'final-done';
        out.textContent = 'The floor copy is open in a new tab: save it as ' + f.name + '.pdf in Final SOPs.' + (moved.length ? ' Moved to Final SOPs\\Old: ' + moved.join(', ') + '.' : '');
      });
    };
  }

  return { onFloor, saved, moveOld, save, wire };
})();
