alter table public.jobs replica identity full;
alter table public.job_sources replica identity full;
alter table public.duplicate_pairs replica identity full;
alter table public.job_revisions replica identity full;
alter publication supabase_realtime add table public.jobs, public.job_sources, public.duplicate_pairs, public.job_revisions;
