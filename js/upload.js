// ===== ScanFlow AI — Upload Module (Supabase + OpenAI) =====
import { supabase } from './supabase-config.js';
import { isAIConfigured, analyzeImageWithAI, sendChatMessage } from './ai-config.js';

// ---------- Aidoc-Style AI Simulation (Fallback when no API key) ----------
const AIDOC_FINDINGS = [
  // Critical findings
  { result: 'Intracranial Hemorrhage — Subdural Hematoma', urgency: 'Critical', minConf: 88, maxConf: 99, category: 'Neuro' },
  { result: 'Intracranial Hemorrhage — Epidural Hematoma', urgency: 'Critical', minConf: 85, maxConf: 98, category: 'Neuro' },
  { result: 'Intracranial Hemorrhage — Subarachnoid', urgency: 'Critical', minConf: 87, maxConf: 97, category: 'Neuro' },
  { result: 'Pulmonary Embolism Detected', urgency: 'Critical', minConf: 82, maxConf: 96, category: 'Chest' },
  { result: 'Aortic Dissection Suspected', urgency: 'Critical', minConf: 80, maxConf: 95, category: 'Chest' },
  { result: 'Tension Pneumothorax', urgency: 'Critical', minConf: 84, maxConf: 97, category: 'Chest' },

  // Urgent findings
  { result: 'Pulmonary Nodule — Recommend Follow-up', urgency: 'Urgent', minConf: 72, maxConf: 92, category: 'Chest' },
  { result: 'Free Air — Possible Bowel Perforation', urgency: 'Urgent', minConf: 75, maxConf: 93, category: 'Abdomen' },
  { result: 'Sternal Fracture Detected', urgency: 'Urgent', minConf: 78, maxConf: 95, category: 'Chest' },
  { result: 'Cervical Spine Fracture', urgency: 'Urgent', minConf: 76, maxConf: 94, category: 'Spine' },
  { result: 'Renal Calculus with Hydronephrosis', urgency: 'Urgent', minConf: 70, maxConf: 88, category: 'Abdomen' },
  { result: 'Large Pleural Effusion', urgency: 'Urgent', minConf: 68, maxConf: 86, category: 'Chest' },

  // Moderate findings
  { result: 'Solitary Pulmonary Nodule — Low Risk', urgency: 'Moderate', minConf: 55, maxConf: 80, category: 'Chest' },
  { result: 'Degenerative Spine Changes', urgency: 'Moderate', minConf: 60, maxConf: 82, category: 'Spine' },
  { result: 'Hepatic Lesion Detected — Recommend Follow-up', urgency: 'Moderate', minConf: 50, maxConf: 78, category: 'Abdomen' },
  { result: 'Mild Ventriculomegaly', urgency: 'Moderate', minConf: 48, maxConf: 75, category: 'Neuro' },
  { result: 'Coronary Artery Calcification', urgency: 'Moderate', minConf: 52, maxConf: 80, category: 'Chest' },

  // Normal findings
  { result: 'No Acute Findings', urgency: 'Normal', minConf: 5, maxConf: 20, category: 'General' },
  { result: 'No Significant Abnormality', urgency: 'Normal', minConf: 4, maxConf: 18, category: 'General' },
  { result: 'Unremarkable Study', urgency: 'Normal', minConf: 3, maxConf: 15, category: 'General' },
  { result: 'Normal Chest X-Ray', urgency: 'Normal', minConf: 6, maxConf: 22, category: 'Chest' },
];

function simulateAidocAI(scanType) {
  let pool = AIDOC_FINDINGS;

  const categoryMap = {
    'CT Brain': ['Neuro'], 'MRI Brain': ['Neuro'], 'CT Chest': ['Chest'],
    'X-Ray Chest': ['Chest'], 'CT Abdomen': ['Abdomen'], 'CT Angiography': ['Chest', 'Neuro'],
    'MRI Spine': ['Spine'], 'X-Ray Knee': ['General'], 'X-Ray Spine': ['Spine'],
    'Ultrasound': ['Abdomen'], 'PET Scan': ['Chest', 'Abdomen', 'Neuro']
  };

  const relevantCategories = categoryMap[scanType] || ['General'];
  const relevantFindings = pool.filter(f => relevantCategories.includes(f.category) || f.category === 'General');
  if (relevantFindings.length >= 3) pool = relevantFindings;

  const rand = Math.random();
  let cumulative = 0;
  let finding = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    cumulative += 1 / pool.length;
    if (rand <= cumulative) { finding = pool[i]; break; }
  }
  if (finding.urgency === 'Normal' && Math.random() < 0.4) {
    const nonNormal = pool.filter(f => f.urgency !== 'Normal');
    if (nonNormal.length > 0) finding = nonNormal[Math.floor(Math.random() * nonNormal.length)];
  }
  const confidence = Math.floor(Math.random() * (finding.maxConf - finding.minConf) + finding.minConf);

  return {
    aiResult: finding.result,
    details: 'This is a simulated analysis. Configure your OpenAI API key in your .env file for real AI image analysis.',
    urgency: finding.urgency,
    confidence: confidence,
    anatomicalRegion: finding.category,
    recommendations: 'This is a demo result. For real clinical analysis, please configure an OpenAI API key.',
    aiEngine: 'Simulated',
    category: finding.category
  };
}

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

