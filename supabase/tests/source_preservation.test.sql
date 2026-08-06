begin;
select plan(2);
insert into auth.users(id, aud, role, email) values ('00000000-0000-4000-8000-00000000000a','authenticated','authenticated','a@example.com');
insert into public.jobs(id,user_id,title,company_name,deadline_kind,field_provenance,memo) values ('10000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000000a','사용자 제목','회사','unknown','{"title":{"origin":"user"}}','내 메모');
update public.jobs set summary='새 요약' where id='10000000-0000-4000-8000-00000000000a';
select is((select title from public.jobs where id='10000000-0000-4000-8000-00000000000a'),'사용자 제목','source update keeps user title');
select is((select memo from public.jobs where id='10000000-0000-4000-8000-00000000000a'),'내 메모','source changes keep memo');
select * from finish(); rollback;
