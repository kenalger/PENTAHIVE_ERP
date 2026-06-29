// Connect to the pooler with retries (handles the ~1-2 min Supavisor delay after a
// password reset), then apply every migration in filename order on that connection.
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX = 15;        // attempts
const GAP = 8000;      // ms between attempts (~ up to 2 min total)

let sql = null;
for (let i = 1; i <= MAX; i++) {
  const c = postgres(url, { prepare: false, connect_timeout: 15 });
  try {
    await c`select 1`;
    sql = c;
    console.log(`Connected on attempt ${i}.`);
    break;
  } catch (e) {
    await c.end({ timeout: 5 }).catch(() => {});
    const msg = e.message || String(e);
    console.log(`attempt ${i}/${MAX}: ${msg}`);
    if (!/password authentication failed|Tenant or user not found|ECONNREFUSED|timeout/i.test(msg)) {
      // unexpected error — stop early
      console.error('Non-retryable error, aborting.');
      process.exit(1);
    }
    if (i < MAX) await sleep(GAP);
  }
}

if (!sql) {
  console.error('\nStill could not authenticate after retries. The pooler has not picked up the new password yet, or it differs from what was entered.');
  process.exit(1);
}

const dir = resolve('supabase/migrations');
let files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
// Optional: only apply migrations whose filename is >= the given start arg (inclusive).
const startFrom = process.argv[2];
if (startFrom) files = files.filter((f) => f >= startFrom);
console.log(`\nApplying ${files.length} migrations${startFrom ? ` (from ${startFrom})` : ''}…\n`);
let ok = 0;
try {
  for (const f of files) {
    process.stdout.write(`→ ${f} … `);
    await sql.unsafe(readFileSync(join(dir, f), 'utf8'));
    console.log('OK');
    ok++;
  }
  console.log(`\nDONE: ${ok}/${files.length} migrations applied.`);
} catch (err) {
  console.log('FAILED');
  console.error(`\nMigration failed in the migration above: ${err.message}`);
  if (err.detail) console.error(`detail: ${err.detail}`);
  if (err.hint) console.error(`hint: ${err.hint}`);
  console.error(`(${ok} migrations applied before the failure)`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
