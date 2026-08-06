create or replace function public.update_job_tracking(
  target_job_id uuid,
  target_status public.application_status,
  target_memo text,
  target_next_action timestamptz,
  target_device uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('app.device_id', target_device::text, true);
  perform set_config('app.change_kind', 'update', true);
  update public.jobs
  set application_status = target_status,
      memo = target_memo,
      next_action_at = target_next_action
  where id = target_job_id and user_id = auth.uid();
  if not found then raise exception 'job not found'; end if;
end;
$$;

create or replace function public.restore_job_revision(
  target_job_id uuid,
  target_revision_id uuid,
  target_device uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  snap jsonb;
  created_revision_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select snapshot into snap
  from public.job_revisions
  where id = target_revision_id
    and job_id = target_job_id
    and user_id = auth.uid();

  if snap is null then raise exception 'revision not found'; end if;
  perform set_config('app.device_id', target_device::text, true);
  perform set_config('app.change_kind', 'restore', true);

  update public.jobs
  set title = snap->>'title',
      company_name = snap->>'company_name',
      role_name = snap->>'role_name',
      summary = snap->>'summary',
      responsibilities = coalesce((select array_agg(value) from jsonb_array_elements_text(snap->'responsibilities')), '{}'),
      qualifications = coalesce((select array_agg(value) from jsonb_array_elements_text(snap->'qualifications')), '{}'),
      preferred_qualifications = coalesce((select array_agg(value) from jsonb_array_elements_text(snap->'preferred_qualifications')), '{}'),
      career_min_years = (snap->>'career_min_years')::smallint,
      career_max_years = (snap->>'career_max_years')::smallint,
      education_text = snap->>'education_text',
      employment_types = coalesce((select array_agg(value) from jsonb_array_elements_text(snap->'employment_types')), '{}'),
      locations = coalesce((select array_agg(value) from jsonb_array_elements_text(snap->'locations')), '{}'),
      salary_text = snap->>'salary_text',
      skills = coalesce((select array_agg(value) from jsonb_array_elements_text(snap->'skills')), '{}'),
      posted_at = (snap->>'posted_at')::timestamptz,
      deadline_at = (snap->>'deadline_at')::timestamptz,
      deadline_kind = (snap->>'deadline_kind')::public.deadline_kind,
      application_status = (snap->>'application_status')::public.application_status,
      memo = coalesce(snap->>'memo', ''),
      next_action_at = (snap->>'next_action_at')::timestamptz,
      duplicate_group_id = (snap->>'duplicate_group_id')::uuid,
      field_provenance = coalesce(snap->'field_provenance', '{}')
  where id = target_job_id and user_id = auth.uid();

  if found then
    select id into created_revision_id
    from public.job_revisions
    where job_id = target_job_id
      and user_id = auth.uid()
      and change_kind = 'restore'
      and device_id = target_device
    order by changed_at desc
    limit 1;
    update public.job_revisions
    set restored_from_revision_id = target_revision_id
    where id = created_revision_id;
  else
    insert into public.jobs
    select *
    from jsonb_populate_record(
      null::public.jobs,
      snap || jsonb_build_object(
        'id', target_job_id,
        'user_id', auth.uid(),
        'search_document', ''
      )
    );
    insert into public.job_revisions(user_id, job_id, snapshot, device_id, change_kind, restored_from_revision_id)
    values (auth.uid(), target_job_id, snap, target_device, 'restore', target_revision_id);
  end if;
end;
$$;

create or replace function public.delete_job(target_job_id uuid, target_device uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('app.device_id', target_device::text, true);
  perform set_config('app.change_kind', 'delete', true);
  delete from public.jobs where id = target_job_id and user_id = auth.uid();
  if not found then raise exception 'job not found'; end if;
end;
$$;

grant execute on function public.update_job_tracking(uuid, public.application_status, text, timestamptz, uuid) to authenticated;
grant execute on function public.restore_job_revision(uuid, uuid, uuid) to authenticated;
grant execute on function public.delete_job(uuid, uuid) to authenticated;