// ---------- File to Base64 (with Resize for Vercel Limits) ----------
function fileToBase64(file, maxSize = 1500) {
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
        const dataUrl = canvas.toDataURL(file.type || 'image/jpeg', 0.8);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: file.type || 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('Failed to load image for resizing'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ---------- Dropzone Setup ----------
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
  if (!validTypes.includes(file.type)) { showToast('Please upload a JPG or PNG image.', 'error'); return; }
  if (file.size > 10 * 1024 * 1024) { showToast('File size must be under 10MB.', 'error'); return; }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => { previewImage.src = e.target.result; previewContainer.style.display = 'block'; };
  reader.readAsDataURL(file);
}

// ---------- Form Submit ----------
const uploadForm = document.getElementById('uploadForm');
const aiResultCard = document.getElementById('aiResultCard');
const submitBtn = document.getElementById('submitBtn');

if (uploadForm) {
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const patientName = document.getElementById('patientName').value.trim();
    const scanType = document.getElementById('scanType').value;

    if (!patientName) { showToast('Please enter a patient name.', 'error'); return; }
    if (!scanType) { showToast('Please select a scan type.', 'error'); return; }
    if (!selectedFile) { showToast('Please select an image to upload.', 'error'); return; }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;margin:0"></span> Analyzing...';

    try {
      let imageUrl = '';

      // Upload image to Supabase Storage (if configured and file selected)
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

      let ai;

      // Check if AI API is configured for real image analysis
      if (await isAIConfigured()) {
        showToast('Sending image to AI for analysis...', 'info');
        try {
          // Convert file to base64 for the API
          const { base64, mimeType } = await fileToBase64(selectedFile);

          showToast('AI is analyzing the image content...', 'info');
          await new Promise(r => setTimeout(r, 500));

          // Real image analysis via OpenAI
          ai = await analyzeImageWithAI(base64, mimeType, scanType, patientName);
          showToast('AI analysis complete!', 'success');

        } catch (apiErr) {
          console.error('AI API error:', apiErr);
          if (apiErr.message.includes('AI_NOT_CONFIGURED') || apiErr.message.includes('invalid') || apiErr.message.includes('API key')) {
            showToast('Invalid API key. Using simulated analysis.', 'error');
          } else if (apiErr.message.includes('rate limit') || apiErr.message.includes('quota')) {
            showToast('API rate limit reached. Using simulated analysis.', 'error');
          } else if (apiErr.message.toLowerCase().includes('timeout') || apiErr.message.includes('504')) {
            showToast('AI request timed out. Using simulated analysis.', 'error');
          } else {
            showToast('AI unavailable: ' + apiErr.message + '. Using simulated analysis.', 'error');
          }
          // Fall back to simulated analysis
          showToast('Running simulated analysis...', 'info');
          await new Promise(r => setTimeout(r, 800));
          showToast('Detecting critical findings...', 'info');
          await new Promise(r => setTimeout(r, 600));
          showToast('Classifying urgency level...', 'info');
          await new Promise(r => setTimeout(r, 500));
          ai = simulateAidocAI(scanType);
        }
      } else {
        // No API key or server not running — use simulated analysis
        showToast('Running simulated analysis (backend server not running or API key not set in .env)...', 'info');
        await new Promise(r => setTimeout(r, 800));
        showToast('Detecting critical findings...', 'info');
        await new Promise(r => setTimeout(r, 600));
        showToast('Classifying urgency level...', 'info');
        await new Promise(r => setTimeout(r, 500));
        ai = simulateAidocAI(scanType);
      }

      // Save to Supabase database
      const scanData = {
        patient_name: patientName,
        scan_type: scanType,
        image_url: imageUrl,
        ai_result: ai.aiResult,
        confidence: ai.confidence,
        urgency: ai.urgency,
        status: 'pending',
        reviewed_by: null,
        review_note: '',
        ai_engine: ai.aiEngine || 'Unknown',
        ai_details: ai.details || '',
        ai_recommendations: ai.recommendations || '',
        ai_anatomical_region: ai.anatomicalRegion || '',
        created_at: new Date().toISOString()
      };

      if (supabase) {
        try {
          const { error: dbError } = await supabase.from('scans').insert(scanData);
          if (dbError) throw dbError;
        } catch (dbErr) {
          console.log('Supabase save skipped (demo mode):', dbErr.message);
          saveDemoScan(scanData);
        }
      } else {
        saveDemoScan(scanData);
      }

      // Show AI result
      displayAIResult(ai, patientName, scanType);
      showToast('Analysis complete!', 'success');

      // Reset form
      uploadForm.reset();
      previewContainer.style.display = 'none';
      selectedFile = null;

    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '⚡ Upload & Analyze';
    }
  });
}

