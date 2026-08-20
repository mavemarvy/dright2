/*
# Create users table (promoter profiles)

1. Purpose
- Stores profile information for each promoter including their email, phone, full name, and payout account number.
- Links to Supabase auth.users via the id field.

2. New Tables
- `users`
  - `id` (uuid, primary key, references auth.users)
  - `email` (text, not null)
  - `phone` (text, nullable)
  - `full_name` (text, nullable)
  - `account_number` (text, nullable) - for receiving payouts
  - `role` (text, default 'promoter')
  - `created_at` (timestamptz, default now())

3. Security (RLS)
- Enable RLS on users table.
- Each user can only read and update their own profile row.
- Uses auth.uid() for ownership checks.

4. Notes
- The id defaults to auth.uid() so inserts from authenticated users automatically get their id.
- Email matches the email from auth.users for convenience but is managed separately.
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  phone text,
  full_name text,
  account_number text,
  role text NOT NULL DEFAULT 'promoter',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON users;
CREATE POLICY "Users can read own profile"
ON users FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile"
ON users FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
