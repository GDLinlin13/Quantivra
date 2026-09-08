/**
 * Database Migration Runner
 * 
 * Usage (pick one):
 * 
 * 1. Via Supabase CLI (recommended):
 *    npx supabase login
 *    npx supabase db push
 * 
 * 2. Via Supabase Dashboard:
 *    Open https://supabase.com/dashboard/project/zxutyxqyvfnadbdabwvf/sql/new
 *    Paste contents of src/utils/migration.sql
 *    Click "Run"
 * 
 * 3. Via Supabase Management API (requires access token):
 *    $env:SUPABASE_ACCESS_TOKEN="sbp_..." 
 *    npx supabase db execute --file src/utils/migration.sql
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'src', 'utils', 'migration.sql');
const sql = readFileSync(sqlPath, 'utf8');
const lineCount = sql.split('\n').length;
const stmtCount = sql.split(';').filter(s => s.trim().length > 0 && !s.trim().startsWith('--')).length;

console.log(`Migration file: src/utils/migration.sql`);
console.log(`Total lines: ${lineCount}`);
console.log(`Statements: ${stmtCount}`);
console.log(`\nTables to create:`);
const tables = [...sql.matchAll(/CREATE TABLE (\w+)/g)].map(m => m[1]);
tables.forEach(t => console.log(`  - ${t}`));
console.log(`\n--- How to run ---`);
console.log(`1. Open: https://supabase.com/dashboard/project/zxutyxqyvfnadbdabwvf/sql/new`);
console.log(`2. Copy ALL content from src/utils/migration.sql`);
console.log(`3. Paste into SQL Editor and click "Run"\n`);
