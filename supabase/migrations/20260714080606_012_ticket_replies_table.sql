/*
# Create ticket_replies table for support ticket conversations

1. New Tables
- `ticket_replies` — stores individual reply messages within a support ticket thread
  - `id` (uuid, PK)
  - `ticket_id` (uuid, FK to support_tickets)
  - `author_id` (uuid, FK to users)
  - `author_role` (text: 'user' or 'admin')
  - `message` (text)
  - `created_at` (timestamptz)

2. Security
- RLS enabled on `ticket_replies`.
- Users can read replies for their own tickets.
- Admins can read all replies.
- Authenticated users can insert replies (user for own ticket, admin for any).
*/

CREATE TABLE IF NOT EXISTS ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role text NOT NULL DEFAULT 'user' CHECK (author_role = ANY (ARRAY['user', 'admin'])),
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own ticket replies" ON ticket_replies;
CREATE POLICY "Users read own ticket replies" ON ticket_replies FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_replies.ticket_id
      AND (support_tickets.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true
      ))
    )
  );

DROP POLICY IF EXISTS "Users insert own ticket replies" ON ticket_replies;
CREATE POLICY "Users insert own ticket replies" ON ticket_replies FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_replies.ticket_id
      AND (support_tickets.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true
      ))
    )
  );

CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket_id ON ticket_replies(ticket_id);
