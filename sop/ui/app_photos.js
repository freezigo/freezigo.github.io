/* SOP Builder: the small images of a step card and the photo viewer
   (example_flow.md part 18.5). wire(root, imagesByKey) fills every
   ".thumbs" row under root from the SOP App folder (STORE.fileURL; a
   photo sits in CONFIG.photos_dir, a Picture names its own file) and
   opens the viewer on a click: ◀ ▶ and the arrow keys through the step's
   images, ✕, Esc or a click beside the image closes it. Without the
   folder a small image says so. Classic script (global APP_PHOTOS);
   loaded after ui/app.js. */
const APP_PHOTOS = (function () {
  const $ = APP.el, esc = RENDER.esc;
  const cache = {};
  const pathOf = m => m.file || (CONFIG.photos_dir + '/' + m.name);
  const NO_FOLDER = '(opens with the SOP App folder)', MISSING = '(file not found)';
  /* load(m) → { url, why }: the file as a URL for <img>, or why it cannot show; kept for the visit */
  async function load(m) {
    const p = pathOf(m);
    if (cache[p]) { return cache[p]; }
    let r;
    try {
      if (!(await STORE.fileExists(p))) { r = { url: null, why: MISSING }; }
      else { const u = await STORE.fileURL(p); r = u ? { url: u, why: null } : { url: null, why: NO_FOLDER }; }
    } catch (e) { r = { url: null, why: NO_FOLDER }; }
    if (r.url || r.why === MISSING) { cache[p] = r; }
    return r;
  }
  function wire(root, imagesByKey) {
    for (const row of root.querySelectorAll('.thumbs')) {
      const images = imagesByKey[row.dataset.key] || [];
      for (const b of row.querySelectorAll('.thumb')) {
        const i = Number(b.dataset.i), m = images[i];
        if (!m) { continue; }
        load(m).then(r => {
          const slot = b.querySelector('.thumb-img');
          slot.innerHTML = r.url ? '<img src="' + esc(r.url) + '" alt="' + esc(m.name) + '">' : '<span class="thumb-why">' + esc(r.why) + '</span>';
        });
        b.onclick = e => { e.preventDefault(); APP.guard('ui viewer', () => open(images, i)); };
      }
    }
  }
  /* the viewer: one image at a time; the keys work while it is open */
  let keys = null;
  function close() {
    const v = $('viewer');
    if (v) { v.remove(); }
    if (keys) { document.removeEventListener('keydown', keys, true); keys = null; }
  }
  async function open(images, i) {
    const m = images[i], r = await load(m);
    close();
    document.body.insertAdjacentHTML('beforeend', RENDER_POP.viewer(m, i, images.length, r.url, r.why));
    console.log('[ui] viewer: ' + m.name + ' (' + (i + 1) + ' of ' + images.length + ')');
    const go = k => APP.guard('ui viewer', () => open(images, (k + images.length) % images.length));
    $('viewer-close').onclick = close;
    $('viewer').onclick = e => { if (e.target.id === 'viewer' || e.target.classList.contains('viewer')) { close(); } };
    if ($('viewer-prev')) { $('viewer-prev').onclick = e => { e.stopPropagation(); go(i - 1); }; $('viewer-next').onclick = e => { e.stopPropagation(); go(i + 1); }; }
    keys = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowLeft' && images.length > 1) { e.preventDefault(); e.stopPropagation(); go(i - 1); }
      else if (e.key === 'ArrowRight' && images.length > 1) { e.preventDefault(); e.stopPropagation(); go(i + 1); }
    };
    document.addEventListener('keydown', keys, true);
  }

  /* ---- photos by Key (build 34, example_new_sop.md part 12): Add an OK or a BAD photo, ✕ takes a name off Photo ref ---- */
  /* wireAdd(area, done): the photo buttons of the step cards in area; done(r, ctx) writes the tables and redraws */
  function wireAdd(area, done) {
    const state = APP.state;
    const sopId = () => state.view.sop.sop_id;
    const stepNo = key => { const s = state.tables.steps.find(x => x.key === key && x.sop_id === sopId() && x.rev === state.view.sop.current_rev); return s ? s.step_no : key; };
    const ctxOf = async reason => ({ who: state.editor, now: APP.nowIso(), next_hist_id: await STORE.nextId('history', 'hist_id'), reason: reason });
    const say = (slot, refs) => { slot.innerHTML = '<span class="refusal">' + esc(refs.map(x => x.message).join(' · ')) + '</span>'; };
    function pick(box, kind, defect) {
      const key = box.dataset.key, slot = box.querySelector('.photo-slot');
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.jpg,.jpeg,image/jpeg'; input.style.display = 'none';
      box.appendChild(input);
      input.onchange = () => APP.guard('ui addPhoto', function () {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) { return null; }
        const name = ENGINE_CHART.photoName({ files: state.files || [], key: key, kind: kind, defect: defect, upload_name: file.name });
        if (name.refusals) { say(slot, name.refusals); return null; }
        return APP_REASON.ask('Add photo ' + name.file + ' to ' + stepNo(key), async function (reason, dry) {
          const ctx = await ctxOf(reason);
          const r = ENGINE_CHART.photoRef({ tables: state.tables, sop_id: sopId(), key: key, add: name.file, ctx: ctx });
          if (r.refusals) { return r.refusals; }
          if (dry) { return null; }
          await STORE.writePhoto(name.path, file);
          delete cache[name.path];
          state.files = (state.files || []).concat([name.path]).sort();
          console.log('[ui → store] photo ' + name.path + ' (' + file.name + ', ' + file.size + ' bytes)');
          await done(r, ctx);
          return null;
        }, refs => say(slot, refs));
      });
      input.click();
    }
    for (const b of area.querySelectorAll('.btn-photo-add')) {
      b.onclick = () => APP.guard('ui photoAdd', function () {
        const box = b.closest('.photo-tools'), slot = box.querySelector('.photo-slot');
        if (b.dataset.kind === 'OK') { return pick(box, 'OK', null); }
        const defects = state.tables.defects || [];
        slot.innerHTML = '<label>The defect it shows <select class="photo-defect"><option value="">choose</option>' + defects.map(d => '<option value="' + esc(d.code) + '">' + esc(d.code + ' ' + d.name) + '</option>').join('') +
          '</select></label> <button class="btn-photo-pick">Choose the photo</button>';
        slot.querySelector('.btn-photo-pick').onclick = () => APP.guard('ui photoPick', () => pick(box, 'BAD', slot.querySelector('.photo-defect').value));
        return null;
      });
    }
    for (const b of area.querySelectorAll('.btn-photo-del')) {
      b.onclick = () => APP.guard('ui photoDel', function () {
        const key = b.dataset.key, file = b.dataset.file, slot = b.closest('.photo-tools').querySelector('.photo-slot');
        return APP_REASON.ask('Take ' + file + ' off ' + stepNo(key), async function (reason, dry) {
          const ctx = await ctxOf(reason);
          const r = ENGINE_CHART.photoRef({ tables: state.tables, sop_id: sopId(), key: key, remove: file, ctx: ctx });
          if (r.refusals) { return r.refusals; }
          if (dry) { return null; }
          await done(r, ctx);
          return null;
        }, refs => say(slot, refs));
      });
    }
  }

  return { wire, wireAdd, open, close, load };
})();
