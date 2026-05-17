// Global variable to catch the install prompt early
let shopDeferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    shopDeferredPrompt = e;
});

// Set shop logo as favicon (works on public pages that don't load main.js)
function setFavicon(logoUrl) {
    if (!logoUrl) return;

    // If it's a base64 data URL (potentially large), resize it for favicon use
    if (logoUrl.startsWith('data:image')) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 32, 32);
            const smallIcon = canvas.toDataURL('image/png');
            applyFavicon(smallIcon, 'image/png');
        };
        img.onerror = function () {
            // Fallback: use original URL directly
            applyFavicon(logoUrl, 'image/png');
        };
        img.src = logoUrl;
    } else {
        // External URL - use directly
        applyFavicon(logoUrl, 'image/png');
    }
}

function applyFavicon(href, mimeType) {
    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach(el => el.remove());

    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = mimeType;
    favicon.href = href;
    document.head.appendChild(favicon);

    const shortcutIcon = document.createElement('link');
    shortcutIcon.rel = 'shortcut icon';
    shortcutIcon.type = mimeType;
    shortcutIcon.href = href;
    document.head.appendChild(shortcutIcon);

    const appleFavicon = document.createElement('link');
    appleFavicon.rel = 'apple-touch-icon';
    appleFavicon.href = href;
    document.head.appendChild(appleFavicon);
}

// Image compression cache to avoid re-compressing same images
const _imgCompressCache = {};

/**
 * Compress an image URL client-side via canvas.
 * Returns a promise that resolves to a compressed data URL.
 * @param {string} url - Original image URL
 * @param {number} maxWidth - Max width in pixels (height scales proportionally)
 * @param {number} quality - JPEG quality 0-1
 * @returns {Promise<string>} Compressed data URL
 */
function compressImageUrl(url, maxWidth, quality) {
    if (!url || url.includes('placeholder') || url === 'about:blank') return Promise.resolve(url);
    // Skip if already a small data URL (already compressed on upload)
    if (url.startsWith('data:') && url.length < 50000) return Promise.resolve(url);

    const cacheKey = url + '_' + maxWidth + '_' + quality;
    if (_imgCompressCache[cacheKey]) return Promise.resolve(_imgCompressCache[cacheKey]);

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            try {
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                if (w > maxWidth) {
                    h = Math.round(h * (maxWidth / w));
                    w = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const compressed = canvas.toDataURL('image/jpeg', quality);
                _imgCompressCache[cacheKey] = compressed;
                resolve(compressed);
            } catch(e) {
                // CORS or other error — use original
                resolve(url);
            }
        };
        img.onerror = function() { resolve(url); };
        img.src = url;
    });
}

/**
 * Apply lazy compressed images to all elements with data-compress-src attribute.
 * Replaces placeholder with compressed version once loaded.
 */
function applyCompressedImages() {
    const elements = document.querySelectorAll('[data-compress-src]');
    elements.forEach(el => {
        const originalUrl = el.getAttribute('data-compress-src');
        const maxW = parseInt(el.getAttribute('data-compress-width')) || 400;
        const qual = parseFloat(el.getAttribute('data-compress-quality')) || 0.6;

        // Set original as fallback immediately (low priority load)
        el.setAttribute('data-original-url', originalUrl);

        compressImageUrl(originalUrl, maxW, qual).then(compressed => {
            el.src = compressed;
            el.removeAttribute('data-compress-src');
        });
    });
}

// Public Shop Products Logic with Carousel, Theme Support and Cart
class ShopProductsViewer {
    constructor() {
        this.shopId = null;
        this.shopData = null;
        this.shopSettings = null;
        this.products = [];
        this.filteredProducts = [];
        this.types = new Set();
        this.cart = [];
        this.appliedDiscount = null;
        this.selectedType = 'all';
        this.selectedOrderMethod = 'whatsapp';
        this.currentSlide = 0;
        this.deferredPrompt = shopDeferredPrompt;
        this.systemDomains = { mgmt: '', public: '' };
        this.assetBase = '';

        this.init();
    }

    getAssetUrl(path) {
        if (path && (path.startsWith('http') || path.startsWith('data:'))) return path;
        return `${this.assetBase}${path}`;
    }

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        let thisShopId = urlParams.get('id');
        let shopSlug = urlParams.get('u');

        // Check for "Short Style" URL (e.g. ?free)
        if (!thisShopId && !shopSlug && window.location.search.length > 1) {
            // Take the first parameter name as the slug
            shopSlug = window.location.search.substring(1).split('&')[0].split('=')[0];
        }

        if (!thisShopId && !shopSlug) {
            console.error('URL Search Params:', window.location.search);
            this.renderError('Could not identify the shop. The link appears to be incomplete (missing Shop ID or Unique Address).');
            return;
        }

        this.shopId = thisShopId;

        try {
            // Fetch Shop Data
            let shopQuery = supabaseClient.from('shops').select('*');

            if (shopSlug) {
                shopQuery = shopQuery.eq('slug', shopSlug);
            } else {
                shopQuery = shopQuery.eq('id', this.shopId);
            }

            const { data: shop, error: shopError } = await shopQuery.maybeSingle();

            if (shopError) {
                throw new Error(`Database Error: ${shopError.message}`);
            }

            if (!shop) {
                this.renderError('We couldn\'t find the shop you\'re looking for.');
                return;
            }

            // Check for restricted status (frozen or suspended)
            const status = shop.status || 'active';
            if (status.includes('frozen') || status.includes('suspended')) {
                const adminPhone = shop.admin_phone || '+91 00000 00000';
                const adminWA = shop.admin_whatsapp || adminPhone;
                const adminTG = shop.admin_telegram || '';

                const errorMsg = `
                    <div style="max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-top: 6px solid #e74c3c;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 60px; color: #e74c3c; margin-bottom: 20px;"></i>
                        <h2 style="font-size: 24px; color: #333; margin-bottom: 15px;">Shop Temporarily Unavailable</h2>
                        <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
                            This shop has been suspended by the system administrator. 
                            Please contact the administrator directly using the options below:
                        </p>
                        <div style="display: grid; gap: 10px;">
                            <a href="tel:${adminPhone}" style="display: block; padding: 15px; background: #f8f9fa; color: #333; text-decoration: none; border-radius: 10px; font-weight: 700;">
                                <i class="fas fa-phone"></i> Call Admin: ${adminPhone}
                            </a>
                            <a href="https://wa.me/${adminWA.replace(/\D/g, '')}" target="_blank" style="display: block; padding: 15px; background: #e8f5e9; color: #2e7d32; text-decoration: none; border-radius: 10px; font-weight: 700;">
                                <i class="fab fa-whatsapp"></i> WhatsApp Admin
                            </a>
                            ${adminTG ? `
                                <a href="https://t.me/${adminTG.replace('@', '')}" target="_blank" style="display: block; padding: 15px; background: #e3f2fd; color: #1565c0; text-decoration: none; border-radius: 10px; font-weight: 700;">
                                    <i class="fab fa-telegram"></i> Telegram Admin
                                </a>
                            ` : ''}
                        </div>
                    </div>
                `;
                this.renderError(errorMsg);
                return;
            }
            this.shopData = shop;
            this.shopId = shop.id;

            // Load settings, system domains, and products in PARALLEL
            const [settingsResult, domainsResult, productsResult] = await Promise.all([
                supabaseClient.from('shop_settings').select('*').eq('shop_id', this.shopId).maybeSingle(),
                supabaseClient.from('system_configs').select('key, value').or('key.eq.mgmt_domain,key.eq.public_shop_domain'),
                this.fetchProducts()
            ]);

            // Process settings
            if (settingsResult.error) {
                console.warn('Settings load error (Non-critical):', settingsResult.error);
            }
            this.shopSettings = settingsResult.data || {};

            // Process system domains
            if (domainsResult.data) {
                domainsResult.data.forEach(cfg => {
                    const cleanValue = cfg.value ? cfg.value.replace(/^https?:\/\//, '').split('/')[0].trim() : '';
                    if (cfg.key === 'mgmt_domain') this.systemDomains.mgmt = cleanValue;
                    if (cfg.key === 'public_shop_domain') this.systemDomains.public = cleanValue;
                });

                if (this.systemDomains.mgmt) {
                    this.assetBase = `https://${this.systemDomains.mgmt}/`;
                }

                // Domain Enforcement
                if (this.systemDomains.mgmt && this.systemDomains.public && window.location.hostname === this.systemDomains.mgmt) {
                    const publicUrl = window.location.href.replace(this.systemDomains.mgmt, this.systemDomains.public);
                    window.location.replace(publicUrl);
                    return;
                }
            }

            // Process products
            this.products = productsResult || [];
            this.filteredProducts = [...this.products];
            this.products.forEach(p => { if (p.type) this.types.add(p.type); });

            // Apply theme and update UI
            this.applyTheme();
            this.updateUI();

            // Render products immediately
            this.renderTypes();
            this.renderMetadataKeys();
            this.renderProducts();

            // Non-blocking: load cart, setup events, init carousel
            this.loadCartFromStorage();
            this.setupEventListeners();
            this.initCarousel();

            const yearEl = document.getElementById('year');
            if (yearEl) yearEl.textContent = new Date().getFullYear();

        } catch (error) {
            console.error('Initialization error details:', error);
            this.renderError(`Something went wrong while loading the shop: ${error.message}`);
        }
    }

