-- migrations/grants_url_unique.sql
--
-- Run this MANUALLY in the Supabase SQL editor. Idempotent.
--
-- schema.sql declares `grants.url` as `unique`, but some deployments' grants
-- table was created without the UNIQUE constraint (only a plain index). The
-- agent upserts grants with `onConflict: 'url'` (src/db.js saveOrgGrants), which
-- requires a real UNIQUE constraint/index on url, otherwise inserts fail with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- This adds the constraint, de-duplicating any pre-existing repeated urls first
-- (keeping the earliest row per url). org_grants references grants(id) ON DELETE
-- CASCADE, so on a populated catalog run this only AFTER confirming the dedupe
-- set is genuinely redundant.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.grants'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.grants'::regclass and attname = 'url')
      ]
  ) then
    -- Collapse duplicate urls to a single row before enforcing uniqueness.
    delete from grants a using grants b
    where a.url = b.url and a.ctid > b.ctid;

    alter table grants add constraint grants_url_key unique (url);
  end if;
end $$;
