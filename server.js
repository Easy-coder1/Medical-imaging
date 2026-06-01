// ===== ScanFlow AI — Backend Proxy Server (OPTIONAL) =====
// This server provides AI analysis via Gemini API.
// The app works fully in demo mode without this server.
// To use AI features, set up .env and run: npm start

try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available - running without it
}

let express, cors;

try {
  express = require('express');
  cors = require('cors');
} catch (e) {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║       ScanFlow AI — No node_modules found   ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log('  ║  The app works in demo mode! Open any HTML   ║');
  console.log('  ║  file directly in your browser.              ║');
  console.log('  ║                                              ║');
  console.log('  ║  For AI features, run: npm install && npm start║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  process.exit(0);
}

const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Note: Vercel free/pro tier enforces a strict 4.5MB payload limit.
// Client-side resizing in upload.js ensures payloads stay within this limit.
app.use(express.json({ limit: '15mb' }));

// Serve static frontend files from the project root
app.use(express.static(path.join(__dirname)));

// Gemini API key — loaded from env, NEVER exposed to the browser
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

// ---------- Health Check ----------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    aiConfigured: !!(GEMINI_API_KEY && GEMINI_API_KEY.length > 10),
    model: GEMINI_MODEL
  });
});

// ---------- SMS: Send a Real SMS via Arkesel ----------
// Uses the Arkesel SMS API with GET request + query parameters.
// Endpoint: https://sms.arkesel.com/sms/api?action=send-sms&api_key=KEY&to=PHONE&from=SENDER&sms=MESSAGE
app.post('/api/send-sms', async (req, res) => {
  const ARKESEL_API_KEY = process.env.ARKESEL_API_KEY;

  if (!ARKESEL_API_KEY) {
    console.error('[SMS] ARKESEL_API_KEY is not configured on server.');
    return res.status(500).json({
      error: 'ARKESEL_API_KEY not configured. Set ARKESEL_API_KEY in your .env file to send real SMS messages.'
    });
  }

  const { phone, message } = req.body;

  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'Missing required field: phone' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Missing required field: message' });
  }

  // Normalize phone: remove '+', spaces, dashes
  const formattedPhone = phone.replace(/[\s\-\+\(\)]/g, '');
  if (formattedPhone.length < 10) {
    return res.status(400).json({ error: `Invalid phone number: "${phone}". Must include country code (e.g. +233XXXXXXXXX).` });
  }

  try {
    console.log(`[SMS] Sending real SMS to ${formattedPhone} via Arkesel...`);

    // Arkesel API uses GET with query parameters
    const apiUrl = `https://sms.arkesel.com/sms/api?action=send-sms&api_key=${encodeURIComponent(ARKESEL_API_KEY)}&to=${encodeURIComponent(formattedPhone)}&from=${encodeURIComponent('ScanFlow')}&sms=${encodeURIComponent(message)}`;

    console.log(`[SMS] Arkesel URL (key hidden): https://sms.arkesel.com/sms/api?action=send-sms&api_key=***&to=${formattedPhone}&from=ScanFlow&sms=${message.substring(0, 30).replace(/[^a-zA-Z0-9 ]/g, '')}...`);

    const response = await fetch(apiUrl, {
      method: 'GET'
    });

    // Read response body
    const text = await response.text();
    console.log(`[SMS] Arkesel raw response: ${text.substring(0, 200)}`);

    // Parse JSON if possible
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { raw: text };
    }

    if (!response.ok || (result && result.code && String(result.code).toLowerCase() !== 'ok' && String(result.code) !== '100')) {
      const errorDetail = result?.message || result?.error || `Arkesel API returned HTTP ${response.status}`;
      console.error(`[SMS] Arkesel error (${response.status}): ${errorDetail}`);
      return res.status(response.ok ? 400 : response.status).json({ error: errorDetail, detail: result });
    }

    console.log(`[SMS] ✓ Real SMS sent to ${formattedPhone}: "${message.substring(0, 60)}..."`);
    res.json({
      status: 'success',
      message: 'SMS sent successfully',
      provider: 'Arkesel',
      recipient: formattedPhone,
      result
    });

  } catch (err) {
    console.error('[SMS] Network/server error:', err.message);
    res.status(500).json({ error: 'SMS delivery failed: ' + err.message });
  }
});

