grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.jobs enable row level security;
alter table public.job_sources enable row level security;
alter table public.source_checks enable row level security;
alter table public.duplicate_groups enable row level security;
alter table public.duplicate_pairs enable row level security;
alter table public.job_revisions enable row level security;

create policy jobs_owner_all on public.jobs for all using (auth.uid() is not null and auth.uid() = user_id) with check (auth.uid() is not null and auth.uid() = user_id);
create policy job_sources_owner_all on public.job_sources for all using (auth.uid() is not null and auth.uid() = user_id) with check (auth.uid() is not null and auth.uid() = user_id);
create policy duplicate_groups_owner_all on public.duplicate_groups for all using (auth.uid() is not null and auth.uid() = user_id) with check (auth.uid() is not null and auth.uid() = user_id);
create policy duplicate_pairs_owner_all on public.duplicate_pairs for all using (auth.uid() is not null and auth.uid() = user_id) with check (auth.uid() is not null and auth.uid() = user_id);
create policy source_checks_owner_select on public.source_checks for select using (auth.uid() is not null and auth.uid() = user_id);
create policy source_checks_owner_insert on public.source_checks for insert with check (auth.uid() is not null and auth.uid() = user_id);
create policy job_revisions_owner_select on public.job_revisions for select using (auth.uid() is not null and auth.uid() = user_id);
