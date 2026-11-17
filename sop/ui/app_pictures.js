/* SOP Builder: Add a picture to a step and ✕ to take one off (spec/example_pictures.md, build 43). wireAdd(area, done): the
   "Add a picture" and the picture ✕ buttons of the step cards in area; done(r, ctx) writes the tables and redraws. The pop-up lists
   the pictures made for the step (source/Pictures/ready/ready.json), the pictures the SOP has, and a picture file to choose; each
   goes through the Reason pop-up (none in draft mode or a copy); a new picture's file is copied to source/Pictures (never over a
   file). Classic script (global APP_PICTURES); loaded after ui/app.js. */
const APP_PICTURES = (function () {
  const $ = APP.el, esc = RENDER.esc, guard = APP.guard;
  const READY_DIR = CONFIG.pictures_dir + '/ready', READY_LIST = READY_DIR + '/ready.json';
  const num = id => { const m = /^Picture (\d+)$/.exec(String(id)); return m ? Number(m[1]) : null; };
  const cur = () => { const v = APP.state.view; return { sop_id: v.sop.sop_id, rev: v.sop.current_rev, short: v.sop.short }; };
  const stepOf = key => { const c = cur(); return APP.state.tables.steps.find(s => s.sop_id === c.sop_id && s.rev === c.rev && s.key === key) || null; };
  const sopPictures = () => {
    const c = cur();
    return (APP.state.tables.pictures || []).filter(p => p.sop_id === c.sop_id && p.rev === c.rev && num(p.picture_id) !== null)
      .sort((a, b) => num(a.picture_id) - num(b.picture_id));
  };
  const ctxOf = async reason => ({ who: APP.state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: reason });
  /* the pictures made for TANK01-0120 and the like: ready.json, { pictures: [{ file | use, short, key, step_no, caption }] } */
  async function readyFor(key) {
    try {
      if (!(await STORE.fileExists(READY_LIST))) { return []; }
      const list = JSON.parse(await (await fetch(await STORE.fileURL(READY_LIST))).text());
      const c = cur();
      return (list.pictures || []).filter(x => x.key === key && (!x.short || x.short === c.short));
    } catch (e) { console.log('[ui] ready pictures cannot be read: ' + e.message); return []; }
  }
  const named = (st, id) => ['action', 'warning', 'check', 'if_fail', 'skip_if'].some(f => new RegExp('\\b' + id + '\\b').test(String(st[f] || '')));
  function close() { const b = $('pic-back'); if (b) { b.remove(); } }

  async function open(key, done) {
    const st = stepOf(key);
    if (!st) { return null; }
    const have = sopPictures();
    const ready = await readyFor(key);
    /* a picture made for the step is in the SOP already when a picture has its caption */
    const made = ready.map((x, i) => {
      if (x.use) { const p = have.find(h => h.picture_id === x.use); return { i: i, use: x.use, caption: p ? String(p.caption).replace(/^Picture \d+:\s*/, '') : x.caption || '', path: p ? p.file : null }; }
      const p = have.find(h => String(h.caption).replace(/^Picture \d+:\s*/, '') === String(x.caption).trim());
      return { i: i, added_as: p ? p.picture_id : null, caption: x.caption, path: READY_DIR + '/' + x.file, file: x.file };
    });
    const onStep = have.filter(h => named(st, h.picture_id)).map(h => h.picture_id);
    close();
    document.body.insertAdjacentHTML('beforeend', RENDER_POP.picturePop(st.step_no, made, have.map(h => ({ id: h.picture_id, caption: h.caption })), onStep));
    console.log('[ui] Add a picture to step ' + st.step_no + ': ' + made.length + ' made for it, ' + have.length + ' in the SOP');
    for (const t of $('pic-pop').querySelectorAll('.pic-thumb')) {
      const m = made[Number(t.dataset.i)];
      if (!m || !m.path) { t.innerHTML = ''; continue; }
      APP_PHOTOS.load({ file: m.path, name: m.caption }).then(r => { t.innerHTML = r.url ? '<img src="' + esc(r.url) + '" alt="">' : '<span class="thumb-why">' + esc(r.why) + '</span>'; });
    }
    const say = refs => { $('pic-refusal').textContent = refs.map(x => x.message).join(' · '); };
    const run = (what, input, blobOf) => APP_REASON.ask(what, async function (reason, dry) {
      const ctx = await ctxOf(reason);
      const files = input.picture_id ? [] : await STORE.listFiles(CONFIG.pictures_dir);
      const r = ENGINE_CHART.addPicture(Object.assign({ tables: APP.state.tables, sop_id: cur().sop_id, key: key, files: files, ctx: ctx }, input));
      if (r.refusals) { return r.refusals; }
      if (dry) { return null; }
      if (r.file) {
        const blob = await blobOf();
        await STORE.writePhoto(r.file.path, blob);
        console.log('[ui → store] picture ' + r.file.path + ' (' + blob.size + ' bytes)');
      }
      close();
      await done(r, ctx);
      return null;
    }, say);
    for (const b of $('pic-pop').querySelectorAll('.btn-pic-made')) {
      b.onclick = () => guard('ui addPicture', function () {
        const m = made[Number(b.dataset.i)];
        const id = m.use || m.added_as;
        if (id) { return run('Add ' + id + ' to step ' + st.step_no, { picture_id: id }); }
        return run('Add a picture to step ' + st.step_no, { caption: m.caption, upload_name: m.file },
          async () => (await fetch(await STORE.fileURL(m.path))).blob());
      });
    }
    if ($('btn-pic-use')) {
      $('btn-pic-use').onclick = () => guard('ui usePicture', () => run('Add ' + $('pic-have').value + ' to step ' + st.step_no, { picture_id: $('pic-have').value }));
    }
    let picked = null;
    $('btn-pic-file').onclick = () => guard('ui pickPicture', function () {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.png,.jpg,.jpeg,image/png,image/jpeg'; input.style.display = 'none';
      $('pic-pop').appendChild(input);
      input.onchange = () => { picked = input.files && input.files[0] ? input.files[0] : null; input.remove(); $('pic-file-name').textContent = picked ? picked.name : ''; $('btn-pic-file-add').disabled = !picked; };
      input.click();
      return null;
    });
    $('btn-pic-file-add').onclick = () => guard('ui addPictureFile', function () {
      if (!picked) { return null; }
      return run('Add a picture to step ' + st.step_no, { caption: $('pic-caption').value, upload_name: picked.name }, async () => picked);
    });
    $('btn-pic-close').onclick = close;
    $('pic-back').onkeydown = e => { if (e.key === 'Escape' && !$('pop-back')) { e.preventDefault(); close(); } };
    return null;
  }

  function wireAdd(area, done) {
    for (const b of area.querySelectorAll('.btn-pic-add')) {
      b.onclick = () => guard('ui openPictures', () => open(b.dataset.key, done));
    }
    for (const b of area.querySelectorAll('.btn-pic-del')) {
      b.onclick = () => guard('ui removePicture', function () {
        const key = b.dataset.key, id = b.dataset.pic, st = stepOf(key);
        const slot = b.closest('.photo-tools').querySelector('.photo-slot');
        return APP_REASON.ask('Take ' + id + ' off step ' + (st ? st.step_no : key), async function (reason, dry) {
          const ctx = await ctxOf(reason);
          const r = ENGINE_CHART.removePicture({ tables: APP.state.tables, sop_id: cur().sop_id, key: key, picture_id: id, ctx: ctx });
          if (r.refusals) { return r.refusals; }
          if (dry) { return null; }
          await done(r, ctx);
          return null;
        }, refs => { slot.innerHTML = '<span class="refusal">' + esc(refs.map(x => x.message).join(' · ')) + '</span>'; });
      });
    }
  }

  return { wireAdd, open, close };
})();
