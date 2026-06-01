// ===== ScanFlow AI â€” Radiologist Dashboard Module =====
import { supabase } from './supabase-config.js';
import { isAIConfigured, analyzeImageWithAI, sendChatMessage } from './ai-config.js';
import { sendRealSMS, buildScanResultMessage, buildUrgentScanMessage, CONTACT_PHONE } from './sms-service.js';
import {
  setupRealtimeSync,
  broadcastScanChange,
  getLocalScans,
  upsertLocalScan,
  removeLocalScan,
  getRealtimeStatus
} from './realtime-sync.js';

// ---------- State ----------
let allScans = [];
let currentFilter = 'all';
let isLoading = false;
let lastError = null;
let _currentScan = null;
let _currentAIContext = null;
let _hasLoadedOnce = false;

// ---------- Section Switching ----------
function showSection(name) {
  const dashboard = document.getElementById('dashboardSection');
  const allScansSec = document.getElementById('allScansSection');
  const detailView = document.getElementById('detailView');
  const filterTabs = document.querySelector('.filter-tabs');
  const criticalSection = document.querySelector('.content-card[style*="border-left: 5px solid #E63946"]');

  document.querySelectorAll('.sidebar nav a[data-nav]').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === name);
  });

  if (name === 'all-scans') {
    if (dashboard) dashboard.classList.add('section-hidden');
    if (allScansSec) allScansSec.classList.remove('section-hidden');
    if (detailView) detailView.style.display = 'none';
    if (filterTabs) filterTabs.style.display = '';
    if (criticalSection) criticalSection.style.display = '';
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    loadAllScansView();
  } else {
    if (dashboard) dashboard.classList.remove('section-hidden');
    if (allScansSec) allScansSec.classList.add('section-hidden');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    // CRITICAL FIX: re-render the dashboard with the latest in-memory data
    // so scans don't "vanish" when returning from All Scans.
    renderScans();
    renderCriticalAlertsFromState();
    renderStatsFromState();
  }
}
window.showSection = showSection;

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
  const icons = { success: 'âœ“', error: 'âœ—', info: 'â„¹' };
  toast.innerHTML = `<span>${icons[type] || 'â„¹'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ---------- Priority Helpers ----------
function getPriorityClass(scan) {
  if (!scan) return 'normal';
  if (scan.urgency === 'Critical' || scan.priority_color === 'red') return 'critical';
  if (scan.urgency === 'Urgent' || scan.priority_color === 'orange') return 'urgent';
  return 'normal';
}
function getPriorityLabel(scan) {
  if (!scan) return 'Normal';
  if (scan.urgency === 'Critical' || scan.priority_color === 'red') return 'Critical';
  if (scan.urgency === 'Urgent' || scan.priority_color === 'orange') return 'Urgent';
  return 'Normal';
}
function getStatusBadge(status) {
  if (status === 'completed') return '<span class="badge badge-complete">Reviewed</span>';
  if (status === 'urgent-flagged') return '<span class="badge badge-urgent">Urgent</span>';
  return '<span class="badge badge-pending">Pending</span>';
}
function getUrgencyBadge(urgency) {
  const map = { 'Critical': 'badge-critical', 'Urgent': 'badge-urgent', 'Moderate': 'badge-moderate', 'Normal': 'badge-normal' };
  return `<span class="badge ${map[urgency] || 'badge-normal'}">${urgency || 'N/A'}</span>`;
}

// ---------- Collect all scans from all sources ----------
async function collectAllScans() {
  let scans = [];

  // 1. Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        scans = data;
      } else if (error) {
        console.log('[Dashboard] Supabase query error:', error.message);
      }
    } catch (err) {
      console.log('[Dashboard] Supabase query failed:', err.message);
    }
  }

  // 2. localStorage merge (offline + demo fallback)
  const localScans = getLocalScans();
  if (localScans.length > 0) {
    const existingIds = new Set(scans.map(s => String(s.id)));
    const newLocal = localScans.filter(s => s && s.id != null && !existingIds.has(String(s.id)));
    if (newLocal.length > 0) scans = [...scans, ...newLocal];
  }

  // 3. Deduplicate
  const seen = new Set();
  scans = scans.filter(s => {
    if (!s || s.id == null) return false;
    const k = String(s.id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 4. Sort newest first
  scans.sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });

  return scans;
}

// ---------- Render from in-memory state (instant, no network) ----------
function renderStatsFromState() {
  let total = 0, critical = 0, urgent = 0, reviewed = 0;
  total = allScans.length;
  allScans.forEach(s => {
    const p = getPriorityClass(s);
    if (p === 'critical') critical++;
    if (p === 'urgent') urgent++;
    if (s.status === 'completed') reviewed++;
  });
  animateCounter('statTotal', total);
  animateCounter('statCritical', critical);
  animateCounter('statUrgent', urgent);
  animateCounter('statReviewed', reviewed);
}

function renderCriticalAlertsFromState() {
  const container = document.getElementById('criticalAlertsList');
  if (!container) return;
  const criticalScans = allScans.filter(s => getPriorityClass(s) === 'critical' && s.status !== 'completed');
  if (criticalScans.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:16px;color:var(--success);">
        <div style="font-size:1.5rem;margin-bottom:8px;">âœ…</div>
        <p style="font-size:0.9rem;">No critical cases pending!</p>
      </div>`;
    return;
  }
  container.innerHTML = criticalScans.slice(0, 3).map(scan => {
    const time = scan.created_at ? formatTime(scan.created_at) : 'Just now';
    const idStr = String(scan.id).replace(/'/g, "\\'");
    return `
      <div class="alert-item" style="cursor:pointer;" onclick="window.dashUtils.openScanDetail('${idStr}')">
        <div class="alert-dot"></div>
        <span class="alert-text">
          <strong>${escapeHtml(scan.patient_name || 'Unknown')}</strong> â€”
          ${escapeHtml(scan.ai_result || 'Analysis pending')}
          <br>
          <span style="font-size:0.78rem;color:var(--text-light);">
            ${escapeHtml(scan.scan_type || '')} | Patient #: ${escapeHtml(scan.patient_number || 'N/A')}
          </span>
        </span>
        <span class="alert-time">${time}</span>
      </div>`;
  }).join('');
}

