import test from 'node:test';
import assert from 'node:assert';
import { authErrorMessage } from '../src/lib/authErrors.js';

const err = (status, code, message) => ({ status, code, message, name: 'AuthApiError' });

test('sign-up shows actionable Supabase reasons', () => {
  assert.match(authErrorMessage(err(400, 'email_address_not_authorized', 'Email address "a@b.c" cannot be used as it is not authorized'), 'signup'), /organisation.*custom SMTP/);
  assert.match(authErrorMessage(err(400, 'email_address_invalid', 'Email address "x@example.com" is invalid'), 'signup'), /rejected this email/);
  assert.strictEqual(authErrorMessage(err(422, 'weak_password', 'Password should contain at least one digit'), 'signup'), 'Password should contain at least one digit');
  assert.match(authErrorMessage(err(422, 'signup_disabled', 'Signups not allowed for this instance'), 'signup'), /turned off/);
  assert.match(authErrorMessage(err(400, 'unexpected_failure', 'Database error saving new user'), 'signup'), /^Sign-up failed: Database error/);
});

test('rate limits are distinguished: email quota vs request throttling', () => {
  assert.match(authErrorMessage(err(429, 'over_email_send_rate_limit', 'email rate limit exceeded'), 'signup'), /email sending limit/);
  assert.match(authErrorMessage(err(429, 'over_request_rate_limit', 'Request rate limit reached'), 'signup'), /Too many attempts/);
});

test('nothing reveals whether an account exists', () => {
  assert.strictEqual(authErrorMessage(err(422, 'user_already_exists', 'User already registered'), 'signup'), null);
  const signin = [err(400, 'invalid_credentials', 'Invalid login credentials'), err(400, 'email_not_confirmed', 'Email not confirmed')].map((e) => authErrorMessage(e, 'signin'));
  assert.strictEqual(new Set(signin).size, 1, 'wrong password and unconfirmed email look identical');
});

test('network failures are reported as such', () => {
  assert.match(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, 'signin'), /could not be reached/);
});
