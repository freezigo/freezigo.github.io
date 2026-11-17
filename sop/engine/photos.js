/* SOP Builder logic piece for photos by Key (spec/example_new_sop.md part
   12, job N3, Builder build 34): photoName, the file name a new photo of a
   step gets in source/Photos, by the skill's rule: [Key]-OK.jpg,
   [Key]-BAD-[defect code in small letters].jpg, and -2, -3 when the name
   is taken (a copy never overwrites a photo). Pure. Classic script
   (global ENGINE_PHOTOS); module in Node. Answer key: tests/golden15.js. */
const ENGINE_PHOTOS = (function () {
  const CONFIGX = (typeof CONFIG !== 'undefined') ? CONFIG : require('../config.js');
  function fail(place, msg) { throw new Error('engine.' + place + ': ' + msg); }
  const ref = (field, message) => ({ field: field, message: message });

  /* photoName({ key, kind: 'OK' | 'BAD', defect (a Defects code, BAD only), upload_name (the picked file), files (the paths there now) })
     → { file } or { refusals } */
  function photoName(input) {
    if (input.kind !== 'OK' && input.kind !== 'BAD') { fail('photoName', 'kind must be OK or BAD, not "' + input.kind + '"'); }
    const refusals = [];
    if (!/\.jpe?g$/i.test(String(input.upload_name || ''))) { refusals.push(ref('file', 'A photo is a .jpg file, as a phone takes it. Example: IMG_2031.jpg.')); }
    if (input.kind === 'BAD' && !String(input.defect || '').trim()) { refusals.push(ref('defect', 'Pick the defect the photo shows.')); }
    if (refusals.length) { return { refusals: refusals }; }
    const stem = input.key + '-' + input.kind + (input.kind === 'BAD' ? '-' + String(input.defect).trim().toLowerCase() : '');
    const taken = {};
    for (const p of input.files || []) { taken[String(p).split('/').pop().toLowerCase()] = true; }
    let file = stem + '.jpg', n = 1;
    while (taken[file.toLowerCase()]) { n++; file = stem + '-' + n + '.jpg'; }
    return { file: file, path: CONFIGX.photos_dir + '/' + file };
  }

  return { photoName };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_PHOTOS;
