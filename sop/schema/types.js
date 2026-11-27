/* SOP App contract 1.7: SOP tables (machine version of schema/contract.md
   parts 3 and 4). Every field: name, type, req (required), note and
   example (shown under the input on Builder screens). Types: text, int,
   number, bool, date, datetime, list_text, list_int, set (with set name).
   Classic script in the browser (global TYPES); module in Node. */
const TYPES = (function () {
  function f(name, type, req, note, example, extra) {
    const d = { name: name, type: type, req: req, note: note, example: example };
    if (extra) { for (const k in extra) { d[k] = extra[k]; } }
    return d;
  }
  const REV = [
    f('sop_id', 'text', true, 'SOP ID.', 'BMC-L1-TANK-01'),
    f('rev', 'text', true, 'Revision label.', 'Rev 02')
  ];
  const tables = {};

  tables.sops = { key: ['sop_id'], fields: [
    f('sop_id', 'text', true, 'PRODUCT-LEVEL-NAME-NN for a Main SOP; the code (3 to 20 capitals, digits or dashes) for a Process SOP.', 'BMC-L1-TANK-01'),
    f('sop_type', 'set', true, 'Main = makes a main part with its own serial. Process = one process used inside main SOPs (brazing); it can also run on its own.', 'Main', { set: 'sop_type' }),
    f('short', 'text', true, 'NAME and NN of the SOP ID (Main), or the code (Process), no hyphen. First part of every key.', 'TANK01'),
    f('level', 'set', true, 'L0 incoming, L1 part, L2 sub-assembly, L3 final assembly, L4 test, Site, or Process for a Process SOP.', 'L1', { set: 'level' }),
    f('product', 'text', true, 'Product the SOP belongs to.', 'BMC 1000 L cooling unit, heat-exchanger SS tank'),
    f('title', 'text', true, 'One line that says what the SOP covers.', 'BMC heat-exchanger SS tank: welding, leak test and insulation'),
    f('status', 'set', true, 'Built = steps exist. Listed = on the list, not written. On hold. Retired.', 'Built', { set: 'sop_status' }),
    f('current_rev', 'text', false, 'The revision the Builder opens. Empty = no revision yet.', 'Rev 02'),
    f('who_does_it', 'text', false, 'Roles that do the work.', 'Welder + helper (5.3: 2 persons). Supervisor signs HOLD H1 (3.8).'),
    f('input_from', 'text', false, 'Where the parts come from (SOP IDs, store).', 'Tank set from a lot accepted at BMC-L0-LASERCUT-02'),
    f('output_to', 'text', false, 'Where the output goes (SOP ID or store).', 'Store'),
    f('output_serial_tracked', 'bool', true, 'true when every output has a serial number.', 'true'),
    f('edited_in', 'set', true, 'SOP project = import may overwrite. Builder = import never overwrites.', 'SOP project', { set: 'edited_in' }),
    f('copy_of', 'text', false, 'The SOP this copy was saved from (the good version). Empty for an SOP that is not a copy.', 'BMC-L1-TANK-01'),
    f('copy_name', 'text', false, 'The name the editor gave the copy, 40 letters at most. Empty for an SOP that is not a copy.', 'Club trial 13 Nov'),
    f('owner', 'text', false, 'The person who saved the copy: only this person changes it (1.6). Empty for an SOP that is not a copy.', 'Samrat')
  ] };

  tables.sop_revisions = { key: ['sop_id', 'rev'], fields: REV.concat([
    f('status', 'set', true, 'Draft, Checked, Approved, Released, Superseded. Only Released reaches the floor.', 'Draft', { set: 'rev_status' }),
    f('rev_date', 'date', false, 'Date of this revision.', '2026-10-27'),
    f('purpose', 'text', false, 'Why the SOP exists, one line.', 'To weld, leak test, paint and insulate the tank the same correct way every time.'),
    f('scope', 'text', false, 'From which step to which step.', 'From the tank set issued from the store (3.1) to the tank handed over to the store (12.7).'),
    f('process_flow', 'text', false, 'Sections in order with arrows.', '3 Incoming inspection → 4 Machine set-up → 5 Side seams W1/W2'),
    f('reference_drawings', 'text', false, 'Drawing numbers with revision.', 'SST-01 C plate, SST-02 L plate (Rev A, 22 Oct)'),
    f('how_to_use', 'text', false, 'How the operator reads the SOP.', 'Do one section at a time, steps in the order of Seq.'),
    f('setup_rule', 'text', false, 'When the machine set-up section is skipped.', '4.2: if this machine was set and test-welded in this shift, go straight to section 5.'),
    f('hold_points', 'text', false, 'Every hold with its step and who signs.', 'HOLD H1 at 3.8 (incoming check, supervisor)'),
    f('est_min_total', 'number', false, 'Minutes for the whole SOP. Empty when not given.', '240'),
    f('prepared_by', 'text', true, 'Who wrote the revision (usually Divyal).', 'Divyal Patel'),
    f('checked_by', 'text', false, 'Raj or Divyal, never the preparer.', 'Raj'),
    f('checked_date', 'date', false, 'Date of the check. Empty = not checked.', '2026-11-10'),
    f('approved_by', 'text', false, 'Samrat.', 'Samrat'),
    f('approved_date', 'date', false, 'Date of the approval. Empty = not approved.', '2026-11-12'),
    f('revision_note', 'text', false, 'What changed in this revision and why.', 'Datum of 9.5 given by Divyal.'),
    f('release_note', 'text', false, 'What still stops release (free text from the master).', 'Not released (build 14): not checked, not approved.')
  ]) };

  tables.sections = { key: ['sop_id', 'rev', 'section'], fields: REV.concat([
    f('section', 'int', true, 'Section number, 3 or more. 1 and 2 are not rows here.', '9'),
    f('name', 'text', true, 'Section name.', 'Leak test and repair'),
    f('name_gu', 'text', false, 'Gujarati section name. Comes from the Rev 02 .docx import.', 'empty until the import'),
    f('needs_note', 'text', false, 'What must be done first, in words. People read this; the app reads the clean fields.', '7 and 8'),
    f('ends_with', 'text', false, 'How the section ends: hold, operator check or supervisor sign.', '9.6 PASS: no pink spot'),
    f('max_wait', 'text', false, 'Longest wait before the next section, or No limit.', 'No limit'),
    f('restart_step', 'text', false, 'Where to start again if the section stops halfway.', '9.1 (the full test)'),
    f('manpower', 'text', false, 'People needed, in words.', '2 to stand the tank on blocks (9.4)'),
    /* contract 1.7 (Vishal 2026-11-27, spec/example_people_69.md): the crew as two whole numbers; empty = not given, 0 = a real zero */
    f('skilled', 'int', false, 'Skilled people for the section (the chart\'s employee): welder, fitter, inspector. A whole number, 0 or more. Empty = not given yet.', '1', { min: 0 }),
    f('helper', 'int', false, 'Helpers for the section. A whole number, 0 or more: 0 = no helper. Empty = not given yet.', '1', { min: 0 }),
    f('est_min', 'number', false, 'Minutes for the section. Empty when not given.', '45'),
    f('needs_sections', 'list_int', false, 'Sections of this SOP finished first. Set by the arrows on the Flow tab; the build 15 import fills only empty ones.', '7, 8'),
    f('needs_sops', 'list_text', false, 'SOP IDs whose output is needed first, comma between. Each must be on the SOP list.', 'BMC-L0-LASERCUT-02, BMC-L0-BOUGHT-01'),
    f('needs_setup', 'bool', false, 'Y when the machine set-up section must have been done in this shift on the machine used here.', 'Y for the first welding section'),
    f('wait_after', 'int', false, 'This section starts at least Wait minutes after that section ends. That section must be in Needs sections.', '10'),
    f('wait_min', 'number', false, 'The minutes of that wait.', '20 (20 min after the coat)'),
    f('any_time_steps', 'list_text', false, 'Steps of this section that may be done before the Needs are met, comma between.', '8.1, 8.2'),
    f('source_ref', 'text', false, 'Box reference in the chart file this section came from. Empty when the section did not come from a chart.', 'AC01')
  ]) };

  tables.steps = { key: ['sop_id', 'key', 'rev'], fields: [
    f('key', 'text', true, 'Fixed ID of the step: short-nnnn. Never changes, never reused.', 'TANK01-2420', { pattern: '^[A-Z0-9]+-[0-9]{4}$' }),
    f('sop_id', 'text', true, 'SOP ID.', 'BMC-L1-TANK-01'),
    f('rev', 'text', true, 'Revision label.', 'Rev 02'),
    f('step_no', 'text', true, 'Number of the step inside the section, as text. A step added under 9.5 is 9.5.1.', '9.5'),
    f('seq', 'int', true, 'Order of the step in the SOP. Set by the Builder.', '53'),
    f('section', 'int', true, 'Section number.', '9'),
    f('step_type', 'set', true, 'Reading = the operator writes a number. Hold = the supervisor signs. Action = the rest.', 'Reading', { set: 'step_type' }),
    f('action', 'text', true, 'What the operator does. Verb first, 7 words or fewer. Parts i, ii, iii on separate lines.', 'Fill water to the test level'),
    f('action_gu', 'text', false, 'Divyal\'s Gujarati line for this step. Comes from the Rev 02 .docx import.', '(empty until the import)'),
    f('why', 'text', false, 'One line: why the operator follows the step when nobody watches.', 'The plugged pipe is under water, so W5 is tested too.'),
    f('warning', 'text', false, 'Danger shown before the action. Empty when there is none.', 'Never move a filled tank.'),
    f('tool', 'text', false, 'Tools for this step, comma between. None when no tool.', 'measuring tape'),
    f('gauge_id', 'text', false, 'The gauge for a reading, from the Gauges list.', 'G-TAPE'),
    f('material', 'text', false, 'Material used. None when no material.', 'Clean water, about 600 L'),
    f('min', 'number', false, 'Lowest OK reading, in the Unit. Empty when not given.', '1285'),
    f('max', 'number', false, 'Highest OK reading, in the Unit. Empty when not given.', '1295'),
    f('unit', 'text', false, 'Unit of the gauge. Empty for an Action step.', 'mm'),
    f('limit_status', 'set', true, 'Given = Min and Max filled. Needed = limit missing. Record only = number written, no limit. Not applicable = no number.', 'Given', { set: 'limit_status' }),
    f('check', 'text', false, 'What is checked, in numbers, with the datum.', 'Measure the water level from the inside floor.'),
    f('if_fail', 'text', false, 'One action when the check fails, one IF at most.', 'Add water. Measure again.'),
    f('skip_if', 'text', false, 'When the step may be skipped. Empty = never.', 'Skip if 9.6 = PASS.'),
    f('hold', 'text', true, 'N for no hold. Hold numbers are given by the Builder in order: H1, H2.', 'N', { pattern: '^(N|H[0-9]+)$' }),
    f('signed_by', 'set', true, 'Set by the Builder: Operator, or Operator + Supervisor on a hold.', 'Operator', { set: 'signed_by' }),
    f('class', 'set', true, 'Set by the Builder: Critical = hold, Major = reading, Minor = action.', 'Major', { set: 'class' }),
    f('repeat_count', 'int', true, 'How many times the step is done on one unit.', '1'),
    f('photo_ref', 'list_text', false, 'Reference photo files by key, the OK photo and the BAD photos, with | between.', 'TANK01-1220-OK.jpg | TANK01-1220-BAD-low-power.jpg'),
    f('photo_required', 'bool', true, 'Y when the operator must take a photo at this step.', 'N'),
    f('est_min', 'number', false, 'Minutes this step takes. Empty when not given.', '10'),
    f('remark', 'text', false, 'Notes for editors. Not printed on the floor PDF.', 'Rev 02 9.5: 1290 ±5 mm.'),
    f('link_sop', 'text', false, 'The Process SOP this step follows (Standard) or was copied from (Revised). Empty for an ordinary step.', 'BRAZE-CU'),
    f('link_rev', 'text', false, 'The revision of that Process SOP this step matches.', 'Rev 01'),
    f('link_key', 'text', false, 'The key of the step in that Process SOP.', 'BRAZECU-0100'),
    f('link_mode', 'set', false, 'Standard = follows the Process SOP; Revised = an own copy. Empty for an ordinary step.', 'Standard', { set: 'link_mode' })
  ] };

  tables.retired_keys = { key: ['sop_id', 'key'], fields: [
    f('key', 'text', true, 'The retired key.', 'TANK01-2330'),
    f('sop_id', 'text', true, 'SOP ID.', 'BMC-L1-TANK-01'),
    f('range_to', 'text', false, 'Last key of a retired range; every number from key to range_to is retired. Empty for one key.', 'TANK01-0470'),
    f('retired_in', 'text', true, 'Build or revision that retired the key.', 'build 14'),
    f('reason', 'text', true, 'Why the step went.', 'Dye wipe (cleaner) before the developer: Not in Rev 02.'),
    f('source', 'text', true, 'Where the Builder learnt it.', 'Key_Map build 13 to 14')
  ] };

  tables.values_needed = { key: ['vn_id'], fields: [
    f('vn_id', 'text', true, 'VN-nnnn. Given by the Builder.', 'VN-0012', { pattern: '^VN-[0-9]{4}$' }),
    f('no', 'int', true, 'Running number shown to people.', '12'),
    f('sop_id', 'text', true, 'SOP ID, or the sheet name as written for rows that are not an SOP.', 'BMC-L1-TANK-01'),
    f('step_text', 'text', true, 'Step or place, as written. The Builder links it to steps by rule.', '9.5'),
    f('value_needed', 'text', true, 'What is missing, in words.', 'Water level 1290 ±5 mm: datum (inside floor or outside bottom)'),
    f('unit', 'text', false, 'Unit of the value.', 'mm'),
    f('owner', 'set', true, 'Who gives the value: Divyal (mechanical, refrigeration), Hazrat (electrical).', 'Divyal', { set: 'vn_owner' }),
    f('blocks_release', 'bool', true, 'true when the value sits in a hold, reading or safety item.', 'true'),
    f('value', 'text', false, 'The value given. Empty = still open.', '1282 from the inside floor'),
    f('date_given', 'date', false, 'Date the value was given.', '2026-11-10'),
    f('sign', 'text', false, 'Who gave the value.', 'Divyal')
  ] };

  tables.glossary = { key: ['term'], fields: [
    f('no', 'int', true, 'Running number.', '70'),
    f('term', 'text', true, 'English term used in the SOPs.', 'Leak test'),
    f('meaning', 'text', true, 'Meaning in simple words.', 'Pink liquid and white powder on the welds, then water to 1290 ±5 mm for 30 min.'),
    f('bom_name', 'text', false, 'Name on the bill.', 'NITROGEN GAS'),
    f('store_label', 'text', false, 'Label in the store.', ''),
    f('gujarati', 'text', false, 'Gujarati word.', 'લીક ટેસ્ટ'),
    f('hindi', 'text', false, 'Hindi word.', ''),
    f('used_in', 'text', true, 'Which SOPs use the term.', 'TANK-01')
  ] };

  tables.gauges = { key: ['gauge_id'], fields: [
    f('gauge_id', 'text', true, 'G-NAME.', 'G-TAPE'),
    f('name', 'text', true, 'Gauge name.', 'Measuring tape (3 m)'),
    f('measures', 'text', true, 'What it measures.', 'Length, position, rib marks, water level'),
    f('range', 'text', true, 'Range as written.', '0 to 3000 mm (confirm)'),
    f('calibration', 'text', true, 'How it is calibrated.', 'Check against the steel rule yearly'),
    f('cal_due', 'text', true, 'Next calibration date, Not needed, or [VALUE NEEDED].', '[VALUE NEEDED: Divyal]')
  ] };

  tables.defects = { key: ['code'], fields: [
    f('code', 'text', true, 'Fixed defect code.', 'LEAK-DYE'),
    f('name', 'text', true, 'Short name.', 'Leak found by the dye test'),
    f('section_type', 'set', true, 'Kind of section where it is found.', 'Leak test', { set: 'defect_section_type' }),
    f('found_at', 'text', true, 'Steps where it is found, as written.', 'TANK-01 9.6'),
    f('looks_like', 'text', true, 'What the operator sees.', 'Pink spot on the white powder.'),
    f('photo', 'text', false, 'Photo file names, as written.', '')
  ] };

  tables.routing = { key: ['no'], fields: [
    f('no', 'int', true, 'Running number.', '26'),
    f('from_id', 'text', true, 'SOP ID, Purchase, Vendor or Store.', 'BMC-L1-TANK-01'),
    f('to_id', 'text', true, 'SOP ID, Store or Customer.', 'Store'),
    f('qty', 'int', true, 'How many outputs of From go into one unit of To.', '1'),
    f('serial_consumed', 'bool', true, 'true when the To work order records the From serial.', 'true'),
    f('note', 'text', false, 'Note.', 'Insulated, leak-tested tank with its record sheet')
  ] };

  tables.revision_history = { key: ['rh_id'], fields: [
    f('rh_id', 'int', true, 'Running number.', '25'),
    f('sop_id', 'text', true, 'SOP ID.', 'BMC-L1-TANK-01'),
    f('rev', 'text', true, 'Revision as written.', 'Rev 02'),
    f('date', 'date', true, 'Date of the change.', '2026-11-05'),
    f('what_changed', 'text', true, 'What changed and why.', 'Build 14: Divyal\'s Rev 02 adopted as the master.'),
    f('changed_by', 'text', true, 'Who changed it.', 'Divyal'),
    f('approved_by', 'text', true, 'Who approved, or [VALUE NEEDED].', 'Samrat (to sign)')
  ] };

  tables.safety_items = { key: ['sop_id', 'rev', 'no'], fields: REV.concat([
    f('no', 'int', true, 'Running number in table P-1.', '1'),
    f('status', 'set', true, 'Available, Soon (UPCOMING) or Later (FUTURE).', 'Soon', { set: 'item_status' }),
    f('item', 'text', true, 'The safety or PPE item.', 'Laser safety goggles (1064 to 1080 nm, as per machine manual)'),
    f('who', 'text', true, 'Who wears or does it.', 'Welder AND helper'),
    f('used_at', 'text', true, 'Steps, as written.', 'Every laser step: 4.8, 4.9, 5.4'),
    f('tag', 'text', false, 'Tag in Divyal\'s SOP.', 'UPCOMING')
  ]) };

  tables.materials = { key: ['sop_id', 'rev', 'sr'], fields: REV.concat([
    f('sr', 'int', true, 'Running number in table M-1.', '14'),
    f('status', 'set', true, 'Available, Soon or Later.', 'Available', { set: 'item_status' }),
    f('material', 'text', true, 'Material as in the store list.', 'Clean water (leak test)'),
    f('qty', 'text', true, 'Quantity per unit, as written.', 'about 600 L'),
    f('note', 'text', false, 'Note.', ''),
    f('used_at', 'text', true, 'Steps, as written.', '9.5')
  ]) };

  tables.tools = { key: ['sop_id', 'rev', 'no'], fields: REV.concat([
    f('no', 'int', true, 'Running number in table T-1.', '14'),
    f('type', 'set', true, 'Tool or Machine.', 'Tool', { set: 'tool_type' }),
    f('name', 'text', true, 'Tool or machine name.', '1 HP water pump + water pipes'),
    f('used_at', 'text', true, 'Steps, as written.', '9.5, 9.7, 10.1')
  ]) };

  tables.worked_examples = { key: ['sop_id', 'rev', 'we_id'], fields: REV.concat([
    f('we_id', 'text', true, 'WE-n or WE-H.', 'WE-12'),
    f('step_text', 'text', true, 'Step or rows it belongs to, as written.', '9.5'),
    f('what', 'text', true, 'What to measure.', 'Water level'),
    f('how', 'text', true, 'How to measure.', 'Measure the water level with the measuring tape.'),
    f('decide', 'text', true, 'How to decide pass or fail.', 'OK if 1285 to 1295 mm (1290 ±5).'),
    f('example', 'text', true, 'Example with sample numbers marked sample.', '1288 (sample): write 1288, OK.')
  ]) };

  tables.ref_tables = { key: ['sop_id', 'rev', 'table_id'], fields: REV.concat([
    f('table_id', 'text', true, 'Table label.', 'W-1'),
    f('title', 'text', true, 'Table title.', 'Weld joint overview (SST-W01 Rev B, Picture 3).'),
    f('columns', 'list_text', true, 'Column names.', '["Joint", "Welded at", "Where", "Type"]'),
    f('rows', 'list_text', true, 'Rows; each row a list of cells (text or number).', '[["W1 / W2", "5.4, 5.5, 5.7", "LHS / RHS vertical seam (1415)", "Continuous + 3 to 4 extra passes, leak-proof"]]', { db: 'jsonb' })
  ]) };

  tables.pictures = { key: ['sop_id', 'rev', 'picture_id'], fields: REV.concat([
    f('picture_id', 'text', true, 'Picture label as used in the steps.', 'Picture 10'),
    f('caption', 'text', true, 'Caption as written.', 'Picture 10: tank on blocks for the leak test'),
    f('file', 'text', true, 'File under source\\Pictures.', 'source/Pictures/TANK01-Rev02-Picture-10.png'),
    f('used_at', 'text', false, 'Steps, as written.', '9.4')
  ]) };

  tables.history = { key: ['hist_id'], fields: [
    f('hist_id', 'int', true, 'Running number from store.js.', '1'),
    f('at', 'datetime', true, 'When, with offset.', '2026-11-06T09:41:00+05:30'),
    f('who', 'text', true, 'Editor name until S3, then username.', 'Divyal'),
    f('sop_id', 'text', false, 'SOP ID.', 'BMC-L1-TANK-01'),
    f('rev', 'text', false, 'Revision.', 'Rev 02'),
    f('table', 'text', true, 'Table changed.', 'steps'),
    f('row_id', 'text', true, 'The row\'s key as text.', 'TANK01-2420'),
    f('field', 'text', true, 'Field changed.', 'check'),
    f('old_value', 'text', false, 'Old value as text. Empty when none.', 'Datum: [VALUE NEEDED: Divyal]'),
    f('new_value', 'text', false, 'New value as text. Empty when deleted.', 'Datum: inside floor'),
    f('reason', 'text', true, 'One line, why.', 'Datum given by Divyal, 6 Nov.')
  ] };

  tables.chart_notes = { key: ['note_id', 'rev'], fields: [
    f('note_id', 'int', true, 'Running number from store.js; the same note keeps it in the next revision.', '1'),
    f('sop_id', 'text', true, 'SOP ID.', 'BMC-L1-TANK-01'),
    f('rev', 'text', true, 'Revision the note belongs to.', 'Rev 02'),
    f('chart', 'set', true, 'sections (the section chart) or steps (the steps chart of one section).', 'sections', { set: 'note_chart' }),
    f('section', 'int', false, 'Section of a steps chart. Empty on the section chart.', '9'),
    f('pin', 'set', true, 'box, arrow or free.', 'box', { set: 'note_pin' }),
    f('pin_ref', 'text', false, 'Section number or step key (box), from>to (arrow), empty (free).', '9'),
    f('x', 'number', false, 'Free note: chart units across. Pinned note: across from the top-right corner of its box (the label point of its arrow), whole number, may be below 0; empty = the automatic place.', '120'),
    f('y', 'number', false, 'Free note: chart units down. Pinned note: down from the top-right corner of its box (the label point of its arrow); empty = the automatic place.', '1040'),
    f('text', 'text', true, 'The note, 300 characters at most.', 'Ask Divyal: max repairs?'),
    f('status', 'set', true, 'Open, Done or Deleted (a deleted note is kept, never drawn, its number never used again).', 'Open', { set: 'note_status' }),
    f('written_by', 'text', true, 'Editor who wrote it.', 'Samrat'),
    f('written_at', 'datetime', true, 'When, with offset.', '2026-11-07T06:40:00+05:30'),
    f('closed_by', 'text', false, 'Editor who marked it Done or Deleted.', 'Divyal'),
    f('closed_at', 'datetime', false, 'When it was marked Done or Deleted.', '2026-11-08T10:00:00+05:30')
  ] };

  /* the floor trial walks of a revision (Release check item 8; build 36): in the files since build 36, in the contract from 1.6 */
  tables.validation_log = { key: ['val_id'], fields: REV.concat([
    f('val_id', 'int', true, 'Running number of the walk.', '1'),
    f('date', 'date', true, 'Day of the walk.', '2026-11-13'),
    f('walked_by', 'text', true, 'The newcomer who ran the SOP.', 'Akshay'),
    f('watched_by', 'text', true, 'Who watched and counted the questions.', 'Samrat'),
    f('questions_asked', 'int', true, 'Questions the newcomer asked. 0 = the walk counts for release.', '0'),
    f('defects_found', 'text', false, 'Defects found on the unit, or 0.', '0'),
    f('fixed_in_rev', 'text', false, 'The revision that fixed what the walk found. Empty when nothing.', 'Rev 03')
  ]) };

  tables.meta = { key: [], fields: [
    f('contract_version', 'text', true, 'Contract this data follows.', '1.7'),
    f('data_build', 'int', true, 'Master build the data came from.', '14'),
    f('imported_at', 'datetime', true, 'When the import ran.', '2026-11-05T18:30:00+05:30'),
    f('import_note', 'text', true, 'What the import did.', '116 keys, 16 sections'),
    f('builder_build', 'int', true, 'Builder build number that last wrote the data.', '0')
  ] };

  /* fields a table had before and has no more (1.7: manpower_people, replaced by skilled and helper): an older file or row reads
     without them (engine/online.js asContract) */
  const removed = { sections: ['manpower_people'] };

  return { version: '1.7', tables: tables, removed: removed };
})();
if (typeof module !== 'undefined') module.exports = TYPES;
