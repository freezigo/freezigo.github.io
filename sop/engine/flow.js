/* SOP Builder logic pieces for the charts (example_flow.md parts 4, 6, 8
   and 11): setupSection, sectionGraph (chart B: the detailed section
   boxes, the Input and Output boxes, the Needs arrows), layoutGraph
   (positions with variable box heights, or the compact floor layout),
   stepGraph and layoutSteps (chart C: the steps of one section with their
   reference arrows), loopOf, noteLayout. Pure. Classic script (global
   ENGINE_FLOW); module in Node. Answer key: tests/golden5.js. */
const ENGINE_FLOW = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const L = (typeof ENGINE_LINKS !== 'undefined') ? ENGINE_LINKS : require('./links.js');
  const FA = (typeof ENGINE_FACTS !== 'undefined') ? ENGINE_FACTS : require('./flow_facts.js');
  const given = v => Array.isArray(v) || (v !== null && v !== undefined);
  const list = v => Array.isArray(v) ? v : [];
  const BOX = { w: FA.BOX_W, gap: 20, arrow: 34 }, COMPACT = { w: FA.COMPACT.w, h: FA.COMPACT.h, rank: 130 }, SBOX = { w: 300, h: 46, h1: 30, gap: 14, side: 60, label: 80 };

  /* setupSection(sections) → the one section whose name holds "set-up" or "setup" (case blind), else null */
  function setupSection(sections) {
    const hits = sections.filter(s => /set-?up/i.test(String(s.name || '')));
    return hits.length === 1 ? hits[0].section : null;
  }

  /* loopOf(sections) → null, or the sentence naming a loop in the Needs sections, from its lowest section */
  function loopOf(sections) {
    const needs = {};
    for (const s of sections) { needs[s.section] = list(s.needs_sections).filter(n => n !== s.section); }
    const nums = Object.keys(needs).map(Number).sort((a, b) => a - b);
    for (const start of nums) {
      const path = [start];
      const found = (function walk(n) {
        for (const m of (needs[n] || []).slice().sort((a, b) => a - b)) {
          if (m === start) { return true; }
          if (m < start || path.indexOf(m) >= 0 || !needs[m]) { continue; }
          path.push(m);
          if (walk(m)) { return true; }
          path.pop();
        }
        return false;
      })(start);
      if (found) {
        const parts = path.map((n, i) => n + ' needs ' + (i + 1 < path.length ? path[i + 1] : start));
        const text = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
        return 'Section ' + text + ': a loop.';
      }
    }
    return null;
  }

  /* sectionGraph(sections, steps, vnRows, sop, boxMode) → { boxes, arrows } or { error }; a box = { id, kind, lines: [{ k, t }], band, ref };
     boxMode 'full' (the default) or 'short' (part 16.2) */
  function sectionGraph(sections, steps, vnRows, sop, boxMode) {
    const secs = sections.slice().sort((a, b) => a.section - b.section);
    const loop = loopOf(secs);
    if (loop) { return { error: loop }; }
    const counts = secs.length || steps.length ? L.vnCounts(vnRows, steps, secs, (secs[0] || steps[0]).sop_id).by_section : {};
    const setup = setupSection(secs);
    const nums = secs.map(s => s.section);
    const boxes = [], arrows = [], inputs = [];
    for (const s of secs) {
      const st = steps.filter(x => x.section === s.section);
      const holds = st.some(x => x.step_type === 'Hold'), readings = st.some(x => x.step_type === 'Reading');
      const sameShift = s.needs_setup === true && (setup === null || setup === s.section);
      boxes.push({ id: String(s.section), kind: 'section', lines: FA.sectionLines(s, st, (counts[s.section] || {}).open || 0, sameShift, boxMode),
        band: holds ? 'red' : (readings ? 'blue' : null), ref: s.source_ref === undefined ? null : s.source_ref });
      for (const sopId of list(s.needs_sops).slice().sort()) {
        if (inputs.indexOf(sopId) < 0) { inputs.push(sopId); }
        arrows.push({ id: sopId + '>' + s.section, from: sopId, to: String(s.section), style: 'solid', label: null, needs: true });
      }
      for (const m of list(s.needs_sections).slice().sort((a, b) => a - b)) {
        if (nums.indexOf(m) < 0) { continue; }
        const dashed = s.needs_setup === true && setup === m;
        const label = dashed ? 'same shift' : (s.wait_after === m && s.wait_min !== null && s.wait_min !== undefined ? s.wait_min + ' min after' : null);
        arrows.push({ id: m + '>' + s.section, from: String(m), to: String(s.section), style: dashed ? 'dashed' : 'solid', label: label, needs: true });
      }
      if (s.needs_setup === true && setup !== null && setup !== s.section && list(s.needs_sections).indexOf(setup) < 0) {
        arrows.push({ id: setup + '>' + s.section, from: String(setup), to: String(s.section), style: 'dashed', label: 'same shift', needs: false });
      }
    }
    for (const sopId of inputs.sort()) { boxes.push({ id: sopId, kind: 'input', lines: [{ k: 'name', t: sopId }], band: null, ref: null }); }
    const io = FA.ioBoxes(sop || {}, secs, boxMode);
    if (io.input) {
      boxes.push(io.input);
      if (secs.length) { arrows.unshift({ id: 'input>' + secs[0].section, from: 'input', to: String(secs[0].section), style: 'solid', label: null, needs: false }); }
    }
    if (io.output) {
      boxes.push(io.output);
      for (const n of io.sinks) { arrows.push({ id: n + '>output', from: String(n), to: 'output', style: 'solid', label: null, needs: false }); }
    }
    return { boxes: boxes, arrows: arrows };
  }

  /* layoutGraph(sections, steps, vnRows, sop, opts) → { width, height, boxes: { id: { x, y, w, h, rank } }, arrows, graph } or { error };
     opts.compact = the floor page layout (every box 220 × 96, ranks 130 apart); opts.boxes = 'short' for the Short boxes (part 16.2) */
  function layoutGraph(sections, steps, vnRows, sop, opts) {
    const compact = !!(opts && opts.compact);
    const g = sectionGraph(sections, steps, vnRows, sop, compact ? 'full' : (opts && opts.boxes === 'short' ? 'short' : 'full'));
    if (g.error) { return { error: g.error }; }
    const secs = sections.slice().sort((a, b) => a.section - b.section);
    const bySec = {};
    for (const s of secs) { bySec[s.section] = s; }
    const rank = {}, busy = {};
    function rankOf(n, i) {
      if (rank[n] !== undefined) { return rank[n]; }
      if (busy[n]) { return 1; }
      busy[n] = true;
      const s = bySec[n];
      let r;
      if (!given(s.needs_sections) && !given(s.needs_sops)) {
        r = i > 0 ? rankOf(secs[i - 1].section, i - 1) + 1 : 1;
      } else {
        r = 1;
        for (const m of list(s.needs_sections)) { if (bySec[m]) { r = Math.max(r, rankOf(m, secs.indexOf(bySec[m])) + 1); } }
      }
      busy[n] = false;
      rank[n] = r;
      return r;
    }
    secs.forEach((s, i) => rankOf(s.section, i));
    let last = 0;
    for (const n in rank) { last = Math.max(last, rank[n]); }
    const ranks = {};
    for (const b of g.boxes) { ranks[b.id] = b.kind === 'section' ? rank[Number(b.id)] : (b.id === 'output' ? last + 1 : 0); }
    const all = Object.keys(ranks).map(k => ranks[k]);
    const top = all.length ? Math.min.apply(null, all) : 0;
    const rows = {};
    for (const b of g.boxes) { (rows[ranks[b.id]] = rows[ranks[b.id]] || []).push(b); }
    const w = compact ? COMPACT.w : BOX.w;
    const heights = {};
    for (const b of g.boxes) { heights[b.id] = FA.boxHeight(b.lines, compact); }
    let width = w;
    for (const r in rows) { width = Math.max(width, rows[r].length * w + (rows[r].length - 1) * BOX.gap); }
    const order = (a, b) => {
      if (a.kind === b.kind) { return a.kind === 'section' ? Number(a.id) - Number(b.id) : (a.id < b.id ? -1 : 1); }
      return a.kind === 'section' ? -1 : (b.kind === 'section' ? 1 : (a.kind === 'input' ? -1 : 1));
    };
    const out = {};
    let y = 0;
    const rankList = Object.keys(rows).map(Number).sort((a, b) => a - b);
    for (const r of rankList) {
      const row = rows[r].slice().sort(order);
      const rowW = row.length * w + (row.length - 1) * BOX.gap;
      const tallest = Math.max.apply(null, row.map(b => heights[b.id]));
      row.forEach((b, i) => { out[b.id] = { x: (width - rowW) / 2 + i * (w + BOX.gap), y: compact ? (r - top) * COMPACT.rank : y, w: w, h: heights[b.id], rank: r }; });
      y += tallest + BOX.arrow;
    }
    const arrows = g.arrows.map(function (a) {
      const f = out[a.from], t = out[a.to];
      const x1 = f.x + w / 2, y1 = f.y + f.h, x2 = t.x + w / 2, y2 = t.y;
      return { id: a.id, x1: x1, y1: y1, x2: x2, y2: y2, lx: (x1 + x2) / 2 + 6, ly: (y1 + y2) / 2 };
    });
    let height = 0;
    for (const id in out) { height = Math.max(height, out[id].y + out[id].h); }
    return { width: width, height: height, boxes: out, arrows: arrows, graph: g };
  }

  const tokens = FA.stepTokens;

  /* stepGraph(sectionSteps) → { boxes, chain, refs } */
  function stepGraph(sectionSteps) {
    const st = sectionSteps.slice().sort((a, b) => a.seq - b.seq);
    const byNo = {}, pos = {};
    st.forEach((s, i) => { byNo[s.step_no] = s; pos[s.key] = i; });
    const boxes = st.map(function (s) {
      const n = T.parts(s.action).length;
      return { id: s.key, step_no: s.step_no, line1: s.step_no + ' ' + T.firstPart(s.action) + (n > 1 ? ' (+' + (n - 1) + ' parts)' : ''),
        line2: FA.stepLine2(s) || FA.linkText(s) || '', icons: FA.stepIcons(s), link: FA.linkText(s),
        band: s.step_type === 'Hold' ? 'red' : (s.step_type === 'Reading' ? 'blue' : null) };
    });
    const chain = [];
    for (let i = 0; i + 1 < st.length; i++) { chain.push({ from: st[i].key, to: st[i + 1].key }); }
    const found = {};
    for (const s of st) {
      for (const f of [['skip_if', 'Skip if'], ['if_fail', 'If fail'], ['check', 'Check']]) {
        for (const t of tokens(s[f[0]])) {
          const to = byNo[t];
          if (!to || to.key === s.key) { continue; }
          const k = s.key + '>' + to.key;
          found[k] = found[k] || { from: s.key, to: to.key, labels: [] };
          if (found[k].labels.indexOf(f[1]) < 0) { found[k].labels.push(f[1]); }
        }
      }
    }
    const refs = Object.keys(found).map(k => found[k]).sort((a, b) => pos[a.from] - pos[b.from] || pos[a.to] - pos[b.to])
      .map(r => ({ from: r.from, to: r.to, label: r.labels.join(', ') }));
    return { boxes: boxes, chain: chain, refs: refs };
  }

  /* layoutSteps(sectionSteps) → { width, height, boxes, chain, refs, graph } */
  function layoutSteps(sectionSteps) {
    const g = stepGraph(sectionSteps);
    /* a box is 46 px tall with two lines, 30 px when line 2 is empty (part 16.1) */
    const boxes = {};
    let y = 0;
    g.boxes.forEach(function (b) { const h = b.line2 === '' ? SBOX.h1 : SBOX.h; boxes[b.id] = { x: 0, y: y, w: SBOX.w, h: h }; y += h + SBOX.gap; });
    const chain = g.chain.map(a => ({ from: a.from, to: a.to, x1: SBOX.w / 2, y1: boxes[a.from].y + boxes[a.from].h, x2: SBOX.w / 2, y2: boxes[a.to].y }));
    /* two reference arrows between the same two steps (9.6 → 9.7 If fail, 9.7 → 9.6 Skip if) would lie on one curve:
       the second passes 20 px further right and its label sits 12 px lower */
    const seen = {};
    let deepest = 0;
    const refs = g.refs.map(function (r) {
      const y1 = boxes[r.from].y + boxes[r.from].h / 2, y2 = boxes[r.to].y + boxes[r.to].h / 2;
      const pair = Math.min(y1, y2) + ':' + Math.max(y1, y2);
      const k = seen[pair] = (seen[pair] || 0) + 1;
      deepest = Math.max(deepest, k - 1);
      return { from: r.from, to: r.to, x1: SBOX.w, y1: y1, mx: SBOX.w + SBOX.side + 20 * (k - 1), my: (y1 + y2) / 2, ly: (y1 + y2) / 2 + 12 * (k - 1), x2: SBOX.w, y2: y2, label: r.label };
    });
    const n = g.boxes.length;
    return { width: SBOX.w + (refs.length ? SBOX.side + SBOX.label + 20 * deepest : 0), height: n ? y - SBOX.gap : 0, boxes: boxes, chain: chain, refs: refs, graph: g };
  }

  /* noteLayout(layout, notes, minimised) → { notes: { note_id: { x, y, w, h, ax, ay, min } }, width, height } (parts 14 and 18.3):
     a note pinned to a box sits at the box's top-right corner (ax, ay) + its x, y; with x, y empty it takes the automatic
     place 10 px right of the box (notes on one box stack 70 px apart); a note on an arrow sits at the arrow's label point
     + its x, y (empty: 8 px right); a free note at its own x, y (anchor 0, 0). A place above or left of the chart is cut
     to 0. minimised = the note ids folded into tags (24 × 16): 4 px right of the box's corner, 18 px apart (the box's
     automatic notes then start 28 px further right), 8 px right of an arrow's label point, a free tag at its x, y.
     A note is 170 × 64; the chart grows to hold them. A Deleted note, a note whose box or arrow is not on the chart,
     or a free note with no place, is left out. */
  const NOTE = { w: 170, h: 64, gap: 10, stack: 70, arrow: 8 }, TAG = { w: 24, h: 16, gap: 4, stack: 18, shift: 28 };
  function noteLayout(layout, notes, minimised) {
    const out = {}, onBox = {}, tagsOn = {};
    const mini = Array.isArray(minimised) ? minimised : [];
    let width = layout.width, height = layout.height;
    const live = notes.filter(n => n.status !== 'Deleted').sort((a, b) => a.note_id - b.note_id);
    const placed = n => n.x !== null && n.x !== undefined && n.y !== null && n.y !== undefined;
    const arrowOf = n => (layout.arrows || []).find(x => x.id === n.pin_ref || (x.from + '>' + x.to) === n.pin_ref);
    for (const n of live) { if (n.pin === 'box' && layout.boxes[n.pin_ref] && mini.indexOf(n.note_id) >= 0) { tagsOn[n.pin_ref] = (tagsOn[n.pin_ref] || 0) + 1; } }
    const tagCount = {};
    for (const n of live) {
      const min = mini.indexOf(n.note_id) >= 0;
      let p = null, a = null;
      if (n.pin === 'box' && layout.boxes[n.pin_ref]) {
        const b = layout.boxes[n.pin_ref];
        a = { x: b.x + b.w, y: b.y };
        if (min) {
          const k = tagCount[n.pin_ref] = (tagCount[n.pin_ref] || 0) + 1;
          p = { x: a.x + TAG.gap, y: a.y + (k - 1) * TAG.stack };
        } else if (placed(n)) {
          p = { x: a.x + n.x, y: a.y + n.y };
        } else {
          const i = onBox[n.pin_ref] = (onBox[n.pin_ref] || 0) + 1;
          p = { x: a.x + NOTE.gap + (tagsOn[n.pin_ref] ? TAG.shift : 0), y: a.y + (i - 1) * NOTE.stack };
        }
      } else if (n.pin === 'arrow') {
        const ar = arrowOf(n);
        if (ar) {
          a = { x: ar.lx !== undefined ? ar.lx : ar.mx, y: ar.ly !== undefined ? ar.ly : ar.my };
          p = (placed(n) && !min) ? { x: a.x + n.x, y: a.y + n.y } : { x: a.x + NOTE.arrow, y: a.y };
        }
      } else if (n.pin === 'free' && placed(n)) {
        a = { x: 0, y: 0 };
        p = { x: n.x, y: n.y };
      }
      if (!p) { continue; }
      const w = min ? TAG.w : NOTE.w, h = min ? TAG.h : NOTE.h;
      const x = Math.max(0, p.x), y = Math.max(0, p.y);
      out[n.note_id] = { x: x, y: y, w: w, h: h, ax: a.x, ay: a.y, min: min };
      width = Math.max(width, x + w); height = Math.max(height, y + h);
    }
    return { notes: out, width: width, height: height };
  }

  return { setupSection, loopOf, sectionGraph, layoutGraph, stepGraph, layoutSteps, noteLayout };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_FLOW;
