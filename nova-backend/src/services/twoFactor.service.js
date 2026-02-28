// ============================================================
// NOVA Platform — Two-Factor Authentication Service
// TOTP-based 2FA using speakeasy (RFC 6238 / Google Authenticator compatible)
// Backup codes for account recovery.
// Schema: users.two_fa_secret, users.two_fa_enabled, users.backup_codes
// ============================================================
'use strict';

const speakeasy = require('speakeasy');
const crypto = require('crypto');
const { knex } = require('../config/database');
const logger = require('../config/logger');
const config = require('../config/env');

/**
 * Generate a new TOTP secret for a user.
 * Returns the secret (to be stored) and a QR code URL for authenticator apps.
 * Does NOT enable 2FA until verifyAndEnable is called.
 * @param {string} userId
 * @param {string} userEmail - For QR code label
 * @returns {{ secret: string, qrCodeUrl: string, manualEntryKey: string }}
 */
async function generateSecret(userId, userEmail) {
    const secret = speakeasy.generateSecret({
        length: 20,
        name: `${config.totp.issuer}:${userEmail}`,
        issuer: config.totp.issuer,
    });

    // Temporarily store the secret (not yet enabled)
    await knex('users').where({ id: userId }).update({
        two_fa_secret: secret.base32,
        updated_at: knex.fn.now(),
    });

    return {
        secret: secret.base32,
        qrCodeUrl: secret.otpauth_url,  // Scan with Google Authenticator / Authy
        manualEntryKey: secret.base32,
    };
}

/**
 * Verify a TOTP token and enable 2FA for the user.
 * @param {string} userId
 * @param {string} token - 6-digit code from authenticator app
 * @returns {{ enabled: boolean, backupCodes: string[] }}
 */
async function enableTwoFA(userId, token) {
    const user = await knex('users').where({ id: userId }).select('two_fa_secret', 'two_fa_enabled').first();
    if (!user) {
        const err = new Error('User not found');
        err.statusCode = 404;
        throw err;
    }
    if (!user.two_fa_secret) {
        const err = new Error('2FA setup not initiated. Call /auth/2fa/setup first.');
        err.statusCode = 422;
        throw err;
    }
    if (user.two_fa_enabled) {
        const err = new Error('2FA is already enabled for this account.');
        err.statusCode = 409;
        throw err;
    }

    const isValid = speakeasy.totp.verify({
        secret: user.two_fa_secret,
        encoding: 'base32',
        token,
        window: 2,  // Allow 2 step drift (60s tolerance)
    });

    if (!isValid) {
        const err = new Error('Invalid 2FA code. Please try again.');
        err.statusCode = 401;
        throw err;
    }

    // Generate 10 backup codes
    const backupCodes = generateBackupCodeList();
    const hashedCodes = backupCodes.map((c) => crypto.createHash('sha256').update(c).digest('hex'));

    await knex('users').where({ id: userId }).update({
        two_fa_enabled: true,
        backup_codes: JSON.stringify(hashedCodes),
        updated_at: knex.fn.now(),
    });

    logger.audit('TWO_FA_ENABLED', userId, 'user', userId);
    return { enabled: true, backupCodes }; // Show plaintext codes ONCE — user must save them
}

/**
 * Verify a TOTP token (for login step 2 or sensitive action confirmation).
 * @param {string} userId
 * @param {string} token - 6-digit code or 8-character backup code
 * @returns {boolean}
 */
async function verifyToken(userId, token) {
    const user = await knex('users').where({ id: userId }).select('two_fa_secret', 'two_fa_enabled', 'backup_codes').first();
    if (!user || !user.two_fa_enabled) return false;

    // Try TOTP first
    const totpValid = speakeasy.totp.verify({
        secret: user.two_fa_secret,
        encoding: 'base32',
        token,
        window: 2,
    });
    if (totpValid) return true;

    // Try backup codes (as fallback)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const backupCodes = JSON.parse(user.backup_codes || '[]');
    const codeIndex = backupCodes.indexOf(tokenHash);
    if (codeIndex !== -1) {
        // Consume the backup code (one-time use)
        backupCodes.splice(codeIndex, 1);
        await knex('users').where({ id: userId }).update({ backup_codes: JSON.stringify(backupCodes), updated_at: knex.fn.now() });
        logger.audit('BACKUP_CODE_USED', userId, 'user', userId);
        return true;
    }

    return false;
}

/**
 * Disable 2FA for a user (requires current TOTP token to confirm).
 * @param {string} userId
 * @param {string} token - Current TOTP code to confirm the action
 */
async function disableTwoFA(userId, token) {
    const isValid = await verifyToken(userId, token);
    if (!isValid) {
        const err = new Error('Invalid 2FA token. Provide your current code to disable 2FA.');
        err.statusCode = 401;
        throw err;
    }

    await knex('users').where({ id: userId }).update({
        two_fa_enabled: false,
        two_fa_secret: null,
        backup_codes: null,
        updated_at: knex.fn.now(),
    });

    logger.audit('TWO_FA_DISABLED', userId, 'user', userId);
    return { disabled: true };
}

/**
 * Regenerate backup codes (consumes all existing ones).
 * @param {string} userId
 * @returns {{ backupCodes: string[] }}
 */
async function generateBackupCodes(userId) {
    const backupCodes = generateBackupCodeList();
    const hashedCodes = backupCodes.map((c) => crypto.createHash('sha256').update(c).digest('hex'));

    await knex('users').where({ id: userId }).update({
        backup_codes: JSON.stringify(hashedCodes),
        updated_at: knex.fn.now(),
    });

    logger.audit('BACKUP_CODES_REGENERATED', userId, 'user', userId);
    return { backupCodes }; // Return plaintext once — user must save
}

// ---- Internal helpers ----

function generateBackupCodeList(count = 10) {
    return Array.from({ length: count }, () =>
        crypto.randomBytes(4).toString('hex').toUpperCase() // e.g. "A1B2C3D4"
    );
}

module.exports = { generateSecret, enableTwoFA, verifyToken, disableTwoFA, generateBackupCodes };
