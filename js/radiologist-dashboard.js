// ===== ScanFlow AI — Radiologist Dashboard Module =====
import { supabase } from './supabase-config.js';

// ---------- State ----------
let allScans = [];
let currentFilter = 'all';

// ---------- Priority Helpers ----------
function getPriorityClass(scan) {
  // Use the higher priority between urgency and priority_color
  if (scan.urgency === 'Critical' || scan.priority_color === 'red') return 'critical';
  if (scan.urgency === 'Urgent' || scan.priority_color === 'orange') return 'urgent';
  return 'normal';
}

function getPriorityLabel(scan) {
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
  const map = { 
    'Critical': 'badge-critical', 
    'Urgent': 'badge-urgent', 
    'Moderate': 'badge-moderate', 
    'Normal': 'badge-normal' 
  };
  return `<span class="badge ${map[urgency] || 'badge-normal'}">${urgency || 'N/A'}</span>`;
}

// ---------- Load Stats ----------
async function loadStats() {
  let total = 0, critical = 0, urgent = 0, reviewed = 0;

  if (supabase) {
    try {
      const { data: scans, error } = await supabase.from('scans').select('*');
      if (!error && scans) {
        total = scans.length;
        scans.forEach(s => {
          const priority = getPriorityClass(s);
          if (priority === 'critical') critical++;
          if (priority === 'urgent') urgent++;
          if (s.status === 'completed') reviewed++;
        });
      }
    } catch (err) {
      console.log('Supabase query failed:', err.message);
    }
  } else {
    // Demo mode
    const demoScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
    total = demoScans.length;
    critical = demoScans.filter(s => getPriorityClass(s) === 'critical').length;
    urgent = demoScans.filter(s => getPriorityClass(s) === 'urgent').length;
    reviewed = demoScans.filter(s => s.status === 'completed').length;
  }

  animateCounter('statTotal', total);
  animateCounter('statCritical', critical);
  animateCounter('statUrgent', urgent);
  animateCounter('statReviewed', reviewed);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 20));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(interval); }
    el.textContent = current;
  }, 30);
}

// ---------- Load Critical Alerts ----------
async function loadCriticalAlerts() {
  const container = document.getElementById('criticalAlertsList');
  if (!container) return;

  let criticalScans = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        criticalScans = data.filter(s => getPriorityClass(s) === 'critical' && s.status !== 'completed');
      }
    } catch (err) {
      console.log('Supabase query failed:', err.message);
    }
  } else {
    const demoScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
    criticalScans = demoScans.filter(s => getPriorityClass(s) === 'critical' && s.status !== 'completed');
  }

  if (criticalScans.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:16px;color:var(--success);">
        <div style="font-size:1.5rem;margin-bottom:8px;">✅</div>
        <p style="font-size:0.9rem;">No critical cases pending!</p>
      </div>`;
    return;
  }

  container.innerHTML = criticalScans.slice(0, 3).map(scan => {
    const time = scan.created_at ? formatTime(scan.created_at) : 'Just now';
    return `
      <div class="alert-item" style="cursor:pointer;" onclick="openScanDetail('${scan.id}')">
        <div class="alert-dot"></div>
        <span class="alert-text">
          <strong>${escapeHtml(scan.patient_name || 'Unknown')}</strong> — 
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

// ---------- Load Scan Grid ----------
async function loadScans() {
  const grid = document.getElementById('scanGrid');
  if (!grid) return;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        allScans = data;
      }
    } catch (err) {
      console.log('Supabase query failed:', err.message);
    }
  }

  if (allScans.length === 0) {
    const demoScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
    allScans = demoScans;
  }

  renderScans();
}

function renderScans() {
  const grid = document.getElementById('scanGrid');
  if (!grid) return;

  // Filter scans
  let filtered = allScans;
  if (currentFilter !== 'all') {
    filtered = allScans.filter(scan => getPriorityClass(scan) === currentFilter);
  }

  // Sort by priority (critical first, then urgent, then normal), then by time
  filtered.sort((a, b) => {
    const priorityOrder = { 'critical': 0, 'urgent': 1, 'normal': 2 };
    const aPriority = priorityOrder[getPriorityClass(a)];
    const bPriority = priorityOrder[getPriorityClass(b)];
    if (aPriority !== bPriority) return aPriority - bPriority;
    
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="text-align:center;padding:60px 24px;grid-column:1/-1;">
        <div style="font-size:3rem;margin-bottom:12px;opacity:0.3;">📭</div>
        <p style="color:var(--text-light);font-size:0.9rem;">No scans found for this filter.</p>
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
    
    return `
      <div class="priority-scan-card ${priority}" onclick="openScanDetail('${scan.id}')">
        <div class="priority-indicator ${priority}"></div>
        <img class="scan-preview" src="${imgSrc}" alt="Scan preview"
             onerror="this.src='${generatePlaceholder(scan.scan_type)}'">
        <div class="card-header">
          <div>
            <div class="patient-name">${escapeHtml(scan.patient_name || 'Unknown')}</div>
            <div class="scan-type">${escapeHtml(scan.scan_type || 'N/A')} | Age: ${scan.patient_age || '—'}</div>
          </div>
          <span class="badge ${priority === 'critical' ? 'badge-critical' : priority === 'urgent' ? 'badge-urgent' : 'badge-normal'}">${priorityLabel}</span>
        </div>
        <div class="ai-finding">${escapeHtml(scan.ai_result || 'Pending analysis...')}</div>
        <div class="card-footer">
          <div class="confidence">Confidence: <strong>${scan.confidence || '—'}%</strong></div>
          <div class="time-ago">🕐 ${time}</div>
        </div>
        <div style="margin-top:12px;">
          ${getStatusBadge(scan.status)}
          ${scan.sms_sent ? '<span class="badge badge-complete">SMS Sent</span>' : '<span class="badge badge-pending">SMS Pending</span>'}
        </div>
      </div>`;
  }).join('');
}

// ---------- Filter Function ----------
function filterScans(filter) {
  currentFilter = filter;
  
  // Update active tab
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });
  
  renderScans();
}

// Make filterScans globally available
window.filterScans = filterScans;

// ---------- Open Scan Detail ----------
function openScanDetail(scanId) {
  // Redirect to review page with scan ID
  window.location.href = `review.html?id=${scanId}`;
}

// Make openScanDetail globally available
window.openScanDetail = openScanDetail;

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
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
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
    <text x="200" y="115" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-family="sans-serif" font-size="48">🏥</text>
    <text x="200" y="155" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-family="sans-serif" font-size="14">${scanType || 'Medical Scan'}</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  if (window.authUtils) window.authUtils.requireAuth();
  loadStats();
  loadCriticalAlerts();
  loadScans();

  // Sidebar toggle for mobile
  const menuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuBtn) menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
  if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });

  // Check for scan ID in URL (for direct linking)
  const urlParams = new URLSearchParams(window.location.search);
  const scanId = urlParams.get('id');
  if (scanId) {
    openScanDetail(scanId);
  }
});