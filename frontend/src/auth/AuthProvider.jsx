import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createApiClient } from '../lib/api';
import { navigate } from '../lib/router';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') { setRecovery(true); navigate('/reset-password', { replace: true }); }
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, []);

  const signOut = useCallback(async ({ everywhere = false, reason = null } = {}) => {
    // Deletes the session server-side (or all of the user's sessions); the API's
    // session check then rejects any copy of the old access token.
    await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' }).catch(() => supabase.auth.signOut({ scope: 'local' }));
    setNotice(reason);
    navigate('/login', { replace: true });
  }, []);

  const api = useMemo(() => createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE || '',
    getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token || null,
    refreshSession: async () => (await supabase.auth.refreshSession()).data.session?.access_token || null,
    onUnauthenticated: (code) => {
      const reason = code === 'session_revoked' ? 'Your session ended. Sign in again.' : 'Your session expired. Sign in again.';
      supabase.auth.signOut({ scope: 'local' }).finally(() => { setNotice(reason); navigate('/login', { replace: true }); });
    },
  }), []);

  const value = useMemo(() => ({
    session, user: session?.user || null, loading, recovery, setRecovery, notice, setNotice, signOut, api,
  }), [session, loading, recovery, notice, signOut, api]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
