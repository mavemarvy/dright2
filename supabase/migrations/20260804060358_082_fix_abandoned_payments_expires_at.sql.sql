/*
# Fix abandoned_payments.expires_at column

## Overview
The `abandoned_payments` table was created without an `expires_at` column,
but the frontend code (`paymentPreferences.ts`) filters by `expires_at > now()`
to determine which abandoned payments are still recoverable.

## Changes
1. Add `expires_at` timestamptz column to `abandoned_payments` (nullable, defaults to created_at + 24h)
2. Backfill existing rows: set expires_at = created_at + 24 hours where null
3. Add index on (user_id, status, expires_at) for the recovery query
*/

ALTER TABLE abandoned_payments
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE abandoned_payments
  SET expires_at = created_at + interval '24 hours'
  WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_abandoned_payments_recovery
  ON abandoned_payments(user_id, status, expires_at DESC);
