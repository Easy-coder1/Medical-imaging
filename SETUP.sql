-- ============================================
-- ScanFlow AI — Supabase Database Setup
-- ============================================
-- Run this SQL in your Supabase SQL Editor:
-- Supabase Dashboard > SQL Editor > New Query
-- ============================================

-- 1. Users table (stores user profiles)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Radiologist',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Scans table (stores uploaded scans + AI results)
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL,
  patient_number TEXT,
  patient_age INTEGER,
  patient_phone TEXT,
  patient_history TEXT,
  scan_type TEXT NOT NULL,
  image_url TEXT,
  ai_result TEXT,
  confidence INTEGER,
  urgency TEXT,
  priority_color TEXT DEFAULT 'green', -- red, orange, green (manual override by radiographer)
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES auth.users(id),
  sms_sent BOOLEAN DEFAULT FALSE,
  sms_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast ordering
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_urgency ON scans(urgency);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

-- 4. Grant permissions to authenticated users
-- These GRANT statements are required for Supabase to allow access
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.scans TO authenticated;

-- 5. RLS Policies — Allow all operations for authenticated and anon users
-- (For a prototype, we keep it simple. Tighten these for production.)

DROP POLICY IF EXISTS "Users can read all profiles" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Authenticated users can read scans" ON scans;
DROP POLICY IF EXISTS "Authenticated users can insert scans" ON scans;
DROP POLICY IF EXISTS "Authenticated users can update scans" ON scans;
DROP POLICY IF EXISTS "Authenticated users can delete scans" ON scans;
DROP POLICY IF EXISTS "Anon users can read scans" ON scans;
DROP POLICY IF EXISTS "Anon users can insert scans" ON scans;
DROP POLICY IF EXISTS "Anon users can update scans" ON scans;
DROP POLICY IF EXISTS "Anon users can delete scans" ON scans;

CREATE POLICY "Users can read all profiles"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Scans: authenticated users can read, insert, update, delete
CREATE POLICY "Authenticated users can read scans"
  ON scans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert scans"
  ON scans FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update scans"
  ON scans FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete scans"
  ON scans FOR DELETE
  TO authenticated
  USING (true);

-- Scans: anon (demo) users can also read, insert, update, delete
CREATE POLICY "Anon users can read scans"
  ON scans FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon users can insert scans"
  ON scans FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon users can update scans"
  ON scans FOR UPDATE
  TO anon
  USING (true);

CREATE POLICY "Anon users can delete scans"
  ON scans FOR DELETE
  TO anon
  USING (true);

-- Also grant anon role permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON public.scans TO anon;

-- ============================================
-- 6. ENABLE REALTIME — REQUIRED for live updates!
-- ============================================
-- The scans table must be added to the supabase_realtime publication
-- so that the frontend can subscribe to INSERT/UPDATE/DELETE events.
-- This is what makes the radiologist's page update automatically
-- when a radiographer uploads a new scan (no refresh needed).

-- Drop the table from the publication first (safe to run multiple times)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.scans;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore errors (e.g. table not in publication yet)
    NULL;
  END;
END$$;

-- Add the scans table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;

-- Verify the publication includes the scans table
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public';

-- ============================================
-- 7. Storage bucket for scan images
-- ============================================
-- Create a PUBLIC storage bucket called "scan-images" so uploaded
-- images can be viewed directly in the browser.
INSERT INTO storage.buckets (id, name, public)
VALUES ('scan-images', 'scan-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow uploads and public viewing
DROP POLICY IF EXISTS "Allow authenticated upload scan images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload scan images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public view scan images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete scan images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete scan images" ON storage.objects;

CREATE POLICY "Allow authenticated upload scan images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'scan-images');

CREATE POLICY "Allow anon upload scan images"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'scan-images');

CREATE POLICY "Allow public view scan images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'scan-images');

CREATE POLICY "Allow authenticated delete scan images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'scan-images');

CREATE POLICY "Allow anon delete scan images"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'scan-images');

-- ============================================
-- 8. Optional: enable Realtime for the users table too
-- ============================================
-- (handy if you want to broadcast when a new user signs up)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.users;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END$$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;

-- ============================================
-- Done! Your database is ready.
-- Now paste your Supabase URL and anon key
-- into js/supabase-config.js
-- ============================================
