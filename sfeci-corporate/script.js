// SFECI Corporate Website - Full Interactivity & Enhanced UX
// Load security module first
document.write('<script src="security.js"><\/script>');

// ============================================
// Global State Management
// ============================================
const AppState = {
    currentLanguage: 'en',
    isLoading: false,
    modals: {},
    sectorData: {
        industrial: {
            title: 'Industrial & Construction',
            icon: '🏗️',
            description: 'Heavy machinery, construction materials, industrial equipment, and infrastructure solutions for large-scale projects.',
            services: ['Heavy Machinery', 'Construction Materials', 'Industrial Equipment', 'Infrastructure Solutions'],
            projects: 15,
            volume: '€850M'
        },
        energy: {
            title: 'Energy & Environment',
            icon: '⚡',
            description: 'Renewable energy systems, smart grids, environmental technologies, and sustainable infrastructure solutions.',
            services: ['Solar Energy', 'Wind Power', 'Smart Grids', 'Environmental Tech'],
            projects: 12,
            volume: '€720M'
        },
        medical: {
            title: 'Medical & Pharma',
            icon: '🏥',
            description: 'Medical equipment, pharmaceutical supplies, hospital infrastructure, and healthcare technology solutions.',
            services: ['Medical Equipment', 'Pharmaceutical Supplies', 'Hospital Infrastructure', 'Healthcare Tech'],
            projects: 18,
            volume: '€650M'
        },
        trading: {
            title: 'Trading & Food',
            icon: '🌾',
            description: 'Agricultural products, food processing equipment, supply chain solutions, and international commodity trading.',
            services: ['Agricultural Products', 'Food Processing', 'Supply Chain', 'Commodity Trading'],
            projects: 22,
            volume: '€920M'
        },
        tech: {
            title: 'Tech & Smart Solutions',
            icon: '💻',
            description: 'IoT systems, AI integration, smart city technologies, and digital transformation consulting services.',
            services: ['IoT Systems', 'AI Integration', 'Smart City Tech', 'Digital Transformation'],
            projects: 14,
            volume: '€580M'
        },
        mega: {
            title: 'Mega Projects & Entertainment',
            icon: '🎡',
            description: 'WonderWorld City development, theme parks, entertainment complexes, and large-scale urban projects.',
            services: ['Theme Parks', 'Entertainment Complexes', 'Urban Development', 'Mega Infrastructure'],
            projects: 3,
            volume: '€5.2B'
        }
    }
};

// ============================================
// Initialize on Page Load
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('SFECI Corporate Website - Full Interactivity Loaded');

    // Generate CSRF token
    if (typeof generateCSRFToken === 'function') {
        generateCSRFToken();
    }

    // Initialize language
    const savedLang = localStorage.getItem('sfeci_language') || 'en';
    if (typeof switchLanguage === 'function') {
        switchLanguage(savedLang);
    }

    // Initialize all interactive elements
    initializeNavigation();
    initializeLanguageSwitcher();
    initializeSectorLinks();
    initializeProjectLinks();
    initializePartnerButton();
    initializeFooterLinks();
    initializeNewsLinks();
    initializeScrollAnimations();

    // Add initial page animation
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});

// ============================================
// Navigation Enhancement
// ============================================
const navbar = document.getElementById('navbar');
let lastScroll = 0;

