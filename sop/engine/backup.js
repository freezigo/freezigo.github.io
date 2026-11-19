/* SOP Builder logic pieces for the weekly backup, build 55 (spec/example_online.md part 8; Vishal 2026-11-19: "auto back up weekly and
   only keep last 4 copies"): backupName (the copy's name from its time), backupFiles (the 21 table files of the copy, as the Builder
   writes them), copyDiff (the tables of the copy that differ from the database), fileCheck (a file of the copy against the file store),
   backupReport (the run's last line), keepNewest (which copies stay). Pure: tools/sop_backup.js reads the database, writes the folder and
   removes old copies. Not loaded by the Builder's page. Classic script (global ENGINE_BACKUP); module in Node. Answer key:
   tests/golden31.js. */
const ENGINE_BACKUP = (function () {
  const fail = (piece, msg) => { throw new Error('engine.' + piece + ': ' + msg); };
  const CFG = () => (typeof CONFIG !== 'undefined' ? CONFIG : require('../config.js'));
  const PREFIX = 'sop-backup-';
  const num = n => Number(n).toLocaleString('en-GB');
  const count = (n, one, many) => num(n) + ' ' + (Number(n) === 1 ? one : many);

  /* backupName(nowIso) → "sop-backup-2026-11-22_0200": the date and the hour and minute of the time as written */
  function backupName(nowIso) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(String(nowIso));
    if (!m) { fail('backupName', nowIso + ' is not a date and time with its offset, like 2026-11-22T02:00:13+05:30'); }
    return PREFIX + m[1] + '_' + m[2] + m[3];
  }

  /* backupFiles(tables, nowIso, name) → [{ path, text }]: data/<table>.json for every table of the contract, in its order, written as
     store.js writeTable writes a table (table, contract, saved_at, saved_by, rows; one space a level) */
  function backupFiles(tables, nowIso, name) {
    const out = [];
    for (const t of CFG().tables) {
      if (!tables || !Array.isArray(tables[t])) { fail('backupFiles', 'table ' + t + ' is missing'); }
      const obj = { table: t, contract: CFG().contract, saved_at: nowIso, saved_by: name, rows: tables[t] };
      out.push({ path: CFG().data_dir + '/' + t + '.json', text: JSON.stringify(obj, null, 1) });
    }
    return out;
  }

  /* copyDiff(local, online) → [line]: the tables of the copy whose rows differ from the database (local = { table: { row_count, hash } }
     from the copy as it reads back; online = the lines of sop_table_hashes), in the contract's order */
  function copyDiff(local, online) {
    const by = {};
    for (const r of online || []) { by[r.tbl] = r; }
    const order = CFG().tables.filter(t => local && local[t]).concat(Object.keys(local || {}).filter(t => CFG().tables.indexOf(t) < 0));
    const out = [];
    for (const t of order) {
      const l = local[t], o = by[t];
      if (!o) { out.push(t + ': not in the database'); continue; }
      const n = Number(o.row_count), h = Number(l.row_count);
      if (n !== h) { out.push(t + ': ' + count(h, 'row', 'rows') + ' in the copy, ' + num(n) + ' in the database'); continue; }
      if (o.hash !== l.hash) { out.push(t + ': ' + count(h, 'row', 'rows') + ' in the copy and in the database, but the ' + (h === 1 ? 'row differs' : 'rows differ')); }
    }
    return out;
  }

  /* fileCheck(path, size, md5, meta) → null when the file of the copy is the one in the file store (meta.size; meta.eTag = the md5 in
     quotes; a file sent in parts ends "-n" and gives no md5), else the line */
  function fileCheck(path, size, md5, meta) {
    if (!meta || typeof meta.size !== 'number') { return path + ': the file store gives no size for it'; }
    if (meta.size !== size) { return path + ': ' + num(size) + ' bytes in the copy, ' + num(meta.size) + ' in the file store'; }
    const tag = String(meta.eTag || '').replace(/"/g, '');
    if (/^[0-9a-f]{32}$/.test(tag) && tag !== String(md5).toLowerCase()) { return path + ': not the same bytes as the file store (md5)'; }
    return null;
  }

  /* backupReport(r) → the run's last line: r = { name, tables, rows, files, lines } */
  function backupReport(r) {
    const head = r.name + ': ';
    if (r.lines && r.lines.length) { return 'RED: ' + head + 'not kept: ' + r.lines.join('; '); }
    return 'GREEN: ' + head + count(r.tables, 'table', 'tables') + ', ' + count(r.rows, 'row', 'rows') + ', ' + count(r.files, 'file', 'files') + ', the same as the database.';
  }

  /* keepNewest(list, n) → { keep: [name], drop: [{ id, name }] }: of the code store's downloads, the copies (names "sop-backup-…", not
     expired) newest first (time made, then name); the n newest stay */
  function keepNewest(list, n) {
    if (!(Number(n) >= 1)) { fail('keepNewest', 'keep at least 1 copy (asked for ' + n + ')'); }
    const mine = (list || []).filter(a => a && String(a.name).indexOf(PREFIX) === 0 && !a.expired)
      .slice().sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)));
    return { keep: mine.slice(0, n).map(a => a.name), drop: mine.slice(n).map(a => ({ id: a.id, name: a.name })) };
  }

  return { backupName, backupFiles, copyDiff, fileCheck, backupReport, keepNewest };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_BACKUP;
