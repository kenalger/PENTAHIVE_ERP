import sql from '../db.js';

const ext = await sql`
  select e.extname, n.nspname as schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto'
`;
console.table(ext);

const existing = await sql`select id, email from auth.users where email = 'admin@gmail.com'`;
console.log('Existing admin@gmail.com rows:', existing.length);
console.table(existing);

await sql.end({ timeout: 5 });
