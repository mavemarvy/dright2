/*
# Add processed_at column to paystack_transactions

1. Modified Tables
- `paystack_transactions`: Added `processed_at` (timestamptz, nullable) column to track when payment processing completed.
2. Notes
- This enables precise idempotency tracking: a row with `processed_at IS NOT NULL` has been fully processed.
- Non-destructive: nullable column, existing rows remain valid.
*/

ALTER TABLE paystack_transactions
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;
