# SOP App data contract, version 1.3 (1.0 frozen at Stage 2; 1.1 and 1.2 on 2026-11-07, 1.3 on 2026-11-12, see the end)

Written 2026-11-05, Builder step 2. Machine version: schema\types.js,
schema\types_floor.js, schema\sets.js, schema\source_map.json. Both say the
same thing; this file is the one people read. Every name below is the one
spelling used everywhere: files, screens, logic, tests, Supabase.

## 1. Rules that hold for every table

- Names are snake_case, ASCII, lower case: sop_id, step_no, limit_status.
  The master workbook's column names ("Step no", "Limit status") map to
  these one to one in schema\source_map.json. One concept, one name.
- Types: text, int, number (decimal), bool, date (YYYY-MM-DD), datetime
  (ISO 8601 with offset: 2026-11-06T09:41:00+05:30), list of text, list
  of int, one of a fixed set (schema\sets.js).
- Optional = may be null. Null means "not given". Never an empty string,
  never 0 for a missing number. Text that the source has as "None" or
  "No limit" stays as written: it is a given value.
- Time: every datetime is stored with its offset and shown in
  Asia/Kolkata as YYYY-MM-DD HH:MM. "Today" is the device's local date.
  Logic never reads the clock; the screen hands "now" in.
- Quantities: minutes as numbers; readings as typed, in the gauge unit.
  Labour minutes = sum over people of (left minus joined), whole minutes,
  rounded half up, once, at the end.
- Step numbers (step_no, restart_step) are text
  exactly as written: "3.1", "3.1.1", "7.0", "11.10". Never a number.
- Records link by key, never by step_no.
- Stored and recalculated: seq, class, signed_by and hold are stored and
  renumbered or recomputed on every Builder save (so they cannot drift).
  Target text, release check, compare, record sheet, Values Needed links,
  open/given, ready list: recalculated every time, never stored.

## 2. Files (S0 to S2) and the saved shape

One JSON file per table in \data: data\steps.json, data\sections.json.
Shape, fixed now:

```
{ "table": "steps", "contract": "1.3",
  "saved_at": "2026-11-05T18:30:00+05:30", "saved_by": "import build 14",
  "rows": [ { ...one row per object, field names as below... } ] }
```

store.js is the only code that reads or writes these files. From S3 the
same tables live in Supabase; saved_at and saved_by become columns
written by the server. The Builder reaches \data with the browser's
folder picker (File System Access API): the editor picks the SOP App
folder once, the Builder keeps the handle and asks for permission with
one click at each open. Tested 2026-11-05: Chromium on file:// has
showDirectoryPicker, IndexedDB and classic scripts; module scripts and
fetch are blocked on file://, so all scripts are classic scripts.

## 3. Identity: who makes which ID

| ID | Form | Made by |
|---|---|---|
| sop_id | PRODUCT-LEVEL-NAME-NN: BMC-L1-TANK-01 | SOP project (import); Builder later |
| short | NAME + NN of the sop_id: TANK01 | Import, from sop_id |
| key | short-nnnn: TANK01-2420. Never changed, never reused | Import as given. Builder for a new step: the smallest free multiple of 10 (then 5, then 1) strictly between the key numbers of the Seq neighbours; if there is none, the next free multiple of 100 above the highest key number of the SOP (used or retired). The Builder says which rule it used |
| rev | "Rev 02"; next is "Rev 03" | Builder: last + 1 |
| hold | "N" or "H1", "H2" in Seq order through the SOP | Builder renumbers on save |
| seq | 1, 2, 3 in order through the SOP | Builder renumbers on save |
| vn_id | VN-0001 | Import from the master's No.; Builder: highest + 1 |
| rh_id, hist_id, val_id | 1, 2, 3 | store.js gives the next number; logic receives it |
| wo_id | WO-0001 | Production Manager screen (S5); ERPNext later |
| run_id, pause_id, rec_id | device id + "-" + running number: P01-000123 | Floor App on the phone (works offline) |
| username | lower case, no spaces: ramesh | Editor (S3) |

## 4. SOP tables (imported from the master, edited in the Builder)

