-- Cota por conta no Supabase Storage (bucket frame-private).
-- Sem isso, qualquer conta pode enviar arquivos direto ao bucket, sem passar pela API,
-- até o limite de 50 MB por objeto, em quantidade ilimitada.
-- O valor deve ser igual a FRAME_STORAGE_QUOTA_MB na Vercel (padrão 20480 MB = 20 GB).
-- Em produção a política de envio se chama frame_files_insert_own (conferido em 11/11/2026).
-- Ela é recriada com a MESMA condição de antes, acrescida apenas da cota.
begin;
create or replace function public.frame_storage_quota() returns bigint language sql immutable as $$ select 21474836480::bigint $$;
-- Soma só os arquivos da própria conta (auth.uid()); não recebe parâmetro para não expor o uso de outras contas.
create or replace function public.frame_storage_used() returns bigint language sql stable security definer set search_path = '' as $$
 select coalesce(sum(coalesce((o.metadata->>'size')::bigint,0)),0)::bigint
 from storage.objects o
 where o.bucket_id='frame-private' and (storage.foldername(o.name))[1]=(select auth.uid())::text
$$;
revoke all on function public.frame_storage_used() from public,anon;
grant execute on function public.frame_storage_used() to authenticated;
drop policy if exists frame_files_insert_own on storage.objects;
drop policy if exists media_insert_own on storage.objects;
create policy frame_files_insert_own on storage.objects for insert to authenticated with check(
 bucket_id='frame-private'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and public.frame_storage_used()<public.frame_storage_quota()
);
commit;
