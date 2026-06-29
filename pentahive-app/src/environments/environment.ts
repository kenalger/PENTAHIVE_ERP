export const environment = {
  production: true,
  supabaseUrl: 'https://iblrotkczdrztenchnzx.supabase.co',
  // TODO: paste the anon / public key from Supabase Dashboard → Project Settings → API
  supabaseAnonKey: 'sb_publishable_ZBch-XW4yEiY9QTkDb2Izw_MA9dFmrd',
  // Hardcoded admin allowlist (UI gating only — Edge Function enforces the real check)
  adminEmails: ['admin@gmail.com', 'kadimaymay.mhi@gmail.com'],
};
