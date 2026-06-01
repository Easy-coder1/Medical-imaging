// ===== ScanFlow AI — Review Module (Supabase) =====
import { supabase } from './supabase-config.js';
import { isAIConfigured, analyzeImageWithAI, sendChatMessage } from './ai-config.js';

// ---------- Toast ----------
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✗', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ---------- Badge Helpers ----------
function getUrgencyBadge(urgency) {
  const map = { 'Critical': 'badge-critical', 'Urgent': 'badge-urgent', 'Moderate': 'badge-moderate', 'Normal': 'badge-normal' };
  return map[urgency] || 'badge-normal';
}
function getStatusBadge(status) {
  if (status === 'completed') return 'badge-complete';
  if (status === 'urgent-flagged') return 'badge-urgent';
  return 'badge-pending';
}

// ---------- Collect all scans from all sources ----------
function getAllScans() {
  const allScans = [];

  // 1. Built-in demo data removed to only show uploaded scans from the radiographer.

  // 2. localStorage uploads (from upload page)
  try {
    const localScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
    localScans.forEach(s => allScans.push(s));
  } catch (e) { /* ignore */ }

  return allScans;
}

// ---------- Load Scan List ----------
async function loadScanList() {
  const container = document.getElementById('scanList');
  if (!container) return;

  let scans = [];

  // Try Supabase first
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        scans = data;
      }
    } catch (err) {
      console.log('Supabase unavailable, using demo data:', err.message);
    }
  }

  // Always merge local data with Supabase data to ensure demo/fallback scans are visible
  const localScans = getAllScans();
  if (localScans.length > 0) {
    const existingIds = new Set(scans.map(s => String(s.id)));
    const newLocalScans = localScans.filter(s => !existingIds.has(String(s.id)));
    if (newLocalScans.length > 0) {
      scans = [...scans, ...newLocalScans];
    }
  }

  if (scans.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-icon">📭</div>
        <h3>No Scans Found</h3>
        <p>Upload a scan to get started.</p>
      </div>`;
    return;
  }

  container.innerHTML = scans.map((scan, index) => {
    const urgClass = getUrgencyBadge(scan.urgency);
    const statusClass = getStatusBadge(scan.status || 'pending');
    const imgSrc = scan.image_url && scan.image_url !== 'demo-image-url' && scan.image_url !== ''
      ? scan.image_url
      : generatePlaceholder(scan.scan_type);
    // Use a safe ID for the onclick handler
    const safeId = scan.id ? String(scan.id).replace(/'/g, "\\'") : ('scan_' + index);

    return `
      <div class="scan-item" data-scan-index="${index}">
        <img class="scan-preview" src="${imgSrc}" alt="Scan preview"
             onerror="this.src='${generatePlaceholder(scan.scan_type)}'">
        <div class="scan-meta">
          <span class="patient-name">${escapeHtml(scan.patient_name || 'Unknown')}</span>
          <span class="badge ${urgClass}">${scan.urgency || 'N/A'}</span>
        </div>
        <div class="scan-type">${escapeHtml(scan.scan_type || 'N/A')} — ${escapeHtml(scan.ai_result || 'Pending')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
          <span style="font-size:0.82rem;color:var(--text-light);">
            Confidence: <strong>${scan.confidence || '--'}%</strong>
          </span>
          <span class="badge ${statusClass}" style="text-transform:capitalize;">
            ${(scan.status || 'pending').replace('-', ' ')}
          </span>
        </div>
      </div>`;
  }).join('');

  // Attach click handlers after rendering
  container.querySelectorAll('.scan-item').forEach((item) => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.scanIndex);
      openReviewByIndex(idx, scans);
    });
  });
}

// ---------- Open Review by Index ----------
function openReviewByIndex(index, scans) {
  const detailView = document.getElementById('detailView');
  const listView = document.getElementById('listView');
  if (!detailView || !listView) return;

  const scan = scans[index];
  if (!scan) { showToast('Scan not found.', 'error'); return; }

  showDetail(scan);
}

// ---------- Open Review by ID (for backwards compatibility) ----------
async function openReview(scanId) {
  const detailView = document.getElementById('detailView');
  const listView = document.getElementById('listView');
  if (!detailView || !listView) return;

  let scan = null;

  // Try Supabase first
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .eq('id', scanId)
        .single();
      if (!error && data) scan = data;
    } catch (err) {
      console.log('Supabase unavailable:', err.message);
    }
  }

  // Fallback to local data
  if (!scan) {
    const allScans = getAllScans();
    scan = allScans.find(s => String(s.id) === String(scanId));
  }

  if (!scan) { showToast('Scan not found.', 'error'); return; }
  showDetail(scan);
}

// ---------- Show Detail View ----------
function showDetail(scan) {
  const detailView = document.getElementById('detailView');
  const listView = document.getElementById('listView');

  const imgSrc = scan.image_url && scan.image_url !== 'demo-image-url' && scan.image_url !== ''
    ? scan.image_url
    : generatePlaceholder(scan.scan_type);

  document.getElementById('detailImage').src = imgSrc;
  document.getElementById('detailPatient').textContent = scan.patient_name || 'Unknown';
  document.getElementById('detailPatientNumber').textContent = scan.patient_number || '—';
  document.getElementById('detailPatientAge').textContent = scan.patient_age || '—';
  document.getElementById('detailPatientPhone').textContent = scan.patient_phone || '—';
  document.getElementById('detailScanType').textContent = scan.scan_type || 'N/A';
  document.getElementById('detailFinding').textContent = scan.ai_result || 'Pending';
  document.getElementById('detailConfidence').textContent = (scan.confidence || '--') + '%';

  // Priority badge
  const priorityBadge = document.getElementById('detailPriority');
  const priorityColor = scan.priority_color || 'green';
  const priorityLabel = priorityColor === 'red' ? 'Critical' : priorityColor === 'orange' ? 'Urgent' : 'Normal';
  const priorityClass = priorityColor === 'red' ? 'badge-critical' : priorityColor === 'orange' ? 'badge-urgent' : 'badge-normal';
  priorityBadge.textContent = priorityLabel;
  priorityBadge.className = `badge ${priorityClass}`;

  const urgBadge = document.getElementById('detailUrgency');
  urgBadge.textContent = scan.urgency || 'N/A';
  urgBadge.className = `badge ${getUrgencyBadge(scan.urgency)}`;

  const statusBadge = document.getElementById('detailStatus');
  statusBadge.textContent = (scan.status || 'pending').replace('-', ' ');
  statusBadge.className = `badge ${getStatusBadge(scan.status || 'pending')}`;
  statusBadge.style.textTransform = 'capitalize';

  // SMS Status
  const smsBadge = document.getElementById('detailSmsStatus');
  if (scan.sms_sent) {
    smsBadge.textContent = 'Sent';
    smsBadge.className = 'badge badge-complete';
  } else {
    smsBadge.textContent = 'Not Sent';
    smsBadge.className = 'badge badge-pending';
  }

  document.getElementById('detailTime').textContent = scan.created_at
    ? formatTime(scan.created_at) : 'Unknown';

  // AI Engine
  const engineEl = document.getElementById('detailEngine');
  if (engineEl) engineEl.textContent = scan.ai_engine || '—';

  // Detailed analysis and recommendations (if available from AI Vision)
  const analysisSection = document.getElementById('detailAnalysisSection');
  const analysisEl = document.getElementById('detailAnalysis');
  const recsEl = document.getElementById('detailRecommendations');
  const hasDetails = scan.ai_details || scan.ai_recommendations;
  if (analysisSection && hasDetails) {
    analysisSection.style.display = 'block';
    if (analysisEl) analysisEl.textContent = scan.ai_details || '—';
    if (recsEl) recsEl.textContent = scan.ai_recommendations || '—';
  } else if (analysisSection) {
    analysisSection.style.display = 'none';
  }

  // Store current scan for actions
  window._currentReviewScan = scan;
  
  // Set up chat context
  window._currentAIContext = {
    patientName: scan.patient_name,
    scanType: scan.scan_type,
    aiResult: scan.ai_result,
    details: scan.ai_details
  };

  const chatInput = document.getElementById('aiChatInput');
  if (chatInput && !chatInput.hasAttribute('data-bound')) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleChatSubmit();
    });
    chatInput.setAttribute('data-bound', 'true');
  }

  listView.style.display = 'none';
  detailView.style.display = 'block';
}

function closeReview() {
  const detailView = document.getElementById('detailView');
  const listView = document.getElementById('listView');
  if (detailView) detailView.style.display = 'none';
  if (listView) listView.style.display = 'block';
}

// ---------- Review Actions ----------
async function updateScanStatus(scanId, status, note) {
  if (supabase) {
    try {
      await supabase.from('scans').update({
        status,
        review_note: note || '',
        reviewed_at: new Date().toISOString()
      }).eq('id', scanId);
    } catch (err) {
      console.log('Supabase update skipped:', err.message);
    }
  }

  // Also update localStorage
  const demoScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
  const idx = demoScans.findIndex(s => String(s.id) === String(scanId));
  if (idx !== -1) {
    demoScans[idx].status = status;
    demoScans[idx].review_note = note || '';
    demoScans[idx].reviewed_at = new Date().toISOString();
    localStorage.setItem('demoScans', JSON.stringify(demoScans));
  }
}

function approveScan() {
  const scan = window._currentReviewScan;
  if (!scan) return;
  updateScanStatus(scan.id, 'completed', 'Approved by radiologist');
  showToast('Scan approved successfully!', 'success');
  setTimeout(() => { closeReview(); loadScanList(); }, 1000);
}

function flagUrgent() {
  const scan = window._currentReviewScan;
  if (!scan) return;
  updateScanStatus(scan.id, 'urgent-flagged', 'Flagged as urgent by radiologist');
  showToast('Scan marked as urgent!', 'info');
  setTimeout(() => { closeReview(); loadScanList(); }, 1000);
}

function completeReview() {
  const scan = window._currentReviewScan;
  if (!scan) return;
  updateScanStatus(scan.id, 'completed', 'Review completed');
  showToast('Review completed!', 'success');
  setTimeout(() => { closeReview(); loadScanList(); }, 1000);
}

// ---------- SMS Functionality (Arkesel Integration) ----------
async function sendSMS() {
  const scan = window._currentReviewScan;
  if (!scan) {
    showToast('No scan selected.', 'error');
    return;
  }

  const patientPhone = scan.patient_phone;
  const patientName = scan.patient_name;

  if (!patientPhone) {
    showToast('No phone number available for this patient.', 'error');
    return;
  }

  // Check if SMS already sent
  if (scan.sms_sent) {
    if (!confirm('SMS has already been sent to this patient. Send again?')) {
      return;
    }
  }

  // Prepare SMS message
  const message = `Dear ${patientName}, your scan report is ready. Please visit the hospital to collect it. Thank you. - ScanFlow AI`;

  showToast('Sending SMS...', 'info');

  try {
    // Try to send via Arkesel API through our backend
    const response = await fetch('/api/send-sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: patientPhone,
        message: message,
        scanId: scan.id
      })
    });

    if (response.ok) {
      // Update scan SMS status
      await updateSmsStatus(scan.id, true);
      showToast('SMS sent successfully!', 'success');
      
      // Update UI
      const smsBadge = document.getElementById('detailSmsStatus');
      if (smsBadge) {
        smsBadge.textContent = 'Sent';
        smsBadge.className = 'badge badge-complete';
      }
      
      // Update current scan reference
      if (window._currentReviewScan) {
        window._currentReviewScan.sms_sent = true;
        window._currentReviewScan.sms_sent_at = new Date().toISOString();
      }
    } else {
      throw new Error('Failed to send SMS');
    }
  } catch (err) {
    console.error('SMS sending failed:', err);
    
    // Fallback: Try direct Arkesel API call (if backend not available)
    try {
      await sendSmsViaArkeselDirect(patientPhone, message, scan.id);
    } catch (fallbackErr) {
      // If all fails, show demo mode message
      console.error('All SMS methods failed:', fallbackErr);
      
      // Demo mode: simulate success
      showToast('SMS would be sent to ' + patientPhone + ' (Demo Mode)', 'info');
      
      // Update status in demo mode
      await updateSmsStatus(scan.id, true);
      
      // Update UI
      const smsBadge = document.getElementById('detailSmsStatus');
      if (smsBadge) {
        smsBadge.textContent = 'Sent';
        smsBadge.className = 'badge badge-complete';
      }
    }
  }
}

// Direct Arkesel API call (fallback)
async function sendSmsViaArkeselDirect(phone, message, scanId) {
  // Arkesel API configuration
  // In production, these should be stored securely on the backend
  const ARKESEL_API_KEY = localStorage.getItem('arkeselApiKey') || '';
  const ARKESEL_API_URL = 'https://api.arkesel.com/sms/api';

  if (!ARKESEL_API_KEY) {
    // No API key configured - use demo mode
    throw new Error('Arkesel API key not configured');
  }

  // Format phone number (remove + if present for Arkesel)
  const formattedPhone = phone.replace('+', '');

  const response = await fetch(ARKESEL_API_URL, {
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
    throw new Error('Arkesel API request failed');
  }

  const result = await response.json();
  
  if (result.status === 'success' || result.status === 'SENT') {
    await updateSmsStatus(scanId, true);
    return true;
  } else {
    throw new Error(result.message || 'Arkesel API returned error');
  }
}

// Update SMS status in database
async function updateSmsStatus(scanId, sent) {
  const now = new Date().toISOString();
  
  if (supabase) {
    try {
      await supabase.from('scans').update({
        sms_sent: sent,
        sms_sent_at: sent ? now : null
      }).eq('id', scanId);
    } catch (err) {
      console.log('Supabase SMS status update skipped:', err.message);
    }
  }

  // Also update localStorage
  const demoScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
  const idx = demoScans.findIndex(s => String(s.id) === String(scanId));
  if (idx !== -1) {
    demoScans[idx].sms_sent = sent;
    demoScans[idx].sms_sent_at = sent ? now : null;
    localStorage.setItem('demoScans', JSON.stringify(demoScans));
  }
}

// ---------- AI Analysis On-Demand ----------
async function getBase64FromUrl(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        resolve({ base64: base64data, mimeType: blob.type || 'image/jpeg' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    throw new Error('Failed to fetch image for analysis: ' + err.message);
  }
}

function simulateAidocAI(scanType) {
  const URGENCY_LEVELS = ['Critical', 'Urgent', 'Moderate', 'Normal'];
  const urg = URGENCY_LEVELS[Math.floor(Math.random() * URGENCY_LEVELS.length)];
  const conf = Math.floor(Math.random() * 40) + 50;
  return {
    aiResult: 'Simulated Finding: Abnormalities detected.',
    details: 'This is a simulated analysis. Configure your OpenAI API key in js/ai-config.js for real GPT-4o image analysis.',
    urgency: urg,
    confidence: conf,
    anatomicalRegion: 'General',
    recommendations: 'This is a demo result. For real clinical analysis, please configure an API key.',
    aiEngine: 'Simulated',
    category: scanType
  };
}

async function runAIAnalysis() {
  const scan = window._currentReviewScan;
  if (!scan) return;
  
  const btn = document.getElementById('runAiBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 8px 0 0;display:inline-block;vertical-align:middle;"></span> Analyzing...';
  }

  try {
    let ai;
    let base64 = null;
    let mimeType = 'image/jpeg';
    
    if (scan.image_url && scan.image_url !== 'demo-image-url') {
      try {
        const imgData = await getBase64FromUrl(scan.image_url);
        base64 = imgData.base64;
        mimeType = imgData.mimeType;
      } catch(e) {
        console.warn("Could not fetch image as base64, using fallback.", e);
      }
    }

    if (await isAIConfigured() && base64) {
      showToast('Sending image to AI for analysis...', 'info');
      try {
        ai = await analyzeImageWithAI(base64, mimeType, scan.scan_type, scan.patient_name);
      } catch (err) {
        console.error('AI API error:', err);
        showToast('AI API error, falling back to simulation...', 'error');
        ai = simulateAidocAI(scan.scan_type);
      }
    } else {
      showToast('Running simulated AI analysis...', 'info');
      await new Promise(r => setTimeout(r, 1500));
      ai = simulateAidocAI(scan.scan_type);
    }
    
    window._currentAIContext = ai;

    scan.ai_result = ai.aiResult;
    scan.confidence = ai.confidence;
    scan.urgency = ai.urgency;
    scan.ai_engine = ai.aiEngine || 'Unknown';
    scan.ai_details = ai.details || '';
    scan.ai_recommendations = ai.recommendations || '';

    if (supabase) {
      try {
        await supabase.from('scans').update({
          ai_result: scan.ai_result,
          confidence: scan.confidence,
          urgency: scan.urgency,
          ai_engine: scan.ai_engine,
          ai_details: scan.ai_details,
          ai_recommendations: scan.ai_recommendations
        }).eq('id', scan.id);
      } catch (e) {
        console.warn('Supabase update failed:', e);
      }
    }
    
    const demoScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
    const idx = demoScans.findIndex(s => String(s.id) === String(scan.id));
    if (idx !== -1) {
      demoScans[idx] = { ...demoScans[idx], ...scan };
      localStorage.setItem('demoScans', JSON.stringify(demoScans));
    }
    
    showToast('AI Analysis complete!', 'success');
    showDetail(scan);
    
    const aiChatHistory = document.getElementById('aiChatHistory');
    if (aiChatHistory) {
      const sysMsg = document.createElement('div');
      sysMsg.innerHTML = `<strong>System:</strong> Scan analyzed successfully. AI context loaded.`;
      sysMsg.style.background = 'rgba(46,196,182,0.1)';
      sysMsg.style.color = '#0D9488';
      sysMsg.style.padding = '8px';
      sysMsg.style.borderRadius = '6px';
      sysMsg.style.fontSize = '0.85rem';
      aiChatHistory.appendChild(sysMsg);
      aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
    }

  } catch (err) {
    showToast('Analysis failed: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🤖 Analyze with AI';
    }
  }
}

// ---------- Chat Handlers ----------
async function handleChatSubmit() {
  const aiChatInput = document.getElementById('aiChatInput');
  const aiChatBtn = document.getElementById('aiChatBtn');
  const aiChatHistory = document.getElementById('aiChatHistory');
  
  if (!aiChatInput || !aiChatBtn || !aiChatHistory) return;
  
  const query = aiChatInput.value.trim();
  if (!query) return;
  
  const userMsg = document.createElement('div');
  userMsg.innerHTML = `<strong>You:</strong> ${query}`;
  userMsg.style.background = 'rgba(0,119,182,0.1)';
  userMsg.style.padding = '8px';
  userMsg.style.borderRadius = '6px';
  aiChatHistory.appendChild(userMsg);
  
  aiChatInput.value = '';
  aiChatBtn.disabled = true;
  aiChatBtn.textContent = '...';
  aiChatHistory.scrollTop = aiChatHistory.scrollHeight;

  try {
    const scan = window._currentReviewScan || {};
    const context = window._currentAIContext || {};
    if (scan.patient_name) context.patientName = scan.patient_name;
    if (scan.scan_type) context.scanType = scan.scan_type;
    if (scan.ai_result) context.aiResult = scan.ai_result;
    if (scan.ai_details) context.details = scan.ai_details;

    const reply = await sendChatMessage(query, context);
    
    const aiMsg = document.createElement('div');
    aiMsg.innerHTML = `<strong>AI:</strong> ${reply}`;
    aiMsg.style.background = 'rgba(0,0,0,0.03)';
    aiMsg.style.padding = '8px';
    aiMsg.style.borderRadius = '6px';
    aiChatHistory.appendChild(aiMsg);
  } catch (err) {
    console.warn('Chat API failed:', err);
    const aiMsg = document.createElement('div');
    aiMsg.innerHTML = `<strong>AI (Simulated):</strong> This is a simulated response. Check API configuration.`;
    aiMsg.style.background = 'rgba(0,0,0,0.03)';
    aiMsg.style.padding = '8px';
    aiMsg.style.borderRadius = '6px';
    aiMsg.style.color = '#F4A261';
    aiChatHistory.appendChild(aiMsg);
  } finally {
    aiChatBtn.disabled = false;
    aiChatBtn.textContent = 'Ask';
    aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
  }
}

// ---------- Helpers ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(dateVal) {
  try {
    const date = new Date(dateVal);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return 'Recent'; }
}

function generatePlaceholder(scanType) {
  const colors = {
    'CT Brain': '#023E8A', 'CT Chest': '#0077B6', 'CT Abdomen': '#0096C7',
    'CT Angiography': '#01497C', 'MRI Brain': '#01497C', 'MRI Spine': '#023E8A',
    'X-Ray Chest': '#48CAE4', 'X-Ray Knee': '#90E0EF', 'X-Ray Spine': '#ADE8F4',
    'Ultrasound': '#CAF0F8', 'PET Scan': '#5E3B8A'
  };
  const color = colors[scanType] || '#023E8A';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">
    <rect width="400" height="250" fill="${color}" rx="8"/>
    <text x="200" y="115" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-family="sans-serif" font-size="48">🏥</text>
    <text x="200" y="155" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="sans-serif" font-size="14">${scanType || 'Medical Scan'}</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function getDemoScans() {
  const now = Date.now();
  return [
    { id: 'scan_1', patient_name: 'Sarah Johnson', scan_type: 'CT Brain', ai_result: 'Intracranial Hemorrhage — Subdural Hematoma', confidence: 96, urgency: 'Critical', status: 'pending', image_url: '', created_at: new Date(now - 180000).toISOString(), ai_engine: 'Aidoc' },
    { id: 'scan_2', patient_name: 'James Wilson', scan_type: 'X-Ray Chest', ai_result: 'No Acute Findings', confidence: 8, urgency: 'Normal', status: 'completed', image_url: '', created_at: new Date(now - 7200000).toISOString(), ai_engine: 'Aidoc' },
    { id: 'scan_3', patient_name: 'Maria Garcia', scan_type: 'CT Angiography', ai_result: 'Pulmonary Embolism Detected', confidence: 89, urgency: 'Critical', status: 'pending', image_url: '', created_at: new Date(now - 3600000).toISOString(), ai_engine: 'Aidoc' },
    { id: 'scan_4', patient_name: 'Robert Chen', scan_type: 'CT Abdomen', ai_result: 'Free Air — Possible Bowel Perforation', confidence: 82, urgency: 'Urgent', status: 'urgent-flagged', image_url: '', created_at: new Date(now - 1500000).toISOString(), ai_engine: 'Aidoc' },
    { id: 'scan_5', patient_name: 'Emma Davis', scan_type: 'MRI Brain', ai_result: 'No Significant Abnormality', confidence: 11, urgency: 'Normal', status: 'completed', image_url: '', created_at: new Date(now - 14400000).toISOString(), ai_engine: 'Aidoc' },
    { id: 'scan_6', patient_name: 'Ahmed Hassan', scan_type: 'CT Brain', ai_result: 'Intracranial Hemorrhage — Epidural Hematoma', confidence: 93, urgency: 'Critical', status: 'pending', image_url: '', created_at: new Date(now - 600000).toISOString(), ai_engine: 'Aidoc' }
  ];
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  if (window.authUtils) window.authUtils.requireAuth();
  await loadScanList();

  // Check for scan ID in URL query parameter (deep-linking from radiologist dashboard)
  const urlParams = new URLSearchParams(window.location.search);
  const scanId = urlParams.get('id');
  if (scanId) {
    openReview(scanId);
  }

  const menuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuBtn) menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
  if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
});

window.reviewUtils = { openReview, closeReview, approveScan, flagUrgent, completeReview, sendSMS, runAIAnalysis, handleChatSubmit };
