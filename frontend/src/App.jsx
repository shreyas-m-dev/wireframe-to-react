import React, { useEffect } from 'react';
import { supabaseConfigured } from './lib/supabase';
import { navigate, useRoute } from './lib/router';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { AuthCallback, ForgotPassword, ResendConfirmationPage, ResetPassword, SignIn, SignUp } from './auth/AuthScreens';
import Workspace from './workspace/Workspace';
import { Alert, Button, Spinner } from './ui';

function FullPage({ children }) {
  return <main className="min-h-dvh grid place-items-center px-4">{children}</main>;
}

function NotConfigured() {
  return (
    <FullPage>
      <div className="max-w-lg tile p-6">
        <h1 className="text-title mb-2">Sign-in is not configured</h1>
        <Alert tone="warning">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in the repository's <code>.env</code>, then restart the dev server.
          See docs/ENVIRONMENT_VARIABLES.md.
        </Alert>
      </div>
    </FullPage>
  );
}

const PUBLIC_ROUTES = new Set(['login', 'signup', 'forgot', 'callback', 'resend']);

function Routes() {
  const route = useRoute();
  const { session, loading, recovery } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (route.name === 'root') navigate(session ? '/app' : '/login', { replace: true });
    else if (route.name === 'workspace' && !session) navigate('/login', { replace: true });
    else if (session && !recovery && (route.name === 'login' || route.name === 'signup' || route.name === 'forgot')) navigate('/app', { replace: true });
  }, [route.name, session, loading, recovery]);

  if (loading && !PUBLIC_ROUTES.has(route.name)) return <FullPage><Spinner label="Loading…" /></FullPage>;

  switch (route.name) {
    case 'login': return <SignIn />;
    case 'signup': return <SignUp />;
    case 'forgot': return <ForgotPassword />;
    case 'resend': return <ResendConfirmationPage />;
    case 'reset': return <ResetPassword />;
    case 'callback': return <AuthCallback />;
    case 'workspace': return session ? <Workspace params={route.params} /> : null;
    case 'root': return null;
    default:
      return (
        <FullPage>
          <div className="text-center">
            <h1 className="text-display mb-2">Page not found</h1>
            <Button variant="primary" onClick={() => navigate('/app')}>Go to workspace</Button>
          </div>
        </FullPage>
      );
  }
}

export default function App() {
  if (!supabaseConfigured) return <NotConfigured />;
  return <AuthProvider><Routes /></AuthProvider>;
}
