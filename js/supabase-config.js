// Get config from: Supabase Dashboard > Project > Settings > API

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ⬇️ Your Supabase project config ⬇️
const SUPABASE_URL = "https://zwjudtuajqnlmmedznvt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3anVkdHVhanFubG1tZWR6bnZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjAwMjgsImV4cCI6MjA5NTYzNjAyOH0.LiAXKTOy7MqHYyKHyhDTXrI4JbhSxN7GRFjo4EuNMEI";

let supabase = null;

try {
  // FIX: Previously the condition compared the real values against themselves,
  // which always evaluated to false, keeping supabase null. Now we check for
  // generic placeholder strings so real credentials are always accepted.
  const isPlaceholder =
    SUPABASE_URL === "YOUR_SUPABASE_URL" ||
    SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY" ||
    !SUPABASE_URL.startsWith("https://") ||
    SUPABASE_ANON_KEY.length < 20;

  if (!isPlaceholder) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("✅ Supabase initialized successfully");
  } else {
    console.warn("⚠️ Supabase config not set — running in demo mode. Edit js/supabase-config.js with your keys.");
  }
} catch (error) {
  console.warn("⚠️ Supabase init failed — running in demo mode:", error.message);
}

export { supabase };