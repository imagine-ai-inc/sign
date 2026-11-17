-- Imagine Sign: initial schema
-- Everything lives in the `sign` schema, which is NOT exposed through PostgREST.
-- The app talks to Postgres directly from the server (Supavisor pooler) and never
-- from the browser, so RLS is enabled as a deny-all safety net on every table.

create extension if not exists pgcrypto;
create schema if not exists sign;

-- ---------------------------------------------------------------------------
-- Workspaces (accounts). Single workspace today, multi-workspace ready.
-- ---------------------------------------------------------------------------
create table sign.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  allowed_domains text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Users (internal members). auth_user_id links to auth.users once they log in.
-- ---------------------------------------------------------------------------
create table sign.users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sign.workspaces(id) on delete cascade,
  auth_user_id uuid unique,
  email text not null,
  name text not null default '',
  title text,
  company text,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  status text not null default 'active' check (status in ('active','invited','disabled')),
  signature jsonb,
  timezone text not null default 'America/Los_Angeles',
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create unique index users_workspace_email_idx on sign.users (workspace_id, lower(email));

-- ---------------------------------------------------------------------------
-- Files (objects in Supabase Storage, bucket `documents`)
-- ---------------------------------------------------------------------------
create table sign.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sign.workspaces(id) on delete cascade,
  bucket text not null default 'documents',
  path text not null,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  kind text not null default 'document' check (kind in ('document','signature','completed','certificate','attachment','upload')),
  created_by uuid references sign.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index files_bucket_path_idx on sign.files (bucket, path);

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create table sign.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sign.workspaces(id) on delete cascade,
  owner_id uuid not null references sign.users(id),
  name text not null,
  description text not null default '',
  subject text not null default '',
  message text not null default '',
  signing_order boolean not null default false,
  shared boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  use_count int not null default 0,
  last_used_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index templates_workspace_idx on sign.templates (workspace_id, updated_at desc);

create table sign.template_documents (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references sign.templates(id) on delete cascade,
  file_id uuid not null references sign.files(id),
  name text not null,
  position int not null default 0,
  page_count int not null,
  pages jsonb not null,
  created_at timestamptz not null default now()
);

create table sign.template_roles (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references sign.templates(id) on delete cascade,
  name text not null,
  role text not null default 'signer' check (role in ('signer','cc','viewer','approver')),
  routing_order int not null default 1,
  position int not null default 0,
  color_index int not null default 0,
  default_name text,
  default_email text,
  private_message text,
  created_at timestamptz not null default now()
);

create table sign.template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references sign.templates(id) on delete cascade,
  document_id uuid not null references sign.template_documents(id) on delete cascade,
  role_id uuid not null references sign.template_roles(id) on delete cascade,
  type text not null,
  page int not null,
  x double precision not null,
  y double precision not null,
  width double precision not null,
  height double precision not null,
  required boolean not null default true,
  read_only boolean not null default false,
  label text,
  options jsonb not null default '{}'::jsonb,
  value text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Envelopes
