/* SOP Builder online, build 52 (spec/example_online.md part 6): the one door to the ERP's Supabase for the view-only page. The login
   is the ERP's: the page is on the ERP's website (freezigo.github.io/sop) and the Supabase client keeps the session under the name the
   ERP's client uses, so whoever is logged in to the Freezigo app is logged in here; this page never asks for a password.
   session, me (the SOP name and roles), loadAll (every table, in the order of the PC files, and a link to every file), putOnline (Put
   this PC's data online: the tables in one call, then the files, then the check). The logic is in engine/online.js; this file only
   moves data. Test seam: useClient(stand-in). Classic script (global ONLINE). */
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
  /* me(sess) → { name, roles, email }: the SOP name and roles (sop_people), else the ERP name with no SOP role */
  async function me(sess) {
    const uid = sess.user.id, email = sess.user.email || '';
    const p = await get().from('sop_people').select('name, roles, active').eq('user_id', uid).maybeSingle();
    if (p.error) { fail('me', 'sop_people: ' + p.error.message); }
    if (p.data && p.data.active) { return { name: p.data.name, roles: p.data.roles || [], email: email }; }
    const q = await get().from('profiles').select('name').eq('id', uid).maybeSingle();
    return { name: (q && q.data && q.data.name) || email, roles: [], email: email };
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
  /* loadAll() → { tables, files }: every table as the Builder keeps it, rows in the order of the PC files; files = { path: link for
     12 hours } */
  async function loadAll() {
    const order = {};
    for (const r of await selectAll('sop_row_order')) { order[r.tbl] = r.keys; }
    const tables = {};
    for (const n of CONFIG.tables) {
      tables[n] = ENGINE_ONLINE.inOrder(n, ENGINE_ONLINE.fromOnline(n, await selectAll(ENGINE_ONLINE.dbTable(n))), order[n]);
    }
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
    const listing = {};
    for (const d of ENGINE_ONLINE.fileDirs()) { listing[d] = await source.listFiles(d); }
    const jobs = ENGINE_ONLINE.fileJobs(listing);
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

  return { useClient, session, onSignedOut, me, loadAll, listOnline, putOnline, tableHash };
})();
if (typeof module !== 'undefined') module.exports = ONLINE;
