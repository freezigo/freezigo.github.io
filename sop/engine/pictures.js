/* SOP Builder logic pieces for pictures on steps (spec/example_pictures.md, build 43): nextPictureId, pictureFile, namePicture,
   unnamePicture. A step shows a picture when its text names it, "(Picture 17)", as Divyal's Rev 02 does; the picture itself is a
   row of the pictures table and a file in source\Pictures. Pure. Classic script (global ENGINE_PICTURES); module in Node.
   Answer key: tests/golden24.js. */
const ENGINE_PICTURES = (function () {
  const CONFIGX = (typeof CONFIG !== 'undefined') ? CONFIG : require('../config.js');
  const empty = v => v === null || v === undefined || String(v).trim() === '';
  const ref = (field, message) => ({ field: field, message: message });
  const numberOf = id => { const m = /^Picture (\d+)$/.exec(String(id)); return m ? Number(m[1]) : null; };
  const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* nextPictureId(pictures, sopId, rev) → 'Picture n': one more than the highest Picture number of the revision (D-1 and the like do not count) */
  function nextPictureId(pictures, sopId, rev) {
    let top = 0;
    for (const p of pictures || []) {
      if (p.sop_id !== sopId || p.rev !== rev) { continue; }
      const n = numberOf(p.picture_id);
      if (n !== null && n > top) { top = n; }
    }
    return 'Picture ' + (top + 1);
  }

  /* pictureFile(short, sopId, rev, pictureId, uploadName, files) → { refusals } or { refusals: null, file, path }: TANK01-Rev02-Picture-17.png
     (a copy: TANK01-COPY1-Rev02-Picture-17.png) in source/Pictures, the extension of the picked file, -2, -3 when the name is taken */
  function pictureFile(short, sopId, rev, pictureId, uploadName, files) {
    const m = /\.(png|jpe?g)$/i.exec(String(uploadName || ''));
    if (!m) { return { refusals: [ref('file', 'A picture is a .png or .jpg file. Example: TANK01-3.3-bends-and-cut-out.png.')] }; }
    const ext = m[1].toLowerCase() === 'png' ? '.png' : '.jpg';
    const copy = /-COPY(\d+)$/.exec(String(sopId));
    const stem = String(short) + (copy ? '-COPY' + copy[1] : '') + '-' + String(rev).replace(/\s+/g, '') + '-' + String(pictureId).replace(/\s+/g, '-');
    const taken = {};
    for (const f of files || []) { taken[String(f).split('/').pop().toLowerCase()] = true; }
    let file = stem + ext, n = 1;
    while (taken[file.toLowerCase()]) { n++; file = stem + '-' + n + ext; }
    return { refusals: null, file: file, path: CONFIGX.pictures_dir + '/' + file };
  }

  const names = (text, id) => new RegExp('\\b' + escapeRe(id) + '\\b').test(String(text === null || text === undefined ? '' : text));

  /* namePicture(text, pictureId) → { refusals } or { refusals: null, text }: "(Picture n)" at the end of the text */
  function namePicture(text, pictureId) {
    if (names(text, pictureId)) { return { refusals: [ref('picture', 'names ' + pictureId + ' already.')] }; }
    const t = empty(text) ? '' : String(text).replace(/\s+$/, '');
    return { refusals: null, text: (t ? t + ' ' : '') + '(' + pictureId + ')' };
  }

  /* unnamePicture(text, pictureId) → { refusals } or { refusals: null, text }: every "(Picture n)" taken off with the space before it;
     a text left empty is null; refused when the text does not name it, or names it in its own words */
  function unnamePicture(text, pictureId) {
    const s = String(text === null || text === undefined ? '' : text);
    if (!names(s, pictureId)) { return { refusals: [ref('picture', 'does not name ' + pictureId + '.')] }; }
    const out = s.replace(new RegExp('[ \\t]?\\(' + escapeRe(pictureId) + '\\)', 'g'), '');
    if (names(out, pictureId)) { return { refusals: [ref('picture', 'names ' + pictureId + ' in its words: change the text in the step form.')] }; }
    const t = out.trim();
    return { refusals: null, text: t === '' ? null : t };
  }

  return { nextPictureId, pictureFile, namePicture, unnamePicture };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_PICTURES;
