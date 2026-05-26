import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sql from '../db.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: node --env-file=.env scripts/apply-migration.mjs <path-to-sql>');
  process.exit(1);
}

const path = resolve(file);
const ddl = readFileSync(path, 'utf8');

console.log(`Applying ${path}…`);
try {
  await sql.unsafe(ddl);
  console.log('OK');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