### sops (one row per SOP ID; key: sop_id)
| Field | Type | Required | Example |
|---|---|---|---|
| sop_id | text | yes | BMC-L1-TANK-01 |
| sop_type | set sop_type | yes | Main (1.4) |
| short | text | yes | TANK01 |
| level | set level | yes | L1 (Process for a Process SOP, 1.4) |
| product | text | yes | BMC 1000 L cooling unit, heat-exchanger SS tank |
| title | text | yes | BMC heat-exchanger SS tank: welding, leak test and insulation |
| status | set sop_status | yes | Built |
| current_rev | text | no (null = no revision yet) | Rev 02 |
| who_does_it | text | no | Welder + helper (5.3: 2 persons) ... |
| input_from | text | no | Tank set (C plate, L plate, 12 angles ...) |
| output_to | text | no | Store (Vishal 5 Nov): one welded ... |
| output_serial_tracked | bool | yes | true |
| edited_in | set edited_in | yes | SOP project |
| copy_of | text | no (null = not a copy) | BMC-L1-TANK-01 (1.5) |
| copy_name | text | no (null = not a copy) | Club trial 13 Nov (1.5) |
| owner | text | no (null = not a copy) | Samrat: the person who saved the copy; only this person changes it (1.6) |

### sop_revisions (one row per SOP and revision; key: sop_id, rev)
| Field | Type | Required | Example |
|---|---|---|---|
| sop_id, rev | text | yes | BMC-L1-TANK-01, Rev 02 |
| status | set rev_status | yes | Draft |
| rev_date | date | no | 2026-10-27 |
| purpose, scope, process_flow, reference_drawings, how_to_use | text | no | (SOP sheet header rows) |
| setup_rule | text | no | 4.2: if this machine was set and test-welded in this shift ... |
| hold_points | text | no | HOLD H1 at 3.8 (incoming check, supervisor) ... |
| est_min_total | number | no (null = [VALUE NEEDED]) | null |
| prepared_by | text | yes | Divyal Patel |
| checked_by, checked_date | text, date | no | null, null |
| approved_by, approved_date | text, date | no | null, null |
| revision_note | text | no | Build 14: Divyal's Rev 02 as is ... |
| release_note | text | no | Not released (build 14): not checked ... |

A sign is a name AND a date. "Raj (name, date). Not the preparer." in
build 14 is a placeholder, not a sign: import stores it in checked_by as
written and checked_date stays null, so the release check fails until a
date is given. status moves Draft → Checked → Approved → Released →
Superseded; only Released reaches the Floor App.

### sections (process sections 3 onwards; key: sop_id, rev, section)
| Field | Type | Required | Example (TANK-01 section 9) |
|---|---|---|---|
| sop_id, rev | text | yes | BMC-L1-TANK-01, Rev 02 |
| section | int (3 or more) | yes | 9 |
| name | text | yes | Leak test and repair |
| name_gu | text | no (empty until the .docx import) | null |
| needs_note | text | no | 7 and 8 |
| ends_with | text | no | 9.6 PASS: no pink spot (PASS written on the record sheet) |
| max_wait | text | no | Before 10.1: [VALUE NEEDED: Divyal] (water standing in the tank) |
| restart_step | text | no | 9.1 (the full test) |
| manpower | text | no | 2 to stand the tank on blocks (9.4); test [VALUE NEEDED: Divyal] |
| est_min | number | no (null = [VALUE NEEDED]) | null |
| needs_sections | list of int | no | null (build 15: [7, 8]) |
| needs_sops | list of text | no | null |
| needs_setup | bool | no | null (build 15: false) |
| wait_after | int | no | null (section 11 from build 15: 10) |
| wait_min | number | no | null (section 11 from build 15: 20) |
| any_time_steps | list of text | no | null (section 8 from build 15: ["8.1", "8.2"]) |
| manpower_people | int | no | null |
| source_ref | text | no | null (a kickstarted section: AC01, the chart box ref) |

The seven clean Needs fields are filled by the SOP project from build 15
(spec.md). Meaning, 85% sure from the build 14 free text: needs_sections
= sections of this SOP finished first; needs_sops = SOP IDs whose output
is needed; needs_setup = the machine set-up must be done this shift;
wait_after and wait_min = this section starts at least wait_min minutes
after section wait_after ends; any_time_steps = steps of this section
that may be done before the Needs are met; manpower_people = people.
Sections 1 (Safety and PPE) and 2 (Materials, tools and machines) are not
rows here: the Builder shows them from safety_items, materials and tools.

