const SUPABASE_URL = "https://zwjudtuajqnlmmedznvt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3anVkdHVhanFubG1tZWR6bnZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjAwMjgsImV4cCI6MjA5NTYzNjAyOH0.LiAXKTOy7MqHYyKHyhDTXrI4JbhSxN7GRFjo4EuNMEI";

async function test() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scans?select=*`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
