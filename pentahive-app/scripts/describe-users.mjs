import sql from '../db.js';

const cols = await sql`
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'users'
  order by ordinal_position
`;

const policies = await sql`
  select policyname, cmd
  from pg_policies
  where schemaname = 'public' and tablename = 'users'
  order by policyname
`;

const triggers = await sql`
  select trigger_name, event_manipulation, event_object_schema, event_object_table
  from information_schema.triggers
  where (event_object_schema = 'public' and event_object_table = 'users')
     or (event_object_schema = 'auth' and event_object_table = 'users')
  order by event_object_schema, event_object_table, trigger_name
`;

console.log('Columns:');
console.table(cols);
console.log('Policies:');
console.table(policies);
console.log('Triggers:');
console.table(triggers);

await sql.end({ timeout: 5 });