function initializeNavigation() {
    // Scroll effect
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    });

    // Mobile menu
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navbarMenu = document.getElementById('navbarMenu');

    if (mobileMenuToggle && navbarMenu) {
        mobileMenuToggle.addEventListener('click', () => {
            navbarMenu.classList.toggle('active');
            mobileMenuToggle.classList.toggle('active');
        });
    }

    // Smooth scrolling for all navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '#book-meeting') return; // Skip special handlers

            e.preventDefault();
            const target = document.querySelector(href);

            if (target) {
                const offsetTop = target.offsetTop - 80;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });

                // Close mobile menu
                if (navbarMenu) navbarMenu.classList.remove('active');
                if (mobileMenuToggle) mobileMenuToggle.classList.remove('active');

                // Update active link
                document.querySelectorAll('.navbar-link').forEach(link => {
                    link.classList.remove('active');
                });
                if (this.classList.contains('navbar-link')) {
                    this.classList.add('active');
                }
            }
        });
    });

    // Active section highlighting
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.navbar-link');

    window.addEventListener('scroll', () => {
        const scrollY = window.pageYOffset;

        sections.forEach(section => {
            const sectionHeight = section.offsetHeight;
            const sectionTop = section.offsetTop - 100;
            const sectionId = section.getAttribute('id');

            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    });
}

// ============================================
// Language Switcher
// ============================================
function initializeLanguageSwitcher() {
    const langButtons = document.querySelectorAll('.lang-btn');

    langButtons.forEach(button => {
        button.addEventListener('click', () => {
            const lang = button.dataset.lang;
            if (typeof switchLanguage === 'function') {
                switchLanguage(lang);
            }
        });
    });
}

// ============================================
// Sector Links - Full Functionality
// ============================================
function initializeSectorLinks() {
    document.querySelectorAll('.card-link').forEach(link => {
        const card = link.closest('.card');
        if (!card) return;

        const sectorTitle = card.querySelector('.card-title')?.textContent;

        link.addEventListener('click', (e) => {
            e.preventDefault();

            // Determine sector type
            let sectorKey = '';
            if (sectorTitle?.includes('Industrial')) sectorKey = 'industrial';
            else if (sectorTitle?.includes('Energy')) sectorKey = 'energy';
            else if (sectorTitle?.includes('Medical')) sectorKey = 'medical';
            else if (sectorTitle?.includes('Trading')) sectorKey = 'trading';
            else if (sectorTitle?.includes('Tech')) sectorKey = 'tech';
            else if (sectorTitle?.includes('Mega')) sectorKey = 'mega';

            if (sectorKey && AppState.sectorData[sectorKey]) {
                openSectorModal(sectorKey);
            }
        });
    });
}

function openSectorModal(sectorKey) {
    const sector = AppState.sectorData[sectorKey];
    if (!sector) return;

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'sectorModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeModal('sectorModal')"></div>
        <div class="modal-content modal-large">
            <button class="modal-close" onclick="closeModal('sectorModal')">×</button>
            <div style="text-align: center; margin-bottom: 2rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">${sector.icon}</div>
                <h2 style="margin-bottom: 1rem;">${sector.title}</h2>
                <p style="color: var(--color-gray-600); max-width: 600px; margin: 0 auto;">
                    ${sector.description}
                </p>
            </div>
            
            <div class="grid grid-2" style="margin-bottom: 2rem;">
                <div class="card" style="text-align: center;">
                    <h3 style="color: var(--color-primary-blue); font-size: 2.5rem; margin-bottom: 0.5rem;">${sector.projects}</h3>
                    <p style="color: var(--color-gray-600); margin: 0;">Active Projects</p>
                </div>
                <div class="card" style="text-align: center;">
                    <h3 style="color: var(--color-accent-gold); font-size: 2.5rem; margin-bottom: 0.5rem;">${sector.volume}</h3>
                    <p style="color: var(--color-gray-600); margin: 0;">Annual Volume</p>
                </div>
            </div>
            
            <div class="card">
                <h3 style="margin-bottom: 1rem;">Our Services</h3>
                <div class="grid grid-2" style="gap: 1rem;">
                    ${sector.services.map(service => `
                        <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--color-gray-50); border-radius: var(--radius-md);">
                            <svg width="20" height="20" fill="none" stroke="var(--color-primary-blue)" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                            </svg>
                            <span style="font-weight: 500;">${service}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                <button onclick="document.getElementById('rfqForm').scrollIntoView({behavior: 'smooth'}); closeModal('sectorModal');" class="btn btn-primary" style="flex: 1;">
                    <span>Request Quote</span>
                    <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                    </svg>
                </button>
                <button onclick="openContactModal('${sectorKey}')" class="btn btn-secondary" style="flex: 1;">
                    <span>Contact Specialist</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// ============================================
// Project Detail Links
// ============================================
function initializeProjectLinks() {
    document.querySelectorAll('#projects .card-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const card = link.closest('.card');
            const title = card.querySelector('.card-title')?.textContent || 'Project Details';

            openProjectModal(title, card);
        });
    });
}

function openProjectModal(title, cardElement) {
    const badge = cardElement.querySelector('.badge')?.textContent || 'Project';
    const description = cardElement.querySelector('.card-description')?.textContent || '';

    const modal = document.createElement('div');
    modal.id = 'projectModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeModal('projectModal')"></div>
        <div class="modal-content modal-large">
            <button class="modal-close" onclick="closeModal('projectModal')">×</button>
            <span class="badge badge-primary" style="margin-bottom: 1rem;">${badge}</span>
            <h2 style="margin-bottom: 1.5rem;">${title}</h2>
            <p style="color: var(--color-gray-600); margin-bottom: 2rem; line-height: 1.8;">
                ${description}
            </p>
            
            <div class="card" style="background: var(--color-gray-50); margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1rem;">Project Highlights</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    <li style="padding: 0.75rem 0; border-bottom: 1px solid var(--color-gray-200);">
                        <strong>Status:</strong> In Progress
                    </li>
                    <li style="padding: 0.75rem 0; border-bottom: 1px solid var(--color-gray-200);">
                        <strong>Timeline:</strong> 24-36 months
                    </li>
                    <li style="padding: 0.75rem 0; border-bottom: 1px solid var(--color-gray-200);">
                        <strong>Partners:</strong> 15+ International Companies
                    </li>
                    <li style="padding: 0.75rem 0;">
                        <strong>Compliance:</strong> ISO 9001, ISO 14001, GDPR
                    </li>
                </ul>
            </div>
            
            <div style="display: flex; gap: 1rem;">
                <button onclick="document.getElementById('rfqForm').scrollIntoView({behavior: 'smooth'}); closeModal('projectModal');" class="btn btn-primary" style="flex: 1;">
                    <span>Similar Project Quote</span>
                </button>
                <button onclick="closeModal('projectModal')" class="btn btn-secondary" style="flex: 1;">
                    <span>Close</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// ============================================
// Partner Button Functionality
// ============================================
function initializePartnerButton() {
    document.querySelectorAll('a[href="#partners"], .btn-partner').forEach(btn => {
        if (btn.textContent.includes('Apply') || btn.textContent.includes('Partner')) {
            btn.addEventListener('click', (e) => {
                if (!btn.getAttribute('href')?.startsWith('#')) return;
                e.preventDefault();
                openPartnerModal();
            });
        }
    });
}

function openPartnerModal() {
    const modal = document.createElement('div');
    modal.id = 'partnerModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeModal('partnerModal')"></div>
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal('partnerModal')">×</button>
            <h3 style="margin-bottom: 1.5rem;">Become a Verified Partner</h3>
            <form id="partnerForm">
                <input type="hidden" name="csrf_token" value="${typeof getCSRFToken === 'function' ? getCSRFToken() : ''}">
                
                <div class="form-group">
                    <label class="form-label">Company Name *</label>
                    <input type="text" name="company" class="form-input" placeholder="Your Company Ltd." required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Contact Person *</label>
                    <input type="text" name="contact" class="form-input" placeholder="John Doe" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Email Address *</label>
                    <input type="email" name="email" class="form-input" placeholder="contact@company.com" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Industry Sector *</label>
                    <select name="sector" class="form-select" required>
                        <option value="">Select your sector</option>
                        <option value="industrial">Industrial & Construction</option>
                        <option value="energy">Energy & Environment</option>
                        <option value="medical">Medical & Pharma</option>
                        <option value="trading">Trading & Food</option>
                        <option value="tech">Tech & Smart Solutions</option>
                        <option value="mega">Mega Projects</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Company Description</label>
                    <textarea name="description" class="form-textarea" placeholder="Tell us about your company, products, and services..."></textarea>
                </div>
                
                <button type="submit" class="btn btn-primary" style="width: 100%;">
                    <span>Submit Application</span>
                    <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                    </svg>
                </button>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // Handle form submission
    const form = document.getElementById('partnerForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleFormSubmission(form, 'partnerModal', 'Partner application submitted successfully! We will contact you within 48 hours.');
    });
}

// ============================================
// News/Insights Links
// ============================================
function initializeNewsLinks() {
    document.querySelectorAll('#news .card-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const card = link.closest('.card');
            const title = card.querySelector('.card-title')?.textContent || 'Article';

            showNotification(`Opening article: "${title}"`, 'info');

            // Simulate article opening
            setTimeout(() => {
                showNotification('Article feature coming soon in full platform release', 'info');
            }, 1000);
        });
    });
}

// ============================================
// Footer Links Functionality
// ============================================
function initializeFooterLinks() {
    document.querySelectorAll('.footer-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href.startsWith('#') && href !== '#') {
                // Already handled by smooth scroll
                return;
            }

            e.preventDefault();
            const linkText = link.textContent;

            // Show appropriate modal or notification
            if (linkText.includes('Privacy') || linkText.includes('Terms') || linkText.includes('GDPR') || linkText.includes('Cookie')) {
                openLegalModal(linkText);
            } else {
                showNotification(`${linkText} page coming soon in full platform release`, 'info');
            }
        });
    });
}

function openLegalModal(title) {
    const modal = document.createElement('div');
    modal.id = 'legalModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeModal('legalModal')"></div>
        <div class="modal-content modal-large">
            <button class="modal-close" onclick="closeModal('legalModal')">×</button>
            <h2 style="margin-bottom: 1.5rem;">${title}</h2>
            <div style="max-height: 400px; overflow-y: auto; padding: 1rem; background: var(--color-gray-50); border-radius: var(--radius-md);">
                <p style="color: var(--color-gray-600); line-height: 1.8;">
                    <strong>SFECI - ${title}</strong><br><br>
                    Last Updated: January 2026<br><br>
                    
                    This is a demonstration of the legal documentation section. In the production version, 
                    this will contain the complete ${title.toLowerCase()} in accordance with EU regulations 
                    and GDPR compliance requirements.<br><br>
                    
                    Key points that will be covered:<br>
                    • Data collection and processing<br>
                    • User rights and responsibilities<br>
                    • Security measures and protocols<br>
                    • International data transfers<br>
                    • Contact information for data protection officer<br><br>
                    
                    For the full legal documentation, please contact our legal team at legal@sfeci.com
                </p>
            </div>
            <button onclick="closeModal('legalModal')" class="btn btn-primary" style="width: 100%; margin-top: 1.5rem;">
                <span>Close</span>
            </button>
        </div>
    `;

    document.body.appendChild(modal);
}

// ============================================
// Contact Specialist Modal
// ============================================
function openContactModal(sector = '') {
    const modal = document.createElement('div');
    modal.id = 'contactModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeModal('contactModal')"></div>
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal('contactModal')">×</button>
            <h3 style="margin-bottom: 1.5rem;">Contact Our Specialist</h3>
            <form id="contactForm">
                <input type="hidden" name="csrf_token" value="${typeof getCSRFToken === 'function' ? getCSRFToken() : ''}">
                <input type="hidden" name="sector" value="${sector}">
                
                <div class="form-group">
                    <label class="form-label">Full Name *</label>
                    <input type="text" name="name" class="form-input" placeholder="John Doe" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Email Address *</label>
                    <input type="email" name="email" class="form-input" placeholder="john@company.com" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Phone Number</label>
                    <input type="tel" name="phone" class="form-input" placeholder="+33 1 23 45 67 89">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Message *</label>
                    <textarea name="message" class="form-textarea" placeholder="How can we help you?" required></textarea>
                </div>
                
                <button type="submit" class="btn btn-primary" style="width: 100%;">
                    <span>Send Message</span>
                    <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                    </svg>
                </button>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // Handle form submission
    const form = document.getElementById('contactForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleFormSubmission(form, 'contactModal', 'Message sent successfully! Our specialist will contact you within 24 hours.');
    });
}

// ============================================
// Meeting Booking Modal (Enhanced)
// ============================================
function createMeetingModal() {
    const modal = document.createElement('div');
    modal.id = 'meetingModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <button class="modal-close" onclick="closeMeetingModal()">×</button>
            <h3 style="margin-bottom: 1.5rem;">Schedule a Meeting</h3>
            <form id="meetingForm">
                <input type="hidden" name="csrf_token" value="${typeof getCSRFToken === 'function' ? getCSRFToken() : ''}">
                
                <div class="form-group">
                    <label class="form-label">Full Name *</label>
                    <input type="text" name="name" class="form-input" placeholder="John Doe" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Email Address *</label>
                    <input type="email" name="email" class="form-input" placeholder="john@company.com" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Company Name *</label>
                    <input type="text" name="company" class="form-input" placeholder="Your Company" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Preferred Date *</label>
                    <input type="date" name="date" class="form-input" required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Preferred Time *</label>
                    <select name="time" class="form-select" required>
                        <option value="">Select time</option>
                        <option value="09:00">09:00 AM</option>
                        <option value="10:00">10:00 AM</option>
                        <option value="11:00">11:00 AM</option>
                        <option value="14:00">02:00 PM</option>
                        <option value="15:00">03:00 PM</option>
                        <option value="16:00">04:00 PM</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Meeting Topic</label>
                    <textarea name="topic" class="form-textarea" placeholder="Brief description of what you'd like to discuss..."></textarea>
                </div>
                
                <button type="submit" class="btn btn-primary" style="width: 100%;">
                    <span>Book Meeting</span>
                    <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                </button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    // Handle meeting form submission
    const meetingForm = document.getElementById('meetingForm');
    meetingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleFormSubmission(meetingForm, 'meetingModal', 'Meeting scheduled successfully! You will receive a confirmation email shortly.');
    });
}

