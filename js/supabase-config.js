// Get config from: Supabase Dashboard > Project > Settings > API

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Your Supabase project config
const SUPABASE_URL = "https://zwjudtuajqnlmmedznvt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3anVkdHVhanFubG1tZWR6bnZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjAwMjgsImV4cCI6MjA5NTYzNjAyOH0.LiAXKTOy7MqHYyKHyhDTXrI4JbhSxN7GRFjo4EuNMEI";

let supabase = null;

try {
  const isPlaceholder =
    SUPABASE_URL === "YOUR_SUPABASE_URL" ||
    SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY" ||
    !SUPABASE_URL.startsWith("https://") ||
    SUPABASE_ANON_KEY.length < 20;

  if (!isPlaceholder) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase initialized successfully");
  } else {
    console.warn("Supabase config not set — running in demo mode.");
  }
} catch (error) {
  console.warn("Supabase init failed — running in demo mode:", error.message);
}

// ---------- Seed demo data for first-time users ----------
const SEED_KEY = '_scanflow_seeded_v2';

export function seedDemoDataIfNeeded() {
  if (localStorage.getItem(SEED_KEY)) return; // Already seeded

  const existingScans = (() => {
    try { return JSON.parse(localStorage.getItem('demoScans') || '[]'); } catch { return []; }
  })();
  if (existingScans.length > 0) {
    // Already has scans, just mark seeded
    localStorage.setItem(SEED_KEY, 'true');
    return;
  }

  const now = Date.now();
  const demoScans = [
    {
      id: 'seed_1',
      patient_name: 'Sarah Johnson',
      patient_number: 'P-1001',
      patient_age: 45,
      patient_phone: '+233501234567',
      scan_type: 'CT Brain',
      image_url: 'demo-image-url',
      priority_color: 'red',
      urgency: 'Critical',
      ai_result: 'Intracranial Hemorrhage — Subdural Hematoma',
      ai_engine: 'Simulated (Demo)',
      confidence: 96,
      status: 'pending',
      sms_sent: false,
      created_at: new Date(now - 600000).toISOString() // 10 min ago
    },
    {
      id: 'seed_2',
      patient_name: 'James Wilson',
      patient_number: 'P-1002',
      patient_age: 62,
      patient_phone: '+233502345678',
      scan_type: 'X-Ray Chest',
      image_url: 'demo-image-url',
      priority_color: 'green',
      urgency: 'Normal',
      ai_result: 'No Acute Findings',
      ai_engine: 'Simulated (Demo)',
      confidence: 8,
      status: 'completed',
      sms_sent: true,
      created_at: new Date(now - 3600000).toISOString() // 1 hour ago
    },
    {
      id: 'seed_3',
      patient_name: 'Maria Garcia',
      patient_number: 'P-1003',
      patient_age: 55,
      patient_phone: '+233503456789',
      scan_type: 'CT Angiography',
      image_url: 'demo-image-url',
      priority_color: 'red',
      urgency: 'Critical',
      ai_result: 'Pulmonary Embolism Detected',
      ai_engine: 'Simulated (Demo)',
      confidence: 89,
      status: 'pending',
      sms_sent: false,
      created_at: new Date(now - 1800000).toISOString() // 30 min ago
    },
    {
      id: 'seed_4',
      patient_name: 'Robert Chen',
      patient_number: 'P-1004',
      patient_age: 38,
      patient_phone: '+233504567890',
      scan_type: 'CT Abdomen',
      image_url: 'demo-image-url',
      priority_color: 'orange',
      urgency: 'Urgent',
      ai_result: 'Free Air — Possible Bowel Perforation',
      ai_engine: 'Simulated (Demo)',
      confidence: 82,
      status: 'pending',
      sms_sent: false,
      created_at: new Date(now - 7200000).toISOString() // 2 hours ago
    },
    {
      id: 'seed_5',
      patient_name: 'Emma Davis',
      patient_number: 'P-1005',
      patient_age: 29,
      patient_phone: '+233505678901',
      scan_type: 'MRI Brain',
      image_url: 'demo-image-url',
      priority_color: 'green',
      urgency: 'Normal',
      ai_result: 'No Significant Abnormality',
      ai_engine: 'Simulated (Demo)',
      confidence: 11,
      status: 'pending',
      sms_sent: false,
      created_at: new Date(now - 14400000).toISOString() // 4 hours ago
    },
    {
      id: 'seed_6',
      patient_name: 'Ahmed Hassan',
      patient_number: 'P-1006',
      patient_age: 50,
      patient_phone: '+233506789012',
      scan_type: 'CT Brain',
      image_url: 'demo-image-url',
      priority_color: 'red',
      urgency: 'Critical',
      ai_result: 'Intracranial Hemorrhage — Epidural Hematoma',
      ai_engine: 'Simulated (Demo)',
      confidence: 93,
      status: 'pending',
      sms_sent: false,
      created_at: new Date(now - 600000).toISOString() // 10 min ago
    }
  ];

  try {
    localStorage.setItem('demoScans', JSON.stringify(demoScans));
    localStorage.setItem(SEED_KEY, 'true');
    console.log('Demo scan data seeded successfully');
  } catch (e) {
    console.warn('Failed to seed demo data:', e.message);
  }
}

// Auto-seed on import
seedDemoDataIfNeeded();

export { supabase };