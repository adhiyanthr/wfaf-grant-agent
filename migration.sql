-- Migration: add columns expected by application code (safe to run multiple times)

-- Columns written by the intake form insert into the organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS focus_areas TEXT[];
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS county TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_501c3 BOOLEAN;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS annual_budget TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS grant_size_pref TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS what_we_do TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS target_population TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- Columns from recent changes
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ DEFAULT now();
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS last_sent TIMESTAMPTZ;
