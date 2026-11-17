/* SOP Builder logic pieces for keys and order: renumber (seq, hold
   labels, class, signed by on every save), newKey (contract part 3),
   insertStep, moveTarget, keyNumber. Step numbers come from number.js
   (numberSection); newStepNo was removed in build 48 (x.0 gone). Pure.
   Classic script (global ENGINE_KEYS); module in Node. Answer key:
   tests/golden2.js (RN, K). */
const ENGINE_KEYS = (function () {
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const SETSX = (typeof SETS !== 'undefined') ? SETS : require('../schema/sets.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const empty = T.empty;

  /* renumber(stepsInOrder) → { steps, changed }: seq = position, holds H1, H2 in order, class and signed by derived */
  function renumber(steps) {
    if (!steps.length) { return { steps: [], changed: [] }; }
    const sopId = steps[0].sop_id, rev = steps[0].rev;
    const seen = {};
    for (const s of steps) {
      if (s.sop_id !== sopId || s.rev !== rev) { fail('renumber', 'steps must be of one SOP and revision (' + sopId + ' ' + rev + ' and ' + s.sop_id + ' ' + s.rev + ')'); }
      if (seen[s.key]) { fail('renumber', 'key ' + s.key + ' appears twice'); }
      seen[s.key] = true;
      if (SETSX.step_type.indexOf(s.step_type) < 0) { fail('renumber', 'step ' + s.step_no + ' has an unknown step_type "' + s.step_type + '"'); }
    }
    let holds = 0;
    const changed = [];
    const out = steps.map(function (s, i) {
      const n = JSON.parse(JSON.stringify(s));
      n.seq = i + 1;
      if (s.step_type === 'Hold') { holds++; n.hold = 'H' + holds; } else { n.hold = 'N'; }
      n.class = s.step_type === 'Hold' ? 'Critical' : (s.step_type === 'Reading' ? 'Major' : 'Minor');
      n.signed_by = s.step_type === 'Hold' ? 'Operator + Supervisor' : 'Operator';
      if (n.seq !== s.seq || n.hold !== s.hold || n.class !== s.class || n.signed_by !== s.signed_by) { changed.push(s.key); }
      return n;
    });
    return { steps: out, changed: changed };
  }

  /* key helpers: 'TANK01-2420' → 2420; number → 'TANK01-2420' */
  function keyNumber(key, short, place) {
    const m = /^([A-Z0-9]+)-(\d{4})$/.exec(String(key || ''));
    if (!m) { fail(place, '"' + key + '" is not a key of the form ' + short + '-nnnn'); }
    if (m[1] !== short) { fail(place, 'key ' + key + ' belongs to another SOP, not ' + short); }
    return Number(m[2]);
  }
  function pad4(n) { return (n < 1000 ? ('000' + n).slice(-4) : String(n)); }
  function takenSet(short, used, retired) {
    const taken = {};
    let highest = 0;
    for (const k of used) {
      const m = /^([A-Z0-9]+)-(\d{4})$/.exec(String(k));
      if (m && m[1] === short) { taken[Number(m[2])] = true; highest = Math.max(highest, Number(m[2])); }
    }
    for (const r of retired) {
      const m = /^([A-Z0-9]+)-(\d{4})$/.exec(String(r.key));
      if (!m || m[1] !== short) { continue; }
      const from = Number(m[2]);
      const m2 = empty(r.range_to) ? null : /^([A-Z0-9]+)-(\d{4})$/.exec(String(r.range_to));
      const to = m2 ? Number(m2[2]) : from;
      for (let n = from; n <= to; n++) { taken[n] = true; }
      highest = Math.max(highest, to);
    }
    return { taken: taken, highest: highest };
  }

  /* newKey(short, usedKeys, retiredRows, beforeKey, afterKey) → { key, rule } */
  function newKey(short, used, retired, beforeKey, afterKey) {
    const t = takenSet(short, used, retired);
    const lo = empty(beforeKey) ? null : keyNumber(beforeKey, short, 'newKey');
    const hi = empty(afterKey) ? null : keyNumber(afterKey, short, 'newKey');
    if (lo !== null && hi !== null && lo < hi) {
      for (const step of [10, 5, 1]) {
        for (let n = lo + 1; n < hi; n++) {
          if (n % step === 0 && !t.taken[n]) {
            const how = step === 1 ? 'free number' : 'free multiple of ' + step;
            return { key: short + '-' + pad4(n), rule: how + ' between ' + pad4(lo) + ' and ' + pad4(hi) };
          }
        }
      }
    }
    let n = Math.floor(t.highest / 100) * 100 + 100;
    while (t.taken[n] && n <= 9999) { n += 100; }
    if (n > 9999) { fail('newKey', 'no free key left under ' + short + '-9999'); }
    return { key: short + '-' + pad4(n), rule: 'next free multiple of 100 above ' + t.highest + ' (highest key of ' + short + ', used or retired)' };
  }

  /* insertStep(sopSteps, draft, section, afterKey) → { steps, before_key, after_key }: the draft placed under afterKey,
     or at the start of the section (afterKey null); a section without steps goes after the last lower section */
  function insertStep(sopSteps, draft, section, afterKey) {
    const ordered = sopSteps.slice().sort((a, b) => a.seq - b.seq);
    if (ordered.some(s => s.key === draft.key)) { fail('insertStep', 'key ' + draft.key + ' is already a step of this revision'); }
    let pos;
    if (!empty(afterKey)) {
      pos = ordered.findIndex(s => s.key === afterKey);
      if (pos < 0) { fail('insertStep', 'no step with key ' + afterKey); }
      if (ordered[pos].section !== section) { fail('insertStep', 'step ' + ordered[pos].step_no + ' is in section ' + ordered[pos].section + ', not section ' + section); }
      pos = pos + 1;
    } else {
      pos = ordered.findIndex(s => s.section === section);
      if (pos < 0) {
        pos = ordered.length;
        while (pos > 0 && ordered[pos - 1].section > section) { pos--; }
      }
    }
    const steps = ordered.slice(0, pos).concat([draft]).concat(ordered.slice(pos));
    return { steps: steps, before_key: pos > 0 ? ordered[pos - 1].key : null, after_key: pos < ordered.length ? ordered[pos].key : null };
  }

  /* moveTarget(sopSteps, key, direction) → { after_key } for an Up or Down click, or { refusals } at the section's edge
     (example_flow.md part 8): a step jumps over the whole step block (a step and its sub-steps) before or after it;
     a sub-step moves by one row (reorder puts it under the step above it there) */
  function moveTarget(sopSteps, key, direction) {
    if (direction !== 'up' && direction !== 'down') { fail('moveTarget', 'direction must be up or down, not "' + direction + '"'); }
    const ordered = sopSteps.slice().sort((a, b) => a.seq - b.seq);
    const row = ordered.find(s => s.key === key);
    if (!row) { fail('moveTarget', 'no step with key ' + key); }
    const sec = ordered.filter(s => s.section === row.section);
    const i = sec.indexOf(row);
    const sub = r => String(r.step_no).split('.').length > 2;
    const first = row.step_no + ' is already the first step of section ' + row.section, last = row.step_no + ' is already the last step of section ' + row.section;
    if (sub(row)) {
      if (direction === 'up') { return i === 0 ? { refusals: [{ field: 'after', message: first }] } : { after_key: i >= 2 ? sec[i - 2].key : null }; }
      return i === sec.length - 1 ? { refusals: [{ field: 'after', message: last }] } : { after_key: sec[i + 1].key };
    }
    const endOf = j => { let e = j; while (e + 1 < sec.length && sub(sec[e + 1])) { e++; } return e; };
    if (direction === 'up') {
      if (i === 0) { return { refusals: [{ field: 'after', message: first }] }; }
      let h = i - 1; while (h > 0 && sub(sec[h])) { h--; }
      return { after_key: h > 0 ? sec[h - 1].key : null };
    }
    const e = endOf(i);
    if (e === sec.length - 1) { return { refusals: [{ field: 'after', message: last }] }; }
    return { after_key: sec[endOf(e + 1)].key };
  }

  return { renumber, newKey, insertStep, moveTarget, keyNumber };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_KEYS;