### steps (one row per step; key: sop_id, key, rev (1.6: a copy has the same Keys))
| Field | Type | Required | Example (TANK-01 9.5) |
|---|---|---|---|
| key | text, short-nnnn | yes | TANK01-2420 |
| sop_id, rev | text | yes | BMC-L1-TANK-01, Rev 02 |
| step_no | text | yes | 9.5 |
| seq | int | yes | 53 |
| section | int | yes | 9 |
| step_type | set step_type | yes | Reading |
| action | text, parts on separate lines "i. ", "ii. " | yes | Fill water to the test level |
| action_gu | text | no (empty until the .docx import) | null |
| why | text | no | The plugged pipe is under water, so W5 is tested too (Rev 02). |
| warning | text | no | A tank filled to 1290 mm holds about 600 litres ... |
| tool | text | no | 1 HP water pump and pipes, measuring tape |
| gauge_id | text, a gauges.gauge_id | no | G-TAPE |
| material | text | no | Clean water, about 600 L |
| min, max | number | no (null = not given) | 1285, 1295 |
| unit | text | no (null on an Action step) | mm |
| limit_status | set limit_status | yes | Given |
| check | text | no | Fill with the 1 HP pump. Measure the water level ... |
| if_fail | text | no | Add water or pump water out. Measure again. |
| skip_if | text | no | null |
| hold | text, N or Hn | yes | N |
| signed_by | set signed_by | yes | Operator |
| class | set class | yes | Major |
| repeat_count | int | yes | 1 |
| photo_ref | list of text (file names) | no | null (5.9: ["TANK01-1220-OK.jpg", "TANK01-1220-BAD-low-power.jpg", "TANK01-1220-BAD-high-power.jpg"]) |
| photo_required | bool | yes | false |
| est_min | number | no | null |
| remark | text | no | Rev 02 9.5: 1290 ±5 mm. See worked example WE-12. |
| link_sop, link_rev, link_key | text | no (1.4) | empty (a Process SOP step: BRAZE-CU, Rev 01, BRAZECU-0100) |
| link_mode | set link_mode | no (1.4) | empty (Standard or Revised) |

Derived on save: class = Critical when step_type is Hold, Major when
Reading, Minor when Action. signed_by = "Operator + Supervisor" when hold
is not N, else "Operator". photo_required = the operator takes a photo
at this step (floor); photo_ref = the reference photos a check compares
with. A clubbed row keeps its parts in action, why, check and if_fail,
one part per line, each starting "i. ", "ii. ", "iii. ".

### retired_keys (key: sop_id, key (1.6))
key, sop_id, range_to (text, optional: last key of a retired range such
as TANK01-0410 to TANK01-0470; every number in between is retired),
retired_in (text: "build 14" or "Rev 5"), reason (text), source (text:
"Key_Map build 13 to 14" or "Revision_History 2026-10-14"). A key here is
never used again.

### values_needed (key: vn_id)
| Field | Type | Required | Example (No. 12) |
|---|---|---|---|
| vn_id | text VN-nnnn | yes | VN-0012 |
| no | int | yes | 12 |
| sop_id | text as written (may be "BOM by SOP") | yes | BMC-L1-TANK-01 |
| step_text | text as written | yes | 9.5 |
| value_needed | text | yes | Water level 1290 ±5 mm: datum (inside floor or outside bottom) |
| unit | text | no | text |
| owner | set vn_owner | yes | Divyal |
| blocks_release | bool | yes | true |
| value, date_given, sign | text, date, text | no (null = open) | null |

Open = value is null; given = value filled. Links to steps are
recalculated from step_text: "9.5" → the step 9.5 of the SOP; "9.2, 9.3"
→ both; "9 to 10" → sections 9 and 10; "11.9 to 11.13" → every step from
11.9 to 11.13 by seq; other text → the SOP only.

### glossary (key: term)
no (int), term (text), meaning (text), bom_name, store_label, gujarati,
hindi (text, optional), used_in (text).

### gauges (key: gauge_id)
gauge_id (G-TAPE), name, measures, range, calibration, cal_due (text as
written: a date, "Not needed" or "[VALUE NEEDED: Divyal]").

### defects (key: code)
code (LEAK-DYE), name, section_type (set defect_section_type), found_at
(text), looks_like (text), photo (text, optional).

### routing (key: no)
no (int), from_id (text: SOP ID, "Purchase", "Vendor", "Store"), to_id
(text), qty (int), serial_consumed (bool), note (text, optional).

### revision_history (key: rh_id)
rh_id (int), sop_id, rev (text as written), date (date), what_changed,
changed_by, approved_by (text). The human log; one row per change.

### safety_items (key: sop_id, rev, no)
no (int), status (set item_status), item, who, used_at (text), tag
(text, optional: Rev 02 tag UPCOMING or FUTURE). From table P-1.

