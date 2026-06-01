// ===== ScanFlow AI — Realtime & Cross-Tab Sync Module =====
// Handles:
//   1. Supabase Postgres realtime subscription (INSERT / UPDATE / DELETE)
//   2. Cross-tab localStorage broadcasting (BroadcastChannel + storage event fallback)
//   3. Surgical state updates so the UI never has to do a full reload
//
// Usage:
//   import { setupRealtimeSync, broadcastScanChange } from './realtime-sync.js';
//   setupRealtimeSync({ onChange: (event, scan) => { ... } });
//   broadcastScanChange('insert', scanObject);

import { supabase } from './supabase-config.js';

const CHANNEL_NAME = 'scanflow-sync';
const STORAGE_KEY = 'demoScans';
const STORAGE_VERSION_KEY = 'demoScansVersion';

// ---------- LocalStorage helpers ----------
export function getLocalScans() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveLocalScans(scans) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
    // Bump version so other tabs can detect a change
    const v = (parseInt(localStorage.getItem(STORAGE_VERSION_KEY) || '0', 10) || 0) + 1;
    localStorage.setItem(STORAGE_VERSION_KEY, String(v));
  } catch (err) {
    console.warn('[realtime-sync] Failed to save local scans:', err.message);
  }
}

export function upsertLocalScan(scan) {
  if (!scan || scan.id == null) return;
  const scans = getLocalScans();
  const idx = scans.findIndex(s => String(s.id) === String(scan.id));
  if (idx === -1) scans.unshift(scan);
  else scans[idx] = { ...scans[idx], ...scan };
  saveLocalScans(scans);
}

export function removeLocalScan(scanId) {
  if (scanId == null) return;
  const scans = getLocalScans().filter(s => String(s.id) !== String(scanId));
  saveLocalScans(scans);
}

// ---------- BroadcastChannel (modern browsers) ----------
let bc = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(CHANNEL_NAME);
  }
} catch {
  bc = null;
}

export function broadcastScanChange(eventType, scan) {
  const payload = { type: 'scan-change', event: eventType, scan, ts: Date.now() };
  if (bc) {
    try { bc.postMessage(payload); } catch { /* ignore */ }
  }
  // Also bump a key in localStorage so the `storage` event fires in other tabs
  try {
    const key = '__scanflow_broadcast__';
    localStorage.setItem(key, JSON.stringify(payload));
  } catch { /* ignore */ }
}

// ---------- Supabase Realtime ----------
let realtimeChannel = null;
let realtimeStatus = 'idle';

export function getRealtimeStatus() {
  return realtimeStatus;
}

function ensureRealtimePublication() {
  // The user may not have added `scans` to the supabase_realtime publication.
  // We can't run DDL from the client, but we hint in console so they remember.
  if (!supabase) return;
  console.info(
    '[realtime-sync] Tip: If realtime does not deliver events, run this in the ' +
    'Supabase SQL editor:\n' +
    "  ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;"
  );
}

export function setupRealtimeSync({ onChange, onStatus } = {}) {
  const safeOnChange = typeof onChange === 'function' ? onChange : () => {};
  const safeOnStatus = typeof onStatus === 'function' ? onStatus : () => {};

  safeOnStatus('connecting');

  // 1. Cross-tab via BroadcastChannel
  if (bc) {
    bc.onmessage = (msg) => {
      const data = msg?.data;
      if (data && data.type === 'scan-change') {
        // Persist the change locally so reload-after-upload still works
        if (data.event === 'insert' || data.event === 'update') {
          upsertLocalScan(data.scan);
        } else if (data.event === 'delete') {
          removeLocalScan(data.scan?.id);
        }
        safeOnChange(data.event, data.scan);
      }
    };
  }

  // 2. Cross-tab via localStorage `storage` event (fallback for older browsers)
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key === STORAGE_KEY) {
      // Another tab replaced the entire list — tell the UI to refresh
      safeOnChange('refresh', null);
      return;
    }
    if (e.key === '__scanflow_broadcast__' && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        if (data && data.type === 'scan-change') {
          if (data.event === 'insert' || data.event === 'update') {
            upsertLocalScan(data.scan);
          } else if (data.event === 'delete') {
            removeLocalScan(data.scan?.id);
          }
          safeOnChange(data.event, data.scan);
        }
      } catch { /* ignore */ }
    }
  });

  // 3. Supabase realtime (works across browsers and devices)
  if (!supabase) {
    realtimeStatus = 'demo';
    safeOnStatus('demo');
    console.info('[realtime-sync] Running in demo mode — cross-tab sync only');
    return;
  }

  ensureRealtimePublication();

  try {
    realtimeChannel = supabase
      .channel('scans-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scans' },
        (payload) => {
          console.log('[realtime-sync] Supabase event:', payload.eventType, payload.new || payload.old);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new) {
              upsertLocalScan(payload.new);
              broadcastScanChange(payload.eventType === 'INSERT' ? 'insert' : 'update', payload.new);
              safeOnChange(payload.eventType === 'INSERT' ? 'insert' : 'update', payload.new);
            }
          } else if (payload.eventType === 'DELETE') {
            if (payload.old) {
              removeLocalScan(payload.old.id);
              broadcastScanChange('delete', payload.old);
              safeOnChange('delete', payload.old);
            }
          }
        }
      )
      .subscribe((status) => {
        realtimeStatus = status;
        safeOnStatus(status);
        console.log('[realtime-sync] Supabase status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ [realtime-sync] Live updates active');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[realtime-sync] Realtime channel issue:', status);
        }
      });
  } catch (err) {
    console.error('[realtime-sync] Failed to setup Supabase realtime:', err.message);
    realtimeStatus = 'error';
    safeOnStatus('error');
  }
}

export function teardownRealtimeSync() {
  if (realtimeChannel && supabase) {
    try { supabase.removeChannel(realtimeChannel); } catch { /* ignore */ }
    realtimeChannel = null;
  }
  if (bc) {
    try { bc.close(); } catch { /* ignore */ }
    bc = null;
  }
  realtimeStatus = 'idle';
}
