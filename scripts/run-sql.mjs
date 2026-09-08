// Run a .sql file against the Supabase project via the Management API.
// Usage: node scripts/run-sql.mjs <path-to-sql>
import { readFileSync } from 'fs';

const REF = 'zxutyxqyvfnadbdabwvf';
const TOKEN = readFileSync(new URL('./.sbtoken', import.meta.url), 'utf8').trim();
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/run-sql.mjs <file.sql>'); process.exit(1); }
const query = readFileSync(file, 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const text = await res.text();
console.log('HTTP', res.status);
console.log(text.slice(0, 4000));
process.exit(res.ok ? 0 : 1);
