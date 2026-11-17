-- A template is a header row plus a backing envelope (status 'template') that holds
-- its documents, roles (recipients with template_role and optional default name/email) and fields.
drop table if exists sign.template_fields;
drop table if exists sign.template_roles;
drop table if exists sign.template_documents;

alter table sign.envelopes drop constraint if exists envelopes_status_check;
alter table sign.envelopes add constraint envelopes_status_check check (status in ('draft','sent','completed','declined','voided','expired','template'));

alter table sign.templates add column if not exists envelope_id uuid references sign.envelopes(id) on delete cascade;
create unique index if not exists templates_envelope_idx on sign.templates (envelope_id);
