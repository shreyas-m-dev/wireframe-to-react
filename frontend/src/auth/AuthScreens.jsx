import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { navigate } from '../lib/router';
import { authErrorMessage } from '../lib/authErrors';
import { useAuth } from './AuthProvider';
import { Alert, Button, Field, Spinner, TextInput } from '../ui';

const MIN_PASSWORD = 8;
const origin = () => window.location.origin;

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 text-center">
          <p className="eyebrow">Wireframe → React</p>
          <h1 className="text-display text-text mt-1">{title}</h1>
          {subtitle && <p className="text-text-muted mt-2">{subtitle}</p>}
        </div>
        <div className="tile rounded-xl p-6">{children}</div>
        {footer && <div className="mt-4 text-center text-text-muted">{footer}</div>}
      </div>
    </main>
  );
}

function Link({ to, children }) {
  return <a href={to} onClick={(event) => { event.preventDefault(); navigate(to); }} className="text-accent underline-offset-4 hover:underline">{children}</a>;
}

function useFormState() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e?.message || 'Something went wrong.'); } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

export function SignIn() {
  const { notice, setNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const form = useFormState();
  const submit = (event) => {
    event.preventDefault();
    setNotice(null);
    form.run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(authErrorMessage(error, 'signin'));
      navigate('/app', { replace: true });
    });
  };
  return (
    <AuthLayout title="Sign in" subtitle="Turn wireframes into working React." footer={<>New here? <Link to="/signup">Create an account</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {notice && <Alert tone="info">{notice}</Alert>}
        {form.error && <Alert tone="danger">{form.error}</Alert>}
        <Field label="Email"><TextInput type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><TextInput type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" variant="primary" loading={form.busy} disabled={!email || !password}>Sign in</Button>
        <p className="text-center"><Link to="/forgot-password">Forgot your password?</Link></p>
        <p className="text-center"><Link to="/resend-confirmation">Didn't get your confirmation email?</Link></p>
      </form>
    </AuthLayout>
  );
}

export function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState(false);
  const form = useFormState();
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;
  const submit = (event) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD || mismatch) return;
    form.run(async () => {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${origin()}/auth/callback` } });
      if (error) {
        const reason = authErrorMessage(error, 'signup');
        if (reason) throw new Error(reason); // null: already registered — show the same screen as success
      }
      setSent(true); // same outcome whether or not the address was already registered
    });
  };
  if (sent) {
    return (
      <AuthLayout title="Check your email" footer={<Link to="/login">Back to sign in</Link>}>
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="Confirm your address">If {email} can be registered, we sent a confirmation link to it. Open it on this device to finish signing up. It can take a few minutes, so check Spam and Promotions too.</Alert>
          <ResendConfirmation initialEmail={email} startCoolingDown />
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Create your account" footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {form.error && <Alert tone="danger">{form.error}</Alert>}
        <Field label="Email"><TextInput type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" hint={`At least ${MIN_PASSWORD} characters.`} error={tooShort ? `Use at least ${MIN_PASSWORD} characters.` : null}>
          <TextInput type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" error={mismatch ? 'Passwords do not match.' : null}>
          <TextInput type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" loading={form.busy} disabled={!email || password.length < MIN_PASSWORD || confirm !== password}>Create account</Button>
      </form>
    </AuthLayout>
  );
}

const RESEND_COOLDOWN_SECONDS = 60; // Supabase allows one confirmation email per address per minute

/** Re-sends the sign-up confirmation link. Same message whether or not the address exists. */
function ResendConfirmation({ initialEmail = '', startCoolingDown = false }) {
  const [email, setEmail] = useState(initialEmail);
  const [wait, setWait] = useState(startCoolingDown ? RESEND_COOLDOWN_SECONDS : 0);
  const [done, setDone] = useState(false);
  const form = useFormState();
  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  const submit = (event) => {
    event.preventDefault();
    form.run(async () => {
      setDone(false);
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${origin()}/auth/callback` } });
      setWait(RESEND_COOLDOWN_SECONDS);
      if (error && (error.status === 429 || error.status >= 500 || error.status === 0)) throw new Error(authErrorMessage(error, 'signup'));
      setDone(true); // other errors (e.g. unknown or already-confirmed address) look like success on purpose
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {form.error && <Alert tone="danger">{form.error}</Alert>}
      {done && <Alert tone="success">If that address is waiting for confirmation, a new link is on its way.</Alert>}
      {!initialEmail && <Field label="Email"><TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
      <Button type="submit" variant="secondary" loading={form.busy} disabled={!email || wait > 0}>
        {wait > 0 ? `Resend confirmation email (${wait}s)` : 'Resend confirmation email'}
      </Button>
    </form>
  );
}

