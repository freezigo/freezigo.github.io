/* SOP Builder logic pieces on one step: parts (i, ii, iii), target text,
   the Result rule, picture refs and defect codes. Pure: values in, values
   out; no clock, no files, no screen. Classic script (global ENGINE_TEXT);
   module in Node. Answer key: tests/golden.js (T, R, D, P cases). */
const ENGINE_TEXT = (function () {
  const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
  const PART_LINE = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)\. (.*)$/;
  const FLOOR_FIELDS = ['action', 'warning', 'check', 'if_fail', 'skip_if'];

  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  function empty(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }

  /* parts('i. A\nii. B') → ['A', 'B']; a text without part lines is one part; empty → [] */
  function parts(text) {
    if (empty(text)) { return []; }
    const out = [];
    let any = false;
    for (const line of String(text).split('\n')) {
      const m = PART_LINE.exec(line);
      if (m) { out.push(m[2]); any = true; }
      else if (out.length) { out[out.length - 1] += '\n' + line; }
      else { out.push(line); }
    }
    return any ? out : [String(text)];
  }
  function partLabel(n) {
    if (n < 1 || n > ROMAN.length) { fail('partLabel', 'part ' + n + ' is outside 1 to ' + ROMAN.length); }
    return ROMAN[n - 1];
  }
  /* joinParts(['A', 'B']) → 'i. A\nii. B'; one part → the part; none → null */
  function joinParts(list) {
    const kept = list.filter(p => !empty(p));
    if (!kept.length) { return null; }
    if (list.length === 1) { return list[0]; }
    return list.map((p, i) => (empty(p) ? null : partLabel(i + 1) + '. ' + p)).filter(p => p !== null).join('\n');
  }
  function firstPart(text) { const p = parts(text); return p.length ? p[0] : ''; }

  /* stepNoParts('3.5.1') → [3, 5, 1]; compare('3.5', '3.10') < 0 */
  function stepNoParts(stepNo) {
    if (empty(stepNo)) { fail('stepNoParts', 'empty step number'); }
    const p = String(stepNo).split('.');
    if (p.some(x => !/^\d+$/.test(x))) { fail('stepNoParts', '"' + stepNo + '" is not a step number'); }
    return p.map(Number);
  }
  function compareStepNo(a, b) {
    const x = stepNoParts(a), y = stepNoParts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] === undefined ? -1 : x[i]) - (y[i] === undefined ? -1 : y[i]);
      if (d !== 0) { return d; }
    }
    return 0;
  }

  /* targetText(step): the Target column (example.md part 6) */
  function targetText(step) {
    const hasMin = !empty(step.min), hasMax = !empty(step.max);
    const u = empty(step.unit) ? '' : ' ' + step.unit;
    switch (step.limit_status) {
      case 'Not applicable': return 'no reading';
      case 'Needed': return 'Limit needed';
      case 'Record only': return empty(step.unit) ? 'Record only' : 'Record only (' + step.unit + ')';
      case 'Given':
        if (!hasMin && !hasMax) { fail('targetText', 'Limit status Given with no Min and no Max' + (step.key ? ' (' + step.key + ')' : '')); }
        if (hasMin && hasMax) { return (step.min === step.max ? String(step.min) : String(step.min) + ' to ' + String(step.max)) + u; }
        if (hasMin) { return String(step.min) + u + ' or more'; }
        return 'up to ' + String(step.max) + u;
      default: fail('targetText', 'unknown limit_status "' + step.limit_status + '"' + (step.key ? ' (' + step.key + ')' : ''));
    }
  }

  /* result(reading, step): OK, NOT OK, RECORDED, LIMIT NEEDED, NUMBER ONLY; null when no reading yet */
  function result(reading, step) {
    if (step.limit_status === 'Not applicable') { fail('result', 'step ' + step.step_no + ' takes no reading (Limit status Not applicable)'); }
    if (empty(reading)) { return null; }
    const r = typeof reading === 'number' ? reading : (typeof reading === 'string' ? Number(reading.trim()) : NaN);
    if (isNaN(r)) { return 'NUMBER ONLY'; }
    switch (step.limit_status) {
      case 'Record only': return 'RECORDED';
      case 'Needed': return 'LIMIT NEEDED';
      case 'Given': return (empty(step.min) || r >= step.min) && (empty(step.max) || r <= step.max) ? 'OK' : 'NOT OK';
      default: fail('result', 'unknown limit_status "' + step.limit_status + '"');
    }
  }

  /* pictureRefs(step, pictures): "Picture n" named in the floor fields, once each, in order */
  function pictureRefs(step, pictures) {
    const out = [];
    for (const f of FLOOR_FIELDS) {
      const text = step[f];
      if (empty(text)) { continue; }
      const re = /Picture (\d+)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const id = 'Picture ' + m[1];
        if (out.indexOf(id) >= 0) { continue; }
        if (pictures.some(p => p.sop_id === step.sop_id && p.rev === step.rev && p.picture_id === id)) { out.push(id); }
      }
    }
    return out;
  }
  /* stepImages(step, pictureIds, pictures) → [{ kind, name, file, label }] (example_flow.md part 18.5): the OK photo first, then the
     other photos of Photo ref in their order, then the Pictures (pictureIds, as pictureRefs gives them). A photo's file is null (the
     screen adds the photos folder); its label is OK, "BAD: <defect>" from the name, or null. A Picture's label is its caption
     without "Picture n: ". A Picture not in the pictures table is left out. */
  function stepImages(step, pictureIds, pictures) {
    const refs = Array.isArray(step.photo_ref) ? step.photo_ref.filter(n => !empty(n)) : [];
    const ok = refs.filter(n => /-OK\.[a-z]+$/i.test(n)), rest = refs.filter(n => ok.indexOf(n) < 0);
    const label = n => {
      if (/-OK\.[a-z]+$/i.test(n)) { return 'OK'; }
      const m = /-BAD-(.+)\.[a-z]+$/i.exec(n);
      return m ? 'BAD: ' + m[1].replace(/-/g, ' ') : null;
    };
    const out = ok.concat(rest).map(n => ({ kind: 'photo', name: n, file: null, label: label(n) }));
    for (const id of (Array.isArray(pictureIds) ? pictureIds : [])) {
      const p = pictures.find(x => x.sop_id === step.sop_id && x.rev === step.rev && x.picture_id === id);
      if (!p) { continue; }
      const cap = empty(p.caption) ? null : String(p.caption).replace(/^Picture \d+:\s*/, '');
      out.push({ kind: 'picture', name: id, file: p.file, label: cap });
    }
    return out;
  }


  /* defectCodes(step, defects): codes whose Found at names the step ("TANK-01 3.3 to 3.6; IPBOX-01 3.1 ii") */
  function sopName(sopId) { return String(sopId).split('-').slice(-2).join('-'); }
  const RANGE = /^(\d+(?:\.\d+)+)\s+to\s+(\d+(?:\.\d+)+)$/;
  const SINGLE = /^(\d+(?:\.\d+)+)(?:\s+[ivx]+(?:\s+to\s+[ivx]+)?)?$/;
  function namesStep(itemText, stepNo) {
    let m = RANGE.exec(itemText);
    if (m) { return compareStepNo(stepNo, m[1]) >= 0 && compareStepNo(stepNo, m[2]) <= 0; }
    m = SINGLE.exec(itemText);
    return !!m && compareStepNo(stepNo, m[1]) === 0;
  }
  function defectCodes(step, defects) {
    const name = sopName(step.sop_id);
    const out = [];
    for (const d of defects) {
      if (empty(d.found_at)) { continue; }
      const text = String(d.found_at).replace(/\([^)]*\)/g, '');
      for (const clause of text.split(';')) {
        const c = clause.trim();
        if (c.indexOf(name + ' ') !== 0) { continue; }
        const items = c.slice(name.length + 1).split(',').map(s => s.trim()).filter(s => s);
        if (items.some(it => namesStep(it, step.step_no)) && out.indexOf(d.code) < 0) { out.push(d.code); }
      }
    }
    return out;
  }

  /* guDraft(text): a Gujarati line that ends with "(draft)" is a draft not yet checked; guChecked(text): the line without the mark
     (Samrat 2026-11-12: no status field; the floor PDF prints "(draft)", example_new_sop.md part 11) */
  const DRAFT = /\s*\(draft\)\s*$/i;
  function guDraft(text) { return !empty(text) && DRAFT.test(String(text)); }
  function guChecked(text) { return String(text).replace(DRAFT, '').trim(); }

  return { parts, partLabel, joinParts, firstPart, stepNoParts, compareStepNo, targetText, result, pictureRefs, defectCodes, sopName, empty, stepImages, guDraft, guChecked };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_TEXT;
