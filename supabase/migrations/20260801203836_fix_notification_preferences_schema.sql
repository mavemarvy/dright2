-- Add missing columns to notification_preferences and add unique constraint on user_id
ALTER TABLE public.notification_preferences 
  ADD COLUMN IF NOT EXISTS quiet_hours_start text,
  ADD COLUMN IF NOT EXISTS quiet_hours_end text,
  ADD COLUMN IF NOT EXISTS quiet_hours_critical_bypass boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS category_toggles jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_channels jsonb DEFAULT '{"push":true,"email":true,"sms":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS reminder_frequency text DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS ai_summaries_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_summary_frequency text DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS reduced_motion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS high_contrast boolean DEFAULT false;

-- The table has multiple rows per user (one per notification_type). 
-- The code expects a single row per user. We need to consolidate.
-- First, create a new table for user-level prefs (one row per user)
CREATE TABLE IF NOT EXISTS public.notification_user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  quiet_hours_start text,
  quiet_hours_end text,
  quiet_hours_critical_bypass boolean DEFAULT true,
  category_toggles jsonb DEFAULT '{}'::jsonb,
  delivery_channels jsonb DEFAULT '{"push":true,"email":true,"sms":false}'::jsonb,
  reminder_frequency text DEFAULT 'daily',
  ai_summaries_enabled boolean DEFAULT true,
  ai_summary_frequency text DEFAULT 'daily',
  reduced_motion boolean DEFAULT false,
  high_contrast boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_user_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "select_own_settings" ON public.notification_user_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_settings" ON public.notification_user_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_settings" ON public.notification_user_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_settings" ON public.notification_user_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);