export function ResendConfirmationPage() {
  return (
    <AuthLayout title="Resend confirmation" subtitle="Didn't get the email? We'll send a new link." footer={<Link to="/login">Back to sign in</Link>}>
      <ResendConfirmation />
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const form = useFormState();
  const submit = (event) => {
    event.preventDefault();
    form.run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin()}/reset-password` });
      if (error && (error.status === 429 || /rate limit/i.test(error.message))) throw new Error(authErrorMessage(error, 'forgot'));
      setSent(true); // never reveal whether the address has an account
    });
  };
  return (
    <AuthLayout title="Reset your password" footer={<Link to="/login">Back to sign in</Link>}>
      {sent ? (
        <Alert tone="success" title="Check your email">If an account exists for {email}, a reset link is on its way. It works once and expires.</Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {form.error && <Alert tone="danger">{form.error}</Alert>}
          <Field label="Email"><TextInput type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" variant="primary" loading={form.busy} disabled={!email}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPassword() {
  const { session, setRecovery, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const form = useFormState();
  if (loading) return <AuthLayout title="Reset your password"><Spinner label="Checking your reset link…" /></AuthLayout>;
  if (!session) {
    return (
      <AuthLayout title="Link expired" footer={<Link to="/forgot-password">Request a new link</Link>}>
        <Alert tone="warning">This reset link is invalid or has expired. Request a new one.</Alert>
      </AuthLayout>
    );
  }
  const submit = (event) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD || password !== confirm) return;
    form.run(async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(authErrorMessage(error, 'reset'));
      // Other devices keep their sessions until signed out; end them all now.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => {});
      setRecovery(false);
      setDone(true);
    });
  };
  return (
    <AuthLayout title="Choose a new password">
      {done ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="Password updated">Other signed-in devices have been signed out.</Alert>
          <Button variant="primary" onClick={() => navigate('/app', { replace: true })}>Continue to workspace</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {form.error && <Alert tone="danger">{form.error}</Alert>}
          <Field label="New password" hint={`At least ${MIN_PASSWORD} characters.`}><TextInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Confirm new password" error={confirm && confirm !== password ? 'Passwords do not match.' : null}><TextInput type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Button type="submit" variant="primary" loading={form.busy} disabled={password.length < MIN_PASSWORD || password !== confirm}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}

/** Landing page for the email-confirmation link (PKCE code exchange happens in supabase-js). */
export function AuthCallback() {
  const { session, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTimedOut(true), 8000); return () => clearTimeout(t); }, []);
  useEffect(() => { if (session) navigate('/app', { replace: true }); }, [session]);
  const failed = new URLSearchParams(window.location.search).get('error_description');
  if (failed || (timedOut && !session && !loading)) {
    return (
      <AuthLayout title="Confirmation failed" footer={<Link to="/login">Back to sign in</Link>}>
        <Alert tone="warning">This confirmation link is invalid or has expired. Sign in to request a new one.</Alert>
      </AuthLayout>
    );
  }
  return <AuthLayout title="Confirming your email"><Spinner label="Finishing sign-in…" /></AuthLayout>;
}
