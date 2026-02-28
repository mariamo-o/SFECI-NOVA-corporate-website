// SFECI Security & Internationalization Module

// ============================================
// Security Configuration
// ============================================
const SecurityConfig = {
    // CSRF Token Management
    csrfToken: null,

    // Input Sanitization Patterns
    patterns: {
        sql: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b|--|;|\/\*|\*\/|xp_|sp_)/gi,
        xss: /(<script|<iframe|javascript:|onerror=|onload=|onclick=|<img|eval\(|alert\()/gi,
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        phone: /^[\d\s\-\+\(\)]+$/,
        alphanumeric: /^[a-zA-Z0-9\s\-_.,!?]+$/
    },

    // File Upload Restrictions
    allowedFileTypes: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'png', 'jpg', 'jpeg'],
    maxFileSize: 10 * 1024 * 1024, // 10MB

    // Security Headers (for documentation)
    headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;",
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-XSS-Protection': '1; mode=block'
    }
};

// ============================================
// CSRF Token Generation
// ============================================
function generateCSRFToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    SecurityConfig.csrfToken = token;
    sessionStorage.setItem('csrf_token', token);
    return token;
}

function getCSRFToken() {
    if (!SecurityConfig.csrfToken) {
        SecurityConfig.csrfToken = sessionStorage.getItem('csrf_token') || generateCSRFToken();
    }
    return SecurityConfig.csrfToken;
}

// ============================================
// Input Sanitization & Validation
// ============================================
function sanitizeInput(input, type = 'text') {
    if (!input) return '';

    // Remove potential SQL injection patterns
    let sanitized = input.replace(SecurityConfig.patterns.sql, '');

    // Remove potential XSS patterns
    sanitized = sanitized.replace(SecurityConfig.patterns.xss, '');

    // HTML encode special characters
    const div = document.createElement('div');
    div.textContent = sanitized;
    sanitized = div.innerHTML;

    return sanitized.trim();
}

function validateInput(input, type) {
    const validations = {
        email: () => SecurityConfig.patterns.email.test(input),
        phone: () => SecurityConfig.patterns.phone.test(input),
        text: () => input.length > 0 && input.length < 1000,
        textarea: () => input.length > 0 && input.length < 5000,
        required: () => input && input.trim().length > 0
    };

    return validations[type] ? validations[type]() : true;
}

