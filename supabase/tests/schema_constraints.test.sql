begin;
select plan(8);

select col_is_pk('public', 'jobs', 'id', 'jobs id is primary key');
select col_not_null('public', 'jobs', 'user_id', 'jobs require owner');
select col_not_null('public', 'jobs', 'field_provenance', 'jobs require provenance');
select col_not_null('public', 'job_sources', 'original_url', 'sources require URL');
select has_index('public', 'job_sources', 'job_sources_user_normalized_url_key', 'canonical URLs are unique per user');
select has_check('public', 'jobs', 'jobs validate bounded fields');
select has_check('public', 'job_sources', 'sources validate HTTPS URLs');
select has_check('public', 'duplicate_pairs', 'duplicate pairs cannot self-reference');

select * from finish();
rollback;
