-- Multi-org support: scope grants to an organization.
-- Safe to run multiple times.

-- 1. org_id column (nullable; existing rows stay null until backfilled)
ALTER TABLE grants ADD COLUMN IF NOT EXISTS org_id UUID;

-- 2. Foreign key to organizations (ADD CONSTRAINT has no IF NOT EXISTS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grants_org_id_fkey') THEN
    ALTER TABLE grants ADD CONSTRAINT grants_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Index on org_id for per-org query performance
CREATE INDEX IF NOT EXISTS grants_org_id_idx ON grants (org_id);

-- 4. Per-org URL uniqueness: drop the global unique on url, add composite
--    unique(org_id, url) so different orgs can each track the same grant URL.
ALTER TABLE grants DROP CONSTRAINT IF EXISTS grants_url_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grants_org_id_url_key') THEN
    ALTER TABLE grants ADD CONSTRAINT grants_org_id_url_key UNIQUE (org_id, url);
  END IF;
END $$;

-- 5. OPTIONAL one-time backfill: assign existing (WFAF) grants to the WFAF org.
--    Run after WFAF exists in organizations; replace the UUID below.
-- UPDATE grants SET org_id = '00000000-0000-0000-0000-000000000000'
--   WHERE org_id IS NULL;
