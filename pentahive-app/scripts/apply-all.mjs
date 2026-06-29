// Apply every migration in supabase/migrations in filename order, in one connection.
// Stops on the first error so we can see exactly what failed.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import sql from '../db.js';

const dir = resolve('supabase/migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

console.log(`Applying ${files.length} migrations to the database…\n`);
let ok = 0;
try {
  for (const f of files) {
    const ddl = readFileSync(join(dir, f), 'utf8');
    process.stdout.write(`→ ${f} … `);
    await sql.unsafe(ddl);
    console.log('OK');
    ok++;
  }
  console.log(`\nDONE: ${ok}/${files.length} migrations applied.`);
} catch (err) {
  console.log('FAILED');
  console.error(`\nMigration failed: ${err.message}`);
  if (err.detail) console.error(`detail: ${err.detail}`);
  if (err.hint) console.error(`hint: ${err.hint}`);
  console.error(`(${ok} migrations applied before the failure)`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
