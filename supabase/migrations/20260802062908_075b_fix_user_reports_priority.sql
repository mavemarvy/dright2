-- Fix: remove priority from index and column constraint to avoid conflicts
-- The user_reports table already has priority column from this migration, but the error suggests partial application
-- Let's check and add only what's missing

-- First, add priority column if it doesn't exist (in case table was created without it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reports' AND column_name = 'priority') THEN
    ALTER TABLE user_reports ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent'));
  END IF;
END $$;

-- Create the index that failed
CREATE INDEX IF NOT EXISTS idx_reports_status ON user_reports(status, priority);
