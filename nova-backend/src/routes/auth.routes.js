// ============================================================
// NOVA Platform — Auth Routes
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { authenticate, requireRole } = require('../middleware/auth');
const { authRateLimiter, sanitizeRequest, handleValidationErrors, generateCsrfToken, csrfProtect } = require('../middleware/security');
const { refreshTokenHandler } = require('../middleware/auth');

// CSRF token endpoint (must be called before any state-changing request)
router.get('/csrf-token', generateCsrfToken);

// Public - rate limited
router.post('/register',
    authRateLimiter,
    sanitizeRequest,
    authCtrl.registerValidators,
    handleValidationErrors,
    authCtrl.register
);

router.post('/login',
    authRateLimiter,
    sanitizeRequest,
    authCtrl.loginValidators,
    handleValidationErrors,
    authCtrl.login
);

// Token refresh (uses refresh token cookie)
router.post('/refresh', refreshTokenHandler);

// Protected
router.post('/logout', authenticate, authCtrl.logout);
router.get('/me', authenticate, authCtrl.getProfile);
router.put('/change-password',
    authenticate,
    sanitizeRequest,
    authCtrl.changePasswordValidators,
    handleValidationErrors,
    authCtrl.changePassword
);

// Password reset flow (public — no auth required)
router.post('/forgot-password',
    authRateLimiter,
    sanitizeRequest,
    authCtrl.requestPasswordResetValidators,
    handleValidationErrors,
    authCtrl.requestPasswordReset
);

router.post('/reset-password',
    authRateLimiter,
    sanitizeRequest,
    authCtrl.resetPasswordValidators,
    handleValidationErrors,
    authCtrl.resetPassword
);

// ---- Two-Factor Authentication ----
router.post('/2fa/setup',
    authenticate,
    csrfProtect,
    authCtrl.setup2FA
);

router.post('/2fa/verify',
    authenticate,
    authRateLimiter,
    authCtrl.verify2FA
);

router.post('/2fa/disable',
    authenticate,
    csrfProtect,
    authCtrl.disable2FA
);

router.post('/2fa/backup-codes',
    authenticate,
    csrfProtect,
    authCtrl.regenerateBackupCodes
);

module.exports = router;
