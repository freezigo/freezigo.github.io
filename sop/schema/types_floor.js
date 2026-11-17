/* SOP App contract 1.4: floor tables (machine version of
   schema/contract.md part 5). Shape fixed now; rows come from S3.
   Every floor row carries recorded_at (device clock when made) and
   synced_at (server clock when stored; null while offline).
   Classic script in the browser (global TYPES_FLOOR); module in Node. */
const TYPES_FLOOR = (function () {
  function f(name, type, req, note, example, extra) {
    const d = { name: name, type: type, req: req, note: note, example: example };
    if (extra) { for (const k in extra) { d[k] = extra[k]; } }
    return d;
  }
  const STAMP = [
    f('recorded_at', 'datetime', true, 'Device clock when the row was made.', '2026-11-20T08:20:00+05:30'),
    f('synced_at', 'datetime', false, 'Server clock when stored. Empty while offline.', '2026-11-20T08:21:05+05:30')
  ];
  const tables = {};

  tables.people = { key: ['username'], fields: [
    f('username', 'text', true, 'Lower case, no spaces.', 'ramesh', { pattern: '^[a-z0-9_.]+$' }),
    f('name', 'text', true, 'Name shown on screen.', 'Ramesh'),
    f('roles', 'list_text', true, 'Roles from the role set.', '["Lead operator"]', { set: 'role' }),
    f('active', 'bool', true, 'false when the person has left.', 'true'),
    f('password_hash', 'text', false, 'Set at S3 login. Empty before.', ''),
    f('created_at', 'datetime', true, 'When the row was made.', '2026-11-20T08:00:00+05:30')
  ] };

  tables.work_orders = { key: ['wo_id'], fields: [
    f('wo_id', 'text', true, 'WO-nnnn.', 'WO-0001', { pattern: '^WO-[0-9]{4,}$' }),
    f('sop_id', 'text', true, 'SOP ID.', 'BMC-L1-TANK-01'),
    f('rev', 'text', true, 'Revision locked at release.', 'Rev 02'),
    f('serial', 'text', false, 'Serial given at the incoming check. Empty before.', 'B1K001SST1026'),
    f('product', 'text', true, 'Product.', 'BMC 1000 L'),
    f('status', 'set', true, 'Released, In progress, Stopped, Done, Cancelled.', 'Released', { set: 'wo_status' }),
    f('parent_order', 'text', false, 'Order that splits into serials.', 'PO-2026-011'),
    f('erp_order_id', 'text', false, 'ERPNext order ID. Empty in v1.', ''),
    f('released_by', 'text', true, 'Production Manager username.', 'samrat'),
    f('released_at', 'datetime', true, 'When released.', '2026-11-20T08:00:00+05:30'),
    f('started_at', 'datetime', false, 'First section start.', '2026-11-20T08:30:00+05:30'),
    f('finished_at', 'datetime', false, 'Last section finish.', ''),
    f('current_section', 'int', false, 'Section the serial is in.', '9'),
    f('consumed_serials', 'list_text', false, 'Serials or lots picked for this unit.', '["Lot LC2-0007"]'),
    f('note', 'text', false, 'Note.', '')
  ].concat(STAMP) };

  tables.section_runs = { key: ['run_id'], fields: [
    f('run_id', 'text', true, 'Device id + running number.', 'P01-000123'),
    f('wo_id', 'text', true, 'Work order.', 'WO-0001'),
    f('section', 'int', true, 'Section number.', '9'),
    f('attempt', 'int', true, '1 the first time; 2 after a restart or a repeat test.', '1'),
    f('lead', 'text', true, 'Lead operator username.', 'ramesh'),
    f('status', 'set', true, 'Running, Paused, Finished, Stopped.', 'Running', { set: 'run_status' }),
    f('started_at', 'datetime', true, 'Start tap.', '2026-11-20T14:00:00+05:30'),
    f('finished_at', 'datetime', false, 'Finish tap.', ''),
    f('restart_step', 'text', false, 'Step the run started from after a stop.', '9.1'),
    f('setup_from_wo', 'text', false, 'Work order whose machine set-up was used when section 4 is skipped.', 'WO-0001')
  ].concat(STAMP) };

  tables.run_people = { key: ['run_id', 'username', 'joined_at'], fields: [
    f('run_id', 'text', true, 'Section run.', 'P01-000123'),
    f('username', 'text', true, 'Helper or lead.', 'suresh'),
    f('joined_at', 'datetime', true, 'Join time. Default = section start.', '2026-11-20T14:00:00+05:30'),
    f('left_at', 'datetime', false, 'Leave time. Default = section finish.', '')
  ].concat(STAMP) };

  tables.pauses = { key: ['pause_id'], fields: [
    f('pause_id', 'text', true, 'Device id + running number.', 'P01-000124'),
    f('run_id', 'text', true, 'Section run.', 'P01-000123'),
    f('reason', 'set', true, 'No material, Waiting for QC, Machine down, Called away.', 'Waiting for QC', { set: 'pause_reason' }),
    f('paused_at', 'datetime', true, 'Pause tap.', '2026-11-20T14:20:00+05:30'),
    f('resumed_at', 'datetime', false, 'Resume tap.', ''),
    f('by', 'text', true, 'Who paused.', 'ramesh')
  ].concat(STAMP) };

  tables.step_records = { key: ['rec_id'], fields: [
    f('rec_id', 'text', true, 'Device id + running number.', 'P01-000125'),
    f('wo_id', 'text', true, 'Work order.', 'WO-0001'),
    f('run_id', 'text', true, 'Section run.', 'P01-000123'),
    f('key', 'text', true, 'Step key.', 'TANK01-2420'),
    f('section', 'int', true, 'Section number.', '9'),
    f('reading', 'number', false, 'Number read. Empty on an Action step.', '1288'),
    f('result', 'set', false, 'Worked out from the reading and the limits when the row was made.', 'OK', { set: 'result' }),
    f('done', 'bool', false, 'true when ticked. Empty on a Reading step.', 'true'),
    f('defect_code', 'text', false, 'Defect code when NOT OK.', 'LEAK-DYE'),
    f('operator', 'text', true, 'Lead operator username.', 'ramesh'),
    f('operator_at', 'datetime', true, 'Tick time; on a hold, when the hold started.', '2026-11-20T14:35:00+05:30'),
    f('supervisor', 'text', false, 'Supervisor or QC username on a hold.', 'divyal'),
    f('supervisor_at', 'datetime', false, 'When the hold result was signed.', ''),
    f('attempt', 'int', true, '1, then 2 for a repeat after a repair.', '1'),
    f('remark', 'text', false, 'Remark.', 'Pink spot on W3, back left.'),
    f('photo_file', 'text', false, 'Photo taken at the step.', 'WO-0001-TANK01-2350.jpg')
  ].concat(STAMP) };

  tables.operator_training = { key: ['username', 'sop_id'], fields: [
    f('username', 'text', true, 'Operator.', 'ramesh'),
    f('sop_id', 'text', true, 'SOP ID.', 'BMC-L1-TANK-01'),
    f('role', 'text', true, 'Role trained for.', 'Welder'),
    f('trained_by', 'text', true, 'Trainer.', 'Divyal'),
    f('date_trained', 'date', true, 'Date.', '2026-11-20'),
    f('status', 'set', true, 'Trained, In training, Expired.', 'Trained', { set: 'training_status' }),
    f('note', 'text', false, 'Note.', 'Did one tank with Divyal watching.')
  ] };

  tables.validation_log = { key: ['val_id'], fields: [
    f('val_id', 'int', true, 'Running number.', '1'),
    f('sop_id', 'text', true, 'SOP ID.', 'BMC-L1-TANK-01'),
    f('rev', 'text', true, 'Revision walked.', 'Rev 02'),
    f('date', 'date', true, 'Date.', '2026-11-20'),
    f('walked_by', 'text', true, 'Operator who ran the SOP.', 'Ramesh'),
    f('watched_by', 'text', true, 'Who watched.', 'Divyal'),
    f('questions_asked', 'int', true, 'Questions asked. 0 twice in a row = trial passed.', '0'),
    f('defects_found', 'text', false, 'Defects in the SOP found.', ''),
    f('fixed_in_rev', 'text', false, 'Revision that fixed them.', '')
  ] };

  return { version: '1.4', tables: tables };
})();
if (typeof module !== 'undefined') module.exports = TYPES_FLOOR;
