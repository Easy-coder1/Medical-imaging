// ===== ScanFlow AI — AI Configuration (via Backend Proxy) =====
// IMPORTANT: The API key is stored server-side in the .env file.
// This file calls our backend proxy at /api/analyze, which keeps
// the API key secure and prevents unauthorized usage.
//
// To set up:
// 1. Ensure OPENAI_API_KEY is set in your .env file
// 2. Run: npm install && npm start
// 3. Open http://localhost:3000 in your browser

// The backend proxy URL (same origin when served by server.js)
const PROXY_API_URL = '/api/analyze';

// FIX: Previously hardcoded to return true, meaning real API calls were always
// attempted even when the backend server wasn't running. Now does a real check.
async function isAIConfigured() {
  return await checkAIServerStatus();
}

async function checkAIServerStatus() {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return false;
    const data = await response.json();
    return data.aiConfigured === true;
  } catch {
    // Server not reachable — likely opened as file:// instead of via npm start
    return false;
  }
}

async function analyzeImageWithAI(base64ImageData, mimeType, scanType, patientName) {
  let response;
  try {
    response = await fetch(PROXY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64ImageData, mimeType, scanType, patientName }),
      signal: AbortSignal.timeout(60000) // 60s timeout for large images
    });
  } catch (networkErr) {
    // fetch() itself threw — server is not running
    throw new Error(
      'AI_NOT_CONFIGURED: Cannot reach the backend server. Make sure you ran "npm start" and are visiting http://localhost:3000'
    );
  }

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.error || `Server error: ${response.status}`;
    throw new Error(errorMsg);
  }

  // The proxy returns the result in the same format as before
  return data;
}

async function sendChatMessage(query, context) {
  const serverReady = await checkAIServerStatus();
  if (!serverReady) {
    throw new Error('AI_NOT_CONFIGURED: Cannot reach the backend server.');
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, context }),
    signal: AbortSignal.timeout(15000)
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.error || `Server error: ${response.status}`;
    throw new Error(errorMsg);
  }

  return data.reply;
}

export { isAIConfigured, analyzeImageWithAI, sendChatMessage };