// ===== ScanFlow AI — Radiographer Upload Module =====
import { supabase } from './supabase-config.js';
import { broadcastScanChange, upsertLocalScan, saveLocalScans, getLocalScans } from './realtime-sync.js';
import { sendRealSMS, CONTACT_PHONE } from './sms-service.js';

// ---------- Priority Selector ----------
function selectPriority(element) {
  document.querySelectorAll('.priority-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  element.classList.add('selected');
  const priority = element.dataset.priority;
  document.getElementById('priorityColor').value = priority;
}
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

// ---------- File Resizing ----------
function resizeFile(file, maxSize = 1500) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob);
        }, file.type || 'image/jpeg', 0.8);
      };
      img.onerror = () => reject(new Error('Failed to load image for resizing'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
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

    const patientName = document.getElementById('patientName').value.trim();
    const patientNumber = document.getElementById('patientNumber').value.trim();
    const patientAge = parseInt(document.getElementById('patientAge').value);
    const patientPhone = document.getElementById('patientPhone').value.trim();
    const patientHistory = document.getElementById('patientHistory').value.trim();
    const scanType = document.getElementById('scanType').value;
    const priorityColor = document.getElementById('priorityColor').value;

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

      let uploadFile = selectedFile;
      if (selectedFile) {
        try {
          uploadFile = await resizeFile(selectedFile);
        } catch (e) {
          console.warn('Failed to resize, using original', e);
        }
      }

      // Upload image to Supabase Storage
      if (uploadFile && supabase) {
        try {
          const fileName = `scans/${Date.now()}_${selectedFile.name || 'scan.jpg'}`;
          const { error: uploadError } = await supabase.storage
            .from('scan-images')
            .upload(fileName, uploadFile);
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
        id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
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

      // 1. Always save to localStorage first for reliable persistence
      const existing = getLocalScans();
      existing.unshift(scanData);
      saveLocalScans(existing);

      // 2. Broadcast the change to all other tabs immediately so the
      //    radiologist sees the scan without refreshing
      broadcastScanChange('insert', scanData);

      // 3. Also try to save to Supabase (best effort)
      let supabaseInserted = false;
      if (supabase) {
        try {
          // Don't send our local id — let Supabase generate the UUID
          const { id, ...supabaseData } = scanData;
          const { data, error } = await supabase.from('scans').insert(supabaseData).select();
          if (error) {
            console.log('Supabase insert returned error:', error.message);
          } else if (data && data[0]) {
            supabaseInserted = true;
            // Replace the local id with the Supabase UUID so both systems agree
            const newScan = { ...scanData, id: data[0].id };
            const list = getLocalScans();
            const idx = list.findIndex(s => s.id === scanData.id);
            if (idx !== -1) {
              list[idx] = newScan;
              saveLocalScans(list);
              // Broadcast the id correction
              broadcastScanChange('update', newScan);
            }
          }
        } catch (dbErr) {
          console.log('Supabase save failed:', dbErr.message);
        }
      }

      const storedIn = supabaseInserted ? 'Supabase + local cache' : 'local cache (Supabase unreachable)';
      showToast(`Scan uploaded! Saved to ${storedIn}.`, 'success');

      // Auto-send "Scan Received" SMS to patient (real SMS, no demo fallback)
      if (patientPhone) {
        try {
          const smsMessage = `Dear ${patientName}, your ${scanType} has been received by ScanFlow AI and is scheduled for review. You will be notified once the results are ready.\n\nFor questions, call: ${CONTACT_PHONE}\n\nThank you.\n- ScanFlow AI Medical Imaging`;
          await sendRealSMS(patientPhone, smsMessage);
          scanData.sms_received_ack = true;
          console.log(`[SMS] ✓ Auto-sent "scan received" SMS to ${patientPhone}`);
        } catch (smsErr) {
          // Don't block the upload process if SMS fails — log it
          console.log(`[SMS] Auto-SMS on upload failed: ${smsErr.message}`);
        }
      }

      // Reset form
      uploadForm.reset();
      previewContainer.style.display = 'none';
      selectedFile = null;
      document.getElementById('priorityColor').value = 'red';
      document.querySelectorAll('.priority-option').forEach(opt => opt.classList.remove('selected'));
      const critOpt = document.querySelector('.priority-option.critical');
      if (critOpt) critOpt.classList.add('selected');

      // Redirect after a delay so the toast is visible
      setTimeout(() => {
        window.location.href = 'radiographer-dashboard.html';
      }, 1500);

    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '⚡ Upload & Submit for Review';
    }
  });
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
