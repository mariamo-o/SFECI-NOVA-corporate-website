// ============================================================
// NOVA Platform — Frontend API Client
// Replaces ALL mock form submissions with real backend calls.
// Include this file AFTER security.js and BEFORE script.js
// in index.html: <script src="api.js"></script>
// ============================================================

const NOVA_API = (() => {
    // When served via Nginx (port 80 / 443), use a relative path so the browser
    // sends API requests back through Nginx, which reverse-proxies to the
    // `api` container on the internal Docker network.
    // When opened directly (file://) or on port 3001 (dev-only), use the full URL.
    const isDockerNginx = (
        window.location.protocol !== 'file:' &&
        window.location.port !== '3001' &&
        window.location.hostname !== ''
    );
    const BASE_URL = isDockerNginx ? '/api/v1' : 'http://localhost:3001/api/v1';
    let csrfToken = null;

    // ---- Internal fetch wrapper ----
    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const defaults = {
            credentials: 'include',  // Send httpOnly cookies automatically
            headers: {
                'Content-Type': 'application/json',
                ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
                ...options.headers,
            },
        };

        const response = await fetch(url, { ...defaults, ...options });
        const data = await response.json().catch(() => ({ success: false, error: 'Invalid response from server.' }));

        if (!response.ok) {
            const error = new Error(data.error || `HTTP ${response.status}`);
            error.statusCode = response.status;
            error.details = data.details;
            throw error;
        }

        return data;
    }

    // ---- CSRF token (fetch once on page load) ----
    async function initCSRF() {
        try {
            const data = await request('/auth/csrf-token');
            csrfToken = data.csrfToken;
            console.log('[NOVA API] CSRF token initialized');
        } catch (err) {
            console.warn('[NOVA API] Could not fetch CSRF token (backend may be offline):', err.message);
        }
    }

    // ---- Auth API ----
    const auth = {
        async register(payload) {
            return request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
        },
        async login(email, password) {
            return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        },
        async logout() {
            return request('/auth/logout', { method: 'POST' });
        },
        async getProfile() {
            return request('/auth/me');
        },
        async refresh() {
            return request('/auth/refresh', { method: 'POST' });
        },
    };

    // ---- RFQ API ----
    const rfq = {
        async create(payload) {
            return request('/rfqs', { method: 'POST', body: JSON.stringify(payload) });
        },
        async submit(rfqId) {
            return request(`/rfqs/${rfqId}/submit`, { method: 'POST' });
        },
        async list(params = {}) {
            const qs = new URLSearchParams(params).toString();
            return request(`/rfqs?${qs}`);
        },
        async get(rfqId) {
            return request(`/rfqs/${rfqId}`);
        },
        async submitQuote(rfqId, payload) {
            return request(`/rfqs/${rfqId}/quotes`, { method: 'POST', body: JSON.stringify(payload) });
        },
        async selectQuote(rfqId, quoteId) {
            return request(`/rfqs/${rfqId}/quotes/${quoteId}/select`, { method: 'POST' });
        },
        async getStateLog(rfqId) {
            return request(`/rfqs/${rfqId}/state-log`);
        },
    };

    // ---- Vendor API ----
    const vendor = {
        async register(payload) {
            return request('/vendors', { method: 'POST', body: JSON.stringify(payload) });
        },
        async getMyProfile() {
            return request('/vendors/me');
        },
        async uploadDocuments(formData) {
            // FormData (multipart) — don't set Content-Type, browser sets boundary
            return fetch(`${BASE_URL}/vendors/documents`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'X-CSRF-Token': csrfToken || '' },
                body: formData,
            }).then((r) => r.json());
        },
    };

    // ---- Health check ----
    async function checkHealth() {
        try {
            const res = await fetch(`${BASE_URL.replace('/api/v1', '')}/health`, { credentials: 'omit' });
            return res.json();
        } catch (err) {
            return { status: 'unreachable', error: err.message };
        }
    }

    // ---- Session state ----
    let currentUser = null;

    async function initSession() {
        try {
            const data = await auth.getProfile();
            currentUser = data.data;
            document.dispatchEvent(new CustomEvent('nova:session', { detail: { user: currentUser } }));
        } catch (_) {
            currentUser = null;
            document.dispatchEvent(new CustomEvent('nova:session', { detail: { user: null } }));
        }
    }

    // ---- Public interface ----
    return { request, initCSRF, initSession, checkHealth, auth, rfq, vendor, getUser: () => currentUser };
})();

