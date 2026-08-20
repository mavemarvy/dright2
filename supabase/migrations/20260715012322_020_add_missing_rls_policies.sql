-- Add missing INSERT policy on notifications table
-- This allows the system (via service role or authenticated users) to insert notifications
CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add missing DELETE policy on notifications table
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add missing INSERT policy on product_edit_logs table
-- Only admins can insert edit logs (they approve/reject edits)
CREATE POLICY "product_edit_logs_insert_admin"
  ON product_edit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active'
    )
  );

-- Add missing INSERT policy on notifications for service role (used by edge functions / admin actions)
-- The service role bypasses RLS, but we also allow admins to insert notifications for other users
CREATE POLICY "Admins can insert notifications for users"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active'
    )
  );
