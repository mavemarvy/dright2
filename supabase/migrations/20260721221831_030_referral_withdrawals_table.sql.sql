/*
# Referral Withdrawals Table

Stores withdrawal requests for referral earnings. Supports Paystack, Bank, and Crypto payout methods.

## 1. New Table
### referral_withdrawals
- `id` (uuid PK)
- `user_id` (uuid, FK auth.users) — the referrer requesting withdrawal
- `amount` (numeric 12,2) — withdrawal amount in USD
- `method` (text) — 'paystack' | 'bank' | 'crypto'
- `status` (text: 'pending' | 'approved' | 'rejected' | 'paid', default 'pending')
- `created_at` (timestamptz default now())

## 2. Security (RLS)
- SELECT: user reads own withdrawals
- INSERT: authenticated inserts own
- UPDATE: admin-only (handled via admin policies)
*/

CREATE TABLE IF NOT EXISTS referral_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  method text NOT NULL CHECK (method IN ('paystack','bank','crypto')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_refwd_user ON referral_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_refwd_status ON referral_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_refwd_created ON referral_withdrawals(created_at);

DROP POLICY IF EXISTS "refwd_select_own" ON referral_withdrawals;
CREATE POLICY "refwd_select_own" ON referral_withdrawals FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "refwd_insert_own" ON referral_withdrawals;
CREATE POLICY "refwd_insert_own" ON referral_withdrawals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
