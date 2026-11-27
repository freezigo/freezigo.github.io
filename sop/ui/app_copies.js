/* SOP Builder: copies of an SOP on the Header tab (spec/example_copy.md,
   build 39): Save a copy under a name, Compare with the good version, Make
   this the good version (the yes or no pop-up), Delete this copy (the yes
   or no pop-up), and the links to the copies of a good version. The engine
   (ENGINE.saveCopy, promoteCopy, deleteCopy) checks and builds the tables;
   this file writes them and opens the next screen.
   Classic script (global APP_COPIES); loaded after ui/app.js and
   ui/app_reason.js. */
const APP_COPIES = (function () {
  const $ = APP.el, guard = APP.guard, state = APP.state;
  async function ctxOf() {
    return { who: state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), next_note_id: await STORE.nextId('chart_notes', 'note_id'),
      next_rh_id: await STORE.nextId('revision_history', 'rh_id'), reason: '' };
  }
  const card = cls => document.querySelector('.' + cls);

  /* wire(body): the buttons of the copy card and the copies list of the Header tab; build 71: Save a copy is ☰ Another copy (its form
     under the SOP line, ui/app_line.js), Compare is on the SOP line, Delete this copy in ☰ All tabs */
  function wire(body) {
    if ($('btn-copy-promote')) { $('btn-copy-promote').onclick = () => guard('ui promoteCopy', promote); }
    for (const a of body.querySelectorAll('.copies-list .sop-link')) {
      a.onclick = e => { e.preventDefault(); guard('ui showSop', () => APP.showSop(a.dataset.sop, 'header')); };
    }
  }

  /* saveCopy(place): the name typed in the form of ☰ Another copy; the new copy opens at the same place (build 71) */
  async function saveCopy(place) {
    const sop = state.view.sop, ctx = await ctxOf();
    console.log('[ui → engine] saveCopy ' + sop.sop_id + ' "' + $('cp-name').value + '"');
    const r = ENGINE.saveCopy({ tables: state.tables, sop_id: sop.sop_id, name: $('cp-name').value, ctx: ctx });
    if (r.refusals) {
      console.log('[engine → ui] saveCopy refused: ' + r.refusals.map(x => x.message).join('; '));
      RENDER_EDIT.showRefusals(card('copy-save'), r.refusals);
      return;
    }
    console.log('[engine → ui] saveCopy: ' + r.sop_id + ', ' + r.tables.steps.filter(s => s.sop_id === r.sop_id).length + ' steps');
    await APP.writeTables(r.tables, ctx);
    await APP_LINE.openAt(r.sop_id, place || { tab: 'header' });
    window.scrollTo(0, 0);
  }

  /* Make this the good version: the engine checks first (an empty note, a step retired in the good version since the copy was saved);
     the pop-up names the new revision; Yes writes it and opens the good version on its Compare tab */
  async function promote() {
    const view = state.view, c = view.copy, ctx = await ctxOf();
    const r = ENGINE.promoteCopy({ tables: state.tables, sop_id: view.sop.sop_id, note: $('pc-note').value, ctx: ctx });
    if (r.refusals) {
      console.log('[engine → ui] promoteCopy refused: ' + r.refusals.map(x => x.message).join('; '));
      RENDER_EDIT.showRefusals(card('this-copy'), r.refusals);
      return;
    }
    /* build 45: the main changes not yet applied or skipped (example_copy_sync.md part 5.3) */
    const n = view.main_changes;
    /* build 50 (example_rights.md part 6.5): the copy replaces the newest revision while it is not released, else it is the next one */
    const replace = r.kind === 'replace';
    const head = replace
      ? 'Copy ' + c.name + ' replaces ' + c.of + ' ' + r.rev + ', a draft: ' + r.rev + ' takes the copy\'s sections, steps, lists and header, and its sign-offs (Checked by, Approved by) are cleared. '
      : 'Copy ' + c.name + ' becomes ' + c.of + ' ' + r.rev + ', a draft. ' + c.good_rev + ' stays as it is. ';
    const others = (c.since || []).filter(x => x.kind === 'replace' && x.rev === r.rev);
    const warn = replace && others.length ? 'Copy ' + others[others.length - 1].copy_name + ' (' + others[others.length - 1].who + ') replaced ' + r.rev + ' on ' +
      String(others[others.length - 1].at).slice(0, 16).replace('T', ' ') + ', after this copy was saved: Yes puts this copy in its place. ' : '';
    const text = head +
      (n ? n + (n === 1 ? ' change' : ' changes') + ' made to ' + c.of + ' after the copy was saved ' + (n === 1 ? 'is' : 'are') + ' not applied or skipped (Header tab, Changes in ' + c.of + ').'
        : 'Changes made to ' + c.of + ' after the copy was saved are in it only where you applied them.') + ' ' + warn + 'The copy is then removed.';
    APP_REASON.confirm('Make this the good version', text, (replace ? 'Yes, replace ' : 'Yes, make ') + r.rev, async function () {
      console.log('[ui] promoteCopy ' + view.sop.sop_id + ' → ' + c.of + ' ' + r.rev + ' (' + r.kind + ')');
      await APP.writeTables(r.tables, ctx);
      state.compareAgainst = null;
      /* the next revision opens on its Compare tab (against the one before); a replaced draft on its Header tab (build 50) */
      await APP.showSop(c.of, replace ? 'header' : 'compare');
      window.scrollTo(0, 0);
    });
  }

  /* Delete this copy: the pop-up, then every row of the copy goes; the SOP list opens */
  async function remove() {
    const view = state.view, c = view.copy;
    const text = 'Delete copy ' + c.name + ' (' + view.sop.sop_id + ')? Its steps and notes go; the good version does not change. This cannot be undone.';
    APP_REASON.confirm('Delete this copy', text, 'Yes, delete the copy', async function () {
      const ctx = await ctxOf();
      const r = ENGINE.deleteCopy({ tables: state.tables, sop_id: view.sop.sop_id, ctx: ctx });
      console.log('[ui] deleteCopy ' + view.sop.sop_id + ': ' + r.new_history.length + ' History row');
      await APP.writeTables(r.tables, ctx);
      await APP.showSopList();
      window.scrollTo(0, 0);
    });
  }

  return { wire, saveCopy, promote, remove };
})();
