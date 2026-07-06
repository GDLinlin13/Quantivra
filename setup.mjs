import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const SUPABASE_URL = 'https://zxutyxqyvfnadbdabwvf.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXR5eHF5dmZuYWRiZGFid3ZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzMxMjY0MiwiZXhwIjoyMDk4ODg4NjQyfQ.HdEvZ4s8Rvh3gL0SlUEYKqLY1Ke3EvC48K0KsNNMO6U';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXR5eHF5dmZuYWRiZGFid3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMTI2NDIsImV4cCI6MjA5ODg4ODY0Mn0.WydhAOCc_Ti4qHXPosDRdV6JugOVHSQVjKxNwbIGEY0';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function setup() {
  console.log('\n=== AccountingHR - Cloud Setup ===\n');

  // 1. Create .env file
  console.log('[1/5] Creating .env file...');
  const envContent = `VITE_SUPABASE_URL=${SUPABASE_URL}\nVITE_SUPABASE_ANON_KEY=${ANON_KEY}\n`;
  writeFileSync('.env', envContent);
  console.log('  OK\n');

  // 2. Run migration SQL
  console.log('[2/5] Running database migration...');
  const sql = readFileSync('supabase-migration.sql', 'utf-8');
  // Split by semicolons and run each statement
  const statements = sql.split(';').filter(s => s.trim().length > 0 && !s.trim().startsWith('--'));
  for (const stmt of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt.trim() + ';' });
      if (error && !error.message?.includes('already exists') && !error.message?.includes('duplicate')) {
        console.log(`  Warning: ${error.message}`);
      }
    } catch (e) {
      // RPC might not exist, try alternative
    }
  }
  console.log('  Migration attempted\n');

  // 3. Create storage bucket
  console.log('[3/5] Creating storage bucket...');
  const { error: bucketErr } = await supabase.storage.createBucket('company-files', {
    public: true,
  });
  if (bucketErr && !bucketErr.message?.includes('already exists')) {
    console.log(`  Warning: ${bucketErr.message}`);
  } else {
    console.log('  OK\n');
  }

  // 4. Create AEGIS in Auth
  console.log('[4/5] Creating AEGIS admin account in Auth...');
  try {
    const { data: userData, error: authErr } = await supabase.auth.admin.createUser({
      email: 'aegis@master.admin',
      password: '123456',
      email_confirm: true,
    });
    if (authErr) {
      // Try alternative with service key
      const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          email: 'aegis@master.admin',
          password: '123456',
          email_confirm: true,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        if (!text.includes('already')) console.log(`  Auth create: ${text}`);
        else console.log('  AEGIS already exists');
      } else {
        console.log('  OK');
      }
    } else {
      console.log(`  OK - User ID: ${userData.user?.id}`);
    }
  } catch (e) {
    console.log(`  Note: ${e.message}`);
  }

  // 5. Set AEGIS password in users table
  console.log('[5/5] Setting AEGIS user record...');
  const { error: upsertErr } = await supabase.from('users').upsert({
    username: 'AEGIS',
    email: 'aegis@master.admin',
    full_name: 'AEGIS',
    roles: ['superadmin'],
    is_super_admin: 1,
    password_hash: '123456',
    is_active: 1,
  }, { onConflict: 'username' });
  if (upsertErr) console.log(`  Warning: ${upsertErr.message}`);
  else console.log('  OK\n');

  console.log('=== Setup complete! ===');
  console.log('\nLogin credentials:');
  console.log('  AEGIS: username=AEGIS  password=123456');
  console.log('\nNow deploy with:');
  console.log('  npx vercel login   (opens browser - log in once)');
  console.log('  npx vercel --prod  (select options, paste env vars)');
  console.log('\nEnvironment variables for Vercel:');
  console.log(`  VITE_SUPABASE_URL=${SUPABASE_URL}`);
  console.log(`  VITE_SUPABASE_ANON_KEY=${ANON_KEY}`);
}

setup().catch(console.error);
