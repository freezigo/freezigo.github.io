/* SOP Builder main engine for the changes of a main SOP offered to its copies (spec/example_copy_sync.md, build 45): copyChanges
   (the list on the copy), changeAfterSave (the pop-up right after a save in the main SOP), applyMainChange (Apply: the same change
   made in the copy by the Builder's own composers, all or nothing) and skipMainChange (Skip). The plan of a change is its items
   with their state (Will change, Same already, Pick, Not in the copy, Cannot apply), worked out by doing the change on the tables
   handed in. No logic of its own beyond choosing rows. Build 46: where each item is in the main and in the copy, and where a new or
   moved step goes before it is written (previewMainChange). Build 47: the place is picked before Apply from Put it (ENGINE_SYNC
   placeOptions: first, inside a step, after a step and its sub-steps, after a sub-step), and its kind (step or sub-step) comes from
   the place. Classic script (global ENGINE_SYNC_MAIN); module in Node. Checked by tests/sync_engine_check.js and tests/sync_check.js. */
const ENGINE_SYNC_MAIN = (function () {
  const SEL = (typeof ENGINE_SELECT !== 'undefined') ? ENGINE_SELECT : require('./select.js');
  const E = (typeof ENGINE_EDIT !== 'undefined') ? ENGINE_EDIT : require('./edit.js');
  const T = (typeof ENGINE_TEXT !== 'undefined') ? ENGINE_TEXT : require('./text.js');
  const SY = (typeof ENGINE_SYNC !== 'undefined') ? ENGINE_SYNC : require('./sync.js');
  const NU = (typeof ENGINE_NUMBER !== 'undefined') ? ENGINE_NUMBER : require('./number.js');
  const K = (typeof ENGINE_KEYS !== 'undefined') ? ENGINE_KEYS : require('./keys.js');
  const P = (typeof ENGINE_PROCESS !== 'undefined') ? ENGINE_PROCESS : require('./process.js');
  const LI = (typeof ENGINE_LISTS !== 'undefined') ? ENGINE_LISTS : require('./lists.js');
  const CP = (typeof ENGINE_COPIES !== 'undefined') ? ENGINE_COPIES : require('./copies.js');
  const R = (typeof ENGINE_RELEASE !== 'undefined') ? ENGINE_RELEASE : require('./release.js');
  const MAIN = (typeof ENGINE !== 'undefined') ? ENGINE : require('./main.js');
  const CHART = (typeof ENGINE_CHART !== 'undefined') ? ENGINE_CHART : require('./main_flow.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  function need(input, names, place) {
    if (!input || typeof input !== 'object') { fail(place, 'input is missing'); }
    for (const n of names) { if (input[n] === undefined) { fail(place, 'input.' + n + ' is missing'); } }
  }
  const copy = v => JSON.parse(JSON.stringify(v));
  const asText = E.asText;
  const AROUND = 6;
  const STATE_WORDS = { change: 'Will change', same: 'Same already', pick: 'Pick', absent: 'Not in the copy', blocked: 'Cannot apply' };
  const SEC_LABEL = { name: 'Name', name_gu: 'Gujarati name', needs_sections: 'Needs sections', needs_sops: 'Needs SOPs', needs_setup: 'Set-up this shift',
    wait_after: 'Wait after section', wait_min: 'Wait minutes', any_time_steps: 'Any time steps', ends_with: 'Ends with', max_wait: 'Max wait',
    restart_step: 'Restart step', manpower: 'Manpower', skilled: 'Skilled', helper: 'Helper', est_min: 'Est min', needs_note: 'Needs note', source_ref: 'Chart ref' };
  const LIST_NAME = { safety_items: '1 Safety and PPE', materials: '2 Materials', tools: 'Tools', worked_examples: 'Worked examples' };
  const PIC_LABEL = { caption: 'Caption', file: 'File', used_at: 'Used at' };
  const lastToken = s => { const p = String(s).split(' '); return p[p.length - 1]; };
  const refuse = message => ({ refusals: [{ field: 'form', message: message }] });
  const isSub = no => String(no).split('.').length > 2;
  /* placeFrom(options, id, base) → the place of a new or moved step (build 47): its options and the one marked (id; the place it has
     now, or the first, when id is not one of them) */
  function placeFrom(options, id, base) {
    const o = options.find(x => x.id === id) || options.find(x => x.stays) || options[0] || null;
    return Object.assign(base, { id: o ? o.id : id, after_key: o ? o.after_key : null, kind: o ? o.kind : null, number: o ? o.number : null, options: options });
  }
  /* pickPlace(item, id) → the item's place set to the option id (a place picked in Put it), or the item's place unchanged */
  function pickPlace(it, id) {
    if (!it.place || it.place.follows || id === undefined) { return; }
    const o = it.place.options.find(x => x.id === id);
    it.place.id = id;
    it.place.after_key = o ? o.after_key : null; it.place.kind = o ? o.kind : null; it.place.number = o ? o.number : null;
    it.place.unknown = !o;
  }

  /* the copy, its good version (the main SOP) and the copy's revision */
  function familyOf(t, copyId, place) {
    const cp = SEL.sopOf(t, copyId);
    if (!CP.isCopy(cp)) { fail(place, copyId + ' is not a copy'); }
    if (!cp.current_rev) { fail(place, 'copy ' + copyId + ' has no revision'); }
    const good = SEL.sopOf(t, cp.copy_of);
    return { cp: cp, good: good, rev: cp.current_rev, name: cp.copy_name };
  }
  const nextHist = t => t.history.reduce((m, h) => Math.max(m, Number(h.hist_id) || 0), 0) + 1;
  const reasonOf = ch => 'Main change ' + ch.change_id + ': ' + ch.reason;
  const ctxFor = (tb, ctx, ch) => ({ who: ctx.who, now: ctx.now, next_hist_id: nextHist(tb), reason: reasonOf(ch) });
  const laterRows = (t, c, ch, table, rowId) => t.history.filter(h => h.sop_id === c.good.sop_id && h.table === table && h.row_id === rowId && h.hist_id > ch.last);
  const mainRev = c => c.good.current_rev;
  const words = list => list.map(m => m.message).join(' · ');

  /* ---- the items of a change, as the copy has them now (example part 4); build 46: where each is in the main and in the copy
     (part 5.4), and the places a new or moved step can go (part 5.5) ---- */
  function fieldItem(id, where, what, copyHas, copyValue, h, at) {
    const copyText = copyHas ? asText(copyValue) : null;
    const state = copyHas ? SY.fieldState(copyText, h.old_value, h.new_value) : 'absent';
    return Object.assign({ id: id, kind: 'field', where: where, what: what, state: state, copy_text: copyText, main_old: h.old_value, main_new: h.new_value,
      diff_main: SY.shortDiff(h.old_value, h.new_value, AROUND), diff_copy: SY.shortDiff(copyText, h.new_value, AROUND) }, at);
  }
  function itemsOf(t, c, ch, ops) {
    const items = [];
    const cSteps = SEL.stepsOf(t, c.cp.sop_id, c.rev), mSteps = SEL.stepsOf(t, c.good.sop_id, mainRev(c));
    const cRetired = t.retired_keys.filter(r => r.sop_id === c.cp.sop_id);
    const cStep = key => cSteps.find(s => s.key === key) || null;
    const whereIn = key => SY.copyWhere(cSteps, cRetired, key);
    /* the step's number in the main right after the change (later renumbering undone), or the number it had when the main took it out */
    const mainNo = key => {
      const m = mSteps.find(s => s.key === key);
      if (m) { return SY.rowAsAfter('steps', { step_no: m.step_no }, laterRows(t, c, ch, 'steps', key)).step_no; }
      const own = ch.rows.find(h => h.row_id === key && h.field === 'row');
      const out = t.history.filter(h => h.sop_id === c.good.sop_id && h.table === 'steps' && h.row_id === key && h.field === 'row' && /^retired: /.test(String(h.new_value || '')));
      const h = own || out[out.length - 1];
      return h ? (SY.numberOfRow(h.old_value) || SY.numberOfRow(h.new_value) || key) : key;
    };
    const stepAt = key => ({ main_at: 'step ' + mainNo(key) + ' (' + key + ')', copy_at: SY.copyAtText(whereIn(key)), copy_state: whereIn(key).state });
    const cSecs = SEL.sectionsOf(t, c.cp.sop_id, c.rev), mSecs = SEL.sectionsOf(t, c.good.sop_id, mainRev(c));
    const secName = (secs, n) => { const x = secs.find(s => s.section === n); return x ? x.name : null; };
    const secAt = n => ({ main_at: 'section ' + n + (secName(mSecs, n) ? ' (' + secName(mSecs, n) + ')' : ''),
      copy_at: secName(cSecs, n) ? 'section ' + n + ' (' + secName(cSecs, n) + ')' : 'no section ' + n + ' in the copy' });
    const cRev = SEL.revisionOf(t, c.cp.sop_id, c.rev);
    const HEAD = { main_at: 'the header', copy_at: 'the header' };
    for (const h of ops.fields) {
      const id = h.table + '|' + h.row_id + '|' + h.field;
      if (h.table === 'steps') { const s = cStep(h.row_id); items.push(fieldItem(id, 'Step ' + mainNo(h.row_id), E.LABEL[h.field] || h.field, !!s, s ? s[h.field] : null, h, stepAt(h.row_id))); continue; }
      if (h.table === 'sections') {
        const n = Number(lastToken(h.row_id)), s = cSecs.find(x => x.section === n);
        items.push(fieldItem(id, 'Section ' + n, SEC_LABEL[h.field] || h.field, !!s, s ? s[h.field] : null, h, secAt(n))); continue;
      }
      if (h.table === 'sop_revisions') { items.push(fieldItem(id, 'Header', LI.LABEL[h.field] || h.field, true, cRev[h.field], h, HEAD)); continue; }
      if (h.table === 'sops') { items.push(fieldItem(id, 'Header', LI.LABEL[h.field] || h.field, true, c.cp[h.field], h, HEAD)); continue; }
      if (h.table === 'pictures') {
        const p = SEL.rowsOf(t, 'pictures', c.cp.sop_id, c.rev).find(x => x.picture_id === h.row_id);
        items.push(fieldItem(id, h.row_id, PIC_LABEL[h.field] || h.field, !!p, p ? p[h.field] : null, h, { main_at: h.row_id, copy_at: p ? h.row_id : 'not in the copy' })); continue;
      }
      if (LI.LISTS[h.table]) {
        const spec = LI.LISTS[h.table], no = lastToken(h.row_id), name = spec.id === 'we_id' ? no : 'row ' + no;
        const r = SEL.rowsOf(t, h.table, c.cp.sop_id, c.rev).find(x => String(x[spec.id]) === no);
        items.push(fieldItem(id, LIST_NAME[h.table] + ' · ' + name, LI.LABEL[h.field] || h.field, !!r, r ? r[h.field] : null, h,
          { main_at: LIST_NAME[h.table] + ' ' + name, copy_at: r ? name : 'not in the copy' })); continue;
      }
      fail('itemsOf', 'no item for ' + h.table + '.' + h.field);
    }
    const rowText = (h, lead) => String(h.new_value || '').replace(lead, '');
    for (const key of ops.retired) {
      const h = ch.rows.find(x => x.row_id === key && x.field === 'row');
      items.push(Object.assign({ id: 'steps|' + key + '|retired', kind: 'retired', where: 'Step ' + mainNo(key), what: 'Retired', state: cStep(key) ? 'change' : 'absent',
        main_new: rowText(h, /^retired: /), key: key }, stepAt(key)));
    }
    let lastAdded = {};
    for (const key of ops.added.map(k => ({ k: k, m: mSteps.find(s => s.key === k) })).sort((a, b) => (a.m ? a.m.seq : 0) - (b.m ? b.m.seq : 0)).map(x => x.k)) {
      const h = ch.rows.find(x => x.row_id === key && x.field === 'row');
      const m = mSteps.find(s => s.key === key);
      const no = mainNo(key);
      const it = Object.assign({ id: 'steps|' + key + '|added', kind: 'added', where: 'Step ' + no + ' (new)', what: 'New step', main_new: m ? no + ' ' + T.firstPart(m.action) : rowText(h, /^added: /), key: key },
        stepAt(key), { main_at: 'step ' + no + ' (' + key + '), new in the main' });
      if (whereIn(key).state === 'never') { it.copy_at = 'not in the copy yet'; }
      if (cStep(key)) { it.state = 'same'; } else if (!m) {
        const gone = t.history.find(x => x.sop_id === c.good.sop_id && x.table === 'steps' && x.row_id === key && x.field === 'row' && /^retired: /.test(String(x.new_value || '')) && x.hist_id > ch.last);
        it.state = 'blocked';
        it.why = 'The main no longer has step ' + key + (gone ? ' (main change ' + groupOf(t, c, gone.hist_id) + ' retired it)' : '') + ': skip this change.';
      } else if (!cSecs.some(s => s.section === m.section)) {
        it.state = 'blocked'; it.why = 'The copy has no section ' + m.section + ': add the section in the copy first, or skip this change.';
      } else {
        it.state = 'change';
        /* the first new step of a run in one section takes a place (build 47: the place says its level); the next ones of the same
           run follow it, as in the main */
        const prevInMain = mSteps[mSteps.indexOf(m) - 1], mainKind = isSub(no) ? 'sub' : 'step';
        if (prevInMain && lastAdded[m.section] === prevInMain.key) { it.place = { section: m.section, follows: prevInMain.key, main_kind: mainKind }; } else {
          const after = SY.predecessorKey(mSteps.filter(s => s.section === m.section).map(s => s.key), key, cSteps.filter(s => s.section === m.section).map(s => s.key));
          it.place = placeFrom(SY.placeOptions(cSteps, m.section, null), SY.defaultPlace(cSteps, m.section, after, mainKind, null), { section: m.section, main_kind: mainKind });
        }
        lastAdded[m.section] = key;
      }
      items.push(it);
    }
    for (const key of ops.moved) {
      const h = ch.rows.find(x => x.row_id === key && x.field === 'row');
      const s = cStep(key), m = mSteps.find(x => x.key === key);
      const it = Object.assign({ id: 'steps|' + key + '|moved', kind: 'moved', where: 'Step ' + (SY.numberOfRow(h.new_value) || mainNo(key)), what: 'Moved', state: s ? 'change' : 'absent',
        main_new: String(h.new_value), key: key }, stepAt(key), { main_at: 'step ' + (SY.numberOfRow(h.new_value) || mainNo(key)) + ' (' + key + ')' });
      if (s) {
        const after = SY.predecessorKey(mSteps.filter(x => m && x.section === m.section).map(x => x.key), key, cSteps.filter(x => x.section === s.section && x.key !== key).map(x => x.key));
        it.place = placeFrom(SY.placeOptions(cSteps, s.section, key), SY.defaultPlace(cSteps, s.section, after, isSub(s.step_no) ? 'sub' : 'step', key), { section: s.section });
      }
      items.push(it);
    }
    if (ops.section) { items.push(sectionItem(t, c, ops.section, cSecs, mSecs)); }
    for (const h of ops.lists) {
      const spec = LI.LISTS[h.table], no = lastToken(h.row_id), name = spec.id === 'we_id' ? no : 'row ' + no;
      const r = SEL.rowsOf(t, h.table, c.cp.sop_id, c.rev).find(x => String(x[spec.id]) === no);
      const where = LIST_NAME[h.table] + ' · ' + name;
      const at = { main_at: LIST_NAME[h.table] + ' ' + name, copy_at: r ? name + ' (' + String(r[spec.shown[0]] || '') + ')' : 'not in the copy' };
      if (/^removed: /.test(String(h.new_value))) {
        items.push(Object.assign({ id: h.table + '|' + h.row_id + '|removed', kind: 'list_removed', where: where, what: 'Removed', state: r ? 'change' : 'absent', main_new: rowText(h, /^removed: /), table: h.table, no: no }, at));
        continue;
      }
      const m = SEL.rowsOf(t, h.table, c.good.sop_id).find(x => x.rev === h.rev && String(x[spec.id]) === no);
      const it = Object.assign({ id: h.table + '|' + h.row_id + '|added', kind: 'list_added', where: where + ' (new)', what: 'New row', main_new: rowText(h, /^added: /), table: h.table, no: no, h: h }, at);
      if (!m) { it.state = 'blocked'; it.why = 'The main no longer has ' + where + ': skip this change.'; } else if (r) {
        const same = spec.typed.every(f => asText(r[f]) === asText(SY.rowAsAfter(h.table, m, laterRows(t, c, ch, h.table, h.row_id))[f]));
        it.state = same ? 'same' : 'blocked';
        if (!same) { it.why = 'The copy has its own ' + where + ' in ' + LIST_NAME[h.table] + ': add the row in the copy by hand, or skip this change.'; }
      } else { it.state = 'change'; }
      items.push(it);
    }
    for (const h of ops.pictures) {
      const id = h.row_id;
      const m = SEL.rowsOf(t, 'pictures', c.good.sop_id).find(x => x.rev === h.rev && x.picture_id === id);
      const p = SEL.rowsOf(t, 'pictures', c.cp.sop_id, c.rev).find(x => x.picture_id === id);
      const it = { id: 'pictures|' + id + '|added', kind: 'picture_added', where: id + ' (new)', what: 'New picture', main_new: rowText(h, /^added: /), picture_id: id, h: h,
        main_at: id, copy_at: p ? id + ' (' + String(p.caption).replace(/^Picture \d+:\s*/, '') + ')' : 'not in the copy yet' };
      if (!m) { it.state = 'blocked'; it.why = 'The main no longer has ' + id + ': skip this change.'; } else if (p) {
        it.state = p.file === m.file ? 'same' : 'blocked';
        if (it.state === 'blocked') { it.why = 'The copy has its own ' + id + ' (' + String(p.caption).replace(/^Picture \d+:\s*/, '') + '): add this picture in the copy with Add a picture, or skip this change.'; }
      } else { it.state = 'change'; }
      items.push(it);
    }
    for (const it of items) { it.words = STATE_WORDS[it.state]; }
    return items;
  }
  /* the main change that holds History row id (for the words of a later retire) */
  function groupOf(t, c, histId) {
    const g = SY.mainChanges(t.history, c.good.sop_id, 0).find(x => x.change_id <= histId && x.last >= histId);
    return g ? g.change_id : histId;
  }
  function sectionItem(t, c, op, cSecs, mSecs) {
    const cs = n => cSecs.find(s => s.section === n) || null, ms = n => mSecs.find(s => s.section === n) || null;
    const named = (n, x) => 'section ' + n + (x ? ' (' + x.name + ')' : '');
    if (op.kind === 'add') {
      const it = { id: 'sections|' + op.number + '|added', kind: 'section_added', where: 'Section ' + op.number + ' (new)', what: 'New section', main_new: op.name, op: op,
        main_at: 'section ' + op.number + ' (' + op.name + '), new in the main', copy_at: cs(op.number) ? named(op.number, cs(op.number)) : 'no section ' + op.number + ' in the copy yet' };
      const there = cs(op.number);
      if (there && there.name === op.name) { it.state = 'same'; return it; }
      if (op.after !== null && op.after !== 0) {
        const a = cs(op.after), b = ms(op.after);
        if (!a) { it.state = 'blocked'; it.why = 'The copy has no section ' + op.after + ': add the section in the copy by hand, or skip this change.'; return it; }
        if (b && a.name !== b.name) { it.state = 'blocked'; it.why = 'The copy\'s section ' + op.after + ' is \'' + a.name + '\', not \'' + b.name + '\': add the section in the copy by hand, or skip this change.'; return it; }
      }
      it.state = 'change';
      return it;
    }
    if (op.kind === 'retire') {
      const it = { id: 'sections|' + op.number + '|retired', kind: 'section_retired', where: 'Section ' + op.number, what: 'Retired', main_new: op.name, op: op,
        main_at: 'section ' + op.number + ' (' + op.name + ')', copy_at: cs(op.number) ? named(op.number, cs(op.number)) : 'no section ' + op.number + ' in the copy' };
      const a = cs(op.number);
      if (!a) { it.state = 'absent'; return it; }
      if (a.name !== op.name) { it.state = 'blocked'; it.why = 'The copy\'s section ' + op.number + ' is \'' + a.name + '\', not \'' + op.name + '\': retire it in the copy by hand, or skip this change.'; return it; }
      it.state = 'change';
      return it;
    }
    const olds = Object.keys(op.map).map(Number).sort((a, b) => a - b);
    const it = { id: 'sections|moved', kind: 'section_moved', where: 'Sections', what: 'Moved', main_new: olds.map(o => o + ' to ' + op.map[o]).join(', '), op: op,
      main_at: olds.map(o => named(op.map[o], ms(op.map[o])) + ' (was ' + o + ')').join(', '), copy_at: olds.map(o => (cs(o) ? named(o, cs(o)) : 'no section ' + o)).join(', ') };
    for (const o of olds) {
      const a = cs(o), b = ms(op.map[o]);
      if (!a) { it.state = 'blocked'; it.why = 'The copy has no section ' + o + ': move the sections in the copy by hand, or skip this change.'; return it; }
      if (b && a.name !== b.name) { it.state = 'blocked'; it.why = 'The copy\'s section ' + o + ' is \'' + a.name + '\', not \'' + b.name + '\': move the sections in the copy by hand, or skip this change.'; return it; }
    }
    it.state = 'change';
    return it;
  }

  /* ---- doing a change in the copy ---- */
  const merge = (tb, r) => Object.assign({}, tb, r.tables);
  /* the copy's steps of one revision replaced; seq and holds by order (keys.renumber) */
  function copySteps(tb, c, inOrder) {
    const others = tb.steps.filter(s => !(s.sop_id === c.cp.sop_id && s.rev === c.rev));
    return others.concat(K.renumber(inOrder).steps);
  }
  /* where a new or moved step went: "Goes to section 3 of the copy, inside 3.2 Write serial number inside front wall, as 3.2.1." (build 47:
     the words of the Put it list: first, inside a step, after a step and its sub-steps, after a step or a sub-step) and the copy's steps
     renumbered by it */
  function outcome(steps, c, key, renumbered) {
    const mine = SEL.stepsOf({ steps: steps }, c.cp.sop_id, c.rev);
    const i = mine.findIndex(s => s.key === key), me = mine[i], prev = i > 0 && mine[i - 1].section === me.section ? mine[i - 1] : null;
    let words = SY.placeWords(prev, isSub(me.step_no) ? 'sub' : 'step', false);
    if (prev && !isSub(me.step_no) && isSub(prev.step_no)) {
      let p = i - 1;
      while (p > 0 && isSub(mine[p].step_no)) { p--; }
      words = SY.placeWords(mine[p], 'step', true);
    }
    const others = renumbered.filter(m => m.key !== key);
    return { number: me.step_no, section: me.section, after_key: prev ? prev.key : null,
      goes: 'Goes to section ' + me.section + ' of the copy, ' + words + ', as ' + me.step_no + '.',
      then: others.length ? 'Then in the copy: ' + others.slice(0, 6).map(m => m.old + ' becomes ' + m.new).join(', ') + (others.length > 6 ? ' and ' + (others.length - 6) + ' more' : '') + '.' : null };
  }
  /* run(t, c, ch, items, picks, places, ctx) → { refusals, item_id } or { tables, new_history, outs }: the change done in the copy, all or
     nothing; places = { key: the place id picked in Put it ("step|", "step|K" or "sub|K", build 47) } for a new or moved step (the place
     marked otherwise) */
  function run(t, c, ch, items, picks, places, ctx) {
    let tb = t;
    const fresh = [], outs = {};
    const stop = (id, message) => ({ refusals: [{ field: 'form', message: message }], item_id: id });
    const pickOf = it => (picks && picks[it.id] === 'main' ? 'main' : 'copy');
    const take = it => it.state === 'change' || (it.state === 'pick' && pickOf(it) === 'main');
    const out = r => { tb = merge(tb, r); fresh.push.apply(fresh, r.new_history || []); };
    const placeOf = it => {
      const id = places && Object.prototype.hasOwnProperty.call(places, it.key) ? places[it.key] : it.place.id;
      return it.place.options.find(o => o.id === id) || null;
    };
    const noPlace = it => stop(it.id, 'The place picked for step ' + String(it.where).replace(/^Step /, '').replace(/ \(new\)$/, '') + ' is not in section ' + it.place.section + ' of the copy.');
    /* 1. words and values */
    const byRow = {};
    for (const it of items.filter(x => x.kind === 'field' && take(x))) {
      const [table, rowId, field] = it.id.split('|');
      const k = table + '|' + rowId;
      (byRow[k] = byRow[k] || { table: table, row_id: rowId, changes: {}, first: it.id }).changes[field] = SY.coerceValue(table, field, it.main_new);
    }
    const header = {};
    let headerItem = null;
    for (const k of Object.keys(byRow)) {
      const g = byRow[k];
      if (g.table === 'sops' || g.table === 'sop_revisions') { Object.assign(header, g.changes); headerItem = headerItem || g.first; continue; }
      let r;
      if (g.table === 'steps') {
        r = MAIN.saveStep({ tables: tb, sop_id: c.cp.sop_id, rev: c.rev, key: g.row_id, changes: g.changes, ctx: ctxFor(tb, ctx, ch) });
        if (r.refusals) { const s = SEL.stepsOf(tb, c.cp.sop_id, c.rev).find(x => x.key === g.row_id); return stop(g.first, 'Step ' + (s ? s.step_no : g.row_id) + ' in the copy: ' + words(r.refusals)); }
      } else if (g.table === 'sections') {
        const n = Number(lastToken(g.row_id));
        r = CHART.saveSection({ tables: tb, sop_id: c.cp.sop_id, section: n, changes: g.changes, ctx: ctxFor(tb, ctx, ch) });
        if (r.refusals) { return stop(g.first, 'Section ' + n + ' in the copy: ' + words(r.refusals)); }
      } else if (g.table === 'pictures') {
        const p = SEL.rowsOf(tb, 'pictures', c.cp.sop_id, c.rev).find(x => x.picture_id === g.row_id);
        const next = Object.assign(copy(p), g.changes);
        const hist = E.historyRows({ table: 'pictures', row_id: g.row_id, sop_id: c.cp.sop_id, rev: c.rev, old: p, new: next, fields: Object.keys(g.changes), ctx: ctxFor(tb, ctx, ch), after: [] });
        r = { new_history: hist, tables: { pictures: tb.pictures.map(x => (x === p ? next : x)), history: tb.history.concat(hist) } };
      } else {
        const no = lastToken(g.row_id);
        r = CHART.saveRow({ tables: tb, sop_id: c.cp.sop_id, table: g.table, key: no, changes: g.changes, ctx: ctxFor(tb, ctx, ch) });
        if (r.refusals) { return stop(g.first, LIST_NAME[g.table] + ' row ' + no + ' in the copy: ' + words(r.refusals)); }
      }
      out(r);
    }
    if (Object.keys(header).length) {
      const r = CHART.saveHeader({ tables: tb, sop_id: c.cp.sop_id, changes: header, ctx: ctxFor(tb, ctx, ch) });
      if (r.refusals) { return stop(headerItem, 'The header of the copy: ' + words(r.refusals)); }
      out(r);
    }
    /* 2. pictures and list rows added or removed */
    for (const it of items.filter(x => x.kind === 'picture_added' && x.state === 'change')) {
      const m = SEL.rowsOf(tb, 'pictures', c.good.sop_id).find(x => x.rev === it.h.rev && x.picture_id === it.picture_id);
      const row = Object.assign(SY.rowAsAfter('pictures', m, laterRows(tb, c, ch, 'pictures', it.picture_id)), { sop_id: c.cp.sop_id, rev: c.rev });
      const hist = E.historyRows({ table: 'pictures', row_id: it.picture_id, sop_id: c.cp.sop_id, rev: c.rev, old: { row: null }, new: { row: it.h.new_value }, fields: ['row'], ctx: ctxFor(tb, ctx, ch), after: [] });
      out({ new_history: hist, tables: { pictures: tb.pictures.concat([row]), history: tb.history.concat(hist) } });
    }
    for (const it of items.filter(x => x.kind === 'list_added' && x.state === 'change')) {
      const spec = LI.LISTS[it.table];
      const m = SEL.rowsOf(tb, it.table, c.good.sop_id).find(x => x.rev === it.h.rev && String(x[spec.id]) === it.no);
      const row = Object.assign(SY.rowAsAfter(it.table, m, laterRows(tb, c, ch, it.table, it.h.row_id)), { sop_id: c.cp.sop_id, rev: c.rev });
      const hist = E.historyRows({ table: it.table, row_id: c.cp.sop_id + ' ' + c.rev + ' ' + it.no, sop_id: c.cp.sop_id, rev: c.rev, old: { row: null }, new: { row: it.h.new_value },
        fields: ['row'], ctx: ctxFor(tb, ctx, ch), after: [] });
      const tables = { history: tb.history.concat(hist) };
      tables[it.table] = tb[it.table].concat([row]);
      out({ new_history: hist, tables: tables });
    }
    for (const it of items.filter(x => x.kind === 'list_removed' && x.state === 'change')) {
      const r = CHART.removeRow({ tables: tb, sop_id: c.cp.sop_id, table: it.table, key: it.no, ctx: ctxFor(tb, ctx, ch) });
      if (r.refusals) { return stop(it.id, LIST_NAME[it.table] + ' row ' + it.no + ' in the copy: ' + words(r.refusals)); }
      out(r);
    }
    /* 3. steps retired (sub-steps before their step), added, moved */
    const seqOf = key => { const s = SEL.stepsOf(tb, c.cp.sop_id, c.rev).find(x => x.key === key); return s ? s.seq : 0; };
    for (const it of items.filter(x => x.kind === 'retired' && x.state === 'change').sort((a, b) => seqOf(b.key) - seqOf(a.key))) {
      const no = SEL.stepsOf(tb, c.cp.sop_id, c.rev).find(x => x.key === it.key).step_no;
      const r = CHART.retireStep({ tables: tb, sop_id: c.cp.sop_id, key: it.key, ctx: ctxFor(tb, ctx, ch) });
      if (r.refusals) { return stop(it.id, 'Step ' + no + ' in the copy: ' + words(r.refusals)); }
      out(r);
      outs[it.id] = { goes: 'Retires step ' + no + ' of the copy.' };
    }
    const adds = items.filter(x => x.kind === 'added' && x.state === 'change');
    if (adds.length) {
      for (const it of adds) { if (!it.place.follows && !placeOf(it)) { return noPlace(it); } }
      const r = addSteps(tb, c, ch, adds, a => placeOf(a), ctx, outs);
      if (r.refusals) { return r; }
      out(r);
    }
    for (const it of items.filter(x => x.kind === 'moved' && x.state === 'change')) {
      const me = SEL.stepsOf(tb, c.cp.sop_id, c.rev).find(x => x.key === it.key);
      const o = placeOf(it);
      if (!o) { return noPlace(it); }
      const r = MAIN.moveStep({ tables: tb, sop_id: c.cp.sop_id, rev: c.rev, key: it.key, after_key: o.after_key, ctx: ctxFor(tb, ctx, ch) });
      if (r.refusals) {
        if (/is already there\.$/.test(words(r.refusals))) { outs[it.id] = Object.assign(outcome(tb.steps, c, it.key, []), { goes: 'Already in that place in the copy (' + me.step_no + ').', then: null }); continue; }
        return stop(it.id, 'Step ' + me.step_no + ' in the copy: ' + words(r.refusals));
      }
      out(r);
      outs[it.id] = outcome(tb.steps, c, it.key, r.renumbered || []);
    }
    /* 4. a section added, retired or moved */
    const sec = items.find(x => /^section_/.test(x.kind) && x.state === 'change');
    if (sec) {
      let r;
      if (sec.kind === 'section_added') { r = CHART.addSection({ tables: tb, sop_id: c.cp.sop_id, name: sec.op.name, after: sec.op.after, ctx: ctxFor(tb, ctx, ch) }); }
      if (sec.kind === 'section_retired') { r = CHART.retireSection({ tables: tb, sop_id: c.cp.sop_id, section: sec.op.number, ctx: ctxFor(tb, ctx, ch) }); }
      if (sec.kind === 'section_moved') { const mv = SY.moveOfMap(sec.op.map); r = CHART.moveSection({ tables: tb, sop_id: c.cp.sop_id, section: mv.section, after: mv.after, ctx: ctxFor(tb, ctx, ch) }); }
      if (r.refusals) {
        if (/is already there\.$/.test(words(r.refusals))) { outs[sec.id] = { goes: 'Already in that order in the copy.' }; } else { return stop(sec.id, 'The sections of the copy: ' + words(r.refusals)); }
      } else {
        out(r);
        if (sec.kind === 'section_added') { outs[sec.id] = { goes: 'Goes in as section ' + r.new_section + ' of the copy.' }; }
      }
    }
    return { refusals: null, tables: tb, new_history: fresh, outs: outs };
  }
  /* new steps of the main, with their Keys and words, at the place picked (placeOf: the option of Put it; marked first: after the step
     before them in the main that the copy has); numbered as the Builder numbers a new step there (numberSection), a step or a sub-step as
     the place says (build 47: after a step = a step after its sub-steps; inside a step = its first sub-step; after a sub-step = the
     next sub-step). The new steps that follow the first one in the main follow it, one level up or down with it (two levels only). */
  function addSteps(tb, c, ch, adds, placeOf, ctx, outs) {
    const ms = SEL.stepsOf(tb, c.good.sop_id, mainRev(c));
    let order = SEL.stepsOf(tb, c.cp.sop_id, c.rev);
    const before = order.slice();
    const kinds = {}, fresh = [], shift = {};
    const stop = (id, message) => ({ refusals: [{ field: 'form', message: message }], item_id: id });
    const kindIn = r => kinds[r.key] || (isSub(r.step_no) ? 'sub' : 'step');
    const level = k => (k === 'sub' ? 2 : 1);
    for (const it of adds) {
      const m = ms.find(s => s.key === it.key);
      const row = Object.assign(SY.rowAsAfter('steps', m, laterRows(tb, c, ch, 'steps', m.key)), { sop_id: c.cp.sop_id, rev: c.rev });
      let after, kind, at;
      if (it.place.follows) {
        after = it.place.follows;
        kind = Math.min(2, Math.max(1, level(it.place.main_kind) + (shift[row.section] || 0))) === 2 ? 'sub' : 'step';
        at = order.findIndex(s => s.key === after) + 1;
      } else {
        const o = placeOf(it);
        after = o.after_key; kind = o.kind;
        shift[row.section] = level(kind) - level(it.place.main_kind);
        if (after !== null && !order.some(s => s.key === after && s.section === row.section)) { return stop(it.id, 'The place picked for step ' + row.step_no + ' is not in section ' + row.section + ' of the copy.'); }
        if (after === null) {
          at = order.findIndex(s => s.section === row.section);
          if (at < 0) { at = order.length; while (at > 0 && order[at - 1].section > row.section) { at--; } }
        } else {
          at = order.findIndex(s => s.key === after);
          /* a step after a step goes after that step's sub-steps */
          if (kind === 'step') { while (at + 1 < order.length && order[at + 1].section === row.section && kindIn(order[at + 1]) === 'sub') { at++; } }
          at++;
        }
      }
      order = order.slice(0, at).concat([row]).concat(order.slice(at));
      kinds[row.key] = kind;
      fresh.push(row.key);
    }
    const renumbered = [];
    for (const s of Array.from(new Set(fresh.map(k => order.find(x => x.key === k).section)))) {
      const rows = order.filter(x => x.section === s);
      const num = NU.numberSection(rows, kinds);
      if (num.refusals) { return stop(adds.find(a => order.find(x => x.key === a.key).section === s).id, 'Section ' + s + ' of the copy: ' + words(num.refusals)); }
      order = order.map(x => (x.section === s ? Object.assign({}, x, { step_no: num.numbers[x.key] }) : x));
      renumbered.push.apply(renumbered, num.renumbered);
    }
    for (const it of adds) {
      const s = order.find(x => x.key === it.key);
      const bad = E.checkStep(Object.assign({}, s, { seq: 1 }));
      if (bad.length) { return stop(it.id, 'Step ' + s.step_no + ' in the copy: ' + words(bad)); }
    }
    const steps = copySteps(tb, c, order);
    const broken = P.standardBroken(before, SEL.stepsOf({ steps: steps }, c.cp.sop_id, c.rev));
    if (broken) { return stop(adds[0].id, 'The copy: ' + words(broken)); }
    const cx = ctxFor(tb, ctx, ch);
    let hist = [];
    for (const k of fresh) {
      const s = steps.find(x => x.sop_id === c.cp.sop_id && x.rev === c.rev && x.key === k);
      hist = E.historyRows({ table: 'steps', row_id: k, sop_id: c.cp.sop_id, rev: c.rev, old: { row: null },
        new: { row: 'added: ' + s.step_no + ' ' + T.firstPart(s.action) + ' (from main change ' + ch.change_id + ', key ' + k + ')' }, fields: ['row'], ctx: cx, after: hist });
    }
    for (const it of adds) { outs[it.id] = outcome(steps, c, it.key, renumbered); }
    for (const m of renumbered) { hist = E.historyRows({ table: 'steps', row_id: m.key, sop_id: c.cp.sop_id, rev: c.rev, old: { step_no: m.old }, new: { step_no: m.new }, fields: ['step_no'], ctx: cx, after: hist }); }
    return { refusals: null, new_history: hist, tables: { steps: steps, history: tb.history.concat(hist) } };
  }

  /* planOf(t, c, ch, picks, places) → what the copy list and the pop-up show for one main change: the items, each with where it is in the
     main and in the copy, where a new or moved step goes (worked out by doing the change on the tables handed in), and whether it
     can be applied; an item the change stops at is "Cannot apply" with the reason */
  function planOf(t, c, ch, picks, places) {
    const items = itemsOf(t, c, ch, SY.opsOf(ch.rows));
    for (const it of items) { if (it.key && places && Object.prototype.hasOwnProperty.call(places, it.key)) { pickPlace(it, places[it.key]); } }
    const blocked = items.find(i => i.state === 'blocked');
    let why = blocked ? blocked.why : null;
    if (!why) {
      const r = run(t, c, ch, items, picks || {}, places || {}, { who: 'check', now: ch.at });
      if (r.refusals) {
        why = words(r.refusals);
        const it = items.find(i => i.id === r.item_id);
        if (it) { it.state = 'blocked'; it.words = STATE_WORDS.blocked; it.why = why; }
      } else {
        for (const it of items) {
          const o = r.outs[it.id];
          if (!o) { continue; }
          it.goes = o.goes; it.then = o.then || null;
          if (it.place && o.number) { it.place.number = o.number; }
        }
      }
    }
    return { change_id: ch.change_id, at: ch.at, who: ch.who, rev: ch.rev, reason: ch.reason, items: items, can_apply: !why, why: why,
      picks: items.filter(i => i.state === 'pick').map(i => i.id), places: items.filter(i => i.place && !i.place.follows).map(i => i.key),
      summary: SY.summaryOf(items.map(i => i.where + ' · ' + i.what)) };
  }

  /* copyChanges({ tables, sop_id }) → { copy_id, copy_name, main_id, saved_hist, changes: [plan] } (the list on the copy) */
  function copyChanges(input) {
    need(input, ['tables', 'sop_id'], 'copyChanges');
    const t = input.tables, c = familyOf(t, input.sop_id, 'copyChanges');
    const pend = SY.pendingChanges(t.history, c.good.sop_id, c.cp.sop_id);
    return { copy_id: c.cp.sop_id, copy_name: c.name, main_id: c.good.sop_id, saved_hist: SY.savedAt(t.history, c.cp.sop_id), changes: pend.map(ch => planOf(t, c, ch)) };
  }
  /* pendingCount(tables, copyId) → how many main changes wait for the copy (the SOP line and the SOP list) */
  function pendingCount(tables, copyId) {
    const cp = SEL.sopOf(tables, copyId);
    return CP.isCopy(cp) ? SY.pendingChanges(tables.history, cp.copy_of, copyId).length : 0;
  }
  /* changeAfterSave({ tables, sop_id, change_id }) → [{ copy_id, copy_name, plan }]: the copies of the main SOP that the save is offered to */
  function changeAfterSave(input) {
    need(input, ['tables', 'sop_id', 'change_id'], 'changeAfterSave');
    const t = input.tables;
    const out = [];
    for (const x of CP.copiesOf(t, input.sop_id)) {
      const c = familyOf(t, x.sop_id, 'changeAfterSave');
      if (c.good.sop_id !== input.sop_id) { continue; }
      const ch = SY.pendingChanges(t.history, c.good.sop_id, c.cp.sop_id).find(g => g.change_id === input.change_id);
      if (ch) { out.push({ copy_id: c.cp.sop_id, copy_name: c.name, plan: planOf(t, c, ch) }); }
    }
    return out;
  }
  function pendingOf(t, c, changeId) {
    const ch = SY.pendingChanges(t.history, c.good.sop_id, c.cp.sop_id).find(g => g.change_id === changeId);
    if (ch) { return { ch: ch }; }
    const d = SY.decisionsOf(t.history, c.cp.sop_id)[changeId];
    return refuse(d ? 'Main change ' + changeId + ' was ' + d.state + ' already (' + String(d.at).slice(0, 16).replace('T', ' ') + ', ' + d.who + ').'
      : 'Main change ' + changeId + ' is not waiting for copy ' + c.name + '.');
  }
  /* previewMainChange({ tables, sop_id, change_id, picks, places }) → the plan with the places picked (build 46: the place pop-up shows
     where each new or moved step goes, and the numbers it changes, before anything is written) */
  function previewMainChange(input) {
    need(input, ['tables', 'sop_id', 'change_id'], 'previewMainChange');
    const t = input.tables, c = familyOf(t, input.sop_id, 'previewMainChange');
    const p = pendingOf(t, c, input.change_id);
    if (p.refusals) { return p; }
    return planOf(t, c, p.ch, input.picks || {}, input.places || {});
  }
  function decision(tb, c, ch, state, summary, ctx) {
    const cx = ctxFor(tb, ctx, ch);
    return E.historyRows({ table: 'sops', row_id: c.cp.sop_id, sop_id: c.cp.sop_id, rev: null, old: { row: null }, new: { row: SY.decisionText(state, ch.change_id, summary) },
      fields: ['row'], ctx: cx, after: [] });
  }
  /* applyMainChange({ tables, sop_id, change_id, picks, places, ctx }) → { refusals } or { refusals: null, new_history, tables, outs };
     picks = { item id: 'main' } for a Pick to take the main's words (the copy's words stay otherwise); places = { key: after key | null }
     for a new or moved step (the place shown otherwise) */
  function applyMainChange(input) {
    need(input, ['tables', 'sop_id', 'change_id', 'ctx'], 'applyMainChange');
    E.checkCtx(input.ctx, 'applyMainChange');
    const t = input.tables, c = familyOf(t, input.sop_id, 'applyMainChange');
    const p = pendingOf(t, c, input.change_id);
    if (p.refusals) { return p; }
    const items = itemsOf(t, c, p.ch, SY.opsOf(p.ch.rows));
    const blocked = items.find(i => i.state === 'blocked');
    if (blocked) { return refuse(blocked.why); }
    const r = run(t, c, p.ch, items, input.picks || {}, input.places || {}, input.ctx);
    if (r.refusals) { return { refusals: r.refusals }; }
    const d = decision(r.tables, c, p.ch, 'applied', SY.summaryOf(items.map(i => i.where + ' · ' + i.what)), input.ctx);
    const tables = { history: r.tables.history.concat(d) };
    for (const k of Object.keys(r.tables)) { if (k !== 'history' && r.tables[k] !== t[k]) { tables[k] = r.tables[k]; } }
    return { refusals: null, new_history: r.new_history.concat(d), tables: tables, outs: r.outs };
  }
  /* skipMainChange({ tables, sop_id, change_id, ctx }) → { refusals } or { refusals: null, new_history, tables }: only the History row */
  function skipMainChange(input) {
    need(input, ['tables', 'sop_id', 'change_id', 'ctx'], 'skipMainChange');
    E.checkCtx(input.ctx, 'skipMainChange');
    const t = input.tables, c = familyOf(t, input.sop_id, 'skipMainChange');
    const p = pendingOf(t, c, input.change_id);
    if (p.refusals) { return p; }
    const items = itemsOf(t, c, p.ch, SY.opsOf(p.ch.rows));
    const d = decision(t, c, p.ch, 'skipped', SY.summaryOf(items.map(i => i.where + ' · ' + i.what)), input.ctx);
    return { refusals: null, new_history: d, tables: { history: t.history.concat(d) } };
  }

  return { copyChanges, pendingCount, changeAfterSave, previewMainChange, applyMainChange, skipMainChange, STATE_WORDS };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_SYNC_MAIN;
