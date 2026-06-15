alter table public.uploads
  drop constraint if exists uploads_file_kind_check;

alter table public.uploads
  add constraint uploads_file_kind_check
  check (file_kind in ('kpro', 'klog', 'log_image', 'unknown'));
