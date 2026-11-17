/* SOP Builder screen builders for process SOPs (spec/example_process_sop.md
   part 5, build 30): the insert form (Process SOP with its search list,
   Use as Standard or Revised), the search list rows (also under Needs SOPs
   in the section form), the Edit card of a Standard step with Make it a
   Revised copy, and the Process SOP row of a step card. HTML from data
   only. Classic script (global RENDER_PROC). */
const RENDER_PROC = (function () {
  const esc = RENDER.esc;
  const isSub = no => String(no).split('.').length > 2;

  /* insertForm(step, blockEnd): blockEnd = the last sub-step of the step's block when it has sub-steps, else null */
  function insertForm(step, blockEnd) {
    const where = 'after ' + esc(step.step_no) + (blockEnd ? ' and its sub-steps (after ' + esc(blockEnd) + ')' : '') + '; the steps after it get higher numbers.';
    return '<div class="card edit-card" id="insert-proc-form"><h3>Insert a process SOP after ' + esc(step.step_no) + ' <span class="muted">' + esc(step.sop_id) + ' ' + esc(step.rev) + '</span></h3>' +
      '<form onsubmit="return false">' +
      '<div class="f"><label for="ip-find">Process SOP</label><div class="v"><input id="ip-find" size="40" autocomplete="off" spellcheck="false"><div class="find-list" id="ip-list"></div>' +
      '<div class="note">Type part of the code or the name; small letters are fine. Click the one you want. Example: br.</div><div class="refusal" data-for="process"></div></div></div>' +
      '<div class="f"><label>Use as</label><div class="v">' +
      '<label class="radio"><input type="radio" name="ip-mode" value="Standard" checked> Standard: stays the same as the process SOP</label><br>' +
      '<label class="radio"><input type="radio" name="ip-mode" value="Revised"> Revised: your own copy; it does not change with it</label>' +
      '<div class="note">Standard steps cannot be edited here: edit the process SOP. Revised steps edit as usual. Example: Standard.</div><div class="refusal" data-for="mode"></div></div></div>' +
      '<div class="f"><label>Where</label><div class="v fixed">' + where + ' Only the released revision of a process SOP goes in.</div></div>' +
      '<div class="f"><label></label><div class="v"><button id="btn-ip-insert" type="button">Insert</button> <button id="btn-ip-cancel" type="button">Cancel</button>' +
      '<div class="note">Insert checks the form, then asks the reason for the change.</div><div class="refusal" data-for="form"></div></div></div></form></div>';
  }

  /* findList(r, picked, text, processOnly): r = ENGINE_CHART.findSops(...) */
  function findList(r, picked, text, processOnly) {
    const q = String(text || '').trim();
    if (!r.rows.length) {
      return '<div class="find-none muted">' + (processOnly
        ? (q ? 'No Process SOP has "' + esc(q) + '" in its code or name.' : 'No Process SOP yet. Make one on the SOP list: New SOP, Type Process SOP.')
        : 'No SOP has "' + esc(q) + '" in its ID or title.') + '</div>';
    }
    return r.rows.map(x => '<button type="button" class="find-row' + (x.sop_id === picked ? ' picked' : '') + '" data-id="' + esc(x.sop_id) + '" title="' + esc(x.line) + '">' +
      (x.sop_id === picked ? '✓ ' : '') + esc(x.line) + '</button>').join('') +
      (r.more ? '<div class="find-more muted">and ' + esc(r.more) + ' more: type more letters</div>' : '');
  }

  /* lockedEdit(step, use): the Edit of a step that follows a process SOP as Standard */
  function lockedEdit(step, use) {
    const s = esc(step.link_sop);
    const span = use && use.first_no !== use.last_no ? 'steps ' + esc(use.first_no) + ' to ' + esc(use.last_no) : 'step ' + esc(step.step_no);
    return '<div class="card edit-card locked-edit" id="edit-' + esc(step.key) + '"><h3>Edit step ' + esc(step.step_no) + ' <span class="muted">' + esc(step.sop_id) + ' ' + esc(step.rev) +
      ' · Key ' + esc(step.key) + '</span></h3>' +
      '<p>This step follows ' + s + ' (Standard: ' + s + ' ' + esc(step.link_rev) + ', ' + span + ' here). Edit ' + s + ', or make this use a Revised copy.</p>' +
      '<p class="note">A Revised copy is your own: its steps edit here as usual, and it no longer changes when ' + s + ' changes. Make it a Revised copy changes ' + span + '.</p>' +
      '<form id="edit-form" onsubmit="return false"><div class="f"><label></label><div class="v"><button id="btn-revise" type="button">Make it a Revised copy</button> ' +
      '<button id="btn-cancel" type="button">Cancel</button><div class="refusal" data-for="form"></div></div></div></form></div>';
  }

  /* cardRow(st) → the words of the Process SOP row of a step card, or null for a step not from a process SOP */
  function cardRow(st) {
    if (!st.link_text) { return null; }
    if (st.link_mode === 'Standard') { return st.link_text + ' · its step ' + st.link_key + ' · changes only with ' + st.link_sop + ': edit ' + st.link_sop + ', or Edit here to make a Revised copy'; }
    return st.link_text + (st.link_key ? ' · its step ' + st.link_key : ' · added in this copy') + ' · your own copy: it edits here as usual';
  }

  /* syncReport(what, lines): after the release of a Process SOP, where its new revision went (build 31) */
  function syncReport(what, lines) {
    if (!lines.length) { return '<div class="given-note sync-report" id="sync-report">' + esc(what) + ' is released. No main SOP uses it as Standard or Revised yet.</div>'; }
    return '<div class="given-note sync-report" id="sync-report"><b>' + esc(what) + ' went into the main SOPs that use it.</b> Each change has a note on its step: read it, then click Done.' +
      '<ul>' + lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul></div>';
  }

  return { insertForm, findList, lockedEdit, cardRow, syncReport, isSub };
})();
