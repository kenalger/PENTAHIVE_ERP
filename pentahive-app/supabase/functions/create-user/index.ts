// Supabase Edge Functions run on Deno, not Node — note the import style.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Hardcoded admin allowlist. Keep in sync with environment.adminEmails in Angular.
const ADMIN_EMAILS = [
  'admin@gmail.com',
  'kadimaymay.mhi@gmail.com',
];

// Generate a reasonably strong temp password.
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  // CORS preflight — Angular dev server is on a different origin from the function.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Verify the caller's JWT.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 401, headers: cors });
    }
    const token = authHeader.slice('Bearer '.length);

    const verifier = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: userData, error: userErr } = await verifier.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: cors });
    }

    // 2. Authorization: caller must be in the admin allowlist.
    const callerEmail = userData.user.email?.toLowerCase();
    if (!callerEmail || !ADMIN_EMAILS.map(e => e.toLowerCase()).includes(callerEmail)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }

    // 3. Parse and validate input.
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: cors });
    }

    // 4. Create the user with a temp password and the must_change_password flag.
    //    The service_role client has admin privileges — keep it confined to this function.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const tempPassword = generateTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: cors });
    }

    return new Response(
      JSON.stringify({ email: created.user.email, tempPassword }),
      { status: 200, headers: cors },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: cors },
    );
  }
});