// ---------- Load Stats ----------
async function loadStats() {
  if (allScans.length === 0) {
    try { allScans = await collectAllScans(); } catch (e) { console.warn(e); }
  }
  renderStatsFromState();
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = parseInt(el.textContent || '0', 10) || 0;
  if (current === target) return;
  const step = Math.max(1, Math.ceil(Math.abs(target - current) / 20));
  const interval = setInterval(() => {
    current += (target > current ? step : -step);
    if ((step > 0 && current >= target) || (step < 0 && current <= target)) {
      current = target; clearInterval(interval);
    }
    el.textContent = current;
  }, 30);
}

// ---------- Load Critical Alerts ----------
async function loadCriticalAlerts() {
  if (allScans.length === 0) {
    try { allScans = await collectAllScans(); } catch (e) { console.warn(e); }
  }
  renderCriticalAlertsFromState();
}

// ---------- Load Scan Grid ----------
async function loadScans(showLoading = true) {
  const grid = document.getElementById('scanGrid');
  if (!grid) return;
  isLoading = true;
  lastError = null;

  if (showLoading && allScans.length === 0) {
    grid.innerHTML = `
      <div style="text-align:center;padding:60px 24px;grid-column:1/-1;">
        <div class="spinner"></div>
        <p style="margin-top:12px;color:var(--text-light);font-size:0.85rem;">Loading scans...</p>
      </div>`;
  }

  try {
    allScans = await collectAllScans();
    _hasLoadedOnce = true;
  } catch (err) {
    lastError = err;
    console.error('[Dashboard] loadScans failed:', err);
  }
  isLoading = false;
  renderScans();
  renderStatsFromState();
  renderCriticalAlertsFromState();
}

async function refreshScans() { await loadScans(true); }

