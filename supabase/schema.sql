-- The Office v2 — schema Supabase (piano gratuito).
-- Da incollare una volta in Supabase → SQL Editor → Run.
-- Ogni nota del vault è una riga: percorso + markdown completo (frontmatter incluso).
-- Le immagini usate dalle note (locandine, foto) stanno nello Storage, bucket "vault", allo stesso percorso.

create table if not exists public.notes (
  path        text primary key,                -- es. '04 Checklist/Checklist.md'
  content     text not null default '',
  deleted     boolean not null default false,  -- cancellazione "morbida": la sincronizzazione la propaga
  updated_at  timestamptz not null default now(),
  updated_by  text not null default 'app',     -- 'pc' | 'telefono' | 'claude' | …
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade
);
create index if not exists notes_updated_idx on public.notes (updated_at desc);

create table if not exists public.assets (
  path        text primary key,                -- es. '60 Film, serie e anime/_posters/Se7en.jpg'
  key         text not null,                   -- nome del file nello Storage (solo caratteri sicuri)
  size        bigint,
  updated_at  timestamptz not null default now(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade
);

-- updated_at sempre dal server, così gli orologi dei dispositivi non contano
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before insert or update on public.notes for each row execute function public.touch_updated_at();

-- Un solo utente: ogni riga è visibile e modificabile solo da chi l'ha creata.
alter table public.notes  enable row level security;
alter table public.assets enable row level security;
drop policy if exists notes_owner on public.notes;
create policy notes_owner on public.notes for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists assets_owner on public.assets;
create policy assets_owner on public.assets for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- Aggiornamenti in tempo reale tra PC e telefono
do $$ begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null; end $$;

-- Storage privato per le immagini
insert into storage.buckets (id, name, public) values ('vault', 'vault', false) on conflict (id) do nothing;
drop policy if exists vault_rw on storage.objects;
create policy vault_rw on storage.objects for all to authenticated
  using (bucket_id = 'vault' and owner = auth.uid())
  with check (bucket_id = 'vault' and owner = auth.uid());

-- Per Claude (connettore Supabase): una vista comoda delle note vive.
create or replace view public.notes_live with (security_invoker = true) as
  select path, content, updated_at, updated_by from public.notes where not deleted;
