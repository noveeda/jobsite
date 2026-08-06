create or replace function public.decide_duplicate(target_pair_id uuid, target_decision public.duplicate_decision)
returns void language plpgsql security invoker as $$
declare pair_row public.duplicate_pairs; group_id uuid;
begin
  select * into pair_row from public.duplicate_pairs where id=target_pair_id and user_id=auth.uid() for update;
  if pair_row.id is null then raise exception 'duplicate pair not found'; end if;
  update public.duplicate_pairs set decision=target_decision,decided_at=now() where id=target_pair_id;
  if target_decision='confirmed' then
    select duplicate_group_id into group_id from public.jobs where id=pair_row.left_job_id;
    if group_id is null then insert into public.duplicate_groups(user_id) values(auth.uid()) returning id into group_id; end if;
    update public.jobs set duplicate_group_id=group_id where id in(pair_row.left_job_id,pair_row.right_job_id) and user_id=auth.uid();
  elsif pair_row.decision='confirmed' then
    update public.jobs set duplicate_group_id=null where id in(pair_row.left_job_id,pair_row.right_job_id) and user_id=auth.uid();
    delete from public.duplicate_groups g where g.user_id=auth.uid() and not exists(select 1 from public.jobs j where j.duplicate_group_id=g.id);
  end if;
end; $$;
grant execute on function public.decide_duplicate(uuid,public.duplicate_decision) to authenticated;
