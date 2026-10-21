-- Minimal stand-in for the Supabase-managed `auth` schema, so migrations and
-- the session check run against real Postgres (PGlite) in tests. Column names
-- match Supabase Auth's tables for every column this application reads.
create schema if not exists auth;
create table if not exists auth.users (
  id                  uuid primary key,
  email               text,
  email_confirmed_at  timestamptz,
  banned_until        timestamptz,
  deleted_at          timestamptz,
  is_anonymous        boolean not null default false
);
create table if not exists auth.sessions (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  not_after   timestamptz,
  created_at  timestamptz not null default now()
);