    async fetchProducts() {
        // Load configured types for this shop's business type
        if (this.shopData?.business_type && this.shopData.business_type !== 'general') {
            const bizType = this.shopData.business_type;
            const bizTypeStd = bizType.charAt(0).toUpperCase() + bizType.slice(1).toLowerCase();

            const { data: typeConfig } = await supabaseClient
                .from('system_configs')
                .select('value')
                .or(`key.eq.types_${bizType},key.eq.types_${bizTypeStd}`)
                .maybeSingle();

            if (typeConfig && typeConfig.value) {
                typeConfig.value.split(',').map(t => t.trim()).filter(t => t).forEach(t => this.types.add(t));
            }
        }

        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .eq('shop_id', this.shopId)
            .neq('show_in_store', false)
            .gt('stock', 0)
            .order('priority', { ascending: true })
            .order('product_name', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    applyTheme() {
        const primary = this.shopSettings.theme_color || '#0f6425';
        const layout = this.shopSettings.theme_layout || 'default';

        document.documentElement.style.setProperty('--public-primary', primary);
        const secondary = this.adjustColor(primary, -20);
        document.documentElement.style.setProperty('--public-secondary', secondary);

        // Reset defaults
        document.documentElement.style.setProperty('--public-radius', '12px');
        document.documentElement.style.setProperty('--public-font', "'Inter', sans-serif");
        document.body.style.background = '#f9f9f9';
        document.body.style.color = '#333';

        // Apply Layout Specific Styles
        switch (layout) {
            case 'ocean':
                document.documentElement.style.setProperty('--public-radius', '30px');
                break;
            case 'sunset':
                document.documentElement.style.setProperty('--public-radius', '15px');
                break;
            case 'neon':
                document.body.style.background = '#0a0a0a';
                document.body.style.color = '#fff';
                document.documentElement.style.setProperty('--public-radius', '4px');
                break;
            case 'minimal':
                document.documentElement.style.setProperty('--public-radius', '0px');
                document.body.style.background = '#ffffff';
                break;
            case 'luxe':
                document.documentElement.style.setProperty('--public-font', "'Playfair Display', serif");
                document.documentElement.style.setProperty('--public-radius', '0px');
                break;
            case 'berry':
                document.documentElement.style.setProperty('--public-radius', '20px');
                break;
            case 'eco':
                document.documentElement.style.setProperty('--public-radius', '8px');
                document.body.style.background = '#f0f4f0';
                break;
            case 'royal':
                document.documentElement.style.setProperty('--public-radius', '12px');
                break;
            case 'retro':
                document.documentElement.style.setProperty('--public-radius', '0px');
                document.documentElement.style.setProperty('--public-font', "'Space Mono', monospace");
                break;
        }

        // Add theme-specific class to body for CSS targeting
        document.body.className = `public-shop-body theme-${layout}`;
    }

    adjustColor(hex, amt) {
        let usePound = false;
        if (hex[0] == "#") {
            hex = hex.slice(1);
            usePound = true;
        }

        // Handle 3-digit hex
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }

        let num = parseInt(hex, 16);
        let r = (num >> 16) + amt;
        if (r > 255) r = 255; else if (r < 0) r = 0;
        let g = ((num >> 8) & 0x00FF) + amt;
        if (g > 255) g = 255; else if (g < 0) g = 0;
        let b = (num & 0x0000FF) + amt;
        if (b > 255) b = 255; else if (b < 0) b = 0;

        const rr = r.toString(16).padStart(2, '0');
        const gg = g.toString(16).padStart(2, '0');
        const bb = b.toString(16).padStart(2, '0');

        return (usePound ? "#" : "") + rr + gg + bb;
    }

    updateUI() {
        const currentTitle = this.shopSettings.seo_title || `${this.shopData.shop_name} - Online Menu`;
        document.title = currentTitle;
        document.getElementById('publicHeaderName').textContent = this.shopData.shop_name;
        document.getElementById('footerShopName').textContent = this.shopData.shop_name;
        document.getElementById('publicHeroName').textContent = this.shopData.shop_name;
        document.getElementById('publicHeroAddress').textContent = this.shopData.address || 'Address not listed';

        // Update Canonical URL
        let canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) {
            const slug = this.shopData.slug || this.shopData.id;
            let origin = window.location.origin;

            // Domain Mapping: Dynamic from Super Admin panel
            if (this.systemDomains.mgmt && this.systemDomains.public && window.location.hostname === this.systemDomains.mgmt) {
                origin = origin.replace(this.systemDomains.mgmt, this.systemDomains.public);
            }
            canonical.href = `${origin}/${slug}`;
        }

        // Update Meta Description
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.name = "description";
            document.head.appendChild(metaDesc);
        }
        metaDesc.content = this.shopSettings.seo_description || this.shopSettings.about_us || `Welcome to ${this.shopData.shop_name}. Buy the best products online.`;

        // Update Open Graph & Twitter Tags
        let publicOrigin = window.location.origin;
        if (this.systemDomains.mgmt && this.systemDomains.public && window.location.hostname === this.systemDomains.mgmt) {
            publicOrigin = publicOrigin.replace(this.systemDomains.mgmt, this.systemDomains.public);
        }
        const shopUrl = `${publicOrigin}/${this.shopData.slug || this.shopData.id}`;
        const shopTitle = currentTitle;
        const shopDesc = metaDesc.content;
        const shopImage = this.shopData.shop_logo || '';

        const metaUpdates = {
            'og:title': shopTitle,
            'og:description': shopDesc,
            'og:url': shopUrl,
            'og:site_name': this.shopData.shop_name,
            'og:image': shopImage,
            'twitter:title': shopTitle,
            'twitter:description': shopDesc,
            'twitter:image': shopImage,
            'twitter:url': shopUrl
        };

        for (const [key, value] of Object.entries(metaUpdates)) {
            let el = document.querySelector(`meta[property="${key}"]`) || document.querySelector(`meta[name="${key}"]`);
            if (el) {
                el.content = value;
            } else if (value) {
                const newMeta = document.createElement('meta');
                if (key.startsWith('og:')) newMeta.setAttribute('property', key);
                else newMeta.setAttribute('name', key);
                newMeta.content = value;
                document.head.appendChild(newMeta);
            }
        }

        // Update APK Logo in Menu
        const apkLogo = document.getElementById('navApkLogo');
        if (apkLogo && this.shopData.shop_logo) {
            apkLogo.src = this.shopData.shop_logo;
        }

        // Generate Dynamic PWA Manifest
        this.updateDynamicManifest();

        // Footer & Links
        const addr = this.shopData.address || 'Address not listed';
        const phone = this.shopData.phone || 'N/A';
        const whatsapp = this.shopSettings.whatsapp_number || this.shopData.phone || '';

