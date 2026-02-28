// ============================================================
// NOVA Platform — Auth Controller
// Register, login, logout, refresh, profile
// ============================================================
'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { knex } = require('../config/database');
const { generateAccessToken, generateRefreshToken, setAuthCookies, clearAuthCookies } = require('../middleware/auth');
const logger = require('../config/logger');
const config = require('../config/env');
const { asyncHandler } = require('../middleware/errorHandler');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/security');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../services/email.service');
const twoFactorService = require('../services/twoFactor.service');
const crypto = require('crypto');

// --- Register Validators ---
exports.registerValidators = [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('Password must be 8+ chars with at least one uppercase, number, and special character'),
    body('first_name').trim().isLength({ min: 1, max: 100 }).withMessage('First name required'),
    body('last_name').trim().isLength({ min: 1, max: 100 }).withMessage('Last name required'),
    body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
    body('role').optional().isIn(['buyer', 'vendor']).withMessage('Role must be buyer or vendor'),
];

// --- Login Validators ---
exports.loginValidators = [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
];

// --- Register ---
exports.register = asyncHandler(async (req, res) => {
    const { email, password, first_name, last_name, phone, role = 'buyer', country } = req.body;

    const existing = await knex('users').where({ email }).first();
    if (existing) {
        return res.status(409).json({ success: false, error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

    const [user] = await knex('users').insert({
        id: uuidv4(),
        email,
        password_hash: passwordHash,
        first_name,
        last_name,
        phone,
        country,
        role,
        is_active: true,
        is_email_verified: config.env === 'test', // Auto-verify in test
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    }).returning(['id', 'email', 'first_name', 'last_name', 'role', 'created_at']);

    const payload = { id: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    setAuthCookies(res, accessToken, refreshToken);

    logger.audit('USER_REGISTERED', user.id, 'user', user.id, { role, email });

    // Fire-and-forget welcome email
    sendWelcomeEmail({ to: email, firstName: first_name, role }).catch(() => { });

    res.status(201).json({
        success: true,
        message: 'Account created successfully.',
        data: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role },
    });
});

// --- Login ---
exports.login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await knex('users').where({ email }).first();
    if (!user || !user.is_active) {
        return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
        logger.warn('Failed login attempt', { email, ip: req.ip });
        return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    // Update last login timestamp
    await knex('users').where({ id: user.id }).update({ last_login_at: knex.fn.now() });

    const payload = { id: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    setAuthCookies(res, accessToken, refreshToken);

    logger.audit('USER_LOGIN', user.id, 'user', user.id, { ip: req.ip });

    res.json({
        success: true,
        message: 'Login successful.',
        data: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            twoFaEnabled: user.two_fa_enabled,
        },
    });
});

// --- Logout ---
exports.logout = asyncHandler(async (req, res) => {
    clearAuthCookies(res);
    logger.audit('USER_LOGOUT', req.user?.id, 'user', req.user?.id);
    res.json({ success: true, message: 'Logged out successfully.' });
});

// --- Get current user profile ---
exports.getProfile = asyncHandler(async (req, res) => {
    const user = await knex('users')
        .where({ id: req.user.id })
        .select('id', 'email', 'first_name', 'last_name', 'phone', 'country', 'role',
            'is_email_verified', 'two_fa_enabled', 'last_login_at', 'created_at')
        .first();

    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    res.json({ success: true, data: user });
});

// --- Change password ---
exports.changePasswordValidators = [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('New password must be 8+ chars with uppercase, number, and special character'),
];

exports.changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await knex('users').where({ id: req.user.id }).first();

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ success: false, error: 'Current password incorrect.' });

    const newHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await knex('users').where({ id: user.id }).update({
        password_hash: newHash,
        password_changed_at: Math.floor(Date.now() / 1000),
        updated_at: knex.fn.now(),
    });

    clearAuthCookies(res);
    logger.audit('PASSWORD_CHANGED', user.id, 'user', user.id, { ip: req.ip });
    res.json({ success: true, message: 'Password changed. Please log in again.' });
});

// --- Request password reset (sends email with token) ---
exports.requestPasswordResetValidators = [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
];

exports.requestPasswordReset = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await knex('users').where({ email }).first();

    // Always return 200 to prevent email enumeration
    if (!user) {
        return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await knex('users').where({ id: user.id }).update({
        password_reset_token: resetToken,
        password_reset_expires: resetExpiry,
        updated_at: knex.fn.now(),
    });

    sendPasswordResetEmail({ to: email, firstName: user.first_name, resetToken }).catch(() => { });
    logger.audit('PASSWORD_RESET_REQUESTED', user.id, 'user', user.id, { ip: req.ip });

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
});

// --- Confirm password reset with token ---
exports.resetPasswordValidators = [
    body('token').notEmpty().withMessage('Reset token required'),
    body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('Password must be 8+ chars with uppercase, number, and special character'),
];

exports.resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    const user = await knex('users')
        .where({ password_reset_token: token })
        .where('password_reset_expires', '>', new Date())
        .first();

    if (!user) {
        return res.status(400).json({ success: false, error: 'Invalid or expired reset token.' });
    }

    const newHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await knex('users').where({ id: user.id }).update({
        password_hash: newHash,
        password_reset_token: null,
        password_reset_expires: null,
        password_changed_at: Math.floor(Date.now() / 1000),
        updated_at: knex.fn.now(),
    });

    logger.audit('PASSWORD_RESET_COMPLETE', user.id, 'user', user.id, { ip: req.ip });
    res.json({ success: true, message: 'Password reset successfully. Please log in.' });
});
// --- Setup 2FA (generate secret + QR code) ---
exports.setup2FA = asyncHandler(async (req, res) => {
    const result = await twoFactorService.generateSecret(req.user.id, req.user.email);
    res.json({
        success: true,
        message: 'Scan the QR code with your authenticator app, then confirm with POST /auth/2fa/verify.',
        data: { qrCodeUrl: result.qrCodeUrl, manualEntryKey: result.manualEntryKey },
    });
});

// --- Verify 2FA token and enable 2FA ---
exports.verify2FA = asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'token required' });
    const result = await twoFactorService.enableTwoFA(req.user.id, token);
    res.json({
        success: true,
        message: '2FA enabled. Store your backup codes securely — they will not be shown again.',
        data: result,
    });
});

// --- Disable 2FA ---
exports.disable2FA = asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Current 2FA token required to disable.' });
    const result = await twoFactorService.disableTwoFA(req.user.id, token);
    res.json({ success: true, message: '2FA has been disabled.', data: result });
});

// --- Regenerate backup codes ---
exports.regenerateBackupCodes = asyncHandler(async (req, res) => {
    const result = await twoFactorService.generateBackupCodes(req.user.id);
    res.json({
        success: true,
        message: 'New backup codes generated. Previous codes are now invalid.',
        data: result,
    });
});