function openMeetingModal() {
    let modal = document.getElementById('meetingModal');
    if (!modal) {
        createMeetingModal();
        modal = document.getElementById('meetingModal');
    }
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeMeetingModal() {
    const modal = document.getElementById('meetingModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

// Add event listeners for all "Book Meeting" buttons
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href="#book-meeting"], .btn-book-meeting').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openMeetingModal();
        });
    });
});

// ============================================
// Generic Modal Close Function
// ============================================
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
}

// Make it globally available
window.closeModal = closeModal;
window.closeMeetingModal = closeMeetingModal;
window.openContactModal = openContactModal;

// ============================================
// Enhanced RFQ Form Handling
// ============================================
const rfqForm = document.getElementById('rfqForm');

if (rfqForm) {
    rfqForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleFormSubmission(rfqForm, null, 'RFQ submitted successfully! We will contact you within 24 hours.');
    });
}

// ============================================
// Universal Form Submission Handler
// ============================================
function handleFormSubmission(form, modalToClose, successMessage) {
    const formData = new FormData(form);
    const submitButton = form.querySelector('button[type="submit"]');
    const originalHTML = submitButton.innerHTML;

    // Validate with security
    let hasErrors = false;
    const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');

    inputs.forEach(input => {
        if (typeof validateInput === 'function') {
            const type = input.type === 'email' ? 'email' : input.tagName === 'TEXTAREA' ? 'textarea' : 'required';

            if (!validateInput(input.value, type)) {
                showFieldError(input, 'This field is required and must be valid');
                hasErrors = true;
            } else {
                clearFieldError(input);
                if (typeof sanitizeInput === 'function' && input.type !== 'email') {
                    input.value = sanitizeInput(input.value);
                }
            }
        }
    });

    if (hasErrors) {
        showNotification('Please check your input and try again', 'error');
        return;
    }

    // Show loading state
    submitButton.innerHTML = '<span>Submitting...</span><div class="spinner"></div>';
    submitButton.disabled = true;

    // Simulate API call
    setTimeout(() => {
        // Reset button
        submitButton.innerHTML = originalHTML;
        submitButton.disabled = false;

        // Show success
        showNotification(successMessage, 'success');

        // Close modal if specified
        if (modalToClose) {
            setTimeout(() => closeModal(modalToClose), 1000);
        }

        // Reset form
        form.reset();
    }, 2000);
}

