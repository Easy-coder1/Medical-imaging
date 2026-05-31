// ===== ScanFlow AI — Dashboard Module (Supabase) =====
import { supabase } from './supabase-config.js';

// ---------- AI Simulation Data ----------
const URGENCY_LEVELS = [
  { label: 'Critical', class: 'badge-critical', color: '#E63946' },
  { label: 'Urgent', class: 'badge-urgent', color: '#F4A261' },
  { label: 'Moderate', class: 'badge-moderate', color: '#0096C7' },
  { label: 'Normal', class: 'badge-normal', color: '#2EC4B6' }
];

function getUrgencyForFinding(finding) {
  if (!finding) return URGENCY_LEVELS[3];
  // Critical: life-threatening conditions
  if (finding.includes('Hemorrhage') || finding.includes('Embolism') || finding.includes('Dissection') ||
      finding.includes('Pneumothorax') || finding.includes('Stroke') || finding.includes('Subdural') ||
      finding.includes('Epidural') || finding.includes('Subarachnoid')) return URGENCY_LEVELS[0];
  // Urgent: needs prompt attention
  if (finding.includes('Fracture') || finding.includes('Suspected') || finding.includes('Perforation') ||
      finding.includes('Effusion') || finding.includes('Hydronephrosis') || finding.includes('Follow-up')) return URGENCY_LEVELS[1];
  // Moderate: findings that need monitoring
  if (finding.includes('Nodule') || finding.includes('Abnormality') || finding.includes('Enlargement') ||
      finding.includes('Calcification') || finding.includes('Ventriculomegaly') ||
      finding.includes('Degenerative') || finding.includes('Lesion')) return URGENCY_LEVELS[2];
  // Normal
  return URGENCY_LEVELS[3];
}

// ---------- Load Stats ----------
async function loadStats() {
  let total = 0, urgent = 0, flagged = 0, pending = 0;

  if (supabase) {
    try {
      const { data: scans, error } = await supabase.from('scans').select('urgency, ai_result, status');
      if (!error && scans) {
        total = scans.length;
        scans.forEach(s => {
          if (s.urgency === 'Critical' || s.urgency === 'Urgent') urgent++;
          if (s.ai_result && s.ai_result !== 'Normal Scan') flagged++;
          if (s.status === 'pending' || !s.status) pending++;
        });
      }
    } catch (err) {
      console.log('Supabase query failed, using demo stats:', err.message);
      total = 127; urgent = 18; flagged = 43; pending = 12;
    }
  } else {
    // Demo mode
    const demoScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
    total = demoScans.length || 127;
    urgent = demoScans.filter(s => s.urgency === 'Critical' || s.urgency === 'Urgent').length || 18;
    flagged = demoScans.filter(s => s.aiResult && s.aiResult !== 'Normal Scan').length || 43;
    pending = demoScans.filter(s => s.status === 'pending' || !s.status).length || 12;
  }

  animateCounter('statTotal', total);
  animateCounter('statUrgent', urgent);
  animateCounter('statFlagged', flagged);
  animateCounter('statPending', pending);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(interval); }
    el.textContent = current;
  }, 30);
}

// ---------- Load Recent Activity ----------
async function loadRecentActivity() {
  const tbody = document.getElementById('recentActivityBody');
  if (!tbody) return;

  let scans = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8);
      if (!error && data) scans = data;
    } catch (err) {
      console.log('Supabase query failed:', err.message);
    }
  }

  if (scans.length === 0) {
    tbody.innerHTML = generateDemoRows();
    return;
  }

  tbody.innerHTML = '';
  scans.forEach(scan => {
    const urgency = getUrgencyForFinding(scan.ai_result);
    const time = scan.created_at ? formatTime(scan.created_at) : 'Just now';
    tbody.innerHTML += `
      <tr>
        <td><strong>${escapeHtml(scan.patient_name || 'Unknown')}</strong></td>
        <td>${escapeHtml(scan.scan_type || 'N/A')}</td>
        <td>${escapeHtml(scan.ai_result || 'Pending')}</td>
        <td><span class="badge ${urgency.class}">${urgency.label}</span></td>
        <td>${escapeHtml(String(scan.confidence || '--'))}%</td>
        <td>${time}</td>
      </tr>`;
  });
}

