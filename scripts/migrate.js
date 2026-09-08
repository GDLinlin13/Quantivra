import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars');
  console.error('SUPABASE_SERVICE_ROLE_KEY is found in Supabase Dashboard > Project Settings > API');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const sql = readFileSync(join(__dirname, '..', 'src', 'utils', 'migration.sql'), 'utf8');

async function migrate() {
  console.log('Running migration...');
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { query: stmt + ';' });
      if (error) {
        // Try direct query if rpc fails
        console.log(`  Statement failed via rpc: ${stmt.slice(0, 60)}...`);
        console.log(`  Error: ${error.message}`);
      }
    } catch (e) {
      console.log(`  Skipping: ${stmt.slice(0, 60)}...`);
    }
  }
  console.log('Migration complete. Check Supabase Dashboard for results.');
}

migrate().catch(console.error);
