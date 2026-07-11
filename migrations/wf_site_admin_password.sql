-- Site + admin passwords for the Wagner Farm dashboard (and app/ SPA gate).
-- Run manually in the Supabase SQL editor (project ujixxuvfpuykcmzcebmg).
--
-- Idempotent: safe to run whether or not migrations/platform_v1.sql (§8) has
-- been applied. Creates the app_settings key/value store if missing, then:
--   * site_password_hash  — SHA-256 of the shared site password. UPSERTED
--     (overwrites platform_v1's 'changeme' seed). This is a SOFT gate checked
--     in the browser; we store only the hash, never the plaintext.
--   * admin_password_hash — SHA-256 of the WFAF admin password gating the
--     dashboard Admin area (verified server-side by dashboard-view). Inserted
--     with ON CONFLICT DO NOTHING so re-running this file never clobbers a
--     password WFAF has already changed.
--
-- Current seeds (hand these to WFAF; the Admin page tells them to change both):
--   site password:  98wagner12farm-agent19
--   admin password: wfaf-admin-2026

create table if not exists app_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz default now()
);

alter table app_settings enable row level security;

-- Anyone (even pre-login) can READ settings so the browser gate can verify the
-- site-password hash. The admin hash is therefore also readable — acceptable
-- for this soft-gate model because admin ACTIONS are verified server-side by
-- dashboard-view against this same hash; reading it only enables an offline
-- guess at the password, same exposure as the site gate.
drop policy if exists "anyone can read app_settings" on app_settings;
create policy "anyone can read app_settings"
  on app_settings for select to anon, authenticated using (true);

drop policy if exists "authenticated can insert app_settings" on app_settings;
create policy "authenticated can insert app_settings"
  on app_settings for insert to authenticated with check (true);

drop policy if exists "authenticated can update app_settings" on app_settings;
create policy "authenticated can update app_settings"
  on app_settings for update to authenticated using (true) with check (true);

-- sha256('98wagner12farm-agent19')
insert into app_settings (key, value)
  values ('site_password_hash',
          '342ae0819cfc966724f7cb78fc5fa1166c094bddfa69394c6697ab2093f27f05')
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

-- sha256('wfaf-admin-2026') — never overwritten on re-run (see header).
insert into app_settings (key, value)
  values ('admin_password_hash',
          '72606aa78bf24f62c50b9af9c5ab5674fb2911c5c7120b8cc36a98f3a1071b1f')
  on conflict (key) do nothing;
