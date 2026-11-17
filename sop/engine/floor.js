/* SOP Builder logic piece for the floor copy: floorStep gives the printed
   lines of one step (the skill's Floor copy rules, example.md part 11).
   Build 50 (spec/example_rights.md part 9): finalPdfName (the name of the
   final PDF in Final SOPs), oldPdfMoves (the older PDFs of the SOP that
   go to Final SOPs\Old). Pure. Classic script (global ENGINE_FLOOR);
   module in Node. Answer keys: tests/golden.js (F cases), golden28.js. */
const ENGINE_FLOOR = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const empty = T.empty;

  /* parts on one line: "i. A. ii. B." */
  function oneLine(text) {
    const p = T.parts(text);
    if (p.length <= 1) { return empty(text) ? null : String(text).replace(/\n/g, ' '); }
    return p.map((x, i) => T.partLabel(i + 1) + '. ' + x.replace(/\n/g, ' ')).join(' ');
  }
  function floorTarget(step) {
    switch (step.limit_status) {
      case 'Not applicable': return null;
      case 'Record only': return 'Record only';
      case 'Needed': return 'Limit needed';
      default: return T.targetText(step);
    }
  }

  /* floorStep(step, pictures) → { step_no, hold, skip_line, action_lines, action_gu, reading, warning, repeat, lines, picture_ids, photo } */
  function floorStep(step, pictures) {
    const actionParts = T.parts(step.action);
    const lines = [];
    const check = oneLine(step.check);
    const target = floorTarget(step);
    if (check !== null) { lines.push((target ? 'Target: ' + target + '. ' : '') + 'Check: ' + check); }
    else if (target) { lines.push('Target: ' + target + '.'); }
    const ifFail = oneLine(step.if_fail);
    if (ifFail !== null) { lines.push('If NOT OK: ' + ifFail); }
    const okPhoto = Array.isArray(step.photo_ref) ? (step.photo_ref.find(n => /-OK\.jpe?g$/i.test(n)) || null) : null;
    return {
      step_no: step.step_no,
      hold: (!empty(step.hold) && step.hold !== 'N') ? step.hold : null,
      skip_line: empty(step.skip_if) ? null : step.skip_if,
      action_lines: actionParts.length > 1 ? actionParts.map((x, i) => T.partLabel(i + 1) + '. ' + x) : actionParts,
      action_gu: empty(step.action_gu) ? null : step.action_gu,
      reading: empty(step.unit) ? null : '______ ' + step.unit,
      warning: empty(step.warning) ? null : step.warning,
      repeat: step.repeat_count > 1 ? step.repeat_count : null,
      lines: lines,
      picture_ids: T.pictureRefs(step, pictures),
      photo: okPhoto
    };
  }

  /* ---- the final PDFs (build 50, example_rights.md part 9) ---- */
  const FINAL_DIR = 'Final SOPs', OLD_DIR = 'Final SOPs/Old';
  const TRIAL = 'Released for floor trial';
  /* finalPdfName(sopId, revision) → "<SOP ID> <Rev>" (" floor trial" after it for a floor trial release), the name of the PDF without
     .pdf, or null when the revision is not Released */
  function finalPdfName(sopId, revision) {
    if (!revision || revision.status !== 'Released') { return null; }
    return sopId + ' ' + revision.rev + (String(revision.release_note || '').indexOf(TRIAL) === 0 ? ' floor trial' : '');
  }
  const baseName = f => String(f).split('/').pop();
  const escapeRe = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* oldPdfMoves(files, oldFiles, sopId, keepName) → [{ from, to }]: every PDF of the SOP in Final SOPs ("<SOP ID> Rev nn", maybe " floor
     trial", maybe " (n)") but keepName goes to Final SOPs/Old; a name taken there gets " (2)", " (3)"; small and capital letters are
     the same name (Windows) */
  function oldPdfMoves(files, oldFiles, sopId, keepName) {
    const mine = new RegExp('^' + escapeRe(sopId) + ' Rev \\d+( floor trial)?( \\(\\d+\\))?\\.pdf$', 'i');
    const keep = String(keepName || '').toLowerCase() + '.pdf';
    const taken = {};
    for (const f of oldFiles || []) { taken[baseName(f).toLowerCase()] = true; }
    const out = [];
    for (const f of files || []) {
      const n = baseName(f);
      if (!mine.test(n) || n.toLowerCase() === keep) { continue; }
      let to = n;
      if (taken[to.toLowerCase()]) {
        const dot = n.lastIndexOf('.'), stem = n.slice(0, dot), ext = n.slice(dot);
        let i = 2;
        while (taken[(stem + ' (' + i + ')' + ext).toLowerCase()]) { i++; }
        to = stem + ' (' + i + ')' + ext;
      }
      taken[to.toLowerCase()] = true;
      out.push({ from: f, to: OLD_DIR + '/' + to });
    }
    return out;
  }

  return { floorStep, floorTarget, oneLine, finalPdfName, oldPdfMoves, FINAL_DIR, OLD_DIR };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_FLOOR;
