\set ON_ERROR_STOP 1
create schema test; grant usage on schema test to authenticated, anon;
create function test.must_fail(label text, q text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then raise notice 'OK (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create function test.must_pass(label text, q text) returns void language plpgsql as $$
begin execute q; raise notice 'OK (allowed) %', label; end $$;
grant execute on all functions in schema test to authenticated, anon;

insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','boss@x','{"full_name":"Босс"}'),
 ('00000000-0000-0000-0000-00000000000b','ivan@x','{"full_name":"Иван"}'),
 ('00000000-0000-0000-0000-00000000000c','petr@x','{"full_name":"Пётр"}');
update public.profiles set role='manager' where email='boss@x';

-- ===== постановщик (сид с фиксированными id делаем от postgres, триггеры используют auth.uid())
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into sites (id,name,address,created_by) values ('10000000-0000-0000-0000-000000000001','ЖК Солнечный','ул. Ленина 1',auth.uid()),('10000000-0000-0000-0000-000000000002','Склад','пр. Мира 5',auth.uid());
insert into tasks (id,title,site_id,assignee_id,status,author_id) values
 ('20000000-0000-0000-0000-000000000001','Залить фундамент','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','accepted','00000000-0000-0000-0000-00000000000c'),
 ('20000000-0000-0000-0000-000000000002','Чужая задача Петра','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c','new',null);
set role authenticated;
select test.must_pass('insert ignores status/author', $q$ do $d$ begin if (select status from tasks where id='20000000-0000-0000-0000-000000000001')<>'new' or (select author_id from tasks where id='20000000-0000-0000-0000-000000000001')<>auth.uid() then raise exception 'not forced'; end if; end $d$ $q$);
select test.must_pass('manager creates site', $q$ insert into sites (name,address) values ('Тест','адрес') $q$);
select test.must_fail('manager sets site id', $q$ insert into sites (id,name) values (gen_random_uuid(),'x') $q$);
select test.must_pass('manager creates task (status/author forced)', $q$ insert into tasks (title,site_id,assignee_id) values ('t','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c') $q$);
select test.must_fail('manager sends status on insert', $q$ insert into tasks (title,site_id,assignee_id,status) values ('t','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c','accepted') $q$);
select test.must_fail('assign manager as assignee', $q$ insert into tasks (title,site_id,assignee_id) values ('x','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a') $q$);
select test.must_fail('manager direct status update', $q$ update tasks set status='accepted' $q$);
select test.must_fail('manager new->in_progress', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','in_progress') $q$);
select test.must_fail('manager insert history', $q$ insert into task_history (task_id,changed_by,to_status) values ('20000000-0000-0000-0000-000000000001',auth.uid(),'accepted') $q$);
select test.must_fail('manager change own role', $q$ update profiles set role='executor' where id=auth.uid() $q$);
select test.must_fail('delete site with tasks', $q$ delete from sites where id='10000000-0000-0000-0000-000000000001' $q$);
reset role;

-- ===== исполнитель Иван
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select test.must_pass('ivan sees only own tasks', $q$ do $d$ begin if (select count(*) from tasks)<>1 then raise exception 'count=%',(select count(*) from tasks); end if; end $d$ $q$);
select test.must_pass('ivan sees only 1 site', $q$ do $d$ begin if (select count(*) from sites)<>1 then raise exception 'sites=%',(select count(*) from sites); end if; end $d$ $q$);
select test.must_pass('ivan cannot see petr history', $q$ do $d$ begin if exists(select 1 from task_history where task_id='20000000-0000-0000-0000-000000000002') then raise exception 'leak'; end if; end $d$ $q$);
select test.must_fail('ivan create site', $q$ insert into sites (name) values ('hack') $q$);
select test.must_fail('ivan create task', $q$ insert into tasks (title,site_id,assignee_id) values ('x','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b') $q$);
select test.must_pass('ivan update task = 0 rows', $q$ do $d$ declare n int; begin update tasks set title='hacked'; get diagnostics n = row_count; if n<>0 then raise exception 'updated %',n; end if; end $d$ $q$);
select test.must_fail('ivan direct status', $q$ update tasks set status='accepted' $q$);
select test.must_fail('ivan move petr task', $q$ select change_task_status('20000000-0000-0000-0000-000000000002','in_progress') $q$);
select test.must_fail('ivan new->review', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','review') $q$);
select test.must_pass('ivan new->in_progress', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','in_progress') $q$);
select test.must_pass('ivan in_progress->review', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','review') $q$);
select test.must_fail('ivan review->accepted', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','accepted') $q$);
select test.must_fail('ivan update history', $q$ update task_history set comment='x' $q$);
select test.must_fail('ivan delete history', $q$ delete from task_history $q$);
select test.must_pass('ivan delete task = 0 rows', $q$ do $d$ declare n int; begin delete from tasks; get diagnostics n = row_count; if n<>0 then raise exception 'deleted %',n; end if; end $d$ $q$);
reset role;

-- ===== постановщик возвращает
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select test.must_fail('rework without comment', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','rework','   ') $q$);
select test.must_pass('rework with comment', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','rework','Трещины') $q$);
select test.must_fail('manager history delete', $q$ delete from task_history $q$);
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select test.must_pass('ivan rework->in_progress', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','in_progress') $q$);
select test.must_pass('ivan ->review', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','review') $q$);
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select test.must_pass('accept', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','accepted') $q$);
select test.must_fail('accepted->rework', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','rework','x') $q$);
reset role;

-- ===== anon
set role anon; reset request.jwt.claim.sub;
select test.must_fail('anon read tasks', $q$ select * from tasks $q$);
select test.must_fail('anon rpc', $q$ select change_task_status('20000000-0000-0000-0000-000000000001','accepted') $q$);
reset role;
select from_status, to_status, comment, p.full_name from task_history h join profiles p on p.id=h.changed_by where task_id='20000000-0000-0000-0000-000000000001' order by h.id;
