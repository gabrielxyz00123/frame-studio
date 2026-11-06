-- Instalação em um Supabase NOVO. Não executar sobre produção existente.
create table public.frame_library (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check(kind in ('model','batch','media','generation')),
 data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 deleted boolean not null default false
);
alter table public.frame_library enable row level security;
grant select,insert,update on public.frame_library to authenticated;
create policy library_read_own on public.frame_library for select to authenticated using(owner_id=auth.uid());
create policy library_insert_own on public.frame_library for insert to authenticated with check(owner_id=auth.uid());
create policy library_update_own on public.frame_library for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('frame-private','frame-private',false,52428800,ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime','audio/wav']);
create policy media_read_own on storage.objects for select to authenticated using(bucket_id='frame-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy media_insert_own on storage.objects for insert to authenticated with check(bucket_id='frame-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy media_update_own on storage.objects for update to authenticated using(bucket_id='frame-private' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='frame-private' and (storage.foldername(name))[1]=auth.uid()::text);
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

alter table public.frame_prompt_settings add column base_prompt text not null default '' check(length(base_prompt)<=20000);
begin;
alter table public.frame_prompt_settings add column if not exists multi_prompt text not null default '';
alter table public.frame_prompt_settings add column if not exists image_prompt text not null default '';
create or replace function public.frame_claim_production(p_id uuid,p_token uuid) returns boolean language plpgsql security invoker set search_path = public as $$
begin
 update public.frame_library set data=data||jsonb_build_object('leaseToken',p_token::text,'leaseUntil',extract(epoch from now())+180)
 where id=p_id and owner_id=auth.uid() and kind='batch' and not deleted
 and (coalesce((data->>'leaseUntil')::numeric,0)<extract(epoch from now()) or data->>'leaseToken'=p_token::text);
 return found;
end;$$;
create or replace function public.frame_save_production(p_id uuid,p_payload jsonb,p_token uuid default null) returns boolean language plpgsql security invoker set search_path = public as $$
begin
 update public.frame_library set data=(p_payload-'leaseToken'-'leaseUntil')||jsonb_build_object('leaseToken',data->'leaseToken','leaseUntil',data->'leaseUntil')
 where id=p_id and owner_id=auth.uid() and kind='batch' and not deleted and (
  (p_token is null and coalesce((data->>'leaseUntil')::numeric,0)<extract(epoch from now())) or
  (data->>'leaseToken'=p_token::text and coalesce((data->>'leaseUntil')::numeric,0)>=extract(epoch from now()))
 );return found;
end;$$;
create or replace function public.frame_release_production(p_id uuid,p_token uuid) returns void language sql security invoker set search_path = public as $$
 update public.frame_library set data=data-'leaseToken'-'leaseUntil' where id=p_id and owner_id=auth.uid() and data->>'leaseToken'=p_token::text;
$$;
revoke all on function public.frame_claim_production(uuid,uuid),public.frame_save_production(uuid,jsonb,uuid),public.frame_release_production(uuid,uuid) from public;
grant execute on function public.frame_claim_production(uuid,uuid),public.frame_save_production(uuid,jsonb,uuid),public.frame_release_production(uuid,uuid) to authenticated;
commit;
begin;
create table if not exists public.frame_credentials (owner_id uuid primary key references auth.users(id) on delete cascade,ciphertext text not null check(length(ciphertext)<=6000),updated_at timestamptz not null default now());
alter table public.frame_credentials enable row level security;
create policy "Own saved credentials" on public.frame_credentials for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
grant select,insert,update,delete on public.frame_credentials to authenticated;
revoke all on public.frame_credentials from anon;
commit;
