// Copy this file to environment.ts (production: false) and environment.prod.ts
// (production: true), then fill in your Supabase project's values from
// Project Settings > API. Both real files are gitignored since they hold
// your project's credentials.
export const environment = {
  production: false,
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'
};
