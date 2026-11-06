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
