/* SOP Builder page, build 52 (spec/example_online.md part 6): the card Put this PC's data online on the SOP list of the view-only page,
   for an admin (sop_people roles: admin; Samrat). The folder is read through STORE.pickSource (read only), the data moves through
   ONLINE.putOnline, the check is engine/online.js hashDiff; then the page loads again from online. Classic script (global APP_ONLINE). */
const APP_ONLINE = (function () {
  const $ = id => document.getElementById(id);
  let last = null;   /* the lines of the last run, shown again when the page loads anew */

  function isAdmin(me) { return !!me && (me.roles || []).indexOf('admin') >= 0; }
  /* drawCard(root, me): the card at the top of the SOP list, admin only */
  function drawCard(root, me) {
    if (!isAdmin(me)) { return; }
    const div = document.createElement('div');
    div.className = 'card online-card';
    div.id = 'online-card';
    div.innerHTML = '<b>Put this PC\'s data online</b>' +
      '<p class="muted">Admin only. Pick the SOP App folder (D:\\Claude\\Projects\\SOP App). Every table, photo, picture and final PDF goes online, ' +
      'then each one is checked against this PC. The PC copy does not change.</p>' +
      '<button id="btn-put-online">Pick the folder and put it online</button><div id="online-out" class="online-out"></div>';
    root.insertBefore(div, root.firstChild);
    if (last) { $('online-out').innerHTML = last; }
    $('btn-put-online').onclick = function () { APP.guard('ui putOnline', putOnline); };
  }
  /* the lines of one run */
  function report(r) {
    const n = x => Number(x).toLocaleString('en-GB');
    const bad = r.tableLines.concat(r.fileLines);
    let h = bad.length
      ? '<p class="err"><b>Not the same as this PC:</b></p><ul>' + bad.map(x => '<li>' + RENDER.esc(x) + '</li>').join('') + '</ul>'
      : '<p class="ok"><b>Online: ' + n(r.tables) + ' tables, ' + n(r.rows) + ' rows, ' + n(r.files) + ' files: all the same as this PC.</b></p>';
    if (r.removed) { h += '<p class="muted">Taken out online (no longer on this PC): ' + n(r.removed) + (r.removed === 1 ? ' file.' : ' files.') + '</p>'; }
    if (r.skipped.length) { h += '<p class="muted">Left on this PC:</p><ul>' + r.skipped.map(x => '<li>' + RENDER.esc(x.path + ': ' + x.why) + '</li>').join('') + '</ul>'; }
    return h;
  }
  async function putOnline() {
    const src = await STORE.pickSource();
    const btn = $('btn-put-online'), out = $('online-out');
    btn.disabled = true;
    const say = t => { out.textContent = t; console.log('[online] ' + t); };
    try {
      const r = await ONLINE.putOnline(src, say);
      last = report(r);
      console.log('[online] put online: ' + r.tables + ' tables, ' + r.rows + ' rows, ' + r.files + ' files; differ: ' + (r.tableLines.length + r.fileLines.length));
    } finally { btn.disabled = false; }
    await APP.startOnline();   /* the page shows what is online now */
  }
  return { drawCard, report, isAdmin };
})();
