/* SOP Builder screen builders for the pop-ups (example_flow.md parts 18.3
   to 18.5): the Reason pop-up, the yes or no pop-up (Delete note), the
   small images of a step card and the photo viewer. HTML from data only.
   Classic script (global RENDER_POP). */
const RENDER_POP = (function () {
  const esc = RENDER.esc;

  /* reasonPop(what, last): what = the change ("Move 9.4 up"); last = the last reasons, newest first */
  function reasonPop(what, last) {
    return '<div class="pop-back" id="pop-back"><div class="pop" id="reason-pop" role="dialog" aria-modal="true" aria-labelledby="reason-title">' +
      '<div class="pop-title" id="reason-title">Reason for change</div><div class="pop-what" id="reason-what">' + esc(what) + '</div>' +
      '<input id="reason-text" size="56" autocomplete="off">' +
      '<div class="note">One line, written to History. Example: Datum given by Divyal.</div>' +
      (last.length ? '<div class="reason-last">Last reasons: ' + last.map((r, i) => '<button class="reason-pick" data-i="' + i + '">' + esc(r) + '</button>').join(' ') + '</div>' : '') +
      '<div class="refusal" id="reason-refusal"></div><div class="pop-btns"><button id="btn-reason-ok">OK</button> <button id="btn-reason-cancel">Cancel</button></div></div></div>';
  }
  /* renumberPop(p, what): the Renumber pop-up before anything is saved (example_renumber.md part 6); p = ENGINE_CHART.renumberPreview(...) */
  function renumberPop(p, what) {
    const W = RENDER_FLOW.whereOf, cut = s => { const t = String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' '); return t.length > 140 ? t.slice(0, 140) + '…' : t; };
    let h = '<div class="pop-back" id="pop-back"><div class="pop pop-wide" id="renum-pop" role="dialog" aria-modal="true" aria-labelledby="renum-what">' +
      '<div class="pop-title">Renumber</div><div class="pop-what" id="renum-what">' + esc(what) + '</div>' +
      '<div class="renum-steps" id="renum-steps"><b>Steps:</b> ' + p.steps.map(x => esc(x.old) + ' → ' + esc(x.new)).join(', ') + '</div>';
    if (p.texts.length) {
      h += '<div class="renum-head">These texts name the old numbers and change too. Untick one to leave it as it is:</div><div class="renum-list" id="renum-list">' +
        p.texts.map(x => '<label class="renum-row"><input type="checkbox" class="renum-tick" data-id="' + esc(x.id) + '" checked> <span class="renum-where">' + esc(W(x)) + '</span> ' +
          '<span class="renum-map">' + x.mentions.map(m => esc(m.old) + ' → ' + esc(m.new)).join(', ') + '</span><span class="renum-new">' + esc(cut(x.new_text)) + '</span></label>').join('') + '</div>';
    } else {
      h += '<div class="renum-head muted">No text names these numbers.</div>';
    }
    const named = p.stale.filter(x => x.mentions.some(m => m.new === null));
    if (named.length) {
      h += '<div class="renum-head">These texts name a deleted or clubbed step. Renumber leaves them; fix them on the Texts to check tab:</div>' +
        '<div class="renum-stale" id="renum-stale">' + named.map(x => esc(W(x))).join(' · ') + '</div>';
    }
    if (p.collide.length) {
      const which = p.collide.map(c => ({ x: p.stale.find(x => x.table + '|' + x.ref + '|' + x.field === c.id), nos: c.nos })).filter(w => w.x);
      h += '<div class="renum-warn" id="renum-warn">After Renumber, ' + which.map(w => esc(W(w.x)) + ' (' + w.nos.map(esc).join(', ') + ')').join(', ') +
        (which.length === 1 ? ' names another step' : ' name other steps') + ' until fixed.</div>';
    }
    return h + '<div class="refusal" id="renum-refusal"></div><div class="pop-btns"><button id="btn-renum-ok">Renumber</button> <button id="btn-renum-cancel">Cancel</button></div></div></div>';
  }
  /* fixesPop(list): Apply all suggestions (example_renumber.md part 10): each text with a suggestion, ticked, with its new text */
  function fixesPop(list) {
    const W = RENDER_FLOW.whereOf, cut = s => { const t = String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' '); return t.length > 160 ? t.slice(0, 160) + '…' : t; };
    const rows = list.filter(m => m.suggested);
    return '<div class="pop-back" id="pop-back"><div class="pop pop-wide" id="fixes-pop" role="dialog" aria-modal="true" aria-labelledby="fixes-what">' +
      '<div class="pop-title">Texts to check</div><div class="pop-what" id="fixes-what">Apply all suggestions</div>' +
      '<div class="renum-head">These texts change. Untick one to leave it as it is:</div><div class="renum-list" id="fixes-list">' +
      rows.map(m => '<label class="renum-row"><input type="checkbox" class="renum-tick" data-id="' + esc(m.id) + '" checked> <span class="renum-where">' + esc(W(m)) + '</span> ' +
        '<span class="renum-map">' + m.options.map(o => esc(o.old) + ' → ' + esc(o.use)).join(', ') + '</span><span class="renum-new">' + esc(cut(m.suggested)) + '</span></label>').join('') + '</div>' +
      '<div class="refusal" id="fixes-refusal"></div><div class="pop-btns"><button id="btn-fixes-ok">Apply</button> <button id="btn-fixes-cancel">Cancel</button></div></div></div>';
  }
  /* askPop(what, text, okWord): a yes or no question */
  function askPop(what, text, okWord) {
    return '<div class="pop-back" id="pop-back"><div class="pop" id="ask-pop" role="dialog" aria-modal="true"><div class="pop-what" id="ask-what">' + esc(what) + '</div>' +
      '<p>' + esc(text) + '</p><div class="pop-btns"><button id="btn-ask-ok">' + esc(okWord) + '</button> <button id="btn-ask-cancel">Cancel</button></div></div></div>';
  }
  /* thumbs(key, images): the "Photos and pictures" row of a step card; images = ENGINE_TEXT.stepImages(...) in the step view */
  function thumbs(key, images) {
    if (!images || !images.length) { return '<span class="empty">none</span>'; }
    return '<div class="thumbs" data-key="' + esc(key) + '">' + images.map((m, i) => '<button class="thumb" data-i="' + i + '" title="' + esc(m.name + (m.label ? ' · ' + m.label : '')) + '">' +
      '<span class="thumb-img"><span class="thumb-wait">…</span></span><span class="thumb-name">' + esc(m.name) + '</span>' +
      (m.label ? '<span class="thumb-label">' + esc(m.label) + '</span>' : '') + '</button>').join('') + '</div>';
  }
  /* viewer(m, i, n, url, why): one image of a step over the page, i of n; url null → the reason it cannot show (why) */
  function viewer(m, i, n, url, why) {
    return '<div class="pop-back viewer-back" id="viewer"><div class="viewer" role="dialog" aria-modal="true" aria-label="' + esc(m.name) + '">' +
      '<button class="viewer-close" id="viewer-close" title="Close (Esc)">✕</button>' +
      (n > 1 ? '<button class="viewer-prev" id="viewer-prev" title="The one before (←)">◀</button><button class="viewer-next" id="viewer-next" title="The next one (→)">▶</button>' : '') +
      (url ? '<img class="viewer-img" id="viewer-img" src="' + esc(url) + '" alt="' + esc(m.name) + '">' : '<div class="viewer-none" id="viewer-none">' + esc(m.name) + ' ' + esc(why) + '</div>') +
      '<div class="viewer-cap" id="viewer-cap"><b>' + esc(m.name) + '</b>' + (m.label ? ' · ' + esc(m.label) : '') + ' <span class="muted">' + (i + 1) + ' of ' + n + '</span></div></div></div>';
  }

  /* picturePop(stepNo, made, have, onStep): Add a picture to a step (example_pictures.md part 5, build 43); made = the pictures made for
     this step ([{ i, caption, use, added_as }]: use = a picture the SOP has, added_as = this one is in the SOP already), have = the
     pictures of the SOP ([{ id, caption }]), onStep = the ids the step names */
  function picturePop(stepNo, made, have, onStep) {
    const row = m => {
      const id = m.use || m.added_as;
      const on = id && onStep.indexOf(id) >= 0;
      const btn = on ? '<span class="muted">' + esc(id) + ' · on this step</span>'
        : '<button class="btn-pic-made" data-i="' + m.i + '">' + (id ? 'Use ' + esc(id) + ' on this step' : 'Add') + '</button>';
      return '<div class="pic-row"><span class="pic-thumb" data-i="' + m.i + '"><span class="thumb-wait">…</span></span><span class="pic-cap">' +
        (id ? '<b>' + esc(id) + '</b>: ' : '') + esc(m.caption) + '</span>' + btn + '</div>';
    };
    const free = have.filter(h => onStep.indexOf(h.id) < 0);
    return '<div class="pop-back" id="pic-back"><div class="pop pic-pop" id="pic-pop" role="dialog" aria-modal="true"><div class="pop-what" id="pic-what">Add a picture to step ' + esc(stepNo) + '</div>' +
      '<div class="pic-sec"><b>Made for this step</b> <span class="muted">(from the 3D model and the drawings)</span>' +
      (made.length ? made.map(row).join('') : '<p class="muted" id="pic-none">None made for this step.</p>') + '</div>' +
      '<div class="pic-sec"><b>A picture this SOP has</b><div class="pic-line">' +
      (free.length ? '<select id="pic-have">' + free.map(h => '<option value="' + esc(h.id) + '">' + esc(h.caption) + '</option>').join('') + '</select> <button id="btn-pic-use">Use on this step</button>'
        : '<span class="muted">Every picture of this SOP is on this step.</span>') + '</div></div>' +
      '<div class="pic-sec"><b>A picture file (.png or .jpg)</b><div class="pic-line"><button id="btn-pic-file">Choose the file</button> <span id="pic-file-name" class="muted"></span></div>' +
      '<label>Caption <input id="pic-caption" maxlength="120"></label><div class="note">What the picture shows, in simple words. Example: Nipple, coupling and end plug on the RHS wall.</div>' +
      '<div class="pic-line"><button id="btn-pic-file-add" disabled>Add this picture</button></div></div>' +
      '<div class="refusal" id="pic-refusal"></div><div class="pop-btns"><button id="btn-pic-close">Close</button></div></div></div>';
  }

  /* ---- build 58 (example_edit_online.md part 10): the marks on a copy's step card and Compare for that step ---- */
  const fieldWords = fields => fields.map(f => (ENGINE_EDIT.LABEL[f] || f)).join(', ');
  /* markTitles(m, good) → { red, blue }: the words under the pointer; m = one entry of ENGINE_COPIES.stepMarks(...).marks */
  function markTitles(m, good) {
    const red = !m.red ? null : (m.red_new ? 'A new step: not in the good version ' + good + '.' : 'Differs from the good version ' + good + ': ' + fieldWords(m.red_fields) + '.');
    const blue = !m.blue ? null : m.blue_by.map(b => 'Changed in copy ' + b.copy_name + (b.owner ? ' (' + b.owner + ')' : '') + '; differs from this copy in ' + fieldWords(b.fields) + '.').join(' ');
    return { red: red, blue: blue };
  }
  /* marks(key, m, good): the small marks at the bottom right of a step card, red left of blue; a click opens Compare */
  function marks(key, m, good) {
    const tt = markTitles(m, good);
    const one = (kind, words) => '<button class="mark mark-' + kind + '" data-key="' + esc(key) + '" title="' + esc(words + ' Click to compare this step.') + '" aria-label="' + esc(words) + '"></button>';
    return '<span class="step-marks" data-key="' + esc(key) + '">' + (tt.red ? one('red', tt.red) : '') + (tt.blue ? one('blue', tt.blue) : '') + '</span>';
  }
  /* stepComparePop(c): c = ENGINE_COPIES.stepCompare(...); one column per version, one row per field that is not the same everywhere; a
     value of this copy that differs from the good version's is tinted red, a value of another copy that differs from this copy's blue */
  function stepComparePop(c) {
    const cell = v => (v === null ? '<span class="empty">(empty)</span>' : esc(v));
    let h = '<div class="pop-back" id="pop-back"><div class="pop pop-wide" id="stepcmp-pop" role="dialog" aria-modal="true" aria-labelledby="stepcmp-what">' +
      '<div class="pop-title">Compare</div><div class="pop-what" id="stepcmp-what">Compare step ' + esc(c.step_no) + ' (' + esc(c.key) + ')</div>';
    if (!c.rows.length) {
      h += '<p class="muted" id="stepcmp-same">Nothing differs here from the good version' + (c.columns.length > 2 ? ' or the other copies' : '') + '.</p>';
    } else {
      h += '<table class="grid stepcmp" id="stepcmp-table"><tr><th>Field</th>' + c.columns.map(col => '<th class="col-' + esc(col.kind) + '">' + esc(col.label) +
        '<br><span class="muted">' + (col.missing ? 'not in this version' : 'step ' + esc(col.step_no)) + '</span></th>').join('') + '</tr>';
      for (const r of c.rows) {
        h += '<tr data-field="' + esc(r.field) + '"><th>' + esc(r.label) + '</th>' + c.columns.map(function (col, i) {
          if (col.missing) { return '<td class="missing"><span class="empty">not in this version</span></td>'; }
          const tint = (col.kind === 'this' && !c.columns[1].missing && r.values[0] !== r.values[1]) ? ' diff-red' : (col.kind === 'copy' && r.values[i] !== r.values[0] ? ' diff-blue' : '');
          return '<td class="v' + tint + '">' + cell(r.values[i]) + '</td>';
        }).join('') + '</tr>';
      }
      h += '</table>';
    }
    return h + '<div class="note">Only shows; nothing is saved. Step numbers and order are not compared.</div><div class="pop-btns"><button id="btn-stepcmp-close">Close</button></div></div></div>';
  }

  /* releasePop(ask): build 59 (example_edit_online.md part 11.4), ask = ENGINE_RELEASE.releaseAsk(...): the warning line, what the release
     does, Go ahead or Cancel; Cancel has the focus, so Enter alone releases nothing */
  function releasePop(ask) {
    return '<div class="pop-back" id="pop-back"><div class="pop release-pop" id="release-pop" role="dialog" aria-modal="true" aria-labelledby="release-pop-line">' +
      '<div class="pop-title">' + esc(ask.title) + '</div><div class="pop-what release-catch" id="release-pop-line">⚠ ' + esc(ask.line) + '</div>' +
      '<ul class="release-lines" id="release-pop-lines">' + ask.lines.map((l, i) => '<li' + (i === ask.lines.length - 1 ? ' class="release-last"' : '') + '>' + esc(l) + '</li>').join('') + '</ul>' +
      '<div class="pop-btns"><button id="btn-relask-ok">' + esc(ask.ok) + '</button> <button id="btn-relask-cancel">' + esc(ask.cancel) + '</button></div></div></div>';
  }

  return { reasonPop, askPop, renumberPop, fixesPop, thumbs, viewer, picturePop, markTitles, marks, stepComparePop, releasePop };
})();