-- ---------------------------------------------------------------------------
create table sign.envelopes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sign.workspaces(id) on delete cascade,
  owner_id uuid not null references sign.users(id),
  created_via text not null default 'web' check (created_via in ('web','api','template','mcp')),
  api_key_id uuid,
  template_id uuid references sign.templates(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','completed','declined','voided','expired')),
  subject text not null default '',
  message text not null default '',
  signing_order boolean not null default false,
  visibility text not null default 'workspace' check (visibility in ('workspace','private')),
  reminder_enabled boolean not null default true,
  reminder_delay_days int not null default 2,
  reminder_frequency_days int not null default 3,
  expire_after_days int not null default 120,
  expire_warn_days int not null default 3,
  expires_at timestamptz,
  allow_reassign boolean not null default true,
  allow_comments boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  declined_at timestamptz,
  expired_at timestamptz,
  deleted_at timestamptz,
  completed_file_id uuid references sign.files(id),
  certificate_file_id uuid references sign.files(id),
  completed_sha256 text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index envelopes_workspace_status_idx on sign.envelopes (workspace_id, status, last_activity_at desc);
create index envelopes_owner_idx on sign.envelopes (owner_id, last_activity_at desc);
create index envelopes_expires_idx on sign.envelopes (expires_at) where status = 'sent';
create index envelopes_sha_idx on sign.envelopes (completed_sha256) where completed_sha256 is not null;

create table sign.documents (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references sign.envelopes(id) on delete cascade,
  file_id uuid not null references sign.files(id),
  name text not null,
  position int not null default 0,
  page_count int not null,
  pages jsonb not null,
  created_at timestamptz not null default now()
);
create index documents_envelope_idx on sign.documents (envelope_id, position);

create table sign.recipients (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references sign.envelopes(id) on delete cascade,
  role text not null default 'signer' check (role in ('signer','cc','viewer','approver')),
  name text not null,
  email text not null,
  routing_order int not null default 1,
  position int not null default 0,
  color_index int not null default 0,
  template_role text,
  private_message text,
  access_code_hash text,
  status text not null default 'created' check (status in ('created','sent','delivered','completed','declined','replaced')),
  token_hash text unique,
  token_created_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  consented_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  last_reminded_at timestamptz,
  reminder_count int not null default 0,
  ip text,
  user_agent text,
  geo jsonb,
  signature_adoption jsonb,
  replaced_by uuid references sign.recipients(id),
  user_id uuid references sign.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipients_envelope_idx on sign.recipients (envelope_id, routing_order, position);
create index recipients_email_idx on sign.recipients (lower(email));

create table sign.fields (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references sign.envelopes(id) on delete cascade,
  document_id uuid not null references sign.documents(id) on delete cascade,
  recipient_id uuid not null references sign.recipients(id) on delete cascade,
  type text not null,
  page int not null,
  x double precision not null,
  y double precision not null,
  width double precision not null,
  height double precision not null,
  required boolean not null default true,
  read_only boolean not null default false,
  label text,
  options jsonb not null default '{}'::jsonb,
  value text,
  filled_at timestamptz,
  created_at timestamptz not null default now()
);
create index fields_envelope_idx on sign.fields (envelope_id);
create index fields_recipient_idx on sign.fields (recipient_id);

-- Append-only, hash-chained audit trail
create table sign.events (
  id bigint generated always as identity primary key,
  envelope_id uuid not null references sign.envelopes(id) on delete cascade,
  recipient_id uuid references sign.recipients(id) on delete set null,
  actor_user_id uuid references sign.users(id) on delete set null,
  actor_api_key_id uuid,
  type text not null,
  description text not null,
  ip text,
  user_agent text,
  geo jsonb,
  data jsonb not null default '{}'::jsonb,
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now()
);
create index events_envelope_idx on sign.events (envelope_id, id);

-- Collaboration
create table sign.comments (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references sign.envelopes(id) on delete cascade,
  author_user_id uuid references sign.users(id) on delete set null,
  author_recipient_id uuid references sign.recipients(id) on delete set null,
  body text not null,
  visibility text not null default 'internal' check (visibility in ('internal','everyone')),
  document_id uuid references sign.documents(id) on delete set null,
  page int,
  x double precision,
  y double precision,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index comments_envelope_idx on sign.comments (envelope_id, created_at);

create table sign.envelope_collaborators (
  envelope_id uuid not null references sign.envelopes(id) on delete cascade,
  user_id uuid not null references sign.users(id) on delete cascade,
  permission text not null default 'edit' check (permission in ('view','edit','manage')),
  added_by uuid references sign.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (envelope_id, user_id)
);

create table sign.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sign.workspaces(id) on delete cascade,
  owner_id uuid not null references sign.users(id) on delete cascade,
  name text not null,
  shared boolean not null default true,
  created_at timestamptz not null default now()
);

create table sign.envelope_folders (
  envelope_id uuid not null references sign.envelopes(id) on delete cascade,
  folder_id uuid not null references sign.folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (envelope_id, folder_id)
);

create table sign.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sign.workspaces(id) on delete cascade,
  name text not null,
  email text not null,
  company text,
  use_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index contacts_workspace_email_idx on sign.contacts (workspace_id, lower(email));

-- Developer platform
create table sign.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sign.workspaces(id) on delete cascade,
  user_id uuid not null references sign.users(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{envelopes:read,envelopes:write,templates:read,templates:write}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table sign.webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sign.workspaces(id) on delete cascade,
  url text not null,
  secret text not null,
  events text[] not null default '{*}',
  description text not null default '',
  active boolean not null default true,
  created_by uuid references sign.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table sign.webhook_deliveries (
  id bigint generated always as identity primary key,
  webhook_id uuid not null references sign.webhooks(id) on delete cascade,
  event_type text not null,
  envelope_id uuid references sign.envelopes(id) on delete set null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  attempts int not null default 0,
  response_status int,
  response_body text,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index webhook_deliveries_pending_idx on sign.webhook_deliveries (next_attempt_at) where status = 'pending';

create table sign.emails (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid references sign.envelopes(id) on delete cascade,
  recipient_id uuid references sign.recipients(id) on delete set null,
  type text not null,
  to_email text not null,
  subject text not null,
  resend_id text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','delivery_delayed','bounced','complained','failed','opened','clicked')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index emails_resend_idx on sign.emails (resend_id);
create index emails_envelope_idx on sign.emails (envelope_id, created_at);

-- Deny-all RLS safety net (the server connects as a privileged role and bypasses RLS)
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'sign' loop
    execute format('alter table sign.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on schema sign from anon, authenticated;
