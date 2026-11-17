-- Self-host bootstrap: instance secrets (auto-generated PAdES seal) and the private `documents` bucket.

create table if not exists sign.instance_secrets (
  name text primary key,
  value text not null,
  passphrase text not null default '',
  created_at timestamptz not null default now()
);
alter table sign.instance_secrets enable row level security;

-- Private storage bucket for every PDF / image. No-op if it already exists or this is not a Supabase database.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
  end if;
end $$;