// ============================================
// File Upload Enhancement
// ============================================
const fileUploadArea = document.querySelector('.form-file');
const fileInput = fileUploadArea?.querySelector('input[type="file"]');

if (fileUploadArea && fileInput) {
    fileUploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            const file = files[0];

            // Validate file with security checks
            if (typeof validateFile === 'function') {
                const validation = validateFile(file);

                if (!validation.valid) {
                    showNotification(validation.errors.join('. '), 'error');
                    fileInput.value = '';
                    return;
                }
            }

            const fileName = file.name;
            const fileSize = (file.size / 1024 / 1024).toFixed(2);

            fileUploadArea.innerHTML = `
                <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin: 0 auto 0.5rem; color: var(--color-success);">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                <p style="margin: 0; color: var(--color-gray-600); font-size: 0.875rem;">
                    <strong>${fileName}</strong><br>
                    ${fileSize} MB uploaded
                </p>
            `;

            showNotification('File uploaded successfully', 'success');
        }
    });

    // Drag and drop
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.style.borderColor = 'var(--color-primary-blue)';
        fileUploadArea.style.background = 'var(--color-gray-50)';
    });

    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.style.borderColor = 'var(--color-gray-300)';
        fileUploadArea.style.background = 'transparent';
    });

    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.style.borderColor = 'var(--color-gray-300)';
        fileUploadArea.style.background = 'transparent';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            fileInput.dispatchEvent(new Event('change'));
        }
    });
}

