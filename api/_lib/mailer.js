// api/_lib/mailer.js
//
// Shared Nodemailer transport for sending transactional email (currently:
// signup OTP verification codes) via Gmail SMTP.
//
// Requires two env vars (set these in Vercel -> Project -> Settings ->
// Environment Variables, and in a local .env for `vercel dev`):
//   GMAIL_USER          - the Gmail address to send from (e.g. yourapp@gmail.com)
//   GMAIL_APP_PASSWORD  - a 16-character Google "App Password" for that
//                         account (NOT your normal Gmail password). Generate
//                         one at https://myaccount.google.com/apppasswords
//                         (requires 2-Step Verification to be turned on).
//
// If these aren't set, sendOtpEmail() throws so the calling endpoint can
// return a clear 500 instead of silently failing to send anything.

import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD not configured on server. See api/_lib/mailer.js for setup instructions."
    );
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

export async function sendOtpEmail({ to, otp, username }) {
  const t = getTransporter();
  const from = process.env.GMAIL_USER;

  await t.sendMail({
    from: `"Focusly" <${from}>`,
    to,
    subject: `${otp} is your Focusly verification code`,
    text: `Hi ${username || "there"},\n\nYour Focusly verification code is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.\n\n— Focusly`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#15151C; margin-bottom: 4px;">Verify your email</h2>
        <p style="color:#555; font-size: 14px;">Hi ${escapeHtml(username || "there")}, use this code to verify your Focusly account:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 20px; margin: 16px 0; background: #f4f4f7; border-radius: 12px; color: #15151C;">
          ${otp}
        </div>
        <p style="color:#888; font-size: 12px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
