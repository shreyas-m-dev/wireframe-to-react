/**
 * Maps Supabase Auth errors to messages for the auth screens.
 *
 * Rule: be specific when the reason is actionable and reveals nothing about
 * whether an account exists (rate limits, email delivery, password policy,
 * project settings); stay generic where specifics would enable account
 * enumeration (sign-in failures, "already registered", reset requests).
 */

const SIGNUP_ALREADY_EXISTS = new Set(['user_already_exists', 'email_exists']);

export function authErrorMessage(error, context) {
  const status = error?.status;
  const code = error?.code || '';
  const message = String(error?.message || '');

  if (error?.name === 'AuthRetryableFetchError' || status === 0 || (status >= 500 && status < 600)) {
    return 'The sign-in service could not be reached. Check your connection and try again.';
  }
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(message)) {
    return "Supabase's email sending limit was reached (its built-in email service only sends a few emails per hour). Wait a while, or set up custom SMTP in Supabase under Authentication → Emails.";
  }
  if (status === 429 || code === 'over_request_rate_limit' || /rate limit/i.test(message)) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }

  if (context === 'signin') {
    return 'That email and password combination did not work. If you just signed up, confirm your email first.';
  }
  if (context === 'reset') {
    if (code === 'weak_password' || /password/i.test(message)) return message || 'That password does not meet the requirements.';
    return 'The password could not be updated. Open the newest reset link and try again.';
  }
  if (context === 'signup') {
    if (code === 'email_address_not_authorized' || /not authorized/i.test(message)) {
      return "Supabase's built-in email service only sends to members of your Supabase organisation. Sign up with an address from your Supabase team, or set up custom SMTP in Supabase under Authentication → Emails.";
    }
    if (code === 'email_address_invalid' || /invalid.*email|email.*invalid|validate email/i.test(message)) {
      return 'Supabase rejected this email address. Use a real address you can receive mail at.';
    }
    if (code === 'weak_password' || /password/i.test(message)) return message || 'That password does not meet the requirements.';
    if (code === 'signup_disabled' || /signups? not allowed|signup.*disabled/i.test(message)) {
      return 'New sign-ups are turned off for this Supabase project (Authentication → Sign In / Providers).';
    }
    if (SIGNUP_ALREADY_EXISTS.has(code)) return null; // caller shows the same "check your email" screen
    return message ? `Sign-up failed: ${message}` : 'Sign-up failed. Try again.';
  }
  return 'Something went wrong. Try again.';
}
