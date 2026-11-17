/* SOP Builder: the Reason pop-up and the yes or no pop-up (example_flow.md
   part 18.4). ask(what, attempt, onRefusals): attempt(reason, dry) runs one
   change; with dry = true it only checks and writes nothing (it returns the
   refusals, or null); with dry = false it saves. The change is checked
   first: refusals show where the change shows them (onRefusals) and no
   pop-up opens; else the pop-up asks the reason, and OK (Enter, or a click
   on a last reason) saves. Cancel (Esc) changes nothing. The last three
   reasons are kept in this browser (ENGINE_MENUS.keepReason). While the
   open revision is in draft mode (ENGINE_MENUS.reasonAsked: Draft, not
   signed; build 27 for a new SOP, build 36 for every revision) no pop-up
   opens: the change saves at once with the reason of
   ENGINE_MENUS.draftReason, "First draft" or "Draft Rev 02", or in a copy
   "Copy Club trial" (example_new_sop.md part 8, example_release.md part
   8.1, example_copy.md part 6).
   Classic script (global APP_REASON); loaded after ui/app.js. */
const APP_REASON = (function () {
  const $ = APP.el, guard = APP.guard;
  const KEY = 'sopBuilder.reasons', PROBE = 'check';
  let mem = [];
  function last() {
    try { const v = JSON.parse(window.localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : mem; } catch (e) { return mem; }
  }
  function remember(reason) {
    mem = ENGINE_MENUS.keepReason(last(), reason);
    try { window.localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* a private window: kept for this visit */ }
  }
  function close() { const b = $('pop-back'); if (b) { b.remove(); } }
  const isOpen = () => !!$('pop-back');

  async function ask(what, attempt, onRefusals) {
    const st = APP.state;
    const rev = st.sop_id && st.view ? st.view.rev : null;
    if (!ENGINE_MENUS.reasonAsked(rev)) {
      const reason = ENGINE_MENUS.draftReason(rev, st.view.sop);
      console.log('[ui] draft mode: "' + what + '" saved with the reason ' + reason);
      const ref = await attempt(reason, false);
      if (ref && ref.length) { onRefusals(ref); }
      return;
    }
    const pre = await attempt(PROBE, true);
    if (pre && pre.length) { console.log('[ui] refused before the reason: ' + pre.map(x => x.message).join('; ')); onRefusals(pre); return; }
    close();
    const list = last();
    document.body.insertAdjacentHTML('beforeend', RENDER_POP.reasonPop(what, list));
    const box = $('reason-text');
    const go = function (typed) {
      const r = String(typed || '').trim();
      if (!r) { $('reason-refusal').textContent = 'Reason for change is empty.'; box.focus(); return; }
      close(); remember(r);
      console.log('[ui] reason for "' + what + '": ' + r);
      guard('ui ' + what, async function () { const ref = await attempt(r, false); if (ref && ref.length) { onRefusals(ref); } });
    };
    const cancel = () => { close(); console.log('[ui] cancelled: ' + what); };
    $('btn-reason-ok').onclick = () => go(box.value);
    $('btn-reason-cancel').onclick = cancel;
    for (const b of $('reason-pop').querySelectorAll('.reason-pick')) { b.onclick = () => go(list[Number(b.dataset.i)]); }
    $('pop-back').onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      else if (e.key === 'Enter' && e.target === box) { e.preventDefault(); e.stopPropagation(); go(box.value); }
    };
    $('pop-back').onmousedown = e => { if (e.target.id === 'pop-back') { e.preventDefault(); box.focus(); } };
    box.focus();
  }
  /* confirm(what, text, okWord, run): a yes or no pop-up; run() on the yes */
  function confirm(what, text, okWord, run) {
    close();
    document.body.insertAdjacentHTML('beforeend', RENDER_POP.askPop(what, text, okWord));
    $('btn-ask-ok').onclick = () => { close(); guard('ui ' + what, run); };
    $('btn-ask-cancel').onclick = close;
    $('pop-back').onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    $('btn-ask-ok').focus();
  }

  return { ask, confirm, close, isOpen };
})();
