// ===== ScanFlow AI — Real SMS Service (No Demo Fallback) =====
// This module sends real SMS messages via the backend Arkesel API.
// It will NOT silently fall back to demo mode — if sending fails,
// the error is thrown so the caller can handle it.

const SMS_API_URL = '/api/send-sms';

/**
 * Send a real SMS message to a patient's phone number.
 * @param {string} phone - Patient phone number (e.g. +233501234567)
 * @param {string} message - The SMS message text
 * @returns {Promise<object>} The API response
 * @throws {Error} If sending fails for any reason
 */
export async function sendRealSMS(phone, message) {
  if (!phone || !phone.trim()) {
    throw new Error('SMS FAILED: No phone number provided.');
  }
  if (!message || !message.trim()) {
    throw new Error('SMS FAILED: No message content provided.');
  }

  const response = await fetch(SMS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: phone.trim(),
      message: message.trim()
    }),
    signal: AbortSignal.timeout(15000) // 15s timeout
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error || `Server returned HTTP ${response.status}`;
    throw new Error(`SMS FAILED: ${errorMsg}`);
  }

  console.log(`[SMS Service] Real SMS sent to ${phone}`);
  return data;
}

/**
 * Build a professional SMS message for a completed scan review.
 * @param {object} scan - The scan object with patient_name, scan_type, urgency, etc.
 * @returns {string} The formatted SMS message
 */
export function buildScanResultMessage(scan) {
  const name = scan.patient_name || 'Patient';
  const scanType = scan.scan_type || 'medical scan';
  const finding = scan.ai_result || 'Your scan has been reviewed';
  const urgency = scan.urgency || 'Normal';
  const recommendation = scan.ai_recommendations || '';

  let msg = `Dear ${name},\n\n`;
  msg += `Your ${scanType} result is ready.\n\n`;
  msg += `Finding: ${finding}\n`;
  msg += `Urgency: ${urgency}\n`;
  if (recommendation) {
    msg += `Recommendation: ${recommendation}\n`;
  }
  msg += `\nPlease visit the hospital to receive your full report and discuss next steps with your doctor.\n\n`;
  msg += `Thank you.\n- ScanFlow AI Medical Imaging`;

  // SMS character limit check (typical limit is 160 characters per segment)
  // If longer than 160 chars, most providers handle multi-segment automatically
  return msg;
}

/**
 * Build a short SMS message for critical/urgent results.
 * @param {object} scan - The scan object
 * @returns {string} The formatted SMS message
 */
export function buildUrgentScanMessage(scan) {
  const name = scan.patient_name || 'Patient';
  const scanType = scan.scan_type || 'medical scan';
  const finding = scan.ai_result || 'requires attention';

  const msg = `URGENT: Dear ${name}, your ${scanType} result requires prompt attention. ${finding}. Please visit the hospital immediately or contact your doctor. - ScanFlow AI`;

  return msg;
}