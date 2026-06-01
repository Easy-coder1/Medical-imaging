// ===== ScanFlow AI — Real SMS Service (No Demo Fallback) =====
// This module sends real SMS messages via the backend Arkesel API.
// It will NOT silently fall back to demo mode — if sending fails,
// the error is thrown so the caller can handle it.

// When running locally from file://, fallback to localhost server.
// Otherwise (like on Vercel or local npm start), use the relative /api/send-sms.
const SMS_API_URL = window.location.protocol === 'file:' 
  ? 'http://localhost:3000/api/send-sms' 
  : '/api/send-sms';

/**
 * Default contact phone number shown in SMS messages.
 * Change this to your hospital's contact number.
 * @type {string}
 */
export const CONTACT_PHONE = '+233 54 949 1646';

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
 * @param {string} [contactPhone] - Contact phone number to show. Defaults to CONTACT_PHONE.
 * @returns {string} The formatted SMS message
 */
export function buildScanResultMessage(scan, contactPhone) {
  const name = scan.patient_name || 'Patient';
  const scanType = scan.scan_type || 'medical scan';
  const phone = contactPhone || CONTACT_PHONE;

  let msg = `Dear ${name},\n\n`;
  msg += `Your ${scanType} result is ready.\n\n`;
  msg += `Please visit the hospital to receive your full report and discuss next steps with your doctor.\n\n`;
  msg += `For any questions, call: ${phone}\n\n`;
  msg += `Thank you.\n- ScanFlow AI Medical Imaging`;

  return msg;
}

/**
 * Build a short SMS message for critical/urgent results.
 * @param {object} scan - The scan object
 * @param {string} [contactPhone] - Contact phone number to show. Defaults to CONTACT_PHONE.
 * @returns {string} The formatted SMS message
 */
export function buildUrgentScanMessage(scan, contactPhone) {
  const name = scan.patient_name || 'Patient';
  const scanType = scan.scan_type || 'medical scan';
  const phone = contactPhone || CONTACT_PHONE;

  const msg = `URGENT: Dear ${name}, your ${scanType} result requires prompt attention. Please visit the hospital immediately or call: ${phone}. - ScanFlow AI`;

  return msg;
}