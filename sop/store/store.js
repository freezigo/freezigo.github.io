/* SOP Builder storage layer. The only code that reads or writes \data.
   S0 to S2: JSON files under the SOP App folder, reached through the
   browser's folder picker (File System Access API). From S3: Supabase,
   same function names. Tests use useMemory(tables) instead of a folder.
   Build 52: useOnline({ tables, files }) holds the tables read from the
   ERP's Supabase (store/online.js) for the view-only page: reads as in
   memory, every write refused; pickSource() reads a picked SOP App folder
   for Put this PC's data online without leaving that mode.
   Every error names the place and the file. Classic script (global STORE). */
const STORE = (function () {
  let root = null;      // FileSystemDirectoryHandle of the SOP App folder
  let memory = null;    // { table: rows } when running on test data
  let mode = 'none';    // none | folder | memory | online (build 52: view only)
  const inMemory = () => mode === 'memory' || mode === 'online';
  const VIEW_ONLY = 'view only online: changes are made in the SOP Builder on Samrat\'s PC';
  /* build 56: the page that edits online saves through the database (store/online.js save), never through writeTable; photos,
     pictures, chart files and the final PDFs are not written online (build 57 brings photos, pictures and chart files) */
  let onlineEdit = false, maxNo = null, putFile = null;
  /* build 57: a folder with ARCHIVED.json (switch day) only reads: archived = what the file says ({} when it cannot be read), else null */
  let archived = null;
  const ONLINE_FILES = 'the final PDFs stay off the database (build 54): save the floor copy where you keep them';
  function noWrite(place) {
    if (mode === 'folder' && archived) { fail(place, ENGINE_ONLINE.archiveNote(archived)); }
    if (mode !== 'online') { return; }
    if (!onlineEdit) { fail(place, VIEW_ONLY); }
    if ((place === 'writePhoto' || place === 'copyChart') && putFile) { return; }
    fail(place, place === 'writeTable' ? 'online, a save goes to the database in one call (store/online.js save)' : ONLINE_FILES);
  }
  /* build 57: a file put online by this page joins the list of files and their links at once */
  function addFile(rel, url) {
    memory.__files = (memory.__files || []).filter(f => f !== rel).concat([rel]).sort();
    memory.__file_urls = Object.assign({}, memory.__file_urls || {}, { [rel]: url });
  }
  /* build 57: fileLinks() → { path: link } of the files the page knows online (the ones it put online since it loaded too) */
  function fileLinks() { return inMemory() && memory.__file_urls ? Object.assign({}, memory.__file_urls) : {}; }
  /* build 57: archiveInfo() → { line } for a folder that only reads since switch day, else null */
  function archiveInfo() { return mode === 'folder' && archived ? { line: ENGINE_ONLINE.archiveNote(archived) } : null; }
  async function readArchive(h) {
    try {
      const f = await (await h.getFileHandle(ENGINE_ONLINE.ARCHIVE_FILE)).getFile();
      try { return JSON.parse(await f.text()) || {}; } catch (e) { return {}; }
    } catch (e) { return null; }
  }

  function fail(place, msg) { throw new Error('store.' + place + ': ' + msg); }

  /* ---- IndexedDB: remember the folder handle between opens ---- */
  function idb() {
    return new Promise(function (res, rej) {
      const req = indexedDB.open(CONFIG.idb_name, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(new Error('store.idb: ' + req.error)); };
    });
  }
  function idbPut(key, val) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(new Error('store.idbPut: ' + tx.error)); };
      });
    });
  }
  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        req.onsuccess = function () { res(req.result || null); };
        req.onerror = function () { rej(new Error('store.idbGet: ' + req.error)); };
      });
    });
  }

  /* ---- folder ---- */
  async function pickFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      fail('pickFolder', 'this browser has no folder picker. Open the Builder in Chrome.');
    }
    const h = await window.showDirectoryPicker({ mode: 'readwrite' });
    await checkFolder(h);
    root = h; mode = 'folder'; memory = null;
    archived = await readArchive(h);
    /* remembered for Open folder next time; a browser that keeps nothing still opens the folder now (build 57) */
    try { await idbPut(CONFIG.idb_key, h); } catch (e) { console.log('[store] the folder is not remembered for next time: ' + e.message); }
    console.log('[store] folder picked: ' + h.name + (archived ? ' (archive: reads only)' : ''));
    return h.name;
  }
  async function reopenFolder() {
    const h = await idbGet(CONFIG.idb_key);
    if (!h) { return null; }
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted') { p = await h.requestPermission({ mode: 'readwrite' }); }
    if (p !== 'granted') { return null; }
    await checkFolder(h);
    root = h; mode = 'folder'; memory = null;
    archived = await readArchive(h);
    console.log('[store] folder reopened: ' + h.name + (archived ? ' (archive: reads only)' : ''));
    return h.name;
  }
  async function rememberedFolderName() {
    const h = await idbGet(CONFIG.idb_key);
    return h ? h.name : null;
  }
  async function checkFolder(h) {
    try { await h.getDirectoryHandle(CONFIG.data_dir); }
    catch (e) { fail('checkFolder', 'folder "' + h.name + '" has no "' + CONFIG.data_dir + '" folder. Pick the SOP App folder.'); }
  }
  async function dirHandle(relPath, create) {
    let d = root;
    for (const part of relPath.split('/')) {
      if (part) { d = await d.getDirectoryHandle(part, { create: !!create }); }
    }
    return d;
  }

  /* ---- tables ---- */
  /* build 69: an older file reads as this contract (the fields a table no longer has left out: engine/online.js asContract) */
  const asContract = (name, rows) => (typeof ENGINE_ONLINE !== 'undefined' ? ENGINE_ONLINE.asContract(name, rows) : rows);
  function checkShape(name, obj) {
    const file = CONFIG.data_dir + '/' + name + '.json';
    if (!obj || typeof obj !== 'object') { fail('readTable', file + ' is not a JSON object'); }
    if (obj.table !== name) { fail('readTable', file + ' says table "' + obj.table + '", expected "' + name + '"'); }
    const reads = CONFIG.contract_reads || [CONFIG.contract];
    if (reads.indexOf(obj.contract) < 0) { fail('readTable', file + ' is contract ' + obj.contract + ', the Builder needs ' + CONFIG.contract); }
    if (!Array.isArray(obj.rows)) { fail('readTable', file + ' has no rows list'); }
  }
  async function readTable(name) {
    if (CONFIG.tables.indexOf(name) < 0) { fail('readTable', 'unknown table "' + name + '"'); }
    if (inMemory()) {
      if (!(name in memory)) { fail('readTable', 'test data has no table "' + name + '"'); }
      const t = memory[name];
      checkShape(name, t);
      return { rows: asContract(name, JSON.parse(JSON.stringify(t.rows))), saved_at: t.saved_at, saved_by: t.saved_by };
    }
    if (mode !== 'folder') { fail('readTable', 'no folder picked yet'); }
    const file = CONFIG.data_dir + '/' + name + '.json';
    let text;
    try {
      const d = await dirHandle(CONFIG.data_dir);
      const fh = await d.getFileHandle(name + '.json');
      text = await (await fh.getFile()).text();
    } catch (e) { fail('readTable', file + ' cannot be read (' + e.message + ')'); }
    let obj;
    try { obj = JSON.parse(text); }
    catch (e) { fail('readTable', file + ' is not valid JSON (' + e.message + ')'); }
    checkShape(name, obj);
    console.log('[store → ui] read ' + file + ': ' + obj.rows.length + ' rows');
    return { rows: asContract(name, obj.rows), saved_at: obj.saved_at, saved_by: obj.saved_by };
  }
  async function writeTable(name, rows, savedBy, nowIso) {
    noWrite('writeTable');
    if (CONFIG.tables.indexOf(name) < 0) { fail('writeTable', 'unknown table "' + name + '"'); }
    if (!Array.isArray(rows)) { fail('writeTable', name + ': rows is not a list'); }
    if (!savedBy || !nowIso) { fail('writeTable', name + ': savedBy and nowIso are required'); }
    const obj = { table: name, contract: CONFIG.contract, saved_at: nowIso, saved_by: savedBy, rows: rows };
    if (mode === 'memory') { memory[name] = JSON.parse(JSON.stringify(obj)); return; }
    if (mode !== 'folder') { fail('writeTable', 'no folder picked yet'); }
    const file = CONFIG.data_dir + '/' + name + '.json';
    try {
      const d = await dirHandle(CONFIG.data_dir);
      const fh = await d.getFileHandle(name + '.json', { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(obj, null, 1));
      await w.close();
    } catch (e) { fail('writeTable', file + ' cannot be written (' + e.message + ')'); }
    console.log('[ui → store] wrote ' + file + ': ' + rows.length + ' rows');
  }
  async function readAll() {
    const out = {};
    for (const name of CONFIG.tables) { out[name] = (await readTable(name)).rows; }
    return out;
  }
  /* nextId(table, field): the next running number for a table (contract part 3: store.js gives it, logic receives it) */
  async function nextId(name, field) {
    const rows = (await readTable(name)).rows;
    let max = 0;
    for (const r of rows) { if (typeof r[field] === 'number' && r[field] > max) { max = r[field]; } }
    /* build 56: online, the highest number in the database at this moment too (others may have saved since the page loaded) */
    if (mode === 'online' && maxNo) { max = Math.max(max, await maxNo(name, field)); }
    return max + 1;
  }

  /* ---- files (photos, pictures) ---- */
  async function fileExists(relPath) {
    if (inMemory()) { return (memory.__files || []).indexOf(relPath) >= 0 || !!(memory.__file_urls && memory.__file_urls[relPath]); }
    if (mode !== 'folder') { fail('fileExists', 'no folder picked yet'); }
    const i = relPath.lastIndexOf('/');
    try {
      const d = await dirHandle(relPath.slice(0, i));
      await d.getFileHandle(relPath.slice(i + 1));
      return true;
    } catch (e) { return false; }
  }
  async function fileURL(relPath) {
    if (inMemory()) { return (memory.__file_urls && memory.__file_urls[relPath]) || null; }   // test seam: { path: data URL }; online: a signed URL
    if (mode !== 'folder') { fail('fileURL', 'no folder picked yet'); }
    const i = relPath.lastIndexOf('/');
    try {
      const d = await dirHandle(relPath.slice(0, i));
      const fh = await d.getFileHandle(relPath.slice(i + 1));
      return URL.createObjectURL(await fh.getFile());
    } catch (e) { fail('fileURL', relPath + ' cannot be read (' + e.message + ')'); }
  }
  /* fileDataURL(relPath): the file as a data: URL (for a page opened in a new window, where object URLs do not reach) */
  async function fileDataURL(relPath) {
    if (mode === 'memory') { return null; }
    if (mode === 'online') {
      const url = memory.__file_urls && memory.__file_urls[relPath];
      if (!url) { return null; }
      let blob;
      try { blob = await (await fetch(url)).blob(); } catch (e) { fail('fileDataURL', relPath + ' cannot be read online (' + e.message + ')'); }
      return new Promise(function (res, rej) {
        const r = new FileReader();
        r.onload = function () { res(r.result); };
        r.onerror = function () { rej(new Error('store.fileDataURL: ' + relPath + ' cannot be read')); };
        r.readAsDataURL(blob);
      });
    }
    if (mode !== 'folder') { fail('fileDataURL', 'no folder picked yet'); }
    const i = relPath.lastIndexOf('/');
    let file;
    try {
      const d = await dirHandle(relPath.slice(0, i));
      file = await (await d.getFileHandle(relPath.slice(i + 1))).getFile();
    } catch (e) { fail('fileDataURL', relPath + ' cannot be read (' + e.message + ')'); }
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('store.fileDataURL: ' + relPath + ' cannot be read')); };
      r.readAsDataURL(file);
    });
  }
  /* readText(relPath) → the text of a file, or null when it is not there (build 63: prompt/skill.json, the draft prompt's rules): the
     folder; online, the signed link of the listing (the file store, after the login); in memory, the test seam memory.__texts */
  async function readText(relPath) {
    if (mode === 'memory') { return (memory.__texts && typeof memory.__texts[relPath] === 'string') ? memory.__texts[relPath] : null; }
    if (mode === 'online') {
      const url = memory.__file_urls && memory.__file_urls[relPath];
      if (!url) { return null; }
      try { const r = await fetch(url); if (!r.ok) { fail('readText', relPath + ': ' + r.status); } return await r.text(); }
      catch (e) { fail('readText', relPath + ' cannot be read online (' + e.message + ')'); }
    }
    if (mode !== 'folder') { fail('readText', 'no folder picked yet'); }
    const i = relPath.lastIndexOf('/');
    let d;
    try { d = await dirHandle(relPath.slice(0, i)); } catch (e) { return null; }
    let fh;
    try { fh = await d.getFileHandle(relPath.slice(i + 1)); } catch (e) { return null; }
    try { return await (await fh.getFile()).text(); } catch (e) { fail('readText', relPath + ' cannot be read (' + e.message + ')'); }
  }
  async function listFiles(relPath) {
    /* the files right in the folder, not in the folders under it (as a folder lists them; build 50: Final SOPs and Final SOPs/Old) */
    if (inMemory()) { return (memory.__files || []).filter(function (f) { return f.indexOf(relPath + '/') === 0 && f.slice(relPath.length + 1).indexOf('/') < 0; }).sort(); }
    if (mode !== 'folder') { fail('listFiles', 'no folder picked yet'); }
    const out = [];
    try {
      const d = await dirHandle(relPath);
      for await (const [n, h] of d.entries()) { if (h.kind === 'file') { out.push(relPath + '/' + n); } }
    } catch (e) { fail('listFiles', relPath + ' cannot be listed (' + e.message + ')'); }
    return out.sort();
  }

  /* ---- the chart file: a copy under source/chart and a manifest line (the Builder never writes the picked file) ---- */
  async function sha16(text) {
    const bytes = new TextEncoder().encode(text);
    if (!(window.crypto && window.crypto.subtle)) { return { bytes: bytes.length, hash: '(no hash)' }; }
    try {
      const d = new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes));
      return { bytes: bytes.length, hash: Array.from(d.slice(0, 8)).map(b => (b < 16 ? '0' : '') + b.toString(16)).join('') };
    } catch (e) { return { bytes: bytes.length, hash: '(no hash)' }; }
  }
  async function copyChart(fileName, text, chartName, nowIso, who) {
    noWrite('copyChart');
    if (!fileName || typeof text !== 'string') { fail('copyChart', 'file name and text are required'); }
    const h = await sha16(text);
    const line = 'chart/' + fileName + ',' + chartName + ',' + String(nowIso).slice(0, 10) + ',' + h.bytes + ',' + h.hash + ',picked by ' + who + ' (Production Planner chart)';
    if (mode === 'online') {
      /* build 57: online the chart goes to the file store under source/chart; one there of that name stays (manifest.csv is a PC file) */
      const rel = CONFIG.source_dir + '/chart/' + fileName;
      if (await fileExists(rel)) { return 'there already online: ' + rel; }
      const url = await putFile(rel, new Blob([text], { type: 'application/json' }));
      addFile(rel, url);
      return 'copied online: ' + rel + ' (' + h.bytes + ' bytes)';
    }
    if (mode === 'memory') { memory.__copied = (memory.__copied || []).concat([{ file: CONFIG.source_dir + '/chart/' + fileName, bytes: h.bytes, line: line }]); return 'copied (test data): ' + line; }
    if (mode !== 'folder') { fail('copyChart', 'no folder picked yet'); }
    try {
      const d = await dirHandle(CONFIG.source_dir + '/chart', true);
      const w = await (await d.getFileHandle(fileName, { create: true })).createWritable();
      await w.write(text); await w.close();
      const sd = await dirHandle(CONFIG.source_dir);
      const mh = await sd.getFileHandle('manifest.csv', { create: true });
      let old = await (await mh.getFile()).text();
      if (!old) { old = 'file,master build number,date copied,bytes,sha256 (16),copied from\n'; }
      const mw = await mh.createWritable();
      await mw.write(old.replace(/\s*$/, '\n') + line + '\n'); await mw.close();
    } catch (e) { fail('copyChart', fileName + ' cannot be copied under ' + CONFIG.source_dir + '/chart (' + e.message + ')'); }
    return 'copied: ' + line;
  }

  /* ---- a photo copied in by the Builder (build 34): source/Photos/<name>, never over a file that is there ---- */
  async function writePhoto(relPath, blob) {
    noWrite('writePhoto');
    if (!relPath || !blob) { fail('writePhoto', 'path and file are required'); }
    if (await fileExists(relPath)) { fail('writePhoto', relPath + ' is there already: a photo is never written over'); }
    if (mode === 'online') { addFile(relPath, await putFile(relPath, blob)); return relPath; }   /* build 57: to the file store */
    const i = relPath.lastIndexOf('/');
    if (mode === 'memory') {
      const url = await new Promise(function (res) { const r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(null); }; r.readAsDataURL(blob); });
      memory.__files = (memory.__files || []).concat([relPath]);
      memory.__file_urls = Object.assign({}, memory.__file_urls || {}, { [relPath]: url });
      return relPath;
    }
    if (mode !== 'folder') { fail('writePhoto', 'no folder picked yet'); }
    try {
      const d = await dirHandle(relPath.slice(0, i), true);
      const w = await (await d.getFileHandle(relPath.slice(i + 1), { create: true })).createWritable();
      await w.write(blob); await w.close();
    } catch (e) { fail('writePhoto', relPath + ' cannot be written (' + e.message + ')'); }
    return relPath;
  }

  /* ---- the final PDFs (build 50, spec/example_rights.md part 9): Final SOPs and Final SOPs/Old; a PDF is moved, never written over ---- */
  /* makeDir(relPath): the folder and the folders above it, made when missing */
  async function makeDir(relPath) {
    noWrite('makeDir');
    if (mode === 'memory') { return relPath; }
    if (mode !== 'folder') { fail('makeDir', 'no folder picked yet'); }
    try { await dirHandle(relPath, true); } catch (e) { fail('makeDir', relPath + ' cannot be made (' + e.message + ')'); }
    return relPath;
  }
  /* moveFile(from, to): the file to its new place (copied, then the old one removed); never over a file that is there */
  async function moveFile(from, to) {
    noWrite('moveFile');
    if (!from || !to) { fail('moveFile', 'from and to are required'); }
    if (await fileExists(to)) { fail('moveFile', to + ' is there already: a file is never written over'); }
    if (mode === 'memory') {
      if ((memory.__files || []).indexOf(from) < 0) { fail('moveFile', from + ' does not exist'); }
      memory.__files = memory.__files.map(function (f) { return f === from ? to : f; });
      return to;
    }
    if (mode !== 'folder') { fail('moveFile', 'no folder picked yet'); }
    const i = from.lastIndexOf('/'), j = to.lastIndexOf('/');
    try {
      const src = await dirHandle(from.slice(0, i));
      const file = await (await src.getFileHandle(from.slice(i + 1))).getFile();
      const dst = await dirHandle(to.slice(0, j), true);
      const w = await (await dst.getFileHandle(to.slice(j + 1), { create: true })).createWritable();
      await w.write(file); await w.close();
      await src.removeEntry(from.slice(i + 1));
    } catch (e) { fail('moveFile', from + ' cannot be moved to ' + to + ' (' + e.message + ')'); }
    return to;
  }

  /* ---- test seam ---- */
  function useMemory(tables) {
    memory = tables; root = null; mode = 'memory'; onlineEdit = false; maxNo = null; putFile = null; archived = null;
    console.log('[store] using test data in memory: ' + Object.keys(tables).join(', '));
  }
  function status() { return { mode: mode, folder: root ? root.name : null }; }
  /* canReadFiles(): photos, pictures and PDFs can be shown (the folder, or the file store online) */
  function canReadFiles() { return mode === 'folder' || mode === 'online'; }

  /* ---- build 52: the view-only page (spec/example_online.md part 6) ---- */
  /* useOnline({ tables: { table: rows }, files: { path: signed URL }, saved_at }, opts): the tables read from the ERP's Supabase;
     every write is refused. Build 56: opts = { edit: true, maxNo(table, field) } on the page that edits online: nextId asks the
     database for the highest number too; a save goes to the database (store/online.js save), not through writeTable */
  function useOnline(data, opts) {
    onlineEdit = !!(opts && opts.edit);
    maxNo = (opts && typeof opts.maxNo === 'function') ? opts.maxNo : null;
    putFile = (opts && opts.edit && typeof opts.putFile === 'function') ? opts.putFile : null;   /* build 57: files go to the file store */
    archived = null;
    const m = {};
    for (const n of CONFIG.tables) {
      m[n] = { table: n, contract: CONFIG.contract, saved_at: (data && data.saved_at) || null, saved_by: 'online', rows: (data && data.tables && data.tables[n]) || [] };
    }
    m.__file_urls = Object.assign({}, (data && data.files) || {});
    m.__files = Object.keys(m.__file_urls).sort();
    memory = m; root = null; mode = 'online';
    console.log('[store] online, ' + (onlineEdit ? 'editing' : 'view only') + ': ' + CONFIG.tables.length + ' tables, ' + m.__files.length + ' files');
  }
  /* pickSource() → { name, readAll(), listFiles(folder), fileBlob(path) } for a picked SOP App folder (read only), for Put this PC's
     data online; the mode stays as it is. A folder that is not there lists no file. */
  async function pickSource() {
    if (typeof window.showDirectoryPicker !== 'function') { fail('pickSource', 'this browser has no folder picker. Use Chrome on the PC.'); }
    const h = await window.showDirectoryPicker({ mode: 'read' });
    await checkFolder(h);
    const dir = async function (rel) { let d = h; for (const part of rel.split('/')) { if (part) { d = await d.getDirectoryHandle(part); } } return d; };
    return {
      name: h.name,
      readAll: async function () {
        const out = {};
        for (const n of CONFIG.tables) {
          const file = CONFIG.data_dir + '/' + n + '.json';
          let obj;
          try { obj = JSON.parse(await (await (await (await dir(CONFIG.data_dir)).getFileHandle(n + '.json')).getFile()).text()); }
          catch (e) { fail('pickSource', file + ' cannot be read (' + e.message + ')'); }
          checkShape(n, obj);
          out[n] = obj.rows;
        }
        return out;
      },
      listFiles: async function (rel) {
        const out = [];
        let d;
        try { d = await dir(rel); } catch (e) { return out; }
        for await (const [n, x] of d.entries()) { if (x.kind === 'file') { out.push(rel + '/' + n); } }
        return out.sort();
      },
      fileBlob: async function (rel) {
        const i = rel.lastIndexOf('/');
        try { return await (await (await dir(rel.slice(0, i))).getFileHandle(rel.slice(i + 1))).getFile(); }
        catch (e) { fail('pickSource', rel + ' cannot be read (' + e.message + ')'); }
      },
      /* build 57: writeFile(name, text) → a file at the top of the folder (ARCHIVED.json on switch day); Chrome asks once to let the
         page write there */
      writeFile: async function (name, text) {
        if (name.indexOf('/') >= 0) { fail('pickSource', name + ': only a file at the top of the folder'); }
        let p = await h.queryPermission({ mode: 'readwrite' });
        if (p !== 'granted') { p = await h.requestPermission({ mode: 'readwrite' }); }
        if (p !== 'granted') { fail('pickSource', 'the page may not write into ' + h.name); }
        const w = await (await h.getFileHandle(name, { create: true })).createWritable();
        await w.write(text); await w.close();
        return name;
      }
    };
  }

  /* build 57: pickTarget() → { name, write(rel, text or blob) }: an EMPTY folder the data online is saved into (the way back after switch
     day); never a folder with files in it */
  async function pickTarget() {
    if (typeof window.showDirectoryPicker !== 'function') { fail('pickTarget', 'this browser has no folder picker. Use Chrome on the PC.'); }
    const h = await window.showDirectoryPicker({ mode: 'readwrite' });
    for await (const k of h.keys()) { fail('pickTarget', 'folder "' + h.name + '" is not empty (' + k + '): pick an empty folder; the data online never goes over files'); }
    return {
      name: h.name,
      write: async function (rel, data) {
        const parts = rel.split('/');
        const name = parts.pop();
        let d = h;
        for (const part of parts) { if (part) { d = await d.getDirectoryHandle(part, { create: true }); } }
        const w = await (await d.getFileHandle(name, { create: true })).createWritable();
        await w.write(data); await w.close();
      }
    };
  }

  return { pickFolder: pickFolder, reopenFolder: reopenFolder, rememberedFolderName: rememberedFolderName,
    readTable: readTable, writeTable: writeTable, readAll: readAll, nextId: nextId, fileExists: fileExists,
    fileURL: fileURL, fileDataURL: fileDataURL, readText: readText, listFiles: listFiles, copyChart: copyChart, writePhoto: writePhoto, makeDir: makeDir, moveFile: moveFile,
    useMemory: useMemory, status: status, canReadFiles: canReadFiles, useOnline: useOnline, pickSource: pickSource, pickTarget: pickTarget, archiveInfo: archiveInfo, fileLinks: fileLinks };
})();
if (typeof module !== 'undefined') module.exports = STORE;
