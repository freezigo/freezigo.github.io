/* SOP Builder main engine for Undo my last change (build 70, spec/example_job1_70.md part 3): undoLast writes the change ENGINE_UNDO
   undoPlan finds, back to its old values, through Edit step (ENGINE.saveStep) or Edit section (ENGINE_CHART.saveSection), by ctx.who at
   ctx.now with the plan's reason ("Undo of the change of 27 Nov 14:05: Draft Rev 02"): History keeps the change's rows and gets the
   undo's. A Checked or Approved revision goes back to Draft as after any edit. No logic of its own beyond choosing the composer.
   Classic script (global ENGINE_UNDO_MAIN); module in Node. Checked by tests/undo_engine_check.js and tests/undo_check.js. */
const ENGINE_UNDO_MAIN = (function () {
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const R = (typeof ENGINE_RELEASE !== 'undefined') ? ENGINE_RELEASE : require('./release.js');
  const U = (typeof ENGINE_UNDO !== 'undefined') ? ENGINE_UNDO : require('./undo.js');
  const MAIN = (typeof ENGINE !== 'undefined') ? ENGINE : require('./main.js');
  const CHART = (typeof ENGINE_CHART !== 'undefined') ? ENGINE_CHART : require('./main_flow.js');
  function fail(msg) { throw new Error('engine.undoLast: ' + msg); }

  /* undoLast({ tables, sop_id, ctx }) → { refusals } or { refusals: null, new_history, tables, ctx }; ctx.reason is not used: the reason
     is the plan's undo_reason (no pop-up), handed back in ctx */
  function undoLast(input) {
    if (!input || !input.tables || !input.sop_id || !input.ctx) { fail('input needs tables, sop_id and ctx'); }
    const t = input.tables;
    const sop = SEL.sopOf(t, input.sop_id);
    if (sop.current_rev) {
      const lock = R.lockText(SEL.revisionOf(t, sop.sop_id, sop.current_rev));
      if (lock) { return { refusals: [{ field: 'form', message: lock }] }; }
    }
    const p = U.undoPlan(t, input.sop_id, input.ctx.who);
    if (!p.can) { return { refusals: [{ field: 'undo', message: p.why }] }; }
    const ctx = Object.assign({}, input.ctx, { reason: p.undo_reason });
    const g = p.target;
    const r = g.table === 'steps'
      ? MAIN.saveStep({ tables: t, sop_id: input.sop_id, rev: g.rev, key: g.key, changes: g.changes, ctx: ctx })
      : CHART.saveSection({ tables: t, sop_id: input.sop_id, section: g.section, changes: g.changes, ctx: ctx });
    if (r.refusals) { return { refusals: r.refusals }; }
    return { refusals: null, new_history: r.new_history, tables: r.tables, ctx: ctx, label: p.label };
  }

  return { undoLast };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_UNDO_MAIN;