function saveDemoScan(scanData) {
  const existing = JSON.parse(localStorage.getItem('demoScans') || '[]');
  scanData.id = 'scan_' + Date.now();
  existing.push(scanData);
  localStorage.setItem('demoScans', JSON.stringify(existing));
}

function displayAIResult(ai) {
  const resultFinding = document.getElementById('resultFinding');
  const resultUrgency = document.getElementById('resultUrgency');
  const resultConfidence = document.getElementById('resultConfidence');
  const resultConfBar = document.getElementById('resultConfBar');
  const resultDetails = document.getElementById('resultDetails');
  const resultRecommendations = document.getElementById('resultRecommendations');
  const resultEngine = document.getElementById('resultEngine');

  if (resultFinding) resultFinding.textContent = ai.aiResult;
  if (resultUrgency) {
    const colors = { Critical: '#E63946', Urgent: '#F4A261', Moderate: '#0096C7', Normal: '#2EC4B6' };
    resultUrgency.textContent = ai.urgency;
    resultUrgency.style.color = colors[ai.urgency] || '#1B2A4A';
  }
  if (resultConfidence) resultConfidence.textContent = ai.confidence + '%';
  if (resultConfBar) {
    resultConfBar.style.width = '0%';
    resultConfBar.style.background = ai.confidence > 80 ? '#E63946' : ai.confidence > 60 ? '#F4A261' : '#2EC4B6';
    setTimeout(() => { resultConfBar.style.width = ai.confidence + '%'; }, 100);
  }
  if (resultDetails) resultDetails.textContent = ai.details || '—';
  if (resultRecommendations) resultRecommendations.textContent = ai.recommendations || '—';
  if (resultEngine) resultEngine.textContent = ai.aiEngine || '—';

  aiResultCard.classList.add('show');
  
  // Save scan results to global context for chat
  const aiChatSection = document.getElementById('aiChatSection');
  if (aiChatSection) {
    window._currentAIContext = ai; // save for chat
    const history = document.getElementById('aiChatHistory');
    if (history) {
      const sysMsg = document.createElement('div');
      sysMsg.innerHTML = `<strong>System:</strong> Scan analyzed successfully (${ai.category}). AI analysis results loaded into context.`;
      sysMsg.style.background = 'rgba(46,196,182,0.1)';
      sysMsg.style.color = '#0D9488';
      sysMsg.style.padding = '8px';
      sysMsg.style.borderRadius = '6px';
      sysMsg.style.fontSize = '0.85rem';
      history.appendChild(sysMsg);
      history.scrollTop = history.scrollHeight;
    }
  }
}

// ---------- Chat Handlers ----------
const aiChatBtn = document.getElementById('aiChatBtn');
const aiChatInput = document.getElementById('aiChatInput');
const aiChatHistory = document.getElementById('aiChatHistory');

async function handleChatSubmit() {
  const query = aiChatInput.value.trim();
  if (!query) return;
  
  // Add user message
  const userMsg = document.createElement('div');
  userMsg.innerHTML = `<strong>You:</strong> ${query}`;
  userMsg.style.background = 'rgba(0,119,182,0.1)';
  userMsg.style.padding = '8px';
  userMsg.style.borderRadius = '6px';
  aiChatHistory.appendChild(userMsg);
  
  aiChatInput.value = '';
  aiChatBtn.disabled = true;
  aiChatBtn.textContent = '...';
  aiChatHistory.scrollTop = aiChatHistory.scrollHeight;

  try {
    const context = window._currentAIContext || {};
    // Add current patient/scan type from form if available
    const pName = document.getElementById('patientName');
    const sType = document.getElementById('scanType');
    if (pName) context.patientName = pName.value;
    if (sType) context.scanType = sType.value;

    const reply = await sendChatMessage(query, context);
    
    // Add AI message
    const aiMsg = document.createElement('div');
    aiMsg.innerHTML = `<strong>AI:</strong> ${reply}`;
    aiMsg.style.background = 'rgba(0,0,0,0.03)';
    aiMsg.style.padding = '8px';
    aiMsg.style.borderRadius = '6px';
    aiChatHistory.appendChild(aiMsg);
  } catch (err) {
    console.warn('Chat API failed, falling back to simulated response:', err);
    // Add simulated AI message
    const simulatedReply = "This is a simulated response. To get real AI answers, please configure your OpenAI API key.";
    const aiMsg = document.createElement('div');
    aiMsg.innerHTML = `<strong>AI (Simulated):</strong> ${simulatedReply}`;
    aiMsg.style.background = 'rgba(0,0,0,0.03)';
    aiMsg.style.padding = '8px';
    aiMsg.style.borderRadius = '6px';
    aiMsg.style.color = '#F4A261'; // Orange to indicate simulation
    aiChatHistory.appendChild(aiMsg);
  } finally {
    aiChatBtn.disabled = false;
    aiChatBtn.textContent = 'Ask';
    aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
  }
}

if (aiChatBtn) aiChatBtn.addEventListener('click', handleChatSubmit);
if (aiChatInput) aiChatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleChatSubmit();
});

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  if (window.authUtils) window.authUtils.requireAuth();

  const menuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuBtn) menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
  if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });

});