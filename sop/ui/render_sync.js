/* SOP Builder: the HTML of the changes of a main SOP offered to its copies (spec/example_copy_sync.md parts 5.1 and 5.2, build 45):
   syncPop (the pop-up right after a save in the main SOP) and changesCard (the list on the copy's Header tab). Each change: its
   header line, the reason, its items (where, what, the state, the copy's and the main's words with the changed words marked) and
   Apply and Skip. Build 46: each item says where it is in the main and in the copy (part 5.4). Build 47 (part 5.5): a new or moved
   step shows Put it (its places, each with the number it takes) and the Copy line before Apply; confirmStrip asks once more after
   Apply. Strings only. Classic script (global RENDER_SYNC); loaded after ui/render.js. */
const RENDER_SYNC = (function () {
  const esc = RENDER.esc;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* when(at): "14 Nov 14:27" from the History time as written (the PC's own clock) */
  function when(at) {
    const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(String(at || ''));
    return m ? Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[4] + ':' + m[5] : esc(at);
  }
  const line = (lbl, d, mark) => '<div class="sync-text"><span class="lbl">' + lbl + '</span> ' + (d.lead ? esc(d.lead) + ' ' : '') +
    (mark === 'old' ? (d.old ? '<del>' + esc(d.old) + '</del> ' : '<span class="muted">(nothing here)</span> ') : (d.new ? '<ins>' + esc(d.new) + '</ins> ' : '<span class="muted">(nothing here)</span> ')) +
    (d.tail ? esc(d.tail) : '') + '</div>';
  /* at(it): build 46 (example part 5.4): where the item is in the main and where it is in the copy now, or that the copy deleted it */
  const at = it => (it.main_at && !(it.main_at === 'the header' && it.copy_at === 'the header')
    ? '<div class="sync-text sync-at"><span class="lbl">In the main</span> ' + esc(it.main_at) + ' <span class="sep">·</span> <span class="lbl-in">In the copy</span> ' +
      (it.copy_state === 'deleted' ? '<span class="sync-gone">' + esc(it.copy_at) + '</span>' : esc(it.copy_at)) + '</div>' : '');
  /* item(it, block, n, picks): one item of a change; block names the radio buttons of a Pick; picks = { item id: 'main' } marks Use the
     main's words (a drawing again after another place is picked) */
  function item(it, block, n, picks) {
    const main = !!(picks && picks[it.id] === 'main');
    let h = '<div class="sync-item st-' + it.state + '" data-item="' + esc(it.id) + '"><div class="sync-where"><b>' + esc(it.where) + ' · ' + esc(it.what) + '</b> <span class="sync-state">' + esc(it.words) + '</span></div>' + at(it);
    if (it.kind === 'field') {
      if (it.state === 'change') { h += line('Copy now', it.diff_main, 'old') + line('Main after', it.diff_main, 'new'); }
      if (it.state === 'pick' || it.state === 'blocked') {
        h += (it.copy_text !== null ? line('Copy now', it.diff_copy, 'old') : '') + line('Main before', it.diff_main, 'old') + line('Main after', it.diff_main, 'new');
      }
      if (it.state === 'pick') {
        h += '<div class="sync-pick"><label class="radio"><input type="radio" name="' + esc(block) + '-' + n + '" value="copy" data-id="' + esc(it.id) + '"' + (main ? '' : ' checked') + '> Keep the copy\'s words</label> ' +
          '<label class="radio"><input type="radio" name="' + esc(block) + '-' + n + '" value="main" data-id="' + esc(it.id) + '"' + (main ? ' checked' : '') + '> Use the main\'s words</label></div>';
      }
      if (it.state === 'same') { h += '<div class="sync-text muted">The copy has these words already.</div>'; }
      if (it.state === 'absent') { h += line('Main before', it.diff_main, 'old') + line('Main after', it.diff_main, 'new') + '<div class="sync-text muted">Nothing to change in the copy.</div>'; }
    } else {
      h += '<div class="sync-text"><span class="lbl">Main</span> ' + esc(it.main_new) + '</div>';
      if (it.place && !it.place.follows) {
        h += '<div class="sync-text sync-put"><label><span class="lbl">Put it</span> <select class="sync-place-sel" data-key="' + esc(it.key) + '">' +
          it.place.options.map(o => '<option value="' + esc(o.id) + '"' + (o.id === it.place.id ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select></label></div>';
      }
      const follows = !!(it.place && it.place.follows);
      if (it.goes && it.state !== 'blocked') { h += '<div class="sync-text sync-goes"><span class="lbl">Copy</span> ' + esc(it.goes) + (it.then && !follows ? ' ' + esc(it.then) : '') + '</div>'; }
      if (it.place && it.place.follows && it.state === 'change') { h += '<div class="sync-text muted">Follows the new step before it, as in the main.</div>'; }
      if (it.state === 'same') { h += '<div class="sync-text muted">The copy has this already.</div>'; }
      if (it.state === 'absent') { h += '<div class="sync-text muted">Nothing to change in the copy.</div>'; }
    }
    if (it.state === 'blocked') { h += '<div class="sync-text refusal">' + esc(it.why) + '</div>'; }
    return h + '</div>';
  }
  /* confirmStrip(plan, whom): build 47 (part 5.5): Apply of a change with a new or moved step asks once more, with where each one goes */
  function confirmStrip(plan, whom) {
    const its = plan.items.filter(i => i.place && i.state === 'change' && i.goes);
    let h = '<div class="sync-confirm"><div class="sync-confirm-title">Apply main change ' + plan.change_id + ' to ' + esc(whom) + '?</div>';
    for (const it of its) { h += '<div class="sync-text"><b>' + esc(it.where) + ' · ' + esc(it.what) + ':</b> ' + esc(it.goes) + '</div>'; }
    const thens = its.map(i => i.then).filter((x, k, a) => x && a.indexOf(x) === k);
    for (const x of thens) { h += '<div class="sync-text">' + esc(x) + '</div>'; }
    return h + '<div class="sync-btns"><button class="btn-sync-yes">Yes, apply</button> <button class="btn-sync-no">No</button> <span class="refusal sync-confirm-refusal"></span></div></div>';
  }
  /* body(plan, w, picks): the items and the two buttons, in one block drawn again when another place is picked; w = popWords or
     cardWords; "Cannot apply" switches Apply off */
  function body(plan, w, picks) {
    let h = '<div class="sync-body">' + plan.items.map((it, i) => item(it, w.block, i, picks)).join('');
    if (!plan.can_apply && !plan.items.some(i => i.state === 'blocked')) { h += '<div class="sync-text refusal">Cannot apply: ' + esc(plan.why) + '</div>'; }
    return h + '<div class="sync-btns"><button class="btn-sync-apply" data-change="' + plan.change_id + '"' + (plan.can_apply ? '' : ' disabled title="' + esc(plan.why) + '"') + '>' + esc(w.apply) + '</button> ' +
      '<button class="btn-sync-skip" data-change="' + plan.change_id + '">' + esc(w.skip) + '</button> <span class="refusal sync-refusal"></span><span class="sync-done"></span></div></div>';
  }
  /* the words of the two buttons and of the second ask: in the pop-up (one block per copy) and in the list on the copy */
  const popWords = x => ({ block: 'pk-' + x.copy_id, apply: 'Apply to ' + x.copy_name, skip: 'Skip for ' + x.copy_name, whom: x.copy_name });
  const cardWords = p => ({ block: 'pk-' + p.change_id, apply: 'Apply to this copy', skip: 'Skip', whom: 'this copy' });
  const head = (plan, mainId) => 'Main change ' + plan.change_id + ' · ' + esc(mainId ? mainId + ' ' : '') + esc(plan.rev || '') + ' · ' + when(plan.at) + ' · ' + esc(plan.who);

  /* syncPop(mainId, list): list = ENGINE_SYNC_MAIN.changeAfterSave(...), one block per copy */
  function syncPop(mainId, list) {
    const p = list[0].plan;
    let h = '<div class="pop-back" id="sync-back"><div class="pop pop-wide sync-pop" id="sync-pop" role="dialog" aria-modal="true" aria-labelledby="sync-title">' +
      '<div class="pop-title" id="sync-title">Apply this change to the ' + (list.length > 1 ? 'copies' : 'copy') + '?</div>' +
      '<div class="pop-what" id="sync-what">' + head(p, mainId) + '</div><div class="sync-reason">Reason: ' + esc(p.reason) + '</div>';
    for (const x of list) {
      h += '<div class="sync-copy" data-copy="' + esc(x.copy_id) + '"><div class="sync-copy-name">Copy "' + esc(x.copy_name) + '" (' + esc(x.copy_id) + ')</div>' +
        body(x.plan, popWords(x), null) + '</div>';
    }
    return h + '<div class="pop-btns"><button id="btn-sync-later">Later: keep it in the copy\'s list</button></div></div></div>';
  }
  /* changesCard(v): v = ENGINE_SYNC_MAIN.copyChanges(...) */
  function changesCard(v) {
    const n = v.changes.length;
    let h = '<div class="card sync-card" id="sync-card"><b>Changes in ' + esc(v.main_id) + ' since this copy was saved</b> <span class="muted" id="sync-count">' +
      (n ? n + ' to decide' : 'none to decide') + '</span>';
    if (!n) { return ''; }   /* build 71 (plan 4.6, rule 6): nothing when there is nothing */
    for (const p of v.changes) {
      h += '<div class="sync-change" data-change="' + p.change_id + '"><div class="sync-head">' + head(p, null) + '</div><div class="sync-reason">Reason: ' + esc(p.reason) + '</div>' +
        body(p, cardWords(p), null) + '</div>';
    }
    return h + '<div class="note">Apply makes the same change in this copy; Skip leaves the copy as it is. Each is written to the History of the copy. The main SOP does not change.</div></div>';
  }
  /* tag(n): the words on the copy's SOP line and SOP list row */
  /* build 71 (plan 4.6): the words of ENGINE_LINE.sopLine's changes, as a door */
  const tag = (n, sopId) => (n ? '<a href="#" class="sync-tag" data-sop="' + esc(sopId) + '" title="Open the list on the Header tab">' + n + (n === 1 ? ' change' : ' changes') + ' in the main SOP to decide ▸</a>' : '');

  return { syncPop, changesCard, body, confirmStrip, popWords, cardWords, tag, when };
})();
