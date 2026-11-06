begin;
alter table public.frame_prompt_settings add column if not exists base_prompt text not null default '';
alter table public.frame_prompt_settings add constraint frame_base_prompt_length check(length(base_prompt)<=20000);
commit;
