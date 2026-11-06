begin;
create table if not exists public.frame_prompt_settings (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 direct_prompt text not null default '' check(length(direct_prompt)<=20000),
 frame_prompt text not null default '' check(length(frame_prompt)<=20000),
 updated_at timestamptz not null default now()
);
alter table public.frame_prompt_settings enable row level security;
grant select,insert,update on public.frame_prompt_settings to authenticated;
create policy frame_prompts_read_own on public.frame_prompt_settings for select to authenticated using ((select auth.uid())=owner_id);
create policy frame_prompts_insert_own on public.frame_prompt_settings for insert to authenticated with check ((select auth.uid())=owner_id);
create policy frame_prompts_update_own on public.frame_prompt_settings for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
commit;
select tablename,rowsecurity from pg_tables where schemaname='public' and tablename='frame_prompt_settings';
