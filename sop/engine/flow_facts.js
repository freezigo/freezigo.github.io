/* SOP Builder logic pieces for what a chart box says (example_flow.md
   part 4, Samrat 2026-11-07: a detailed chart as the Planner's; part 16,
   2026-11-12: icons, Short boxes, number tiles, Before you start): the
   box lines made from the steps and the section row (Full or Short), the
   Input and Output boxes made from the SOP header, the box height, the
   icons of a step and a section, line 2 of a step box, the numbers of the
   tiles and the cards of sections 1 and 2. Pure. Classic script (global
   ENGINE_FACTS); module in Node. Answer key: tests/golden5.js (FC, IO,
   IC, SH, IS, FS, BS cases). */
const ENGINE_FACTS = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const empty = T.empty;
  const list = v => Array.isArray(v) ? v : [];
  const LINE = 15, PAD = 8, MIN_LINES = 3, COMPACT = { w: 220, h: 96 }, W = 260;
  /* the text of a box wraps by words inside 236 px (260 less the band, border and padding, and 2 % to spare) at the
     chart's font, Arial 11.5 px; the name line is bold (about 10 % wider). Arial widths in 1/1000 em. */
  const TEXT_W = 236, FONT = 11.5, BOLD = 1.1;
  const EM = (function () {
    const w = {};
    const set = (chars, n) => { for (const ch of chars) { w[ch] = n; } };
    set('0123456789abdeghnopqu_$#?L', 556); set('cksvxyzJ', 500); set('fjt./,:;!\'[] ·Iil', 278); set('ilj', 222); set('rT-()', 333);
    set('mM', 833); set('w', 722); set('ABEKPSVXY', 667); set('CDHNRU', 722); set('FTZ', 611); set('GOQ', 778); set('W', 944);
    set('=+×<>', 584); set('%', 889); set('&', 667); set('"', 355); set("'", 191); set('°', 400); set('±', 584); set('→…', 1000);
    return w;
  })();
  const widthOf = (text, bold) => { let n = 0; for (const ch of String(text)) { n += EM[ch] === undefined ? 600 : EM[ch]; } return n / 1000 * FONT * (bold ? BOLD : 1); };
  /* wrapCount(text, bold) → how many lines the text takes in a box (greedy by words; a word wider than a line breaks) */
  function wrapCount(text, bold) {
    const words = String(text).split(' '), space = widthOf(' ', bold);
    let lines = 1, used = 0;
    for (const word of words) {
      const ww = widthOf(word, bold);
      if (used > 0 && used + space + ww > TEXT_W) { lines++; used = 0; }
      used += (used > 0 ? space : 0) + ww;
      while (used > TEXT_W) { lines++; used -= TEXT_W; }
    }
    return lines;
  }
  const READINGS_SHOWN = 4, NOTE_CUT = 60, TEXT_CUT = 100, SHORT_TEXT_CUT = 60, ENDS_CUT = 60, COND_CUT = 40;
  function cut(text, n) { const s = String(text); return s.length > n ? s.slice(0, n).replace(/\s+$/, '') + '…' : s; }
  const isStep = no => String(no).split('.').length === 2;
  const line = (k, t) => ({ k: k, t: t });

  /* stepTokens(text) → step tokens (9.6, 9.5.1) not inside a longer number (the part 8 rule) */
  function tokens(text) {
    const out = [];
    if (empty(text)) { return out; }
    const s = String(text), re = /\d+(?:\.\d+)+/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const b = s.charAt(m.index - 1), a = s.charAt(m.index + m[0].length), a2 = s.charAt(m.index + m[0].length + 1);
      if (/[\d.]/.test(b) || /\d/.test(a) || (a === '.' && /\d/.test(a2))) { continue; }
      out.push(m[0]);
    }
    return out;
  }

  /* stepMentions(text) → [{ tok, at, value_like }] (build 40, example_renumber.md part 6): the step tokens of two or three parts, each
     with its place and whether it reads as a value: a unit after it (1.5 mm, 3.5 bar, 2.5 min), a size before it (35 × 1.5) or a
     revision (Rev 1.2). A value is never taken for a step number. */
  const UNIT = /^\s?(mm|cm|m|km|bar|mbar|psi|kg|kgf|g|min|mins|sec|h|hr|hrs|°C|°|%|V|kV|W|kW|Nm|L|l|ml|Hz|rpm|inch|in)(?![A-Za-z0-9])/;
  function stepMentions(text) {
    const out = [];
    if (empty(text)) { return out; }
    const s = String(text), re = /\d+(?:\.\d+)+/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const b = s.charAt(m.index - 1), a = s.charAt(m.index + m[0].length), a2 = s.charAt(m.index + m[0].length + 1);
      if (/[\d.]/.test(b) || /\d/.test(a) || (a === '.' && /\d/.test(a2))) { continue; }
      const parts = m[0].split('.').length;
      if (parts > 3) { continue; }
      const before = s.slice(0, m.index), after = s.slice(m.index + m[0].length);
      const value = UNIT.test(after) || /[×*Ø±]\s?$/.test(before) || /(?:^|[\s\d])[xX]\s?$/.test(before) || /\b[Rr]ev\.?\s?$/.test(before);
      out.push({ tok: m[0], at: m.index, value_like: value });
    }
    return out;
  }

  /* skipCondition(text) → the Skip if text without "Skip if ", cut before the first " (", without the final full stop, at most 40 characters */
  function skipCondition(text) {
    let s = String(text).trim().replace(/^skip\s+if\s+/i, '');
    const p = s.indexOf(' (');
    if (p > 0) { s = s.slice(0, p); }
    return cut(s.replace(/[.\s]+$/, ''), COND_CUT);
  }
  /* endsText(text) → the Ends with text without a final bracket group, cut at 60 */
  function endsText(text) { return cut(String(text).trim().replace(/\s*\([^()]*\)\s*$/, ''), ENDS_CUT); }
  /* sopIds(text) → the SOP IDs named (BMC-L0-LASERCUT-02), in order, each once */
  function sopIds(text) {
    const found = String(text || '').match(/\b[A-Z]{2,}-L\d-[A-Z0-9]+-\d{2}\b/g) || [];
    return found.filter((x, i) => found.indexOf(x) === i);
  }

  /* the positions (in sectionSteps) of the other steps of the section a field names, in step order */
  function named(st, i, field) {
    const byNo = {};
    st.forEach((s, j) => { byNo[s.step_no] = j; });
    const out = [];
    for (const tk of tokens(st[i][field])) { if (byNo[tk] !== undefined && byNo[tk] !== i && out.indexOf(byNo[tk]) < 0) { out.push(byNo[tk]); } }
    return out.sort((a, b) => a - b);
  }
  const range = nos => (nos.length === 1 ? nos[0] : nos[0] + ' to ' + nos[nos.length - 1]);
  /* groups(st, targetOf): steps that follow each other with the same target are one group */
  function groups(st, targetOf) {
    const out = [];
    let g = null;
    const flush = () => { if (g) { out.push(g); g = null; } };
    st.forEach(function (s, i) {
      const to = targetOf(s, i);
      if (to === null) { flush(); return; }
      if (g && g.to === to) { g.nos.push(s.step_no); } else { flush(); g = { to: to, nos: [s.step_no] }; }
    });
    flush();
    return out;
  }
  /* sectionRules(sectionSteps) → the rules line entries: skips, fail paths forward, fail paths back */
  function sectionRules(sectionSteps) {
    const st = sectionSteps.slice().sort((a, b) => a.seq - b.seq);
    const out = [];
    for (const g of groups(st, s => (empty(s.skip_if) ? null : skipCondition(s.skip_if)))) { out.push(range(g.nos) + ' skipped if ' + g.to); }
    for (const g of groups(st, (s, i) => { const later = named(st, i, 'if_fail').filter(j => j > i); return later.length ? st[later[0]].step_no : null; })) { out.push(range(g.nos) + ' fail → ' + g.to); }
    for (const g of groups(st, (s, i) => { const earlier = named(st, i, 'if_fail').filter(j => j < i); return earlier.length ? st[earlier[0]].step_no : null; })) { out.push(range(g.nos) + ' fail → back to ' + g.to); }
    return out;
  }
  function readingText(s) {
    switch (s.limit_status) {
      case 'Given': return T.targetText(s);
      case 'Record only': return 'record only';
      case 'Needed': return 'limit needed';
      default: return 'no reading';
    }
  }

  /* ---- icons (part 16.1) ---- */
  const ICONS = ['action', 'reading', 'hold', 'skip', 'photo', 'image', 'link'];
  const ICON_CHAR = { action: '○', reading: '□', hold: '■', skip: '◇', photo: '📷', image: '🖼' };
  /* stepIcons(step) → the type icon, then skip when Skip if is filled, then photo when Photo required is Y, then image (part 18.5)
     when Photo ref names a file or the step names a Picture (step.picture_ids, added by the view; the table has no such field),
     then link (the chain mark, build 30) when the step came from a process SOP */
  function stepIcons(step) {
    const out = [step.step_type === 'Hold' ? 'hold' : (step.step_type === 'Reading' ? 'reading' : 'action')];
    if (!empty(step.skip_if)) { out.push('skip'); }
    if (step.photo_required === true) { out.push('photo'); }
    const has = v => Array.isArray(v) && v.length > 0;
    if (has(step.photo_ref) || has(step.picture_ids)) { out.push('image'); }
    if (!empty(step.link_sop)) { out.push('link'); }
    return out;
  }
  /* linkText(step) → "Standard: BRAZE-CU Rev 01", "Revised from BRAZE-CU Rev 01", or null for a step not from a process SOP */
  function linkText(step) {
    if (!step || empty(step.link_sop)) { return null; }
    return (step.link_mode === 'Standard' ? 'Standard: ' : 'Revised from ') + step.link_sop + ' ' + step.link_rev;
  }
  /* iconCounts(sectionSteps) → [{ icon, n }] over every row (steps and sub-steps), in the ICONS order, n > 0 only */
  function iconCounts(sectionSteps) {
    const n = {};
    for (const s of sectionSteps) { for (const i of stepIcons(s)) { n[i] = (n[i] || 0) + 1; } }
    return ICONS.filter(i => n[i]).map(i => ({ icon: i, n: n[i] }));
  }
  /* stepLine2(step) → line 2 of a chart C box: the hold, the target of a reading, the Skip if of an action, Photo needed, or empty */
  function stepLine2(step) {
    if (step.step_type === 'Hold') { return 'HOLD ' + step.hold + ' · supervisor signs'; }
    if (step.step_type === 'Reading') { return T.targetText(step); }
    if (!empty(step.skip_if)) { return 'Skip if ' + skipCondition(step.skip_if); }
    if (step.photo_required === true) { return 'Photo needed'; }
    return '';
  }

  /* sectionLines(section, sectionSteps, open, sameShift, boxes) → [{ k, t }]; boxes 'full' (the default): name, count, readings,
     rules, ends, est, note (part 4); 'short': name, count, icons, note (part 16.2) */
  function sectionLines(section, sectionSteps, open, sameShift, boxes) {
    const st = sectionSteps.slice().sort((a, b) => a.seq - b.seq);
    const out = [line('name', section.section + ' ' + section.name)];
    const only = st.filter(s => isStep(s.step_no));
    const ends = only.length ? only : st;
    let count = st.length ? ends[0].step_no + ' to ' + ends[ends.length - 1].step_no + ' · ' + SEL.stepCount(st).steps + ' steps' : 'no steps';
    for (const h of st.filter(s => s.step_type === 'Hold')) { count += ' · HOLD ' + h.hold + ' at ' + h.step_no; }
    if (open) { count += ' · ' + open + ' open'; }
    if (sameShift) { count += ' · same shift'; }
    out.push(line('count', count));
    const noteLine = !list(section.needs_sections).length && !list(section.needs_sops).length && !empty(section.needs_note) ? line('note', 'Note: ' + cut(section.needs_note, NOTE_CUT)) : null;
    if (boxes === 'short') {
      const ic = iconCounts(st);
      if (ic.length) { out.push({ k: 'icons', t: ic.map(i => ICON_CHAR[i.icon] + i.n).join(' '), icons: ic }); }
      return noteLine ? out.concat([noteLine]) : out;
    }
    const reads = st.filter(s => s.step_type === 'Reading').map(s => s.step_no + ' ' + readingText(s));
    if (reads.length) { out.push(line('readings', reads.slice(0, READINGS_SHOWN).join(' · ') + (reads.length > READINGS_SHOWN ? ' +' + (reads.length - READINGS_SHOWN) + ' more' : ''))); }
    const rules = sectionRules(st);
    if (rules.length) { out.push(line('rules', rules.join(' · '))); }
    if (!empty(section.ends_with)) { out.push(line('ends', 'Ends: ' + endsText(section.ends_with))); }
    const num = v => (v === null || v === undefined || v === '' ? 'needed' : String(v));
    /* build 69: Skilled and Helper (contract 1.7); neither given: "Crew: needed", so the line stays one line in the box */
    const crew = num(section.skilled) === 'needed' && num(section.helper) === 'needed' ? 'Crew: needed' : 'Skilled: ' + num(section.skilled) + ' · Helper: ' + num(section.helper);
    out.push(line('est', 'Est min: ' + num(section.est_min) + ' · ' + crew));
    if (noteLine) { out.push(noteLine); }
    return out;
  }

  /* boxHeight(lines, compact) → 8 + 15 per text line (the lines wrapped by words at the box's width), at least 3
     lines; compact = 96 */
  function boxHeight(lines, compact) {
    if (compact) { return COMPACT.h; }
    const n = lines.reduce((a, l) => a + (l.k === 'icons' ? 1 : wrapCount(l.t, l.k === 'name')), 0);
    return PAD + LINE * Math.max(MIN_LINES, n);
  }

  /* ioBoxes(sop, sections, boxes) → { input, output, sinks }: the dotted boxes from the SOP header; sinks = the sections that feed the
     Output box; boxes 'short' (part 16.2): the name and the IDs line, or the text cut at 60 when there is no IDs line */
  function ioBoxes(sop, sections, boxes) {
    const secs = sections.slice().sort((a, b) => a.section - b.section);
    const ids = (text, word) => { const found = sopIds(text); return found.length && String(text).trim() !== found.join(', ') ? [line('ids', word + ' ' + found.join(', '))] : []; };
    const box = function (id, name, text, word) {
      const idLine = ids(text, word);
      const lines = boxes === 'short' ? [line('name', name)].concat(idLine.length ? idLine : [line('text', cut(String(text).trim(), SHORT_TEXT_CUT))])
        : [line('name', name), line('text', cut(String(text).trim(), TEXT_CUT))].concat(idLine);
      return { id: id, kind: 'io', lines: lines, band: null, ref: null };
    };
    const anySops = secs.some(s => list(s.needs_sops).length > 0);
    const input = !anySops && !empty(sop.input_from) ? box('input', 'Input', sop.input_from, 'from') : null;
    const output = !empty(sop.output_to) ? box('output', 'Output', sop.output_to, 'to') : null;
    const hasNeeds = secs.some(s => list(s.needs_sections).length > 0 || list(s.needs_sops).length > 0);
    let sinks = [];
    if (secs.length) {
      sinks = hasNeeds ? secs.filter(s => !secs.some(o => list(o.needs_sections).indexOf(s.section) >= 0)).map(s => s.section) : [secs[secs.length - 1].section];
    }
    return { input: input, output: output, sinks: sinks };
  }

  /* ---- the tiles and the cards of sections 1 and 2 (parts 16.3 and 16.4) ---- */
  /* flowStats(sections, steps) → { sections, steps, sub_steps, holds, readings } of the revision's process sections */
  function flowStats(sections, steps) {
    const n = SEL.stepCount(steps);
    return { sections: sections.length, steps: steps.length ? n.steps : 0, sub_steps: steps.length ? n.sub_steps : 0,
      holds: steps.filter(s => s.step_type === 'Hold').length, readings: steps.filter(s => s.step_type === 'Reading').length };
  }
  /* beforeStart(safetyItems, materials, tools) → the two cards: { section, name, tab, line, warn } */
  function beforeStart(safetyItems, materials, tools) {
    const word = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const notAvail = rows => rows.filter(r => r.status !== 'Available').length;
    const status = rows => { const k = notAvail(rows); return k ? ' · ' + k + ' not Available' : ' · all Available'; };
    const s = safetyItems || [], m = materials || [], t = tools || [];
    const line1 = s.length ? word(s.length, 'item', 'items') + status(s) : 'no items';
    const line2 = (m.length ? word(m.length, 'material', 'materials') : 'no materials') + ' · ' + (t.length ? word(t.length, 'tool or machine', 'tools and machines') : 'no tools and machines') + (m.length ? status(m) : '');
    return [{ section: 1, name: 'Safety and PPE', tab: 'safety', line: line1, warn: notAvail(s) > 0 },
      { section: 2, name: 'Materials, tools and machines', tab: 'materials', line: line2, warn: notAvail(m) > 0 }];
  }

  return { stepTokens: tokens, stepMentions, skipCondition, endsText, sopIds, sectionRules, sectionLines, wrapCount, boxHeight, ioBoxes, stepIcons, linkText, iconCounts, stepLine2,
    flowStats, beforeStart, ICON_CHAR, BOX_W: W, COMPACT: COMPACT };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_FACTS;
