/* SOP Builder configuration: every path, name and setting. Nothing is
   written into code elsewhere. Classic script (global CONFIG). */
const CONFIG = {
  app_name: 'SOP Builder',
  builder_build: 65,           // raise by one on every delivery
  floor_build: 0,              // Floor App, from S3
  contract: '1.6',
  contract_reads: ['1.3', '1.4', '1.5', '1.6'], // an older file reads as 1.6 (the new fields empty) until tools/migrate_1_6.py adds them; every write says 1.6
  data_dir: 'data',            // JSON tables, under the SOP App folder
  photos_dir: 'source/Photos',
  source_dir: 'source', // reference photos named by key
  pictures_dir: 'source/Pictures',
  prompt_dir: 'prompt',        // build 63: the draft prompt's rules file (skill.json), read after the login, never a file of the page
  skill_file: 'prompt/skill.json',
  timezone: 'Asia/Kolkata',
  /* build 52 (spec/example_online.md part 6): the ERP's Supabase project, the same URL and public key as the ERP's web app (its
     .env.production), so the SOP page shares the ERP's login; site = true only on the page at freezigo.github.io/sop (site.js) */
  online: {
    url: 'https://prsdbdxxxllepcdfbtcb.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByc2RiZHh4eGxsZXBjZGZidGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5OTIwNDUsImV4cCI6MjEwNzU2ODA0NX0.iG9Z0gZRFqInlOhZ96eu9JP0GZ9B-iQCNk1CCvqo_cI',
    bucket: 'sop-files',
    max_file_bytes: 20971520,   /* 20 MB a file (the store's file_size_limit); a bigger file stays on the PC (Samrat 2026-11-17 "1. b") */
    site: false,
    erp_url: '../'
  },
  start_sop: 'BMC-L1-TANK-01',
  idb_name: 'sop-builder',     // IndexedDB store for the folder handle
  idb_key: 'root-folder',
  tables: ['meta', 'sops', 'sop_revisions', 'sections', 'steps', 'retired_keys',
    'values_needed', 'glossary', 'gauges', 'defects', 'routing', 'revision_history',
    'safety_items', 'materials', 'tools', 'worked_examples', 'ref_tables', 'pictures',
    'history', 'validation_log', 'chart_notes']   // validation_log: floor table, empty until S3, read by the release check
};
if (typeof module !== 'undefined') module.exports = CONFIG;
