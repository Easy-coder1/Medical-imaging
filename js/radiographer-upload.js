// ===== ScanFlow AI — Radiographer Upload Module =====
import { supabase } from './supabase-config.js';

// ---------- Priority Selector ----------
function selectPriority(element) {
  // Remove selected class from all options
  document.querySelectorAll('.priority-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  
  // Add selected class to clicked option
  element.classList.add('selected');
  
  // Update hidden input
  const priority = element.dataset.priority;
  document.getElementById('priorityColor').value = priority;
}

// Make selectPriority globally available
window.selectPriority = selectPriority;

// ---------- Toast Notification ----------
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

// ---------- File Handling ----------
let selectedFile = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('uploadPreview');
const previewImage = document.getElementById('previewImage');

if (dropzone) {
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('dragover'); });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
}

function handleFile(file) {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!validTypes.includes(file.type)) { 
    showToast('Please upload a JPG or PNG image.', 'error'); 
    return; 
  }
  if (file.size > 10 * 1024 * 1024) { 
    showToast('File size must be under 10MB.', 'error'); 
    return; 
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => { 
    previewImage.src = e.target.result; 
    previewContainer.style.display = 'block'; 
  };
  reader.readAsDataURL(file);
}

// ---------- Form Submit ----------
const uploadForm = document.getElementById('uploadForm');
const submitBtn = document.getElementById('submitBtn');

if (uploadForm) {
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get form values
    const patientName = document.getElementById('patientName').value.trim();
    const patientNumber = document.getElementById('patientNumber').value.trim();
    const patientAge = parseInt(document.getElementById('patientAge').value);
    const patientPhone = document.getElementById('patientPhone').value.trim();
    const patientHistory = document.getElementById('patientHistory').value.trim();
    const scanType = document.getElementById('scanType').value;
    const priorityColor = document.getElementById('priorityColor').value;

    // Validation
    if (!patientName) { showToast('Please enter a patient name.', 'error'); return; }
    if (!patientNumber) { showToast('Please enter a patient number.', 'error'); return; }
    if (!patientAge || patientAge < 0 || patientAge > 150) { showToast('Please enter a valid age.', 'error'); return; }
    if (!patientPhone) { showToast('Please enter a phone number.', 'error'); return; }
    if (!scanType) { showToast('Please select a scan type.', 'error'); return; }
    if (!selectedFile) { showToast('Please select an image to upload.', 'error'); return; }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;margin:0"></span> Uploading...';

    try {
      let imageUrl = '';

      // Upload image to Supabase Storage
      if (selectedFile && supabase) {
        try {
          const fileName = `scans/${Date.now()}_${selectedFile.name}`;
          const { error: uploadError } = await supabase.storage
            .from('scan-images')
            .upload(fileName, selectedFile);
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from('scan-images').getPublicUrl(fileName);
          imageUrl = urlData?.publicUrl || '';
        } catch (storageErr) {
          console.log('Storage upload skipped (demo mode):', storageErr.message);
          imageUrl = previewImage ? previewImage.src : 'demo-image-url';
        }
      } else {
        imageUrl = previewImage ? previewImage.src : 'demo-image-url';
      }

      // Prepare scan data
      const scanData = {
        patient_name: patientName,
        patient_number: patientNumber,
        patient_age: patientAge,
        patient_phone: patientPhone,
        patient_history: patientHistory,
        scan_type: scanType,
        image_url: imageUrl,
        priority_color: priorityColor,
        urgency: priorityColor === 'red' ? 'Critical' : priorityColor === 'orange' ? 'Urgent' : 'Normal',
        status: 'pending',
        sms_sent: false,
        created_at: new Date().toISOString()
      };

      // Always save to localStorage first for reliable persistence
      saveDemoScan(scanData);

      // Also save to Supabase if available
      if (supabase) {
        try {
          const { error: dbError } = await supabase.from('scans').insert(scanData);
          if (dbError) {
            console.log('Supabase insert returned error:', dbError.message);
          } else {
            console.log('Scan saved to Supabase successfully');
          }
        } catch (dbErr) {
          console.log('Supabase save failed:', dbErr.message);
        }
      }

      showToast('Scan uploaded successfully! It will appear in the radiologist\'s queue.', 'success');
      
      // Reset form
      uploadForm.reset();
      previewContainer.style.display = 'none';
      selectedFile = null;
      document.getElementById('priorityColor').value = 'red';
      document.querySelectorAll('.priority-option').forEach(opt => opt.classList.remove('selected'));
      document.querySelector('.priority-option.critical').classList.add('selected');

      // Redirect to dashboard after a delay
      setTimeout(() => {
        window.location.href = 'radiographer-dashboard.html';
      }, 2000);

    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '⚡ Upload & Submit for Review';
    }
  });
}

function saveDemoScan(scanData) {
  // Always generate a local ID for localStorage persistence
  if (!scanData.id || String(scanData.id).startsWith('scan_')) {
    scanData.id = 'scan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  const existing = JSON.parse(localStorage.getItem('demoScans') || '[]');
  existing.push(scanData);
  localStorage.setItem('demoScans', JSON.stringify(existing));
  console.log('Scan saved to localStorage:', scanData.id);
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  if (window.authUtils) window.authUtils.requireAuth();

  const menuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuBtn) menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
  if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
});