import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

// prepare: false is required for Supabase's transaction pooler (port 6543).
// Without it, prepared statements break across pooled connections.
const sql = postgres(connectionString, { prepare: false });

export default sql;
