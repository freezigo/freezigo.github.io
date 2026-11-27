/* SOP Builder logic pieces for the online tables (spec/example_online.md part 4, build 51; Samrat 2026-11-16: the SOP App goes online
   inside the ERP Supabase project): the contract's tables (schema/types.js, contract 1.7 since build 69) under the same names with "sop_" in front,
   the same fields, the contract's keys (meta: one row, id 1). dbTable, dbKey, sqlType, columnsOf, tableSql (the table), importRows
   (the rows as they go online: every field, sops with the owner), importSql (put a table online again, re-runnable). Pure: the SQL is
   text; tools/online_sql.js writes it and a session runs it. Classic script (global ENGINE_ONLINE); module in Node. Answer key:
   tests/golden29.js; build 52 to 54 tests/golden30.js; build 56 (editing online: saveChanges, editRights, saveLine, seenWhat)
   tests/golden32.js; build 69 (contract 1.7: asContract, the guard's contractLine) tests/golden41.js. */
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
  /* asContract(name, rows) → the rows without the fields the table no longer has (build 69, contract 1.7: sections.manpower_people;
     TYPES.removed): an older file or row reads as this contract; every other field as it is */
  function asContract(name, rows) {
    const gone = (TYPESX.removed && TYPESX.removed[name]) || [];
    if (!gone.length) { return rows; }
    return (rows || []).map(function (r) {
      if (!gone.some(k => k in r)) { return r; }
      const o = {};
      for (const k of Object.keys(r)) { if (gone.indexOf(k) < 0) { o[k] = r[k]; } }
      return o;
    });
  }
  /* importRows(tables, name) → the rows of a table as they go online: every field of the contract in its order (null when missing), a
     copy with its owner (ownerOf: the field, else its "added: copy" History row; 1.6), meta with id 1 and the contract of the tables
     online (a file not yet moved by tools/migrate_1_6.py still says 1.4 or 1.5); a field outside the contract stops it */
  function importRows(tables, name) {
    const d = defOf(name, 'importRows');
    const fields = d.fields.map(f => f.name);
    const rows = Array.isArray(tables[name]) ? asContract(name, tables[name]) : fail('importRows', 'table ' + name + ' is missing');
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
  /* fromOnline(name, rows, loose) → the rows as the Builder keeps them (as the PC files hold them): every field of the contract in its
     order, null when the row online has none; meta without its id; a field the table no longer has is left out (asContract); a field
     outside the contract stops it, unless loose (build 69: the database has another layout and the page only reads: the field is left out) */
  function fromOnline(name, rows, loose) {
    const d = defOf(name, 'fromOnline');
    const fields = d.fields.map(f => f.name);
    return asContract(name, rows || []).map(function (r) {
      for (const k of Object.keys(r)) {
        if (k === 'id' && !d.key.length) { continue; }
        if (fields.indexOf(k) < 0 && !loose) { fail('fromOnline', name + ' ' + (d.key.length ? d.key.map(x => r[x]).join(' ') : 'row') + ': ' + k + ' is not a field of the contract'); }
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
  /* build 57: also the pictures made from the 3D model (source/Pictures/ready, with ready.json) and the Planner charts of new SOPs */
  /* build 63: editDirs() = the four folders an editor may add a file to after switch day (the file store's insert rule of build 57);
     fileDirs() = every folder whose files go online and come back: those four and prompt (the draft prompt's rules file, skill.json,
     read after the login; put online by an admin with Put this PC's data online or Put this PC's new files online) */
  function editDirs() { return [CFG().photos_dir, CFG().pictures_dir, CFG().pictures_dir + '/ready', CFG().source_dir + '/chart']; }
  function fileDirs() { return editDirs().concat([CFG().prompt_dir]); }
  const FILE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', json: 'application/json' };
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
        if (!type) { skipped.push({ path: p, why: 'not a photo, picture, PDF or chart file' }); continue; }
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
  /* viewRights(line) → the rights on the view-only page: nothing changes; every view is locked with the line (app.js rightsOf): the
     line of the login (build 56: "View only: Vishal reads the SOPs but does not change them."), else VIEW_LINE */
  const VIEW_LINE = 'View only: changes are made in the SOP Builder on Samrat\'s PC. Editing online comes later.';
  function viewRights(line) { return { kind: 'view', owner: null, can_change: false, read_only: true, lock_text: empty(line) ? VIEW_LINE : line, tag: 'View only' }; }
  /* contractLine(dbVersion) → null when the database's data layout (sop_meta contract_version) is the page's; else the line of the
     view-only page (build 69, spec/example_people_69.md part 6: the page never writes into a layout it does not know) */
  function contractLine(dbVersion) {
    if (dbVersion === TYPESX.version) { return null; }
    return 'View only: the database has data layout ' + (empty(dbVersion) ? '(none)' : dbVersion) + ' and this page ' + TYPESX.version +
      '. Reload the page in a few minutes, when the update is done.';
  }

  /* ---- build 56: editing online (spec/example_edit_online.md; answer key tests/golden32.js) ---- */
  /* editRights(me, master) → { can_edit, line }: the page inside the Freezigo app edits for a login with the edit role once switch
     day has come (sop_settings master = online); else view only, every view locked with line */
  function editRights(me, master) {
    if (master !== 'online') { return { can_edit: false, line: VIEW_LINE }; }
    const roles = (me && Array.isArray(me.roles)) ? me.roles : [];
    if (roles.indexOf('edit') < 0) { return { can_edit: false, line: 'View only: ' + ((me && me.name) || 'this login') + ' reads the SOPs but does not change them.' }; }
    return { can_edit: true, line: null };
  }
  /* the lines of the database's sop_save (tools/online_sql.js editSql writes them into the SQL; {v} = the value) */
  const SAVE_LINES = {
    not_sop: 'Not saved: this login is not one of the SOP people.',
    reads_only: 'Not saved: {v} reads the SOPs but does not change them.',
    master: 'Not saved: changes are made in the SOP Builder on Samrat\'s PC until switch day.',
    history_only: 'Not saved: History rows are only added, never changed or taken out.',
    who: 'Not saved: every History row of a save carries the name of the login ({v}).',
    unnamed: 'Not saved: the save changes {v} but none of its History rows names it.',
    new_copy: 'Not saved: a new copy belongs to the login that saves it ({v}).',
    owner_fixed: 'Not saved: the owner of copy {v} does not change.',
    seen: 'Not saved: someone else changed {v} since this page loaded it. The page now shows the newest data: make the change again.',
    shape: 'Not saved: the save is not in the form the database takes ({v}).',
    /* build 57: switch day */
    not_admin_switch: 'Not switched: only an admin switches.',
    switch_value: 'Not switched: master is online or pc.',
    switch_differs: 'Not switched: the tables online differ from this folder: put it online again.',
    import_after_switch: 'Not saved: the SOPs are edited online since {v}: a PC\'s data would go over the changes made online. Switch back to the PC first.',
    file_there: '{v} is there already: a photo is never written over.',
    /* build 59 (spec/example_edit_online.md part 11): the rows a save writes, the sign-offs and the release by role */
    check_role: 'Not saved: only {v} checks.',
    approve_role: 'Not saved: only {v} approves.',
    release_role: 'Not saved: only {v} releases.',
    own_name: 'Not saved: a sign carries the name of the login ({v}).',
    preparer: 'Not saved: the preparer ({v}) does not check.',
    check_first: 'Not saved: Checked by and the check date are needed before approval.',
    copy_sign: 'Not saved: a copy is not signed or released: make it the good version first (Header tab).',
    new_rev: 'Not saved: a new revision starts as a Draft with no sign-offs.',
    /* build 69 (spec/example_people_69.md part 6): a page of another data layout ({v}: the database's) */
    contract: 'Not saved: this page does not match the database\'s data layout ({v}). Reload the page.'
  };
  /* saveLine(kind, value) → the line of sop_save */
  function saveLine(kind, value) {
    if (!Object.prototype.hasOwnProperty.call(SAVE_LINES, kind)) { fail('saveLine', 'no line "' + kind + '"'); }
    return SAVE_LINES[kind].replace('{v}', value === undefined || value === null ? '' : String(value));
  }
  /* seenWhat(table, row) → what the "someone else changed" line names: the SOP of the row, else the list it is in */
  const LIST_NAMES = { glossary: 'the Glossary', gauges: 'the Gauges', defects: 'the Defects', routing: 'the Routing', meta: 'the SOP App details' };
  function seenWhat(table, row) {
    if (row && !empty(row.sop_id)) { return String(row.sop_id); }
    return LIST_NAMES[table] || 'the ' + table.charAt(0).toUpperCase() + table.slice(1).replace(/_/g, ' ');
  }
  const noNulls = r => { const o = {}; for (const k of Object.keys(r)) { if (r[k] !== null && r[k] !== undefined) { o[k] = r[k]; } } return o; };
  /* saveChanges(before, after) → { changes: [{ t, op, key, row, was }], order: { table: [keys] }, tables: [names], contract }: one save as it goes
     to sop_save. Both are every table as the Builder keeps them; the rows are compared as they go online (importRows): insert = a
     key the page did not have (row), update = same key, another row (row and was, the row before), delete = a key the page no longer
     has (was); a row goes without its empty fields. The tables in the order of the contract; in a table the rows in the page's order,
     the rows taken out last. order: the keys of a table in the page's order, where they changed (sop_save keeps the order of the rows
     online). tables: the tables with a change or a new order. contract (build 69): the page's data layout, which sop_save checks. The
     same key twice in a table stops it */
  function saveChanges(before, after) {
    const b = payload(before), a = payload(after);
    const changes = [], order = {}, tables = [];
    for (const n of CFG().tables) {
      const kf = dbKey(n);
      const keyOf = r => kf.map(f => (r[f] === undefined ? null : r[f]));
      const index = function (rows) {
        const m = new Map();
        for (const r of rows) {
          const k = JSON.stringify(keyOf(r));
          if (m.has(k)) { fail('saveChanges', n + ': the key ' + k + ' is there twice'); }
          m.set(k, r);
        }
        return m;
      };
      const bi = index(b[n]), ai = index(a[n]);
      const keyObj = r => { const o = {}; for (const f of kf) { o[f] = r[f]; } return o; };
      const before0 = changes.length;
      for (const [k, r] of ai) {
        const o = bi.get(k);
        if (!o) { changes.push({ t: n, op: 'insert', key: keyObj(r), row: noNulls(r) }); continue; }
        if (dbRowText(o) !== dbRowText(r)) { changes.push({ t: n, op: 'update', key: keyObj(r), row: noNulls(r), was: noNulls(o) }); }
      }
      for (const [k, o] of bi) { if (!ai.has(k)) { changes.push({ t: n, op: 'delete', key: keyObj(o), was: noNulls(o) }); } }
      let moved = false;
      if (defOf(n, 'saveChanges').key.length) {
        const bk = Array.from(bi.keys()), ak = Array.from(ai.keys());
        moved = bk.length !== ak.length || bk.some((k, i) => k !== ak[i]);
        if (moved) { order[n] = a[n].map(keyOf); }
      }
      if (changes.length > before0 || moved) { tables.push(n); }
    }
    return { changes: changes, order: order, tables: tables, contract: TYPESX.version };   /* build 69: the page's data layout (sop_save step 2b) */
  }

  /* ---- build 57: files online and switch day (spec/example_edit_online.md part 9; answer key tests/golden33.js) ---- */
  /* newFileJobs(local, online) → { files: [{ path, type, why }], same, skipped }: after switch day, a file of the PC's folders goes
     online when it is not online (why new) or differs from the one online (why changed: another size, or another md5 where both are
     known); a file only online stays; a file the store does not take stays on the PC (fileJobs). local and online = [{ path, size, md5 }] */
  function newFileJobs(local, online) {
    const dirs = fileDirs();
    const there = {};
    for (const f of online || []) { there[f.path] = f; }
    const listing = {}, sizes = {};
    for (const f of local || []) {
      const dir = f.path.slice(0, f.path.lastIndexOf('/'));
      if (dirs.indexOf(dir) < 0) { fail('newFileJobs', f.path + ' is not in a folder that goes online'); }
      (listing[dir] = listing[dir] || []).push(f.path);
      sizes[f.path] = f.size;
    }
    const jobs = fileJobs(listing, sizes);
    const byPath = {};
    for (const f of local || []) { byPath[f.path] = f; }
    const files = [];
    let same = 0;
    for (const j of jobs.files) {
      const l = byPath[j.path], o = there[j.path];
      if (!o) { files.push({ path: j.path, type: j.type, why: 'new' }); continue; }
      const differs = (typeof o.size === 'number' && typeof l.size === 'number' && o.size !== l.size) || (!empty(o.md5) && !empty(l.md5) && o.md5 !== l.md5);
      if (differs) { files.push({ path: j.path, type: j.type, why: 'changed' }); } else { same++; }
    }
    return { files: files, same: same, skipped: jobs.skipped };
  }
  /* indiaDate(iso) → the day in India time (UTC+5:30), as the card writes it: 23 Nov 2026 */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function indiaDate(iso) {
    const t = Date.parse(String(iso).replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d\d)$/, '$1:00'));
    if (!isFinite(t)) { fail('indiaDate', JSON.stringify(iso) + ' is not a date and time'); }
    const d = new Date(t + 330 * 60000);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  /* switchState(row) → { master, since, by, line }: the card of switch day, from the sop_settings row master (none before build 56) */
  function switchState(row) {
    if (!row || row.value === 'pc') { return { master: 'pc', since: null, by: null, line: null }; }
    if (row.value !== 'online') { fail('switchState', 'master is ' + JSON.stringify(row.value) + ': online or pc'); }
    const since = indiaDate(row.set_at);
    return { master: 'online', since: since, by: row.set_by || null, line: 'SOPs are edited online since ' + since + (row.set_by ? ' (' + row.set_by + ')' : '') + '.' };
  }
  /* archiveNote(obj) → the line the SOP Builder on a PC shows for a folder with ARCHIVED.json (it only reads that folder) */
  function archiveNote(obj) {
    let when = '';
    try { when = obj && obj.archived_at ? ' since ' + indiaDate(obj.archived_at) + (obj.by ? ' (' + obj.by + ')' : '') : ''; } catch (e) { when = ''; }
    return 'Archive: SOPs are edited online' + when + '. The SOP Builder on this PC only reads this folder.';
  }
  /* archiveFile(nowIso, by) → { path, text }: the file the switch writes into the SOP App folder */
  const ARCHIVE_FILE = 'ARCHIVED.json';
  function archiveFile(nowIso, by) {
    indiaDate(nowIso);
    const o = { archived_at: nowIso, by: by, note: archiveNote({ archived_at: nowIso, by: by }), edit_online: 'Freezigo app, SOP Builder' };
    return { path: ARCHIVE_FILE, text: JSON.stringify(o, null, 1) + '\n' };
  }

  return { dbTable, dbKey, sqlType, columnsOf, tableSql, asContract, importRows, importSql, dbRowText, dbHashSql, fromOnline, inOrder, payload, hashDiff,
    editDirs, fileDirs, fileJobs, viewRights, contractLine, editRights, saveLine, seenWhat, saveChanges, newFileJobs, indiaDate, switchState, archiveNote, archiveFile,
    PREFIX, VIEW_LINE, SAVE_LINES, ARCHIVE_FILE };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_ONLINE;
