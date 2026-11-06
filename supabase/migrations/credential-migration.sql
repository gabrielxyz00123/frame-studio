begin;
create table if not exists public.frame_credentials (owner_id uuid primary key references auth.users(id) on delete cascade,ciphertext text not null check(length(ciphertext)<=6000),updated_at timestamptz not null default now());
alter table public.frame_credentials enable row level security;
create policy "Own saved credentials" on public.frame_credentials for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
grant select,insert,update,delete on public.frame_credentials to authenticated;
revoke all on public.frame_credentials from anon;
commit;
