/* SOP Builder logic pieces that link rows: Values Needed rows to steps
   and sections (vnLinks, vnCounts) and the record sheet rows
   (recordSheetRows). Pure. Classic script (global ENGINE_LINKS); module in
   Node. Answer key: tests/golden.js (V, VC, S cases). */
const ENGINE_LINKS = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const STEP_RANGE = /^(\d+(?:\.\d+)+)\s+to\s+(\d+(?:\.\d+)+)$/;
  const SECTION_RANGE = /^(\d+)\s+to\s+(\d+)$/;
  const ONE_STEP = /^(\d+(?:\.\d+)+)(?:\s+[ivx]+(?:\s+to\s+[ivx]+)?)?$/;
  const ONE_SECTION = /^(\d+)$/;
  function bySeq(a, b) { return a.seq - b.seq; }

  /* vnLinks(vn, steps, sections) → { scope: Step | Section | SOP, keys (Seq order), sections (sorted) } */
  function vnLinks(vn, steps, sections) {
    if (!vn || T.empty(vn.step_text)) { fail('vnLinks', 'Values Needed row ' + (vn && vn.vn_id) + ' has no step_text'); }
    const mine = steps.filter(s => s.sop_id === vn.sop_id).slice().sort(bySeq);
    const secNos = sections.filter(s => s.sop_id === vn.sop_id).map(s => s.section);
    const keys = [], secs = [];
    const addStep = s => { if (keys.indexOf(s.key) < 0) { keys.push(s.key); } addSec(s.section); };
    const addSec = n => { if (secs.indexOf(n) < 0) { secs.push(n); } };
    const find = no => mine.find(s => s.step_no === no);
    const partsText = String(vn.step_text).split(',').map(x => x.trim());
    /* a bare number ("11") is a section only when every part is a section token; after free text it is a list item */
    const sectionsOnly = partsText.every(x => SECTION_RANGE.test(x) || ONE_SECTION.test(x));
    for (const p of partsText) {
      let m;
      if ((m = STEP_RANGE.exec(p))) {
        const a = find(m[1]), b = find(m[2]);
        if (a && b) { for (const s of mine) { if (s.seq >= a.seq && s.seq <= b.seq) { addStep(s); } } }
      } else if (sectionsOnly && (m = SECTION_RANGE.exec(p))) {
        for (let n = Number(m[1]); n <= Number(m[2]); n++) { if (secNos.indexOf(n) >= 0) { addSec(n); } }
      } else if ((m = ONE_STEP.exec(p))) {
        const s = find(m[1]);
        if (s) { addStep(s); }
      } else if (sectionsOnly && (m = ONE_SECTION.exec(p))) {
        if (secNos.indexOf(Number(m[1])) >= 0) { addSec(Number(m[1])); }
      }
    }
    const ordered = mine.filter(s => keys.indexOf(s.key) >= 0).map(s => s.key);
    secs.sort((a, b) => a - b);
    return { scope: ordered.length ? 'Step' : (secs.length ? 'Section' : 'SOP'), keys: ordered, sections: secs };
  }

  /* vnCounts(vnRows, steps, sections, sopId) → open and given for the SOP, per section and the vn_ids per step key;
     sopId may be left out when steps or sections are given */
  function vnCounts(vnRows, steps, sections, sopIdIn) {
    const sopId = sopIdIn || (steps.length ? steps[0].sop_id : (sections.length ? sections[0].sop_id : null));
    if (!sopId) { fail('vnCounts', 'no SOP: no steps and no sections given'); }
    const out = { open: 0, given: 0, rows: 0, by_section: {}, by_key: {} };
    for (const s of sections) { if (s.sop_id === sopId) { out.by_section[s.section] = { open: 0, given: 0, rows: 0 }; } }
    for (const s of steps) { if (s.sop_id === sopId) { out.by_key[s.key] = []; } }
    for (const vn of vnRows) {
      if (vn.sop_id !== sopId) { continue; }
      const state = T.empty(vn.value) ? 'open' : 'given';
      out[state]++; out.rows++;
      const l = vnLinks(vn, steps, sections);
      for (const k of l.keys) { out.by_key[k].push(vn.vn_id); }
      for (const n of l.sections) {
        if (!out.by_section[n]) { out.by_section[n] = { open: 0, given: 0, rows: 0 }; }
        out.by_section[n][state]++; out.by_section[n].rows++;
      }
    }
    return out;
  }

  /* recordSheetRows(steps, sections) → { rows: one per section with a Reading or Hold step, handover } */
  const HANDOVER = 'Handed over to ______ Date ______ Sign ______';
  function note(step, target) {
    return step.limit_status === 'Record only' ? 'record only' : (step.limit_status === 'Needed' ? 'limit needed' : target);
  }
  function recordItem(step) {
    const target = T.targetText(step);
    const name = T.firstPart(step.action);
    if (step.step_type === 'Reading') {
      if (T.empty(step.unit)) { fail('recordSheetRows', 'step ' + step.step_no + ' is a Reading without a Unit'); }
      return { step_no: step.step_no, key: step.key, kind: 'reading', hold: null, unit: step.unit, target: target,
        label: step.step_no + ' ' + name + ': ______ ' + step.unit + ' (' + note(step, target) + ')' };
    }
    if (T.empty(step.hold) || step.hold === 'N') { fail('recordSheetRows', 'hold step ' + step.step_no + ' has no hold label'); }
    const reading = T.empty(step.unit) ? '' : ' ______ ' + step.unit + ' (' + note(step, target) + '),';
    return { step_no: step.step_no, key: step.key, kind: 'hold', hold: step.hold, unit: T.empty(step.unit) ? null : step.unit, target: target,
      label: 'HOLD ' + step.hold + ' ' + name + ':' + reading + ' Operator sign ______ Supervisor sign ______' };
  }
  function recordSheetRows(steps, sections) {
    const rows = [];
    const secs = sections.slice().sort((a, b) => a.section - b.section);
    const ordered = steps.slice().sort(bySeq);
    for (const sec of secs) {
      const items = ordered.filter(s => s.sop_id === sec.sop_id && s.rev === sec.rev && s.section === sec.section &&
        (s.step_type === 'Reading' || s.step_type === 'Hold')).map(recordItem);
      if (!items.length) { continue; }
      rows.push({ section: sec.section, name: sec.name, step_nos: items.map(i => i.step_no),
        signed_by: items.some(i => i.kind === 'hold') ? 'Operator + Supervisor' : 'Operator', items: items });
    }
    const orphan = ordered.find(s => (s.step_type === 'Reading' || s.step_type === 'Hold') && !secs.some(x => x.sop_id === s.sop_id && x.rev === s.rev && x.section === s.section));
    if (orphan) { fail('recordSheetRows', 'step ' + orphan.step_no + ' is in section ' + orphan.section + ', which has no sections row'); }
    return { rows: rows, handover: HANDOVER };
  }

  return { vnLinks, vnCounts, recordSheetRows };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_LINKS;
