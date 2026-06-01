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

-- 4. RLS Policies — Allow all operations for authenticated users
-- (For a prototype, we keep it simple. Tighten these for production.)

CREATE POLICY "Users can read all profiles"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Scans: anyone authenticated can read, insert, update
CREATE POLICY "Authenticated users can read scans"
  ON scans FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert scans"
  ON scans FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update scans"
  ON scans FOR UPDATE
  USING (true);

-- 5. Storage bucket for scan images
-- Run this separately in the Supabase Dashboard:
-- Go to Storage > New Bucket
-- Bucket name: scan-images
-- Make it PUBLIC (so images are viewable)
-- Or run this SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES ('scan-images', 'scan-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow authenticated uploads
CREATE POLICY "Anyone can upload scan images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'scan-images');

CREATE POLICY "Anyone can view scan images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'scan-images');

-- ============================================
-- Done! Your database is ready.
-- Now paste your Supabase URL and anon key
-- into js/supabase-config.js
-- ============================================