import { createClient } from '@supabase/supabase-js';

// Only the project URL and the public (anon / publishable) key are ever in the
// bundle. Both are designed to be public; the database is protected by the
// API's authorization and by RLS, not by hiding these.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

if (anonKey && /service_role|sb_secret_/.test(atobSafe(anonKey) + anonKey)) {
  // A service-role/secret key in the browser would bypass all access control.
  throw new Error('VITE_SUPABASE_ANON_KEY holds a secret key. Use the anon/publishable key.');
}

function atobSafe(key) {
  try { return atob(String(key).split('.')[1] || ''); } catch { return ''; }
}

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
    auth: {
      flowType: 'pkce', // email links carry a one-time code, never tokens in the URL fragment
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null;
