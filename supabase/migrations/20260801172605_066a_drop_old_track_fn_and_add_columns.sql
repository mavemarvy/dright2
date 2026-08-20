-- Drop old track_analytics_event with different signature
DROP FUNCTION IF EXISTS track_analytics_event(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN);

-- Add new columns to analytics_events
ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS device_type   TEXT DEFAULT 'desktop',
  ADD COLUMN IF NOT EXISTS os            TEXT,
  ADD COLUMN IF NOT EXISTS browser_name  TEXT,
  ADD COLUMN IF NOT EXISTS state         TEXT,
  ADD COLUMN IF NOT EXISTS language      TEXT,
  ADD COLUMN IF NOT EXISTS timezone      TEXT,
  ADD COLUMN IF NOT EXISTS session_duration INTEGER,
  ADD COLUMN IF NOT EXISTS is_bounce     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS keywords      TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_events_device ON analytics_events (device_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_os ON analytics_events (os);
CREATE INDEX IF NOT EXISTS idx_analytics_events_browser_name ON analytics_events (browser_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_country ON analytics_events (country);
CREATE INDEX IF NOT EXISTS idx_analytics_events_state ON analytics_events (state);
CREATE INDEX IF NOT EXISTS idx_analytics_events_city ON analytics_events (city);
CREATE INDEX IF NOT EXISTS idx_analytics_events_source ON analytics_events (source);