// ---------- Render scans grid ----------
function renderScans() {
  const grid = document.getElementById('scanGrid');
  if (!grid) return;

  let filtered = allScans;
  if (currentFilter !== 'all') {
    filtered = allScans.filter(scan => getPriorityClass(scan) === currentFilter);
  }
  filtered.sort((a, b) => {
    const po = { 'critical': 0, 'urgent': 1, 'normal': 2 };
    const ap = po[getPriorityClass(a)];
    const bp = po[getPriorityClass(b)];
    if (ap !== bp) return ap - bp;
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });

  if (filtered.length === 0) {
    const message = allScans.length === 0
      ? 'No scans available yet. Scans uploaded by radiographers will appear here automatically.'
      : 'No scans found for this filter.';
    const status = getRealtimeStatus();
    const statusHint = (status === 'SUBSCRIBED')
      ? '<p style="color:var(--success);font-size:0.8rem;margin-top:8px;">ðŸŸ¢ Live updates active â€” new uploads will appear instantly.</p>'
      : (status === 'demo'
        ? '<p style="color:var(--text-light);font-size:0.8rem;margin-top:8px;">â„¹ï¸ Running in demo mode â€” open this page in another tab and upload a scan to see live updates.</p>'
        : '<p style="color:var(--text-light);font-size:0.8rem;margin-top:8px;">â³ Connecting to live updatesâ€¦</p>');
    grid.innerHTML = `
      <div style="text-align:center;padding:60px 24px;grid-column:1/-1;">
        <div style="font-size:3rem;margin-bottom:12px;opacity:0.3;">ðŸ“­</div>
        <p style="color:var(--text-light);font-size:0.9rem;">${message}</p>
        ${allScans.length === 0 ? statusHint : ''}
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(scan => {
    const priority = getPriorityClass(scan);
    const priorityLabel = getPriorityLabel(scan);
    const time = scan.created_at ? formatTime(scan.created_at) : 'Recent';
    const imgSrc = scan.image_url && scan.image_url !== 'demo-image-url' && scan.image_url !== ''
      ? scan.image_url
      : generatePlaceholder(scan.scan_type);
    const idStr = String(scan.id).replace(/'/g, "\\'");
    return `
      <div class="priority-scan-card ${priority}" onclick="window.dashUtils.openScanDetail('${idStr}')">
        <div class="priority-indicator ${priority}"></div>
        <img class="scan-preview" src="${imgSrc}" alt="Scan preview"
             onerror="this.src='${generatePlaceholder(scan.scan_type)}'">
        <div class="card-header">
          <div>
            <div class="patient-name">${escapeHtml(scan.patient_name || 'Unknown')}</div>
            <div class="scan-type">${escapeHtml(scan.scan_type || 'N/A')} | Age: ${scan.patient_age || 'â€”'}</div>
          </div>
          <span class="badge ${priority === 'critical' ? 'badge-critical' : priority === 'urgent' ? 'badge-urgent' : 'badge-normal'}">${priorityLabel}</span>
        </div>
        <div class="ai-finding">${escapeHtml(scan.ai_result || 'Pending analysis...')}</div>
        <div class="card-footer">
          <div class="confidence">Confidence: <strong>${scan.confidence || 'â€”'}%</strong></div>
          <div class="time-ago">ðŸ• ${time}</div>
        </div>
        <div style="margin-top:12px;">
          ${getStatusBadge(scan.status)}
          ${scan.sms_sent ? '<span class="badge badge-complete">SMS Sent</span>' : '<span class="badge badge-pending">SMS Pending</span>'}
        </div>
      </div>`;
  }).join('');
}

// ---------- Filter ----------
function filterScans(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });
  renderScans();
}

// ---------- Open Scan Detail ----------
function openScanDetail(scanId) {
  const scan = allScans.find(s => String(s.id) === String(scanId));
  if (!scan) {
    showToast('Scan not found. Refreshing listâ€¦', 'info');
    loadScans(false);
    return;
  }
  showDetail(scan);
}

function showDetail(scan) {
  const detailView = document.getElementById('detailView');
  const scanGrid = document.getElementById('scanGrid');
  const filterTabs = document.querySelector('.filter-tabs');
  const criticalSection = document.querySelector('.content-card[style*="border-left: 5px solid #E63946"]');
  if (!detailView) return;

  const imgSrc = scan.image_url && scan.image_url !== 'demo-image-url' && scan.image_url !== ''
    ? scan.image_url
    : generatePlaceholder(scan.scan_type);

  document.getElementById('detailImage').src = imgSrc;
  document.getElementById('detailPatient').textContent = scan.patient_name || 'Unknown';
  document.getElementById('detailPatientNumber').textContent = scan.patient_number || 'â€”';
  document.getElementById('detailPatientAge').textContent = scan.patient_age || 'â€”';
  document.getElementById('detailPatientPhone').textContent = scan.patient_phone || 'â€”';
  document.getElementById('detailScanType').textContent = scan.scan_type || 'N/A';
  document.getElementById('detailFinding').textContent = scan.ai_result || 'Pending';
  document.getElementById('detailConfidence').textContent = (scan.confidence || '--') + '%';

  const priorityBadge = document.getElementById('detailPriority');
  const priorityColor = scan.priority_color || 'green';
  const priorityLabel = priorityColor === 'red' ? 'Critical' : priorityColor === 'orange' ? 'Urgent' : 'Normal';
  const priorityClass = priorityColor === 'red' ? 'badge-critical' : priorityColor === 'orange' ? 'badge-urgent' : 'badge-normal';
  priorityBadge.textContent = priorityLabel;
  priorityBadge.className = `badge ${priorityClass}`;

  const urgBadge = document.getElementById('detailUrgency');
  urgBadge.textContent = scan.urgency || 'N/A';
  urgBadge.className = `badge ${getUrgencyBadgeClass(scan.urgency)}`;

  const statusBadge = document.getElementById('detailStatus');
  statusBadge.textContent = (scan.status || 'pending').replace('-', ' ');
  statusBadge.className = `badge ${getStatusBadgeClass(scan.status || 'pending')}`;
  statusBadge.style.textTransform = 'capitalize';

  const smsBadge = document.getElementById('detailSmsStatus');
  if (scan.sms_sent) {
    smsBadge.textContent = 'Sent';
    smsBadge.className = 'badge badge-complete';
  } else {
    smsBadge.textContent = 'Not Sent';
    smsBadge.className = 'badge badge-pending';
  }

  document.getElementById('detailTime').textContent = scan.created_at ? formatTime(scan.created_at) : 'Unknown';
  const engineEl = document.getElementById('detailEngine');
  if (engineEl) engineEl.textContent = scan.ai_engine || 'â€”';

  const analysisSection = document.getElementById('detailAnalysisSection');
  const analysisEl = document.getElementById('detailAnalysis');
  const recsEl = document.getElementById('detailRecommendations');
  const hasDetails = scan.ai_details || scan.ai_recommendations;
  if (analysisSection && hasDetails) {
    analysisSection.style.display = 'block';
    if (analysisEl) analysisEl.textContent = scan.ai_details || 'â€”';
    if (recsEl) recsEl.textContent = scan.ai_recommendations || 'â€”';
  } else if (analysisSection) {
    analysisSection.style.display = 'none';
  }

  _currentScan = scan;
  _currentAIContext = {
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

  if (scanGrid) scanGrid.style.display = 'none';
  if (filterTabs) filterTabs.style.display = 'none';
  if (criticalSection) criticalSection.style.display = 'none';
  detailView.style.display = 'block';
}

function closeDetail() {
  const detailView = document.getElementById('detailView');
  const scanGrid = document.getElementById('scanGrid');
  const filterTabs = document.querySelector('.filter-tabs');
  const criticalSection = document.querySelector('.content-card[style*="border-left: 5px solid #E63946"]');
  if (detailView) detailView.style.display = 'none';
  if (scanGrid) scanGrid.style.display = '';
  if (filterTabs) filterTabs.style.display = '';
  if (criticalSection) criticalSection.style.display = '';
  _currentScan = null;
}

function getUrgencyBadgeClass(urgency) {
  const map = { 'Critical': 'badge-critical', 'Urgent': 'badge-urgent', 'Moderate': 'badge-moderate', 'Normal': 'badge-normal' };
  return map[urgency] || 'badge-normal';
}
function getStatusBadgeClass(status) {
  if (status === 'completed') return 'badge-complete';
  if (status === 'urgent-flagged') return 'badge-urgent';
  return 'badge-pending';
}
// ---------- Review Actions ----------
async function updateScanStatus(scanId, status, note) {
  if (supabase) {
    try {
      const { error } = await supabase.from('scans').update({
        status,
        review_note: note || '',
        reviewed_at: new Date().toISOString()
      }).eq('id', scanId);
      if (error) console.log('Supabase update error:', error.message);
    } catch (err) {
      console.log('Supabase update skipped:', err.message);
    }
  }

  const scans = getLocalScans();
  const idx = scans.findIndex(s => String(s.id) === String(scanId));
  if (idx !== -1) {
    scans[idx].status = status;
    scans[idx].review_note = note || '';
    scans[idx].reviewed_at = new Date().toISOString();
    saveLocalScansLocal(scans);
    const memIdx = allScans.findIndex(s => String(s.id) === String(scanId));
    if (memIdx !== -1) allScans[memIdx] = { ...allScans[memIdx], ...scans[idx] };
  }
  broadcastScanChange('update', { id: scanId, status, review_note: note, reviewed_at: new Date().toISOString() });
}

function saveLocalScansLocal(scans) {
  try {
    localStorage.setItem('demoScans', JSON.stringify(scans));
    const v = (parseInt(localStorage.getItem('demoScansVersion') || '0', 10) || 0) + 1;
    localStorage.setItem('demoScansVersion', String(v));
  } catch (e) { /* ignore */ }
}

async function autoSendSmsOnReview(scan) {
  if (!scan) return;
  
  const phone = scan.patient_phone;
  if (!phone) {
    console.log('[SMS] No patient phone number — cannot auto-send SMS.');
    return;
  }

  // Don't send if already sent
  if (scan.sms_sent) {
    console.log('[SMS] SMS already sent for this scan — skipping.');
    return;
  }

  // Build appropriate message based on urgency
  const urgency = scan.urgency || 'Normal';
  const isCriticalOrUrgent = (urgency === 'Critical' || urgency === 'Urgent' || scan.priority_color === 'red' || scan.priority_color === 'orange');
  const message = isCriticalOrUrgent ? buildUrgentScanMessage(scan) : buildScanResultMessage(scan);

  try {
    console.log(`[SMS] Auto-sending real SMS to ${phone} for ${scan.patient_name}...`);
    await sendRealSMS(phone, message);
    
    // Mark SMS as sent in database + localStorage
    await updateSmsStatus(scan.id, true);
    
    if (_currentScan && String(_currentScan.id) === String(scan.id)) {
      _currentScan.sms_sent = true;
      _currentScan.sms_sent_at = new Date().toISOString();
    }
    
    console.log(`[SMS] ✓ Auto-SMS sent to ${phone}`);
    showToast(`📨 SMS sent to ${scan.patient_name || 'patient'}`, 'success');
  } catch (err) {
    // Log the error but don't block the review process
    console.error(`[SMS] Failed to auto-send SMS to ${phone}:`, err.message);
    showToast(`⚠ SMS delivery failed: ${err.message}. The review was still saved.`, 'info');
  }
}

async function approveScan() {
  if (!_currentScan) return;
  const scan = _currentScan;
  await updateScanStatus(scan.id, 'completed', 'Approved by radiologist');
  showToast('Scan approved successfully!', 'success');
  // Auto-send real SMS to patient
  await autoSendSmsOnReview(scan);
  setTimeout(() => { closeDetail(); renderScans(); renderStatsFromState(); renderCriticalAlertsFromState(); }, 600);
}
function flagUrgent() {
  if (!_currentScan) return;
  updateScanStatus(_currentScan.id, 'urgent-flagged', 'Flagged as urgent by radiologist');
  showToast('Scan marked as urgent!', 'info');
  setTimeout(() => { closeDetail(); renderScans(); renderStatsFromState(); renderCriticalAlertsFromState(); }, 600);
}
async function completeReview() {
  if (!_currentScan) return;
  const scan = _currentScan;
  await updateScanStatus(scan.id, 'completed', 'Review completed');
  showToast('Review completed!', 'success');
  // Auto-send real SMS to patient
  await autoSendSmsOnReview(scan);
  setTimeout(() => { closeDetail(); renderScans(); renderStatsFromState(); renderCriticalAlertsFromState(); }, 600);
}

// ---------- SMS: Show composer modal (Manual SMS) ----------
// This sends a REAL SMS via the server (no demo fallback).
// Auto-SMS is handled in approveScan / completeReview above.
function sendSMS() {
  const scan = _currentScan;
  if (!scan) { showToast('No scan selected.', 'error'); return; }
  const patientPhone = scan.patient_phone;
  const patientName = scan.patient_name || 'Patient';
  if (!patientPhone) { showToast('No phone number available for this patient.', 'error'); return; }

  // Remove existing modal
  const existing = document.getElementById('smsComposerModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'smsComposerModal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-card" onclick="event.stopPropagation()" style="max-width:520px;">
      <h3 style="color:var(--primary);margin:0 0 4px 0;">&#128241; Send SMS to Patient</h3>
      <p style="color:var(--text-light);font-size:0.85rem;margin:0 0 16px 0;">
        To: <strong>${escapeHtml(patientName)}</strong> &mdash; ${escapeHtml(patientPhone)}
        ${scan.sms_sent ? '<br><span style="color:#F4A261;">&#9888; Sent previously. Re-sending will notify the patient again.</span>' : ''}
      </p>
      <p style="font-size:0.78rem;color:#E63946;margin:0 0 12px 0;">
        &#9888; SMS is sent via Arkesel. Requires ARKESEL_API_KEY configured on server.
      </p>
      <div class="form-group" style="margin-bottom:16px;">
        <label for="smsMessage" style="display:block;font-weight:600;font-size:0.85rem;margin-bottom:6px;color:var(--text);">Your Message</label>
        <textarea id="smsMessage" rows="5" style="width:100%;padding:12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-family:inherit;font-size:0.9rem;color:var(--text);background:#FAFBFC;resize:vertical;"
          placeholder="Type your message to the patient...">Dear ${escapeHtml(patientName)}, your scan report has been reviewed. Please visit the hospital at your earliest convenience to collect the report.

For questions, call: ${CONTACT_PHONE}

Thank you.
- ScanFlow AI</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" id="smsCancelBtn" style="background:#fff;border:1.5px solid var(--border);color:var(--text);">Cancel</button>
        <button class="btn btn-primary btn-sm" id="smsSendBtn" style="background:linear-gradient(135deg, #0077B6, #00B4D8);">&#128241; Send SMS</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => { if (modal.parentNode) modal.remove(); };
  modal.addEventListener('click', close);
  document.getElementById('smsCancelBtn').onclick = close;

  document.getElementById('smsSendBtn').onclick = async () => {
    const message = document.getElementById('smsMessage').value.trim();
    if (!message) { showToast('Please type a message.', 'error'); return; }

    const sendBtn = document.getElementById('smsSendBtn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin:0;display:inline-block;vertical-align:middle;"></span> Sending...';

    try {
      // Send REAL SMS — no demo fallback. If the server has no ARKESEL_API_KEY,
      // the server will return a clear error message.
      await sendRealSMS(patientPhone, message);
      
      await updateSmsStatus(scan.id, true);
      showToast('SMS sent successfully!', 'success');
      const smsBadge = document.getElementById('detailSmsStatus');
      if (smsBadge) { smsBadge.textContent = 'Sent'; smsBadge.className = 'badge badge-complete'; }
      if (_currentScan) { _currentScan.sms_sent = true; _currentScan.sms_sent_at = new Date().toISOString(); }
      close();
    } catch (err) {
      showToast(`SMS failed: ${err.message}`, 'error');
      sendBtn.disabled = false;
      sendBtn.innerHTML = '&#128241; Send SMS';
    }
  };
}

async function updateSmsStatus(scanId, sent) {
  const now = new Date().toISOString();
  if (supabase) {
    try {
      await supabase.from('scans').update({ sms_sent: sent, sms_sent_at: sent ? now : null }).eq('id', scanId);
    } catch (err) {
      console.log('Supabase SMS status update skipped:', err.message);
    }
  }
  const scans = getLocalScans();
  const idx = scans.findIndex(s => String(s.id) === String(scanId));
  if (idx !== -1) {
    scans[idx].sms_sent = sent;
    scans[idx].sms_sent_at = sent ? now : null;
    saveLocalScansLocal(scans);
    const memIdx = allScans.findIndex(s => String(s.id) === String(scanId));
    if (memIdx !== -1) allScans[memIdx] = { ...allScans[memIdx], ...scans[idx] };
  }
  broadcastScanChange('update', { id: scanId, sms_sent: sent, sms_sent_at: sent ? now : null });
}
// ---------- AI Analysis ----------
function simulateAidocAI(scanType) {
  const URGENCY_LEVELS = ['Critical', 'Urgent', 'Moderate', 'Normal'];
  const urg = URGENCY_LEVELS[Math.floor(Math.random() * URGENCY_LEVELS.length)];
  const conf = Math.floor(Math.random() * 40) + 50;
  return {
    aiResult: 'Simulated Finding: Abnormalities detected.',
    details: 'This is a simulated analysis. Configure your Gemini API key for real image analysis.',
    urgency: urg,
    confidence: conf,
    anatomicalRegion: 'General',
    recommendations: 'This is a demo result. For real clinical analysis, please configure an API key.',
    aiEngine: 'Simulated',
    category: scanType
  };
}

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

async function runAIAnalysis() {
  const scan = _currentScan;
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
      } catch (e) { console.warn('Could not fetch image as base64, using fallback.', e); }
    }
    if (await isAIConfigured() && base64) {
      showToast('Sending image to AI for analysis...', 'info');
      try { ai = await analyzeImageWithAI(base64, mimeType, scan.scan_type, scan.patient_name); }
      catch (err) {
        console.error('AI API error:', err);
        if (err.message.toLowerCase().includes('timeout') || err.message.includes('504')) {
          showToast('Gemini request timed out. Using simulated analysis...', 'error');
        } else {
          showToast('AI API error, falling back to simulation...', 'error');
        }
        ai = simulateAidocAI(scan.scan_type);
      }
    } else {
      showToast('Running simulated AI analysis...', 'info');
      await new Promise(r => setTimeout(r, 1500));
      ai = simulateAidocAI(scan.scan_type);
    }
    _currentAIContext = ai;
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
      } catch (e) { console.warn('Supabase update failed:', e); }
    }
    const scans = getLocalScans();
    const idx = scans.findIndex(s => String(s.id) === String(scan.id));
    if (idx !== -1) {
      scans[idx] = { ...scans[idx], ...scan };
      saveLocalScansLocal(scans);
    }
    const memIdx = allScans.findIndex(s => String(s.id) === String(scan.id));
    if (memIdx !== -1) allScans[memIdx] = { ...allScans[memIdx], ...scan };
    broadcastScanChange('update', scan);
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
    if (btn) { btn.disabled = false; btn.innerHTML = 'ðŸ¤– Analyze with AI'; }
  }
}

// ---------- Chat ----------
async function handleChatSubmit() {
  const aiChatInput = document.getElementById('aiChatInput');
  const aiChatBtn = document.getElementById('aiChatBtn');
  const aiChatHistory = document.getElementById('aiChatHistory');
  if (!aiChatInput || !aiChatBtn || !aiChatHistory) return;
  const query = aiChatInput.value.trim();
  if (!query) return;
  const userMsg = document.createElement('div');
  userMsg.innerHTML = `<strong>You:</strong> ${escapeHtml(query)}`;
  userMsg.style.background = 'rgba(0,119,182,0.1)';
  userMsg.style.padding = '8px';
  userMsg.style.borderRadius = '6px';
  aiChatHistory.appendChild(userMsg);
  aiChatInput.value = '';
  aiChatBtn.disabled = true;
  aiChatBtn.textContent = '...';
  aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
  try {
    const scan = _currentScan || {};
    const context = _currentAIContext || {};
    if (scan.patient_name) context.patientName = scan.patient_name;
    if (scan.scan_type) context.scanType = scan.scan_type;
    if (scan.ai_result) context.aiResult = scan.ai_result;
    if (scan.ai_details) context.details = scan.ai_details;
    const reply = await sendChatMessage(query, context);
    const aiMsg = document.createElement('div');
    aiMsg.innerHTML = `<strong>AI:</strong> ${escapeHtml(reply)}`;
    aiMsg.style.background = 'rgba(0,0,0,0.03)';
    aiMsg.style.padding = '8px';
    aiMsg.style.borderRadius = '6px';
    aiChatHistory.appendChild(aiMsg);
  } catch (err) {
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

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
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
    <text x="200" y="115" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-family="sans-serif" font-size="48">ðŸ¥</text>
    <text x="200" y="155" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="sans-serif" font-size="14">${scanType || 'Medical Scan'}</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

// ---------- Realtime integration ----------
// Apply a single scan change (insert/update/delete) to in-memory state and re-render.
function applyRealtimeChange(event, scan) {
  if (!scan) return;
  if (event === 'insert' || event === 'update') {
    // Merge into local cache (in case realtime arrived before our localStorage write)
    upsertLocalScan(scan);
    const idx = allScans.findIndex(s => String(s.id) === String(scan.id));
    if (idx === -1) allScans.unshift(scan);
    else allScans[idx] = { ...allScans[idx], ...scan };
  } else if (event === 'delete') {
    removeLocalScan(scan.id);
    allScans = allScans.filter(s => String(s.id) !== String(scan.id));
  } else if (event === 'refresh') {
    // Another tab rewrote the local list â€” re-read it
    allScans = getLocalScans();
  }
  renderScans();
  renderStatsFromState();
  renderCriticalAlertsFromState();
  if (typeof renderAllScansTable === 'function') {
    _allScansCache = allScans;
    renderAllScansTable();
  }
  if (event === 'insert') {
    showToast(`ðŸ“¥ New scan: ${scan.patient_name || 'Unknown'}`, 'success');
  } else if (event === 'update') {
    showToast(`ðŸ”„ Scan updated: ${scan.patient_name || 'Unknown'}`, 'info');
  } else if (event === 'delete') {
    showToast(`ðŸ—‘ï¸ Scan removed`, 'info');
  }
}

// ---------- Init ----------
function initDashboard() {
  if (window.authUtils) window.authUtils.requireAuth();
  loadStats();
  loadCriticalAlerts();
  loadScans();
  setupRealtimeSync({
    onChange: applyRealtimeChange,
    onStatus: (status) => {
      console.log('[Dashboard] Realtime status:', status);
    }
  });
  const menuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuBtn) menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
  if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}

// ============================================================
// ---------- All Scans Section ------------------------------
// ============================================================

let _allScansCache = [];
let _allScansFilterText = '';

async function loadAllScansView() {
  const container = document.getElementById('allScansTableContainer');
  if (!container) return;
  container.innerHTML = `
    <div style="text-align:center;padding:60px 24px;">
      <div class="spinner"></div>
      <p style="margin-top:12px;color:var(--text-light);font-size:0.85rem;">Loading all scans...</p>
    </div>`;
  // Use the same data the dashboard uses so they stay in sync
  _allScansCache = await collectAllScans();
  allScans = _allScansCache;
  _allScansCache.sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });
  renderAllScansTable();
}

function renderAllScansTable() {
  const container = document.getElementById('allScansTableContainer');
  const countEl = document.getElementById('allScansCount');
  if (!container) return;

  const q = (_allScansFilterText || '').trim().toLowerCase();
  const list = q
    ? _allScansCache.filter(s => {
        const hay = [s.patient_name, s.patient_number, s.scan_type, s.urgency, s.ai_result, s.status, s.ai_engine, s.priority_color]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
    : _allScansCache;

  if (countEl) countEl.textContent = `${list.length} of ${_allScansCache.length} scan${_allScansCache.length === 1 ? '' : 's'}`;

  if (_allScansCache.length === 0) {
    container.innerHTML = `
      <div class="all-scans-empty">
        <div class="empty-icon">ðŸ“­</div>
        <h3 style="margin:0 0 8px 0;color:var(--text);">No scans available</h3>
        <p style="margin:0;font-size:0.9rem;">Scans uploaded by radiographers will appear here automatically.</p>
      </div>`;
    return;
  }
  if (list.length === 0) {
    container.innerHTML = `
      <div class="all-scans-empty">
        <div class="empty-icon">ðŸ”</div>
        <h3 style="margin:0 0 8px 0;color:var(--text);">No scans match your search</h3>
        <p style="margin:0;font-size:0.9rem;">Try a different keyword.</p>
      </div>`;
    return;
  }

  const rows = list.map(scan => {
    const priority = getPriorityClass(scan);
    const priorityLabel = getPriorityLabel(scan);
    const imgSrc = (scan.image_url && scan.image_url !== 'demo-image-url' && scan.image_url !== '')
      ? scan.image_url
      : generatePlaceholder(scan.scan_type);
    const safeId = String(scan.id).replace(/'/g, "\\'");
    const patient = escapeHtml(scan.patient_name || 'Unknown');
    const scanType = escapeHtml(scan.scan_type || 'N/A');
    const patientNumber = escapeHtml(scan.patient_number || 'â€”');
    const aiResult = escapeHtml(scan.ai_result || 'Pending analysis');
    const time = scan.created_at ? formatTime(scan.created_at) : 'â€”';
    const confidence = (scan.confidence != null && scan.confidence !== '') ? scan.confidence + '%' : 'â€”';
    const status = (scan.status || 'pending').replace('-', ' ');
    const statusClass = scan.status === 'completed' ? 'badge-complete'
      : scan.status === 'urgent-flagged' ? 'badge-urgent' : 'badge-pending';
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);
    return `
      <tr data-scan-id="${safeId}">
        <td>
          <div class="patient-cell">
            <img class="patient-thumb" src="${imgSrc}" alt="Scan" onerror="this.src='${generatePlaceholder(scan.scan_type)}'">
            <div>
              <div class="patient-name">${patient}</div>
              <div class="patient-meta">#${patientNumber} Â· Age ${scan.patient_age || 'â€”'}</div>
            </div>
          </div>
        </td>
        <td>${scanType}</td>
        <td><span class="badge ${priority === 'critical' ? 'badge-critical' : priority === 'urgent' ? 'badge-urgent' : 'badge-normal'}">${priorityLabel}</span></td>
        <td>${aiResult}</td>
        <td>${confidence}</td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td>${time}</td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon btn-view" title="View details" onclick="window.dashUtils.openScanFromAllScans('${safeId}')">ðŸ‘ï¸</button>
            <button class="btn-icon btn-delete" title="Delete scan" onclick="window.dashUtils.confirmDeleteScan('${safeId}')">ðŸ—‘ï¸</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="all-scans-table">
      <thead>
        <tr>
          <th>Patient</th>
          <th>Scan Type</th>
          <th>Priority</th>
          <th>AI Finding</th>
          <th>Confidence</th>
          <th>Status</th>
          <th>Uploaded</th>
          <th style="text-align:right;">Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function filterAllScansView() {
  const input = document.getElementById('allScansSearch');
  _allScansFilterText = input ? input.value : '';
  renderAllScansTable();
}

function openScanFromAllAllScansTable(scanId) {
  const scan = _allScansCache.find(s => String(s.id) === String(scanId));
  if (!scan) { showToast('Scan not found.', 'error'); return; }
  // Make sure in-memory state has this scan
  const memIdx = allScans.findIndex(s => String(s.id) === String(scanId));
  if (memIdx === -1) allScans.unshift(scan);
  else allScans[memIdx] = { ...allScans[memIdx], ...scan };
  showSection('dashboard');
  openScanDetail(scanId);
}

function confirmDeleteScan(scanId) {
  const scan = _allScansCache.find(s => String(s.id) === String(scanId)) || allScans.find(s => String(s.id) === String(scanId));
  if (!scan) { showToast('Scan not found.', 'error'); return; }
  const existing = document.getElementById('deleteConfirmModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'deleteConfirmModal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-card" onclick="event.stopPropagation()">
      <h3>ðŸ—‘ï¸ Delete this scan?</h3>
      <div class="modal-patient">
        <strong>${escapeHtml(scan.patient_name || 'Unknown')}</strong>
        <br>${escapeHtml(scan.scan_type || 'N/A')} Â· Uploaded ${scan.created_at ? formatTime(scan.created_at) : 'â€”'}
      </div>
      <p>This action is permanent. The scan, its AI analysis, and review history will be removed for everyone.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" id="cancelDeleteBtn" style="background:#fff;border:1.5px solid var(--border);color:var(--text);">Cancel</button>
        <button class="btn btn-danger btn-sm" id="confirmDeleteBtn">ðŸ—‘ï¸ Yes, delete</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const closeModal = () => { if (modal.parentNode) modal.remove(); };
  modal.addEventListener('click', closeModal);
  const cancelBtn = document.getElementById('cancelDeleteBtn');
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deletingâ€¦';
      try {
        await deleteScan(scanId);
        closeModal();
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'ðŸ—‘ï¸ Yes, delete';
      }
    });
  }
}

