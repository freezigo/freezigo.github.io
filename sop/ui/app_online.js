/* SOP Builder page, build 52 (spec/example_online.md part 6): the card Put this PC's data online on the SOP list of the page inside the
   Freezigo app, for an admin (sop_people roles: admin; Samrat). The folder is read through STORE.pickSource (read only), the data moves
   through ONLINE.putOnline, the check is engine/online.js hashDiff; then the page loads again from online.
   Build 57 (spec/example_edit_online.md part 9), switch day: after a run all the same as this PC the card offers the switch (the tables
   checked once more, sop_switch, then ARCHIVED.json into the folder). After switch day the card says since when and by whom, and offers:
   Put this PC's new files online, Save the data online as a SOP App folder (the way back), Mark a PC folder as an archive, Switch back to
   the PC. Classic script (global APP_ONLINE). */
const APP_ONLINE = (function () {
  const $ = id => document.getElementById(id);
  const esc = s => RENDER.esc(s);
  let last = null;         /* the lines of the last run, shown again when the page loads anew */
  let lastSource = null;   /* build 57: the folder of the last run that was all the same as this PC: the switch is offered for it */

  function isAdmin(me) { return !!me && (me.roles || []).indexOf('admin') >= 0; }
  /* drawCard(root, me, sw): the card at the top of the SOP list, admin only; sw = ENGINE_ONLINE.switchState (master pc or online) */
  function drawCard(root, me, sw) {
    if (!isAdmin(me)) { return; }
    const online = !!sw && sw.master === 'online';
    const div = document.createElement('div');
    div.className = 'card online-card';
    div.id = 'online-card';
    if (!online) {
      div.innerHTML = '<b>Put this PC\'s data online</b>' +
        '<p class="muted">Admin only. Pick the SOP App folder (D:\\Claude\\Projects\\SOP App). Every table, photo, picture and chart file goes online, ' +
        'then each one is checked against this PC. The PC copy does not change.</p>' +
        '<button id="btn-put-online">Pick the folder and put it online</button>' +
        (lastSource ? '<div class="switch-line" id="switch-box"><b>Switch day</b><p class="muted">The data online is the same as the folder ' + esc(lastSource.name) +
          '. Switch: from now on everyone with the edit role edits online, and the SOP Builder on this PC only reads this folder.</p>' +
          '<button id="btn-switch">Switch: edit online from now on</button> <span id="switch-confirm"></span></div>' : '') +
        '<div id="online-out" class="online-out"></div>';
    } else {
      div.innerHTML = '<b>Switch day</b><p class="switch-line" id="switch-line">' + esc(sw.line) + '</p>' +
        '<div class="online-actions"><button id="btn-put-files">Put this PC\'s new files online</button>' +
        '<button id="btn-save-folder">Save the data online as a SOP App folder</button>' +
        '<button id="btn-mark-archive">Mark a PC folder as an archive</button>' +
        '<button id="btn-switch-back">Switch back to the PC</button> <span id="switch-confirm"></span></div>' +
        '<p class="muted">New files: the photos, pictures and chart files of a PC folder that are not online, or differ; nothing online is taken out ' +
        'and no table changes. Save: into an empty folder; the SOP Builder on a PC can open it. Switch back: everyone is View only online again.</p>' +
        '<div id="online-out" class="online-out"></div>';
    }
    root.insertBefore(div, root.firstChild);
    if (last) { $('online-out').innerHTML = last; }
    if (!online) {
      $('btn-put-online').onclick = function () { APP.guard('ui putOnline', putOnline); };
      if ($('btn-switch')) { $('btn-switch').onclick = function () { confirmThen('Switch now? From now on everyone edits online.', 'Yes, switch', 'ui switch', switchNow); }; }
    } else {
      $('btn-put-files').onclick = function () { APP.guard('ui putNewFiles', putFiles); };
      $('btn-save-folder').onclick = function () { APP.guard('ui saveAsFolder', saveFolder); };
      $('btn-mark-archive').onclick = function () { APP.guard('ui markArchive', markArchive); };
      $('btn-switch-back').onclick = function () { confirmThen('Switch back? Everyone is View only online until the next switch.', 'Yes, switch back', 'ui switchBack', switchBack); };
    }
  }
  /* a question in the card (no browser dialog): yes runs fn */
  function confirmThen(question, yes, place, fn) {
    const c = $('switch-confirm');
    c.innerHTML = '<b class="warn">' + esc(question) + '</b> <button id="btn-yes">' + esc(yes) + '</button> <button id="btn-no">No</button>';
    $('btn-no').onclick = function () { c.innerHTML = ''; };
    $('btn-yes').onclick = function () { c.innerHTML = ''; APP.guard(place, fn); };
  }
  const n = x => Number(x).toLocaleString('en-GB');
  /* the lines of one run */
  function report(r) {
    const bad = r.tableLines.concat(r.fileLines);
    let h = bad.length
      ? '<p class="err"><b>Not the same as this PC:</b></p><ul>' + bad.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'
      : '<p class="ok"><b>Online: ' + n(r.tables) + ' tables, ' + n(r.rows) + ' rows, ' + n(r.files) + ' files: all the same as this PC.</b></p>';
    if (r.removed) { h += '<p class="muted">Taken out online (no longer on this PC): ' + n(r.removed) + (r.removed === 1 ? ' file.' : ' files.') + '</p>'; }
    if (r.skipped.length) { h += '<p class="muted">Left on this PC:</p><ul>' + r.skipped.map(x => '<li>' + esc(x.path + ': ' + x.why) + '</li>').join('') + '</ul>'; }
    return h;
  }
  const sayer = () => { const out = $('online-out'); return t => { if (out) { out.textContent = t; } console.log('[online] ' + t); }; };
  async function putOnline() {
    const src = await STORE.pickSource();
    const btn = $('btn-put-online');
    btn.disabled = true;
    try {
      const r = await ONLINE.putOnline(src, sayer());
      last = report(r);
      lastSource = r.tableLines.length + r.fileLines.length === 0 ? src : null;
      console.log('[online] put online: ' + r.tables + ' tables, ' + r.rows + ' rows, ' + r.files + ' files; differ: ' + (r.tableLines.length + r.fileLines.length));
    } finally { btn.disabled = false; }
    await APP.startOnline();   /* the page shows what is online now */
  }
  /* build 57: switch day: the folder of the last run once more against the tables online, then master = online, then ARCHIVED.json */
  async function switchNow() {
    const src = lastSource;
    if (!src) { throw new Error('ui switch: put the PC\'s data online first'); }
    const say = sayer();
    say('Checking the tables online against the folder ' + src.name + ' …');
    const diff = await ONLINE.sameAsFolder(src);
    if (diff.length) { lastSource = null; throw new Error('ui switch: ' + ENGINE_ONLINE.saveLine('switch_differs') + ' (' + diff.join('; ') + ')'); }
    say('Switching …');
    const st = ENGINE_ONLINE.switchState(await ONLINE.switchTo('online'));
    let line = 'Switched. ' + st.line;
    try {
      const f = ENGINE_ONLINE.archiveFile(APP.nowIso(), APP.state.me.name);
      await src.writeFile(f.path, f.text);
      line += ' The folder ' + src.name + ' is an archive now: the SOP Builder on this PC only reads it.';
    } catch (e) {
      line += ' The folder ' + src.name + ' could not be marked as an archive (' + e.message + '): click Mark a PC folder as an archive; until then nobody edits in the SOP Builder on that PC.';
    }
    console.log('[online] ' + line);
    last = '<p class="ok"><b>' + esc(line) + '</b></p>';
    lastSource = null;
    await APP.startOnline();
  }
  async function putFiles() {
    const src = await STORE.pickSource();
    const r = await ONLINE.putNewFiles(src, sayer());
    let h = r.lines.length ? '<p class="err"><b>Not the same as this PC:</b></p><ul>' + r.lines.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'
      : '<p class="ok"><b>Put online: ' + n(r.put.length) + (r.put.length === 1 ? ' file' : ' files') + '; ' + n(r.same) + ' the same as online already.</b></p>';
    if (r.put.length) { h += '<ul>' + r.put.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'; }
    if (r.skipped.length) { h += '<p class="muted">Left on this PC:</p><ul>' + r.skipped.map(x => '<li>' + esc(x.path + ': ' + x.why) + '</li>').join('') + '</ul>'; }
    last = h;
    await APP.startOnline();
  }
  async function saveFolder() {
    const target = await STORE.pickTarget();
    const r = await ONLINE.saveAsFolder(target, sayer(), APP.state.me.name, APP.nowIso());
    last = '<p class="ok"><b>Saved into the folder ' + esc(target.name) + ': ' + n(r.tables) + ' tables, ' + n(r.rows) + ' rows, ' + n(r.files) +
      ' files. The SOP Builder on a PC can open this folder (Pick folder).</b></p>';
    $('online-out').innerHTML = last;
  }
  async function markArchive() {
    const src = await STORE.pickSource();
    const f = ENGINE_ONLINE.archiveFile(APP.nowIso(), APP.state.me.name);
    await src.writeFile(f.path, f.text);
    last = '<p class="ok"><b>The folder ' + esc(src.name) + ' is an archive now: the SOP Builder on that PC only reads it.</b></p>';
    $('online-out').innerHTML = last;
  }
  async function switchBack() {
    await ONLINE.switchTo('pc');
    last = '<p class="ok"><b>Switched back to the PC: everyone is View only online. Edit on a PC in a folder saved from the data online, put it online and switch again.</b></p>';
    await APP.startOnline();
  }
  return { drawCard, report, isAdmin };
})();
