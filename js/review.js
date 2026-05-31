// ===== ScanFlow AI — Review Module (Supabase) =====
import { supabase } from './supabase-config.js';

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

  // 1. Built-in demo data (always available)
  const demoData = getDemoScans();
  demoData.forEach(s => allScans.push(s));

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

  // Fallback to local data
  if (scans.length === 0) {
    scans = getAllScans();
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
  document.getElementById('detailScanType').textContent = scan.scan_type || 'N/A';
  document.getElementById('detailFinding').textContent = scan.ai_result || 'Pending';
  document.getElementById('detailConfidence').textContent = (scan.confidence || '--') + '%';

  const urgBadge = document.getElementById('detailUrgency');
  urgBadge.textContent = scan.urgency || 'N/A';
  urgBadge.className = `badge ${getUrgencyBadge(scan.urgency)}`;

  const statusBadge = document.getElementById('detailStatus');
  statusBadge.textContent = (scan.status || 'pending').replace('-', ' ');
  statusBadge.className = `badge ${getStatusBadge(scan.status || 'pending')}`;
  statusBadge.style.textTransform = 'capitalize';

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
document.addEventListener('DOMContentLoaded', () => {
  if (window.authUtils) window.authUtils.requireAuth();
  loadScanList();

  const menuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuBtn) menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
  if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
});

window.reviewUtils = { openReview, closeReview, approveScan, flagUrgent, completeReview };