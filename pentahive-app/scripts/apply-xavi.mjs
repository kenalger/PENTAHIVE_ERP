// Stage 3: apply the xavi_-prefixed xavi migrations onto the shared project
// (iblrotkczdrztenchnzx) using this project's DATABASE_URL. Runs the ENTIRE set
// inside ONE transaction: any error rolls everything back, so a failed run leaves
// WVW + the shared roles table exactly as they were (no partial xavi schema).
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
const XAVI = 'C:/Users/Ken/Documents/My Projects/xavi/supabase/migrations';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let sql = null;
for (let i = 1; i <= 12; i++) {
  const c = postgres(url, { prepare: false, connect_timeout: 15, idle_timeout: 0, max: 1 });
  try { await c`select 1`; sql = c; console.log(`Connected on attempt ${i}.`); break; }
  catch (e) { await c.end({ timeout: 5 }).catch(() => {}); console.log(`attempt ${i}: ${e.message}`); if (i < 12) await sleep(8000); }
}
if (!sql) { console.error('Could not connect.'); process.exit(1); }

const files = readdirSync(XAVI).filter((f) => f.endsWith('.sql')).sort();
console.log(`\nApplying ${files.length} xavi migrations in ONE transaction…\n`);
try {
  await sql.begin(async (tx) => {
    for (const f of files) {
      process.stdout.write(`→ ${f} … `);
      await tx.unsafe(readFileSync(join(XAVI, f), 'utf8'));
      console.log('OK');
    }
  });
  console.log(`\nDONE: all ${files.length} migrations committed.`);
} catch (err) {
  console.log('FAILED — transaction rolled back, DB unchanged.');
  console.error(`\nError: ${err.message}`);
  if (err.detail) console.error(`detail: ${err.detail}`);
  if (err.hint) console.error(`hint: ${err.hint}`);
  if (err.where) console.error(`where: ${err.where}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
