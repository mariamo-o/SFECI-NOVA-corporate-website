// ============================================================
// NOVA Platform — Email Service
// Nodemailer with SMTP/AWS SES transport.
// Provides typed send helpers with HTML templates.
// ============================================================
'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../config/logger');

// ---- Transport factory ----
function createTransport() {
    // AWS SES via SMTP: set SMTP_HOST=email-smtp.eu-west-1.amazonaws.com
    if (config.email.host && config.email.user && config.email.pass) {
        return nodemailer.createTransport({
            host: config.email.host,
            port: config.email.port || 587,
            secure: config.email.port === 465,
            auth: { user: config.email.user, pass: config.email.pass },
            pool: true,
            maxConnections: 5,
        });
    }

    // Development: Ethereal (auto-creates inboxat https://ethereal.email)
    logger.warn('[Email] No SMTP credentials — using Ethereal test account');
    return null; // Created lazily in sendMail
}

let transport = createTransport();
let etherealAccount = null;

async function getTransport() {
    if (transport) return transport;

    if (!etherealAccount) {
        etherealAccount = await nodemailer.createTestAccount();
        logger.info('[Email] Ethereal test account created', {
            user: etherealAccount.user,
            previewUrl: 'https://ethereal.email',
        });
    }
    transport = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: { user: etherealAccount.user, pass: etherealAccount.pass },
    });
    return transport;
}

// ---- Core send function ----
async function sendMail({ to, subject, html, text }) {
    if (config.env === 'test') return { messageId: 'test-suppressed' };

    try {
        const t = await getTransport();
        const info = await t.sendMail({
            from: config.email.from,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]+>/g, ''),
        });

        const preview = nodemailer.getTestMessageUrl(info);
        if (preview) {
            logger.info(`[Email] Preview: ${preview}`);
        }

        logger.info('[Email] Sent', { to, subject, messageId: info.messageId });
        return info;
    } catch (err) {
        logger.error('[Email] Send failed', { to, subject, error: err.message });
        // Non-fatal — log and continue
        return null;
    }
}

