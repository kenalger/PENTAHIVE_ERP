export const environment = {
  production: true,
  supabaseUrl: 'https://zpfkhcnxtiyojodtmepn.supabase.co',
  // TODO: paste the anon / public key from Supabase Dashboard → Project Settings → API
  supabaseAnonKey: 'sb_publishable_FKhwPeG8xwHLfHymcKYKtg_j8VQot1U',
  // Hardcoded admin allowlist (UI gating only — Edge Function enforces the real check)
  adminEmails: ['admin@gmail.com', 'kadimaymay.mhi@gmail.com'],
};