// ============================================
// Form Field Error Handling
// ============================================
function showFieldError(field, message) {
    clearFieldError(field);

    field.style.borderColor = 'var(--color-error)';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.style.cssText = 'color: var(--color-error); font-size: 0.875rem; margin-top: 0.25rem;';
    errorDiv.textContent = message;
    field.parentElement.appendChild(errorDiv);
}

function clearFieldError(field) {
    field.style.borderColor = '';
    const existingError = field.parentElement.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
}

// ============================================
// Scroll Animations
// ============================================
function initializeScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.card, .section').forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        element.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(element);
    });

    // Hero stats animation
    const heroStats = document.querySelector('.hero-stats');
    if (heroStats) {
        const statsObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateStats(entry.target);
                    statsObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        statsObserver.observe(heroStats);
    }
}

function animateStats(statsContainer) {
    const statValues = statsContainer.querySelectorAll('.hero-stat-value');
    statValues.forEach((stat, index) => {
        const originalText = stat.textContent;
        const numericValue = parseFloat(originalText.replace(/[^0-9.]/g, ''));

        if (!isNaN(numericValue)) {
            setTimeout(() => {
                if (originalText.includes('%')) {
                    let current = 0;
                    const interval = setInterval(() => {
                        current += 1;
                        stat.textContent = current + '%';
                        if (current >= numericValue) {
                            clearInterval(interval);
                        }
                    }, 20);
                } else {
                    let current = 0;
                    const target = parseInt(originalText.replace(/[^0-9]/g, ''));
                    const interval = setInterval(() => {
                        current += Math.ceil(target / 50);
                        if (current >= target) {
                            stat.textContent = originalText;
                            clearInterval(interval);
                        } else {
                            stat.textContent = current + (originalText.includes('+') ? '+' : '');
                        }
                    }, 30);
                }
            }, index * 200);
        }
    });
}

