/*
# Notification Center 2.0 — Extend notifications table

## Summary
Upgrades the existing `notifications` table to support the full Notification Center:
- Categories (marketplace, services, jobs, orders, wallet, affiliate, referrals,
  store, followers, reviews, security, promotions, admin, system, ai, messages)
- Priority levels (critical, high, normal, low)
- Archive / soft-delete / restore
- Rich metadata (JSONB) for rich notification cards (product image, price, etc.)
- Grouping key for collapsing similar notifications
- Actor reference for "who triggered this"
- Read timestamp for analytics

## Changes to `notifications` table (additive only — no data loss)
- `category` text NOT NULL DEFAULT 'system'
- `priority` text NOT NULL DEFAULT 'normal'
- `is_archived` boolean NOT NULL DEFAULT false
- `is_deleted` boolean NOT NULL DEFAULT false (soft delete)
- `metadata` jsonb (nullable) — rich card data
- `group_key` text (nullable) — grouping similar notifications
- `actor_id` uuid (nullable) — who triggered the notification
- `read_at` timestamptz (nullable) — when the user read it

## RLS
- Existing policies already scope by user_id = auth.uid().
- No policy changes needed — all new columns are user-scoped.

## Indexes
- composite (user_id, is_archived, is_deleted, created_at DESC) for the main feed query
- (user_id, category, is_read) for category tab unread counts
- (user_id, group_key) for grouping queries
*/

-- Add new columns (idempotent)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system';
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS group_key text;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_notif_feed
  ON notifications(user_id, is_archived, is_deleted, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_category_unread
  ON notifications(user_id, category, is_read)
  WHERE is_deleted = false AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_notif_group
  ON notifications(user_id, group_key, created_at DESC)
  WHERE group_key IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_notif_priority
  ON notifications(user_id, priority, created_at DESC)
  WHERE is_deleted = false AND is_archived = false;

-- Enable realtime on notifications (for the notification center page)
ALTER TABLE notifications REPLICA IDENTITY FULL;