### materials (key: sop_id, rev, sr)
sr (int), status (set item_status), material, qty (text), note (text,
optional), used_at (text). From table M-1.

### tools (key: sop_id, rev, no)
no (int), type (set tool_type), name, used_at (text). From table T-1.

### worked_examples (key: sop_id, rev, we_id)
we_id (WE-12), step_text, what, how, decide, example (text).

### ref_tables (key: sop_id, rev, table_id)
table_id (W-1, N-1, D), title (text), columns (list of text), rows (list
of lists; a cell is text or number). Reference tables of an SOP that are
not steps: weld joints, nitrile cut list, drawing views.

### pictures (key: sop_id, rev, picture_id)
picture_id (Picture 1), caption, file (text: source\Pictures\...png),
used_at (text). Drawn from CAD; photos are files in source\Photos named
by key and are not a table.

### history (key: hist_id)
hist_id (int), at (datetime), who (set editor until S3, then a username),
sop_id, rev (text, optional), table (text), row_id (text: the row's key
as text, e.g. TANK01-2420 or 9 for a section), field, old_value,
new_value (text, null when none), reason (text). One row per field
changed. Floor edits (S3+) use the same table.

### validation_log (key: val_id; 1.6, in the files since build 36)
val_id (int), sop_id, rev, date (date: the walk), walked_by (text: the
newcomer), watched_by (text), questions_asked (int: 0 = the walk counts
for release), defects_found (text, optional), fixed_in_rev (text,
optional).

### meta (one row)
contract_version (1.3), data_build (int: 14), imported_at (datetime),
import_note (text), builder_build (int).

## 5. Floor tables (shape fixed now, not used until S3; see part 8)

schema\types_floor.js. All floor rows carry recorded_at (device clock
when made) and synced_at (server clock when stored; null while offline).

- people (username): name, roles (list of set role), active (bool),
  password_hash (null until S3), created_at.
- work_orders (wo_id): sop_id, rev, serial (null until the incoming
  check gives it), product, status (set wo_status), parent_order,
  erp_order_id (null in v1), released_by, released_at, started_at,
  finished_at, current_section (int), consumed_serials (list of text),
  note.
- section_runs (run_id): wo_id, section, attempt (int: 1, then 2 after a
  restart or a repeat test), lead (username), status (set run_status),
  started_at, finished_at, restart_step (text), setup_from_wo (text:
  the work order whose set-up was used when section 4 is skipped).
- run_people (run_id, username, joined_at): left_at.
- pauses (pause_id): run_id, reason (set pause_reason), paused_at,
  resumed_at, by (username).
- step_records (rec_id): wo_id, run_id, key, section, reading (number),
  result (set result), done (bool), defect_code, operator, operator_at
  (for a hold: when the hold started), supervisor, supervisor_at (for a
  hold: when the result was signed), attempt (int), remark, photo_file.
- operator_training (username, sop_id): role, trained_by, date_trained
  (date), status (set training_status), note.
- validation_log (val_id): sop_id, rev, date, walked_by, watched_by,
  questions_asked (int), defects_found (text), fixed_in_rev (text).

## 6. Fixed sets (exact spelling; schema\sets.js)

level: L0, L1, L2, L3, L4, Site, Process (1.4) · sop_type: Main, Process
(1.4) · link_mode: Standard, Revised (1.4) · sop_status: Built, Listed, On hold,
Retired · rev_status: Draft, Checked, Approved, Released, Superseded ·
edited_in: SOP project, Builder · step_type: Action, Reading, Hold ·
limit_status: Given, Needed, Record only, Not applicable · class:
Critical, Major, Minor · signed_by: Operator, Operator + Supervisor ·
item_status: Available, Soon, Later · tool_type: Tool, Machine ·
vn_owner: Divyal, Hazrat, Raj, Samrat · defect_section_type:
Incoming, Fit-up, Weld, Dimension, Leak test, Paint, Insulation, Final ·
editor: Samrat, Raj, Divyal · role: Editor, Approver, Production Manager,
Supervisor, QC, Lead operator, Helper · wo_status: Released, In progress,
Stopped, Done, Cancelled · run_status: Running, Paused, Finished, Stopped
· pause_reason: No material, Waiting for QC, Machine down, Called away ·
result: OK, NOT OK, RECORDED, LIMIT NEEDED, NUMBER ONLY ·
training_status: Trained, In training, Expired.

An illegal value is refused by the Builder with a red line naming the
field and the allowed values. Nothing is saved.

## 7. Gate 2: the example mapped to the contract

