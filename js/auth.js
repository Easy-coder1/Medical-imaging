// ===== ScanFlow AI — Authentication Module (Supabase with Demo Mode) =====
import { supabase } from './supabase-config.js';

// ---------- Helpers ----------
function showError(el, msg) {
  el.textContent = msg;
  el.classList.add('show');
}

function hideError(el) {
  el.classList.remove('show');
}

function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;margin:0"></span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    btn.disabled = false;
  }
}

// ---------- Demo Login Modal ----------
function showDemoRoleSelector(successCallback) {
  // Remove any existing modal
  const existing = document.getElementById('demoRoleModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'demoRoleModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn 0.2s ease;';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:36px;max-width:420px;width:calc(100% - 32px);box-shadow:0 20px 60px rgba(0,0,0,0.25);animation:scaleIn 0.2s ease;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:2.5rem;margin-bottom:8px;">&#127973;</div>
        <h2 style="margin:0 0 4px 0;font-size:1.3rem;color:#1B2A4A;">Demo Mode</h2>
        <p style="margin:0;color:#5A6B8A;font-size:0.9rem;">Select your role to explore the platform</p>
      </div>
      <button id="demoRoleRadiologist" style="width:100%;padding:16px;margin-bottom:12px;border:2px solid #E0E6EE;border-radius:12px;background:#fff;cursor:pointer;text-align:left;display:flex;align-items:center;gap:14px;transition:0.2s;"
        onmouseover="this.style.borderColor='#0077B6';this.style.background='rgba(0,119,182,0.04)'"
        onmouseout="this.style.borderColor='#E0E6EE';this.style.background='#fff'">
        <div style="font-size:1.8rem;">&#128300;</div>
        <div>
          <div style="font-weight:700;font-size:0.95rem;color:#1B2A4A;">Radiologist</div>
          <div style="font-size:0.8rem;color:#5A6B8A;">Review scans, approve reports, manage workflow</div>
        </div>
      </button>
      <button id="demoRoleRadiographer" style="width:100%;padding:16px;margin-bottom:16px;border:2px solid #E0E6EE;border-radius:12px;background:#fff;cursor:pointer;text-align:left;display:flex;align-items:center;gap:14px;transition:0.2s;"
        onmouseover="this.style.borderColor='#0077B6';this.style.background='rgba(0,119,182,0.04)'"
        onmouseout="this.style.borderColor='#E0E6EE';this.style.background='#fff'">
        <div style="font-size:1.8rem;">&#128228;</div>
        <div>
          <div style="font-weight:700;font-size:0.95rem;color:#1B2A4A;">Radiographer</div>
          <div style="font-size:0.8rem;color:#5A6B8A;">Upload scans, manage patient data</div>
        </div>
      </button>
      <button id="demoRoleCancel" style="width:100%;padding:10px;border:none;background:transparent;color:#5A6B8A;cursor:pointer;font-size:0.85rem;">
        Cancel
      </button>
    </div>`;

  document.body.appendChild(modal);

  document.getElementById('demoRoleRadiologist').onclick = () => { modal.remove(); successCallback('Radiologist'); };
  document.getElementById('demoRoleRadiographer').onclick = () => { modal.remove(); successCallback('Radiographer'); };
  document.getElementById('demoRoleCancel').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// ---------- Register ----------
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;
    const errorEl = document.getElementById('registerError');
    const btn = registerForm.querySelector('button[type="submit"]');

    hideError(errorEl);

    if (!role) {
      showError(errorEl, 'Please select an account type.');
      return;
    }

    if (password.length < 6) {
      showError(errorEl, 'Password must be at least 6 characters.');
      return;
    }

    if (!supabase) {
      // Demo mode: store locally
      localStorage.setItem('userName', name);
      localStorage.setItem('userRole', role);
      localStorage.setItem('userEmail', email);
      localStorage.setItem('demoMode', 'true');
      // Redirect based on role
      if (role === 'Radiographer') {
        window.location.href = 'radiographer-dashboard.html';
      } else {
        window.location.href = 'radiologist-dashboard.html';
      }
      return;
    }

    setLoading(btn, true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role }
        }
      });

      if (error) throw error;

      // Save profile to users table
      if (data.user) {
        await supabase.from('users').upsert({
          id: data.user.id,
          name,
          email,
          role,
          created_at: new Date().toISOString()
        });
      }

      localStorage.setItem('userName', name);
      localStorage.setItem('userRole', role);
      
      // Redirect based on role
      if (role === 'Radiographer') {
        window.location.href = 'radiographer-dashboard.html';
      } else {
        window.location.href = 'radiologist-dashboard.html';
      }
    } catch (err) {
      const msg = err.message?.includes('already registered')
        ? 'An account with this email already exists.'
        : 'Registration failed: ' + (err.message || 'Unknown error');
      showError(errorEl, msg);
    } finally {
      setLoading(btn, false);
    }
  });
}

// ---------- Login ----------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const btn = loginForm.querySelector('button[type="submit"]');

    hideError(errorEl);

    if (!supabase) {
      // Demo mode — show role selector
      localStorage.setItem('userName', email.split('@')[0]);
      localStorage.setItem('userEmail', email);
      localStorage.setItem('demoMode', 'true');
      showDemoRoleSelector((role) => {
        localStorage.setItem('userRole', role);
        if (role === 'Radiographer') {
          window.location.href = 'radiographer-dashboard.html';
        } else {
          window.location.href = 'radiologist-dashboard.html';
        }
      });
      return;
    }

    setLoading(btn, true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Fetch profile
      const { data: profile } = await supabase
        .from('users')
        .select('name, role')
        .eq('id', data.user.id)
        .single();

      const role = profile?.role || 'Radiologist';
      localStorage.setItem('userName', profile?.name || email.split('@')[0]);
      localStorage.setItem('userRole', role);
      
      // Redirect based on role
      if (role === 'Radiographer') {
        window.location.href = 'radiographer-dashboard.html';
      } else {
        window.location.href = 'radiologist-dashboard.html';
      }
    } catch (err) {
      let msg = 'Login failed. Please check your credentials.';
      if (err.message?.includes('Invalid login')) msg = 'Invalid email or password.';
      if (err.message?.includes('not found')) msg = 'No account found with this email.';
      showError(errorEl, msg);
    } finally {
      setLoading(btn, false);
    }
  });
}

// ---------- Auth Guard ----------
function requireAuth() {
  const isDemo = localStorage.getItem('demoMode') === 'true';

  if (isDemo) {
    updateUserUI();
    return;
  }

  if (!supabase) {
    // No Supabase configured — allow demo mode
    localStorage.setItem('demoMode', 'true');
    updateUserUI();
    return;
  }

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      window.location.href = 'login.html';
    } else {
      const user = session.user;
      localStorage.setItem('userName', user.user_metadata?.name || user.email?.split('@')[0] || 'Doctor');
      localStorage.setItem('userRole', user.user_metadata?.role || 'Radiologist');
      updateUserUI();
    }
  });
}

function updateUserUI() {
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  const avatarEl = document.getElementById('userAvatar');
  const name = localStorage.getItem('userName') || 'Doctor';
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = localStorage.getItem('userRole') || 'Radiologist';
  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
}

// ---------- Logout ----------
function logout() {
  if (supabase) {
    supabase.auth.signOut();
  }
  localStorage.removeItem('userName');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('demoMode');
  window.location.href = 'login.html';
}

// ---------- Tab Switching (Login/Register) ----------
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginPanel = document.getElementById('loginPanel');
const registerPanel = document.getElementById('registerPanel');

if (tabLogin && tabRegister) {
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginPanel.style.display = 'block';
    registerPanel.style.display = 'none';
  });
  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerPanel.style.display = 'block';
    loginPanel.style.display = 'none';
  });
}

// Expose for use in other scripts
window.authUtils = { requireAuth, logout };