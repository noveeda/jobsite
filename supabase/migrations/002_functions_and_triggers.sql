create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_job_search_document()
returns trigger language plpgsql as $$
begin
  new.search_document = to_tsvector('simple', concat_ws(' ', new.title, new.company_name, new.role_name, array_to_string(new.locations, ' '), array_to_string(new.skills, ' ')));
  return new;
end;
$$;

create or replace function public.record_job_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_kind text := coalesce(nullif(current_setting('app.change_kind', true), ''), case when tg_op = 'DELETE' then 'delete' else 'update' end);
  requested_device uuid;
begin
  begin
    requested_device := nullif(current_setting('app.device_id', true), '')::uuid;
  exception when others then
    requested_device := gen_random_uuid();
  end;
  insert into public.job_revisions(user_id, job_id, snapshot, device_id, change_kind)
  values (old.user_id, old.id, to_jsonb(old) - 'search_document', coalesce(requested_device, gen_random_uuid()), requested_kind);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.assert_child_owner()
returns trigger language plpgsql as $$
declare parent_owner uuid;
begin
  if tg_table_name = 'job_sources' then
    select user_id into parent_owner from public.jobs where id = new.job_id;
  elsif tg_table_name = 'source_checks' then
    select user_id into parent_owner from public.job_sources where id = new.source_id;
  elsif tg_table_name = 'duplicate_pairs' then
    if not exists(select 1 from public.jobs where id = new.left_job_id and user_id = new.user_id)
       or not exists(select 1 from public.jobs where id = new.right_job_id and user_id = new.user_id) then
      raise exception 'Referenced jobs must belong to the current owner';
    end if;
    return new;
  end if;
  if parent_owner is null or parent_owner <> new.user_id then
    raise exception 'Referenced parent must belong to the current owner';
  end if;
  return new;
end;
$$;

create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();
create trigger jobs_search_document before insert or update of title, company_name, role_name, locations, skills on public.jobs for each row execute function public.set_job_search_document();
create trigger jobs_revision before update or delete on public.jobs for each row execute function public.record_job_revision();
create trigger duplicate_groups_updated_at before update on public.duplicate_groups for each row execute function public.set_updated_at();
create trigger job_sources_updated_at before update on public.job_sources for each row execute function public.set_updated_at();
create trigger duplicate_pairs_updated_at before update on public.duplicate_pairs for each row execute function public.set_updated_at();
create trigger job_sources_owner before insert or update on public.job_sources for each row execute function public.assert_child_owner();
create trigger source_checks_owner before insert or update on public.source_checks for each row execute function public.assert_child_owner();
create trigger duplicate_pairs_owner before insert or update on public.duplicate_pairs for each row execute function public.assert_child_owner();
