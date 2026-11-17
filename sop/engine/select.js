/* SOP Builder selectors: find one SOP, one revision, the steps and the
   sections of a revision in the loaded tables. Loud when a row that must
   exist is missing. Pure. Classic script (global ENGINE_SELECT); module in
   Node. Answer key: tests/golden.js (SEL cases). */
const ENGINE_SELECT = (function () {
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }

  function sopOf(tables, sopId) {
    const sop = tables.sops.find(s => s.sop_id === sopId);
    if (!sop) { fail('sopOf', 'SOP ' + sopId + ' is not in sops'); }
    return sop;
  }
  function revisionOf(tables, sopId, rev) {
    const r = tables.sop_revisions.find(x => x.sop_id === sopId && x.rev === rev);
    if (!r) { fail('revisionOf', sopId + ' has no revision ' + rev + ' in sop_revisions'); }
    return r;
  }
  function revisionsOf(tables, sopId) {
    const num = r => { const m = /(\d+)/.exec(String(r.rev)); return m ? Number(m[1]) : -1; };
    return tables.sop_revisions.filter(r => r.sop_id === sopId).slice().sort((a, b) => num(a) - num(b));
  }
  function stepsOf(tables, sopId, rev) {
    return tables.steps.filter(s => s.sop_id === sopId && s.rev === rev).slice().sort((a, b) => a.seq - b.seq);
  }
  function sectionsOf(tables, sopId, rev) {
    return tables.sections.filter(s => s.sop_id === sopId && s.rev === rev).slice().sort((a, b) => a.section - b.section);
  }
  function stepsInSection(steps, section) {
    return steps.filter(s => s.section === section).slice().sort((a, b) => a.seq - b.seq);
  }
  /* stepCount(steps): a step has a two-part number (9.1, 7.0); a three-part number
     (9.5.1) is a sub-step of the step above and is not counted. first and last are
     the first and last step numbers in Seq order. */
  function stepCount(steps) {
    const ordered = steps.slice().sort((a, b) => a.seq - b.seq);
    const top = ordered.filter(s => String(s.step_no).split('.').length === 2);
    return { steps: top.length, sub_steps: ordered.length - top.length,
      first: top.length ? top[0].step_no : null, last: top.length ? top[top.length - 1].step_no : null };
  }
  function rowsOf(tables, table, sopId, rev) {
    if (!Array.isArray(tables[table])) { fail('rowsOf', 'table ' + table + ' is missing'); }
    return tables[table].filter(r => r.sop_id === sopId && (rev === undefined || r.rev === rev));
  }

  /* familyOf(tables, sopId) → [the good version, its copies in copy-number order] (spec/example_copy.md, build 39): a copy has
     copy_of = the good version; the keys of a family never clash (the key rules count every key of the family) */
  function familyOf(tables, sopId) {
    const sop = sopOf(tables, sopId);
    const root = (sop.copy_of === null || sop.copy_of === undefined || String(sop.copy_of).trim() === '') ? sop.sop_id : sop.copy_of;
    const no = s => { const m = /-COPY(\d+)$/.exec(String(s.sop_id)); return m ? Number(m[1]) : 0; };
    const copies = tables.sops.filter(s => s.copy_of === root && s.sop_id !== root).sort((a, b) => no(a) - no(b));
    return [root].concat(copies.map(s => s.sop_id));
  }
  /* familyKeys(tables, sopId) → every key in the steps of the SOP's family, any revision */
  function familyKeys(tables, sopId) {
    const fam = familyOf(tables, sopId);
    return tables.steps.filter(s => fam.indexOf(s.sop_id) >= 0).map(s => s.key);
  }

  function countBy(rows, field) {
    const out = {};
    for (const r of rows) { const v = r[field]; out[v] = (out[v] || 0) + 1; }
    return out;
  }

  /* mergeRows(rows, replacements, keyFields): rows with the same key fields are replaced in place, new ones appended */
  function mergeRows(rows, replacements, keyFields) {
    const id = r => keyFields.map(f => String(r[f])).join('\u0001');
    const byId = {};
    for (const r of replacements) { byId[id(r)] = r; }
    const used = {};
    const out = rows.map(function (r) { const k = id(r); if (byId[k]) { used[k] = true; return byId[k]; } return r; });
    for (const r of replacements) { if (!used[id(r)]) { out.push(r); } }
    return out;
  }

  return { sopOf, revisionOf, revisionsOf, stepsOf, sectionsOf, stepsInSection, stepCount, rowsOf, familyOf, familyKeys, countBy, mergeRows };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_SELECT;
