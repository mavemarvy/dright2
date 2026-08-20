/*
# Notification Event Engine — Event Log Table

## Summary
Creates a unified `notification_event_log` table that serves as the central event bus
for the DRIGHT notification system. All modules publish events here; the notification
engine reads from this table to generate user-facing notifications with smart routing,
deduplication, throttling, and auto-expiration.

## New Tables
- `notification_event_log` — Raw event stream from all modules
  - `id` uuid PK
  - `event_type` text — e.g. 'marketplace.product_purchased'
  - `module` text — e.g. 'marketplace', 'services', 'jobs', 'wallet'
  - `actor_id` uuid — who triggered the event (nullable for system events)
  - `recipient_ids` uuid[] — who should receive the notification
  - `priority` text — 'critical' | 'high' | 'normal' | 'low'
  - `category` text — notification category for filtering
  - `group_key` text — for deduplication/grouping similar events
  - `metadata` jsonb — rich payload (product image, price, etc.)
  - `expires_at` timestamptz — auto-expiration (nullable for permanent)
  - `processed` boolean — whether the notification engine has processed this event
  - `created_at` timestamptz

## Security
- RLS enabled
- Users can read their own events (where they are in recipient_ids)
- Only service role (edge functions) and authenticated users can insert
- Users can update processed status for their own events

## Indexes
- (processed, created_at) for the engine's unprocessed event queue
- (module, event_type, created_at) for module-specific queries
- (group_key, created_at) for deduplication lookups
- (actor_id, created_at) for activity feed
*/

CREATE TABLE IF NOT EXISTS notification_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  module text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_ids uuid[] NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'normal',
  category text NOT NULL DEFAULT 'system',
  group_key text,
  metadata jsonb,
  expires_at timestamptz,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_event_log ENABLE ROW LEVEL SECURITY;

-- Users can read events where they are a recipient
DROP POLICY IF EXISTS "select_own_events" ON notification_event_log;
CREATE POLICY "select_own_events"
  ON notification_event_log FOR SELECT
  TO authenticated
  USING (recipient_ids @> ARRAY[auth.uid()]);

-- Authenticated users can insert events (for client-side event emission)
DROP POLICY IF EXISTS "insert_events" ON notification_event_log;
CREATE POLICY "insert_events"
  ON notification_event_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update processed status for events targeting them
DROP POLICY IF EXISTS "update_own_events" ON notification_event_log;
CREATE POLICY "update_own_events"
  ON notification_event_log FOR UPDATE
  TO authenticated
  USING (recipient_ids @> ARRAY[auth.uid()]);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_log_unprocessed
  ON notification_event_log(processed, created_at);

CREATE INDEX IF NOT EXISTS idx_event_log_module_type
  ON notification_event_log(module, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_log_group
  ON notification_event_log(group_key, created_at DESC)
  WHERE group_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_log_actor
  ON notification_event_log(actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- Enable realtime
ALTER TABLE notification_event_log REPLICA IDENTITY FULL;
