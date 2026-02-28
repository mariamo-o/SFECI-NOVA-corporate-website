// ============================================================
// NOVA Platform — JWT Authentication & RBAC Middleware
// ============================================================
'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const { knex } = require('../config/database');

// ---- Role hierarchy (higher index = more privilege) ----
const ROLES = {
    guest: 0,
    buyer: 1,
    vendor: 2,
    compliance_officer: 3,
    admin: 4,
    super_admin: 5,
};

// ---- Token generation ----
const generateAccessToken = (payload) =>
    jwt.sign(payload, config.jwt.accessSecret, {
        expiresIn: config.jwt.accessExpires,
        algorithm: 'HS256',
        issuer: 'nova-platform',
        audience: 'nova-api',
    });

const generateRefreshToken = (payload) =>
    jwt.sign(payload, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpires,
        algorithm: 'HS256',
        issuer: 'nova-platform',
        audience: 'nova-api',
    });

const setAuthCookies = (res, accessToken, refreshToken) => {
    const cookieOpts = {
        httpOnly: true,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
    };

    res.cookie('access_token', accessToken, {
        ...cookieOpts,
        maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', refreshToken, {
        ...cookieOpts,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/v1/auth/refresh',      // Refresh token only sent to refresh endpoint
    });
};

const clearAuthCookies = (res) => {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
};

// ---- Authenticate middleware ----
const authenticate = async (req, res, next) => {
    try {
        // Try Authorization header first, then cookie (supports both bearer token & httpOnly cookie)
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else if (req.cookies?.access_token) {
            token = req.cookies.access_token;
        }

        if (!token) {
            return res.status(401).json({ success: false, error: 'Authentication required.' });
        }

        const decoded = jwt.verify(token, config.jwt.accessSecret, {
            issuer: 'nova-platform',
            audience: 'nova-api',
            algorithms: ['HS256'],
        });

        // Verify user still exists and is active in DB
        const user = await knex('users')
            .where({ id: decoded.id, is_active: true })
            .select('id', 'email', 'role', 'two_fa_enabled')
            .first();

        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found or deactivated.' });
        }

        // Verify token was not issued before last password change
        if (decoded.iat < (user.password_changed_at || 0)) {
            return res.status(401).json({ success: false, error: 'Token invalidated. Please log in again.' });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Token expired. Please refresh.' });
        }
        if (err.name === 'JsonWebTokenError') {
            logger.warn('Invalid JWT presented', { ip: req.ip, error: err.message });
            return res.status(401).json({ success: false, error: 'Invalid token.' });
        }
        logger.error('Auth middleware error', { error: err.message });
        return res.status(500).json({ success: false, error: 'Authentication error.' });
    }
};

// ---- Optional authentication (doesn't fail if no token) ----
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.cookies?.access_token ||
            (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);

        if (!token) return next();

        const decoded = jwt.verify(token, config.jwt.accessSecret, {
            issuer: 'nova-platform',
            audience: 'nova-api',
        });
        const user = await knex('users').where({ id: decoded.id, is_active: true })
            .select('id', 'email', 'role').first();
        if (user) req.user = user;
    } catch (_) {
        // Silently ignore invalid tokens for optional auth
    }
    next();
};

// ---- RBAC: require specific role(s) ----
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    const userRoleLevel = ROLES[req.user.role] ?? -1;
    const hasPermission = roles.some((role) => {
        // String match or role level comparison
        if (role === req.user.role) return true;
        if (role === 'admin_or_above') return userRoleLevel >= ROLES.admin;
        if (role === 'compliance_or_above') return userRoleLevel >= ROLES.compliance_officer;
        return false;
    });

    if (!hasPermission) {
        logger.warn('Privilege escalation attempt blocked', {
            userId: req.user.id,
            userRole: req.user.role,
            requiredRoles: roles,
            path: req.path,
            ip: req.ip,
        });
        return res.status(403).json({
            success: false,
            error: 'Insufficient privileges for this action.',
        });
    }
    next();
};

// ---- Refresh token endpoint logic ----
const refreshTokenHandler = async (req, res) => {
    try {
        const token = req.cookies?.refresh_token;
        if (!token) {
            return res.status(401).json({ success: false, error: 'Refresh token required.' });
        }

        const decoded = jwt.verify(token, config.jwt.refreshSecret, {
            issuer: 'nova-platform',
            audience: 'nova-api',
        });

        const user = await knex('users')
            .where({ id: decoded.id, is_active: true })
            .select('id', 'email', 'role')
            .first();

        if (!user) {
            clearAuthCookies(res);
            return res.status(401).json({ success: false, error: 'User not found.' });
        }

        const payload = { id: user.id, email: user.email, role: user.role };
        const newAccessToken = generateAccessToken(payload);
        const newRefreshToken = generateRefreshToken(payload);

        setAuthCookies(res, newAccessToken, newRefreshToken);
        res.json({ success: true, message: 'Tokens refreshed.' });
    } catch (err) {
        clearAuthCookies(res);
        return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
    }
};

module.exports = {
    ROLES,
    generateAccessToken,
    generateRefreshToken,
    setAuthCookies,
    clearAuthCookies,
    authenticate,
    optionalAuth,
    requireRole,
    refreshTokenHandler,
};
