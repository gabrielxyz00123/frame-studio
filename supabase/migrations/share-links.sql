-- Links de compartilhamento revogáveis (/api/share?id=...).
-- Cada link é uma linha; revogar preenche revoked_at e o link para de funcionar no próximo acesso.
-- Os links antigos (URLs assinadas direto do R2, válidas por até 7 dias) NÃO são afetados:
-- eles expiram sozinhos. Para invalidá-los antes, é preciso trocar a chave de acesso do R2.
begin;
create table if not exists public.frame_share_links (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 path text not null check(length(path)<=220),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 constraint frame_share_links_own_generated check(path like owner_id::text||'/generated/%' and position('..' in path)=0),
 constraint frame_share_links_max_age check(expires_at>created_at and expires_at<=created_at+interval '7 days 1 minute')
);
alter table public.frame_share_links enable row level security;
revoke all on public.frame_share_links from anon,authenticated;
grant select,insert on public.frame_share_links to authenticated;
grant update(revoked_at) on public.frame_share_links to authenticated;
-- /api/share lê os links com a chave de serviço; neste projeto as tabelas novas não recebem essa permissão sozinhas
grant select on public.frame_share_links to service_role;
create policy frame_share_links_read_own on public.frame_share_links for select to authenticated using(owner_id=(select auth.uid()));
create policy frame_share_links_insert_own on public.frame_share_links for insert to authenticated with check(owner_id=(select auth.uid()) and revoked_at is null);
create policy frame_share_links_revoke_own on public.frame_share_links for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and revoked_at is not null);
create index if not exists frame_share_links_owner_path_idx on public.frame_share_links(owner_id,path) where revoked_at is null;
notify pgrst,'reload schema';
commit;