// ---- HTML Templates ----
function baseTemplate(content) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0a1628, #1a3a6b); padding: 32px 40px; }
    .header h1 { color: white; margin: 0; font-size: 1.5rem; }
    .header span { color: #d4af37; font-weight: 700; }
    .body { padding: 40px; color: #374151; line-height: 1.7; }
    .body h2 { color: #0a1628; font-size: 1.25rem; margin-top: 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #1a3a6b, #2a5298); color: white !important;
           padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .meta { background: #f8fafc; border-left: 4px solid #d4af37; padding: 16px; border-radius: 0 4px 4px 0; margin: 20px 0; }
    .footer { background: #f8fafc; padding: 24px 40px; text-align: center; font-size: 0.8rem; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>SFECI <span>NOVA</span> Platform</h1>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      © 2026 SFECI. All rights reserved. Registered in France.<br>
      15 Avenue des Champs-Élysées, 75008 Paris, France
    </div>
  </div>
</body>
</html>`;
}

// ---- Typed Email Helpers ----

/**
 * Welcome email after successful registration.
 */
async function sendWelcomeEmail({ to, firstName, role }) {
    const roleLabel = role === 'vendor' ? 'Supplier' : 'Buyer';
    return sendMail({
        to,
        subject: `Welcome to SFECI NOVA Platform, ${firstName}!`,
        html: baseTemplate(`
          <h2>Welcome aboard, ${firstName}! 🎉</h2>
          <p>Your <strong>${roleLabel}</strong> account has been created successfully on the NOVA B2B Trade Platform.</p>
          <div class="meta">
            <strong>Your Account:</strong> ${to}<br>
            <strong>Role:</strong> ${roleLabel}<br>
            <strong>Status:</strong> Active
          </div>
          <p>You can now log in and start exploring our platform:</p>
          <a href="${config.frontendUrl}" class="btn">Go to NOVA Platform →</a>
          <p style="color:#6b7280;font-size:0.875rem;">If you did not create this account, contact us immediately at security@sfeci.com</p>
        `),
    });
}

/**
 * Password reset email with one-time link.
 */
async function sendPasswordResetEmail({ to, firstName, resetToken }) {
    const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
    return sendMail({
        to,
        subject: 'NOVA Platform — Password Reset Request',
        html: baseTemplate(`
          <h2>Password Reset Request</h2>
          <p>Hello ${firstName},</p>
          <p>We received a request to reset the password for your NOVA account. Click the button below to set a new password:</p>
          <a href="${resetUrl}" class="btn">Reset Password →</a>
          <div class="meta">
            <strong>⏱ This link expires in 1 hour</strong><br>
            If you did not request a password reset, ignore this email — your account is safe.
          </div>
          <p style="word-break:break-all;font-size:0.8rem;color:#9ca3af;">Or copy this URL: ${resetUrl}</p>
        `),
    });
}

/**
 * RFQ submission confirmation to buyer.
 */
async function sendRFQSubmittedEmail({ to, firstName, rfqNumber, sector, slaDeadline }) {
    return sendMail({
        to,
        subject: `RFQ ${rfqNumber} Submitted — NOVA Platform`,
        html: baseTemplate(`
          <h2>Your RFQ Has Been Submitted ✅</h2>
          <p>Hello ${firstName},</p>
          <p>Your Request for Quotation has been received and is now being matched with qualified suppliers.</p>
          <div class="meta">
            <strong>RFQ Number:</strong> ${rfqNumber}<br>
            <strong>Sector:</strong> ${sector || 'General'}<br>
            <strong>Quote Deadline:</strong> ${new Date(slaDeadline).toUTCString()}<br>
            <strong>Status:</strong> In Review
          </div>
          <p>Our AI matching engine is identifying the best suppliers for your requirements. You will receive quotes within <strong>48 hours</strong>.</p>
          <a href="${config.frontendUrl}/#rfq" class="btn">View Your RFQ →</a>
        `),
    });
}

/**
 * Notify vendor of a new matching RFQ.
 */
async function sendVendorRFQNotificationEmail({ to, vendorName, rfqNumber, rfqTitle, sector, deadline }) {
    return sendMail({
        to,
        subject: `New RFQ Available: ${rfqNumber} — NOVA Platform`,
        html: baseTemplate(`
          <h2>New RFQ Matching Your Profile 📋</h2>
          <p>Hello ${vendorName},</p>
          <p>A new Request for Quotation has been submitted that matches your supplier profile.</p>
          <div class="meta">
            <strong>RFQ Number:</strong> ${rfqNumber}<br>
            <strong>Title:</strong> ${rfqTitle}<br>
            <strong>Sector:</strong> ${sector || 'General'}<br>
            <strong>Quote By:</strong> ${deadline ? new Date(deadline).toUTCString() : 'See platform'}
          </div>
          <p>Log in to the NOVA platform to review the requirements and submit your competitive quote.</p>
          <a href="${config.frontendUrl}/#rfq" class="btn">Submit Your Quote →</a>
          <p style="color:#6b7280;font-size:0.875rem;">You receive these emails because you are a verified supplier on NOVA. Manage notifications in your account settings.</p>
        `),
    });
}

/**
 * Notify buyer that a new quote was received.
 */
async function sendQuoteReceivedEmail({ to, firstName, rfqNumber, vendorName, totalAmount, currency }) {
    return sendMail({
        to,
        subject: `New Quote Received for ${rfqNumber} — NOVA Platform`,
        html: baseTemplate(`
          <h2>You Have a New Quote! 📨</h2>
          <p>Hello ${firstName},</p>
          <p>A supplier has submitted a quote for your RFQ.</p>
          <div class="meta">
            <strong>RFQ Number:</strong> ${rfqNumber}<br>
            <strong>Supplier:</strong> ${vendorName}<br>
            <strong>Quote Amount:</strong> ${currency} ${Number(totalAmount).toLocaleString()}
          </div>
          <p>Log in to compare quotes and select the best offer for your requirements.</p>
          <a href="${config.frontendUrl}/#rfq" class="btn">Review Quotes →</a>
        `),
    });
}

/**
 * Dispute opened notification.
 */
async function sendDisputeOpenedEmail({ to, name, disputeNumber, orderId, reason }) {
    return sendMail({
        to,
        subject: `Dispute ${disputeNumber} Opened — NOVA Platform`,
        html: baseTemplate(`
          <h2>Dispute Opened 🚨</h2>
          <p>Hello ${name},</p>
          <p>A dispute has been opened on order <strong>${orderId}</strong>.</p>
          <div class="meta">
            <strong>Dispute Number:</strong> ${disputeNumber}<br>
            <strong>Order ID:</strong> ${orderId}<br>
            <strong>Reason:</strong> ${reason}<br>
            <strong>SLA:</strong> Resolution within 72 hours
          </div>
          <p>Our dispute resolution team will review the case. You may be contacted for additional information.</p>
          <a href="${config.frontendUrl}" class="btn">View Dispute →</a>
        `),
    });
}

/**
 * Vendor KYC status update notification.
 */
async function sendKYCStatusEmail({ to, vendorName, status, notes }) {
    const statusLabels = {
        approved: { emoji: '✅', label: 'Approved', color: '#10B981' },
        rejected: { emoji: '❌', label: 'Rejected', color: '#EF4444' },
        risk_scored: { emoji: '📊', label: 'Under Review', color: '#F59E0B' },
        board_review: { emoji: '🏛️', label: 'Board Review', color: '#6366F1' },
    };
    const s = statusLabels[status] || { emoji: '📋', label: status, color: '#6B7280' };

    return sendMail({
        to,
        subject: `Vendor Verification Update — NOVA Platform`,
        html: baseTemplate(`
          <h2>Verification Status Update ${s.emoji}</h2>
          <p>Hello ${vendorName},</p>
          <p>Your vendor verification status has been updated.</p>
          <div class="meta">
            <strong>Status:</strong> <span style="color:${s.color};font-weight:700;">${s.label}</span><br>
            ${notes ? `<strong>Notes:</strong> ${notes}` : ''}
          </div>
          ${status === 'approved'
                ? '<p>Congratulations! You are now a verified supplier and can receive RFQ notifications.</p>'
                : status === 'rejected'
                    ? '<p>Unfortunately your application was not approved at this time. Please contact compliance@sfeci.com for details.</p>'
                    : '<p>Your application is progressing. You will be notified of the outcome shortly.</p>'}
          <a href="${config.frontendUrl}" class="btn">View Your Account →</a>
        `),
    });
}

module.exports = {
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendRFQSubmittedEmail,
    sendVendorRFQNotificationEmail,
    sendQuoteReceivedEmail,
    sendDisputeOpenedEmail,
    sendKYCStatusEmail,
};
