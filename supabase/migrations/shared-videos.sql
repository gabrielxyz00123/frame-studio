-- Ativa a tela "Vídeos compartilhados" (public/shared.js), que hoje mostra
-- "A biblioteca compartilhada ainda não foi ativada no banco".
-- Colunas exatamente como o site grava: id, owner_id, owner_email, name, path, size, type, duration.
-- Quem pode ver: qualquer conta logada vê os vídeos que alguém publicou nessa tela (é a função dela).
-- Vídeos privados da biblioteca continuam privados. Só o dono apaga (marca deleted) o que publicou.
begin;
create table if not exists public.frame_shared (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 owner_email text check(owner_email is null or length(owner_email)<=320),
 name text not null check(length(name) between 1 and 120),
 path text not null unique,
 size bigint not null check(size between 1 and 524288000),
 type text not null check(type in ('video/mp4','video/webm','video/quicktime')),
 duration double precision check(duration is null or duration>0),
 deleted boolean not null default false,
 created_at timestamptz not null default now(),
 constraint frame_shared_own_path check(path=owner_id::text||'/shared/'||id::text)
);
alter table public.frame_shared enable row level security;
revoke all on public.frame_shared from anon,authenticated;
grant select,insert on public.frame_shared to authenticated;
grant update(deleted) on public.frame_shared to authenticated;
create policy frame_shared_read on public.frame_shared for select to authenticated
 using(not deleted or owner_id=(select auth.uid()));
create policy frame_shared_insert on public.frame_shared for insert to authenticated
 with check(owner_id=(select auth.uid()) and not deleted and (owner_email is null or owner_email=(select auth.email())));
create policy frame_shared_update on public.frame_shared for update to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
-- leitura do arquivo no Supabase Storage (quando não está no R2) para vídeos compartilhados ativos
create policy frame_shared_storage_read on storage.objects for select to authenticated
 using(bucket_id='frame-private' and exists(
  select 1 from public.frame_shared s where s.path=storage.objects.name and not s.deleted
 ));
create index if not exists frame_shared_feed_idx on public.frame_shared(created_at desc) where not deleted;
notify pgrst,'reload schema';
commit;
