/* SOP Builder screen builders for the SOP page tabs: Values Needed,
   Safety and PPE, Materials and tools, Glossary, Gauges, Pictures,
   Worked examples and reference tables, Release check, Routing,
   Revisions, History. HTML from data only. Classic script (global
   RENDER_TABS). */
const RENDER_TABS = (function () {
  const R = RENDER;
  const esc = R.esc, show = R.show, lines = R.lines, grid = R.grid, yn = R.yn;

  function vnTab(view, filter) {
    const f = filter || {};
    let h = '<h2>Values Needed <span class="muted">' + esc(view.vn.open) + ' open, ' + esc(view.vn.given) + ' given</span></h2>';
    /* build 39: a copy shows the Values Needed of its good version for reading; they are given there */
    if (view.copy) { h += '<p class="copy-line">Values Needed belong to the good version (' + esc(view.copy.of) + '): give them there. They show here for reading.</p>'; }
    h += '<p><label>Show <select id="vn-state"><option value="all"' + (f.state === 'all' ? ' selected' : '') + '>all</option>' +
      '<option value="open"' + (f.state !== 'all' && f.state !== 'given' ? ' selected' : '') + '>open</option>' +
      '<option value="given"' + (f.state === 'given' ? ' selected' : '') + '>given</option></select></label> ' +
      '<label>Section <input id="vn-section" size="3" value="' + esc(f.section || '') + '"></label> <span class="muted">(empty = every section)</span></p>';
    const rows = view.vn.rows.filter(function (v) {
      if (f.state === 'given' && v.state !== 'given') { return false; }
      if ((!f.state || f.state === 'open') && v.state !== 'open') { return false; }
      if (f.section && v.links.sections.indexOf(Number(f.section)) < 0) { return false; }
      return true;
    });
    h += grid([['No.', 'no'], ['Step', 'step_text'], ['Links to', 'links'], ['Value needed', 'value_needed'], ['Unit', 'unit'], ['Owner', 'owner'],
      ['Blocks', 'blocks_release'], ['State', 'state'], ['Value', 'value'], ['Date given', 'date_given'], ['Sign', 'sign'], ['', 'give']], rows, function (v, fld) {
      if (fld === 'links') { return vnLinksText(v.links); }
      if (fld === 'blocks_release') { return yn(v.blocks_release); }
      if (fld === 'give') {
        if (view.copy) { return '<span class="muted">in ' + esc(view.copy.of) + '</span>'; }
        return '<button class="btn-give" data-vn="' + esc(v.vn_id) + '">' + (v.state === 'open' ? 'Give the value' : 'Change') + '</button><div class="give-slot" id="give-' + esc(v.vn_id) + '"></div>';
      }
      return lines(v[fld]);
    });
    return h;
  }
  function vnLinksText(links) {
    return links.scope === 'Step' ? 'steps ' + esc(links.keys.join(', ')) : (links.scope === 'Section' ? 'sections ' + esc(links.sections.join(', ')) : 'the SOP');
  }
  /* giveForm(vn, today, editor): Value, Date given, Sign, Reason, Save */
  function giveForm(vn, today, editor) {
    return '<div class="give-form"><b>No. ' + esc(vn.no) + '</b> ' + esc(vn.value_needed) + (vn.unit ? ' (' + esc(vn.unit) + ')' : '') +
      '<div class="f"><label for="g-value">Value</label><div class="v"><input id="g-value" size="50" value="' + esc(vn.value || '') + '">' +
      '<div class="note">The value as it will be written into the step. Example: 1282 from the inside floor.</div><div class="refusal" data-for="value"></div></div></div>' +
      '<div class="f"><label for="g-date">Date given</label><div class="v"><input id="g-date" size="12" value="' + esc(vn.date_given || today) + '">' +
      '<div class="note">YYYY-MM-DD. Example: ' + esc(today) + '.</div><div class="refusal" data-for="date_given"></div></div></div>' +
      '<div class="f"><label for="g-sign">Sign</label><div class="v"><input id="g-sign" size="20" value="' + esc(vn.sign || editor) + '">' +
      '<div class="note">Who gave the value. Example: Divyal.</div><div class="refusal" data-for="sign"></div></div></div>' +
      '<div class="f"><label></label><div class="v"><button id="btn-give-save">Save</button> <button id="btn-give-cancel">Cancel</button><div class="refusal" data-for="form"></div></div></div></div>';
  }
  /* givenNote(links, steps): after a value is given, where to change the step by hand */
  function givenNote(vnId, links, stepsByKey) {
    if (links.scope === 'Step') {
      return '<div class="given-note">Value of ' + esc(vnId) + ' saved. Now change the step by hand: ' +
        links.keys.map(k => '<a href="#" class="goto-step" data-key="' + esc(k) + '" data-section="' + esc(stepsByKey[k] ? stepsByKey[k].section : '') + '">' + esc(stepsByKey[k] ? stepsByKey[k].step_no : k) + ' (' + esc(k) + ')</a>').join(', ') + '.</div>';
    }
    return '<div class="given-note">Value of ' + esc(vnId) + ' saved. It links to ' + vnLinksText(links) + ': change the SOP by hand where it applies.</div>';
  }

  /* the lists can change in the Builder unless the revision is Released or Superseded (build 32, example_new_sop.md part 10); build 50:
     or the name at the top does not change this SOP (view.lock_text: the good version, someone else's copy; example_rights.md part 5) */
  const open = view => !!view.rev && !view.lock_text;
  const lockLine = view => (view.rev && !open(view) ? '<p class="ok">' + esc(view.lock_text) + '</p>' : '');
  function safetyTab(view) {
    return '<h2>1 Safety and PPE <span class="muted">(read only on the floor)</span></h2>' + lockLine(view) +
      RENDER_LISTS.listGrid('safety_items', [['No.', 'no'], ['Status', 'status'], ['Item', 'item'], ['Who', 'who'], ['Used at', 'used_at'], ['Tag', 'tag']], view.safety_items, open(view));
  }
  function materialsTab(view) {
    return '<h2>2 Materials, tools and machines <span class="muted">(read only on the floor)</span></h2>' + lockLine(view) + '<h3>Materials (M-1)</h3>' +
      RENDER_LISTS.listGrid('materials', [['Sr', 'sr'], ['Status', 'status'], ['Material', 'material'], ['Qty', 'qty'], ['Note', 'note'], ['Used at', 'used_at']], view.materials, open(view)) +
      '<h3>Tools and machines (T-1)</h3>' + RENDER_LISTS.listGrid('tools', [['No.', 'no'], ['Type', 'type'], ['Name', 'name'], ['Used at', 'used_at']], view.tools, open(view));
  }
  function glossaryTab(view, filter) {
    const q = (filter || '').toLowerCase();
    const rows = view.glossary.filter(g => !q || [g.term, g.meaning, g.gujarati, g.used_in].some(x => x && String(x).toLowerCase().indexOf(q) >= 0));
    /* shared by every SOP; the Builder's Glossary is the master (build 33): Add a row, Edit and Remove any time */
    return '<h2>Glossary <span class="muted">' + esc(view.glossary.length) + ' terms, shared by every SOP</span></h2>' +
      '<p><label>Find <input id="gl-find" value="' + esc(filter || '') + '"></label></p>' +
      RENDER_LISTS.listGrid('glossary', [['No.', 'no'], ['Term', 'term'], ['Meaning', 'meaning'], ['BOM name', 'bom_name'], ['Store label', 'store_label'], ['Gujarati', 'gujarati'], ['Hindi', 'hindi'], ['Used in', 'used_in']], rows, !!view.rev);
  }
  function gaugesTab(view) {
    return '<h2>Gauges <span class="muted">shared by every SOP; a change here shows in all of them</span></h2>' +
      RENDER_LISTS.listGrid('gauges', [['Gauge ID', 'gauge_id'], ['Name', 'name'], ['Measures', 'measures'], ['Range', 'range'], ['Calibration', 'calibration'], ['Cal due', 'cal_due']], view.gauges, !!view.rev);
  }
  /* picturesTab(view, urls): urls = { file: object URL } from the store, or {} when not in a folder */
  function picturesTab(view, urls) {
    let h = '<h2>Pictures <span class="muted">drawn from CAD; photos are files under source\\Photos named by key</span></h2>';
    if (!view.pictures.length) { return h + '<p class="empty">(no pictures)</p>'; }
    for (const p of view.pictures) {
      const u = urls && urls[p.file];
      h += '<div class="card"><b>' + esc(p.picture_id) + '</b> ' + esc(p.caption) + ' <span class="muted">' + esc(p.file) + (p.used_at ? ' · used at ' + esc(p.used_at) : '') + '</span>' +
        (u ? '<br><img class="picture" src="' + esc(u) + '" alt="' + esc(p.picture_id) + '">' : '<br><span class="empty">(image shown when the SOP App folder is open)</span>') + '</div>';
    }
    return h;
  }
  function examplesTab(view) {
    let h = '<h2>Worked examples</h2>' + lockLine(view) + RENDER_LISTS.listGrid('worked_examples', [['No.', 'we_id'], ['Step', 'step_text'], ['What to measure', 'what'], ['How', 'how'], ['Decide', 'decide'], ['Example', 'example']], view.worked_examples, open(view));
    h += '<h2>Reference tables</h2>';
    if (!view.ref_tables.length) { h += '<p class="empty">(none)</p>'; }
    for (const t of view.ref_tables) {
      h += '<h3>' + esc(t.table_id) + ' ' + esc(t.title) + '</h3><table class="grid"><tr>';
      for (const c of t.columns) { h += '<th>' + esc(c) + '</th>'; }
      h += '</tr>';
      for (const row of t.rows) { h += '<tr>' + row.map(c => '<td>' + lines(c) + '</td>').join('') + '</tr>'; }
      h += '</table>';
    }
    return h;
  }
  /* names(id, list, now): the sign list (build 36: names from the skill only); now = the name signed, picked when its first word matches */
  function names(id, list, now) {
    const w = String(now || '').trim().split(/\s+/)[0].toLowerCase();
    return '<select id="' + esc(id) + '"><option value="">choose</option>' + list.map(n => '<option' + (w && n.toLowerCase() === w ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>';
  }
  /* releaseTab(view, kept): kept = { [item no]: { on, reason } }, the Accept ticks and reasons typed so far on this page; they stay when
     the tab is drawn again (a sign, a walk-through, another tab and back; example_release.md part 8.3) */
  function releaseTab(view, kept) {
    if (!view.release) { return '<h2>Release check</h2><p class="empty">(no revision)</p>'; }
    if (view.release.copy) { return copyReleaseTab(view); }
    const ch = view.release.check, keep = kept || {};
    const rv = view.rev;
    const locked = rv.status === 'Released' || rv.status === 'Superseded';
    let h = '<h2>Release check <span class="muted">' + esc(view.sop.sop_id) + ' ' + esc(view.sop.current_rev) + '</span></h2>' +
      '<p class="' + (ch.released || locked ? 'ok' : 'notok') + '" id="release-result"><b>Result: ' + esc(view.release.result) + '</b> · ' + esc(view.release.label) + '</p>';
    const cols = [['No.', 'no'], ['Check', 'name'], ['Result', 'pass'], ['Detail', 'detail']];
    /* build 59: online, only a login that releases accepts items for a floor trial */
    const canAccept = !locked && !(view.sign_state && !view.sign_state.release.can);
    if (canAccept) { cols.push(['Accept for a floor trial', 'accept']); }
    h += grid(cols, ch.items, function (it, f) {
      if (f === 'pass') { return it.pass ? '<span class="ok">PASS</span>' : (canAccept ? '<span class="notok fail-click" data-no="' + esc(it.no) + '" title="Click to accept this item for a floor trial">FAIL</span>' : '<span class="notok">FAIL</span>'); }
      if (f === 'detail') { return esc(it.detail) + (it.details.length ? '<br><span class="muted">' + esc(it.details.join(' · ')) + '</span>' : ''); }
      if (f === 'accept') {
        if (it.pass) { return '<span class="muted">—</span>'; }
        const k = keep[it.no] || {};
        return '<label class="radio"><input type="checkbox" class="acc-tick" id="acc-tick-' + esc(it.no) + '" data-no="' + esc(it.no) + '"' + (k.on ? ' checked' : '') + '> Accept</label>' +
          '<div>Reason: <input class="acc-reason" id="acc-reason-' + esc(it.no) + '" data-no="' + esc(it.no) + '" size="28" value="' + esc(k.reason || '') + '"></div>';
      }
      return esc(it[f]);
    });
    if (canAccept && ch.fail_count) {
      h += '<div class="note">Clicking the word FAIL ticks the row\'s Accept box. Accepted items need a reason each. Ticks and reasons stay while this page is open. Example: Divyal gives the datum next week; trial with the Rev 02 value.</div>';
    }
    const today = view.today || '';
    const sg = view.sign_state || null;   /* build 59: online, the login signs as itself (ENGINE_RELEASE.signState); null on the PC */
    /* signed(by, date): the sign in place, online */
    const signed = (by, date) => (date ? '<span class="muted sg-now">Now: ' + esc(by) + ', ' + esc(date) + '.</span> ' : '');
    if (!locked) {
      h += '<div class="card sign-box"><h3>Sign-offs <span class="muted">a sign is a name and a date</span></h3>' +
        '<div class="f"><label>Prepared by</label><div class="v fixed">' + show(rv.prepared_by) + '</div></div>';
      if (sg) {
        h += '<div class="f"><label>Checked by</label><div class="v">' + signed(rv.checked_by, rv.checked_date) +
          (sg.checked.can ? '<span class="sg-who" id="sg-check-who">' + esc(sg.checked.name) + '</span> <input id="sg-check-date" size="12" value="' + esc(today) + '"> <button id="btn-sign-checked">Sign as checked</button>' +
            '<div class="note">You sign with your login name. Date YYYY-MM-DD. Example: ' + esc(today) + '.</div>' : '<span class="muted" id="sg-check-line">' + esc(sg.checked.line) + '</span>') +
          '<div class="refusal" data-for="checked"></div></div></div>' +
          '<div class="f"><label>Approved by</label><div class="v">' + signed(rv.approved_by, rv.approved_date) +
          (sg.approved.can ? '<span class="sg-who" id="sg-appr-who">' + esc(sg.approved.name) + '</span> <input id="sg-appr-date" size="12" value="' + esc(today) + '"> <button id="btn-sign-approved">Sign as approved</button>' +
            '<div class="note">After the check. A new check clears the approval. Example: ' + esc(today) + '.</div>' : '<span class="muted" id="sg-appr-line">' + esc(sg.approved.line) + '</span>') +
          '<div class="refusal" data-for="approved"></div></div></div></div>';
      } else {
        h += '<div class="f"><label for="sg-check-name">Checked by</label><div class="v">' + names('sg-check-name', view.release.signers.checked, rv.checked_date ? rv.checked_by : '') + ' ' +
          '<input id="sg-check-date" size="12" value="' + esc(rv.checked_date || today) + '"> <button id="btn-sign-checked">Sign as checked</button>' +
          '<div class="note">' + esc(view.release.signers.checked.join(' or ')) + ', never the preparer' + (rv.prepared_by ? ' (' + esc(rv.prepared_by) + ')' : '') + '. Date YYYY-MM-DD. Example: ' +
          esc(view.release.signers.checked[0] || 'Raj') + ', ' + esc(today) + '.</div><div class="refusal" data-for="checked"></div></div></div>' +
          '<div class="f"><label for="sg-appr-name">Approved by</label><div class="v">' + names('sg-appr-name', view.release.signers.approved, rv.approved_date ? rv.approved_by : '') + ' ' +
          '<input id="sg-appr-date" size="12" value="' + esc(rv.approved_date || today) + '"> <button id="btn-sign-approved">Sign as approved</button>' +
          '<div class="note">' + esc(view.release.signers.approved.join(' or ')) + ', after the check. A new check clears the approval. Example: ' + esc(view.release.signers.approved[0] || 'Samrat') + ', ' + esc(today) + '.</div><div class="refusal" data-for="approved"></div></div></div></div>';
      }
      h += '<div class="card walk-box"><h3>Floor trial <span class="muted">a newcomer runs the SOP twice in a row with zero questions</span></h3>' +
        grid([['No.', 'val_id'], ['Date', 'date'], ['Walked by', 'walked_by'], ['Watched by', 'watched_by'], ['Questions', 'questions_asked'], ['Defects found', 'defects_found']], view.validation_log || []) +
        '<div class="f"><label>Add a walk-through</label><div class="v">Date <input id="wk-date" size="12" value="' + esc(today) + '"> Walked by <input id="wk-walked" size="14"> Watched by <input id="wk-watched" size="14" value="' + esc(view.editor || '') + '"> ' +
        'Questions asked <input id="wk-q" size="3" value="0"> Defects found <input id="wk-defects" size="24"> <button id="btn-walk">Add</button>' +
        '<div class="note">One row per walk-through. Example: 2026-11-20, Ramesh, Divyal, 0 questions.</div><div class="refusal" data-for="walk"></div></div></div></div>';
      h += '<div class="card release-box">' + (sg && !sg.release.can ? '<span class="muted" id="release-line">' + esc(sg.release.line) + '</span>' :
        '<button id="btn-release">Release ' + esc(rv.rev) + ' to the floor</button> <span class="muted">every item must pass or be accepted with a reason; the earlier Released revision becomes Superseded</span>') +
        '<div class="refusal" data-for="release"></div></div>';
    } else {
      h += '<p class="ok">' + esc(rv.rev) + ' is ' + esc(rv.status) + '. ' + show(rv.release_note) + '</p>';
    }
    if (view.record_sheet) {
      h += '<h3>Record sheet rows (from the Reading and Hold steps)</h3>' +
        grid([['Sec', 'section'], ['Steps', 'step_nos'], ['Signed by', 'signed_by'], ['Readings and signs', 'items']], view.record_sheet.rows, function (r, f) {
          if (f === 'step_nos') { return esc(r.step_nos.join(', ')); }
          if (f === 'items') { return r.items.map(i => esc(i.label)).join('<br>'); }
          return esc(r[f]);
        }) + '<p>' + esc(view.record_sheet.handover) + '</p>';
    }
    return h;
  }
  /* textsTab(list, lockText): the Texts to check tab (example_renumber.md part 7, build 40): each text in a box of its own, with what
     it names, Save and Keep as it is; list = ENGINE_CHART.textsToCheck(...); lockText = the lock line of a Released revision, else null */
  function namesLine(m, x) {
    const of = x.of || m.link_sop || null;
    if (of) { return esc(x.old) + ' of ' + esc(of) + (x.new === null ? ': not in this copy' : ': here ' + esc(x.new)); }
    if (x.new !== null) { return esc(x.old) + ': now ' + esc(x.new); }
    if (x.into) { return esc(x.old) + ': deleted (clubbed into ' + esc(x.into) + ', now ' + esc(x.into_now) + ')'; }
    return esc(x.old) + ': deleted' + (x.reason ? ' (' + esc(x.reason) + ')' : '');
  }
  function textsTab(list, lockText) {
    let h = '<h2>Texts to check <span class="muted">' + (list.length ? esc(list.length) + (list.length === 1 ? ' text names' : ' texts name') + ' a step number that changed since it was written' : '') + '</span></h2>';
    if (!list.length) { return h + '<p class="ok" id="tc-none">No text names a step number that changed.</p>'; }
    if (lockText) { h += '<p class="muted">' + esc(lockText) + '</p>'; }
    else {
      /* build 41 (example_renumber.md part 10): the options, and Apply all suggestions */
      const n = list.filter(m => m.suggested).length;
      h += (n ? '<p><button id="btn-tc-all">Apply all suggestions (' + esc(n) + ')</button> <span class="muted">every option of every text, in one save; you see the list first</span></p>' : '') +
        '<p class="note">Click an option to put the new number in the box, then Save. Example: Use 3.3 for 3.6. Or change the text yourself. Keep as it is: the text is right (for example it names a value, not a step).</p>';
    }
    list.forEach(function (m, i) {
      h += '<div class="card tc-card" id="tc-' + i + '" data-i="' + i + '"><div class="tc-where"><b>' + esc(RENDER_FLOW.whereOf(m)) + '</b></div>' +
        '<ul class="tc-names">' + m.mentions.map(x => '<li>' + namesLine(m, x) + '</li>').join('') + '</ul>';
      if (lockText) { h += '<div class="tc-ro">' + lines(m.full === undefined ? m.text : m.full) + '</div></div>'; return; }
      if (m.options && m.options.length) {
        h += '<p class="tc-opts">' + m.options.map((o, j) => '<button class="tc-opt" data-i="' + i + '" data-o="' + j + '">' + esc(o.label) + '</button>').join(' ') + '</p>';
      }
      h += '<textarea class="tc-text" id="tc-text-' + i + '" rows="' + Math.min(8, Math.max(2, Math.ceil(String(m.full || '').length / 90))) + '">' + esc(m.full === undefined ? m.text : m.full) + '</textarea>' +
        '<div class="refusal" data-for="text"></div><div class="refusal" data-for="form"></div>' +
        '<p class="tc-btns"><button class="tc-save" data-i="' + i + '">Save</button> <button class="tc-keep" data-i="' + i + '">Keep as it is</button></p></div>';
    });
    return h;
  }
  /* copyReleaseTab(view): the 8 items of a copy for reading only; no sign-offs, no floor trial, no release (example_copy.md part 6) */
  function copyReleaseTab(view) {
    const ch = view.release.check;
    let h = '<h2>Release check <span class="muted">' + esc(view.sop.sop_id) + ' ' + esc(view.sop.current_rev) + ' · for reading</span></h2>' +
      '<p class="copy-line" id="release-result"><b>' + esc(view.release.result) + '</b></p>';
    h += grid([['No.', 'no'], ['Check', 'name'], ['Result', 'pass'], ['Detail', 'detail']], ch.items, function (it, f) {
      if (f === 'pass') { return it.pass ? '<span class="ok">PASS</span>' : '<span class="notok">FAIL</span>'; }
      if (f === 'detail') { return esc(it.detail) + (it.details.length ? '<br><span class="muted">' + esc(it.details.join(' · ')) + '</span>' : ''); }
      return esc(it[f]);
    });
    if (view.record_sheet) {
      h += '<h3>Record sheet rows (from the Reading and Hold steps)</h3>' +
        grid([['Sec', 'section'], ['Steps', 'step_nos'], ['Signed by', 'signed_by'], ['Readings and signs', 'items']], view.record_sheet.rows, function (r, f) {
          if (f === 'step_nos') { return esc(r.step_nos.join(', ')); }
          if (f === 'items') { return r.items.map(i => esc(i.label)).join('<br>'); }
          return esc(r[f]);
        });
    }
    return h;
  }
  /* compareTab(cmp): cmp = ENGINE.compare(...), or ENGINE.compareCopy(...) for a copy (copy_name set); build 50 (example_rights.md part
     6.6): a copy is compared with the good version or with any other copy of the same SOP (cmp.choices) */
  function compareTab(cmp) {
    if (cmp.copy_name) {
      const choices = cmp.choices || [];
      const pick = choices.length > 1 ? '<select id="cmp-against">' + choices.map(o => '<option value="' + esc(o.id) + '"' + ((o.id || null) === (cmp.against_id || null) ? ' selected' : '') + '>' +
        esc(o.label) + '</option>').join('') + '</select>' : esc(cmp.against_id ? cmp.against : 'the good version ' + cmp.against);
      return '<h2>Compare <span class="muted">copy ' + esc(cmp.copy_name) + ' (' + esc(cmp.rev) + ') against ' + (cmp.against_id ? esc(cmp.against) : 'the good version ' + esc(cmp.against)) + ', by Key</span></h2>' +
        '<p><label>Against ' + pick + '</label> <span class="muted">' + esc(cmp.counts.kept) + ' kept, ' + esc(cmp.counts.changed) + ' changed, ' + esc(cmp.counts.new) + ' new, ' + esc(cmp.counts.retired) + ' retired</span></p>' +
        compareGrid(cmp);
    }
    let h = '<h2>Compare <span class="muted">' + esc(cmp.rev) + ' (current) against an earlier revision, by Key</span></h2>';
    if (!cmp.others.length) {
      h += '<p>No earlier revision of this SOP is in the data. Keys retired before ' + esc(cmp.rev) + ' (from the key map and the revision history):</p>' +
        grid([['Key', 'key'], ['To', 'range_to'], ['Retired in', 'retired_in'], ['Reason', 'reason'], ['Source', 'source']], cmp.retired_before);
      return h;
    }
    h += '<p><label>Against <select id="cmp-against">' + cmp.others.map(o => '<option' + (o === cmp.against ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></label> ' +
      '<span class="muted">' + esc(cmp.counts.kept) + ' kept, ' + esc(cmp.counts.changed) + ' changed, ' + esc(cmp.counts.new) + ' new, ' + esc(cmp.counts.retired) + ' retired</span></p>';
    return h + compareGrid(cmp);
  }
  function compareGrid(cmp) {
    return grid([['Key', 'key'], ['Old step', 'old_step_no'], ['New step', 'new_step_no'], ['Change', 'change'], ['Fields', 'fields'], ['Old action / note', 'note']], cmp.rows, function (r, f) {
      if (f === 'fields') { return esc(r.fields.join(', ')); }
      if (f === 'note') { return (r.change === 'Retired' ? esc(r.old_action) + (r.note ? ': ' + esc(r.note) : '') : esc(r.note || '')); }
      if (f === 'change') { return '<span class="chg-' + esc(r.change.split(' ')[0].toLowerCase()) + '">' + esc(r.change) + '</span>'; }
      return show(r[f]);
    });
  }
  /* floorTab(view): while a draft sits over a released revision, the copy of the revision on the floor comes first (example_release.md part 8.1) */
  function floorTab(view) {
    if (!view.rev) { return '<h2>Floor PDF</h2><p class="empty">(no revision)</p>'; }
    const fr = view.floor_rev, cur = esc(view.sop.current_rev);
    if (view.copy) {
      return '<h2>Floor PDF <span class="muted">' + esc(view.sop.sop_id) + ' ' + cur + '</span></h2>' +
        '<p class="copy-line">A copy never goes to the floor. Its floor copy prints for review, with the band "for review only, never for the floor" on top.</p>' +
        '<p><button id="btn-floor">Open the copy for review</button> <span class="muted">opens in a new tab; there, Print / Save as PDF.</span></p><div class="refusal" data-for="floor"></div>';
    }
    return '<h2>Floor PDF <span class="muted">' + esc(view.sop.sop_id) + ' ' + cur + '</span></h2>' +
      '<p>The floor copy is made from the data each time: page 1 header and revision history, 1 Safety and PPE, 2 Materials, tools and machines, then every process section with the English line and the Gujarati line under it, warnings in boxes, HOLD marks and tick boxes; the record sheet last.</p>' +
      (fr ? '<p><button id="btn-floor-on" data-rev="' + esc(fr.rev) + '">Open the floor copy of ' + esc(fr.rev) + ' (on the floor)</button> <span class="muted">' + esc(fr.label) + '</span></p>' : '') +
      '<p><button id="btn-floor">' + (fr ? 'Open the draft ' + cur + ' (for review, not for the floor)' : 'Open the floor copy') + '</button> <span class="muted">opens in a new tab; there, Print / Save as PDF. Pictures and OK photos are included when the SOP App folder is open.</span></p>' +
      (view.rev.status === 'Released' ? '' : '<p class="notok">' + cur + ' is ' + esc(view.rev.status) + ', not Released: this copy is for review, not for the floor.</p>') +
      '<div class="refusal" data-for="floor"></div><div id="final-slot"></div>';
  }
  /* finalCard(f): build 50 (example_rights.md part 9.4): the Final PDF line of the revision on the floor; f = { name, rev, saved } */
  function finalCard(f) {
    return '<div class="card final-pdf" id="final-pdf"><b>Final PDF</b> ' + esc(f.name) + '.pdf in Final SOPs · <span class="' + (f.saved ? 'ok' : 'notok') + '" id="final-state">' +
      (f.saved ? 'saved' : 'not saved yet') + '</span> <button id="btn-final-save">Save the final PDF</button>' +
      '<div class="note">Opens the floor copy of ' + esc(f.rev) + ' and Chrome\'s print window: pick Save as PDF and the folder D:\\Claude\\Projects\\SOP App\\Final SOPs, then Save. ' +
      'Older PDFs of ' + esc(f.sop_id) + ' there move to Final SOPs\\Old.</div><div class="refusal" data-for="final"></div></div>';
  }
  function routingTab(view) {
    return '<h2>Routing <span class="muted">rows that name ' + (view.copy ? 'the good version ' + esc(view.copy.of) + ' (a copy has no routing of its own)' : 'this SOP') + '</span></h2>' +
      grid([['No.', 'no'], ['From', 'from_id'], ['To', 'to_id'], ['Qty', 'qty'], ['Serial consumed', 'serial_consumed'], ['Note', 'note']], view.routing, function (r, f) { return f === 'serial_consumed' ? yn(r.serial_consumed) : lines(r[f]); });
  }
  function revisionsTab(view) {
    return '<h2>Revision history <span class="muted">the human log' + (view.copy ? ' of the good version ' + esc(view.copy.of) + '; Make this the good version adds the next row' : '') + '</span></h2>' +
      grid([['No.', 'rh_id'], ['Rev', 'rev'], ['Date', 'date'], ['What changed', 'what_changed'], ['Changed by', 'changed_by'], ['Approved by', 'approved_by']], view.revision_history);
  }
  function historyTab(view) {
    const rows = view.history.slice().reverse();
    return '<h2>History <span class="muted">every change made in the Builder, newest first</span></h2>' +
      grid([['No.', 'hist_id'], ['When', 'at'], ['Who', 'who'], ['Rev', 'rev'], ['Table', 'table'], ['Row', 'row_id'], ['Field', 'field'], ['Old value', 'old_value'], ['New value', 'new_value'], ['Reason', 'reason']], rows,
        function (r, f) { return f === 'at' ? esc(String(r.at).slice(0, 16).replace('T', ' ')) : lines(r[f]); });
  }

  return { finalCard, vnTab, giveForm, givenNote, safetyTab, materialsTab, glossaryTab, gaugesTab, picturesTab, examplesTab, releaseTab, compareTab, floorTab, routingTab, revisionsTab, historyTab, textsTab };
})();