| Example part | Contract items |
|---|---|
| 4 SOP list | sops.sop_id, current_rev, status, edited_in, title; Release = release check (recalculated); Steps = count of steps rows; meta.data_build, builder_build |
| 5 SOP header | sops.*; sop_revisions.hold_points, est_min_total, prepared_by, checked_by, checked_date, approved_by, approved_date |
| 6 Section 9 card | sections.* (needs_note, ends_with, restart_step, max_wait, manpower, est_min, the 7 clean fields) |
| 6 Step list and cards | steps.* ; Target = rule from min, max, unit, limit_status; "Values Needed on this step" = values_needed links; "Defects found" = defects.found_at |
| 7 Edit form | steps.* with the note and example of each field in schema\types.js; history.* (who, at, reason) |
| 8 Section 3, step 3.8 | sections.*, steps.* (hold, class, signed_by, photo_required) |
| 9 Values Needed | values_needed.* |
| 10 Compare | steps.key, step_no, action of two revs; retired_keys.* |
| 11 Floor page, record sheet | steps.*, sections.name, name_gu, needs_note, restart_step; record rows from steps where step_type is Reading or Hold |
| 12 Release check | sop_revisions.checked_date, approved_date, prepared_by; steps floor fields; safety_items.status; steps.photo_ref against the files in source\Photos; validation_log |

Not used on the example yet, and why: glossary, gauges (gauge list in
the edit form), routing, revision_history, worked_examples, ref_tables,
pictures, tools, materials: shown on the SOP page tabs in Builder step 6
(S1 read-only) and on the floor PDF (step 14). sop_revisions.purpose,
scope, process_flow, reference_drawings, how_to_use, setup_rule,
rev_date, revision_note, release_note: the header tab of step 6 and page
1 of the floor PDF. sops.short: new keys (step 8).
sops.output_serial_tracked: Routing and work orders (S5). meta: Settings.
retired_keys: compare (step 12) and new keys (step 8). people,
work_orders, section_runs, run_people, pauses, step_records,
operator_training, validation_log: Floor App, S3 to S6; the shape is
fixed now so store.js is the only change at S3 (spec.md). Fixed sets
wo_status, run_status, pause_reason, result, training_status, role:
floor, S3+.

## 8. Changing this contract

After the Builder works (Builder step 14 passed), any change follows
BUILD_PROTOCOL Part 8 and is asked first. Until then each change is
logged in spec.md's decision log with its reason.


## Changes in 1.1 (2026-11-07, Samrat's yes on items 1, 2 remove, 3, 4)
- sections.source_ref added: text, optional, the box reference in the
  Planner chart file a section came from (AC01). Null for every section
  imported from a master build.
- sections.first_step and sections.last_step removed. The first and last
  step of a section are worked out from its steps each time (stepCount:
  sub-steps such as 9.5.1 not counted). The import no longer reads the
  "First step" and "Last step" columns of Sections_buildN.csv.
- sections.needs_note, ends_with, max_wait, restart_step and manpower are
  optional: a section added on the chart or made from a chart box starts
  with a name only.
- Every table file says contract 1.1; tools/migrate_1_1.py moved the build
  14 files once (2026-11-07) and the fixture was made again from them.

## Changes in 1.2 (2026-11-07, Samrat: notes on the charts, answers 1c 2b 3a 4a 5a 6a)
- New table chart_notes (key: note_id, rev): note_id, sop_id, rev, chart
  (sections | steps), section (steps chart only), pin (box | arrow |
  free), pin_ref (section number or step key; "from>to" for an arrow;
  null when free), x, y (free notes only), text (300 characters at most),
  status (Open | Done), written_by, written_at, closed_by, closed_at.
  Example: 1, BMC-L1-TANK-01, Rev 02, sections, null, box, 9, null, null,
  "Ask Divyal: max repairs?", Open, Samrat, 2026-11-07T06:40:00+05:30.
- New sets: note_chart, note_pin, note_status.
- Notes are not SOP content: they never change a revision's status or
  Edited in, never print, never reach the Floor App, never block release.
  A new revision copies the Open notes with the same note_id.
- tools/migrate_1_2.py moved every table file to 1.2 and wrote an empty
  chart_notes.json.

## Changes in 1.3 (2026-11-12, Samrat: notes stay with their step and can be deleted, answers 1 yes and 2 yes)
- note_status adds Deleted: a deleted note keeps its row (status
  Deleted, closed_by and closed_at as for Done), is never drawn or
  counted, is not copied to a new revision, and its note_id is never used
  again (store.js gives max + 1). History: status Open → Deleted.