        document.getElementById('footerAbout').textContent = this.shopSettings.about_us || 'Experience the best shopping with us. High quality products and fast delivery.';
        document.getElementById('footerAddress').textContent = addr;
        document.getElementById('footerAddressLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

        document.getElementById('footerPhone').textContent = phone;
        document.getElementById('footerPhoneLink').href = `tel:${phone}`;

        document.getElementById('footerWA').textContent = whatsapp || 'N/A';
        if (whatsapp) {
            const cleanWA = whatsapp.replace(/\+/g, '').replace(/\s/g, '');
            document.getElementById('footerWALink').href = `https://wa.me/${cleanWA}`;
        }

        if (this.shopData.shop_logo) {
            document.getElementById('publicHeaderLogo').src = this.shopData.shop_logo;

            // Set shop logo as favicon
            setFavicon(this.shopData.shop_logo);
        }

        if (this.shopSettings.banner_text) {
            document.getElementById('popupText').textContent = this.shopSettings.banner_text;
            setTimeout(() => {
                const banner = document.getElementById('bannerPopup');
                if (banner) {
                    banner.style.display = 'flex';
                    document.body.style.overflow = 'hidden';
                }
            }, 1500); // Small delay for better UX
        }

        if (this.shopSettings.opening_hours) {
            document.getElementById('footerHours').textContent = this.shopSettings.opening_hours;
        }

        const mapsUrl = this.shopSettings.google_maps_url || this.shopSettings.maps_url;
        if (mapsUrl) {
            const container = document.getElementById('mapContainer');
            const iframe = document.getElementById('googleMap');
            if (container && iframe) {
                container.style.display = 'block';
                iframe.src = mapsUrl;
            }
        }

        if (this.shopSettings.facebook_url) document.getElementById('fbLink').href = this.shopSettings.facebook_url;
        else document.getElementById('fbLink').style.display = 'none';

        if (this.shopSettings.instagram_url) document.getElementById('igLink').href = this.shopSettings.instagram_url;
        else document.getElementById('igLink').style.display = 'none';

        // Nav Drawer Population
        document.getElementById('navShopName').textContent = this.shopData.shop_name;
        document.getElementById('navYear').textContent = new Date().getFullYear();
        if (this.shopSettings.facebook_url) document.getElementById('navFb').href = this.shopSettings.facebook_url;
        if (this.shopSettings.instagram_url) document.getElementById('navIg').href = this.shopSettings.instagram_url;

        // SEO Keywords
        if (this.shopSettings.seo_keywords) {
            let meta = document.querySelector('meta[name="keywords"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = "keywords";
                document.head.appendChild(meta);
            }
            meta.content = this.shopSettings.seo_keywords;
        }

        // Custom Scripts Injection (only allow scripts from trusted sources, not inline)
        if (this.shopSettings.custom_scripts) {
            // Sanitize: Only allow external script src, block inline scripts
            const div = document.createElement('div');
            div.innerHTML = this.shopSettings.custom_scripts;

            // Extract and execute only external scripts (with src attribute)
            Array.from(div.querySelectorAll('script')).forEach(oldScript => {
                if (oldScript.src) {
                    const newScript = document.createElement('script');
                    newScript.src = oldScript.src;
                    if (oldScript.async) newScript.async = true;
                    if (oldScript.defer) newScript.defer = true;
                    document.body.appendChild(newScript);
                }
                // Inline scripts are intentionally skipped for security
            });

            // Append non-script elements (like style or meta)
            Array.from(div.childNodes).forEach(node => {
                if (node.nodeName !== 'SCRIPT' && node.nodeType === 1) {
                    document.head.appendChild(node.cloneNode(true));
                }
            });
        }
    }

    updateDynamicManifest() {
        const manifest = {
            "name": this.shopData.shop_name,
            "short_name": this.shopData.shop_name.substring(0, 12),
            "description": this.shopSettings.about_us || `Order from ${this.shopData.shop_name} online.`,
            "start_url": window.location.href,
            "display": "standalone",
            "background_color": "#ffffff",
            "theme_color": this.shopSettings.theme_color || "#0f6425",
            "icons": [
                {
                    "src": this.getAssetUrl(this.shopData.shop_logo || "assets/default-shop-logo.png"),
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "any maskable"
                },
                {
                    "src": this.getAssetUrl(this.shopData.shop_logo || "assets/default-shop-logo.png"),
                    "sizes": "512x512",
                    "type": "image/png"
                }
            ]
        };

        const stringManifest = JSON.stringify(manifest);
        const blob = new Blob([stringManifest], { type: 'application/json' });
        const manifestURL = URL.createObjectURL(blob);

        // Remove existing manifest link and add new one
        let oldManifest = document.querySelector('link[rel="manifest"]');
        if (oldManifest) oldManifest.remove();

        const newLink = document.createElement('link');
        newLink.rel = 'manifest';
        newLink.href = manifestURL;
        document.head.appendChild(newLink);
    }
    initCarousel() {
        const carousel = document.getElementById('heroCarousel');
        const dotsContainer = document.getElementById('carouselDots');
        if (!carousel || !dotsContainer) return;

        let images = this.shopSettings.carousel_images || [];

        // Handle potential stringified JSON
        if (typeof images === 'string') {
            try { images = JSON.parse(images); } catch (e) { images = []; }
        }

        // Ensure images is actually an array
        if (!Array.isArray(images)) images = [];

        // If no custom images, the default one from HTML will stay (it has the IDs)
        if (images.length === 0) return;

        // Populate carousel
        carousel.innerHTML = images.map((src, index) => `
            <div class="public-carousel-item" style="background-image: url('${src}');">
                <div class="public-hero-overlay">
                    <h2 ${index === 0 ? 'id="publicHeroName"' : ''}>${this.shopData.shop_name}</h2>
                    <p ${index === 0 ? 'id="publicHeroAddress"' : ''}>${this.shopData.address || ''}</p>
                </div>
            </div>
        `).join('');

        // Populate dots
        dotsContainer.innerHTML = images.map((_, i) => `
            <div class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>
        `).join('');

        // Reset slide
        this.currentSlide = 0;
        this.updateCarousel();

        // Clear existing interval
        if (this.carouselInterval) clearInterval(this.carouselInterval);

        if (images.length > 1) {
            this.carouselInterval = setInterval(() => {
                this.currentSlide = (this.currentSlide + 1) % images.length;
                this.updateCarousel();
            }, 5000);
        }

        dotsContainer.querySelectorAll('.carousel-dot').forEach(dot => {
            dot.onclick = () => {
                this.currentSlide = parseInt(dot.dataset.index);
                this.updateCarousel();
            };
        });
    }

    updateCarousel() {
        const carousel = document.getElementById('heroCarousel');
        const dots = document.querySelectorAll('.carousel-dot');
        carousel.style.transform = `translateX(-${this.currentSlide * 100}%)`;
        dots.forEach((dot, i) => dot.classList.toggle('active', i === this.currentSlide));
    }

