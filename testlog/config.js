// Test Log inside the Freezigo ERP (Data Log > Tests, ERP web w117). Data in the ERP's database through the edge function
// `testlog`; sign-in with the ERP login (same Supabase project and public key as the ERP app and the SOP page).
window.TESTLOG_CONFIG = {
  api: 'https://prsdbdxxxllepcdfbtcb.supabase.co/functions/v1/testlog',
  supabaseUrl: 'https://prsdbdxxxllepcdfbtcb.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByc2RiZHh4eGxsZXBjZGZidGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5OTIwNDUsImV4cCI6MjEwNzU2ODA0NX0.iG9Z0gZRFqInlOhZ96eu9JP0GZ9B-iQCNk1CCvqo_cI',
  erpUrl: '../'
};