// ---------- Proxy: Analyze Image via Gemini ----------
app.post('/api/analyze', async (req, res) => {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.length <= 10) {
    return res.status(500).json({ error: 'AI_NOT_CONFIGURED: No valid Gemini API key found on the server.' });
  }

  const { base64ImageData, mimeType, scanType, patientName } = req.body;

  if (!base64ImageData) {
    return res.status(400).json({ error: 'Missing image data in request body.' });
  }

  const prompt = `You are an expert medical imaging AI assistant powered by Gemini. Analyze this medical scan image carefully and provide a detailed clinical assessment.

Context provided by user:
- Scan type: ${scanType || 'Unknown'}
- Patient: ${patientName || 'Unknown'}

Analyze the image based on WHAT YOU ACTUALLY SEE in the image, not just the scan type label. Look for:
1. Anatomical structures visible in the image
2. Any abnormalities, lesions, fractures, masses, fluid collections, or other pathologies
3. Quality and completeness of the study
4. Comparison with expected normal anatomy for this type of scan

Rules:
- confidence must be an integer between 1 and 100
- urgency must be one of: Critical, Urgent, Moderate, Normal
- Base your analysis on ACTUAL IMAGE CONTENT, not assumptions from scan type
- If the image quality is poor, note that in findings and lower confidence accordingly
- If this does not appear to be a medical scan, still describe what you observe
- Be specific about what you see, not generic`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: base64ImageData
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          finding: { type: 'string' },
          details: { type: 'string' },
          urgency: { type: 'string', enum: ['Critical', 'Urgent', 'Moderate', 'Normal'] },
          confidence: { type: 'integer' },
          anatomical_region: { type: 'string' },
          recommendations: { type: 'string' }
        },
        required: ['finding', 'details', 'urgency', 'confidence', 'anatomical_region', 'recommendations']
      }
    }
  };

  try {
    console.log(`[analyze] Sending image to ${GEMINI_MODEL} for ${patientName || 'unknown patient'} (${scanType || 'unknown scan'})`);

    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(apiURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || errorData?.detail || `Gemini API error: ${response.status}`;
      console.error('[analyze] API error:', errorMsg);
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({ error: 'No response content from Gemini API' });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI response', raw: text.substring(0, 300) });
    }

    const result = {
      aiResult: parsed.finding || 'Analysis complete',
      details: parsed.details || '',
      urgency: parsed.urgency || 'Moderate',
      confidence: Math.min(100, Math.max(1, parseInt(parsed.confidence) || 50)),
      anatomicalRegion: parsed.anatomical_region || '',
      recommendations: parsed.recommendations || '',
      aiEngine: `Gemini Free (${GEMINI_MODEL})`,
      category: parsed.anatomical_region || scanType
    };

    console.log(`[analyze] Analysis complete — ${result.urgency} (${result.confidence}%)`);
    res.json(result);

  } catch (err) {
    console.error('[analyze] Server error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ---------- Proxy: General AI Chat / Search ----------
app.post('/api/chat', async (req, res) => {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.length <= 10) {
    return res.status(500).json({ error: 'AI_NOT_CONFIGURED: No valid Gemini API key found on the server.' });
  }

  const { query, context } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Missing query in request body.' });
  }

  let systemPrompt = 'You are a helpful medical AI assistant. Provide concise, accurate, and professional answers.';
  if (context && context.aiResult) {
    systemPrompt += `\nContext of current scan: ${context.scanType || 'Unknown'} for patient ${context.patientName || 'Unknown'}. Findings: ${context.aiResult}. Details: ${context.details || ''}`;
  }

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: query }]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      maxOutputTokens: 500,
      temperature: 0.5
    }
  };

  try {
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(apiURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || errorData?.detail || `Gemini API error: ${response.status}`;
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    res.json({ reply: text });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ---------- Fallback: serve index.html ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Start Server ----------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║       ScanFlow AI — Backend Proxy Server    ║');
    console.log('  ╠══════════════════════════════════════════════╣');
    console.log(`  ║  Server running at: http://localhost:${PORT}  ║`);
    console.log(`  ║  AI Model: ${GEMINI_MODEL.padEnd(29)}║`);
    console.log(`  ║  Gemini API: ${GEMINI_API_KEY ? 'Configured' : 'NOT SET (demo mode)'.padEnd(27)}║`);
    console.log(`  ║  Arkesel SMS: ${process.env.ARKESEL_API_KEY ? 'Configured' : 'NOT SET (demo mode)'.padEnd(25)}║`);
    console.log(`  ║  node_modules: ${typeof express !== 'undefined' ? 'OK' : 'MISSING'.padEnd(27)}║`);
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('  Open http://localhost:' + PORT + ' to use ScanFlow AI');
    console.log('  (or open any .html file directly in your browser for demo mode)');
    console.log('');
  });
}

module.exports = app;