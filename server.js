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

// OpenAI API key — loaded from .env, NEVER exposed to the browser
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ---------- Health Check ----------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    aiConfigured: !!(OPENAI_API_KEY && OPENAI_API_KEY.length > 10),
    model: OPENAI_MODEL
  });
});

// ---------- Proxy: Analyze Image via GPT-4o ----------
app.post('/api/analyze', async (req, res) => {
  if (!OPENAI_API_KEY || OPENAI_API_KEY.length <= 10) {
    return res.status(500).json({ error: 'AI_NOT_CONFIGURED: No valid OpenAI API key found on the server.' });
  }

  const { base64ImageData, mimeType, scanType, patientName } = req.body;

  if (!base64ImageData) {
    return res.status(400).json({ error: 'Missing image data in request body.' });
  }

  const prompt = `You are an expert medical imaging AI assistant powered by GPT-4o. Analyze this medical scan image carefully and provide a detailed clinical assessment.

Context provided by user:
- Scan type: ${scanType || 'Unknown'}
- Patient: ${patientName || 'Unknown'}

Analyze the image based on WHAT YOU ACTUALLY SEE in the image, not just the scan type label. Look for:
1. Anatomical structures visible in the image
2. Any abnormalities, lesions, fractures, masses, fluid collections, or other pathologies
3. Quality and completeness of the study
4. Comparison with expected normal anatomy for this type of scan

Provide your response in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "finding": "Brief description of the primary finding or 'No acute findings' if normal",
  "details": "Detailed analysis of what you observe in the image — describe specific structures, measurements if visible, and any abnormalities noted",
  "urgency": "Critical|Urgent|Moderate|Normal",
  "confidence": 85,
  "anatomical_region": "The primary anatomical region or structure examined",
  "recommendations": "Clinical recommendations for follow-up or next steps"
}

Rules:
- confidence must be an integer between 1 and 100
- urgency must be one of: Critical, Urgent, Moderate, Normal
- Base your analysis on ACTUAL IMAGE CONTENT, not assumptions from scan type
- If the image quality is poor, note that in findings and lower confidence accordingly
- If this does not appear to be a medical scan, still describe what you observe
- Be specific about what you see, not generic`;

  const requestBody = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType || 'image/jpeg'};base64,${base64ImageData}`
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }
    ],
    max_tokens: 1024,
    temperature: 0.2
  };

  try {
    console.log(`[analyze] Sending image to ${OPENAI_MODEL} for ${patientName || 'unknown patient'} (${scanType || 'unknown scan'})`);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || errorData?.detail || `OpenAI API error: ${response.status}`;
      console.error('[analyze] API error:', errorMsg);
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(500).json({ error: 'No response content from GPT-4o API' });
    }

    // Parse JSON response
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
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
      aiEngine: `ChatGPT Free (GPT-4o)`,
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
  if (!OPENAI_API_KEY || OPENAI_API_KEY.length <= 10) {
    return res.status(500).json({ error: 'AI_NOT_CONFIGURED: No valid OpenAI API key found on the server.' });
  }

  const { query, context } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Missing query in request body.' });
  }

  let systemPrompt = 'You are a helpful medical AI assistant. Provide concise, accurate, and professional answers.';
  if (context && context.aiResult) {
    systemPrompt += `\nContext of current scan: ${context.scanType} for patient ${context.patientName}. Findings: ${context.aiResult}. Details: ${context.details}`;
  }

  const requestBody = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ],
    max_tokens: 500,
    temperature: 0.5
  };

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || errorData?.detail || `OpenAI API error: ${response.status}`;
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;

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
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║       ScanFlow AI — Backend Proxy Server     ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║  🌐 Server running at: http://localhost:${PORT}  ║`);
  console.log(`  ║  🤖 AI Model: ${OPENAI_MODEL.padEnd(29)}║`);
  console.log(`  ║  🔑 API Key: ${OPENAI_API_KEY ? '✅ Configured' : '❌ NOT SET'.padEnd(29)}║`);
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  if (!OPENAI_API_KEY || OPENAI_API_KEY.length <= 10) {
    console.log('  ⚠️  WARNING: No valid OPENAI_API_KEY found in .env file!');
    console.log('  → Create a .env file in the project root with:');
    console.log('    OPENAI_API_KEY=sk-proj-your-key-here');
    console.log('');
  }
});