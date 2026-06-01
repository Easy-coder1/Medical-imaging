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
DROP POLICY IF EXISTS "Anon users can read scans" ON scans;
DROP POLICY IF EXISTS "Anon users can insert scans" ON scans;
DROP POLICY IF EXISTS "Anon users can update scans" ON scans;

CREATE POLICY "Users can read all profiles"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Scans: authenticated users can read, insert, update
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

-- Scans: anon (demo) users can also read, insert, update
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

-- Also grant anon role permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON public.scans TO anon;

-- 6. Storage bucket for scan images
-- Run this separately in the Supabase Dashboard:
-- Go to Storage > New Bucket
-- Bucket name: scan-images
-- Make it PUBLIC (so images are viewable)
-- Or run this SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES ('scan-images', 'scan-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow authenticated and anon uploads, and public viewing
DROP POLICY IF EXISTS "Allow authenticated upload scan images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload scan images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public view scan images" ON storage.objects;

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

-- ============================================
-- Done! Your database is ready.
-- Now paste your Supabase URL and anon key
-- into js/supabase-config.js
-- ============================================