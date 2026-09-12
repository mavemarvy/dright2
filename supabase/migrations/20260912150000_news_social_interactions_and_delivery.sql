-- DRIGHT News social interactions, moderation and explicit delivery controls
-- Forward-only production migration.

ALTER TABLE public.global_announcements
  ADD COLUMN IF NOT EXISTS show_in_notifications boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allowed_reactions text[] NOT NULL DEFAULT ARRAY['like','love','care','haha','wow','sad','angry']::text[];
