/* SOP App contract 1.4: fixed sets (exact spelling, used everywhere).
   Plain-language version: schema/contract.md part 6.
   Classic script in the browser (global SETS); module in Node. */
const SETS = {
  level: ['L0', 'L1', 'L2', 'L3', 'L4', 'Site', 'Process'],
  sop_type: ['Main', 'Process'],
  sop_status: ['Built', 'Listed', 'On hold', 'Retired'],
  rev_status: ['Draft', 'Checked', 'Approved', 'Released', 'Superseded'],
  edited_in: ['SOP project', 'Builder'],
  step_type: ['Action', 'Reading', 'Hold'],
  limit_status: ['Given', 'Needed', 'Record only', 'Not applicable'],
  class: ['Critical', 'Major', 'Minor'],
  signed_by: ['Operator', 'Operator + Supervisor'],
  item_status: ['Available', 'Soon', 'Later'],
  tool_type: ['Tool', 'Machine'],
  vn_owner: ['Divyal', 'Hazrat', 'Raj', 'Samrat'],
  defect_section_type: ['Incoming', 'Fit-up', 'Weld', 'Dimension',
    'Leak test', 'Paint', 'Insulation', 'Final'],
  editor: ['Samrat', 'Raj', 'Divyal'],
  role: ['Editor', 'Approver', 'Production Manager', 'Supervisor', 'QC',
    'Lead operator', 'Helper'],
  wo_status: ['Released', 'In progress', 'Stopped', 'Done', 'Cancelled'],
  run_status: ['Running', 'Paused', 'Finished', 'Stopped'],
  pause_reason: ['No material', 'Waiting for QC', 'Machine down',
    'Called away'],
  result: ['OK', 'NOT OK', 'RECORDED', 'LIMIT NEEDED', 'NUMBER ONLY'],
  training_status: ['Trained', 'In training', 'Expired'],
  note_chart: ['sections', 'steps'],
  note_pin: ['box', 'arrow', 'free'],
  note_status: ['Open', 'Done', 'Deleted'],
  link_mode: ['Standard', 'Revised']
};
if (typeof module !== 'undefined') module.exports = SETS;
