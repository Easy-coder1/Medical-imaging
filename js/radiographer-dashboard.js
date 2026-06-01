// ===== ScanFlow AI — Radiographer Dashboard Module =====
import { supabase } from './supabase-config.js';

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

// ---------- Load Stats ----------
async function loadStats() {
  let total = 0, reviewed = 0, pending = 0, critical = 0;
  let supabaseSuccess = false;

  if (supabase) {
    try {
      const { data: scans, error } = await supabase.from('scans').select('*');
      if (!error && scans && scans.length > 0) {
        supabaseSuccess = true;
        total = scans.length;
        scans.forEach(s => {
          if (s.status === 'completed') reviewed++;
          if (s.status === 'pending' || !s.status) pending++;
          if (s.urgency === 'Critical' || s.priority_color === 'red') critical++;
        });
      }
    } catch (err) {
      console.log('Supabase query failed:', err.message);
    }
  }

  // Fallback to localStorage if Supabase didn't return data
  if (!supabaseSuccess) {
    const demoScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
    total = demoScans.length;
    reviewed = demoScans.filter(s => s.status === 'completed').length;
    pending = demoScans.filter(s => s.status === 'pending' || !s.status).length;
    critical = demoScans.filter(s => s.urgency === 'Critical' || s.priority_color === 'red').length;
  }

  // Animate counters
  animateCounter('statTotal', total);
  animateCounter('statReviewed', reviewed);
  animateCounter('statPending', pending);
  animateCounter('statCritical', critical);
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

// ---------- Load Uploads Table ----------
async function loadUploads() {
  const tbody = document.getElementById('uploadsTableBody');
  if (!tbody) return;

  let scans = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error && data) scans = data;
    } catch (err) {
      console.log('Supabase query failed:', err.message);
    }
  }

  // Always merge localStorage demo scans with Supabase scans
  const localScans = JSON.parse(localStorage.getItem('demoScans') || '[]');
  if (localScans.length > 0) {
    const existingIds = new Set(scans.map(s => String(s.id)));
    const newLocalScans = localScans.filter(s => !existingIds.has(String(s.id)));
    if (newLocalScans.length > 0) {
      scans = [...scans, ...newLocalScans];
    }
  }

  // Sort by created_at descending and limit to 20
  scans.sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
  scans = scans.slice(0, 20);

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

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  if (window.authUtils) window.authUtils.requireAuth();
  loadStats();
  loadUploads();

  // Sidebar toggle for mobile
  const menuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuBtn) menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
  if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
});