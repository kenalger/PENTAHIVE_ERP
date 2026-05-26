import sql from '../db.js';

console.log('auth.users:');
console.table(await sql`
  select id, email, role, email_confirmed_at is not null as email_confirmed
  from auth.users where email = 'admin@gmail.com'
`);

console.log('auth.identities:');
console.table(await sql`
  select provider, identity_data->>'email' as email
  from auth.identities
  where user_id = (select id from auth.users where email = 'admin@gmail.com')
`);

console.log('public.users:');
console.table(await sql`
  select id, email, full_name, is_admin, must_change_password
  from public.users where email = 'admin@gmail.com'
`);

console.log('Password verify (should return true):');
console.table(await sql`
  select (encrypted_password = extensions.crypt('123456', encrypted_password)) as ok
  from auth.users where email = 'admin@gmail.com'
`);

await sql.end({ timeout: 5 });