function generateDemoRows() {
  const demoData = [
    { name: 'Sarah Johnson', type: 'CT Brain', finding: 'Intracranial Hemorrhage — Subdural Hematoma', conf: 96 },
    { name: 'James Wilson', type: 'X-Ray Chest', finding: 'No Acute Findings', conf: 8 },
    { name: 'Maria Garcia', type: 'CT Angiography', finding: 'Pulmonary Embolism Detected', conf: 89 },
    { name: 'Robert Chen', type: 'CT Abdomen', finding: 'Free Air — Possible Bowel Perforation', conf: 82 },
    { name: 'Emma Davis', type: 'MRI Brain', finding: 'No Significant Abnormality', conf: 11 },
    { name: 'Ahmed Hassan', type: 'CT Brain', finding: 'Intracranial Hemorrhage — Epidural Hematoma', conf: 93 },
  ];
  return demoData.map(d => {
    const urg = getUrgencyForFinding(d.finding);
    return `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td>${d.type}</td>
        <td>${d.finding}</td>
        <td><span class="badge ${urg.class}">${urg.label}</span></td>
        <td>${d.conf}%</td>
        <td>${Math.floor(Math.random() * 59) + 1}m ago</td>
      </tr>`;
  }).join('');
}

// ---------- Load Emergency Alerts ----------
async function loadAlerts() {
  const container = document.getElementById('alertsList');
  if (!container) return;

  let alerts = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (!error && data) {
        data.forEach(scan => {
          const urg = getUrgencyForFinding(scan.ai_result);
          if (urg.label === 'Critical' || urg.label === 'Urgent') {
            alerts.push({
              text: `${scan.patient_name || 'Unknown'} — ${scan.ai_result || 'Analysis pending'}`,
              time: scan.created_at ? formatTime(scan.created_at) : 'Just now'
            });
          }
        });
      }
    } catch (err) {
      console.log('Supabase query failed:', err.message);
    }
  }

  if (alerts.length === 0) {
    container.innerHTML = generateDemoAlerts();
  } else {
    container.innerHTML = alerts.map(a => `
      <div class="alert-item">
        <div class="alert-dot"></div>
        <span class="alert-text"><strong>${escapeHtml(a.text)}</strong></span>
        <span class="alert-time">${a.time}</span>
      </div>`).join('');
  }
}

function generateDemoAlerts() {
  return `
    <div class="alert-item">
      <div class="alert-dot"></div>
      <span class="alert-text"><strong>Sarah Johnson — Intracranial Hemorrhage (Critical, 96%)</strong></span>
      <span class="alert-time">3m ago</span>
    </div>
    <div class="alert-item">
      <div class="alert-dot"></div>
      <span class="alert-text"><strong>Maria Garcia — Pulmonary Embolism Detected (Critical, 89%)</strong></span>
      <span class="alert-time">30m ago</span>
    </div>
    <div class="alert-item">
      <div class="alert-dot"></div>
      <span class="alert-text"><strong>Ahmed Hassan — Epidural Hematoma (Critical, 93%)</strong></span>
      <span class="alert-time">10m ago</span>
    </div>`;
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
    return date.toLocaleDateString();
  } catch { return 'Recent'; }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  if (window.authUtils) window.authUtils.requireAuth();
  loadStats();
  loadRecentActivity();
  loadAlerts();

  // Sidebar toggle for mobile
  const menuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuBtn) menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
  if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
});

window.dashboardUtils = { escapeHtml, formatTime, getUrgencyForFinding };