async function deleteScan(scanId) {
  if (supabase) {
    try {
      const { error } = await supabase.from('scans').delete().eq('id', scanId);
      if (error) console.log('[Delete] Supabase error:', error.message);
    } catch (err) { console.log('[Delete] Supabase delete skipped:', err.message); }
  }
  removeLocalScan(scanId);
  allScans = allScans.filter(s => String(s.id) !== String(scanId));
  _allScansCache = _allScansCache.filter(s => String(s.id) !== String(scanId));
  broadcastScanChange('delete', { id: scanId });
  renderAllScansTable();
  renderScans();
  renderStatsFromState();
  renderCriticalAlertsFromState();
  if (_currentScan && String(_currentScan.id) === String(scanId)) {
    closeDetail();
    showSection('all-scans');
  }
  showToast('Scan deleted successfully.', 'success');
}

window.dashUtils = {
  openScanDetail,
  closeDetail,
  approveScan,
  flagUrgent,
  completeReview,
  sendSMS,
  runAIAnalysis,
  handleChatSubmit,
  loadAllScansView,
  filterAllScansView,
  openScanFromAllScans: openScanFromAllAllScansTable,
  confirmDeleteScan,
  deleteScan,
  showSection,
  refreshScans
};
window.filterScans = filterScans;
window.refreshScans = refreshScans;
