-- Template favorites + indexes for reports/filters
create table if not exists sign.template_favorites (
  user_id uuid not null references sign.users(id) on delete cascade,
  template_id uuid not null references sign.templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, template_id)
);
alter table sign.template_favorites enable row level security;
create index if not exists envelopes_owner_sent_idx on sign.envelopes (workspace_id, owner_id, sent_at) where sent_at is not null;
create index if not exists envelopes_last_activity_idx on sign.envelopes (workspace_id, last_activity_at desc);
