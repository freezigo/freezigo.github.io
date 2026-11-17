/* SOP Builder logic pieces for a new SOP: kickstarted from the Production
   Planner chart file (example_flow.md parts 9 and 10: chartGroups,
   chartPlan, sopFromChart; the chart is read, never written) or started
   blank (example_new_sop.md parts 4 and 5: sopBlank). Pure. Classic
   script (global ENGINE_KICK); module in Node. Answer key:
   tests/golden7.js, tests/golden10.js. */
const ENGINE_KICK = (function () {
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const R = (typeof ENGINE_RELEASE !== 'undefined') ? ENGINE_RELEASE : require('./release.js');
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = v => v === null || v === undefined || String(v).trim() === '';
  const r = (field, message) => ({ field: field, message: message });
  const int = v => { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : 0; };
  const refOf = n => empty(n.ref) ? null : String(n.ref);
  const label = n => refOf(n) || n.name;
  const isSectionBox = n => n.type === 'production' || n.type === 'assembly' || /^pick up$/i.test(String(n.name).trim());
  const isPickUp = n => /^pick up$/i.test(String(n.name).trim());
  const isPart = n => n.type === 'part' || n.type === 'product' || n.type === 'assembled';
  const idNum = id => { const m = /(\d+)$/.exec(String(id)); return m ? Number(m[1]) : 0; };
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const NEEDED = '[VALUE NEEDED: Divyal]';

  /* chartGroups(chart) → { name, boxes, arrows, groups: [{ group, count }], no_group } or { refusals } */
  function chartGroups(chart) {
    if (!chart || !Array.isArray(chart.nodes) || !chart.nodes.length) { return { refusals: [r('file', 'The file is not a Planner chart (no boxes).')] }; }
    const counts = {};
    let none = 0;
    for (const n of chart.nodes) { if (empty(n._group)) { none++; } else { counts[n._group] = (counts[n._group] || 0) + 1; } }
    return { name: chart.name || null, boxes: chart.nodes.length, arrows: (chart.edges || []).length, no_group: none,
      groups: Object.keys(counts).sort().map(g => ({ group: g, count: counts[g] })) };
  }

  function manpowerOf(n) {
    const e = int(n.employee), h = int(n.helper);
    const parts = [];
    if (e) { parts.push(plural(e, 'employee')); }
    if (h) { parts.push(plural(h, 'helper')); }
    if (!parts.length) { return { text: NEEDED, people: null }; }
    return { text: parts.join(' + ') + (empty(n.skill) ? '' : ' (' + String(n.skill).trim() + ')'), people: e + h };
  }
  const waitMin = n => (int(n.wait) ? int(n.wait) * (n.wait_unit === 'hr' ? 60 : 1) : 0);

  /* the group's boxes in chain order, the ticked ones numbered as sections; preds close over unticked boxes */
  function build(chart, group, unticked) {
    const byId = {};
    for (const n of chart.nodes) { byId[n.id] = n; }
    const inGroup = chart.nodes.filter(n => (empty(group) ? empty(n._group) : n._group === group));
    const ids = inGroup.map(n => n.id);
    const edges = (chart.edges || []).filter(e => ids.indexOf(e.src) >= 0 && ids.indexOf(e.dst) >= 0);
    const order = [], left = ids.slice();
    const key = n => [refOf(n) === null ? 1 : 0, refOf(n) || '', idNum(n.id)];
    const less = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) { if (x[i] < y[i]) { return true; } if (x[i] > y[i]) { return false; } } return false; };
    while (left.length) {
      const ready = left.filter(id => !edges.some(e => e.dst === id && left.indexOf(e.src) >= 0)).map(id => byId[id]);
      if (!ready.length) { fail('chartPlan', 'the arrows of group ' + group + ' run in a circle'); }
      let best = ready[0];
      for (const n of ready) { if (less(n, best)) { best = n; } }
      order.push(best); left.splice(left.indexOf(best.id), 1);
    }
    const ticked = id => unticked.indexOf(id) < 0;
    const predsOf = function (id, seen) {
      const out = [];
      for (const e of edges.filter(x => x.dst === id)) {
        if ((seen || []).indexOf(e.src) >= 0) { continue; }
        if (ticked(e.src)) { out.push(e.src); } else { for (const p of predsOf(e.src, (seen || []).concat([e.src]))) { if (out.indexOf(p) < 0) { out.push(p); } } }
      }
      return out;
    };
    const secBoxes = order.filter(n => ticked(n.id) && isSectionBox(n));
    const numbered = secBoxes.filter(isPickUp).concat(secBoxes.filter(n => !isPickUp(n)));
    const secOf = {};
    numbered.forEach((n, i) => { secOf[n.id] = 3 + i; });
    const succ = id => (chart.edges || []).filter(e => e.src === id).map(e => byId[e.dst]).filter(Boolean);
    return { byId: byId, order: order, edges: edges, ticked: ticked, predsOf: predsOf, secOf: secOf, numbered: numbered, succ: succ };
  }

  /* chartPlan(chart, group, unticked, sop, routingRows) → [{ id, ref, name, type, use, becomes, section, text }] */
  function chartPlan(chart, group, unticked, sop, routingRows) {
    const b = build(chart, group, unticked || []);
    const existing = (routingRows || []).filter(x => x.to_id === sop.sop_id).sort((x, y) => x.no - y.no);
    return b.order.map(function (n) {
      const row = { id: n.id, ref: refOf(n), name: n.name, type: n.type, use: b.ticked(n.id), becomes: 'left out', section: null, text: 'Left out' };
      if (!row.use) { return row; }
      if (b.secOf[n.id] !== undefined) {
        const s = b.secOf[n.id], mp = manpowerOf(n);
        const needs = b.predsOf(n.id).filter(p => b.secOf[p] !== undefined).map(p => b.secOf[p]).sort((x, y) => x - y);
        let text = 'Section ' + s + (isPickUp(n) ? ' (Incoming check)' : '') + ': ' + mp.text + ', ' + (int(n.minutes) ? int(n.minutes) + ' min' : 'Est min needed');
        if (needs.length) { text += ', needs ' + needs.join(', '); }
        for (const p of b.predsOf(n.id)) { const pb = b.byId[p]; if (waitMin(pb) && b.secOf[p] !== undefined) { text += ', ' + waitMin(pb) + ' min after ' + b.secOf[p]; } }
        if (waitMin(n)) {
          const after = b.succ(n.id).filter(x => b.secOf[x.id] !== undefined).map(x => b.secOf[x.id]);
          if (after.length) { text += '; wait ' + int(n.wait) + ' ' + n.wait_unit + ': section' + (after.length > 1 ? 's ' : ' ') + after.join(', ') + (after.length > 1 ? ' start ' : ' starts ') + waitMin(n) + ' min after ' + s; }
        }
        return Object.assign(row, { becomes: 'section', section: s, text: text });
      }
      if (n.type === 'outsource') {
        const from = /purchase/i.test(n.name) ? 'Purchase' : 'Vendor';
        if (existing.length) {
          const x = existing[0];
          return Object.assign(row, { becomes: 'routing exists', text: 'Routing row ' + from + ' → ' + sop.sop_id + ': not made, row ' + x.no + ' (' + x.from_id + ' → ' + x.to_id + ') exists' });
        }
        return Object.assign(row, { becomes: 'routing', text: 'Routing row ' + from + ' → ' + sop.sop_id });
      }
      if (isPart(n)) {
        const fedBy = b.predsOf(n.id).length > 0;
        const feeds = b.succ(n.id).filter(x => x._group !== n._group || !b.ticked(x.id));
        const feedText = feeds.map(x => x.name + ' (' + (refOf(x) ? refOf(x) + ', ' : '') + 'group ' + (empty(x._group) ? 'none' : x._group) + ')').join(', ');
        if (fedBy) {
          const kept = !empty(sop.output_to);
          return Object.assign(row, { becomes: 'output', text: 'Output of the SOP' + (feeds.length ? '; feeds ' + feedText : '') + '. ' +
            (kept ? 'Output to kept: ' + sop.output_to : 'Output to: ' + n.name + (refOf(n) ? ' (chart ' + refOf(n) + ')' : '')) });
        }
        if (b.succ(n.id).some(x => b.ticked(x.id) && x._group === n._group)) {
          const kept = !empty(sop.input_from);
          return Object.assign(row, { becomes: 'input', text: 'Input of the SOP. ' + (kept ? 'Input from kept: ' + sop.input_from : 'Input from: ' + n.name + (refOf(n) ? ' (chart ' + refOf(n) + ')' : '')) });
        }
      }
      return Object.assign(row, { becomes: 'dropped', text: 'Dropped (no section, no routing, no input or output)' });
    });
  }

  /* sopFromChart(input) → { sop, new_sop, revision, sections, routing_rows, vn_rows, rh_row, history, report, plan } or { refusals }
     input = { chart, file_name, group, unticked, sop_id, new_sop: { sop_id, level, product, title, output_serial_tracked }, tables: { sops, routing }, ctx } */
  function sopFromChart(input) {
    const ctx = input.ctx;
    E.checkCtx(ctx, 'sopFromChart');
    for (const k of ['next_rh_id', 'next_routing_no', 'next_vn_no']) { if (!Number.isInteger(ctx[k])) { fail('sopFromChart', 'ctx.' + k + ' is missing'); } }
    if (!input.chart) { return { refusals: [r('file', 'Choose a chart file.')] }; }
    const groups = chartGroups(input.chart);
    if (groups.refusals) { return groups; }
    if (input.group === null || input.group === undefined) { return { refusals: [r('group', 'Pick a group.')] }; }
    const sops = input.tables.sops;
    let sop, isNew = false;
    if (!empty(input.sop_id)) {
      sop = sops.find(s => s.sop_id === input.sop_id) || fail('sopFromChart', 'no SOP ' + input.sop_id + ' on the list');
      if (!empty(sop.current_rev)) { return { refusals: [r('sop_id', sop.sop_id + ' already has a revision: open it from the list.')] }; }
      sop = JSON.parse(JSON.stringify(sop));
    } else if (input.new_sop) {
      const ns = input.new_sop;
      const id = String(ns.sop_id || '').trim().toUpperCase();
      if (!/^[A-Z]+-(L[0-4]|S[1-4])-[A-Z0-9]+-\d{2}$/.test(id)) { return { refusals: [r('new_sop_id', 'SOP ID must look like BMC-L1-NAME-01: the product, the level (L0 to L4, or S1 to S4), a name and a two-digit number, with a dash between each.')] }; }
      if (sops.some(s => s.sop_id === id)) { return { refusals: [r('new_sop_id', 'SOP ID ' + id + ' is already on the list: pick it from the list.')] }; }
      const refusals = [];
      if (empty(ns.level)) { refusals.push(r('level', 'Level is empty.')); }
      if (empty(ns.product)) { refusals.push(r('product', 'Product is empty.')); }
      if (empty(ns.title)) { refusals.push(r('title', 'Title is empty.')); }
      if (ns.output_serial_tracked !== true && ns.output_serial_tracked !== false) { refusals.push(r('output_serial_tracked', 'Output serial tracked is not set.')); }
      if (refusals.length) { return { refusals: refusals }; }
      const p = id.split('-');
      sop = { sop_id: id, sop_type: 'Main', short: p[2] + p[3], level: String(ns.level).trim(), product: String(ns.product).trim(), title: String(ns.title).trim(), status: 'Listed', current_rev: null,
        who_does_it: null, input_from: null, output_to: null, output_serial_tracked: ns.output_serial_tracked, edited_in: 'Builder' };
      isNew = true;
    } else { return { refusals: [r('sop_id', 'Pick an SOP ID or type a new one.')] }; }
    const unticked = input.unticked || [];
    const plan = chartPlan(input.chart, input.group, unticked, sop, input.tables.routing);
    if (!plan.some(p => p.use)) { return { refusals: [r('boxes', 'No box is ticked.')] }; }
    if (empty(ctx.reason)) { return { refusals: [r('reason', 'Reason for change is empty.')] }; }

    const b = build(input.chart, input.group, unticked);
    const rev = 'Rev 01', today = String(ctx.now).slice(0, 10);
    const SEC_FIELDS = TYPESX.tables.sections.fields.map(f => f.name);
    const sections = b.numbered.map(function (n) {
      const row = {};
      for (const f of SEC_FIELDS) { row[f] = null; }
      const mp = manpowerOf(n);
      return Object.assign(row, { sop_id: sop.sop_id, rev: rev, section: b.secOf[n.id], name: isPickUp(n) ? 'Incoming check' : String(n.name).trim(),
        manpower: mp.text, manpower_people: mp.people, est_min: int(n.minutes) || null, needs_sops: [], source_ref: refOf(n),
        needs_sections: b.predsOf(n.id).filter(p => b.secOf[p] !== undefined).map(p => b.secOf[p]).sort((x, y) => x - y) });
    }).sort((x, y) => x.section - y.section);
    for (const n of b.numbered) {
      if (!waitMin(n)) { continue; }
      for (const x of b.succ(n.id)) {
        const s = sections.find(q => q.section === b.secOf[x.id]);
        if (s) { s.wait_after = b.secOf[n.id]; s.wait_min = waitMin(n); if (s.needs_sections.indexOf(b.secOf[n.id]) < 0) { s.needs_sections.push(b.secOf[n.id]); s.needs_sections.sort((p, q) => p - q); } }
      }
    }
    const routing = [], vn = [], clauses = [];
    let rno = ctx.next_routing_no, vno = ctx.next_vn_no;
    const existing = input.tables.routing.filter(x => x.to_id === sop.sop_id).sort((x, y) => x.no - y.no);
    const used = plan.filter(p => p.use).map(p => b.byId[p.id]);
    for (const n of used.filter(x => x.type === 'outsource')) {
      const from = /purchase/i.test(n.name) ? 'Purchase' : 'Vendor';
      if (existing.length) { clauses.push('row ' + existing[0].no + ' (' + existing[0].from_id + ' → ' + existing[0].to_id + ') exists, so no row was made for ' + n.name + ' (outsource)'); continue; }
      routing.push({ no: rno, from_id: from, to_id: sop.sop_id, qty: 1, serial_consumed: false, note: 'Chart: ' + n.name + (refOf(n) ? ' (' + refOf(n) + ')' : '') });
      clauses.push('row ' + rno + ' (' + from + ' → ' + sop.sop_id + ') made for ' + n.name + ' (outsource)');
      rno++;
    }
    const kept = [];
    const before = JSON.parse(JSON.stringify(sop));
    const parts = [];
    for (const p of plan.filter(x => x.use && (x.becomes === 'output' || x.becomes === 'input'))) {
      const n = b.byId[p.id];
      const field = p.becomes === 'output' ? 'output_to' : 'input_from';
      const feeds = p.becomes === 'output' ? b.succ(n.id).filter(x => x._group !== n._group).map(x => x.name + ' (' + (refOf(x) ? refOf(x) + ', ' : '') + 'group ' + (empty(x._group) ? 'none' : x._group) + ')') : [];
      let text = (p.becomes === 'output' ? 'Output: ' : 'Input: ') + n.name + ' (' + n.type + (refOf(n) ? ' ' + refOf(n) : '') + ')' + (feeds.length ? ' feeds ' + feeds.join(', ') : '');
      if (empty(sop[field])) { sop[field] = n.name + (refOf(n) ? ' (chart ' + refOf(n) + ')' : ''); text += '; ' + (field === 'output_to' ? 'Output to' : 'Input from') + ' set to ' + sop[field]; }
      parts.push(text + '.');
    }
    for (const s of sections) {
      if (s.manpower === NEEDED) { vn.push({ vn_id: 'VN-' + String(vno).padStart(4, '0'), no: vno, sop_id: sop.sop_id, step_text: String(s.section), value_needed: 'Manpower of section ' + s.section + ' ' + s.name, unit: 'text', owner: 'Divyal', blocks_release: false, value: null, date_given: null, sign: null }); vno++; }
      if (s.est_min === null) { vn.push({ vn_id: 'VN-' + String(vno).padStart(4, '0'), no: vno, sop_id: sop.sop_id, step_text: String(s.section), value_needed: 'Est min of section ' + s.section + ' ' + s.name, unit: 'min', owner: 'Divyal', blocks_release: false, value: null, date_given: null, sign: null }); vno++; }
    }
    if (!isNew) { for (const f of [['title', 'title'], ['level', 'level'], ['product', 'product'], ['who_does_it', 'who does it'], ['input_from', 'input from'], ['output_to', 'output to']]) { if (!empty(before[f[0]])) { kept.push(f[1]); } } }
    const secBoxes = b.numbered;
    const diff = secBoxes.filter(n => int(n.difficulty)).map(n => label(n) + ' ' + int(n.difficulty));
    const res = secBoxes.filter(n => Array.isArray(n.resources) && n.resources.length).map(n => label(n) + ': ' + n.resources.map(x => x.name).join(', '));
    const leftOut = plan.filter(p => !p.use).map(p => p.name + (p.ref ? ' (' + p.ref + ')' : ''));
    let report = 'Kickstarted ' + today + ' by ' + ctx.who + ' from the chart file ' + input.file_name + ' (chart "' + input.chart.name + '"), group ' + input.group + ': ' +
      sections.length + ' sections from boxes ' + secBoxes.map(label).join(', ') + '; no steps.';
    report += isNew ? ' New SOP ID ' + sop.sop_id + ' from the form.' : (kept.length ? ' Kept from the SOP list: ' + kept.join(', ') + '.' : '');
    if (clauses.length) { report += ' Routing: ' + clauses.join('; ') + '.'; }
    if (parts.length) { report += ' ' + parts.join(' '); }
    const dropped = [];
    if (diff.length) { dropped.push('difficulty (' + diff.join(', ') + ')'); }
    if (res.length) { dropped.push('resources (' + res.join('; ') + ')'); }
    dropped.push('box positions and routes');
    report += ' Dropped: ' + dropped.join('; ') + '.';
    report += ' Left out: ' + (leftOut.length ? leftOut.join(', ') : 'none') + '.';
    if (vn.length) { report += ' Values Needed: ' + vn.map(v => v.vn_id).join(', ') + '.'; }

    const REV_FIELDS = TYPESX.tables.sop_revisions.fields.map(f => f.name);
    const revision = {};
    for (const f of REV_FIELDS) { revision[f] = null; }
    const total = sections.length && sections.every(s => s.est_min !== null) ? sections.reduce((t, s) => t + s.est_min, 0) : null;
    Object.assign(revision, { sop_id: sop.sop_id, rev: rev, status: 'Draft', rev_date: today, est_min_total: total, prepared_by: ctx.who, revision_note: report });
    const summary = 'Rev 01 kickstarted from the chart file ' + input.file_name + ' (' + input.chart.name + '), group ' + input.group + ': ' + sections.length + ' sections, no steps.';
    const rh = { rh_id: ctx.next_rh_id, sop_id: sop.sop_id, rev: rev, date: today, what_changed: summary, changed_by: ctx.who, approved_by: R.TO_SIGN };
    sop.current_rev = rev; sop.edited_in = 'Builder';
    const H = (table, rowId, rev2, old, nw, fields, after) => E.historyRows({ table: table, row_id: rowId, sop_id: sop.sop_id, rev: rev2, old: old, new: nw, fields: fields, ctx: ctx, after: after });
    let hist = H('sop_revisions', sop.sop_id + ' ' + rev, rev, { row: null }, { row: 'added: Rev 01 (kickstarted from the chart)' }, ['row'], []);
    for (const s of sections) { hist = H('sections', sop.sop_id + ' ' + rev + ' ' + s.section, rev, { row: null }, { row: 'added: ' + s.section + ' ' + s.name + (s.source_ref ? ' (chart ' + s.source_ref + ')' : '') }, ['row'], hist); }
    if (isNew) { hist = H('sops', sop.sop_id, null, { row: null }, { row: 'added: ' + sop.sop_id + ' ' + sop.title }, ['row'], hist); } else { hist = H('sops', sop.sop_id, null, before, sop, ['current_rev', 'edited_in', 'input_from', 'output_to'], hist); }
    for (const x of routing) { hist = H('routing', String(x.no), null, { row: null }, { row: 'added: ' + x.no + ' ' + x.from_id + ' → ' + x.to_id }, ['row'], hist); }
    for (const v of vn) { hist = H('values_needed', v.vn_id, null, { row: null }, { row: 'added: ' + v.vn_id + ' ' + v.value_needed }, ['row'], hist); }
    hist = H('revision_history', String(rh.rh_id), rev, { row: null }, { row: 'added: ' + summary }, ['row'], hist);
    return { sop: sop, new_sop: isNew, revision: revision, sections: sections, routing_rows: routing, vn_rows: vn, rh_row: rh, history: hist, report: report, plan: plan };
  }

  /* pickSop(input, place) → { sop, before, isNew } or { refusals }: the SOP a blank start makes Rev 01 of, from the list (no revision
     yet) or a new ID; the same rules as the SOP ID part of sopFromChart (example_flow.md part 9, item 4). A new ID typed in small
     letters is taken in capitals (build 26). */
  function pickSop(input, place) {
    const sops = input.tables.sops;
    if (!empty(input.sop_id)) {
      const found = sops.find(s => s.sop_id === input.sop_id) || fail(place, 'no SOP ' + input.sop_id + ' on the list');
      if (!empty(found.current_rev)) { return { refusals: [r('sop_id', found.sop_id + ' already has a revision: open it from the list.')] }; }
      return { sop: JSON.parse(JSON.stringify(found)), before: JSON.parse(JSON.stringify(found)), isNew: false };
    }
    if (!input.new_sop) { return { refusals: [r('sop_id', 'Pick an SOP ID or type a new one.')] }; }
    const ns = input.new_sop;
    if (ns.sop_type === 'Process') { return pickProcess(ns, sops); }
    const id = String(ns.sop_id || '').trim().toUpperCase();
    if (!/^[A-Z]+-(L[0-4]|S[1-4])-[A-Z0-9]+-\d{2}$/.test(id)) { return { refusals: [r('new_sop_id', 'SOP ID must look like BMC-L1-NAME-01: the product, the level (L0 to L4, or S1 to S4), a name and a two-digit number, with a dash between each.')] }; }
    if (sops.some(s => s.sop_id === id)) { return { refusals: [r('new_sop_id', 'SOP ID ' + id + ' is already on the list: pick it from the list.')] }; }
    const refusals = [];
    if (empty(ns.level)) { refusals.push(r('level', 'Level is empty.')); }
    if (empty(ns.product)) { refusals.push(r('product', 'Product is empty.')); }
    if (empty(ns.title)) { refusals.push(r('title', 'Title is empty.')); }
    if (ns.output_serial_tracked !== true && ns.output_serial_tracked !== false) { refusals.push(r('output_serial_tracked', 'Output serial tracked is not set.')); }
    if (refusals.length) { return { refusals: refusals }; }
    const p = id.split('-');
    return { sop: { sop_id: id, sop_type: 'Main', short: p[2] + p[3], level: String(ns.level).trim(), product: String(ns.product).trim(), title: String(ns.title).trim(), status: 'Listed',
      current_rev: null, who_does_it: null, input_from: null, output_to: null, output_serial_tracked: ns.output_serial_tracked, edited_in: 'Builder' }, before: null, isNew: true };
  }
  /* pickProcess(ns, sops): a Process SOP from the form (contract 1.4, example_process_sop.md part 4): the code is the SOP ID (3 to 20
     capitals, digits or dashes, not starting or ending with a dash; small letters taken in capitals), the name is the title; level
     Process, no own serial, short = the code without dashes */
  function pickProcess(ns, sops) {
    const id = String(ns.sop_id || '').trim().toUpperCase();
    if (!/^[A-Z0-9](?:[A-Z0-9-]{1,18})[A-Z0-9]$/.test(id)) { return { refusals: [r('new_sop_id', 'Code must be 3 to 20 capitals, digits or dashes. Example: BRAZE-CU.')] }; }
    if (sops.some(s => s.sop_id === id)) { return { refusals: [r('new_sop_id', 'Code ' + id + ' is already on the list.')] }; }
    const refusals = [];
    if (empty(ns.title)) { refusals.push(r('title', 'Name is empty.')); }
    if (empty(ns.product)) { refusals.push(r('product', 'Product is empty.')); }
    if (refusals.length) { return { refusals: refusals }; }
    return { sop: { sop_id: id, sop_type: 'Process', short: id.replace(/-/g, ''), level: 'Process', product: String(ns.product).trim(), title: String(ns.title).trim(), status: 'Listed',
      current_rev: null, who_does_it: null, input_from: null, output_to: null, output_serial_tracked: false, edited_in: 'Builder' }, before: null, isNew: true };
  }

  /* sopBlank({ sop_id, new_sop, tables: { sops }, ctx }) → { sop, new_sop, revision, rh_row, history, report } or { refusals }:
     Rev 01 Draft with no sections and no steps, started in the Builder (example_new_sop.md parts 4 and 5, Samrat 2026-11-12, answer 2d).
     The status stays (Listed turns Built with the first saved step). ctx needs next_rh_id. */
  function sopBlank(input) {
    const ctx = input.ctx;
    E.checkCtx(ctx, 'sopBlank');
    if (!Number.isInteger(ctx.next_rh_id)) { fail('sopBlank', 'ctx.next_rh_id is missing'); }
    const pick = pickSop(input, 'sopBlank');
    if (pick.refusals) { return pick; }
    if (empty(ctx.reason)) { return { refusals: [r('reason', 'Reason for change is empty.')] }; }
    const sop = pick.sop, before = pick.before, isNew = pick.isNew;
    const rev = 'Rev 01', today = String(ctx.now).slice(0, 10);
    const kept = isNew ? [] : [['title', 'title'], ['level', 'level'], ['product', 'product'], ['who_does_it', 'who does it'], ['input_from', 'input from'], ['output_to', 'output to']]
      .filter(f => !empty(before[f[0]])).map(f => f[1]);
    const report = 'Started blank ' + today + ' by ' + ctx.who + ': Rev 01 with no sections and no steps.' +
      (isNew ? (sop.sop_type === 'Process' ? ' New Process SOP ' + sop.sop_id + ' (' + sop.title + ') from the form.' : ' New SOP ID ' + sop.sop_id + ' from the form.')
        : (kept.length ? ' Kept from the SOP list: ' + kept.join(', ') + '.' : ''));
    const revision = {};
    for (const f of TYPESX.tables.sop_revisions.fields.map(x => x.name)) { revision[f] = null; }
    Object.assign(revision, { sop_id: sop.sop_id, rev: rev, status: 'Draft', rev_date: today, est_min_total: null, prepared_by: ctx.who, revision_note: report });
    const summary = 'Rev 01 started blank in the Builder: no sections, no steps.';
    const rh = { rh_id: ctx.next_rh_id, sop_id: sop.sop_id, rev: rev, date: today, what_changed: summary, changed_by: ctx.who, approved_by: R.TO_SIGN };
    sop.current_rev = rev; sop.edited_in = 'Builder';
    const H = (table, rowId, rev2, old, nw, fields, after) => E.historyRows({ table: table, row_id: rowId, sop_id: sop.sop_id, rev: rev2, old: old, new: nw, fields: fields, ctx: ctx, after: after });
    let hist = H('sop_revisions', sop.sop_id + ' ' + rev, rev, { row: null }, { row: 'added: Rev 01 (started blank)' }, ['row'], []);
    hist = isNew ? H('sops', sop.sop_id, null, { row: null }, { row: 'added: ' + sop.sop_id + ' ' + sop.title }, ['row'], hist) : H('sops', sop.sop_id, null, before, sop, ['current_rev', 'edited_in'], hist);
    hist = H('revision_history', String(rh.rh_id), rev, { row: null }, { row: 'added: ' + summary }, ['row'], hist);
    return { sop: sop, new_sop: isNew, revision: revision, rh_row: rh, history: hist, report: report };
  }

  return { chartGroups, chartPlan, sopFromChart, sopBlank };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_KICK;