- chart_notes.x and y also hold the place of a pinned note: the distance
  from the top-right corner of its box (or from the label point of its
  arrow), chart units, whole numbers, below 0 allowed; empty = the
  automatic place. A free note keeps x and y as its place (0 or more).
  Example: 1, …, box, 9, 40, 90 = 40 right of box 9's right edge, 90
  below its top.
- 1.2 files read as 1.3 (config.js contract_reads); every write says
  1.3; tools/migrate_1_3.py moves the files and meta in one go.

## Changes in 1.4 (2026-11-12, Samrat: process SOPs, "yes" to contract 1.4; spec\example_process_sop.md)
- sops.sop_type (set sop_type: Main, Process), required, after sop_id.
  Main = makes a main part with its own serial (SOP ID
  PRODUCT-LEVEL-NAME-NN). Process = one process used inside main SOPs
  (brazing, a pressure test); it can also run on its own on the floor.
  A Process SOP's sop_id is its code (3 to 20 capitals, digits or
  dashes, example BRAZE-CU), its short the code without dashes
  (BRAZECU, keys BRAZECU-0100), its title a free name (Copper brazing),
  its level Process, output_serial_tracked false.
- set level adds Process.
- steps adds, at the end, four fields, all empty for an ordinary step:
  link_sop (text: the Process SOP the step follows or was copied from),
  link_rev (text: that Process SOP's revision the step matches),
  link_key (text: the step's key in that Process SOP), link_mode (set
  link_mode: Standard = follows the Process SOP, Revised = an own copy).
- Every SOP of 1.3 becomes Main; every step of 1.3 gets the four fields
  empty. 1.3 files read as 1.4 (config.js contract_reads); every write
  says 1.4; tools/migrate_1_4.py moves the files and meta in one go.
- Nothing else changes (notes, History, sections, revisions).

## Changes in 1.5 (2026-11-13, Samrat: save a copy with his own name, answers 1a, 2a, 3 yes; spec\example_copy.md)
- sops adds, at the end, copy_of (text, optional: the SOP ID of the good
  version a copy was saved from) and copy_name (text, optional, 40
  letters at most: the name the editor gave the copy). Both empty for an
  SOP that is not a copy.
- A copy is an SOP of its own (SOP ID: the good version's ID with -COPY1,
  -COPY2, never used twice) with the same short, so the same Keys; its
  revision keeps the label of the revision it was saved from, status
  Draft. A copy is never signed, released, routed or given values, and
  never reaches the Floor App.
- A step row is found by SOP ID, Key and revision: a copy has the same
  Keys as its good version. A new Key counts every Key of the family
  (the good version and its copies), so a Key made in a copy never
  clashes with one made in the good version or another copy. The Floor
  App never sees a copy, so its records still link by Key.
- "Make this the good version" writes the copy as the next revision of
  the good version and removes the copy's rows; the copy's retired Keys
  and the Keys of the good version that are not in the copy are retired
  in the new revision. "Delete this copy" removes the copy's rows and
  retires the Keys made only in the copy. History keeps the copy's rows.
- 1.4 files read as 1.5 (config.js contract_reads; the two fields read as
  empty); every write says 1.5; tools/migrate_1_5.py moves the files and
  meta in one go.

## Changes in 1.6 (2026-11-16, Samrat: "7. yes" to the copy owner field; spec\example_online.md)
- sops adds, at the end, owner (text, optional): the person who saved
  the copy; only this person changes it, makes it the good version or
  deletes it (build 50). Empty for an SOP that is not a copy. A copy
  saved before 1.6 has its owner on its "added: copy" History row, and
  that row still counts when owner is empty.
- The key of steps is sop_id, key, rev and the key of retired_keys is
  sop_id, key: since 1.5 a copy carries the same Keys under its own SOP
  ID (\data on 16 Nov: 82 step rows share Key and revision with their
  good version). No row changes.
- validation_log, in the files since build 36, joins the contract.
- ref_tables.rows holds rows of cells (text or numbers), not a list of
  text: online it is jsonb (types.js: db 'jsonb'). The files do not
  change.
- The tables go online (Supabase, build 51 onwards) under the same names
  with "sop_" in front, the same fields and these keys (spec\
  example_online.md part 4).
- 1.3 to 1.5 files read as 1.6 (config.js contract_reads; owner reads as
  empty); every write says 1.6; tools/migrate_1_6.py moves the files and
  meta in one go and fills owner from the History rows.
