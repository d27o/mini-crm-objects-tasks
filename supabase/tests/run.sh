#!/usr/bin/env bash
# Прогоняет миграцию и тесты прав на чистой локальной базе Postgres (эмуляция окружения Supabase).
# Использование: PGURL=postgres://postgres@127.0.0.1:5432 ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PGURL="${PGURL:-postgres://postgres@127.0.0.1:5432}"
psql "$PGURL/postgres" -q -c "drop database if exists crm_test" -c "create database crm_test"
psql "$PGURL/crm_test" -q -f supabase/tests/00_supabase_stub.sql 2>/dev/null || true
psql "$PGURL/crm_test" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261106000000_init.sql
psql "$PGURL/crm_test" -q -v ON_ERROR_STOP=1 -f supabase/tests/01_access_test.sql 2>&1 | grep -E 'OK|FAIL|ERROR'
