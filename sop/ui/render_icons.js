/* SOP Builder icons (example_flow.md parts 16.1 and 18.5, Samrat
   2026-11-12): one small picture per step type (○ action, □ reading,
   ■ hold) and per mark (◇ skip if, 📷 photo needed, 🖼 photos to see,
   and the chain of a step from a process SOP, build 30), drawn as 12 px
   SVG so they look the same
   on every PC and print; the word shows under the pointer. Used by the
   step boxes of chart C, the Short section boxes, the step card and the
   marks of the How to read panel (part 19.1). HTML from data only. Classic script (global
   RENDER_ICONS). */
const RENDER_ICONS = (function () {
  const WORD = { action: 'action', reading: 'reading', hold: 'hold', skip: 'skip if', photo: 'photo needed', image: 'photos to see', link: 'from a process SOP' };
  const SHAPE = {
    action: '<circle cx="6" cy="6" r="4.4" fill="none" stroke="#37474f" stroke-width="1.6"></circle>',
    reading: '<rect x="1.6" y="1.6" width="8.8" height="8.8" fill="none" stroke="#1565c0" stroke-width="1.6"></rect>',
    hold: '<rect x="1" y="1" width="10" height="10" fill="#c62828"></rect>',
    skip: '<path d="M6 0.9 L11.1 6 L6 11.1 L0.9 6 Z" fill="none" stroke="#6a1b9a" stroke-width="1.5"></path>',
    photo: '<rect x="0.8" y="3.2" width="10.4" height="7.2" rx="1.2" fill="none" stroke="#37474f" stroke-width="1.4"></rect>' +
      '<rect x="3.7" y="1.4" width="4.4" height="2" fill="#37474f"></rect><circle cx="6" cy="6.8" r="1.9" fill="none" stroke="#37474f" stroke-width="1.3"></circle>',
    image: '<rect x="0.8" y="1.2" width="10.4" height="9.6" rx="1" fill="none" stroke="#37474f" stroke-width="1.3"></rect>' +
      '<path d="M1.6 9.6 L4.6 5.8 L6.6 8 L8 6.6 L10.4 9.6 Z" fill="#37474f"></path><circle cx="8.2" cy="3.9" r="1.1" fill="#37474f"></circle>',
    link: '<rect x="0.7" y="3.4" width="6.2" height="5.2" rx="2.6" fill="none" stroke="#26a69a" stroke-width="1.5"></rect>' +
      '<rect x="5.1" y="3.4" width="6.2" height="5.2" rx="2.6" fill="none" stroke="#26a69a" stroke-width="1.5"></rect>'
  };
  const ORDER = ['action', 'reading', 'hold', 'skip', 'photo', 'image', 'link'];
  function icon(name) {
    if (!SHAPE[name]) { throw new Error('RENDER_ICONS.icon: no icon "' + name + '"'); }
    return '<svg class="ic ic-' + name + '" width="12" height="12" viewBox="0 0 12 12" role="img" aria-label="' + WORD[name] + '">' + SHAPE[name] + '</svg>';
  }
  /* icons(list, titles): the icons of one step (["reading", "skip"]), the word of each under the pointer;
     titles = other words for some icons ({ link: 'Standard: BRAZE-CU Rev 01' }) */
  function icons(list, titles) {
    const l = Array.isArray(list) ? list : [];
    const word = n => (titles && titles[n] ? titles[n] : WORD[n]).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return '<span class="icons" data-icons="' + l.join(' ') + '">' + l.map(n => '<span class="ic-w" title="' + word(n) + '">' + icon(n) + '</span>').join('') + '</span>';
  }
  /* counts(list): the icons line of a Short box ([{ icon, n }]): each icon with its count, "○7 ■1" */
  function counts(list) {
    return '<span class="icons" data-icons="' + list.map(i => i.icon + ':' + i.n).join(' ') + '">' +
      list.map(i => '<span class="ic-n" title="' + i.n + ' ' + WORD[i.icon] + '">' + icon(i.icon) + i.n + '</span>').join(' ') + '</span>';
  }
  /* legendList(): the marks of the How to read panel, one per line with its picture (part 19.1) */
  const MEANING = { action: 'action: a step that is done and ticked', reading: 'reading: a number to measure and write',
    hold: 'hold (H1, H2): the supervisor signs before the next step starts', skip: 'skip if: the step is skipped when its rule is met',
    photo: 'photo needed: the operator takes a photo at this step (Photo required Y)', image: 'photos to see: OK and BAD photos or a Picture on the step card',
    link: 'from a process SOP: Standard changes only with that SOP; Revised is your own copy' };
  function legendList() {
    const li = (html, words) => '<li><span class="lg-pic">' + html + '</span>' + words + '</li>';
    return '<ul class="legend-list">' + ORDER.map(n => li(icon(n), MEANING[n])).join('') +
      li('<span class="lg-band red"></span>', 'red band: section with a hold') + li('<span class="lg-band blue"></span>', 'blue band: section with readings') +
      li('<span class="lg-box grey"></span>', 'grey box: input from another SOP') + li('<span class="lg-box dotted"></span>', 'dotted box: the SOP\'s input and output') +
      li('<span class="lg-dash"></span>', 'dashed line: same shift, or a link between steps') + '</ul>';
  }
  return { icon, icons, counts, legendList, WORD };
})();
