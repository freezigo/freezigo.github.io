/* SOP Builder floor copy: one printable HTML page from the floor view
   (skill: Floor copy; example.md part 11). English line, Gujarati line
   under it; warnings in boxes before the step; HOLD marks; tick boxes;
   the record sheet last. HTML from data only. Classic script (global
   RENDER_FLOOR). */
const RENDER_FLOOR = (function () {
  const esc = RENDER.esc;
  const show = v => (v === null || v === undefined || v === '') ? '' : esc(v);
  const CSS = 'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;margin:0;padding:12mm 14mm}' +
    'h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:14px 0 6px;border-bottom:2px solid #000;padding-bottom:2px;page-break-after:avoid}' +
    'table{border-collapse:collapse;width:100%;margin:4px 0}th,td{border:1px solid #000;padding:3px 5px;vertical-align:top;text-align:left;font-size:11px}' +
    'table.kv td:first-child{font-weight:bold;width:150px}.gu{color:#1a3d7c;font-size:12px}.gu.empty{color:#888;font-style:italic}' +
    '.stepwrap{page-break-inside:avoid}.step{display:flex;gap:8px;margin:6px 0;border-bottom:1px dotted #999;padding-bottom:4px}' +
    '.step .no{width:46px;font-weight:bold;flex:none}.step .body{flex:1}.step .box{width:22px;height:22px;border:2px solid #000;flex:none}' +
    '.step .reading{width:150px;flex:none;font-weight:bold}.warn{border:2px solid #000;background:#eee;padding:4px 8px;margin:6px 0 2px;font-weight:bold;page-break-inside:avoid}' +
    '.hold{background:#000;color:#fff;padding:1px 6px;font-weight:bold;margin-left:6px}.skip{font-style:italic}.line{margin:2px 0}' +
    '.pic{margin:4px 0}.pic img{max-height:120px;max-width:200px;border:1px solid #666;margin-right:6px;vertical-align:top}.muted{color:#555}' +
    '.record{page-break-before:always}.no-print{margin-bottom:10px}@media print{.no-print{display:none}}' +
    '.flow-pic{display:block;max-height:240mm;margin:4px 0}';

  function pictureHtml(ids, photo, pictures, urls) {
    let h = '';
    for (const id of ids) {
      const p = pictures.find(x => x.picture_id === id);
      h += p && urls[p.file] ? '<img src="' + esc(urls[p.file]) + '" alt="' + esc(id) + '"> ' : '<span class="muted">[' + esc(id) + ']</span> ';
    }
    if (photo) { h += urls[photo] ? '<img src="' + esc(urls[photo]) + '" alt="' + esc(photo) + '"> ' : '<span class="muted">[photo ' + esc(photo) + ']</span> '; }
    return h ? '<div class="pic">' + h + '</div>' : '';
  }

  function stepHtml(st, pictures, urls) {
    let h = '<div class="stepwrap">';
    if (st.warning) { h += '<div class="warn">⚠ ' + esc(st.warning) + '</div>'; }
    h += '<div class="step"><div class="no">' + esc(st.step_no) + (st.hold ? '<br><span class="hold">HOLD ' + esc(st.hold) + '</span>' : '') + (st.repeat ? '<br>× ' + esc(st.repeat) : '') + '</div><div class="body">';
    if (st.skip_line) { h += '<div class="skip">' + esc(st.skip_line) + '</div>'; }
    for (const a of st.action_lines) { h += '<div><b>' + esc(a) + '</b></div>'; }
    /* no Gujarati line: English only (Samrat 2026-11-12, build 28) */
    h += st.action_gu ? '<div class="gu">' + esc(st.action_gu) + '</div>' : '';
    for (const l of st.lines) { h += '<div class="line">' + esc(l) + '</div>'; }
    h += pictureHtml(st.picture_ids, st.photo, pictures, urls);
    h += '</div><div class="reading">' + (st.reading ? 'Reading: ' + esc(st.reading) : '') + '</div><div class="box"></div></div>';
    return h + '</div>';
  }

  /* wrap(text, n): words into lines of at most n characters (a long word stands alone) */
  function wrap(text, n) {
    const out = [];
    let line = '';
    for (const w of String(text).split(' ')) { if (line && (line + ' ' + w).length > n) { out.push(line); line = w; } else { line = line ? line + ' ' + w : w; } }
    if (line) { out.push(line); }
    return out;
  }
  /* flowPicture(flow): the section chart on page 1 (example_flow.md part 12): boxes with number and name (the Input
     and Output boxes with their text), the hold band in black, the arrows with their labels; drawn at page width.
     flow = ENGINE_CHART.flowView({ ..., compact: true }) */
  function flowPicture(flow) {
    if (!flow || flow.layout.error || !flow.has_needs) { return ''; }
    const L = flow.layout;
    let h = '<h2>Process flow</h2><svg class="flow-pic" viewBox="0 0 ' + (L.width + 4) + ' ' + (L.height + 4) + '" width="100%" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><marker id="phead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#000"></path></marker></defs>';
    for (const a of L.arrows) {
      const g = L.graph.arrows.find(x => x.id === a.id) || {};
      h += '<line x1="' + a.x1 + '" y1="' + a.y1 + '" x2="' + a.x2 + '" y2="' + a.y2 + '" stroke="#000" stroke-width="1.5"' + (g.style === 'dashed' ? ' stroke-dasharray="6 4"' : '') + ' marker-end="url(#phead)"></line>';
      if (g.label) { h += '<text x="' + a.lx + '" y="' + a.ly + '" font-size="11">' + esc(g.label) + '</text>'; }
    }
    for (const b of L.graph.boxes) {
      const p = L.boxes[b.id];
      h += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" fill="' + (b.kind === 'input' ? '#ddd' : '#fff') + '" stroke="#000"' + (b.kind === 'io' ? ' stroke-dasharray="3 3"' : '') + '></rect>';
      if (b.band === 'red') { h += '<rect x="' + p.x + '" y="' + p.y + '" width="8" height="' + p.h + '" fill="#000"></rect>'; }
      const io = b.kind === 'io';
      const lines = io ? wrap(b.lines.slice(0, 2).map(l => l.t).join(': '), 34).slice(0, 5) : wrap(b.lines[0].t, 24).slice(0, 3);
      lines.forEach((t, i) => { h += '<text x="' + (p.x + 12) + '" y="' + (p.y + (io ? 16 : 18) + i * (io ? 13 : 15)) + '" font-size="' + (io ? 10 : 12) + '"' + (i === 0 && !io ? ' font-weight="bold"' : '') + '>' + esc(t) + '</text>'; });
    }
    return h + '</svg>';
  }

  /* page(v, urls, flow, opts): v = ENGINE.floorView(...); urls = { file or photo name: data URL }; flow = ENGINE_CHART.flowView(...) or null;
     opts (build 50, example_rights.md part 9) = { title: the final PDF name (Chrome's Save as PDF fills it in), auto_print: the print
     window opens when the page is loaded } */
  function page(v, urls, flow, opts) {
    const sop = v.sop, rev = v.rev, o = opts || {};
    let h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + (o.title ? esc(o.title) : esc(sop.sop_id) + ' ' + esc(rev.rev) + (v.copy_band ? ' copy for review' : ' floor copy')) + '</title><style>' + CSS + '</style>' +
      (o.auto_print ? '<script>(function () { var go = function () { setTimeout(function () { window.print(); }, 400); }; if (document.readyState === "complete") { go(); } else { window.addEventListener("load", go); } })();</script>' : '') +
      '</head><body>';
    h += '<div class="no-print"><button onclick="window.print()">Print / Save as PDF</button> <span class="muted">Floor copy made by the SOP Builder from the data on ' + esc(v.made_on) + '</span></div>';
    /* build 39: a copy prints for review only */
    h += v.copy_band ? '<div class="warn copy-band">' + esc(v.copy_band) + '</div>' : '';
    h += '<h1>' + esc(sop.sop_id) + ' ' + esc(rev.rev) + ' <span class="muted">' + esc(rev.status) + '</span></h1><div><b>' + esc(sop.title) + '</b></div>';
    h += '<table class="kv"><tr><td>Product</td><td>' + show(sop.product) + ' (' + esc(sop.level) + ')</td></tr><tr><td>Revision date</td><td>' + show(rev.rev_date) + '</td></tr>' +
      '<tr><td>Prepared by</td><td>' + show(rev.prepared_by) + '</td></tr><tr><td>Checked by</td><td>' + show(rev.checked_by) + ' ' + show(rev.checked_date) + '</td></tr>' +
      '<tr><td>Approved by</td><td>' + show(rev.approved_by) + ' ' + show(rev.approved_date) + '</td></tr><tr><td>Purpose</td><td>' + show(rev.purpose) + '</td></tr>' +
      '<tr><td>Scope</td><td>' + show(rev.scope) + '</td></tr><tr><td>Reference drawings</td><td>' + show(rev.reference_drawings) + '</td></tr>' +
      '<tr><td>Who does it</td><td>' + show(sop.who_does_it) + '</td></tr><tr><td>Input from</td><td>' + show(sop.input_from) + '</td></tr><tr><td>Output to</td><td>' + show(sop.output_to) + '</td></tr>' +
      '<tr><td>Hold points</td><td>' + show(rev.hold_points) + '</td></tr><tr><td>Set-up rule</td><td>' + show(rev.setup_rule) + '</td></tr><tr><td>How to use</td><td>' + show(rev.how_to_use) + '</td></tr>' +
      '<tr><td>Process flow</td><td>' + show(rev.process_flow) + '</td></tr></table>';
    h += flowPicture(flow);
    h += '<h2>Revision history</h2><table><tr><th>Rev</th><th>Date</th><th>What changed</th><th>Changed by</th><th>Approved by</th></tr>';
    for (const r of v.revision_history) { h += '<tr><td>' + esc(r.rev) + '</td><td>' + esc(r.date) + '</td><td>' + esc(r.what_changed) + '</td><td>' + esc(r.changed_by) + '</td><td>' + esc(r.approved_by) + '</td></tr>'; }
    h += '</table>';
    h += '<h2>1. Safety and PPE</h2><table><tr><th>No.</th><th>Item</th><th>Who</th><th>Used at</th><th>Status</th></tr>';
    for (const x of v.safety_items) { h += '<tr><td>' + esc(x.no) + '</td><td>' + esc(x.item) + '</td><td>' + esc(x.who) + '</td><td>' + esc(x.used_at) + '</td><td>' + esc(x.status) + '</td></tr>'; }
    h += '</table><h2>2. Materials, tools and machines</h2><table><tr><th>Sr</th><th>Material</th><th>Qty</th><th>Used at</th><th>Status</th></tr>';
    for (const x of v.materials) { h += '<tr><td>' + esc(x.sr) + '</td><td>' + esc(x.material) + '</td><td>' + esc(x.qty) + '</td><td>' + esc(x.used_at) + '</td><td>' + esc(x.status) + '</td></tr>'; }
    h += '</table><table><tr><th>No.</th><th>Tool or machine</th><th>Type</th><th>Used at</th></tr>';
    for (const x of v.tools) { h += '<tr><td>' + esc(x.no) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.type) + '</td><td>' + esc(x.used_at) + '</td></tr>'; }
    h += '</table>';
    for (const sec of v.sections) {
      h += '<h2>' + esc(sec.section) + '. ' + esc(sec.name) + ' <span class="muted">' + esc(sop.sop_id) + ' ' + esc(rev.rev) + (v.copy_band ? ' · COPY, for review only' : '') + '</span></h2>';
      h += sec.name_gu ? '<div class="gu">' + esc(sec.name_gu) + '</div>' : '';
      h += '<div class="line"><b>Needs:</b> ' + show(sec.needs_note) + ' &nbsp; <b>Restart:</b> ' + show(sec.restart_step) + ' &nbsp; <b>Ends with:</b> ' + show(sec.ends_with) + '</div>';
      for (const st of sec.steps) { h += stepHtml(st, v.pictures, urls); }
    }
    h += '<div class="record"><h2>Record sheet <span class="muted">one per unit</span></h2><div class="line"><b>Serial no.</b> ______________ &nbsp; <b>Date</b> ______________</div>' +
      '<table><tr><th>Sec</th><th>Steps</th><th>Signed by</th><th>Readings and signs</th></tr>';
    for (const r of v.record_sheet.rows) { h += '<tr><td>' + esc(r.section) + '</td><td>' + esc(r.step_nos.join(', ')) + '</td><td>' + esc(r.signed_by) + '</td><td>' + r.items.map(i => esc(i.label)).join('<br>') + '</td></tr>'; }
    h += '</table><div class="line">' + esc(v.record_sheet.handover) + '</div></div>';
    return h + '</body></html>';
  }

  return { page, stepHtml, flowPicture, wrap };
})();