// ============================================
// Enhanced Notification System
// ============================================
function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = 'notification';
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B',
        info: '#3B82F6'
    };
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: white;
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        max-width: 400px;
        animation: slideIn 0.3s ease-out;
        border-left: 4px solid ${colors[type] || colors.info};
    `;

    notification.innerHTML = `
        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${colors[type] || colors.info}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">
            ${icons[type] || icons.info}
        </div>
        <p style="margin: 0; color: var(--color-gray-800); font-size: 0.9375rem;">
            ${message}
        </p>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// ============================================
// Enhanced Styles
// ============================================
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
    
    .spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
        margin-left: 0.5rem;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease-out;
    }
    
    .modal.active {
        opacity: 1;
    }
    
    .modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
    }
    
    .modal-content {
        position: relative;
        background: white;
        max-width: 500px;
        margin: 5% auto;
        padding: 2rem;
        border-radius: 1rem;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
        transform: scale(0.9);
        opacity: 0;
        transition: all 0.3s ease-out;
        max-height: 85vh;
        overflow-y: auto;
    }
    
    .modal-large {
        max-width: 800px;
    }
    
    .modal.active .modal-content {
        transform: scale(1);
        opacity: 1;
    }
    
    .modal-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        width: 32px;
        height: 32px;
        border: none;
        background: var(--color-gray-200);
        border-radius: 50%;
        font-size: 1.5rem;
        line-height: 1;
        cursor: pointer;
        transition: all 0.2s;
        z-index: 1;
    }
    
    .modal-close:hover {
        background: var(--color-error);
        color: white;
        transform: rotate(90deg);
    }
    
    [dir="rtl"] {
        direction: rtl;
    }
    
    [dir="rtl"] .navbar-menu {
        flex-direction: row-reverse;
    }
    
    [dir="rtl"] .hero-actions {
        flex-direction: row-reverse;
    }
    
    @media (max-width: 768px) {
        .navbar-menu.active {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            padding: 1rem;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            gap: 0.5rem;
        }
        
        .mobile-menu-toggle.active span:nth-child(1) {
            transform: rotate(45deg) translate(5px, 5px);
        }
        
        .mobile-menu-toggle.active span:nth-child(2) {
            opacity: 0;
        }
        
        .mobile-menu-toggle.active span:nth-child(3) {
            transform: rotate(-45deg) translate(7px, -6px);
        }
        
        .modal-content {
            margin: 10% 1rem;
            padding: 1.5rem;
            max-height: 80vh;
        }
    }
`;
document.head.appendChild(style);

// ============================================
// Performance Optimization
// ============================================
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}
