/* SOP Builder screen builder for the New SOP card on the SOP list page:
   Start from Blank (example_new_sop.md part 4: the SOP ID choice and
   "Start the blank SOP") or from a Planner chart (example_flow.md part 9:
   the chart file, the groups, the plan table with ticks, the SOP ID choice
   with the new-SOP fields, "Make the SOP"). The Reason comes from the
   pop-up. HTML from data only. Classic script (global RENDER_KICK). */
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
  /* card(k, listed, levels): k = APP state.kick (k.type 'main' or 'process'; k.start 'blank', the start when the page opens, or
     'chart'; k.proc = { code, name, product }); listed = SOP list rows with no revision; levels = SETS.level */
  function card(k, listed, levels) {
    const proc = k.type === 'process';
    const blank = proc || k.start !== 'chart';
    let h = '<div class="card kick" id="kick-card"><h2>New SOP</h2>';
    /* the two SOP types (contract 1.4, example_process_sop.md part 4) */
    h += '<div class="f"><label>Type</label><div class="v"><label class="radio"><input type="radio" name="kick-type" value="main"' + (proc ? '' : ' checked') + '> Main SOP</label> ' +
      '<label class="radio"><input type="radio" name="kick-type" value="process"' + (proc ? ' checked' : '') + '> Process SOP</label>' +
      note('Main SOP: makes a main part with its own serial number. Process SOP: one process (brazing, a pressure test) used inside main SOPs; it can also run on its own', 'Main SOP') + '</div></div>';
    if (proc) {
      const pr = k.proc || {};
      h += '<div class="f"><label>Start from</label><div class="v">Blank' + note('A Process SOP starts blank: you add its sections and steps on the Flow tab', 'Blank') + '</div></div>';
      h += '<div class="f"><label for="kp-code">Code</label><div class="v"><input id="kp-code" size="24" value="' + esc(pr.code || '') + '">' +
        note('Capitals, digits and dashes, 3 to 20 characters; used in the step keys (small letters are turned into capitals)', 'BRAZE-CU') + ref('new_sop_id') + '</div></div>';
      h += '<div class="f"><label for="kp-name">Name</label><div class="v"><input id="kp-name" size="40" value="' + esc(pr.name || '') + '">' + note('What the process is, in plain words', 'Copper brazing') + ref('title') + '</div></div>';
      h += '<div class="f"><label for="kp-product">Product</label><div class="v"><input id="kp-product" size="40" value="' + esc(pr.product || '') + '">' + note('The product, or All products', 'All products') + ref('product') + '</div></div>';
      h += '<div class="f"><label></label><div class="v"><button id="btn-blank-make">Start the blank SOP</button><div class="note">Start asks the reason for the change.</div>' + ref('sop_id') + ref('form') + '</div></div>';
      return h + '</div>';
    }
    h += '<div class="f"><label>Start from</label><div class="v"><label class="radio"><input type="radio" name="kick-start" value="blank"' + (blank ? ' checked' : '') + '> Blank</label> ' +
      '<label class="radio"><input type="radio" name="kick-start" value="chart"' + (blank ? '' : ' checked') + '> A Planner chart</label>' +
      note('Blank: Rev 01 with no sections and no steps; you add them on the Flow tab. A Planner chart: the sections come from a group of its boxes', 'Blank') + '</div></div>';
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
