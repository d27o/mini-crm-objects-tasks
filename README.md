# Мини-CRM «Объекты и задачи»

Постановщик ставит задачи по объектам (стройкам), исполнитель выполняет их и сдаёт на проверку.
React + TypeScript + Vite на фронтенде, Supabase (Postgres + Auth) на бэкенде.

Все правила доступа и смены статусов работают в базе, а не только в интерфейсе.
Подробности: [docs/SECURITY.md](docs/SECURITY.md), объяснение для руководителя: [docs/EXPLANATION.md](docs/EXPLANATION.md),
решения и допущения: [docs/DECISIONS.md](docs/DECISIONS.md).

## Структура

```
supabase/migrations/   схема, RLS, триггеры, функция смены статуса (одна миграция)
supabase/tests/        тесты прав доступа на чистом Postgres (35 проверок)
scripts/seed.mjs       тестовые пользователи и данные
src/                   фронтенд
```

## Запуск

Нужен Node.js 20+.

### 1. Supabase

1. Создайте проект на [supabase.com](https://supabase.com).
2. **Authentication → Sign In / Providers → Email**: выключите *Allow new users to sign up*
   (открытая регистрация запрещена; пользователей создаёт администратор).
3. Примените миграцию: **SQL Editor** → вставить `supabase/migrations/20261106000000_init.sql` → Run.
   Или через Supabase CLI: `supabase link --project-ref <ref> && supabase db push`.

### 2. Тестовые данные

```bash
cp .env.seed.example .env.seed   # URL, anon key, service_role key, пароль для тестовых пользователей
npm install
npm run seed
```

Создаются `manager@crm.test` (постановщик), `ivan@crm.test` и `oleg@crm.test` (исполнители),
3 объекта и 7 задач во всех статусах. Скрипт можно запускать повторно.

`service_role` используется только в этом локальном скрипте, в git и во фронтенд не попадает.

Пользователей можно создавать и вручную: **Authentication → Users → Add user**. По умолчанию у нового
пользователя роль «исполнитель»; постановщика назначают в **Table Editor → profiles → role = manager**.

### 3. Фронтенд

```bash
cp .env.example .env   # VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
npm run dev
```

Деплой на Vercel: импортировать репозиторий, добавить те же две переменные `VITE_*`. `vercel.json`
настраивает SPA-роутинг.

### Тесты базы

Нужен локальный Postgres 14+:

```bash
PGURL=postgres://postgres@127.0.0.1:5432 ./supabase/tests/run.sh
```

Тест эмулирует окружение Supabase (схема `auth`, роли `anon`/`authenticated`), применяет миграцию и
пробует от имени разных пользователей все запрещённые действия напрямую через SQL.
