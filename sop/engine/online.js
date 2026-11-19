/* SOP Builder logic pieces for the online tables (spec/example_online.md part 4, build 51; Samrat 2026-11-16: the SOP App goes online
   inside the ERP Supabase project): the contract's tables (schema/types.js, contract 1.6) under the same names with "sop_" in front,
   the same fields, the contract's keys (meta: one row, id 1). dbTable, dbKey, sqlType, columnsOf, tableSql (the table), importRows
   (the rows as they go online: every field, sops with the owner), importSql (put a table online again, re-runnable). Pure: the SQL is
   text; tools/online_sql.js writes it and a session runs it. Classic script (global ENGINE_ONLINE); module in Node. Answer key:
   tests/golden29.js. */
const ENGINE_ONLINE = (function () {
  const TYPESX = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
  const RT = (typeof ENGINE_RIGHTS !== 'undefined') ? ENGINE_RIGHTS : require('./rights.js');
  const fail = (piece, msg) => { throw new Error('engine.' + piece + ': ' + msg); };
  const empty = v => v === null || v === undefined || String(v).trim() === '';
  const PREFIX = 'sop_';
  /* the contract's types in Postgres; a datetime stays text so "2026-11-13T19:59:05+05:30" comes back exactly as written */
  const SQL_TYPES = { text: 'text', set: 'text', int: 'integer', number: 'numeric', bool: 'boolean', date: 'date', datetime: 'text', list_text: 'text[]', list_int: 'integer[]' };
  /* the words Postgres keeps for itself: a field named with one is quoted ("table" of history, "check" of steps) */
  const RESERVED = ('all analyse analyze and any array as asc asymmetric authorization binary both case cast check collate collation column concurrently ' +
    'constraint create cross current_catalog current_date current_role current_schema current_time current_timestamp current_user default deferrable desc ' +
    'distinct do else end except false fetch for foreign freeze from full grant group having ilike in initially inner intersect into is isnull join lateral ' +
    'leading left like limit localtime localtimestamp natural not notnull null offset on only or order outer overlaps placing primary references returning ' +
    'right select session_user similar some symmetric system_user table tablesample then to trailing true union unique user using variadic verbose when ' +
    'where window with').split(' ');
  const quote = n => (RESERVED.indexOf(n) >= 0 || !/^[a-z_][a-z0-9_]*$/.test(n) ? '"' + n.replace(/"/g, '""') + '"' : n);

  function defOf(name, piece) {
    const d = TYPESX.tables[name];
    if (!d) { fail(piece, name + ' is not a table of the contract'); }
    return d;
  }
  /* dbTable(name) → the table online: "sop_" + name */
  function dbTable(name) { defOf(name, 'dbTable'); return PREFIX + name; }
  /* dbKey(name) → the key columns online (contract 1.6 keys; meta: id) */
  function dbKey(name) { const d = defOf(name, 'dbKey'); return d.key.length ? d.key.slice() : ['id']; }
  /* sqlType(field) → the Postgres type of a contract field; field.db names it where the type alone does not (ref_tables.rows: rows of
     cells, text or numbers: jsonb) */
  function sqlType(field) {
    if (field && field.db) { return field.db; }
    const t = SQL_TYPES[field && field.type];
    if (!t) { fail('sqlType', 'type ' + (field ? field.type : '?') + ' of ' + (field ? field.name : '?') + ' has no Postgres type'); }
    return t;
  }
  /* columnsOf(name) → [{ name, sql, quoted }]: the contract's fields in order; meta has id first */
  function columnsOf(name) {
    const d = defOf(name, 'columnsOf');
    const cols = d.key.length ? [] : [{ name: 'id', sql: 'smallint', quoted: 'id' }];
    return cols.concat(d.fields.map(f => ({ name: f.name, sql: sqlType(f), quoted: quote(f.name) })));
  }
  /* tableSql(name) → "create table if not exists public.sop_<name> (...)": the key columns not null, the key as primary key; meta's id
     is 1 always */
  function tableSql(name) {
    const key = dbKey(name);
    const lines = columnsOf(name).map(c => '  ' + c.quoted + ' ' + c.sql + (key.indexOf(c.name) >= 0 ? ' not null' : '') + (c.name === 'id' && name === 'meta' ? ' default 1 check (id = 1)' : ''));
    return 'create table if not exists public.' + dbTable(name) + ' (\n' + lines.join(',\n') + ',\n  primary key (' + key.map(quote).join(', ') + ')\n);';
  }
  /* importRows(tables, name) → the rows of a table as they go online: every field of the contract in its order (null when missing), a
     copy with its owner (ownerOf: the field, else its "added: copy" History row; 1.6), meta with id 1 and the contract of the tables
     online (a file not yet moved by tools/migrate_1_6.py still says 1.4 or 1.5); a field outside the contract stops it */
  function importRows(tables, name) {
    const d = defOf(name, 'importRows');
    const fields = d.fields.map(f => f.name);
    const rows = Array.isArray(tables[name]) ? tables[name] : fail('importRows', 'table ' + name + ' is missing');
    return rows.map(function (r) {
      for (const k of Object.keys(r)) {
        if (fields.indexOf(k) < 0) { fail('importRows', name + ' ' + (d.key.length ? d.key.map(x => r[x]).join(' ') : 'row') + ': ' + k + ' is not a field of the contract'); }
      }
      const out = d.key.length ? {} : { id: 1 };
      for (const f of fields) { out[f] = r[f] === undefined ? null : r[f]; }
      if (name === 'sops') { out.owner = empty(r.copy_of) ? null : RT.ownerOf(tables, r.sop_id); }
      if (name === 'meta') { out.contract_version = TYPESX.version; }
      return out;
    });
  }
  /* importSql(name, rows) → the rows go, then come back from their JSON (jsonb_populate_recordset reads each field into its column); the
     quote mark $sop$ changes when the text holds it. Every DELETE has a WHERE ("where true"): Supabase's API login loads safeupdate,
     which refuses a DELETE or UPDATE without one (ERP chat, 2026-11-17, build 53) */
  function importSql(name, rows) {
    const table = 'public.' + dbTable(name);
    const json = JSON.stringify(rows);
    let tag = '$sop$', i = 0;
    while (json.indexOf(tag) >= 0) { i++; tag = '$sop' + i + '$'; }
    return 'delete from ' + table + ' where true;\ninsert into ' + table + ' select * from jsonb_populate_recordset(null::' + table + ', ' + tag + json + tag + '::jsonb);';
  }

  /* the bytes of a text in UTF-8, as Postgres keeps it */
  function utf8(s) {
    const out = [];
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) { out.push(c); } else if (c < 0x800) { out.push(0xC0 | c >> 6, 0x80 | c & 63); } else if (c < 0x10000) { out.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63); } else { out.push(0xF0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63); }
    }
    return out;
  }
  /* the order of the keys of a jsonb object: the shorter key first, keys of one length by their bytes */
  function keyOrder(a, b) {
    const x = utf8(a), y = utf8(b);
    if (x.length !== y.length) { return x.length - y.length; }
    for (let i = 0; i < x.length; i++) { if (x[i] !== y[i]) { return x[i] - y[i]; } }
    return 0;
  }
  /* a number as numeric prints it: written out in full (1e-7 is 0.0000001) */
  function numText(n, at) {
    if (typeof n !== 'number' || !isFinite(n)) { fail('dbRowText', at + ': ' + n + ' is not a number'); }
    const s = String(n);
    const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
    if (!m) { return s; }
    const digits = m[2] + (m[3] || ''), point = m[2].length + parseInt(m[4], 10);
    if (point <= 0) { return m[1] + '0.' + '0'.repeat(-point) + digits; }
    if (point >= digits.length) { return m[1] + digits + '0'.repeat(point - digits.length); }
    return m[1] + digits.slice(0, point) + '.' + digits.slice(point);
  }
  /* dbRowText(row) → the row as Postgres prints jsonb_strip_nulls(to_jsonb(row))::text: keys by length, then by their bytes; ": " and
     ", "; a null field left out of every object, a null in a list kept; text escaped as JSON; numbers written out in full. A row online
     and its source row give one text: their hashes are compared (example_online.md part 5) */
  function dbRowText(row) {
    const val = function (v, at) {
      if (v === null || v === undefined) { return 'null'; }
      if (typeof v === 'boolean') { return v ? 'true' : 'false'; }
      if (typeof v === 'number') { return numText(v, at); }
      if (typeof v === 'string') { return JSON.stringify(v); }
      if (Array.isArray(v)) { return '[' + v.map(x => val(x, at)).join(', ') + ']'; }
      if (typeof v === 'object') {
        const ks = Object.keys(v).filter(k => v[k] !== null && v[k] !== undefined).sort(keyOrder);
        return '{' + ks.map(k => JSON.stringify(k) + ': ' + val(v[k], k)).join(', ') + '}';
      }
      return fail('dbRowText', at + ': ' + typeof v + ' cannot go online');
    };
    return val(row, 'row');
  }
  /* dbHashSql(names) → one line per table online: tbl, row_count, hash = sha256 of the sha256 of each row's text (dbRowText), sorted
     and joined; the same hash of the source rows says every row arrived exactly once and exactly as it is. The row is named _row, a
     name no field has: "to_jsonb(x)" of chart_notes would read its field x, not the row */
  function dbHashSql(names) {
    return names.map(n => 'select \'' + n + '\' as tbl, count(*) as row_count, encode(sha256(convert_to(coalesce(string_agg(h, \'\' order by h collate "C"), \'\'), \'UTF8\')), \'hex\') as hash ' +
      'from (select encode(sha256(convert_to(jsonb_strip_nulls(to_jsonb(_row))::text, \'UTF8\')), \'hex\') as h from public.' + dbTable(n) + ' _row) q').join('\nunion all\n') + ';';
  }

  /* ---- build 52: the view-only page and Put this PC's data online (example_online.md part 6; answer key tests/golden30.js) ---- */
  const CFG = () => ((typeof CONFIG !== 'undefined') ? CONFIG : require('../config.js'));
  /* fromOnline(name, rows) → the rows as the Builder keeps them (as the PC files hold them): every field of the contract in its order,
     null when the row online has none; meta without its id; a field outside the contract stops it */
  function fromOnline(name, rows) {
    const d = defOf(name, 'fromOnline');
    const fields = d.fields.map(f => f.name);
    return (rows || []).map(function (r) {
      for (const k of Object.keys(r)) {
        if (k === 'id' && !d.key.length) { continue; }
        if (fields.indexOf(k) < 0) { fail('fromOnline', name + ' ' + (d.key.length ? d.key.map(x => r[x]).join(' ') : 'row') + ': ' + k + ' is not a field of the contract'); }
      }
      const out = {};
      for (const f of fields) { out[f] = r[f] === undefined ? null : r[f]; }
      return out;
    });
  }
  /* inOrder(name, rows, keys) → the rows in the order of the PC file: keys = the key of each row in that order (public.sop_row_order,
     filled by sop_import); a row not in the list goes last in the order it came; no list, or a table without a key: as they came */
  function inOrder(name, rows, keys) {
    const d = defOf(name, 'inOrder');
    if (!d.key.length || !Array.isArray(keys)) { return (rows || []).slice(); }
    const at = {};
    keys.forEach(function (k, i) { const t = JSON.stringify(k); if (at[t] === undefined) { at[t] = i; } });
    const pos = r => { const t = JSON.stringify(d.key.map(f => (r[f] === undefined ? null : r[f]))); return at[t] === undefined ? keys.length : at[t]; };
    return (rows || []).map((r, i) => ({ r: r, p: pos(r), i: i })).sort((a, b) => (a.p - b.p) || (a.i - b.i)).map(x => x.r);
  }
  /* payload(tables) → { table: rows } for every table of the contract, as they go online (importRows) */
  function payload(tables) {
    const out = {};
    for (const n of CFG().tables) { out[n] = importRows(tables, n); }
    return out;
  }
  /* hashDiff(local, online) → [{ tbl, line }]: the tables whose rows or hash differ; local = { table: { row_count, hash } } worked out
     on this PC, online = the lines of sop_table_hashes (row_count may come as text) */
  function hashDiff(local, online) {
    const by = {};
    for (const r of online || []) { by[r.tbl] = r; }
    const out = [];
    for (const t of Object.keys(local || {})) {
      const l = local[t], o = by[t];
      if (!o) { out.push({ tbl: t, line: t + ': not online' }); continue; }
      const n = Number(o.row_count);
      if (n !== Number(l.row_count)) { out.push({ tbl: t, line: t + ': ' + l.row_count + ' rows on this PC, ' + n + ' online' }); continue; }
      if (o.hash !== l.hash) { out.push({ tbl: t, line: t + ': ' + l.row_count + ' rows on this PC and online, but the rows differ' }); }
    }
    return out;
  }
  /* the folders whose files go online: the photos and the pictures. The final PDFs (Final SOPs, Final SOPs/Old) stay on the PC: not
     needed online (Vishal 2026-11-17, build 54); they are neither sent nor checked nor named in the result */
  function fileDirs() { return [CFG().photos_dir, CFG().pictures_dir]; }
  const FILE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf' };
  /* the signs the file store (Supabase Storage) takes in a name: letters and digits of English, _ / ! - . * ' ( ) space & $ @ = ; : + , ? */
  const NAME_OK = /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/;
  /* the most one file may weigh in the file store (config online.max_file_bytes: 20 MB, as the store's file_size_limit) */
  const MAX_FILE = () => (CFG().online && CFG().online.max_file_bytes) || 20971520;
  const MB = 1048576;   /* MB as Windows shows it */
  /* fileJobs(listing, sizes) → { files: [{ path, type }], skipped: [{ path, why }] }, both sorted by path; listing = { folder: [paths] };
     sizes = { path: bytes } (build 53, Samrat 2026-11-17 "1. b"): a file over the most the file store takes stays on the PC */
  function fileJobs(listing, sizes) {
    const files = [], skipped = [];
    for (const dir of Object.keys(listing || {})) {
      for (const p of listing[dir] || []) {
        const m = /\.([A-Za-z0-9]+)$/.exec(p);
        const type = m ? FILE_TYPES[m[1].toLowerCase()] : undefined;
        if (!type) { skipped.push({ path: p, why: 'not a photo, picture or PDF' }); continue; }
        if (!NAME_OK.test(p)) { skipped.push({ path: p, why: 'a sign in the name the file store does not take: rename the file' }); continue; }
        if (sizes && typeof sizes[p] === 'number' && sizes[p] > MAX_FILE()) {
          skipped.push({ path: p, why: 'over ' + Math.round(MAX_FILE() / MB) + ' MB (' + (sizes[p] / MB).toFixed(1) + ' MB), the most the file store takes: stays on this PC' });
          continue;
        }
        files.push({ path: p, type: type });
      }
    }
    const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return { files: files.sort(byPath), skipped: skipped.sort(byPath) };
  }
  /* viewRights() → the rights on the view-only page: nothing changes; every view is locked with this line (app.js rightsOf) */
  const VIEW_LINE = 'View only: changes are made in the SOP Builder on Samrat\'s PC. Editing online comes later.';
  function viewRights() { return { kind: 'view', owner: null, can_change: false, read_only: true, lock_text: VIEW_LINE, tag: 'View only' }; }
  return { dbTable, dbKey, sqlType, columnsOf, tableSql, importRows, importSql, dbRowText, dbHashSql, fromOnline, inOrder, payload, hashDiff,
    fileDirs, fileJobs, viewRights, PREFIX, VIEW_LINE };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_ONLINE;
