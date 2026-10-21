-- 0001: application schema (projects, jobs, results, artifacts).
--
-- Tables live in the `app` schema, which Supabase does not expose through its
-- Data API (only `public` is exposed by default). The Express API is the only
-- data path; RLS is enabled with no policies as defence in depth, so even if
-- the schema were exposed, the anon/authenticated roles would see nothing.
-- Identity is owned by Supabase Auth: owner_id references auth.users(id).

create schema if not exists app;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table app.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- target for composite foreign keys that pin child rows to the same owner
  unique (id, owner_id)
);
create index projects_owner_updated_idx on app.projects (owner_id, updated_at desc, id desc);
create trigger projects_touch before update on app.projects
  for each row execute function app.touch_updated_at();

create table app.jobs (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null,
  owner_id         uuid not null references auth.users (id) on delete cascade,
  parent_job_id    uuid references app.jobs (id) on delete set null,
  status           text not null default 'queued'
                   check (status in ('queued', 'running', 'complete', 'low_fidelity', 'failed', 'cancelled')),
  stage            text not null default 'queued'
                   check (stage in ('queued', 'preprocess', 'detect', 'schema', 'generate', 'validate', 'done')),
  instructions     text not null default '' check (char_length(instructions) <= 1500),
  source_filename  text not null check (char_length(source_filename) between 1 and 255),
  source_mime      text not null check (source_mime in ('image/png', 'image/jpeg', 'image/webp', 'image/bmp')),
  source_bytes     integer not null check (source_bytes > 0),
  source_sha256    text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_path      text,
  gen_mode         text,
  schema_source    text,
  error_code       text,
  error_message    text check (char_length(error_message) <= 500),
  idempotency_key  text check (char_length(idempotency_key) between 1 and 128),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  unique (id, owner_id),
  unique (owner_id, idempotency_key),
  foreign key (project_id, owner_id) references app.projects (id, owner_id) on delete cascade
);
create index jobs_project_created_idx on app.jobs (project_id, created_at desc, id desc);
create index jobs_owner_created_idx on app.jobs (owner_id, created_at desc);
create index jobs_active_idx on app.jobs (owner_id) where status in ('queued', 'running');
create trigger jobs_touch before update on app.jobs
  for each row execute function app.touch_updated_at();

create table app.job_results (
  job_id                   uuid primary key,
  owner_id                 uuid not null,
  detections               jsonb not null default '[]'::jsonb,
  detection_meta           jsonb not null default '{}'::jsonb,
  schema                   jsonb,
  validation               jsonb,
  templates                jsonb not null default '[]'::jsonb,
  recognized_instructions  jsonb not null default '[]'::jsonb,
  created_at               timestamptz not null default now(),
  foreign key (job_id, owner_id) references app.jobs (id, owner_id) on delete cascade
);

create table app.artifacts (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null,
  owner_id     uuid not null,
  kind         text not null check (kind in ('jsx', 'preview-js')),
  content      text not null,
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length  integer not null check (byte_length >= 0),
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (job_id, kind),
  foreign key (job_id, owner_id) references app.jobs (id, owner_id) on delete cascade
);
create index artifacts_owner_idx on app.artifacts (owner_id);

alter table app.projects    enable row level security;
alter table app.jobs        enable row level security;
alter table app.job_results enable row level security;
alter table app.artifacts   enable row level security;

-- Supabase's API roles must not reach this schema at all.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app from anon, authenticated';
    execute 'revoke all on all tables in schema app from anon, authenticated';
    execute 'alter default privileges in schema app revoke all on tables from anon, authenticated';
  end if;
end;
$$;
