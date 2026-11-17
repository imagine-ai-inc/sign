-- Every link we email stays valid until the recipient finishes, the envelope closes, or it expires.
create table sign.signing_tokens (
  token_hash text primary key,
  recipient_id uuid not null references sign.recipients(id) on delete cascade,
  purpose text not null default 'sign' check (purpose in ('sign','view','completed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index signing_tokens_recipient_idx on sign.signing_tokens (recipient_id);
alter table sign.signing_tokens enable row level security;

alter table sign.recipients drop column if exists token_hash;
alter table sign.recipients drop column if exists token_created_at;
alter table sign.envelopes add column if not exists sender_name text;
alter table sign.envelopes add column if not exists sender_email text;
