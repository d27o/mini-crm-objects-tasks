-- Мини-CRM «Объекты и задачи»: схема, права доступа, бизнес-правила статусов.
-- Принцип: все правила живут в базе. Фронтенд только показывает то, что база и так разрешает.

-- ============================================================
-- Типы
-- ============================================================

create type public.user_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'review', 'rework', 'accepted');

-- ============================================================
-- Таблицы
-- ============================================================

-- Профиль пользователя: имя и роль. Строка создаётся триггером при создании пользователя в auth.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  role       public.user_role not null default 'executor',
  created_at timestamptz not null default now()
);

-- Объект (стройка).
create table public.sites (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  address    text not null default '',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  description text not null default '',
  -- Объект с задачами удалить нельзя: сначала нужно удалить или перенести задачи.
  site_id     uuid not null references public.sites (id) on delete restrict,
  assignee_id uuid not null references public.profiles (id),
  status      public.task_status not null default 'new',
  author_id   uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_site_id_idx on public.tasks (site_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

-- История смен статуса. Пишется только функциями базы, через API доступна только на чтение.
create table public.task_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  changed_by  uuid not null references public.profiles (id),
  from_status public.task_status,           -- null = задача создана
  to_status   public.task_status not null,
  comment     text,
  created_at  timestamptz not null default now()
);

create index task_history_task_id_idx on public.task_history (task_id, created_at);

-- ============================================================
-- Вспомогательные функции
-- ============================================================

-- security definer: читает profiles в обход RLS, чтобы политики не зацикливались.
create function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  );
$$;

-- Профиль для нового пользователя auth. Роль всегда executor; постановщика назначают вручную.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Триггеры задач
-- ============================================================

-- При создании: автор = текущий пользователь, статус = «Новая», что бы ни прислал клиент.
create function public.tasks_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.author_id  := auth.uid();
  new.status     := 'new';
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_before_insert
  before insert on public.tasks
  for each row execute function public.tasks_before_insert();

-- Исполнителем можно назначить только пользователя с ролью executor.
create function public.tasks_check_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = new.assignee_id and role = 'executor'
  ) then
    raise exception 'Исполнителем можно назначить только пользователя с ролью «Исполнитель»'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger tasks_check_assignee
  before insert or update of assignee_id on public.tasks
  for each row execute function public.tasks_check_assignee();

-- При редактировании: статус, автор и дата создания неизменны.
-- Статус меняется только через change_task_status(), которая выставляет флаг транзакции.
create function public.tasks_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.status_change', true), '') <> 'on' then
    raise exception 'Статус меняется только через change_task_status()'
      using errcode = 'insufficient_privilege';
  end if;
  if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'Автора и дату создания задачи менять нельзя'
      using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function public.tasks_before_update();

-- Запись о создании задачи в истории.
create function public.tasks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_history (task_id, changed_by, from_status, to_status)
  values (new.id, new.author_id, null, new.status);
  return null;
end;
$$;

create trigger tasks_after_insert
  after insert on public.tasks
  for each row execute function public.tasks_after_insert();

-- ============================================================
-- Смена статуса: единственный путь, проверяет роль и разрешённый переход
-- ============================================================

create function public.change_task_status(
  p_task_id uuid,
  p_to      public.task_status,
  p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task    public.tasks;
  v_uid     uuid := auth.uid();
  v_manager boolean := public.is_manager();
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_allowed boolean;
  v_from    public.task_status;
begin
  if v_uid is null then
    raise exception 'Требуется вход' using errcode = 'insufficient_privilege';
  end if;

  -- for update: две одновременные смены статуса не проскочат обе.
  select * into v_task from public.tasks where id = p_task_id for update;

  -- Исполнитель не узнаёт даже о существовании чужой задачи.
  if not found or (not v_manager and v_task.assignee_id <> v_uid) then
    raise exception 'Задача не найдена' using errcode = 'no_data_found';
  end if;

  v_from := v_task.status;

  v_allowed := case
    when v_task.status = 'new'         and p_to = 'in_progress' then v_task.assignee_id = v_uid
    when v_task.status = 'in_progress' and p_to = 'review'      then v_task.assignee_id = v_uid
    when v_task.status = 'rework'      and p_to = 'in_progress' then v_task.assignee_id = v_uid
    when v_task.status = 'review'      and p_to = 'accepted'    then v_manager
    when v_task.status = 'review'      and p_to = 'rework'      then v_manager
    else false
  end;

  if not v_allowed then
    raise exception 'Переход % → % недоступен', v_task.status, p_to
      using errcode = 'insufficient_privilege';
  end if;

  if p_to = 'rework' and v_comment is null then
    raise exception 'При возврате на доработку нужен комментарий'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.status_change', 'on', true);
  update public.tasks set status = p_to where id = p_task_id returning * into v_task;
  perform set_config('app.status_change', 'off', true);

  insert into public.task_history (task_id, changed_by, from_status, to_status, comment)
  values (p_task_id, v_uid, v_from, p_to, v_comment);

  return v_task;
end;
$$;

-- ============================================================
-- Права (GRANT): что вообще можно делать через API
-- ============================================================

-- Supabase по умолчанию раздаёт anon/authenticated все права на public. Забираем.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- profiles: только чтение. Роль и имя меняются только администратором в Supabase.
grant select on public.profiles to authenticated;

-- sites: чтение, удаление, запись только названия и адреса (что из этого можно кому, решает RLS).
grant select, delete on public.sites to authenticated;
grant insert (name, address) on public.sites to authenticated;
grant update (name, address) on public.sites to authenticated;

-- tasks: чтение, удаление и только «содержательные» колонки на запись.
-- Колонку status напрямую не изменить: на неё нет UPDATE-права.
grant select, delete on public.tasks to authenticated;
grant insert (title, description, site_id, assignee_id) on public.tasks to authenticated;
grant update (title, description, site_id, assignee_id) on public.tasks to authenticated;

-- task_history: только чтение. Ни insert, ни update, ни delete.
grant select on public.task_history to authenticated;

grant execute on function public.is_manager() to authenticated;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;

-- ============================================================
-- RLS: какие строки видны и изменяемы
-- ============================================================

alter table public.profiles     enable row level security;
alter table public.sites        enable row level security;
alter table public.tasks        enable row level security;
alter table public.task_history enable row level security;

-- profiles: сотрудники видят имена друг друга (нужно для «кто сменил статус», «автор»).
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- sites
create policy sites_select on public.sites
  for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.tasks t
      where t.site_id = sites.id and t.assignee_id = auth.uid()
    )
  );

create policy sites_insert on public.sites
  for insert to authenticated
  with check (public.is_manager());

create policy sites_update on public.sites
  for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy sites_delete on public.sites
  for delete to authenticated
  using (public.is_manager());

-- tasks
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_manager() or assignee_id = auth.uid());

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_manager());

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_manager());

-- task_history: видна тем, кто видит задачу.
create policy task_history_select on public.task_history
  for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.tasks t
      where t.id = task_history.task_id and t.assignee_id = auth.uid()
    )
  );
