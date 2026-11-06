-- Новые проекты Supabase не выдают права на новые таблицы автоматически.
-- service_role (серверный ключ администратора, только для seed-скрипта) получает полный доступ явно.
-- anon/authenticated — по-прежнему только то, что выдано в init-миграции.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
