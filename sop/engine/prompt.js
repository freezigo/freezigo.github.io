/* SOP Builder logic piece for the fixed prompt of a draft file (spec/example_draft_file.md part 7; build 61, Vishal 2026-11-20: "i need to
   copy the prompt from the builder and give it to any ai along with any other data i have like pdfs chart, drawings photos"): makePrompt
   ({ skill, tables, today, skillDate, build }) → { text, example }: how to use it, the job, what to ask, the freezigo-sop skill in full
   (prompt/skill.json in the SOP App folder, made by tools/make_prompt.js from source/skill without the PC's name and folders, read
   after the login: build 63), the rules of the data file, every field (schema/types.js, sets.js),
   an example (BMC-L1-TANK-01, engine/draft.js exportDraft), the Glossary of the tables, the PDF layout, the reader's checks. The words
   change only with a new version (PROMPT_NAME). Pure. Classic script (global ENGINE_PROMPT); module in Node. Check: tests/prompt_check.js. */
const ENGINE_PROMPT = (function () {
const TYPES_ = (typeof TYPES !== 'undefined') ? TYPES : require('../schema/types.js');
const SETS_ = (typeof SETS !== 'undefined') ? SETS : require('../schema/sets.js');
const DR = (typeof ENGINE_DRAFT !== 'undefined') ? ENGINE_DRAFT : require('./draft.js');
const PROMPT_NAME = 'Freezigo SOP draft prompt v7';
const FILE_NAME = PROMPT_NAME + '.md';
const EXAMPLE_SOP = 'BMC-L1-TANK-01';
const EXAMPLE_BY = 'AI chat for Divyal Patel';
const EXAMPLE_SOURCE = 'BMC-L1-TANK-01 BMC SS Tank SOP Rev02.pdf';

/* the parts of the data file, each with its contract table and the words of a row */
const PART_TABLE = { sop: 'sops', revision: 'sop_revisions', sections: 'sections', steps: 'steps', safety_items: 'safety_items', materials: 'materials', tools: 'tools',
  worked_examples: 'worked_examples', ref_tables: 'ref_tables', values_needed: 'values_needed' };
const PART_WORDS = {
  sop: 'the SOP: its ID and the header lines that stay from revision to revision',
  revision: 'this revision: purpose, scope, flow, drawings, how to use, holds, who prepared it',
  sections: 'the process sections, 3 and on, one row each',
  steps: 'the steps in the order of the work, one row each',
  safety_items: 'section 1, Safety and PPE (table P-1)',
  materials: 'section 2, Materials (table M-1)',
  tools: 'section 2, Tools and machines (table T-1)',
  worked_examples: 'a worked example (WE-n) for every measurement or calculation, sample numbers marked sample',
  ref_tables: 'reference tables of the SOP (a weld joint table, a record sheet table)',
  values_needed: 'every value nobody gave yet: [VALUE NEEDED] rows'
};
/* what the reader refuses when empty (engine/draft.js); the rest may be null */
const MUST = {
  sop: { sop_id: 'yes', level: 'new SOP', product: 'new SOP', title: 'new SOP', output_serial_tracked: 'new main SOP' },
  revision: {},
  sections: { section: 'yes', name: 'yes' },
  steps: { step_no: 'yes', section: 'yes', step_type: 'yes', action: 'yes', limit_status: 'yes when Min, Max or Unit is filled (else Not applicable)', hold: 'N when empty',
    repeat_count: '1 when empty', photo_required: 'false when empty' },
  safety_items: { no: 'its place when empty', status: 'yes', item: 'yes', who: 'yes', used_at: 'yes' },
  materials: { sr: 'its place when empty', status: 'yes', material: 'yes', qty: 'yes', used_at: 'yes' },
  tools: { no: 'its place when empty', type: 'yes', name: 'yes', used_at: 'yes' },
  worked_examples: { we_id: 'WE-n (its place) when empty', step_text: 'yes', what: 'yes', how: 'yes', decide: 'yes', example: 'yes' },
  ref_tables: { table_id: 'yes', title: 'yes', columns: 'yes', rows: 'yes' },
  values_needed: { step_text: 'yes', value_needed: 'yes', owner: 'yes', blocks_release: 'yes' }
};
/* notes and examples for the chat where the contract's own speak of the Builder (the Rev 02 import, the Flow tab) */
const NOTE = {
  'sop.sop_id': ['SOP ID in capitals. Main SOP: PRODUCT-LEVEL-NAME-NN. Process SOP: its code. An SOP already in the SOP Builder: its own ID.', 'BMC-L2-COILBANK-01'],
  'sop.sop_type': ['Main or Process (part 4, Two SOP types). Empty: Main.', 'Main'],
  'sop.output_serial_tracked': ['true when every piece this SOP makes gets its own serial number; false for a Process SOP.', true],
  'revision.prepared_by': ['Who wrote the SOP (usually Divyal Patel). Empty: the person who brings the file into the Builder.', 'Divyal Patel'],
  'revision.revision_note': ['What this draft is and where it came from, one or two lines.', 'Draft from Divyal\'s Rev 02 PDF; 4 values still needed.'],
  'revision.est_min_total': ['Minutes for the whole SOP. Empty when not given.', 240],
  'sections.section': ['Section number, 3 or more (1 and 2 are the lists safety_items, materials and tools).', 9],
  'sections.name_gu': ['The Gujarati name of the section: the source\'s when the English name is the source\'s; else yours ending with (draft) (rule 14).', '(the name in Gujarati letters)'],
  'sections.needs_sections': ['Sections of this SOP finished before this one starts.', [7, 8]],
  'sections.needs_sops': ['SOP IDs whose output is needed first. Each must be on the SOP list.', ['BMC-L0-LASERCUT-02']],
  'sections.needs_setup': ['true when the machine set-up section must have been done in this shift on the machine used here.', true],
  'sections.wait_after': ['This section starts at least Wait min minutes after that section ends; that section is in needs_sections.', 10],
  'sections.wait_min': ['The minutes of that wait.', 20],
  'sections.any_time_steps': ['Steps of this section that may be done before the Needs are met.', ['8.1', '8.2']],
  'sections.skilled': ['Skilled people for the section (welder, fitter, inspector; a chart\'s employee): a whole number, 0 or more. Empty when the source does not give it.', 1],
  'sections.helper': ['Helpers for the section: a whole number, 0 or more; 0 = no helper. Empty when the source does not give it.', 1],
  'sections.est_min': ['Minutes for the section. Empty when not given.', 45],
  'sections.max_wait': ['Longest wait before the next section: No limit when the item can wait; the time the source gives; [VALUE NEEDED: Divyal] with a values_needed row when the source says the wait matters (water standing in the tank, glue open time) but gives no number.', 'No limit'],
  'sections.restart_step': ['Where to start again when the section stops halfway: the first step not done; inside a timed chain (one weld route, glue coat to press, a test), the start of the chain.', '9.1 (the full test)'],
  'steps.step_no': ['Step number as text in quotes, the first number is the section. First step of a section x.1, a sub-step x.y.1, never x.0.', '9.5.1'],
  'steps.section': ['Section number: the first number of the step number.', 9],
  'steps.action_gu': ['The Gujarati line of the step: the source\'s when the English line is the source\'s; else yours with the Glossary words, ending with (draft) (rule 14).', '(the line in Gujarati letters)'],
  'steps.min': ['Lowest OK reading, in the Unit. Empty when not given (then Limit status Needed and a values_needed row).', 1285],
  'steps.max': ['Highest OK reading, in the Unit. Empty when not given.', 1295],
  'steps.est_min': ['Minutes this step takes. Empty when not given.', 10],
  'steps.hold': ['N for no hold; H1 on a Hold step (the Builder numbers the holds H1, H2 in order).', 'N'],
  'steps.gauge_id': ['The gauge of a Reading: its Gauge ID from the Gauges list (part 7.2). No gauge there fits: empty, the gauge named in Tool, and a values_needed row.', 'G-TAPE'],
  'steps.repeat_count': ['How many times the step is done on one unit. A step done once per piece repeats once per piece: 27 nitrile pieces, 27; 12 angles, 12.', 27],
  'steps.photo_ref': ['Photo file names the source gives, as a list. Empty when none: the Builder names new photos by Key.', ['TANK01-1220-OK.jpg']],
  'steps.photo_required': ['true when the operator must take a photo at this step.', false],
  'steps.remark': ['Notes for editors: guesses with % sure, questions, Photo to take. Not printed on the floor copy.', 'Inferred, 80% sure: ask Divyal.'],
  'safety_items.no': ['Running number in table P-1.', 1],
  'safety_items.item': ['A PPE or safety item to wear or to have in place (goggles, gloves, a chained cylinder). Never a warning: a warning goes in the Warning of the steps it is about.', 'Laser safety goggles (1064 to 1080 nm, as per machine manual)'],
  'materials.sr': ['Running number in table M-1.', 14],
  'tools.no': ['Running number in table T-1.', 14],
  'ref_tables.columns': ['Column names.', ['Joint', 'Welded at', 'Where', 'Type']],
  'ref_tables.rows': ['Rows; each row a list of cells (text or number).', [['W1 / W2', '5.4, 5.5, 5.7', 'LHS / RHS vertical seam', 'Continuous']]],
  'values_needed.step_text': ['The step number the value belongs to, as text, or the place ("Header", "2.1 item 4").', '9.5'],
  'values_needed.blocks_release': ['true when the value sits in a hold, reading or safety item.', true]
};
const KIND = { text: 'text', int: 'whole number', number: 'number', bool: 'true or false', list_text: 'list of texts', list_int: 'list of whole numbers', date: 'date', datetime: 'date and time' };

const cell = v => String(v === null || v === undefined ? '' : v).replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ');
function exampleOf(def) {
  const ex = def.example;
  switch (def.type) {
    case 'int': case 'number': { const m = /-?\d+(\.\d+)?/.exec(String(ex)); return m ? Number(m[0]) : null; }
    case 'bool': return /^(true|Y)/.test(String(ex));
    case 'list_int': return String(ex).split(',').map(x => parseInt(x, 10)).filter(x => !isNaN(x));
    case 'list_text': return String(ex).split(/\s*[|,]\s*/).filter(x => x);
    default: return ex;
  }
}
/* fieldTable(part): Field | Kind | Must fill | Note | Example, from the contract (types.js), sets.js and the notes above */
function fieldTable(part) {
  const defs = TYPES_.tables[PART_TABLE[part]].fields;
  const out = ['| Field | Kind | Must fill | Note | Example |', '|---|---|---|---|---|'];
  for (const name of DR.PARTS[part]) {
    const def = defs.find(f => f.name === name);
    const over = NOTE[part + '.' + name];
    let kind = def.type === 'set' ? 'one of: ' + SETS_[def.set].join(', ') : KIND[def.type];
    if (part === 'ref_tables' && name === 'rows') { kind = 'list of rows, each a list of cells'; }
    const note = over ? over[0] : def.note;
    const ex = over ? over[1] : exampleOf(def);
    out.push('| ' + name + ' | ' + cell(kind) + ' | ' + cell((MUST[part] || {})[name] || '') + ' | ' + cell(note) + ' | ' + cell(typeof ex === 'string' ? ex : JSON.stringify(ex)) + ' |');
  }
  return out.join('\n');
}
/* the skeleton of a data file: every part and every field */
function skeleton() {
  const row = part => '{ ' + DR.PARTS[part].map(f => '"' + f + '": …').join(', ') + ' }';
  const lines = ['{', '  "format": "' + DR.FORMAT + '", "version": ' + DR.VERSION + ', "prompt": "' + PROMPT_NAME + '",', '  "made_on": "2026-11-21", "made_by": "' + EXAMPLE_BY + '", "source": "' + EXAMPLE_SOURCE + '",',
    '  "sop": ' + row('sop') + ',', '  "revision": ' + row('revision') + ','];
  for (const part of ['sections', 'steps', 'safety_items', 'materials', 'tools', 'worked_examples', 'ref_tables', 'values_needed', 'notes']) { lines.push('  "' + part + '": [ ' + row(part) + ', … ]' + (part === 'notes' ? '' : ',')); }
  lines.push('}');
  return lines.join('\n');
}
/* the example data file: the SOP's first process section, the first rows of each list, and the rows that belong to that section */
function example(tables, today) {
  const full = DR.exportDraft(tables, EXAMPLE_SOP, { on: today, by: EXAMPLE_BY });
  const first = full.sections[0].section;
  const nos = full.steps.filter(s => s.section === first).map(s => s.step_no);
  const names = text => (String(text === null || text === undefined ? '' : text).match(/\d+(?:\.\d+)+/g) || []).some(n => nos.indexOf(n) >= 0);
  const we = full.worked_examples.filter(w => names(w.step_text));
  return Object.assign({}, full, { prompt: PROMPT_NAME, source: EXAMPLE_SOURCE,
    sections: full.sections.filter(s => s.section === first), steps: full.steps.filter(s => s.section === first),
    safety_items: full.safety_items.slice(0, 3), materials: full.materials.slice(0, 3), tools: full.tools.slice(0, 3),
    worked_examples: (we.length ? we : full.worked_examples).slice(0, 3), ref_tables: full.ref_tables.slice(0, 1).map(t => Object.assign({}, t, { rows: t.rows.slice(0, 2) })),
    values_needed: full.values_needed.filter(v => names(v.step_text)) });
}

const STATIC_HEAD = (today, glossary, skillDate, BUILD, gauges) => `# ${PROMPT_NAME}

Made by the SOP Builder (build ${BUILD}) on ${today} from the freezigo-sop skill (copied ${skillDate}; the company PC's name and folders left out), the SOP Builder's data rules (contract ${TYPES_.version}) and its Glossary (${glossary} terms) and Gauges (${gauges}). Made by the SOP Builder (Copy the prompt): never edit it by hand; a change is a new version.

## How to use it (for the person)

1. Open a new chat in any AI that can read files and make files (Claude, ChatGPT, Gemini; any account).
2. Paste this prompt (SOP Builder: New SOP, Start from: A draft file, Copy the prompt), or attach it as a file. Attach everything you have on the SOP: PDFs, Word files, a flow chart, drawings, photos, notes.
3. Write one line. Example: "Make the draft of BMC-L2-COILBANK-01 from the attached PDF."
4. Answer the chat's questions.
5. The chat gives two files: \`<SOP ID> draft.pdf\` to read and \`<SOP ID> draft.json\` for the SOP Builder.
6. Read the PDF. When it is right, open the SOP Builder: SOP list, New SOP, Start from: A draft file, pick the .json file.

## 1. Your job (for the chat)

Turn the attached source of one Freezigo manufacturing SOP (PDFs, Word files, a flow chart, drawings, photos, notes) into two files with the same content. Read every attached file: a flow chart gives the sections and their order (needs_sections), a drawing gives numbers with its drawing number and revision, a photo shows what a step looks like. Where two files disagree, ask. If you cannot make a PDF, give the data file and say so.

1. \`<SOP ID> draft.json\`: the data file of part 6. The SOP Builder reads this file and nothing else.
2. \`<SOP ID> draft.pdf\`: the same content in the floor copy layout of part 8, for people to read.

Make the data file first, then the PDF from the data file, so both say the same. Make no other files.

## 2. Ask first

Before you start, ask in one message, in simple words, numbered, with an example for each question. Ask only what the source does not say:

1. The SOP ID. Example: BMC-L2-COILBANK-01. An SOP that is already in the SOP Builder keeps its own ID: the Builder brings the file in as a copy and shows every difference.
2. For a new SOP: the level, the product and the title. Example: L1; BMC 1000 L cooling unit; Single aluminium coil.
3. Who prepared the SOP. Example: Divyal Patel.
4. Outline first, or the files straight away? Example: outline first. With "outline first", show the sections and the step list in the chat and wait for a yes.

## 3. The skill in this chat

Part 4 is the freezigo-sop skill in full: the rules for every Freezigo SOP. It was written for the SOP project on the company PC. In this chat:

- You are not on the company PC and you have no project docs: this prompt is all you have. Skip the parts about files on the PC, the decisions log, the master workbook (sop_data.py, build_master.py, Excel tables) and master build numbers.
- Stages: (b) is the outline in this chat, when the person asks for it; (c) is the two files. The floor trial (d) and the approval (e) happen later, in the SOP Builder.
- The SOP Builder gives each step its Key, Seq, Class, Signed by and hold number, and names the photos by Key. Leave them out of the data file.
- A review of an SOP that is already in the SOP Builder is done in the Builder (notes on its steps), not with this prompt.
- Where part 5 is stricter than part 4, follow part 5: the Builder's reader refuses a file that breaks part 5.
`;

const RULES = `## 5. The Builder's rules for the data file

1. One file is one SOP: its header, its sections, its steps and its lists.
2. The SOP ID in capitals. An SOP that is already in the SOP Builder: its own ID, never the ID of a copy (an ID that ends with -COPY1).
3. Sections 1 and 2 are not section rows. Section 1 (Safety and PPE) is the list safety_items (table P-1). Section 2 (Materials, tools and machines) is the lists materials (table M-1) and tools (table T-1). Process sections start at 3.
4. A step number is text in quotes: "3.1", "3.10", "3.1.1". As a number, 3.10 turns into 3.1.
5. The first step of a section is x.1, never x.0. A sub-step goes under its step: 3.1.1, never 3.1.0. A section never starts with a sub-step.
6. The section of a step is the first number of its step number: step "4.2" is in section 4. Every section a step is in is in the sections list, each section once.
7. The steps are in the order of the work: all steps of section 3, then section 4, and so on. The order of the file is the Seq.
8. Keep the step numbers of the source when they follow rules 4 to 7. A step you add goes under the step before it as a sub-step ("9.5.1"). The Builder matches the steps of an SOP it has by their numbers: a step that moves to another number shows as a change.
9. Never invent a value. A missing limit: Min and Max null, Limit status Needed, and a values_needed row whose step_text is the step number. A missing value inside a text: write [VALUE NEEDED: Divyal] (Hazrat for electrical) in the text and add a values_needed row.
10. Step type: Reading when the operator writes a number, Hold when the supervisor or the QC person signs, Action for the rest. An Action step has no Unit, Min or Max.
11. Limit status: Given (Min or Max filled), Needed (a limit is missing), Record only (a number is written, with no limit), Not applicable (no number).
12. Every Check has an If fail: one action, one IF at most.
13. Hold: "N", or "H1" on a Hold step. The Builder numbers the holds H1, H2 again in order.
14. The Gujarati line: action_gu for each step, name_gu for each section. When the English line is the source's line as written, its Gujarati line is the source's, as written. When you write or change the English line, write its Gujarati line again with the Glossary words of part 7, ending with "(draft)", so Divyal checks it. A term with no Gujarati word in part 7: write the English term as it sounds, in Gujarati letters, and list it under New Glossary words when you hand over.
15. Lists: used_at names the step numbers as written ("3.3, 3.5, 9.5" or "3.1 to 3.6").
16. A field with no value: null. A field that is not in part 6: leave it out (the Builder leaves out unknown fields, with a warning).
17. A step that follows a Process SOP comes in as a plain step; the Builder links it again.
18. Pictures and photos are not in the data file. Photo ref: only the photo file names the source gives.
19. Holds and the serial number: keep them as the source has them, even where part 4 wants something else (part 4: a hold after the test weld, the leak test and the final check; the serial number at the incoming check, before any work). For each place where the source and part 4 differ, write a note (the notes part): the step, what the source does, and what part 4 wants. Example: { "section": 7, "step": "7.11", "text": "7.11: no hold after the test weld. The SOP rules put a supervisor hold here." }. Do the same for any other rule of part 4 that you keep as the source has it. The SOP Builder puts every note on the Flow chart, open, on the box of its section, for the editors to decide.
`;

const PDF = `## 8. The PDF (the floor copy layout)

Make the PDF from the data file, in the floor copy layout of part 4 (Floor copy):

1. A4 upright. A plain sans serif font that has Gujarati letters (Noto Sans with Noto Sans Gujarati).
2. Gujarati letters join to each other. Build the PDF from HTML in a browser (Chrome or Chromium: print to PDF) or with WeasyPrint. A PDF tool without text shaping (reportlab) breaks the joined letters.
3. On top of every page: the SOP ID, "DRAFT from <source>, not for the floor", page n of m.
4. Page 1: title, product, level, purpose, scope, reference drawings, who does it, input from, output to, process flow, hold points, prepared by. Checked by and approved by stay blank.
5. Section 1 Safety and PPE (table P-1: No, Item, Who, Used at, Status). Section 2 Materials (table M-1) and Tools and machines (table T-1).
6. Each process section: its number and name with the Gujarati name under it; Needs, Ends with, Restart step, Manpower, Est min.
7. Each step: the step number; the English action with the Gujarati line under it; a warning in a box before the step; the Check with its target (Min to Max Unit) and If NOT OK; HOLD H1 on a hold; a tick box. A missing value shows [VALUE NEEDED: Divyal] in red.
8. After the sections: the worked examples, the reference tables, the Values Needed list, then the notes (rule 19).
9. The last page: the record sheet: one row per section, a blank for each reading, the signer on each row, a handover line.
10. Render every page to a picture and look at it before you hand the PDF over: no cut text, no broken Gujarati letters, no empty page.
`;

const CHECKS = `## 9. Check before you hand over

The SOP Builder's reader refuses the whole file (nothing comes in) when:

- the format is not "${DR.FORMAT}", or the version is not ${DR.VERSION};
- the SOP ID is empty or of the wrong shape, is the ID of a copy, or is an SOP that is Retired; the SOP type differs from the SOP in the Builder;
- a new SOP has no level, product, title or Output serial tracked;
- a field is of the wrong kind (text, number, whole number, true or false, list) or outside its allowed values (part 6.3);
- a field that must be filled (part 6.2) is empty;
- a step number is written as a number (not text in quotes), is not numbers with dots, ends in .0, is there twice, is in another section than its first number, or is in a section that is not in the sections list;
- a step of a section comes after a later section;
- there is a section 1 or 2 row, a section twice, no section or no step;
- Hold is not "N" or "H1", "H2";
- a list row number is there twice;
- a note has no text or more than 300 characters, has neither section nor step, names a section or a step that is not in the file, or names a step of another section.

It brings the file in and warns (fix what you can) when:

- an action (or a part i, ii, iii of an action) has more than 7 words;
- a Check has no If fail; a Reading has no Unit; an Action has a Unit, Min or Max;
- the Limit status does not fit Min and Max (Given needs Min or Max; Needed and Record only mean both are empty), or Min is more than Max;
- a step has no Gujarati line;
- a step with Limit status Needed has no values_needed row that names it;
- a values_needed row names a step that is not in the file;
- a step number is lower than the one before it in the same section;
- a section has no steps;
- the level does not match the SOP ID;
- a field or a part is not in part 6, or is one the Builder gives (left out).

Check yourself too (the reader does not):

- every Reading names its gauge from part 7.2, or has a values_needed row for it;
- a step done once per piece has the number of pieces as its Repeat count;
- the safety list holds PPE and safety items only; every warning sits in the Warning of its steps;
- every section has a Restart step and a Max wait (part 6.2);
- every place where you keep the source as written although part 4 wants something else has a note (rule 19): holds, the serial number, and the rest.

Then hand over:

1. The two files: \`<SOP ID> draft.json\` and \`<SOP ID> draft.pdf\`.
2. A short list: sections, steps, holds and readings (counts); the values_needed rows; the notes; every guess with how sure you are (%); New Glossary words; questions for Divyal, numbered, with an example answer.
`;

/* makePrompt({ skill, tables, today, skillDate }) → the prompt text */
function makePrompt(input) {
  const skill = String(input.skill).replace(/^---[\s\S]*?---\s*/, '').replace(/^# .*\n+/, '').replace(/^## /gm, '### ').trim();
  const glossary = (input.tables.glossary || []).slice().sort((a, b) => a.no - b.no);
  const ex = example(input.tables, input.today);
  const gauges = (input.tables.gauges || []).slice().sort((a, b) => String(a.gauge_id).localeCompare(String(b.gauge_id)));
  const parts = [STATIC_HEAD(input.today, glossary.length, input.skillDate, input.build, gauges.length)];
  parts.push('## 4. The SOP rules (the freezigo-sop skill)\n\n' + skill + '\n');
  parts.push(RULES);
  const p6 = ['## 6. The data file', '', '### 6.1 Its parts', '', 'One JSON file, UTF-8, with these parts in this order (… is a value):', '', '```json', skeleton(), '```', '',
    '- format and version: always "' + DR.FORMAT + '" and ' + DR.VERSION + '.', '- prompt: always "' + PROMPT_NAME + '".',
    '- made_on: the day you make the file (2026-11-21); made_by: who asked for it ("' + EXAMPLE_BY + '"); source: the source files ("' + EXAMPLE_SOURCE + '").', ''];
  for (const part of Object.keys(PART_TABLE)) { p6.push('- ' + part + ': ' + PART_WORDS[part] + '.'); }
  p6.push('- notes: open notes for the editors, each on the box of its section on the Flow chart: where you keep the source as written although part 4 wants something else (rule 19).');
  p6.push('', '### 6.2 Every field', '', 'Must fill: "yes" = the reader refuses the file when the field is empty; the other words say what an empty field becomes. Every other field may be null.');
  for (const part of Object.keys(PART_TABLE)) { p6.push('', '#### ' + part, '', fieldTable(part)); }
  /* build 67 (spec/example_draft_notes.md): the notes part has no table of its own in the contract */
  p6.push('', '#### notes', '', '| Field | Kind | Must fill | Note | Example |', '|---|---|---|---|---|',
    '| section | whole number | yes, unless step is given | The box on the Flow chart the note sits on: the section number. | 7 |',
    '| step | text | no | The step the note is about, as text; its section when section is empty. | "7.11" |',
    '| text | text | yes | What the source does and what part 4 wants; 300 characters at most; start with the step number. | "7.11: no hold after the test weld. The SOP rules put a supervisor hold here." |');
  p6.push('', '### 6.3 Allowed values (exact spelling)', '');
  const used = {};
  for (const part of Object.keys(PART_TABLE)) {
    for (const name of DR.PARTS[part]) {
      const def = TYPES_.tables[PART_TABLE[part]].fields.find(f => f.name === name);
      if (def.type === 'set') { (used[def.set] = used[def.set] || []).push(part + '.' + name); }
    }
  }
  for (const set of Object.keys(used)) { p6.push('- ' + used[set].join(', ') + ': ' + SETS_[set].map(v => '"' + v + '"').join(', ') + '.'); }
  p6.push('', '### 6.4 An example', '', 'The data file of ' + EXAMPLE_SOP + ' as the SOP Builder holds it, cut to its first process section, the first rows of each list and the Values Needed rows of that section. ' +
    (ex.steps.every(s => !s.action_gu) ? 'Its Gujarati lines are null because the Builder has none yet for ' + EXAMPLE_SOP + '; your file has them (rule 14). ' : '') +
    'The SOP Builder reads this example as it is.', '', '```json', JSON.stringify(ex, null, 2), '```', '');
  parts.push(p6.join('\n'));
  const p7 = ['## 7. Glossary and Gauges', '', '### 7.1 Glossary', '', 'Use these words. The Gujarati line uses the Gujarati word of each term; a term with no Gujarati word yet: rule 14.', '',
    '| Term | Gujarati | Meaning |', '|---|---|---|'];
  for (const g of glossary) { p7.push('| ' + cell(g.term) + ' | ' + cell(g.gujarati || '(none yet)') + ' | ' + cell(g.meaning) + ' |'); }
  /* build 64 (the SS tank test: no Reading had a gauge): the Gauges list, as the Glossary, from the open data */
  p7.push('', '### 7.2 Gauges', '', 'A Reading names its gauge by its Gauge ID (steps.gauge_id). No gauge here fits: leave gauge_id empty, name the gauge in Tool, and add a values_needed row.', '',
    '| Gauge ID | Name | Measures |', '|---|---|---|');
  for (const g of gauges) { p7.push('| ' + cell(g.gauge_id) + ' | ' + cell(g.name) + ' | ' + cell(g.measures) + ' |'); }
  parts.push(p7.join('\n') + '\n');
  parts.push(PDF);
  parts.push(CHECKS);
  return { text: parts.join('\n'), example: ex };
}

return { makePrompt: makePrompt, PROMPT_NAME: PROMPT_NAME, PROMPT_FILE: FILE_NAME };
})();
if (typeof module !== 'undefined') module.exports = ENGINE_PROMPT;
