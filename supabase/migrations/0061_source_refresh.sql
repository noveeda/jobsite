create or replace function public.record_source_refresh(
  target_source_id uuid,
  target_status public.source_status,
  target_fields_changed text[],
  target_error_code text,
  target_source_values jsonb,
  target_job_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owned_source public.job_sources%rowtype;
  checked_time timestamptz := now();
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into owned_source
  from public.job_sources
  where id = target_source_id and user_id = auth.uid();
  if not found then raise exception 'source not found'; end if;

  update public.job_sources
  set status = target_status,
      source_values = source_values || coalesce(target_source_values, '{}'),
      last_checked_at = checked_time,
      last_success_at = case
        when target_error_code is null and target_status in ('active', 'closed', 'unknown') then checked_time
        else last_success_at
      end,
      last_error_code = target_error_code
  where id = target_source_id;

  insert into public.source_checks(user_id, source_id, result_status, fields_changed, error_code, checked_at)
  values (auth.uid(), target_source_id, target_status, coalesce(target_fields_changed, '{}'), target_error_code, checked_time);

  delete from public.source_checks
  where id in (
    select id
    from public.source_checks
    where source_id = target_source_id and user_id = auth.uid()
    order by checked_at desc, id desc
    offset 100
  );

  if coalesce(target_job_patch, '{}') <> '{}'::jsonb then
    update public.jobs
    set title = case
          when target_job_patch ? 'title'
            and coalesce(field_provenance #>> '{title,origin}', '') <> 'user'
          then target_job_patch->>'title' else title end,
        company_name = case
          when target_job_patch ? 'companyName'
            and coalesce(field_provenance #>> '{companyName,origin}', field_provenance #>> '{company_name,origin}', '') <> 'user'
          then target_job_patch->>'companyName' else company_name end,
        role_name = case
          when target_job_patch ? 'roleName'
            and coalesce(field_provenance #>> '{roleName,origin}', field_provenance #>> '{role_name,origin}', '') <> 'user'
          then target_job_patch->>'roleName' else role_name end,
        locations = case
          when target_job_patch ? 'locations'
            and coalesce(field_provenance #>> '{locations,origin}', '') <> 'user'
          then array(select jsonb_array_elements_text(target_job_patch->'locations')) else locations end,
        deadline_at = case
          when target_job_patch ? 'deadlineAt'
            and coalesce(field_provenance #>> '{deadlineAt,origin}', field_provenance #>> '{deadline_at,origin}', '') <> 'user'
          then (target_job_patch->>'deadlineAt')::timestamptz else deadline_at end,
        deadline_kind = case
          when target_job_patch ? 'deadlineKind'
            and coalesce(field_provenance #>> '{deadlineKind,origin}', field_provenance #>> '{deadline_kind,origin}', '') <> 'user'
          then (target_job_patch->>'deadlineKind')::public.deadline_kind else deadline_kind end
    where id = owned_source.job_id and user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.record_source_refresh(uuid, public.source_status, text[], text, jsonb, jsonb) to authenticated;