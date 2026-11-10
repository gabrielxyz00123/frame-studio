begin;
create index if not exists frame_library_owner_kind_history_idx on public.frame_library(owner_id,kind,deleted,created_at desc,id);
update storage.buckets set allowed_mime_types=array(select distinct unnest(allowed_mime_types||ARRAY['audio/wav'])) where id='frame-private' and allowed_mime_types is not null;
drop policy if exists media_delete_own on storage.objects;
create policy media_delete_own on storage.objects for delete to authenticated using(bucket_id='frame-private' and (storage.foldername(name))[1]=auth.uid()::text);
commit;
