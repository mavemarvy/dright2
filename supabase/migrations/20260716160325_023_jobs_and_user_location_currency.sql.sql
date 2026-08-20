/*
# Jobs System + User Location & Currency

1. Purpose
- Adds location and preferred_currency columns to the users table for
  location-based marketplace filtering and multi-currency display.
- Creates a jobs table for posting job listings with comprehensive fields.
- Creates a job_applications table for free job applications.

2. Modified Table: users
- location (text) — user's location, required at signup, used for filtering
- preferred_currency (text) — ISO 4217 currency code, defaults to 'USD'
- location_verified (boolean) — whether the user has verified their location

3. New Table: jobs
- id (uuid PK)
- employer_id (uuid FK → users) — who posted the job
- title (text) — job title, minimum 10 chars (enforced in app)
- category (text) — job category (e.g., 'Advertising & Marketing')
- job_type (text) — Full-time / Part-time / Contract / Freelance
- work_setup (text) — Remote / On-site / Hybrid
- career_level (text) — Entry / Mid / Senior / Executive
- region (text) — job location/region, required
- min_experience (text) — minimum experience required
- application_deadline (date) — deadline for applications
- salary_min (integer) — salary range minimum
- salary_max (integer) — salary range maximum
- salary_currency (text) — ISO currency code for salary, default USD
- responsibilities (text[]) — key responsibilities (5-8 points)
- requirements (text[]) — requirements & skills
- min_qualification (text) — minimum qualification
- description (text) — detailed job description (150-300 words)
- company_name (text) — company information
- company_description (text) — optional company description
- application_instructions (text) — how to apply
- status (text) — 'active' / 'closed' / 'draft', default 'active'
- created_at (timestamptz)
- updated_at (timestamptz)

4. New Table: job_applications
- id (uuid PK)
- job_id (uuid FK → jobs, ON DELETE CASCADE)
- applicant_id (uuid FK → users) — who applied
- cover_letter (text) — applicant's cover letter
- applicant_location (text) — applicant's location at time of application
- applicant_phone (text) — contact phone
- applicant_email (text) — contact email
- status (text) — 'pending' / 'reviewed' / 'accepted' / 'rejected'
- created_at (timestamptz)

5. Security
- users: existing RLS covers the new columns (owner-scoped update).
- jobs: public SELECT (anon+authenticated) so visitors can browse;
  INSERT/UPDATE/DELETE restricted to authenticated owner.
- job_applications: SELECT restricted to the job owner or the applicant;
  INSERT restricted to authenticated users (owner-scoped);
  UPDATE/DELETE restricted to applicant.

6. Notes
- Salary ranges use 20,000 increments up to "Above 150,000" as per spec.
- Job applications are FREE for all job seekers.
- A unique constraint prevents duplicate applications per job+applicant.
*/

-- Add location and currency columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency text NOT NULL DEFAULT 'USD';
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_verified boolean NOT NULL DEFAULT false;

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Advertising & Marketing',
  job_type text NOT NULL DEFAULT 'Full-time',
  work_setup text NOT NULL DEFAULT 'Remote',
  career_level text NOT NULL DEFAULT 'Mid',
  region text NOT NULL,
  min_experience text,
  application_deadline date,
  salary_min integer NOT NULL DEFAULT 0,
  salary_max integer NOT NULL DEFAULT 0,
  salary_currency text NOT NULL DEFAULT 'USD',
  responsibilities text[] NOT NULL DEFAULT '{}',
  requirements text[] NOT NULL DEFAULT '{}',
  min_qualification text,
  description text NOT NULL,
  company_name text NOT NULL,
  company_description text,
  application_instructions text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Public can browse active jobs
DROP POLICY IF EXISTS "public_read_jobs" ON jobs;
CREATE POLICY "public_read_jobs"
  ON jobs FOR SELECT
  TO anon, authenticated USING (true);

-- Only the employer can insert their own job posts
DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs"
  ON jobs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = employer_id);

-- Only the employer can update/delete their own job posts
DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs"
  ON jobs FOR UPDATE
  TO authenticated USING (auth.uid() = employer_id) WITH CHECK (auth.uid() = employer_id);

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs"
  ON jobs FOR DELETE
  TO authenticated USING (auth.uid() = employer_id);

-- Index for common queries
CREATE INDEX IF NOT EXISTS jobs_status_created_idx ON jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_category_idx ON jobs (category);
CREATE INDEX IF NOT EXISTS jobs_employer_idx ON jobs (employer_id);

-- Job applications table
CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter text,
  applicant_location text,
  applicant_phone text,
  applicant_email text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, applicant_id)
);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- Job owner can see applications for their jobs; applicant can see their own
DROP POLICY IF EXISTS "read_job_applications" ON job_applications;
CREATE POLICY "read_job_applications"
  ON job_applications FOR SELECT
  TO authenticated USING (
    auth.uid() = applicant_id
    OR EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_applications.job_id AND jobs.employer_id = auth.uid())
  );

-- Any authenticated user can apply (applications are free)
DROP POLICY IF EXISTS "insert_job_applications" ON job_applications;
CREATE POLICY "insert_job_applications"
  ON job_applications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = applicant_id);

-- Applicant can update/delete their own application
DROP POLICY IF EXISTS "update_own_application" ON job_applications;
CREATE POLICY "update_own_application"
  ON job_applications FOR UPDATE
  TO authenticated USING (auth.uid() = applicant_id) WITH CHECK (auth.uid() = applicant_id);

DROP POLICY IF EXISTS "delete_own_application" ON job_applications;
CREATE POLICY "delete_own_application"
  ON job_applications FOR DELETE
  TO authenticated USING (auth.uid() = applicant_id);

CREATE INDEX IF NOT EXISTS job_applications_job_idx ON job_applications (job_id);
CREATE INDEX IF NOT EXISTS job_applications_applicant_idx ON job_applications (applicant_id);
