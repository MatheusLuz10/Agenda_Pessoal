-- Permite notas de texto sem anexo em public.documents.
alter table public.documents alter column file_url drop not null;
alter table public.documents alter column file_name drop not null;
alter table public.documents add column if not exists content text not null default '';
alter table public.documents drop constraint if exists documents_content_or_file;
alter table public.documents add constraint documents_content_or_file
  check (length(trim(content)) > 0 or file_url is not null);
