-- =====================================================================
-- Agenda Pessoal — APAGAR TODO O CONTEÚDO DO CALENDÁRIO
--
-- Apaga todas as tarefas (public.tasks) e todos os calendários
-- (public.calendars) do banco. NÃO mexe em nenhuma outra tabela
-- (documentos, finanças, trabalho, DEU SEDE!...).
-- O calendário "Aniversário" é recriado vazio pelo app na próxima abertura.
--
-- ATENÇÃO: não tem como desfazer. Se quiser guardar uma cópia antes,
-- use Table Editor -> calendars / tasks -> Export to CSV.
--
-- Como usar (Supabase -> SQL Editor):
--   1. Rode só o PASSO 1 e confira os números.
--   2. Rode o PASSO 2 para apagar.
-- =====================================================================

-- PASSO 1 — o que será apagado
select
  (select count(*) from public.calendars) as calendarios,
  (select count(*) from public.tasks) as tarefas;

-- PASSO 2 — apagar (tudo ou nada)
begin;
  delete from public.tasks;
  delete from public.calendars;
commit;

-- Conferência: os dois números devem ser 0
select
  (select count(*) from public.calendars) as calendarios,
  (select count(*) from public.tasks) as tarefas;
