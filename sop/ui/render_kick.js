/* SOP Builder screen builder for the New SOP card on the SOP list page:
   Start from Blank (example_new_sop.md part 4: the SOP ID choice and
   "Start the blank SOP") or from a Planner chart (example_flow.md part 9:
   the chart file, the groups, the plan table with ticks, the SOP ID choice
   with the new-SOP fields, "Make the SOP") or from a draft file (build 60,
   example_draft_file.md part 6: the file, what the reader found, the copy
   name, "Bring it in"). The Reason comes from the pop-up. HTML from data
   only. Classic script (global RENDER_KICK). */
const RENDER_KICK = (function () {
  const R = RENDER;
  const esc = R.esc;
  const note = (text, example) => '<div class="note">' + esc(text) + (/[.!?]$/.test(text) ? '' : '.') + ' Example: ' + esc(example) + '.</div>';
  const ref = name => '<div class="refusal" data-for="' + name + '"></div>';

  /* sopIdPart(k, listed, levels, label): an SOP on the list with no revision yet, or a new SOP ID with its fields */
  function sopIdPart(k, listed, levels, label) {
    let h = '<div class="f"><label>' + esc(label) + '</label><div class="v">';
    h += '<label class="radio"><input type="radio" name="kick-sop" value="list"' + (k.sop_choice !== 'new' ? ' checked' : '') + '> From the SOP list</label> <select id="kick-sop-id">';
    h += '<option value=""' + (k.sop_id ? '' : ' selected') + '>(pick one)</option>';
    for (const s of listed) { h += '<option value="' + esc(s.sop_id) + '"' + (k.sop_id === s.sop_id ? ' selected' : '') + '>' + esc(s.sop_id) + ' · ' + esc(s.status) + ' · ' + esc(String(s.title || '').length > 60 ? String(s.title).slice(0, 60) + '…' : s.title) + '</option>'; }
    h += '</select> <label class="radio"><input type="radio" name="kick-sop" value="new"' + (k.sop_choice === 'new' ? ' checked' : '') + '> New SOP ID</label>';
    h += note('An SOP on the list with no revision yet (status Listed or On hold), or a new ID', 'BMC-L1-ALUCOIL-01') + ref('sop_id');
    if (k.sop_id && k.kept) { h += '<div class="muted">Kept from the list: ' + esc(k.kept) + '</div>'; }
    if (k.sop_choice === 'new') {
      const n = k.new_sop || {};
      h += '<div class="kick-new"><div class="f"><label for="kn-id">SOP ID</label><div class="v"><input id="kn-id" size="24" value="' + esc(n.sop_id || '') + '">' + note('PRODUCT-LEVEL-NAME-NN, in capitals (small letters are turned into capitals)', 'BMC-L1-ALUCOIL-01') + ref('new_sop_id') + '</div></div>';
      h += '<div class="f"><label for="kn-level">Level</label><div class="v"><select id="kn-level"><option value="">(pick)</option>' + levels.map(l => '<option' + (n.level === l ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' +
        note('L0 incoming, L1 part, L2 sub-assembly, L3 final assembly, L4 test, Site', 'L1') + ref('level') + '</div></div>';
      h += '<div class="f"><label for="kn-product">Product</label><div class="v"><input id="kn-product" size="40" value="' + esc(n.product || '') + '">' + note('Product the SOP belongs to', 'BMC 1000 L cooling unit') + ref('product') + '</div></div>';
      h += '<div class="f"><label for="kn-title">Title</label><div class="v"><input id="kn-title" size="60" value="' + esc(n.title || '') + '">' + note('One line that says what the SOP covers', 'Single aluminium coil: bends, welding, test') + ref('title') + '</div></div>';
      h += '<div class="f"><label>Output serial tracked</label><div class="v"><label class="radio"><input type="radio" name="kn-serial" value="Y"' + (n.output_serial_tracked === true ? ' checked' : '') + '> Y</label> <label class="radio"><input type="radio" name="kn-serial" value="N"' + (n.output_serial_tracked === false ? ' checked' : '') + '> N</label>' +
        note('Y when each piece this SOP makes gets its own serial number. N for a lot check or site work', 'Y for BMC-L1-TANK-01') + ref('output_serial_tracked') + '</div></div></div>';
    }
    return h + '</div></div>';
  }
  /* grouped(warnings): the same line on 3 or more steps as one line ("no Gujarati line: 85 steps, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 and 79 more") */
  function grouped(warnings) {
    const by = {}, order = [];
    for (const w of warnings) {
      const m = /^Step ([0-9.]+): (.+)$/.exec(w);
      const k = m ? m[2] : w;
      if (!by[k]) { by[k] = []; order.push(k); }
      by[k].push(m ? m[1] : null);
    }
    const out = [];
    for (const k of order) {
      const nos = by[k];
      if (nos.length < 3 || nos[0] === null) { for (const n of nos) { out.push(n === null ? k : 'Step ' + n + ': ' + k); } continue; }
      out.push(k.replace(/\.$/, '') + ': ' + nos.length + ' steps, ' + nos.slice(0, 6).join(', ') + (nos.length > 6 ? ' and ' + (nos.length - 6) + ' more' : '') + '.');
    }
    return out;
  }
  /* draftPart(k): build 60 (spec/example_draft_file.md part 6): the draft file a chat made with the fixed prompt, what the reader found
     in it (k.read: refusals, or the line, the target and the warnings), the copy name when it becomes a copy, Bring it in */
  function draftPart(k) {
    /* build 61: the prompt from the Builder, for any AI chat */
    let h = '<div class="f"><label>The prompt</label><div class="v"><button id="btn-prompt-copy">Copy the prompt</button> <button id="btn-prompt-save">Save the prompt as a file</button>' +
      '<div class="note">Paste the prompt in a new chat of any AI (Claude, ChatGPT, Gemini) and attach all you have on the SOP: PDFs, a flow chart, drawings, photos, notes. ' +
      'The chat gives two files: a PDF to read and a .json file for step 1. Example: "Make the draft of BMC-L1-ALUCOIL-01 from the attached files."</div><div id="prompt-done">' + (k.prompt_done ? '<div class="given-note">' + esc(k.prompt_done) + '</div>' : '') + '</div></div></div>';
    h += '<div class="f"><label>1 Draft file</label><div class="v"><input type="file" id="kick-draft" accept=".json,application/json"> ' +
      (k.draft_name ? '<span class="muted">' + esc(k.draft_name) + '</span>' : '') +
      note('The .json file the chat made with the prompt, or one saved on a Floor PDF tab. The PDF the same chat made is for reading', 'BMC-L1-ALUCOIL-01 draft.json') + ref('file') + '</div></div>';
    const rd = k.read;
    if (!rd) { return h; }
    h += '<div class="f"><label>2 What it holds</label><div class="v">';
    if (rd.refusals) {
      h += '<div class="notok draft-no">Not brought in: ' + esc(rd.refusals.length) + (rd.refusals.length === 1 ? ' thing' : ' things') + ' to fix in the file (in the chat that made it):</div><ul class="draft-list draft-refusals">' +
        rd.refusals.map(x => '<li>' + esc(x.message) + '</li>').join('') + '</ul></div></div>';
      return h;
    }
    const m = rd.made || {};
    const made = (m.made_on ? ' on ' + m.made_on : '') + (m.made_by ? ' by ' + m.made_by : '') + (m.prompt ? ' with ' + m.prompt : '') + (m.source ? ' from ' + m.source : '');
    h += '<div class="draft-line">' + esc(rd.line) + '</div>' + (made ? '<div class="muted draft-made">Made' + esc(made) + '.</div>' : '') + '<div class="draft-target">' + esc(rd.target.line) + '</div>';
    h += rd.warnings.length ? '<details class="draft-warn"><summary>' + esc(rd.warnings.length) + (rd.warnings.length === 1 ? ' thing' : ' things') + ' to check later (it comes in; the tabs show them again)</summary><ul class="draft-list">' +
      grouped(rd.warnings).map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></details>' : '<div class="ok draft-warn">Nothing to check later.</div>';
    h += '</div></div>';
    if (rd.target.kind === 'copy') {
      h += '<div class="f"><label for="kd-name">3 Copy name</label><div class="v"><input id="kd-name" size="30" maxlength="40" value="' + esc(k.copy_name || '') + '">' +
        note('The name of your copy, 40 letters at most. Empty: Draft file and the day', 'SS tank from the Rev 02 PDF') + ref('name') + '</div></div>';
    }
    h += '<div class="f"><label></label><div class="v"><button id="btn-draft-make">Bring it in</button><div class="note">Bring it in asks the reason for the change.</div>' + ref('form') + '</div></div>';
    return h;
  }
  /* card(k, listed, levels): k = APP state.kick (k.type 'main' or 'process'; k.start 'blank', the start when the page opens, 'chart'
     or 'draft' (build 60); k.proc = { code, name, product }); listed = SOP list rows with no revision; levels = SETS.level */
  function card(k, listed, levels) {
    const proc = k.type === 'process';
    const draft = k.start === 'draft';
    const blank = !draft && (proc || k.start !== 'chart');
    let h = '<div class="card kick" id="kick-card"><h2>New SOP</h2>';
    /* the two SOP types (contract 1.4, example_process_sop.md part 4) */
    h += '<div class="f"><label>Type</label><div class="v"><label class="radio"><input type="radio" name="kick-type" value="main"' + (proc ? '' : ' checked') + '> Main SOP</label> ' +
      '<label class="radio"><input type="radio" name="kick-type" value="process"' + (proc ? ' checked' : '') + '> Process SOP</label>' +
      note('Main SOP: makes a main part with its own serial number. Process SOP: one process (brazing, a pressure test) used inside main SOPs; it can also run on its own', 'Main SOP') + '</div></div>';
    const start = (value, words, on) => '<label class="radio"><input type="radio" name="kick-start" value="' + value + '"' + (on ? ' checked' : '') + '> ' + words + '</label> ';
    if (proc) {
      h += '<div class="f"><label>Start from</label><div class="v">' + start('blank', 'Blank', !draft) + start('draft', 'A draft file', draft) +
        note('Blank: you add the sections and steps on the Flow tab. A draft file: the SOP a chat wrote with the draft prompt; the file says its own type and ID', 'Blank') + '</div></div>';
      if (draft) { return h + draftPart(k) + '</div>'; }
    }
    if (proc) {
      const pr = k.proc || {};
      h += '<div class="f"><label for="kp-code">Code</label><div class="v"><input id="kp-code" size="24" value="' + esc(pr.code || '') + '">' +
        note('Capitals, digits and dashes, 3 to 20 characters; used in the step keys (small letters are turned into capitals)', 'BRAZE-CU') + ref('new_sop_id') + '</div></div>';
      h += '<div class="f"><label for="kp-name">Name</label><div class="v"><input id="kp-name" size="40" value="' + esc(pr.name || '') + '">' + note('What the process is, in plain words', 'Copper brazing') + ref('title') + '</div></div>';
      h += '<div class="f"><label for="kp-product">Product</label><div class="v"><input id="kp-product" size="40" value="' + esc(pr.product || '') + '">' + note('The product, or All products', 'All products') + ref('product') + '</div></div>';
      h += '<div class="f"><label></label><div class="v"><button id="btn-blank-make">Start the blank SOP</button><div class="note">Start asks the reason for the change.</div>' + ref('sop_id') + ref('form') + '</div></div>';
      return h + '</div>';
    }
    h += '<div class="f"><label>Start from</label><div class="v">' + start('blank', 'Blank', blank) + start('chart', 'A Planner chart', !blank && !draft) + start('draft', 'A draft file', draft) +
      note('Blank: Rev 01 with no sections and no steps; you add them on the Flow tab. A Planner chart: the sections come from a group of its boxes. A draft file: the SOP a chat wrote with the draft prompt, sections and steps', 'Blank') + '</div></div>';
    if (draft) { return h + draftPart(k) + '</div>'; }
    if (blank) {
      h += sopIdPart(k, listed, levels, 'SOP ID');
      h += '<div class="f"><label></label><div class="v"><button id="btn-blank-make">Start the blank SOP</button><div class="note">Start asks the reason for the change.</div>' + ref('form') + '</div></div>';
      return h + '</div>';
    }
    h += '<div class="f"><label>1 Chart file</label><div class="v"><input type="file" id="kick-file" accept=".json,application/json"> ' +
      (k.chart ? '<span class="muted">' + esc(k.file_name) + '</span>' : '') +
      note('The Planner\'s chart file (.json). The Builder reads it and keeps a copy under source\\chart; it never writes to it', 'upgraded flow chart.json') + ref('file');
    if (k.groups) { h += '<div class="muted">Read: chart "' + esc(k.groups.name) + '", ' + esc(k.groups.boxes) + ' boxes, ' + esc(k.groups.arrows) + ' arrows, ' + esc(k.groups.groups.length) + ' groups and ' + esc(k.groups.no_group) + ' boxes without a group.</div>'; }
    h += '</div></div>';
    if (k.groups) {
      h += '<div class="f"><label>2 Group</label><div class="v">';
      for (const g of k.groups.groups) { h += '<label class="radio"><input type="radio" name="kick-group" value="' + esc(g.group) + '"' + (k.group === g.group ? ' checked' : '') + '> ' + esc(g.group) + ' (' + esc(g.count) + ')</label> '; }
      if (k.groups.no_group) { h += '<label class="radio"><input type="radio" name="kick-group" value=""' + (k.group === '' ? ' checked' : '') + '> no group (' + esc(k.groups.no_group) + ')</label>'; }
      h += note('The group of boxes that make one SOP, as grouped in the Planner', 'ALUMINIUM_COIL') + ref('group') + '</div></div>';
    }
    if (k.plan) {
      h += '<div class="f"><label>3 Boxes</label><div class="v"><div class="muted">Boxes of ' + esc(k.group || 'no group') + ' in chain order. Untick a box to leave it out.</div>' +
        '<table class="grid kick-plan"><tr><th>Use</th><th>Section</th><th>Ref</th><th>Box</th><th>Type</th><th>Becomes</th></tr>';
      for (const p of k.plan) {
        h += '<tr' + (p.use ? '' : ' class="muted"') + '><td><input type="checkbox" class="kick-use" data-id="' + esc(p.id) + '"' + (p.use ? ' checked' : '') + '></td><td>' + (p.section === null ? '' : esc(p.section)) +
          '</td><td>' + esc(p.ref || '') + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.type) + '</td><td>' + esc(p.text) + '</td></tr>';
      }
      h += '</table>' + ref('boxes') + '</div></div>';
    }
    if (k.groups) {
      h += sopIdPart(k, listed, levels, '4 SOP ID');
      h += '<div class="f"><label></label><div class="v"><button id="btn-kick-make">Make the SOP</button><div class="note">Make the SOP asks the reason for the change.</div>' + ref('form') + '</div></div>';
    }
    return h + '</div>';
  }
  return { card };
})();