    renderTypes() {
        const container = document.getElementById('typesContainer');
        if (!container) return;

        // Clear only generated buttons, keep the 'All' button (first child)
        // Actually easier to just rebuild or append. 
        // Let's clear everything but the first element if we want to preserve valid event listeners on "All", 
        // OR just rebuild "All" button too.
        // The safest way given the 'All' button is static in HTML is to find it or append after it.
        // But the previous code just appended. Let's stick to appending but robustly.

        // Clear strictly the dynamic ones if possible, but simplest is:
        const allBtn = container.querySelector('[data-type="all"]');

        // Remove all siblings of allBtn
        while (allBtn && allBtn.nextSibling) {
            allBtn.nextSibling.remove();
        }

        // Sort types based on category_order if defined
        let sortedTypes = Array.from(this.types);
        if (this.shopSettings.category_order) {
            const order = this.shopSettings.category_order.split(',').map(s => s.trim().toLowerCase());
            sortedTypes.sort((a, b) => {
                const indexA = order.indexOf(a.toLowerCase());
                const indexB = order.indexOf(b.toLowerCase());
                if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });
        } else {
            sortedTypes.sort();
        }

        sortedTypes.forEach(type => {
            const btn = document.createElement('button');
            btn.className = 'public-cat-btn'; // Keep class for styling
            btn.textContent = type;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.public-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedType = type;

                // Clear metadata filters
                const k = document.getElementById('metaKeySelect');
                const v = document.getElementById('metaValueSelect');
                if (k) k.value = "";
                if (v) { v.innerHTML = '<option value="">Value</option>'; v.disabled = true; }

                this.handleFilter();
            });
            container.appendChild(btn);
        });

        if (allBtn) {
            allBtn.onclick = (e) => {
                document.querySelectorAll('.public-cat-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.selectedType = 'all';

                // Clear metadata filters
                const k = document.getElementById('metaKeySelect');
                const v = document.getElementById('metaValueSelect');
                if (k) k.value = "";
                if (v) { v.innerHTML = '<option value="">Value</option>'; v.disabled = true; }

                this.handleFilter();
            };
        }
    }

    setupEventListeners() {
        // Search, Sort and Price Filters
        const searchInput = document.getElementById('publicSearch');
        const sortSelect = document.getElementById('sortProducts');
        const minPriceInput = document.getElementById('minPrice');
        const maxPriceInput = document.getElementById('maxPrice');
        const applyPriceBtn = document.getElementById('applyPriceFilter');

        if (searchInput) searchInput.addEventListener('input', () => this.handleFilter());
        if (sortSelect) sortSelect.addEventListener('change', () => this.handleFilter());
        if (applyPriceBtn) applyPriceBtn.addEventListener('click', () => this.handleFilter());

        // Filter Toggle Button
        const filterToggle = document.getElementById('filterToggle');
        const filterBar = document.getElementById('filterBar');
        if (filterToggle && filterBar) {
            filterToggle.addEventListener('click', () => {
                const isActive = filterToggle.classList.contains('active');

                if (isActive) {
                    // Close the filter
                    filterBar.classList.remove('show');
                    filterToggle.classList.remove('active');
                    setTimeout(() => {
                        filterBar.style.display = 'none';
                    }, 300);
                } else {
                    // Open the filter
                    filterBar.style.display = 'flex';
                    filterToggle.classList.add('active');
                    setTimeout(() => {
                        filterBar.classList.add('show');
                    }, 10);
                }
            });
        }

        // Metadata Filters
        const metaKeySelect = document.getElementById('metaKeySelect');
        const metaValueSelect = document.getElementById('metaValueSelect');
        if (metaKeySelect) metaKeySelect.addEventListener('change', () => this.updateMetadataValues());
        if (metaValueSelect) metaValueSelect.addEventListener('change', () => this.handleFilter());

        // Navigation and Cart
        document.getElementById('cartToggle')?.addEventListener('click', () => this.toggleCart(true));
        document.getElementById('closeCart')?.addEventListener('click', () => this.toggleCart(false));
        document.getElementById('overlay')?.addEventListener('click', () => {
            this.toggleCart(false);
            this.toggleNav(false);
        });

        // Discount and Checkout
        document.getElementById('applyDiscountBtn')?.addEventListener('click', () => this.applyDiscount());
        document.getElementById('checkoutBtn')?.addEventListener('click', () => {
            if (this.cart.length === 0) return alert('Your basket is empty!');
            this.toggleOrderModal(true);
        });

        // Order Method selection
        document.querySelectorAll('.public-order-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.public-order-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.selectedOrderMethod = opt.dataset.method;
            });
        });

        document.getElementById('cancelOrder')?.addEventListener('click', () => this.toggleOrderModal(false));
        document.getElementById('confirmOrder')?.addEventListener('click', () => this.sendOrder());

        // Nav Drawer
        document.getElementById('navToggle')?.addEventListener('click', () => this.toggleNav(true));
        document.getElementById('closeNav')?.addEventListener('click', () => this.toggleNav(false));
        document.querySelectorAll('.nav-menu a').forEach(link => {
            link.addEventListener('click', () => this.toggleNav(false));
        });

        // PWA Install logic
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

        // Check again if prompt was captured globally while we were loading
        if (shopDeferredPrompt) this.deferredPrompt = shopDeferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            shopDeferredPrompt = e;
        });

        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.addEventListener('click', async (e) => {
                e.preventDefault();

                if (isIOS) {
                    alert('To install this app on iPhone/iPad: Tap the "Share" icon (square with arrow up) in Safari and select "Add to Home Screen".');
                    return;
                }

                if (!this.deferredPrompt) {
                    alert('Installation prompt not available yet. If you see the install icon in the address bar, please wait a second or try again. You can also install via the browser menu (Settings > Install App).');
                    return;
                }

                try {
                    this.deferredPrompt.prompt();
                    const { outcome } = await this.deferredPrompt.userChoice;
                    console.log(`User response to install prompt: ${outcome}`);
                    this.deferredPrompt = null;
                    shopDeferredPrompt = null;
                } catch (err) {
                    console.error('Installation error:', err);
                    alert('Installation failed. Please try installing via the browser menu.');
                }
            });
        }

        // Popup Handlers
        const closePopup = document.getElementById('closePopup');
        const popupAction = document.getElementById('popupAction');
        const bannerPopup = document.getElementById('bannerPopup');

        const hidePopup = () => {
            if (bannerPopup) bannerPopup.style.display = 'none';
            document.body.style.overflow = '';
        };

        if (closePopup) closePopup.onclick = hidePopup;
        if (popupAction) popupAction.onclick = hidePopup;
        if (bannerPopup) {
            bannerPopup.onclick = (e) => {
                if (e.target === bannerPopup) hidePopup();
            };
        }

        // Product Detail Handlers
        // Product Detail Handlers
        const detailModal = document.getElementById('productDetailModal');
        const closeDetail = document.getElementById('closeProductDetail');
        if (closeDetail && detailModal) {
            closeDetail.onclick = () => {
                detailModal.classList.remove('active');
                setTimeout(() => detailModal.style.display = 'none', 300); // Wait for potential animation
                document.body.style.overflow = '';
            };
            detailModal.onclick = (e) => {
                if (e.target === detailModal) {
                    detailModal.classList.remove('active');
                    setTimeout(() => detailModal.style.display = 'none', 300);
                    document.body.style.overflow = '';
                }
            };
        }

        // Full Screen Image Overlay Handlers
        const fsOverlay = document.getElementById('fullScreenImageOverlay');
        const detailImageWrapper = document.getElementById('detailImageWrapper');
        if (fsOverlay && detailImageWrapper) {
            detailImageWrapper.onclick = () => {
                const img = document.getElementById('detailImage');
                if (img) {
                    // Show ORIGINAL uncompressed image in lightbox
                    const originalSrc = img.getAttribute('data-original-src') || img.src;
                    const fsImg = fsOverlay.querySelector('img');
                    if (fsImg) fsImg.src = originalSrc;
                    fsOverlay.classList.add('active');
                }
            };
            fsOverlay.onclick = () => {
                fsOverlay.classList.remove('active');
            };
        }

        // Initialize Drag Scroll for horizontal containers
        this.initDragScroll(document.getElementById('typesContainer'));
        this.initDragScroll(document.getElementById('detailThumbnails'));
    }

    initDragScroll(slider) {
        if (!slider) return;

        let isDown = false;
        let startX;
        let scrollLeft;

        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.classList.add('dragging');
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
            slider.style.cursor = 'grabbing';
            slider.style.userSelect = 'none';
        });

        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.classList.remove('dragging');
            slider.style.cursor = '';
        });

        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.classList.remove('dragging');
            slider.style.cursor = '';
            slider.style.userSelect = '';
        });

        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 2; // Scroll speed
            slider.scrollLeft = scrollLeft - walk;
        });
    }

    toggleNav(show) {
        document.getElementById('navDrawer').classList.toggle('active', show);
        document.getElementById('overlay').style.display = show ? 'block' : 'none';

        // Prevent body scroll
        document.body.style.overflow = show ? 'hidden' : '';
    }

    renderMetadataKeys(products = this.products) {
        const keySelect = document.getElementById('metaKeySelect');
        const valueSelect = document.getElementById('metaValueSelect');
        if (!keySelect) return;

        // Keep current selection if valid
        const currentKey = keySelect.value;

        // Reset
        keySelect.innerHTML = '<option value="">Filter</option>';

        // Collect keys
        const keys = new Set();
        products.forEach(p => {
            if (p.metadata && typeof p.metadata === 'object') {
                Object.keys(p.metadata).forEach(k => {
                    if (k !== 'product_images' && k !== 'product_image') keys.add(k);
                });
            } else if (typeof p.metadata === 'string') {
                try {
                    const meta = JSON.parse(p.metadata);
                    Object.keys(meta).forEach(k => {
                        if (k !== 'product_images' && k !== 'product_image') keys.add(k);
                    });
                } catch (e) { }
            }
        });

        Array.from(keys).sort().forEach(k => {
            const label = k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1');
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = label;
            keySelect.appendChild(opt);
        });

        // Restore if possible
        if (currentKey && keys.has(currentKey)) {
            keySelect.value = currentKey;
        } else {
            keySelect.value = "";
            valueSelect.innerHTML = '<option value="">Value</option>';
            valueSelect.disabled = true;
        }
    }

    updateMetadataValues() {
        const keySelect = document.getElementById('metaKeySelect');
        const valueSelect = document.getElementById('metaValueSelect');
        if (!keySelect || !valueSelect) return;

        const key = keySelect.value;
        if (!key) {
            valueSelect.innerHTML = '<option value="">Value</option>';
            valueSelect.disabled = true;
            this.handleFilter();
            return;
        }

        // Collect values for this key from ALL products (or currently filtered by type)
        // Better to use products filtered by type so we don't show irrelevant values
        const typeFiltered = this.selectedType === 'all'
            ? this.products
            : this.products.filter(p => p.type === this.selectedType);

        const values = new Set();
        typeFiltered.forEach(p => {
            let meta = p.metadata;
            if (typeof meta === 'string') {
                try { meta = JSON.parse(meta); } catch (e) { meta = null; }
            }
            if (meta && meta[key]) {
                values.add(meta[key]);
            }
        });

        valueSelect.innerHTML = '<option value="">Value</option>';
        Array.from(values).sort().forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            valueSelect.appendChild(opt);
        });
        valueSelect.disabled = false;

        // Trigger filter to clear previous metadata value selection
        this.handleFilter();
    }

    handleFilter() {
        const searchTerm = document.getElementById('publicSearch').value.toLowerCase();
        const sortValue = document.getElementById('sortProducts').value;
        const minPrice = parseFloat(document.getElementById('minPrice').value) || 0;
        const maxPrice = parseFloat(document.getElementById('maxPrice').value) || Infinity;

        const metaKey = document.getElementById('metaKeySelect') ? document.getElementById('metaKeySelect').value : '';
        const metaValue = document.getElementById('metaValueSelect') ? document.getElementById('metaValueSelect').value : '';

        // 1. Filter
        this.filteredProducts = this.products.filter(p => {
            const name = (p.product_name || '').toLowerCase();
            const matchesSearch = name.includes(searchTerm);
            const matchesType = this.selectedType === 'all' || p.type === this.selectedType;

            const price = parseFloat(p.selling_price) || 0;
            const matchesPrice = price >= minPrice && price <= maxPrice;

            // Metadata Filter
            let matchesMeta = true;
            if (metaKey && metaValue) {
                let meta = p.metadata;
                if (typeof meta === 'string') {
                    try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
                }
                matchesMeta = meta && meta[metaKey] == metaValue;
            }

            return matchesSearch && matchesType && matchesPrice && matchesMeta;
        });

        // 2. Sort
        this.filteredProducts.sort((a, b) => {
            const priceA = parseFloat(a.selling_price) || 0;
            const priceB = parseFloat(b.selling_price) || 0;
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();

            switch (sortValue) {
                case 'price-low': return priceA - priceB;
                case 'price-high': return priceB - priceA;
                case 'oldest': return dateA - dateB;
                case 'newest':
                default:
                    return dateB - dateA;
            }
        });

        // Reset to page 1 when filter changes
        this.currentProductPage = 1;
        this._paginationTriggered = false;

        this.renderProducts();
    }

    renderProducts() {
        const grid = document.getElementById('productsGrid');
        const currency = this.shopSettings.currency || 'INR';

        if (this.filteredProducts.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px;">No products found</div>';
            return;
        }

        // Pagination settings
        const perPage = 12;
        this.currentProductPage = this.currentProductPage || 1;
        const totalProducts = this.filteredProducts.length;
        const totalPages = Math.ceil(totalProducts / perPage);
        const showProducts = this.filteredProducts.slice(0, this.currentProductPage * perPage);

        grid.innerHTML = showProducts.map(product => {
            const imgUrl = this.getAssetUrl(product.product_image || 'assets/default-product.png');
            return `
                <div class="public-product-card" onclick="app.openProductDetail('${product.id}')" style="cursor:pointer;">
                    <div class="public-product-img">
                        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect fill='%23f0f0f0' width='300' height='300'/%3E%3C/svg%3E" 
                             data-compress-src="${imgUrl}" 
                             data-compress-width="400" 
                             data-compress-quality="0.6" 
                             alt="${product.product_name}" 
                             style="transition:opacity 0.3s;">
                    </div>
                    <div class="public-product-details">
                        <span class="public-product-cat">${product.type || 'General'}</span>
                        <h3 class="public-product-name">${product.product_name}</h3>
                        <div class="public-product-price">${this.formatCurrency(product.selling_price, currency)}</div>
                        <button class="public-add-btn">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Apply compressed images after rendering
        applyCompressedImages();

        // Add pagination controls (same style as inventory)
        if (totalProducts > perPage) {
            const startItem = (this.currentProductPage - 1) * perPage + 1;
            const endItem = Math.min(this.currentProductPage * perPage, totalProducts);
            grid.innerHTML += `
                <div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:10px;">
                    <span style="font-size:0.8rem;color:#64748b;">Showing ${startItem}-${endItem} of ${totalProducts}</span>
                    <div style="display:flex;gap:4px;align-items:center;">
                        <button onclick="app.currentProductPage=1;app.renderProducts();" ${this.currentProductPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${this.currentProductPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
                        <button onclick="app.currentProductPage--;app.renderProducts();" ${this.currentProductPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${this.currentProductPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
                        <span style="padding:6px 12px;background:var(--public-primary);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${this.currentProductPage} / ${totalPages}</span>
                        <button onclick="app.currentProductPage++;app.renderProducts();" ${this.currentProductPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${this.currentProductPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
                        <button onclick="app.currentProductPage=${totalPages};app.renderProducts();" ${this.currentProductPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${this.currentProductPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
                    </div>
                </div>
            `;
        }

        // Track pagination state
        this._paginationTriggered = true;
    }

    addToCart(productId, event) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        // --- Animation Logic ---
        const btn = event.currentTarget;
        const cartIcon = document.getElementById('cartToggle');
        let productImg;

        const productCard = btn.closest('.public-product-card');
        if (productCard) {
            productImg = productCard.querySelector('img');
        } else {
            // Fallback for Modal
            productImg = document.getElementById('detailImage');
        }

        if (productImg && cartIcon) {
            const flyingImg = document.createElement('img');
            flyingImg.src = productImg.src;
            flyingImg.className = 'flying-img';

            // Initial position
            const rect = productImg.getBoundingClientRect();
            flyingImg.style.top = `${rect.top}px`;
            flyingImg.style.left = `${rect.left}px`;
            flyingImg.style.width = `${rect.width}px`;
            flyingImg.style.height = `${rect.height}px`;

            document.body.appendChild(flyingImg);

            // Target position (cart icon)
            const cartRect = cartIcon.getBoundingClientRect();

            setTimeout(() => {
                flyingImg.style.top = `${cartRect.top + 10}px`;
                flyingImg.style.left = `${cartRect.left + 10}px`;
                flyingImg.style.width = '20px';
                flyingImg.style.height = '20px';
                flyingImg.style.opacity = '0.5';
            }, 10);

            // Clean up and bounce cart
            setTimeout(() => {
                flyingImg.remove();
                cartIcon.classList.add('cart-bounce');
                setTimeout(() => cartIcon.classList.remove('cart-bounce'), 400);
            }, 1200);
        }

        // Button feedback
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Added!';
        btn.classList.add('added');
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.classList.remove('added');
        }, 1500);
        // -------------------------

        const existing = this.cart.find(item => item.id === productId);
        if (existing) existing.quantity++;
        else this.cart.push({ id: product.id, name: product.product_name, price: product.selling_price, image: product.product_image, quantity: 1 });

        this.saveCartToStorage();
        this.updateCartUI();
    }

    updateCartUI() {
        const list = document.getElementById('cartItemsList');
        const count = document.getElementById('cartCount');
        const currency = this.shopSettings.currency || 'INR';

        count.textContent = this.cart.reduce((sum, item) => sum + item.quantity, 0);

        if (this.cart.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 20px;">Empty</div>';
            this.updateTotals();
            return;
        }

        list.innerHTML = this.cart.map(item => `
            <div class="public-cart-item">
                <img src="${this.getAssetUrl(item.image || 'assets/default-product.png')}" alt="${item.name}">
                <div class="public-cart-item-info">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <h5 style="margin: 0;">${item.name}</h5>
                        <button class="delete-item-btn" onclick="app.removeFromCart('${item.id}')" style="background: none; border: none; color: #ff4757; cursor: pointer; padding: 0 5px;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                    <div class="public-cart-item-price">${this.formatCurrency(item.price, currency)}</div>
                    <div class="public-cart-controls">
                        <button class="public-qty-btn" onclick="app.updateQty('${item.id}', -1)">-</button>
                        <span>${item.quantity}</span>
                        <button class="public-qty-btn" onclick="app.updateQty('${item.id}', 1)">+</button>
                    </div>
                </div>
            </div>
        `).join('');

        this.updateTotals();
    }

    removeFromCart(productId) {
        if (confirm('Remove this item from basket?')) {
            this.cart = this.cart.filter(i => i.id !== productId);
            this.saveCartToStorage();
            this.updateCartUI();
        }
    }

    updateQty(productId, delta) {
        const item = this.cart.find(i => i.id === productId);
        if (item) {
            item.quantity += delta;
            if (item.quantity <= 0) this.cart = this.cart.filter(i => i.id !== productId);
            this.saveCartToStorage();
            this.updateCartUI();
        }
    }

    updateTotals() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        let discount = 0;
        const currency = this.shopSettings.currency || 'INR';

        if (this.appliedDiscount) {
            const d = this.appliedDiscount;
            if (subtotal >= d.minOrder) {
                discount = d.type === 'percentage' ? (subtotal * d.value / 100) : d.value;
                document.getElementById('discountRow').style.display = 'flex';
                document.getElementById('discountVal').textContent = `- ${this.formatCurrency(discount, currency)}`;
                document.getElementById('discountMsg').textContent = `Applied: ${d.name}`;
                document.getElementById('discountMsg').style.color = '#14aa14';
            } else {
                this.appliedDiscount = null;
                document.getElementById('discountRow').style.display = 'none';
                document.getElementById('discountMsg').textContent = `Min order ${this.formatCurrency(d.minOrder, currency)} required.`;
                document.getElementById('discountMsg').style.color = 'red';
            }
        }

        document.getElementById('subtotalVal').textContent = this.formatCurrency(subtotal, currency);
        document.getElementById('totalVal').textContent = this.formatCurrency(subtotal - discount, currency);
    }

    applyDiscount() {
        const input = document.getElementById('discountCode');
        const code = input.value.trim().toUpperCase();

        if (!code) return;

        let discounts = this.shopSettings.discount_codes || [];

        // Handle potential stringified JSON from database
        if (typeof discounts === 'string') {
            try {
                discounts = JSON.parse(discounts);
            } catch (e) {
                console.error('Error parsing discount codes:', e);
                discounts = [];
            }
        }

        if (!Array.isArray(discounts)) discounts = [];

        const found = discounts.find(d =>
            d.name && d.name.toUpperCase() === code && d.status === 'active'
        );

        if (found) {
            this.appliedDiscount = found;
            this.updateTotals();
            input.value = ''; // Clear input
            console.log('Discount applied:', found);
        } else {
            document.getElementById('discountMsg').textContent = 'Invalid or expired code';
            document.getElementById('discountMsg').style.color = 'red';
        }
    }

    sendOrder() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const currency = this.shopSettings.currency || 'INR';
        let discount = 0;
        let discountNote = "";

        if (this.appliedDiscount) {
            const d = this.appliedDiscount;
            if (subtotal >= d.minOrder) {
                discount = d.type === 'percentage' ? (subtotal * d.value / 100) : d.value;
                discountNote = `\n*Discount (${d.name}): -${this.formatCurrency(discount, currency)}*`;
            }
        }

        const total = subtotal - discount;
        const shopName = this.shopData?.shop_name || 'Shop';

        let message = `🛒 *NEW ORDER — ${shopName}*\n`;
        message += `📅 ${new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'})} ${new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12:true})}\n`;
        message += `━━━━━━━━━━━━━━━━━━\n\n`;

        message += `📦 *ITEMS:*\n`;
        this.cart.forEach((item, idx) => {
            message += `${idx + 1}. *${item.name}*\n`;
            message += `   Qty: ${item.quantity} × ${this.formatCurrency(item.price, currency)} = ${this.formatCurrency(item.price * item.quantity, currency)}\n`;

            // Add specs for this item
            const productId = item.id.includes('_') ? item.id.split('_')[0] : item.id;
            const product = this.products.find(p => p.id === productId);
            if (product) {
                let meta = product.metadata;
                if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = null; } }
                if (meta && typeof meta === 'object') {
                    const skip = ['product_images','product_image','variant_group','variant_size','variant_color','variant_label','has_variants','base_stock'];
                    const specs = Object.entries(meta).filter(([k, v]) => v && !skip.includes(k));
                    if (specs.length > 0) {
                        message += `   📋 ${specs.map(([k, v]) => `${k.replace(/_/g,' ')}: ${v}`).join(' | ')}\n`;
                    }
                }
            }
        });

        message += `\n━━━━━━━━━━━━━━━━━━\n`;
        message += `💰 Subtotal: ${this.formatCurrency(subtotal, currency)}\n`;
        if (discount > 0) message += `🏷️ Discount: -${this.formatCurrency(discount, currency)}\n`;
        message += `✅ *TOTAL: ${this.formatCurrency(total, currency)}*\n`;
        message += `━━━━━━━━━━━━━━━━━━\n\n`;
        message += `📍 _Sent from ${shopName} online store_`;

        if (this.selectedOrderMethod === 'whatsapp') {
            const num = (this.shopSettings.whatsapp_number || this.shopData.phone || '').replace(/\D/g, '');
            window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, '_blank');
        } else {
            const user = (this.shopSettings.telegram_id || '').replace('@', '');
            window.open(`https://t.me/${user}?text=${encodeURIComponent(message)}`, '_blank');
        }
    }

    toggleCart(show) { document.getElementById('cartSidebar').classList.toggle('active', show); document.getElementById('overlay').style.display = show ? 'block' : 'none'; }
    toggleOrderModal(show) { document.getElementById('orderModal').classList.toggle('active', show); }
    formatCurrency(amount, currencyCode) { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currencyCode }).format(amount || 0); } catch (e) { return (amount || 0).toFixed(2) + ' ' + currencyCode; } }
    saveCartToStorage() { localStorage.setItem(`cart_${this.shopId}`, JSON.stringify(this.cart)); }
    loadCartFromStorage() { const saved = localStorage.getItem(`cart_${this.shopId}`); if (saved) { this.cart = JSON.parse(saved); this.updateCartUI(); } }
    renderError(msg) { document.body.innerHTML = `<div style="text-align:center;padding:100px;">${msg}</div>`; }

    async openProductDetail(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        const modal = document.getElementById('productDetailModal');
        const img = document.getElementById('detailImage');
        const thumbs = document.getElementById('detailThumbnails');
        const nameEl = document.getElementById('detailName');
        const priceEl = document.getElementById('detailPrice');
        const cat = document.getElementById('detailCat');
        const desc = document.getElementById('detailDesc');
        const specsContainer = document.getElementById('detailSpecs');
        const addBtn = document.getElementById('detailAddToCart');
        if (!modal || !img) return;

        const currency = this.shopSettings.currency || 'INR';
        const self = this;

        // Set base product info — use compressed image for detail view
        const originalImgUrl = this.getAssetUrl(product.product_image || 'assets/default-product.png');
        img.src = originalImgUrl; // Show original immediately, compress in background
        img.setAttribute('data-original-src', originalImgUrl); // Store original for lightbox
        compressImageUrl(originalImgUrl, 600, 0.7).then(compressed => { if (img.getAttribute('data-original-src') === originalImgUrl) img.src = compressed; });

        nameEl.textContent = product.product_name;
        priceEl.textContent = this.formatCurrency(product.selling_price, currency);
        cat.textContent = product.type || 'General';
        const pureDesc = product.description ? product.description.split('--SPECIFICATIONS--')[0].split('--VARIANT_DATA--')[0].trim() : 'No description provided.';
        desc.textContent = pureDesc;
        addBtn.setAttribute('data-id', product.id);
        addBtn.onclick = (e) => { self.addToCart(product.id, e); };

        // Clear specs and thumbs
        specsContainer.innerHTML = '';
        if (thumbs) { thumbs.innerHTML = ''; thumbs.style.display = 'none'; }

        // Load variants from product_variants table
        let variants = [];
        try {
            const { data, error } = await supabaseClient
                .from('product_variants')
                .select('*')
                .eq('product_id', productId)
                .eq('is_active', true)
                .order('created_at');

            if (!error && data && data.length > 0) {
                variants = data;
            }
        } catch (e) { console.warn('Variants load failed:', e); }

        // If product has variants, show variant selector
        if (variants.length > 0) {
            // Show product images as gallery thumbnails FIRST
            if (thumbs) {
                let imageList = [];
                // Add main product image first
                if (product.product_image) imageList.push(product.product_image);
                // Add product_images array
                let extraImages = product.product_images || [];
                if (typeof extraImages === 'string') { try { extraImages = JSON.parse(extraImages); } catch(e) { extraImages = []; } }
                extraImages.forEach(url => { if (url && !imageList.includes(url)) imageList.push(url); });
                // Include variant images in the gallery too
                variants.forEach(v => { if (v.image_url && !imageList.includes(v.image_url)) imageList.push(v.image_url); });

                if (imageList.length > 1) {
                    imageList.forEach((url, idx) => {
                        const t = document.createElement('img');
                        t.className = 'detail-thumb' + (idx === 0 ? ' active' : '');
                        t.style.border = idx === 0 ? '3px solid var(--public-primary)' : '2px solid #ddd';
                        t.setAttribute('data-original-url', url);
                        // Extreme compression for thumbnails (60px, 30% quality)
                        compressImageUrl(url, 60, 0.3).then(c => { t.src = c; });
                        t.onclick = () => {
                            // Show compressed version in detail view
                            img.setAttribute('data-original-src', url);
                            compressImageUrl(url, 600, 0.7).then(c => { img.src = c; });
                            thumbs.querySelectorAll('.detail-thumb').forEach(el => { el.classList.remove('active'); el.style.border = '2px solid #ddd'; });
                            t.classList.add('active');
                            t.style.border = '3px solid var(--public-primary)';

                            // Check if this image belongs to a variant — update price accordingly
                            const matchedVariant = variants.find(v => v.image_url === url);
                            if (matchedVariant) {
                                selectVariant(matchedVariant);
                            } else {
                                // Base product image — reset to base price and specs
                                priceEl.textContent = self.formatCurrency(product.selling_price, currency);
                                nameEl.textContent = product.product_name;
                                addBtn.setAttribute('data-id', product.id);
                                addBtn.removeAttribute('data-variant-id');
                                addBtn.disabled = false;
                                addBtn.style.opacity = '1';
                                addBtn.onclick = (e) => { self.addToCart(product.id, e); };
                                // Deselect variant buttons
                                document.querySelectorAll('.variant-select-btn').forEach(btn => {
                                    btn.style.border = '2px solid #ddd';
                                    btn.style.background = 'white';
                                    btn.style.color = '#333';
                                });
                                const stockEl = document.getElementById('variantStockInfo');
                                if (stockEl) { stockEl.textContent = 'Select a variant'; stockEl.style.color = '#64748b'; }
                                // Reset specs to base product metadata
                                const specsBox = document.getElementById('variantSpecsBox');
                                if (specsBox) {
                                    specsBox.innerHTML = '';
                                    let baseMeta = product.metadata;
                                    if (typeof baseMeta === 'string') { try { baseMeta = JSON.parse(baseMeta); } catch(e) { baseMeta = null; } }
                                    if (baseMeta && typeof baseMeta === 'object') {
                                        const skip = ['product_images','product_image','variant_group','variant_size','variant_color','variant_label','has_variants','base_stock'];
                                        for (const [k, val] of Object.entries(baseMeta)) {
                                            if (val && !skip.includes(k)) {
                                                const lbl = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
                                                specsBox.innerHTML += '<div class="spec-chip"><i class="fas fa-check-circle"></i><span><strong>' + lbl + ':</strong> ' + val + '</span></div>';
                                            }
                                        }
                                    }
                                }
                            }
                        };
                        thumbs.appendChild(t);
                    });
                    thumbs.style.display = 'flex';
                } else if (variants.some(v => v.image_url)) {
                    variants.filter(v => v.image_url).forEach((v, idx) => {
                        const t = document.createElement('img');
                        t.className = 'detail-thumb' + (idx === 0 ? ' active' : '');
                        t.dataset.variantId = v.id;
                        t.setAttribute('data-original-url', v.image_url);
                        t.style.border = idx === 0 ? '3px solid var(--public-primary)' : '2px solid #ddd';
                        // Extreme compression for thumbnails
                        compressImageUrl(v.image_url, 60, 0.3).then(c => { t.src = c; });
                        t.onclick = () => {
                            selectVariant(v);
                            thumbs.querySelectorAll('.detail-thumb').forEach(el => { el.classList.remove('active'); el.style.border = '2px solid #ddd'; });
                            t.classList.add('active');
                            t.style.border = '3px solid var(--public-primary)';
                        };
                        thumbs.appendChild(t);
                    });
                    thumbs.style.display = 'flex';
                }
            }

            // Build variant selector buttons
            const selectorDiv = document.createElement('div');
            selectorDiv.style.cssText = 'margin-bottom:15px;padding:12px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;';

            let html = '<div style="font-weight:700;font-size:0.8rem;margin-bottom:8px;color:#334155;"><i class="fas fa-palette"></i> Select Option:</div>';
            html += '<div style="display:flex;flex-direction:column;gap:6px;" id="variantButtons">';

            // Add base product as first option
            html += '<button class="variant-select-btn" data-idx="base" style="padding:8px 12px;border:2px solid var(--public-primary);background:var(--public-primary);color:white;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;width:100%;">';
            if (product.product_image) html += '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'%3E%3Crect fill=\'%23ddd\' width=\'24\' height=\'24\' rx=\'4\'/%3E%3C/svg%3E" data-compress-src="' + self.getAssetUrl(product.product_image) + '" data-compress-width="48" data-compress-quality="0.4" style="width:24px;height:24px;border-radius:4px;object-fit:cover;flex-shrink:0;">';
            html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + product.product_name + '</span>';
            html += '<span style="font-size:0.75rem;opacity:0.85;flex-shrink:0;">' + self.formatCurrency(product.selling_price, currency) + '</span>';
            html += '</button>';

            variants.forEach((v, idx) => {
                html += '<button class="variant-select-btn" data-idx="' + idx + '" style="padding:8px 12px;border:2px solid #e2e8f0;background:white;color:#333;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;width:100%;">';
                if (v.image_url) html += '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'%3E%3Crect fill=\'%23ddd\' width=\'24\' height=\'24\' rx=\'4\'/%3E%3C/svg%3E" data-compress-src="' + v.image_url + '" data-compress-width="48" data-compress-quality="0.4" style="width:24px;height:24px;border-radius:4px;object-fit:cover;flex-shrink:0;">';
                html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + v.variant_name + '</span>';
                html += '<span style="font-size:0.75rem;color:#64748b;flex-shrink:0;">' + self.formatCurrency(v.price || product.selling_price, currency) + '</span>';
                html += '</button>';
            });

            html += '</div>';
            html += '<div id="variantStockInfo" style="display:none;"></div>';

            selectorDiv.innerHTML = html;
            specsContainer.appendChild(selectorDiv);

            // Apply compressed images for variant selector buttons
            applyCompressedImages();

            // Variant selection handler
            function selectVariant(v) {
                // Update image — compressed for detail, store original for lightbox
                if (v.image_url) {
                    img.setAttribute('data-original-src', v.image_url);
                    compressImageUrl(v.image_url, 600, 0.7).then(c => { img.src = c; });
                }
                // Update price (use base price if variant price is 0)
                priceEl.textContent = self.formatCurrency(v.price || product.selling_price, currency);
                // Update name to show variant
                nameEl.textContent = product.product_name + ' — ' + v.variant_name;
                // Update stock info
                const stockEl = document.getElementById('variantStockInfo');
                if (stockEl) {
                    if (v.stock > 0) {
                        stockEl.textContent = v.stock + ' in stock';
                        stockEl.style.color = '#16a34a';
                    } else {
                        stockEl.textContent = 'Out of stock';
                        stockEl.style.color = '#dc2626';
                    }
                }
                // Update add to cart — pass variant info
                addBtn.disabled = v.stock <= 0;
                addBtn.style.opacity = v.stock <= 0 ? '0.5' : '1';
                addBtn.setAttribute('data-id', product.id);
                addBtn.setAttribute('data-variant-id', v.id);
                addBtn.setAttribute('data-variant-name', v.variant_name);
                addBtn.setAttribute('data-variant-price', v.price);
                addBtn.onclick = (e) => {
                    if (v.stock <= 0) { return; }
                    self.addToCartWithVariant(product, v, e);
                };

                // Update specs to show variant attributes (in same order as base product)
                const specsBox = document.getElementById('variantSpecsBox');
                if (specsBox) {
                    specsBox.innerHTML = '';
                    let attrs = v.attributes;
                    if (typeof attrs === 'string') { try { attrs = JSON.parse(attrs); } catch(e) { attrs = null; } }

                    const skip = ['name', 'product_images', 'product_image', 'variant_group', 'variant_size', 'variant_color', 'variant_label', 'has_variants', 'base_stock'];

                    // Use base product metadata as reference and fallback
                    let baseMeta = product.metadata;
                    if (typeof baseMeta === 'string') { try { baseMeta = JSON.parse(baseMeta); } catch(e) { baseMeta = {}; } }
                    baseMeta = baseMeta || {};

                    const orderedKeys = Object.keys(baseMeta).filter(k => !skip.includes(k));
                    // Add any extra keys from variant
                    if (attrs) {
                        Object.keys(attrs).forEach(k => { if (!orderedKeys.includes(k) && !skip.includes(k)) orderedKeys.push(k); });
                    }

                    orderedKeys.forEach(k => {
                        // Use variant value if available, otherwise fall back to base product value
                        const val = (attrs && attrs[k]) || baseMeta[k] || '';
                        if (val) {
                            const lbl = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
                            specsBox.innerHTML += '<div class="spec-chip"><i class="fas fa-check-circle"></i><span><strong>' + lbl + ':</strong> ' + val + '</span></div>';
                        }
                    });
                }

                // Highlight active button
                document.querySelectorAll('.variant-select-btn').forEach(btn => {
                    btn.style.border = '2px solid #ddd';
                    btn.style.background = 'white';
                    btn.style.color = '#333';
                });
                const activeBtn = document.querySelector('.variant-select-btn[data-idx="' + variants.indexOf(v) + '"]');
                if (activeBtn) {
                    activeBtn.style.border = '2px solid var(--public-primary)';
                    activeBtn.style.background = 'var(--public-primary)';
                    activeBtn.style.color = 'white';
                }

                // Highlight matching thumbnail
                if (thumbs && v.image_url) {
                    thumbs.querySelectorAll('.detail-thumb').forEach(t => {
                        const match = t.src === v.image_url;
                        t.classList.toggle('active', match);
                        t.style.border = match ? '3px solid var(--public-primary)' : '2px solid #ddd';
                    });
                }
            }

            // Add click handlers to variant buttons
            selectorDiv.querySelectorAll('.variant-select-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = btn.dataset.idx;
                    if (idx === 'base') {
                        // Reset to base product
                        const baseUrl = self.getAssetUrl(product.product_image || 'assets/default-product.png');
                        img.setAttribute('data-original-src', baseUrl);
                        compressImageUrl(baseUrl, 600, 0.7).then(c => { img.src = c; });
                        priceEl.textContent = self.formatCurrency(product.selling_price, currency);
                        nameEl.textContent = product.product_name;
                        addBtn.setAttribute('data-id', product.id);
                        addBtn.removeAttribute('data-variant-id');
                        addBtn.disabled = false;
                        addBtn.style.opacity = '1';
                        addBtn.onclick = (e) => { self.addToCart(product.id, e); };
                        // Show base stock from metadata or product stock
                        let baseMeta = product.metadata;
                        if (typeof baseMeta === 'string') { try { baseMeta = JSON.parse(baseMeta); } catch(e) { baseMeta = {}; } }
                        const baseStock = baseMeta?.base_stock || product.stock;
                        const stockEl = document.getElementById('variantStockInfo');
                        if (stockEl) { stockEl.textContent = baseStock + ' in stock'; stockEl.style.color = '#16a34a'; }
                        // Reset specs to base
                        const specsBox = document.getElementById('variantSpecsBox');
                        if (specsBox) {
                            specsBox.innerHTML = '';
                            let baseMeta = product.metadata;
                            if (typeof baseMeta === 'string') { try { baseMeta = JSON.parse(baseMeta); } catch(e) { baseMeta = null; } }
                            if (baseMeta && typeof baseMeta === 'object') {
                                const skip = ['product_images','product_image','variant_group','variant_size','variant_color','variant_label','has_variants','base_stock'];
                                for (const [k, val] of Object.entries(baseMeta)) {
                                    if (val && !skip.includes(k)) {
                                        const lbl = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
                                        specsBox.innerHTML += '<div class="spec-chip"><i class="fas fa-check-circle"></i><span><strong>' + lbl + ':</strong> ' + val + '</span></div>';
                                    }
                                }
                            }
                        }
                        // Highlight base button
                        document.querySelectorAll('.variant-select-btn').forEach(b => { b.style.border = '2px solid #ddd'; b.style.background = 'white'; b.style.color = '#333'; });
                        btn.style.border = '2px solid var(--public-primary)';
                        btn.style.background = 'var(--public-primary)';
                        btn.style.color = 'white';
                    } else {
                        selectVariant(variants[parseInt(idx)]);
                    }
                });
            });

            // Don't auto-select — let customer choose. Show base product price initially.

        } else {
            // No variants — show regular product thumbnails
            if (thumbs) {
                let imageList = product.product_images || [];
                if (typeof imageList === 'string') { try { imageList = JSON.parse(imageList); } catch(e) { imageList = []; } }
                if (imageList.length > 1) {
                    imageList.forEach((url, idx) => {
                        const t = document.createElement('img');
                        t.className = 'detail-thumb' + (idx === 0 ? ' active' : '');
                        t.setAttribute('data-original-url', url);
                        // Extreme compression for thumbnails
                        compressImageUrl(url, 60, 0.3).then(c => { t.src = c; });
                        t.onclick = () => {
                            img.setAttribute('data-original-src', url);
                            compressImageUrl(url, 600, 0.7).then(c => { img.src = c; });
                            thumbs.querySelectorAll('.detail-thumb').forEach(el => el.classList.remove('active'));
                            t.classList.add('active');
                        };
                        thumbs.appendChild(t);
                    });
                    thumbs.style.display = 'flex';
                }
            }
        }

        // Show specs from metadata (wrapped in updatable container)
        let meta = product.metadata;
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = null; } }

        const specsBox = document.createElement('div');
        specsBox.id = 'variantSpecsBox';
        specsBox.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;';
        if (meta && typeof meta === 'object') {
            const skip = ['product_images','product_image','variant_group','variant_size','variant_color','variant_label','has_variants','base_stock'];
            for (const [k, v] of Object.entries(meta)) {
                if (v && !skip.includes(k)) {
                    const lbl = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
                    specsBox.innerHTML += '<div class="spec-chip"><i class="fas fa-check-circle"></i><span><strong>' + lbl + ':</strong> ' + v + '</span></div>';
                }
            }
        }
        specsContainer.appendChild(specsBox);

        // Show modal
        modal.style.display = 'flex';
        requestAnimationFrame(() => { modal.classList.add('active'); });
        document.body.style.overflow = 'hidden';
    }

    addToCartWithVariant(product, variant, event) {
        const cartId = product.id + '_' + variant.id;
        const existing = this.cart.find(item => item.id === cartId);

        if (existing) {
            if (existing.quantity >= variant.stock) {
                showNotification('Maximum stock reached for this variant', 'warning');
                return;
            }
            existing.quantity++;
        } else {
            this.cart.push({
                id: cartId,
                name: product.product_name + ' (' + variant.variant_name + ')',
                price: variant.price || product.selling_price,
                image: variant.image_url || product.product_image,
                quantity: 1
            });
        }

        this.saveCartToStorage();
        this.updateCartUI();

        // Animation (same as addToCart)
        if (event) {
            const btn = event.currentTarget || event.target;
            const cartIcon = document.getElementById('cartToggle');
            const productImg = document.getElementById('detailImage');

            if (productImg && cartIcon) {
                const flyingImg = document.createElement('img');
                flyingImg.src = productImg.src;
                flyingImg.className = 'flying-img';
                const rect = productImg.getBoundingClientRect();
                flyingImg.style.top = rect.top + 'px';
                flyingImg.style.left = rect.left + 'px';
                flyingImg.style.width = rect.width + 'px';
                flyingImg.style.height = rect.height + 'px';
                document.body.appendChild(flyingImg);
                const cartRect = cartIcon.getBoundingClientRect();
                setTimeout(() => {
                    flyingImg.style.top = (cartRect.top + 10) + 'px';
                    flyingImg.style.left = (cartRect.left + 10) + 'px';
                    flyingImg.style.width = '20px';
                    flyingImg.style.height = '20px';
                    flyingImg.style.opacity = '0.5';
                }, 10);
                setTimeout(() => {
                    flyingImg.remove();
                    cartIcon.classList.add('cart-bounce');
                    setTimeout(() => cartIcon.classList.remove('cart-bounce'), 400);
                }, 1200);
            }

            if (btn) {
                const original = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> Added!';
                btn.classList.add('added');
                setTimeout(() => { btn.innerHTML = original; btn.classList.remove('added'); }, 1500);
            }
        }
    }
}


let app;
document.addEventListener('DOMContentLoaded', () => { app = new ShopProductsViewer(); window.app = app; });





function formatDescs() {
    document.querySelectorAll('#detailDesc, [class*="desc"]').forEach(el => {
        if (!el.classList.contains('formatted')) {
            el.style.whiteSpace = 'pre-line';
            el.style.lineHeight = '1.6';
            el.classList.add('formatted');
        }
    });
}

if (document.readyState === 'complete') formatDescs();
else document.addEventListener('DOMContentLoaded', formatDescs);

