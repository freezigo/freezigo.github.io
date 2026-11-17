/* SOP Builder logic pieces for step and sub-step numbers (Samrat
   2026-11-07, answer 2b): numberSection gives every row of one section its
   number from its place and its kind; mentionsOf lists the texts that name
   an old number, for the editor to fix by hand. Pure. Classic script
   (global ENGINE_NUMBER); module in Node. Answer key: tests/golden3.js. */
const ENGINE_NUMBER = (function () {
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const isSub = no => String(no).split('.').length > 2;

  /* numberSection(rows, kinds) → { numbers, renumbered } or { refusals }.
     rows: one section in order; kinds: { key: 'step' | 'sub' } for new rows
     (other rows keep the kind their number shows). Old rows keep their
     number while it fits; a new step takes the next number (x.1 at the
     start, always: build 48, Samrat 2026-11-14; an old x.0 becomes x.1),
     a new sub-step the next number under the step before it; rows after
     it move up only as far as needed. */
  function numberSection(rows, kinds) {
    if (!Array.isArray(rows)) { fail('numberSection', 'rows must be a list'); }
    kinds = kinds || {};
    const kindOf = r => kinds[r.key] || (r.step_no === null || r.step_no === undefined ? fail('numberSection', 'row ' + r.key + ' has no number and no kind') : (isSub(r.step_no) ? 'sub' : 'step'));
    for (const k in kinds) { if (kinds[k] !== 'step' && kinds[k] !== 'sub') { fail('numberSection', 'kind of ' + k + ' must be step or sub'); } }
    if (!rows.length) { return { numbers: {}, renumbered: [] }; }
    const section = rows[0].section;
    const refuse = message => ({ refusals: [{ field: 'kind', message: message }] });
    if (kindOf(rows[0]) === 'sub') { return refuse('A sub-step needs a step before it'); }
    for (let i = 0; i < rows.length - 1; i++) {
      if (kinds[rows[i + 1].key] === 'step' && i + 2 < rows.length && kindOf(rows[i + 2]) === 'sub' && !kinds[rows[i + 2].key]) {
        let parent = i; while (parent > 0 && kindOf(rows[parent]) === 'sub') { parent--; }
        let last = i + 2; while (last + 1 < rows.length && kindOf(rows[last + 1]) === 'sub') { last++; }
        return refuse('A new step here would take the sub-steps of ' + rows[parent].step_no + '. Add it after ' + rows[last].step_no);
      }
    }
    /* a row keeps its old number when it still fits (higher than the one before, under the same step);
       otherwise it takes the next number. Gaps (from a club) stay. */
    let step = 0, sub = 0, stepChanged = false;
    const numbers = {}, renumbered = [];
    for (const r of rows) {
      const isNew = !!kinds[r.key];
      const old = isNew ? null : String(r.step_no).split('.').map(Number);
      let no;
      if (kindOf(r) === 'step') {
        const keep = !isNew && old.length === 2 && old[1] > step;
        const n = keep ? old[1] : step + 1;
        stepChanged = isNew || n !== old[1];
        step = n; sub = 0; no = section + '.' + step;
      } else {
        const keep = !isNew && !stepChanged && old.length === 3 && old[1] === step && old[2] > sub;
        sub = keep ? old[2] : sub + 1;
        no = section + '.' + step + '.' + sub;
      }
      numbers[r.key] = no;
      if (!isNew && r.step_no !== no) { renumbered.push({ key: r.key, old: r.step_no, new: no }); }
    }
    return { numbers: numbers, renumbered: renumbered };
  }

  /* reorder(rows, key, afterKey) → { order, numbers, renumbered } or { refusals } (example_flow.md part 8, Samrat
     2026-11-07). rows: one section in Seq order; the row with key goes after the row afterKey (null = first).
     A step moves with its sub-steps (one block) and lands after the whole block of the row it goes after; a
     sub-step lands right there, under the step above it. Numbers belong to places: the steps take the numbers of
     the places they land on, in order (a gap stays where it was); sub-steps take their step's new number with
     their own last part. A sub-step under its own step: the sub numbers belong to places the same way; under
     another step: numberSection, the sub-step placed anew. */
  function reorder(rows, key, afterKey) {
    const i = rows.findIndex(r => r.key === key);
    if (i < 0) { fail('reorder', 'no row with key ' + key); }
    if (afterKey !== null && !rows.some(r => r.key === afterKey)) { fail('reorder', 'no row with key ' + afterKey + ' in this section'); }
    const m = rows[i];
    const refuse = message => ({ refusals: [{ field: 'move', message: message }] });
    const here = () => refuse(m.step_no + ' is already there.');
    const parentNo = no => String(no).split('.').slice(0, 2).join('.');
    const blockOf = j => { let a = j; while (a > 0 && isSub(rows[a].step_no)) { a--; } let b = a; while (b + 1 < rows.length && isSub(rows[b + 1].step_no)) { b++; } return [a, b]; };
    if (afterKey === key) { return here(); }
    let order;
    if (!isSub(m.step_no)) {
      const [a, b] = blockOf(i);
      const block = rows.slice(a, b + 1), rest = rows.slice(0, a).concat(rows.slice(b + 1));
      let pos = 0;
      if (afterKey !== null) {
        const t = rows.findIndex(r => r.key === afterKey);
        if (t >= a && t <= b) { return here(); }
        const end = rows[blockOf(t)[1]].key;
        pos = rest.findIndex(r => r.key === end) + 1;
      }
      order = rest.slice(0, pos).concat(block).concat(rest.slice(pos));
    } else {
      if (afterKey === null) { return refuse('A sub-step needs a step before it.'); }
      const rest = rows.filter(r => r.key !== key);
      const pos = rest.findIndex(r => r.key === afterKey) + 1;
      order = rest.slice(0, pos).concat([m]).concat(rest.slice(pos));
    }
    if (order.every((r, k) => r.key === rows[k].key)) { return here(); }
    const numbers = {};
    for (const r of order) { numbers[r.key] = r.step_no; }
    if (!isSub(m.step_no)) {
      const places = rows.filter(r => !isSub(r.step_no)).map(r => r.step_no), newNo = {};
      order.filter(r => !isSub(r.step_no)).forEach((r, k) => { numbers[r.key] = places[k]; newNo[r.step_no] = places[k]; });
      for (const r of order) { if (isSub(r.step_no)) { numbers[r.key] = newNo[parentNo(r.step_no)] + '.' + String(r.step_no).split('.')[2]; } }
    } else {
      let p = order.indexOf(m) - 1;
      while (isSub(order[p].step_no)) { p--; }
      if (order[p].step_no === parentNo(m.step_no)) {
        const mine = r => isSub(r.step_no) && parentNo(r.step_no) === parentNo(m.step_no);
        const places = rows.filter(mine).map(r => r.step_no);
        order.filter(mine).forEach((r, k) => { numbers[r.key] = places[k]; });
      } else {
        const n = numberSection(order, { [m.key]: 'sub' });
        if (n.refusals) { return refuse(n.refusals[0].message); }
        Object.assign(numbers, n.numbers);
      }
    }
    const renumbered = order.filter(r => numbers[r.key] !== r.step_no).map(r => ({ key: r.key, old: r.step_no, new: numbers[r.key] }));
    return { order: order.map(r => r.key), numbers: numbers, renumbered: renumbered };
  }

  /* mentionsOf(texts, renames) → [{ table, row_id, field, mentions: [{ old, new }], text }]
     texts: [{ table, row_id, field, text }]; renames: { old number: new number }.
     A token is a number with dots not inside a longer number. Text cut at 60. */
  function mentionsOf(texts, renames) {
    const out = [];
    const tok = /(\d+(?:\.\d+)+)/g;
    for (const t of texts) {
      if (t.text === null || t.text === undefined || t.text === '') { continue; }
      const s = String(t.text), found = [];
      let m;
      tok.lastIndex = 0;
      while ((m = tok.exec(s)) !== null) {
        const before = s.charAt(m.index - 1), after = s.charAt(m.index + m[0].length), after2 = s.charAt(m.index + m[0].length + 1);
        if (/[\d.]/.test(before) || /\d/.test(after) || (after === '.' && /\d/.test(after2))) { continue; }
        if (Object.prototype.hasOwnProperty.call(renames, m[0]) && !found.some(f => f.old === m[0])) { found.push({ old: m[0], new: renames[m[0]] }); }
      }
      if (found.length) { out.push({ table: t.table, row_id: t.row_id, field: t.field, mentions: found, text: s.length > 60 ? s.slice(0, 60) + '…' : s }); }
    }
    return out;
  }

  /* renumberSection(rows) → { numbers, renumbered } or { refusals } (build 40, example_renumber.md part 4): one section in Seq order;
     a step takes section.1, section.2, ... in order (7.0 becomes 7.1), a sub-step its step's number and .1, .2, ...; the keys and
     the order stay. renumbered lists only the rows whose number changes. */
  function renumberSection(rows) {
    if (!Array.isArray(rows)) { fail('renumberSection', 'rows must be a list'); }
    if (!rows.length) { return { numbers: {}, renumbered: [] }; }
    const section = rows[0].section;
    if (rows.some(r => r.section !== section)) { fail('renumberSection', 'rows of one section only (' + section + ' and others)'); }
    if (isSub(rows[0].step_no)) { return { refusals: [{ field: 'renumber', message: 'Section ' + section + ' starts with a sub-step (' + rows[0].step_no + '): make it a step first.' }] }; }
    const numbers = {}, renumbered = [];
    let step = 0, sub = 0;
    for (const r of rows) {
      let no;
      if (isSub(r.step_no)) { sub++; no = section + '.' + step + '.' + sub; } else { step++; sub = 0; no = section + '.' + step; }
      numbers[r.key] = no;
      if (String(r.step_no) !== no) { renumbered.push({ key: r.key, old: String(r.step_no), new: no }); }
    }
    return { numbers: numbers, renumbered: renumbered };
  }

  /* renumberText(text, renames) → { text, mentions: [{ old, new }] } (build 40): every step token of the text that renames names
     takes its new number, all at once (3.4 and 3.5 may swap); a value (3.5 bar, 1.5 mm: stepMentions) and a number inside a longer
     one stay as they are */
  function renumberText(text, renames) {
    if (text === null || text === undefined || text === '') { return { text: text === undefined ? null : text, mentions: [] }; }
    const FA = (typeof ENGINE_FACTS !== 'undefined') ? ENGINE_FACTS : require('./flow_facts.js');
    const s = String(text), mentions = [];
    let out = '', last = 0;
    for (const m of FA.stepMentions(s)) {
      if (m.value_like || !Object.prototype.hasOwnProperty.call(renames, m.tok)) { continue; }
      out += s.slice(last, m.at) + renames[m.tok];
      last = m.at + m.tok.length;
      if (!mentions.some(x => x.old === m.tok)) { mentions.push({ old: m.tok, new: renames[m.tok] }); }
    }
    return { text: mentions.length ? out + s.slice(last) : s, mentions: mentions };
  }

  /* ---- options on the Texts to check tab (build 41, example_renumber.md part 10) ---- */
  /* tidy(text): a step named twice in a row ("3.3, 3.3", "3.3 to 3.3", "3.3 and 3.3") is named once */
  const REPEAT = /(^|[^\d.])(\d+(?:\.\d+){1,2})(\s*(?:,|and|to|&|\/|–|-)\s*)\2(?!\d|\.\d)/g;
  function tidy(text) {
    let s = text, before;
    do { before = s; s = s.replace(REPEAT, '$1$2'); } while (s !== before);
    return s;
  }
  /* applyFix(text, options) → the text with these options used at once (each { old, use }: a step number, or "section 9" → "section 8"),
     then tidied; an empty text stays as it is */
  function applyFix(text, options) {
    if (text === null || text === undefined || text === '') { return text === undefined ? null : text; }
    const steps = {}, secs = {};
    for (const o of options || []) {
      if (/^section \d+$/.test(o.old)) { secs[o.old.split(' ')[1]] = String(o.use).split(' ')[1]; } else { steps[o.old] = o.use; }
    }
    let s = Object.keys(steps).length ? renumberText(text, steps).text : String(text);
    if (Object.keys(secs).length) { s = s.replace(/\b([Ss]ection) (\d+)\b/g, (all, w, n) => (secs[n] !== undefined ? w + ' ' + secs[n] : all)); }
    return tidy(s);
  }
  /* fixOptions(text, mentions) → { options: [{ old, use, label }], suggested }: one option per number the text names that has a sure
     new number: a step that moved (its number now), a step clubbed into another (that step's number now: into_now), a section that
     moved; none for a step deleted with no club or a number of a process SOP (of); suggested = the text with every option, or null */
  function fixOptions(text, mentions) {
    const options = [];
    for (const m of mentions || []) {
      if (m.of) { continue; }
      const use = (m.new !== null && m.new !== undefined) ? m.new : (m.into_now && !/^section /.test(m.old) ? m.into_now : null);
      if (use === null) { continue; }
      options.push({ old: m.old, use: use, label: 'Use ' + use + ' for ' + m.old });
    }
    return { options: options, suggested: options.length ? applyFix(text, options) : null };
  }

  return { numberSection, reorder, mentionsOf, renumberSection, renumberText, applyFix, fixOptions };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_NUMBER;