// ============================================
// File Upload Security
// ============================================
function validateFile(file) {
    const errors = [];

    // Check file size
    if (file.size > SecurityConfig.maxFileSize) {
        errors.push(`File size exceeds maximum allowed size of ${SecurityConfig.maxFileSize / 1024 / 1024}MB`);
    }

    // Check file extension
    const extension = file.name.split('.').pop().toLowerCase();
    if (!SecurityConfig.allowedFileTypes.includes(extension)) {
        errors.push(`File type .${extension} is not allowed. Allowed types: ${SecurityConfig.allowedFileTypes.join(', ')}`);
    }

    // Check for double extensions (potential bypass attempt)
    const nameParts = file.name.split('.');
    if (nameParts.length > 2) {
        errors.push('Files with multiple extensions are not allowed');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// ============================================
// Internationalization (i18n)
// ============================================
const translations = {
    en: {
        nav: {
            home: 'Home',
            sectors: 'Sectors',
            rfq: 'RFQ System',
            projects: 'Projects',
            partners: 'Partners',
            compliance: 'Compliance',
            news: 'Insights',
            contact: 'Contact'
        },
        hero: {
            badge: 'Trusted by Governments & Enterprises Worldwide',
            title: 'Building the Future of Global B2B Commerce',
            subtitle: 'SFECI connects international enterprises with premium suppliers across Europe, Asia, and Africa. Our NOVA platform delivers compliance-driven solutions for industrial, energy, medical, and mega projects.',
            cta1: 'Request a Quote',
            cta2: 'Become a Partner',
            stat1: 'Countries Served',
            stat2: 'Annual Trading Volume',
            stat3: 'Active Partners',
            stat4: 'Client Satisfaction'
        },
        sectors: {
            badge: 'Our Expertise',
            title: 'Global Sectors We Serve',
            subtitle: 'Comprehensive solutions across multiple industries with European quality standards',
            explore: 'Explore Sector'
        },
        rfq: {
            badge: 'NOVA Platform',
            title: 'Smart RFQ System',
            subtitle: 'Submit your request for quotation and connect with verified suppliers worldwide',
            formTitle: 'Request for Quotation',
            companyName: 'Company Name',
            email: 'Email Address',
            sector: 'Sector',
            selectSector: 'Select a sector',
            description: 'Project Description',
            descriptionPlaceholder: 'Describe your requirements in detail...',
            attachDocuments: 'Attach Documents',
            uploadText: 'Click to upload or drag and drop',
            uploadSubtext: 'PDF, DOC, XLS (max. 10MB)',
            submit: 'Submit RFQ',
            required: 'Required field'
        },
        contact: {
            badge: 'Get in Touch',
            title: 'Global Offices & Contact',
            subtitle: 'Connect with our teams across Europe, Asia, and Africa',
            bookMeeting: 'Book Meeting',
            scheduleMeeting: 'Schedule a Meeting',
            scheduleSubtitle: 'Book a consultation with our international business development team'
        },
        messages: {
            rfqSuccess: 'RFQ submitted successfully! We will contact you within 24 hours.',
            meetingSuccess: 'Meeting scheduled successfully! You will receive a confirmation email.',
            languageChanged: 'Language changed to',
            fileUploaded: 'File uploaded successfully',
            invalidEmail: 'Please enter a valid email address',
            invalidInput: 'Please check your input',
            securityWarning: 'Invalid input detected. Please remove special characters.',
            csrfError: 'Security token invalid. Please refresh the page.'
        }
    },
    fr: {
        nav: {
            home: 'Accueil',
            sectors: 'Secteurs',
            rfq: 'Système RFQ',
            projects: 'Projets',
            partners: 'Partenaires',
            compliance: 'Conformité',
            news: 'Actualités',
            contact: 'Contact'
        },
        hero: {
            badge: 'Approuvé par les gouvernements et entreprises du monde entier',
            title: 'Construire l\'avenir du commerce B2B mondial',
            subtitle: 'SFECI connecte les entreprises internationales avec des fournisseurs premium en Europe, Asie et Afrique. Notre plateforme NOVA offre des solutions conformes pour les projets industriels, énergétiques, médicaux et méga-projets.',
            cta1: 'Demander un devis',
            cta2: 'Devenir partenaire',
            stat1: 'Pays desservis',
            stat2: 'Volume commercial annuel',
            stat3: 'Partenaires actifs',
            stat4: 'Satisfaction client'
        },
        sectors: {
            badge: 'Notre expertise',
            title: 'Secteurs mondiaux que nous servons',
            subtitle: 'Solutions complètes dans plusieurs industries avec des normes de qualité européennes',
            explore: 'Explorer le secteur'
        },
        rfq: {
            badge: 'Plateforme NOVA',
            title: 'Système RFQ intelligent',
            subtitle: 'Soumettez votre demande de devis et connectez-vous avec des fournisseurs vérifiés dans le monde entier',
            formTitle: 'Demande de devis',
            companyName: 'Nom de l\'entreprise',
            email: 'Adresse e-mail',
            sector: 'Secteur',
            selectSector: 'Sélectionner un secteur',
            description: 'Description du projet',
            descriptionPlaceholder: 'Décrivez vos besoins en détail...',
            attachDocuments: 'Joindre des documents',
            uploadText: 'Cliquez pour télécharger ou glissez-déposez',
            uploadSubtext: 'PDF, DOC, XLS (max. 10 Mo)',
            submit: 'Soumettre RFQ',
            required: 'Champ obligatoire'
        },
        contact: {
            badge: 'Contactez-nous',
            title: 'Bureaux mondiaux et contact',
            subtitle: 'Connectez-vous avec nos équipes en Europe, Asie et Afrique',
            bookMeeting: 'Réserver une réunion',
            scheduleMeeting: 'Planifier une réunion',
            scheduleSubtitle: 'Réservez une consultation avec notre équipe de développement commercial international'
        },
        messages: {
            rfqSuccess: 'RFQ soumis avec succès! Nous vous contacterons dans les 24 heures.',
            meetingSuccess: 'Réunion planifiée avec succès! Vous recevrez un e-mail de confirmation.',
            languageChanged: 'Langue changée en',
            fileUploaded: 'Fichier téléchargé avec succès',
            invalidEmail: 'Veuillez entrer une adresse e-mail valide',
            invalidInput: 'Veuillez vérifier votre saisie',
            securityWarning: 'Entrée invalide détectée. Veuillez supprimer les caractères spéciaux.',
            csrfError: 'Jeton de sécurité invalide. Veuillez actualiser la page.'
        }
    },
    ar: {
        nav: {
            home: 'الرئيسية',
            sectors: 'القطاعات',
            rfq: 'نظام RFQ',
            projects: 'المشاريع',
            partners: 'الشركاء',
            compliance: 'الامتثال',
            news: 'الأخبار',
            contact: 'اتصل بنا'
        },
        hero: {
            badge: 'موثوق به من قبل الحكومات والمؤسسات في جميع أنحاء العالم',
            title: 'بناء مستقبل التجارة العالمية بين الشركات',
            subtitle: 'تربط SFECI المؤسسات الدولية بموردين متميزين في أوروبا وآسيا وأفريقيا. توفر منصة NOVA حلولاً متوافقة للمشاريع الصناعية والطاقة والطبية والمشاريع الضخمة.',
            cta1: 'طلب عرض أسعار',
            cta2: 'كن شريكاً',
            stat1: 'الدول المخدومة',
            stat2: 'حجم التداول السنوي',
            stat3: 'الشركاء النشطون',
            stat4: 'رضا العملاء'
        },
        sectors: {
            badge: 'خبرتنا',
            title: 'القطاعات العالمية التي نخدمها',
            subtitle: 'حلول شاملة عبر صناعات متعددة بمعايير الجودة الأوروبية',
            explore: 'استكشف القطاع'
        },
        rfq: {
            badge: 'منصة NOVA',
            title: 'نظام RFQ الذكي',
            subtitle: 'قدم طلب عرض الأسعار الخاص بك واتصل بموردين معتمدين في جميع أنحاء العالم',
            formTitle: 'طلب عرض أسعار',
            companyName: 'اسم الشركة',
            email: 'البريد الإلكتروني',
            sector: 'القطاع',
            selectSector: 'اختر قطاعاً',
            description: 'وصف المشروع',
            descriptionPlaceholder: 'صف متطلباتك بالتفصيل...',
            attachDocuments: 'إرفاق المستندات',
            uploadText: 'انقر للتحميل أو اسحب وأفلت',
            uploadSubtext: 'PDF, DOC, XLS (الحد الأقصى 10 ميجابايت)',
            submit: 'إرسال RFQ',
            required: 'حقل مطلوب'
        },
        contact: {
            badge: 'تواصل معنا',
            title: 'المكاتب العالمية والاتصال',
            subtitle: 'تواصل مع فرقنا في أوروبا وآسيا وأفريقيا',
            bookMeeting: 'حجز اجتماع',
            scheduleMeeting: 'جدولة اجتماع',
            scheduleSubtitle: 'احجز استشارة مع فريق تطوير الأعمال الدولي لدينا'
        },
        messages: {
            rfqSuccess: 'تم إرسال RFQ بنجاح! سنتصل بك خلال 24 ساعة.',
            meetingSuccess: 'تم جدولة الاجتماع بنجاح! ستتلقى بريداً إلكترونياً للتأكيد.',
            languageChanged: 'تم تغيير اللغة إلى',
            fileUploaded: 'تم تحميل الملف بنجاح',
            invalidEmail: 'يرجى إدخال عنوان بريد إلكتروني صالح',
            invalidInput: 'يرجى التحقق من إدخالك',
            securityWarning: 'تم اكتشاف إدخال غير صالح. يرجى إزالة الأحرف الخاصة.',
            csrfError: 'رمز الأمان غير صالح. يرجى تحديث الصفحة.'
        }
    },
    zh: {
        nav: {
            home: '首页',
            sectors: '行业',
            rfq: 'RFQ系统',
            projects: '项目',
            partners: '合作伙伴',
            compliance: '合规',
            news: '资讯',
            contact: '联系我们'
        },
        hero: {
            badge: '受到全球政府和企业的信赖',
            title: '构建全球B2B商业的未来',
            subtitle: 'SFECI连接国际企业与欧洲、亚洲和非洲的优质供应商。我们的NOVA平台为工业、能源、医疗和大型项目提供合规解决方案。',
            cta1: '请求报价',
            cta2: '成为合作伙伴',
            stat1: '服务国家',
            stat2: '年交易量',
            stat3: '活跃合作伙伴',
            stat4: '客户满意度'
        },
        sectors: {
            badge: '我们的专长',
            title: '我们服务的全球行业',
            subtitle: '符合欧洲质量标准的多行业综合解决方案',
            explore: '探索行业'
        },
        rfq: {
            badge: 'NOVA平台',
            title: '智能RFQ系统',
            subtitle: '提交您的报价请求并与全球认证供应商联系',
            formTitle: '报价请求',
            companyName: '公司名称',
            email: '电子邮件地址',
            sector: '行业',
            selectSector: '选择行业',
            description: '项目描述',
            descriptionPlaceholder: '详细描述您的需求...',
            attachDocuments: '附加文档',
            uploadText: '点击上传或拖放',
            uploadSubtext: 'PDF, DOC, XLS（最大10MB）',
            submit: '提交RFQ',
            required: '必填字段'
        },
        contact: {
            badge: '联系我们',
            title: '全球办事处与联系方式',
            subtitle: '与我们在欧洲、亚洲和非洲的团队联系',
            bookMeeting: '预约会议',
            scheduleMeeting: '安排会议',
            scheduleSubtitle: '与我们的国际业务发展团队预约咨询'
        },
        messages: {
            rfqSuccess: 'RFQ提交成功！我们将在24小时内与您联系。',
            meetingSuccess: '会议安排成功！您将收到确认电子邮件。',
            languageChanged: '语言已更改为',
            fileUploaded: '文件上传成功',
            invalidEmail: '请输入有效的电子邮件地址',
            invalidInput: '请检查您的输入',
            securityWarning: '检测到无效输入。请删除特殊字符。',
            csrfError: '安全令牌无效。请刷新页面。'
        }
    }
};

// Current language state
let currentLanguage = localStorage.getItem('sfeci_language') || 'en';
let isRTL = false;

// ============================================
// Translation Function
// ============================================
function t(key) {
    const keys = key.split('.');
    let value = translations[currentLanguage];

    for (const k of keys) {
        value = value?.[k];
    }

    return value || key;
}

// ============================================
// Language Switcher
// ============================================
function switchLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('sfeci_language', lang);
    isRTL = lang === 'ar';

    // Update HTML dir attribute
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;

    // Update all translatable elements
    updatePageTranslations();

    // Update active language button
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.lang === lang) {
            btn.classList.add('active');
        }
    });

    // Show notification
    const langNames = { en: 'English', fr: 'Français', ar: 'العربية', zh: '中文' };
    showNotification(`${t('messages.languageChanged')} ${langNames[lang]}`, 'success');
}

function updatePageTranslations() {
    // Update navigation
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.dataset.i18n;
        element.textContent = t(key);
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.dataset.i18nPlaceholder;
        element.placeholder = t(key);
    });
}

// ============================================
// Export for use in main script
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SecurityConfig,
        generateCSRFToken,
        getCSRFToken,
        sanitizeInput,
        validateInput,
        validateFile,
        switchLanguage,
        t,
        currentLanguage
    };
}
