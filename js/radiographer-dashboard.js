// ===== ScanFlow AI — Radiographer Dashboard Module =====
import { supabase } from './supabase-config.js';
import './auth.js';
import { setupRealtimeSync, getLocalScans, upsertLocalScan, removeLocalScan, broadcastScanChange } from './realtime-sync.js';

// ---------- State ----------
let allScans = [];

// ---------- Priority Color Helpers ----------
function getPriorityColorDot(color) {
  const colors = {
    'red': 'background: #E63946; box-shadow: 0 0 8px rgba(230,57,70,0.5);',
    'orange': 'background: #F4A261; box-shadow: 0 0 8px rgba(244,162,97,0.5);',
    'green': 'background: #2EC4B6; box-shadow: 0 0 8px rgba(46,196,182,0.5);'
  };
  const style = colors[color] || colors['green'];
  return `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;${style}" title="${color}"></span>`;
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

// ---------- Collect scans from Supabase + localStorage ----------
async function collectAllScans() {
  let scans = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) scans = data;
      else if (error) console.log('[Radiographer Dashboard] Supabase error:', error.message);
    } catch (err) {
      console.log('[Radiographer Dashboard] Supabase query failed:', err.message);
    }
  }

  // Merge in local scans (so freshly uploaded ones show up immediately)
  const local = getLocalScans();
  if (local.length > 0) {
    const existingIds = new Set(scans.map(s => String(s.id)));
    const newLocal = local.filter(s => s && s.id != null && !existingIds.has(String(s.id)));
    if (newLocal.length > 0) scans = [...scans, ...newLocal];
  }

  // Dedupe + sort
  const seen = new Set();
  scans = scans.filter(s => {
    if (!s || s.id == null) return false;
    const k = String(s.id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  scans.sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });

  return scans;
}

// ---------- Load Stats ----------
function renderStatsFromState() {
  let total = 0, reviewed = 0, pending = 0, critical = 0;
  total = allScans.length;
  allScans.forEach(s => {
    if (s.status === 'completed') reviewed++;
    if (s.status === 'pending' || !s.status) pending++;
    if (s.urgency === 'Critical' || s.priority_color === 'red') critical++;
  });
  animateCounter('statTotal', total);
  animateCounter('statReviewed', reviewed);
  animateCounter('statPending', pending);
  animateCounter('statCritical', critical);
}

async function loadStats() {
  try { allScans = await collectAllScans(); } catch (e) { console.warn(e); }
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

// ---------- Load Uploads Table ----------
function renderUploads() {
  const tbody = document.getElementById('uploadsTableBody');
  if (!tbody) return;

  // Limit to 20 most recent
  const scans = allScans.slice(0, 20);

  if (scans.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:40px;color:var(--text-light);">
          <div style="font-size:2rem;margin-bottom:12px;">📭</div>
          <p>No uploads yet. <a href="radiographer-upload.html" style="color:var(--primary);">Upload your first scan</a></p>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = scans.map(scan => {
    const time = scan.created_at ? formatTime(scan.created_at) : 'Recent';
    const priorityColor = scan.priority_color || 'green';
    return `
      <tr>
        <td style="text-align:center;">${getPriorityColorDot(priorityColor)}</td>
        <td><strong>${escapeHtml(scan.patient_name || 'Unknown')}</strong></td>
        <td>${escapeHtml(scan.patient_number || '—')}</td>
        <td>${escapeHtml(scan.scan_type || 'N/A')}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(scan.ai_result || '')}">
          ${escapeHtml(scan.ai_result || 'Pending')}
        </td>
        <td>${getUrgencyBadge(scan.urgency)}</td>
        <td>${getStatusBadge(scan.status)}</td>
        <td style="font-size:0.85rem;color:var(--text-light);">${time}</td>
      </tr>`;
  }).join('');
}

async function loadUploads() {
  try { allScans = await collectAllScans(); } catch (e) { console.warn(e); }
  renderUploads();
}

// ---------- Realtime handler ----------
function applyRealtimeChange(event, scan) {
  if (!scan) return;
  if (event === 'insert' || event === 'update') {
    upsertLocalScan(scan);
    const idx = allScans.findIndex(s => String(s.id) === String(scan.id));
    if (idx === -1) allScans.unshift(scan);
    else allScans[idx] = { ...allScans[idx], ...scan };
  } else if (event === 'delete') {
    removeLocalScan(scan.id);
    allScans = allScans.filter(s => String(s.id) !== String(scan.id));
  } else if (event === 'refresh') {
    allScans = getLocalScans();
  }
  renderUploads();
  renderStatsFromState();
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

// ---------- Init ----------
function initDashboard() {
  if (window.authUtils) window.authUtils.requireAuth();
  loadStats();
  loadUploads();
  setupRealtimeSync({
    onChange: applyRealtimeChange,
    onStatus: (status) => console.log('[Radiographer Dashboard] Realtime:', status)
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
