create index request_usage_bucket_start_idx
  on public.request_usage(bucket_start);

create or replace function public.cleanup_request_usage()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  with expired as (
    select usage.user_id, usage.action, usage.bucket_start
    from public.request_usage as usage
    where usage.bucket_start < clock_timestamp() - interval '30 days'
    order by usage.bucket_start, usage.user_id, usage.action
    limit 1000
    for update skip locked
  ), deleted as (
    delete from public.request_usage as usage
    using expired
    where usage.user_id = expired.user_id
      and usage.action = expired.action
      and usage.bucket_start = expired.bucket_start
    returning 1
  )
  select count(*)::integer into deleted_count from deleted;

  return deleted_count;
end;
$$;

comment on function public.cleanup_request_usage() is
  'Deletes at most 1000 request-usage buckets older than the fixed 30-day retention period. Invoke daily as service_role and repeat until it returns 0; failures are retried by the scheduler and never run in user request transactions.';

revoke all on function public.cleanup_request_usage()
  from public, anon, authenticated;
grant execute on function public.cleanup_request_usage()
  to service_role;
