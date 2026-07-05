-- Read-only pgAdmin checks. This file does not modify PostgreSQL.

SELECT
  current_database() AS database_name,
  current_user AS db_user,
  inet_server_addr() AS server_ip,
  inet_server_port() AS server_port,
  version() AS postgres_version;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT
  telegram_id,
  username,
  first_name,
  last_name,
  tokens,
  level,
  created_at
FROM users
ORDER BY created_at DESC;

SELECT version, name, applied_at
FROM public.schema_migrations
ORDER BY applied_at;
