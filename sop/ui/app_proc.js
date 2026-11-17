/* SOP Builder wiring for process SOPs (spec/example_process_sop.md part 5,
   build 30): the insert form opened from a step (right-click or the
   button above its card), the search list under an input (the insert form
   and Needs SOPs in the section form), and the Edit of a Standard step
   with Make it a Revised copy (Flow and Sections tabs). Each action hands
   the engine its input through the Reason pop-up, shows refusals, writes
   the tables the engine returns and redraws. No logic beyond that.
   Classic script (global APP_PROC); loaded after ui/app_steps.js. */
const APP_PROC = (function () {
  const state = APP.state;
  const $ = APP.el, guard = APP.guard;
  const sopId = () => state.view.sop.sop_id;
  const log = (dir, what) => console.log('[' + dir + '] ' + what);

  /* wireFind(input, list, opts, onPick) → { picked() }: the rows that match what is typed; opts = { process_only, show_empty, leave_out() };
     a click picks a row and calls onPick(sop_id); typing again drops the pick */
  function wireFind(input, list, opts, onPick) {
    let picked = null;
    function draw() {
      const text = input.value;
      if (!opts.show_empty && !text.trim()) { list.innerHTML = ''; return; }
      const r = ENGINE_CHART.findSops({ tables: state.tables, text: text, process_only: !!opts.process_only, leave_out: opts.leave_out ? opts.leave_out() : [] });
      list.innerHTML = RENDER_PROC.findList(r, picked, text, !!opts.process_only);
      for (const b of list.querySelectorAll('.find-row')) {
        b.onclick = () => guard('ui findPick', function () { picked = b.dataset.id; log('ui', 'picked ' + picked); onPick(picked); draw(); });
      }
    }
    input.oninput = () => guard('ui findSops', function () { picked = null; draw(); });
    draw();
    return { picked: () => picked };
  }

  /* openInsert(afterKey): the insert form under the card of the step (Flow tab) */
  function openInsert(afterKey) {
    const u = APP_FLOW.ui();
    const steps = u.stepsView.steps;
    const i = steps.findIndex(s => s.key === afterKey);
    if (i < 0) { throw new Error('ui insertProcess: no step ' + afterKey + ' in section ' + u.section); }
    if ($('edit-form') || $('insert-proc-form')) { throw new Error('ui insertProcess: finish or cancel the open form first'); }
    let end = i;
    while (end + 1 < steps.length && RENDER_PROC.isSub(steps[end + 1].step_no)) { end++; }
    const step = steps[i];
    $('step-area').insertAdjacentHTML('beforeend', RENDER_PROC.insertForm(step, end > i ? steps[end].step_no : null));
    const form = $('insert-proc-form');
    const find = wireFind($('ip-find'), $('ip-list'), { process_only: true, show_empty: true }, id => { $('ip-find').value = id; });
    $('btn-ip-cancel').onclick = () => form.remove();
    $('btn-ip-insert').onclick = () => guard('ui insertProcess', function () {
      const r0 = form.querySelector('input[name="ip-mode"]:checked');
      const typed = $('ip-find').value.trim().toUpperCase();
      /* a code typed in full counts as picked */
      const pid = find.picked() || (state.tables.sops.some(s => s.sop_id === typed) ? typed : null);
      return APP_FLOW.change('Insert ' + (pid || 'a process SOP') + ' after ' + step.step_no,
        ctx => ENGINE_CHART.insertProcess({ tables: state.tables, sop_id: sopId(), after_key: afterKey, process_sop_id: pid, mode: r0 ? r0.value : null, ctx: ctx }),
        function (r, ctx) {
          log('engine → ui', 'insertProcess ' + pid + ': ' + r.new_keys.length + ' steps, ' + r.first_no + ' to ' + r.last_no);
          u.step = r.new_keys[0].key;
          return APP_FLOW.afterRenumber(r, ctx, 'insertProcess');
        }, refs => RENDER_EDIT.showRefusals(form, refs));
    });
    $('ip-find').focus();
    form.scrollIntoView({ block: 'nearest' });
  }

  /* openLocked(step, card, done): the Edit of a step that follows a process SOP as Standard: the note and Make it a Revised copy
     above the card; done(r, ctx) writes and redraws. Returns false (nothing shown) for any other step. */
  function openLocked(step, card, done) {
    if (!step || step.link_mode !== 'Standard') { return false; }
    const use = ENGINE_CHART.useOf({ tables: state.tables, sop_id: sopId(), key: step.key });
    card.insertAdjacentHTML('beforebegin', RENDER_PROC.lockedEdit(step, use));
    const box = $('edit-' + step.key);
    $('btn-cancel').onclick = () => box.remove();
    $('btn-revise').onclick = () => guard('ui reviseLinked', function () {
      const span = use && use.first_no !== use.last_no ? use.first_no + ' to ' + use.last_no : step.step_no;
      return APP_FLOW.change('Make ' + span + ' a Revised copy of ' + step.link_sop, ctx => ENGINE_CHART.reviseLinked({ tables: state.tables, sop_id: sopId(), key: step.key, ctx: ctx }),
        function (r, ctx) { log('engine → ui', 'reviseLinked: ' + r.keys.join(', ')); return done(r, ctx); }, refs => RENDER_EDIT.showRefusals($('edit-form'), refs));
    });
    box.scrollIntoView({ block: 'nearest' });
    return true;
  }

  /* wireNeedsFind(): the search list under Needs SOPs in the section form; a click adds the SOP ID to the list */
  function wireNeedsFind() {
    const input = $('sf-find'), list = $('sf-find-list'), needs = document.querySelector('#sec-form [name="needs_sops"]');
    if (!input || !list || !needs) { return; }
    const ids = () => needs.value.split(',').map(x => x.trim()).filter(x => x);
    wireFind(input, list, { process_only: false, show_empty: false, leave_out: () => [sopId()].concat(ids()) }, function (id) {
      needs.value = ids().concat([id]).join(', ');
      input.value = '';
      input.focus();
    });
  }

  return { openInsert, openLocked, wireNeedsFind, wireFind };
})();