// ============================================================
// Form Integration — Wire RFQ form to real API
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize CSRF & session
    await NOVA_API.initCSRF();
    await NOVA_API.initSession();

    // Show login state in navbar
    document.addEventListener('nova:session', (e) => {
        const { user } = e.detail;
        const loginBtn = document.querySelector('.navbar-actions .btn-primary');
        if (user && loginBtn) {
            loginBtn.textContent = `${user.firstName || user.first_name || 'Account'}`;
            loginBtn.href = '#';
        }
    });

    // ---- RFQ Form Submission ----
    const rfqForm = document.getElementById('rfqForm');
    if (rfqForm) {
        rfqForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = rfqForm.querySelector('[type="submit"]');
            const originalText = submitBtn?.querySelector('span')?.textContent || 'Submit RFQ';

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.querySelector('span').textContent = 'Submitting…';
            }

            try {
                const formData = new FormData(rfqForm);
                const sector = formData.get('sector');
                const description = formData.get('description') || '';

                // If user is not logged in, show auth notice
                if (!NOVA_API.getUser()) {
                    showApiNotification(
                        '⚠️ Please log in to submit an RFQ. Your form data is saved.',
                        'warning'
                    );
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.querySelector('span').textContent = originalText;
                    }
                    return;
                }

                // Build RFQ payload
                const payload = {
                    title: `RFQ: ${sector ? sector.charAt(0).toUpperCase() + sector.slice(1) : 'General'} Request`,
                    description: description || 'Request for quotation submitted via SFECI NOVA Platform.',
                    sector: sector || undefined,
                    items: [
                        {
                            name: formData.get('company') ? `${formData.get('company')} Project Requirements` : 'Project Requirements',
                            quantity: 1,
                            specifications: description,
                        },
                    ],
                };

                const result = await NOVA_API.rfq.create(payload);
                const rfqId = result.data.id;

                // Auto-submit the draft
                await NOVA_API.rfq.submit(rfqId);

                showApiNotification(
                    `✅ RFQ ${result.data.rfq_number} submitted! AI categorized: ${result.data.aiCategorization?.sector || sector}. Response within 48 hours.`,
                    'success'
                );
                rfqForm.reset();

            } catch (err) {
                console.error('[NOVA RFQ] Submission failed:', err);
                const msg = err.details
                    ? `Validation: ${err.details.map((d) => d.message).join(', ')}`
                    : (err.message || 'Submission failed. Please try again.');
                showApiNotification(`❌ ${msg}`, 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.querySelector('span').textContent = originalText;
                }
            }
        });
    }

    // ---- API status indicator in footer ----
    const health = await NOVA_API.checkHealth();
    const statusEl = document.createElement('div');
    statusEl.id = 'nova-api-status';
    statusEl.style.cssText = 'position:fixed;bottom:1rem;right:1rem;padding:.5rem 1rem;border-radius:.5rem;font-size:.75rem;font-weight:600;z-index:9999;';

    if (health.status === 'ok') {
        statusEl.style.background = 'rgba(16,185,129,0.9)';
        statusEl.style.color = '#fff';
        statusEl.textContent = '● NOVA Backend: Connected';
    } else {
        statusEl.style.background = 'rgba(239,68,68,0.9)';
        statusEl.style.color = '#fff';
        statusEl.textContent = '● NOVA Backend: Offline (start docker-compose)';
    }
    document.body.appendChild(statusEl);
    setTimeout(() => statusEl.style.opacity = '0.7', 3000);
});

// Unified API-aware notification function
function showApiNotification(message, type = 'info') {
    // Use existing showNotification function if available, else console
    if (typeof showNotification === 'function') {
        showNotification(message, type);
    } else {
        const colors = { success: '#10B981', error: '#EF4444', warning: '#F59E0B', info: '#3B82F6' };
        const notif = document.createElement('div');
        notif.style.cssText = `position:fixed;top:5rem;right:1rem;max-width:400px;padding:1rem 1.5rem;background:white;border-left:4px solid ${colors[type] || colors.info};border-radius:.5rem;box-shadow:0 10px 30px rgba(0,0,0,.15);z-index:10000;font-size:.875rem;`;
        notif.textContent = message;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 6000);
    }
}

// Expose globally for use from HTML onclick handlers
window.NOVA_API = NOVA_API;
