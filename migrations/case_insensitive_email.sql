-- The existing unique constraint (organizations_email_key) is case-sensitive,
-- so "Jane@Org.com" and "jane@org.com" could both sign up as separate orgs —
-- duplicate weekly digests, and confusing to the org itself. Supabase Auth
-- also normalizes magic-link emails to lowercase, so a mixed-case org row
-- couldn't be matched back to its session on login. Normalize stored emails
-- and enforce uniqueness case-insensitively going forward.
--
-- Safe to run: verified no case-variant duplicate emails exist in production
-- as of 2026-07-02 (grouped lower(trim(email)) has zero groups with count > 1).

update organizations set email = lower(trim(email)) where email is not null;

alter table organizations drop constraint if exists organizations_email_key;

create unique index if not exists organizations_email_lower_idx
  on organizations (lower(email));
