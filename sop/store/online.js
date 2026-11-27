/* SOP Builder online, build 52 (spec/example_online.md part 6): the one door to the ERP's Supabase for the view-only page. The login
   is the ERP's: the page is on the ERP's website (freezigo.github.io/sop) and the Supabase client keeps the session under the name the
   ERP's client uses, so whoever is logged in to the Freezigo app is logged in here; this page never asks for a password.
   session, me (the SOP name and roles), loadAll (every table, in the order of the PC files, and a link to every file), putOnline (Put
   this PC's data online: the tables in one call, then the files, then the check). Build 56 (spec/example_edit_online.md): master
   (switch day come?), maxNo (the highest number online), loadTables (the newest tables), save (one save in one call, sop_save; the
   database checks it and writes all or nothing). The logic is in engine/online.js; this file only moves data. Test seam:
   useClient(stand-in). Classic script (global ONLINE). */
const ONLINE = (function () {
  let client = null;
  function fail(place, msg) { throw new Error('online.' + place + ': ' + msg); }
  const O = () => CONFIG.online || {};
  const BUCKET = () => O().bucket || 'sop-files';

  /* useClient(c): a stand-in for the Supabase client (the page checks) */
  function useClient(c) { client = c; }
  function get() {
    if (client) { return client; }
    if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') { fail('client', 'the Supabase script (vendor/supabase.js) is not loaded'); }
    if (!O().url || !O().key) { fail('client', 'CONFIG.online has no url or key'); }
    /* the same settings as the ERP's client (src/lib/supa.ts), so the two share one login */
    client = supabase.createClient(O().url, O().key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return client;
  }

  /* session() → the login of the Freezigo app on this browser, or null */
  async function session() {
    const r = await get().auth.getSession();
    if (r.error) { fail('session', r.error.message); }
    return (r.data && r.data.session) || null;
  }
  /* onSignedOut(fn): fn() when the Freezigo app logs out (in this tab or another) */
  function onSignedOut(fn) {
    get().auth.onAuthStateChange(function (event, sess) { if (event === 'SIGNED_OUT' || !sess) { fn(); } });
  }
  /* me(sess) → { name, roles, email, sop }: the SOP name and roles (sop_people); sop = false for an ERP login that is not one of the
     SOP people: it reads no SOP (Samrat 2026-11-17 "2. b", build 53), and the page says so with the ERP name */
  async function me(sess) {
    const uid = sess.user.id, email = sess.user.email || '';
    const p = await get().from('sop_people').select('name, roles, active').eq('user_id', uid).maybeSingle();
    if (p.error) { fail('me', 'sop_people: ' + p.error.message); }
    if (p.data && p.data.active) { return { name: p.data.name, roles: p.data.roles || [], email: email, sop: true }; }
    const q = await get().from('profiles').select('name').eq('id', uid).maybeSingle();
    return { name: (q && q.data && q.data.name) || email, roles: [], email: email, sop: false };
  }

  /* every row of a table, 1,000 at a time (the most one answer gives) */
  async function selectAll(table) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const r = await get().from(table).select('*').range(from, from + 999);
      if (r.error) { fail('loadAll', table + ': ' + r.error.message); }
      const rows = r.data || [];
      for (const x of rows) { out.push(x); }
      if (rows.length < 1000) { break; }
    }
    return out;
  }
  /* listOnline() → [{ path, size }]: the files in the file store, in the folders of fileDirs */
  async function listOnline() {
    const out = [];
    for (const dir of ENGINE_ONLINE.fileDirs()) {
      const r = await get().storage.from(BUCKET()).list(dir, { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } });
      if (r.error) { fail('files', dir + ': ' + r.error.message); }
      for (const f of r.data || []) { if (f.id) { out.push({ path: dir + '/' + f.name, size: f.metadata ? f.metadata.size : null }); } }
    }
    return out;
  }
  /* loadTables() → { tables }: every table as the Builder keeps it, rows in the order kept online (sop_row_order); the tables are
     read at the same time (build 56: again after each save) */
  async function loadTables(loose) {
    const order = {};
    for (const r of await selectAll('sop_row_order')) { order[r.tbl] = r.keys; }
    const rows = await Promise.all(CONFIG.tables.map(n => selectAll(ENGINE_ONLINE.dbTable(n))));
    const tables = {};
    CONFIG.tables.forEach(function (n, i) { tables[n] = ENGINE_ONLINE.inOrder(n, ENGINE_ONLINE.fromOnline(n, rows[i], loose), order[n]); });
    return { tables: tables };
  }
  /* dbContract() → the database's data layout (sop_meta contract_version), or null when it cannot be read (build 69: the guard,
     spec/example_people_69.md part 6) */
  async function dbContract() {
    const r = await get().from(ENGINE_ONLINE.dbTable('meta')).select('contract_version').limit(1);
    if (r.error) { console.log('[online] sop_meta: ' + r.error.message); return null; }
    return r.data && r.data[0] ? r.data[0].contract_version : null;
  }
  /* loadAll() → { tables, files }: every table as the Builder keeps it, rows in the order of the PC files; files = { path: link for
     12 hours } */
  async function loadAll(loose) {
    const tables = (await loadTables(loose)).tables;
    const files = {};
    const paths = (await listOnline()).map(f => f.path);
    for (let i = 0; i < paths.length; i += 100) {
      const r = await get().storage.from(BUCKET()).createSignedUrls(paths.slice(i, i + 100), 12 * 3600);
      if (r.error) { fail('loadAll', 'file links: ' + r.error.message); }
      for (const x of r.data || []) { if (x.signedUrl) { files[x.path] = x.signedUrl; } }
    }
    console.log('[online → store] ' + CONFIG.tables.length + ' tables, ' + Object.keys(files).length + ' files');
    return { tables: tables, files: files };
  }

  /* ---- Put this PC's data online (admin) ---- */
  async function sha256(text) {
    const b = await crypto.subtle.digest('SHA-256', typeof text === 'string' ? new TextEncoder().encode(text) : text);
    return Array.from(new Uint8Array(b)).map(x => (x < 16 ? '0' : '') + x.toString(16)).join('');
  }
  /* tableHash(rows) → { row_count, hash } as sop_table_hashes answers it (tools/online_sql.js tableHash) */
  async function tableHash(rows) {
    const hs = [];
    for (const r of rows) { hs.push(await sha256(ENGINE_ONLINE.dbRowText(r))); }
    hs.sort();
    return { row_count: rows.length, hash: await sha256(hs.join('')) };
  }
  const noNulls = r => { const o = {}; for (const k of Object.keys(r)) { if (r[k] !== null && r[k] !== undefined) { o[k] = r[k]; } } return o; };
  async function sameBytes(a, b) {
    const x = new Uint8Array(await a.arrayBuffer()), y = new Uint8Array(await b.arrayBuffer());
    if (x.length !== y.length) { return false; }
    for (let i = 0; i < x.length; i++) { if (x[i] !== y[i]) { return false; } }
    return true;
  }
  /* putOnline(source, say) → { tables, rows, files, removed, skipped, tableLines, fileLines }: source = STORE.pickSource(); say(line)
     shows where it is. The tables go in one call (all or nothing), then every file (written over), then the files online that the PC
     no longer has go; then the check: the hash of every table, every file read back and compared byte for byte */
  async function putOnline(source, say) {
    say('Reading the folder ' + source.name + ' …');
    const tables = await source.readAll();
    const pl = ENGINE_ONLINE.payload(tables);
    const local = {}, data = {};
    let rows = 0;
    for (const n of CONFIG.tables) { local[n] = await tableHash(pl[n]); data[n] = pl[n].map(noNulls); rows += pl[n].length; }
    say('Putting ' + CONFIG.tables.length + ' tables online (' + rows + ' rows) …');
    const r = await get().rpc('sop_import', { data: data });
    if (r.error) { fail('putOnline', r.error.message); }
    const tableLines = ENGINE_ONLINE.hashDiff(local, r.data).map(x => x.line);
    const listing = {}, sizes = {};
    for (const d of ENGINE_ONLINE.fileDirs()) {
      listing[d] = await source.listFiles(d);
      for (const f of listing[d]) { sizes[f] = (await source.fileBlob(f)).size; }   /* a file's size, not its bytes yet */
    }
    const jobs = ENGINE_ONLINE.fileJobs(listing, sizes);
    const fileLines = [], blobs = {};
    let n = 0;
    for (const f of jobs.files) {
      n++;
      say('Files: ' + n + ' of ' + jobs.files.length + ' (' + f.path + ') …');
      const blob = await source.fileBlob(f.path);
      blobs[f.path] = blob;
      const u = await get().storage.from(BUCKET()).upload(f.path, blob, { upsert: true, contentType: f.type });
      if (u.error) { fileLines.push(f.path + ': not put online (' + u.error.message + ')'); }
    }
    const keep = {};
    for (const f of jobs.files) { keep[f.path] = true; }
    const extra = (await listOnline()).map(f => f.path).filter(p => !keep[p]);
    for (let i = 0; i < extra.length; i += 100) {
      const d = await get().storage.from(BUCKET()).remove(extra.slice(i, i + 100));
      if (d.error) { fileLines.push('could not take out ' + extra.slice(i, i + 100).join(', ') + ' (' + d.error.message + ')'); }
    }
    n = 0;
    for (const f of jobs.files) {
      n++;
      say('Checking files: ' + n + ' of ' + jobs.files.length + ' …');
      const d = await get().storage.from(BUCKET()).download(f.path);
      if (d.error || !d.data) { fileLines.push(f.path + ': not online (' + (d.error ? d.error.message : 'empty') + ')'); continue; }
      if (!(await sameBytes(d.data, blobs[f.path]))) { fileLines.push(f.path + ': the file online differs from this PC'); }
    }
    return { tables: CONFIG.tables.length, rows: rows, files: jobs.files.length, removed: extra.length, skipped: jobs.skipped, tableLines: tableLines, fileLines: fileLines };
  }

  /* ---- build 56: editing online (spec/example_edit_online.md) ---- */
  /* master() → 'pc' until switch day, then 'online' (sop_settings); a database without sop_settings yet (before build 56): 'pc' */
  async function master() {
    const r = await get().from('sop_settings').select('value').eq('key', 'master').maybeSingle();
    if (r.error) { console.log('[online] sop_settings: ' + r.error.message + ': master = pc'); return 'pc'; }
    return (r.data && r.data.value) || 'pc';
  }
  /* maxNo(table, field) → the highest number of a field online (0 when the table is empty): the next History, note, revision history
     or floor trial number is taken from it at the moment of a change (STORE.nextId) */
  async function maxNo(table, field) {
    const r = await get().from(ENGINE_ONLINE.dbTable(table)).select(field).order(field, { ascending: false }).limit(1);
    if (r.error) { fail('maxNo', table + '.' + field + ': ' + r.error.message); }
    const v = r.data && r.data[0] ? Number(r.data[0][field]) : 0;
    return isFinite(v) ? v : 0;
  }
  /* save(before, after) → { saved, by }: one save of the page (engine saveChanges: the rows added, changed and taken out, and the
     order of the rows) in one call, sop_save; the database checks it (who, switch day, the rights of build 50, as seen) and writes all
     of it or nothing. A refusal comes back as the database's line: "Not saved: ..." */
  async function save(before, after) {
    const s = ENGINE_ONLINE.saveChanges(before, after);
    if (!s.tables.length) { return { saved: 0, by: null }; }
    console.log('[online] save: ' + s.changes.length + ' rows (' + s.tables.join(', ') + ')');
    const r = await get().rpc('sop_save', { p: { changes: s.changes, order: s.order, contract: s.contract } });   /* build 69: the page's data layout */
    if (r.error) { throw new Error(r.error.message); }
    return r.data;
  }

  /* ---- build 57: files online and switch day (spec/example_edit_online.md part 9) ---- */
  /* masterRow() → the sop_settings row master ({ key, value, set_by, set_at }), or null (a database before build 56) */
  async function masterRow() {
    const r = await get().from('sop_settings').select('key, value, set_by, set_at').eq('key', 'master').maybeSingle();
    if (r.error) { console.log('[online] sop_settings: ' + r.error.message); return null; }
    return r.data || null;
  }
  /* putFile(path, blob) → a link to the file for 12 hours: an editor's photo, picture or chart file into the file store, never over a
     file that is there (the database's rule allows the four folders after switch day) */
  async function putFile(path, blob) {
    const dir = path.slice(0, path.lastIndexOf('/'));
    const j = ENGINE_ONLINE.fileJobs({ [dir]: [path] }, { [path]: blob.size });
    if (!j.files.length) { fail('putFile', path + ': ' + (j.skipped[0] ? j.skipped[0].why : 'not taken')); }
    const u = await get().storage.from(BUCKET()).upload(path, blob, { upsert: false, contentType: j.files[0].type });
    if (u.error) {
      if (/exist|duplicate/i.test(String(u.error.message)) || String(u.error.statusCode) === '409') { fail('putFile', ENGINE_ONLINE.saveLine('file_there', path.slice(path.lastIndexOf('/') + 1))); }
      fail('putFile', path + ': not put online (' + u.error.message + ')');
    }
    const s = await get().storage.from(BUCKET()).createSignedUrls([path], 43200);
    if (s.error || !s.data || !s.data[0]) { fail('putFile', path + ': online, but no link to it (' + (s.error ? s.error.message : 'none') + ')'); }
    console.log('[online] file put online: ' + path + ' (' + blob.size + ' bytes)');
    return s.data[0].signedUrl;
  }
  /* switchTo(to) → the master row after the switch (sop_switch, admin only): to = 'online' (switch day) or 'pc' (back) */
  async function switchTo(to) {
    const r = await get().rpc('sop_switch', { p_to: to });
    if (r.error) { throw new Error(r.error.message); }
    return r.data;
  }
  /* sameAsFolder(source) → [line]: the tables of the folder against the tables online (hash), empty when all the same */
  async function sameAsFolder(source) {
    const pl = ENGINE_ONLINE.payload(await source.readAll());
    const local = {};
    for (const n of CONFIG.tables) { local[n] = await tableHash(pl[n]); }
    const r = await get().rpc('sop_table_hashes');
    if (r.error) { fail('sameAsFolder', r.error.message); }
    return ENGINE_ONLINE.hashDiff(local, r.data).map(x => x.line);
  }
  /* putNewFiles(source, say) → { put, same, skipped, lines }: after switch day, the folder's photos, pictures and chart files that are
     not online, or differ from the one online (another size, or the same size and other bytes), go online; nothing online is taken out
     and no table changes (admin) */
  async function putNewFiles(source, say) {
    const local = [], blobs = {};
    for (const d of ENGINE_ONLINE.fileDirs()) {
      for (const f of await source.listFiles(d)) { const b = await source.fileBlob(f); blobs[f] = b; local.push({ path: f, size: b.size, md5: null }); }
    }
    const online = await listOnline();
    const jobs = ENGINE_ONLINE.newFileJobs(local, online.map(f => ({ path: f.path, size: f.size, md5: null })));
    const sized = {};
    for (const f of online) { sized[f.path] = f.size; }
    const lines = [], put = jobs.files.slice();
    let same = 0, n = 0;
    for (const f of local) {
      if (put.some(x => x.path === f.path) || sized[f.path] !== f.size || jobs.skipped.some(x => x.path === f.path)) { continue; }
      n++;
      say('Comparing files: ' + n + ' (' + f.path + ') …');
      const d = await get().storage.from(BUCKET()).download(f.path);
      if (!d.error && d.data && (await sameBytes(d.data, blobs[f.path]))) { same++; continue; }
      put.push({ path: f.path, type: ENGINE_ONLINE.fileJobs({ x: [f.path] }).files[0].type, why: 'changed' });
    }
    n = 0;
    for (const f of put) {
      n++;
      say('Files: ' + n + ' of ' + put.length + ' (' + f.path + ') …');
      const u = await get().storage.from(BUCKET()).upload(f.path, blobs[f.path], { upsert: true, contentType: f.type });
      if (u.error) { lines.push(f.path + ': not put online (' + u.error.message + ')'); continue; }
      const d = await get().storage.from(BUCKET()).download(f.path);
      if (d.error || !d.data || !(await sameBytes(d.data, blobs[f.path]))) { lines.push(f.path + ': the file online differs from this PC'); }
    }
    return { put: put.map(f => f.path + ' (' + f.why + ')'), same: same, skipped: jobs.skipped, lines: lines };
  }
  /* saveAsFolder(target, say, who, nowIso) → { tables, rows, files }: the way back after switch day: every table into data, as the
     Builder writes it, and every file online into its folder, in an empty folder the SOP Builder on a PC can open */
  async function saveAsFolder(target, say, who, nowIso) {
    const tables = (await loadTables()).tables;
    let rows = 0;
    for (const f of ENGINE_BACKUP.backupFiles(tables, nowIso, who)) { say('Saving ' + f.path + ' …'); await target.write(f.path, f.text); }
    for (const n of CONFIG.tables) { rows += tables[n].length; }
    const files = await listOnline();
    let n = 0;
    for (const f of files) {
      n++;
      say('Files: ' + n + ' of ' + files.length + ' (' + f.path + ') …');
      const d = await get().storage.from(BUCKET()).download(f.path);
      if (d.error || !d.data) { fail('saveAsFolder', f.path + ' cannot be read online (' + (d.error ? d.error.message : 'empty') + ')'); }
      await target.write(f.path, d.data);
    }
    return { tables: CONFIG.tables.length, rows: rows, files: files.length };
  }

  return { useClient, session, onSignedOut, me, loadTables, loadAll, dbContract, listOnline, putOnline, tableHash, master, maxNo, save,
    masterRow, putFile, switchTo, sameAsFolder, putNewFiles, saveAsFolder };
})();
if (typeof module !== 'undefined') module.exports = ONLINE;
