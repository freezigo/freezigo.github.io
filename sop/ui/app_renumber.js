/* SOP Builder: Renumber (spec/example_renumber.md parts 5 and 6, build 40).
   open(section): the engine works out the new numbers and the texts that
   change (ENGINE_CHART.renumberPreview); the pop-up shows them with a tick
   per text; Renumber saves through the Reason pop-up (or at once in draft
   mode) with the unticked texts left as they are; Cancel or Esc changes
   nothing. section null = every section. Classic script (global
   APP_RENUMBER); loaded after ui/app_flow.js and ui/app_reason.js. */
const APP_RENUMBER = (function () {
  const $ = APP.el, guard = APP.guard, state = APP.state;
  function close() { const b = $('pop-back'); if (b) { b.remove(); } }

  async function open(section) {
    const sop = state.view.sop;
    const what = section === null ? 'Renumber all sections' : 'Renumber section ' + section;
    console.log('[ui → engine] renumberPreview ' + sop.sop_id + ' ' + (section === null ? 'all sections' : 'section ' + section));
    const p = ENGINE_CHART.renumberPreview({ tables: state.tables, sop_id: sop.sop_id, section: section });
    if (p.refusals) { APP_FLOW.refuse(p); return; }
    console.log('[engine → ui] renumberPreview: ' + p.steps.length + ' steps, ' + p.texts.length + ' texts, ' + p.stale.length + ' to check');
    close();
    document.body.insertAdjacentHTML('beforeend', RENDER_POP.renumberPop(p, what));
    const go = function () {
      const skip = Array.from(document.querySelectorAll('#renum-pop .renum-tick')).filter(b => !b.checked).map(b => b.dataset.id);
      close();
      guard('ui renumber', () => APP_FLOW.change(what, ctx => ENGINE_CHART.renumber({ tables: state.tables, sop_id: sop.sop_id, section: section, skip: skip, ctx: ctx }), function (r, ctx) {
        console.log('[ui → engine] renumber ' + sop.sop_id + ' ' + (section === null ? 'all' : section) + ': ' + r.steps + ' steps, ' + r.texts + ' texts, ' + skip.length + ' left');
        return APP_FLOW.afterRenumber(r, ctx, 'renumber');
      }));
    };
    $('btn-renum-ok').onclick = go;
    $('btn-renum-cancel').onclick = () => { close(); console.log('[ui] renumber cancelled'); };
    $('pop-back').onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    $('btn-renum-ok').focus();
  }

  return { open };
})();
