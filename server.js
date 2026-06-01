// ===== ScanFlow AI — Backend Proxy Server =====
// This server keeps your OpenAI API key secure (server-side only).
// The frontend sends image data to this server, which forwards the request to OpenAI.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' })); // Allow large image payloads

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

// ---------- SMS: Send via Arkesel ----------
app.post('/api/send-sms', async (req, res) => {
  const ARKESEL_API_KEY = process.env.ARKESEL_API_KEY;

  if (!ARKESEL_API_KEY) {
    return res.status(500).json({ error: 'ARKESEL_API_KEY not configured on server' });
  }

  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Missing phone number or message' });
  }

  try {
    // Format phone number (remove + if present for Arkesel)
    const formattedPhone = phone.replace('+', '');

    const response = await fetch('https://api.arkesel.com/sms/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Arkesel-API-Key': ARKESEL_API_KEY
      },
      body: JSON.stringify({
        to: formattedPhone,
        from: 'ScanFlow',
        sms: message
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errorData.message || 'Arkesel API error' });
    }

    const result = await response.json();
    console.log(`[SMS] Sent to ${phone}: ${message.substring(0, 50)}...`);
    res.json({ status: 'success', message: 'SMS sent', result });

  } catch (err) {
    console.error('[SMS] Error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
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

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI response', raw: text.substring(0, 300) });
    }

    // Map to our format
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
    console.log('  ║       ScanFlow AI — Backend Proxy Server     ║');
    console.log('  ╠══════════════════════════════════════════════╣');
    console.log(`  ║  🌐 Server running at: http://localhost:${PORT}  ║`);
    console.log(`  ║  🤖 AI Model: ${GEMINI_MODEL.padEnd(29)}║`);
    console.log(`  ║  🔑 Gemini API: ${GEMINI_API_KEY ? '✅ Configured' : '❌ NOT SET'.padEnd(27)}║`);
    console.log(`  ║  📱 Arkesel SMS: ${process.env.ARKESEL_API_KEY ? '✅ Configured' : '❌ NOT SET'.padEnd(25)}║`);
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
    if (!GEMINI_API_KEY || GEMINI_API_KEY.length <= 10) {
      console.log('  ⚠️  WARNING: No valid GEMINI_API_KEY found in .env file!');
      console.log('  → Create a .env file in the project root with:');
      console.log('    GEMINI_API_KEY=AIzaSy-your-key-here');
      console.log('');
    }
    if (!process.env.ARKESEL_API_KEY) {
      console.log('  ⚠️  WARNING: No ARKESEL_API_KEY found in .env file!');
      console.log('  → SMS notifications will use demo mode.');
      console.log('  → Add to .env: ARKESEL_API_KEY=your-arkesel-api-key');
      console.log('');
    }
  });
}

module.exports = app;