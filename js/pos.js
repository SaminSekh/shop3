// POS System Manager - COMPLETELY FIXED VERSION
class POSManager {
    constructor() {
        this.currentUser = null;
        this.shopId = null;
        this.cart = [];
        this.products = [];
        this.cartTotal = 0;
        this.cartSubtotal = 0;
        this.discount = 0;
        this.posPage = 1;
        this.init();
    }

    async init() {
        // Check authentication
        this.currentUser = authManager.getCurrentUser();

        if (!this.currentUser) {
            window.location.href = 'index.html';
            return;
        }

        // Use shopId from authManager (Visitor Mode support)
        this.shopId = authManager.shopId || this.currentUser.shop_id;

        if (!this.shopId) {
            showNotification('No shop assigned', 'error');
            setTimeout(() => authManager.logout(), 2000);
            return;
        }

        // Update Shop Info (Wait for it so we have the logo)
        await this.updateShopName();

        // Update UI
        this.updateUI();

        // Setup event listeners
        this.setupEventListeners();

        // Load products
        await this.loadProducts();

        // Update time
        this.updateCurrentTime();

        // Load recent transactions
        await this.loadRecentTransactions();

        // Check for held sales
        this.checkHeldSales();
    }

    updateUI() {
        // Update user info
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');

        if (userNameEl) {
            userNameEl.textContent = this.currentUser.full_name || this.currentUser.username;
        }

        if (userRoleEl) {
            userRoleEl.textContent = this.currentUser.role === 'shop_admin' ? 'Shop Admin' : 'Shop Staff';
        }

        // Update currency symbols
        const discountCurrency = document.getElementById('discountCurrency');
        if (discountCurrency) {
            discountCurrency.textContent = getCurrencySymbol();
        }
    }

    async updateShopName() {
        try {
            const { data: shop, error } = await supabaseClient
                .from('shops')
                .select('shop_name, shop_logo')
                .eq('id', this.shopId)
                .single();

            if (!error && shop) {
                this.shopData = shop;
                this.shopLogo = shop.shop_logo || null;

                // Set shop logo as favicon
                if (shop.shop_logo) {
                    setFavicon(shop.shop_logo);
                }
            }

            // Fetch Currency
            const { data: settings } = await supabaseClient
                .from('shop_settings')
                .select('currency')
                .eq('shop_id', this.shopId)
                .maybeSingle();

            if (settings) {
                window.shopCurrency = settings.currency || 'INR';
            }
        } catch (error) {
            console.error('Error fetching shop info:', error);
        }
    }

    setupEventListeners() {
        // Hide out of stock checkbox
        const hideOutOfStockCb = document.getElementById('hideOutOfStock');
        if (hideOutOfStockCb) {
            hideOutOfStockCb.addEventListener('change', () => {
                this.posPage = 1;
                this.filterProductsCombined();
            });
        }

        // Product search
        const searchInput = document.getElementById('productSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterProducts(e.target.value);
            });
        }

        // Filter buttons
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.filterProductsBy(filter);
            });
        });

        // Category filter
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.handleCategoryChange(e.target.value);
            });
        }

        // Type filter
        const typeFilter = document.getElementById('typeFilter');
        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this.handleTypeChange(e.target.value);
            });
        }

        // Add to cart
        document.addEventListener('click', (e) => {
            if (e.target.closest('.add-to-cart-btn')) {
                const btn = e.target.closest('.add-to-cart-btn');
                const productId = btn.dataset.id;
                this.handleAddToCart(productId);
            }
            // Product detail view on card click (not on Add button)
            if (e.target.closest('.product-card') && !e.target.closest('.add-to-cart-btn')) {
                const card = e.target.closest('.product-card');
                const addBtn = card.querySelector('.add-to-cart-btn');
                if (addBtn) {
                    this.showProductDetail(addBtn.dataset.id);
                }
            }
        });

        // Remove from cart
        document.addEventListener('click', (e) => {
            if (e.target.closest('.remove-from-cart')) {
                const btn = e.target.closest('.remove-from-cart');
                const productId = btn.dataset.id;
                this.removeFromCart(productId);
            }
        });

        // Edit price in cart
        document.addEventListener('click', (e) => {
            if (e.target.closest('.edit-price-btn')) {
                const btn = e.target.closest('.edit-price-btn');
                const productId = btn.dataset.id;
                this.editCartItemPrice(productId);
            }
        });

        // Update quantity
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('cart-quantity')) {
                const productId = e.target.dataset.id;
                const quantity = parseInt(e.target.value) || 1;
                this.updateCartQuantity(productId, quantity);
            }
        });

        // Discount input
        const discountInput = document.getElementById('discountAmount');
        if (discountInput) {
            discountInput.addEventListener('input', (e) => {
                this.discount = parseFloat(e.target.value) || 0;
                this.updateCartTotals();
            });
        }

        // Payment method change
        document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.togglePaymentFields(e.target.value);
            });
        });

        // Amount received input
        const amountReceived = document.getElementById('amountReceived');
        if (amountReceived) {
            amountReceived.addEventListener('input', (e) => {
                const received = parseFloat(e.target.value) || 0;
                const change = received - this.cartTotal;
                const changeElement = document.getElementById('changeAmount');
                if (changeElement) {
                    changeElement.value = change > 0 ? change.toFixed(2) : '0.00';
                }
            });
        }

        // Amount paid for credit
        const amountPaid = document.getElementById('amountPaid');
        if (amountPaid) {
            amountPaid.addEventListener('input', (e) => {
                const paid = parseFloat(e.target.value) || 0;
                const pending = this.cartTotal - paid;
                const pendingElement = document.getElementById('pendingAmount');
                if (pendingElement) {
                    pendingElement.value = pending > 0 ? pending.toFixed(2) : '0.00';
                }
            });
        }

        // Checkout button
        const checkoutBtn = document.getElementById('checkoutBtn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => {
                this.processCheckout();
            });
        }

        // Clear cart button
        const clearCartBtn = document.getElementById('clearCartBtn');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => {
                this.clearCart();
            });
        }

        // Hold sale button
        const holdSaleBtn = document.getElementById('holdSaleBtn');
        if (holdSaleBtn) {
            holdSaleBtn.addEventListener('click', () => {
                this.holdSale();
            });
        }

        // Print invoice button
        const printInvoiceBtn = document.getElementById('printInvoiceBtn');
        if (printInvoiceBtn) {
            printInvoiceBtn.addEventListener('click', () => {
                this.printInvoice();
            });
        }

        // Refresh transactions
        const refreshTransactions = document.getElementById('refreshTransactions');
        if (refreshTransactions) {
            refreshTransactions.addEventListener('click', () => {
                this.loadRecentTransactions();
            });
        }

        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAllModals();
            });
        });

        // Load held sale button
        const loadHeldSaleBtn = document.getElementById('loadHeldSaleBtn');
        if (loadHeldSaleBtn) {
            loadHeldSaleBtn.addEventListener('click', () => {
                this.loadHeldSale();
            });
        }

        // Mobile cart toggle
        const mobileCartToggle = document.getElementById('mobileCartToggle');
        if (mobileCartToggle) {
            mobileCartToggle.addEventListener('click', () => {
                this.toggleMobileCart();
            });
        }

        // Mobile close button
        const closeCartBtn = document.getElementById('closeCartBtn');
        if (closeCartBtn) {
            closeCartBtn.addEventListener('click', () => {
                this.closeMobileCart();
            });
        }

        // Cart backdrop click (close cart)
        const cartBackdrop = document.getElementById('cartBackdrop');
        if (cartBackdrop) {
            cartBackdrop.addEventListener('click', () => {
                this.closeMobileCart();
            });
        }
    }

    checkHeldSales() {
        const heldSale = localStorage.getItem(`hold_sale_${this.shopId}`);
        if (heldSale) {
            showNotification('There is a held sale available', 'info');
        }
    }

    async loadProducts() {
        showLoading(true);

        try {
            // Load business type for this shop
            const { data: shopData } = await supabaseClient
                .from('shops')
                .select('business_type')
                .eq('id', this.shopId)
                .maybeSingle();

            this.businessType = shopData?.business_type || 'general';

            // Load type configurations from system_configs
            const { data: typeConfigsData } = await supabaseClient
                .from('system_configs')
                .select('key, value')
                .like('key', 'types_%');

            this.typeConfigs = {};
            if (typeConfigsData) {
                typeConfigsData.forEach(config => {
                    const category = config.key.replace('types_', '');
                    this.typeConfigs[category] = config.value.split(',').map(t => t.trim());
                });
            }

            const { data: products, error } = await supabaseClient
                .from('products')
                .select('*')
                .eq('shop_id', this.shopId)
                .order('product_name');

            if (error) throw error;

            this.products = products || [];

            // For ALL products, check if they have variants and add variant stocks to display
            if (this.products.length > 0) {
                const allProductIds = this.products.map(p => p.id);
                const { data: variantStocks } = await supabaseClient
                    .from('product_variants')
                    .select('product_id, stock')
                    .in('product_id', allProductIds)
                    .eq('is_active', true);

                if (variantStocks && variantStocks.length > 0) {
                    const variantTotals = {};
                    variantStocks.forEach(v => {
                        variantTotals[v.product_id] = (variantTotals[v.product_id] || 0) + (parseInt(v.stock) || 0);
                    });
                    // Store original base stock and add variant stocks for display
                    this.products.forEach(p => {
                        if (variantTotals[p.id]) {
                            p._baseStock = parseInt(p.stock) || 0;
                            p.stock = p._baseStock + variantTotals[p.id];
                        }
                    });
                }
            }

            this.renderProducts();

            // Load categories for filter
            this.loadCategories();

        } catch (error) {

            showNotification('Failed to load products', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderProducts() {
        const container = document.getElementById('productGrid');
        if (!container) return;

        // Apply hide out of stock filter
        const hideOutOfStockCb = document.getElementById('hideOutOfStock');
        const hideOutOfStock = hideOutOfStockCb ? hideOutOfStockCb.checked : false;
        const displayProducts = hideOutOfStock ? this.products.filter(p => (parseInt(p.stock) || 0) >= 1) : this.products;

        if (displayProducts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open fa-2x"></i>
                    <p>No products available</p>
                    <small>Add products from inventory</small>
                </div>
            `;

            const productCount = document.getElementById('productCount');
            if (productCount) {
                productCount.innerHTML = `
                    <span class="count-badge">0 Items</span>
                    <span class="stock-badge">Total Stock: 0</span>
                `;
            }
            this.renderPosPagination(0);
            return;
        }

        // Pagination
        const perPage = 20;
        this.posPage = this.posPage || 1;
        const totalItems = displayProducts.length;
        const totalPages = Math.ceil(totalItems / perPage);
        if (this.posPage > totalPages) this.posPage = totalPages;
        if (this.posPage < 1) this.posPage = 1;
        const start = (this.posPage - 1) * perPage;
        const pageProducts = displayProducts.slice(start, start + perPage);

        container.innerHTML = pageProducts.map(product => {
            const stock = parseInt(product.stock) || 0;
            const stockClass = stock < 1 ? 'out-of-stock' :
                stock < 10 ? 'low-stock' : 'in-stock';

            const price = parseFloat(product.selling_price) || 0;

            return `
                <div class="product-card ${stockClass}">
                    <div class="product-image-container">
                        <img src="${product.product_image || this.shopLogo || 'https://via.placeholder.com/300?text=No+Image'}" 
                             class="product-img-pos" 
                             alt="${product.product_name}">
                        ${stock < 1 ? '<div class="out-of-stock-overlay">Sold Out</div>' : ''}
                    </div>
                    <div class="product-info">
                        <div class="product-category-type">
                            ${product.category || 'General'} ${product.type ? `• ${product.type}` : ''}
                        </div>
                        <div class="product-name" title="${product.product_name || 'Unnamed Product'}">
                            ${product.product_name || 'Unnamed Product'}
                        </div>
                        <div class="product-sku">SKU: ${product.sku || 'N/A'}</div>
                        <div class="product-meta">
                            <span class="stock-status ${stockClass}">
                                <i class="fas ${stock < 1 ? 'fa-times-circle' : 'fa-check-circle'}"></i> 
                                ${stock < 1 ? 'Out of Stock' : `${stock} in stock`}
                            </span>
                        </div>
                        <div class="product-price-action">
                            <div class="product-price">${formatCurrency(price)}</div>
                            <button class="btn btn-sm btn-primary add-to-cart-btn" 
                                    data-id="${product.id}"
                                    ${stock < 1 ? 'disabled' : ''}>
                                <i class="fas fa-cart-plus"></i> Add
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const productCount = document.getElementById('productCount');
        if (productCount) {
            const totalStock = displayProducts.reduce((sum, p) => sum + (parseInt(p.stock) || 0), 0);
            productCount.innerHTML = `
                <span class="count-badge">${displayProducts.length} Items</span>
                <span class="stock-badge">Total Stock: ${totalStock}</span>
            `;
        }

        this.renderPosPagination(totalItems);
    }

    loadCategories() {
        const categories = new Set();
        this.products.forEach(product => {
            if (product.category) {
                categories.add(product.category);
            }
        });

        const categoryFilter = document.getElementById('categoryFilter');
        if (!categoryFilter) return;

        categoryFilter.innerHTML = '<option value="">All Categories</option>';

        const sortedCategories = Array.from(categories).sort();
        sortedCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    }

    loadTypes(category) {
        const typeFilter = document.getElementById('typeFilter');
        if (!typeFilter) return;

        if (!category) {
            typeFilter.style.display = 'none';
            typeFilter.innerHTML = '<option value="">All Types</option>';
            return;
        }

        // First try to get types from system_configs (set by Super Admin)
        const standardizedCategory = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        let configuredTypes = this.typeConfigs?.[category] || this.typeConfigs?.[standardizedCategory] || [];

        // If no configured types, also try the business type category
        if (configuredTypes.length === 0 && this.businessType && this.businessType !== 'general') {
            const bizTypeStd = this.businessType.charAt(0).toUpperCase() + this.businessType.slice(1).toLowerCase();
            configuredTypes = this.typeConfigs?.[this.businessType] || this.typeConfigs?.[bizTypeStd] || [];
        }

        // Also collect types from actual products as fallback
        const productTypes = new Set();
        this.products.forEach(product => {
            if (product.category === category && product.type) {
                productTypes.add(product.type);
            }
        });

        // Merge: configured types + any product types not already in the list
        const allTypes = new Set([...configuredTypes, ...productTypes]);

        if (allTypes.size === 0) {
            typeFilter.style.display = 'none';
            typeFilter.innerHTML = '<option value="">All Types</option>';
            return;
        }

        typeFilter.style.display = 'inline-block';
        typeFilter.innerHTML = '<option value="">All Types</option>';

        const sortedTypes = Array.from(allTypes).sort();
        sortedTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeFilter.appendChild(option);
        });
    }

    handleCategoryChange(category) {
        this.loadTypes(category);
        this.filterProductsCombined();
    }

    handleTypeChange(type) {
        this.filterProductsCombined();
    }

    filterProducts(searchTerm) {
        this.posPage = 1;
        if (!searchTerm.trim()) {
            this.renderProducts();
            return;
        }

        let filtered = this.products.filter(product =>
            (product.product_name && product.product_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        // Apply hide out of stock filter
        const hideOutOfStockCb = document.getElementById('hideOutOfStock');
        if (hideOutOfStockCb && hideOutOfStockCb.checked) {
            filtered = filtered.filter(p => (parseInt(p.stock) || 0) >= 1);
        }

        this.renderFilteredProducts(filtered);
    }

    filterProductsBy(filterType) {
        this.posPage = 1;
        let filtered = this.products;

        switch (filterType) {
            case 'low-stock':
                filtered = this.products.filter(p => p.stock < 10 && p.stock > 0);
                break;
            case 'out-of-stock':
                filtered = this.products.filter(p => p.stock < 1);
                break;
            default:
                filtered = this.products;
        }

        // Apply hide out of stock filter (except when explicitly viewing out-of-stock)
        if (filterType !== 'out-of-stock') {
            const hideOutOfStockCb = document.getElementById('hideOutOfStock');
            if (hideOutOfStockCb && hideOutOfStockCb.checked) {
                filtered = filtered.filter(p => (parseInt(p.stock) || 0) >= 1);
            }
        }

        this.renderFilteredProducts(filtered);
    }

    filterProductsByCategory(category) {
        this.handleCategoryChange(category);
    }

    filterProductsCombined() {
        this.posPage = 1;
        const categoryFilter = document.getElementById('categoryFilter');
        const typeFilter = document.getElementById('typeFilter');
        const searchInput = document.getElementById('productSearch');

        const selectedCategory = categoryFilter ? categoryFilter.value : '';
        const selectedType = typeFilter ? typeFilter.value : '';
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

        let filtered = this.products;

        if (selectedCategory) {
            filtered = filtered.filter(p => p.category === selectedCategory);
        }

        if (selectedType) {
            filtered = filtered.filter(p => p.type === selectedType);
        }

        if (searchTerm) {
            filtered = filtered.filter(p =>
                (p.product_name && p.product_name.toLowerCase().includes(searchTerm)) ||
                (p.sku && p.sku.toLowerCase().includes(searchTerm))
            );
        }

        // Apply hide out of stock filter
        const hideOutOfStockCb = document.getElementById('hideOutOfStock');
        if (hideOutOfStockCb && hideOutOfStockCb.checked) {
            filtered = filtered.filter(p => (parseInt(p.stock) || 0) >= 1);
        }

        this.renderFilteredProducts(filtered);
    }

    renderFilteredProducts(filteredProducts) {
        const container = document.getElementById('productGrid');
        if (!container) return;

        if (filteredProducts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search fa-2x"></i>
                    <p>No products found</p>
                    <small>Try a different search term</small>
                </div>
            `;

            const productCount = document.getElementById('productCount');
            if (productCount) {
                productCount.innerHTML = `
                    <span class="count-badge">0 Found</span>
                    <span class="stock-badge">Total Stock: 0</span>
                `;
            }
            this.renderPosPagination(0);
            return;
        }

        // Pagination
        const perPage = 20;
        this.posPage = this.posPage || 1;
        const totalItems = filteredProducts.length;
        const totalPages = Math.ceil(totalItems / perPage);
        if (this.posPage > totalPages) this.posPage = totalPages;
        if (this.posPage < 1) this.posPage = 1;
        const start = (this.posPage - 1) * perPage;
        const pageProducts = filteredProducts.slice(start, start + perPage);

        container.innerHTML = pageProducts.map(product => {
            const stock = parseInt(product.stock) || 0;
            const stockClass = stock < 1 ? 'out-of-stock' :
                stock < 10 ? 'low-stock' : 'in-stock';

            const price = parseFloat(product.selling_price) || 0;

            return `
                <div class="product-card ${stockClass}">
                    <div class="product-image-container">
                        <img src="${product.product_image || this.shopLogo || 'https://via.placeholder.com/300?text=No+Image'}" 
                             class="product-img-pos" 
                             alt="${product.product_name}">
                        ${stock < 1 ? '<div class="out-of-stock-overlay">Sold Out</div>' : ''}
                    </div>
                    <div class="product-info">
                        <div class="product-category-type">
                            ${product.category || 'General'} ${product.type ? `• ${product.type}` : ''}
                        </div>
                        <div class="product-name" title="${product.product_name || 'Unnamed Product'}">
                            ${product.product_name || 'Unnamed Product'}
                        </div>
                        <div class="product-sku">SKU: ${product.sku || 'N/A'}</div>
                        <div class="product-meta">
                            <span class="stock-status ${stockClass}">
                                <i class="fas ${stock < 1 ? 'fa-times-circle' : 'fa-check-circle'}"></i> 
                                ${stock < 1 ? 'Out of Stock' : `${stock} in stock`}
                            </span>
                        </div>
                        <div class="product-price-action">
                            <div class="product-price">${formatCurrency(price)}</div>
                            <button class="btn btn-sm btn-primary add-to-cart-btn" 
                                    data-id="${product.id}"
                                    ${stock < 1 ? 'disabled' : ''}>
                                <i class="fas fa-cart-plus"></i> Add
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const productCount = document.getElementById('productCount');
        if (productCount) {
            const totalStock = filteredProducts.reduce((sum, p) => sum + (parseInt(p.stock) || 0), 0);
            productCount.innerHTML = `
                <span class="count-badge">${filteredProducts.length} Found</span>
                <span class="stock-badge">Total Stock: ${totalStock}</span>
            `;
        }

        this.renderPosPagination(totalItems);
    }

    renderPosPagination(totalProducts) {
        let paginationEl = document.getElementById('posPagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'posPagination';
            const productGrid = document.getElementById('productGrid');
            if (productGrid) productGrid.after(paginationEl);
        }

        const perPage = 20;
        const totalPages = Math.ceil(totalProducts / perPage);
        const currentPage = this.posPage || 1;

        if (totalPages <= 1) {
            paginationEl.innerHTML = totalProducts > 0 ? `<div style="text-align:center;padding:10px;font-size:0.8rem;color:#64748b;">${totalProducts} product(s)</div>` : '';
            return;
        }

        paginationEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;">
                <span style="font-size:0.8rem;color:#64748b;">Showing ${(currentPage-1)*perPage+1}-${Math.min(currentPage*perPage, totalProducts)} of ${totalProducts}</span>
                <div style="display:flex;gap:4px;align-items:center;">
                    <button onclick="window.posManager.posPage=1;window.posManager.renderProducts();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
                    <button onclick="window.posManager.posPage--;window.posManager.renderProducts();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
                    <span style="padding:6px 12px;background:var(--primary);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${currentPage} / ${totalPages}</span>
                    <button onclick="window.posManager.posPage++;window.posManager.renderProducts();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
                    <button onclick="window.posManager.posPage=${totalPages};window.posManager.renderProducts();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
                </div>
            </div>
        `;
    }

    showPriceEditor(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        const stock = parseInt(product.stock) || 0;
        if (stock < 1) {
            showNotification('Product out of stock', 'warning');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3><i class="fas fa-tag"></i> Set Selling Price</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Product: <strong>${product.product_name || 'Unnamed Product'}</strong></label>
                    </div>
                    <div class="form-group">
                        <label>Original Price</label>
                        <input type="number" id="originalPrice" class="form-control" 
                               value="${parseFloat(product.selling_price).toFixed(2)}" 
                               readonly>
                    </div>
                    <div class="form-group">
                        <label for="customPrice">Selling Price *</label>
                        <input type="number" id="customPrice" class="form-control" 
                               value="${parseFloat(product.selling_price).toFixed(2)}" 
                               min="0" step="0.01" required>
                        <small class="form-text">Enter negotiated price</small>
                    </div>
                    <div class="form-row" style="margin-top: 15px;">
                        <div class="form-group">
                            <button class="btn btn-secondary btn-block close-price-modal">
                                Cancel
                            </button>
                        </div>
                        <div class="form-group">
                            <button class="btn btn-primary btn-block" id="addWithCustomPrice">
                                <i class="fas fa-cart-plus"></i> Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        setTimeout(() => {
            const customPriceInput = document.getElementById('customPrice');
            if (customPriceInput) {
                customPriceInput.focus();
                customPriceInput.select();
            }
        }, 100);

        modal.querySelector('#addWithCustomPrice').addEventListener('click', () => {
            const customPriceInput = document.getElementById('customPrice');
            const customPrice = parseFloat(customPriceInput.value);

            if (isNaN(customPrice) || customPrice < 0) {
                showNotification('Please enter a valid price', 'error');
                customPriceInput.focus();
                return;
            }

            this.addToCartWithCustomPrice(productId, customPrice);
            modal.remove();
        });

        modal.querySelector('.close-price-modal').addEventListener('click', () => {
            modal.remove();
        });

        modal.querySelector('#customPrice').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#addWithCustomPrice').click();
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async showProductDetail(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        // Load variants
        let variants = [];
        try {
            const { data } = await supabaseClient
                .from('product_variants')
                .select('*')
                .eq('product_id', productId)
                .eq('is_active', true);
            if (data) variants = data;
        } catch (e) {}

        // Parse metadata
        let meta = product.metadata;
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = null; } }

        // Build specs HTML
        let specsHtml = '';
        if (meta && typeof meta === 'object') {
            const skip = ['product_images','product_image','variant_group','variant_size','variant_color','variant_label','has_variants','base_stock'];
            const specs = Object.entries(meta).filter(([k, v]) => v && !skip.includes(k));
            if (specs.length > 0) {
                specsHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;">' +
                    specs.map(([k, v]) => `<span style="padding:4px 10px;background:#f1f5f9;border-radius:6px;font-size:0.75rem;color:#334155;"><strong>${k.replace(/_/g,' ')}:</strong> ${v}</span>`).join('') +
                    '</div>';
            }
        }

        // Build variants HTML
        let variantsHtml = '';
        if (variants.length > 0) {
            variantsHtml = `
                <div style="margin-top:12px;padding-top:12px;border-top:1px solid #f1f5f9;">
                    <div style="font-size:0.75rem;font-weight:700;color:#64748b;margin-bottom:8px;">VARIANTS (${variants.length})</div>
                    ${variants.map(v => `
                        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f8fafc;">
                            ${v.image_url ? `<img src="${v.image_url}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;cursor:pointer;" onclick="(function(e){var lb=document.createElement('div');lb.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';lb.innerHTML='<img src=&quot;'+e.target.src+'&quot; style=&quot;max-width:90%;max-height:90%;object-fit:contain;border-radius:12px;&quot;>';lb.onclick=function(){lb.remove();};document.body.appendChild(lb);})(event)">` : ''}
                            <span style="flex:1;font-size:0.8rem;font-weight:600;">${v.variant_name}</span>
                            <span style="font-size:0.8rem;font-weight:700;color:var(--primary);">${formatCurrency(v.price || product.selling_price)}</span>
                            <span style="font-size:0.7rem;color:#64748b;">Stock: ${v.stock}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Remove existing detail modal if any
        const existing = document.getElementById('posProductDetailModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'posProductDetailModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:450px;">
                <div class="modal-header">
                    <h3><i class="fas fa-box-open"></i> Product Details</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="display:flex;gap:16px;align-items:flex-start;">
                        <img src="${product.product_image || this.shopLogo || 'https://via.placeholder.com/100'}" style="width:90px;height:90px;border-radius:10px;object-fit:cover;border:1px solid #eee;cursor:pointer;" onclick="(function(e){var lb=document.createElement('div');lb.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';lb.innerHTML='<img src=&quot;'+e.target.src+'&quot; style=&quot;max-width:90%;max-height:90%;object-fit:contain;border-radius:12px;&quot;>';lb.onclick=function(){lb.remove();};document.body.appendChild(lb);})(event)">
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;font-weight:600;">${product.category || 'General'} ${product.type ? '• ' + product.type : ''}</div>
                            <h4 style="margin:4px 0;font-size:1.1rem;font-weight:700;color:#1e293b;">${product.product_name}</h4>
                            <div style="font-size:0.8rem;color:#64748b;">SKU: ${product.sku}</div>
                            <div style="margin-top:6px;display:flex;gap:12px;align-items:center;">
                                <span style="font-size:1.2rem;font-weight:800;color:var(--primary);">${formatCurrency(product.selling_price)}</span>
                                <span style="font-size:0.75rem;color:#94a3b8;">Cost: ${formatCurrency(product.cost_price)}</span>
                            </div>
                            <div style="margin-top:6px;font-size:0.75rem;">
                                <span style="color:${(product._baseStock || product.stock) > 0 ? '#16a34a' : '#dc2626'};font-weight:600;">
                                    <i class="fas fa-${(product._baseStock || product.stock) > 0 ? 'check-circle' : 'times-circle'}"></i>
                                    Base Stock: ${product._baseStock || product.stock}
                                </span>
                            </div>
                        </div>
                    </div>

                    ${product.description ? `<p style="margin-top:12px;font-size:0.85rem;color:#475569;line-height:1.5;">${product.description.split('--SPECIFICATIONS--')[0].split('--VARIANT_DATA--')[0].trim()}</p>` : ''}

                    ${specsHtml}
                    ${variantsHtml}
                </div>
                <div class="modal-footer" style="display:flex;gap:8px;">
                    <button class="btn btn-secondary btn-action close-modal" style="flex:1;">Close</button>
                    <button class="btn btn-primary btn-action" id="posDetailAddBtn" style="flex:2;">
                        <i class="fas fa-cart-plus"></i> Add to Cart
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => modal.remove()));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        // Add to cart from detail
        modal.querySelector('#posDetailAddBtn').addEventListener('click', () => {
            modal.remove();
            this.handleAddToCart(productId);
        });
    }

    async handleAddToCart(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        // Check if product has variants
        try {
            const { data: variants } = await supabaseClient
                .from('product_variants')
                .select('*')
                .eq('product_id', productId)
                .eq('is_active', true);

            if (variants && variants.length > 0) {
                // Show variant selector modal
                this.showVariantSelector(product, variants);
            } else {
                // No variants — add directly
                this.addToCartWithCustomPrice(productId, null);
            }
        } catch (e) {
            // If query fails, just add the base product
            this.addToCartWithCustomPrice(productId, null);
        }
    }

    showVariantSelector(product, variants) {
        const existing = document.getElementById('variantSelectorModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'variantSelectorModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;">
                <div class="modal-header">
                    <h3><i class="fas fa-layer-group"></i> Select Option</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #f1f5f9;">
                        <img src="${product.product_image || 'https://via.placeholder.com/50'}" style="width:50px;height:50px;border-radius:8px;object-fit:cover;">
                        <div>
                            <div style="font-weight:700;font-size:0.95rem;">${product.product_name}</div>
                            <div style="font-size:0.8rem;color:#64748b;">SKU: ${product.sku}</div>
                        </div>
                    </div>

                    <!-- Base product option -->
                    <div class="variant-option" data-type="base" style="display:flex;align-items:center;gap:12px;padding:12px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;margin-bottom:8px;transition:all 0.2s;">
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:0.85rem;">${product.product_name} (Base)</div>
                            <div style="font-size:0.75rem;color:#64748b;">Stock: ${product._baseStock || product.stock}</div>
                        </div>
                        <div style="font-weight:700;color:var(--primary);">${formatCurrency(product.selling_price)}</div>
                    </div>

                    <!-- Variant options -->
                    ${variants.map(v => `
                        <div class="variant-option" data-type="variant" data-variant-id="${v.id}" data-price="${v.price}" data-name="${v.variant_name}" data-stock="${v.stock}" style="display:flex;align-items:center;gap:12px;padding:12px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;margin-bottom:8px;transition:all 0.2s;">
                            ${v.image_url ? `<img src="${v.image_url}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;">` : ''}
                            <div style="flex:1;">
                                <div style="font-weight:600;font-size:0.85rem;">${v.variant_name}</div>
                                <div style="font-size:0.75rem;color:#64748b;">Stock: ${v.stock}</div>
                            </div>
                            <div style="font-weight:700;color:#d97706;">${formatCurrency(v.price || product.selling_price)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        // Option click handlers
        modal.querySelectorAll('.variant-option').forEach(opt => {
            opt.addEventListener('mouseenter', () => { opt.style.borderColor = 'var(--primary)'; opt.style.background = '#f0fdf4'; });
            opt.addEventListener('mouseleave', () => { opt.style.borderColor = '#e2e8f0'; opt.style.background = 'white'; });
            opt.addEventListener('click', () => {
                if (opt.dataset.type === 'base') {
                    this.addToCartWithCustomPrice(product.id, null);
                } else {
                    // Add variant to cart
                    const variantName = opt.dataset.name;
                    const variantPrice = parseFloat(opt.dataset.price) || parseFloat(product.selling_price);
                    const variantStock = parseInt(opt.dataset.stock) || 0;

                    if (variantStock < 1) {
                        showNotification('This variant is out of stock', 'warning');
                        return;
                    }

                    const cartId = product.id + '_v_' + opt.dataset.variantId;
                    const existingItem = this.cart.find(item => item.id === cartId);

                    if (existingItem) {
                        if (existingItem.quantity >= variantStock) {
                            showNotification('Maximum stock reached', 'warning');
                            return;
                        }
                        existingItem.quantity += 1;
                    } else {
                        this.cart.push({
                            id: cartId,
                            name: product.product_name + ' (' + variantName + ')',
                            sku: product.sku,
                            price: variantPrice,
                            original_price: variantPrice,
                            cost_price: parseFloat(product.cost_price) || 0,
                            quantity: 1,
                            stock: variantStock,
                            product_image: product.product_image || null,
                            price_changed: false
                        });
                    }

                    this.updateCartDisplay();
                    showNotification(`${product.product_name} (${variantName}) added to cart`, 'success');
                }
                modal.remove();
            });
        });
    }

    addToCartWithCustomPrice(productId, customPrice = null) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        const stock = parseInt(product.stock) || 0;
        if (stock < 1) {
            showNotification('Product out of stock', 'warning');
            return;
        }

        const price = customPrice !== null ? parseFloat(customPrice) : parseFloat(product.selling_price) || 0;
        const existingItem = this.cart.find(item => item.id === productId);

        if (existingItem) {
            if (existingItem.quantity >= stock) {
                showNotification(`Only ${stock} units available in stock`, 'warning');
                return;
            }
            existingItem.quantity += 1;
            if (customPrice !== null && existingItem.price !== price) {
                existingItem.price = price;
                existingItem.price_changed = true;
            }
        } else {
            this.cart.push({
                id: product.id,
                name: product.product_name || 'Unnamed Product',
                sku: product.sku || 'N/A',
                price: price,
                original_price: parseFloat(product.selling_price) || 0,
                cost_price: parseFloat(product.cost_price) || 0, // Store cost price
                quantity: 1,
                stock: stock,
                product_image: product.product_image || null,
                price_changed: customPrice !== null
            });
        }

        this.updateCartDisplay();

        const productName = product.product_name || 'Product';
        const message = customPrice !== null && customPrice !== parseFloat(product.selling_price)
            ? `${productName} added at negotiated price ${formatCurrency(price)}`
            : `${productName} added to cart`;
        showNotification(message, 'success');
    }

    editCartItemPrice(productId) {
        const cartItem = this.cart.find(item => item.id === productId);
        if (!cartItem) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Edit Price</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Product: <strong>${cartItem.name}</strong></label>
                    </div>
                    <div class="form-group">
                        <label>Original Price</label>
                        <input type="number" class="form-control" 
                               value="${cartItem.original_price.toFixed(2)}" readonly>
                    </div>
                    <div class="form-group">
                        <label for="editPrice">Current Price</label>
                        <input type="number" id="editPrice" class="form-control" 
                               value="${cartItem.price.toFixed(2)}" 
                               min="0" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Total for ${cartItem.quantity} units</label>
                        <input type="number" id="editTotal" class="form-control" 
                               value="${(cartItem.price * cartItem.quantity).toFixed(2)}" 
                               readonly>
                    </div>
                    <div class="form-row" style="margin-top: 15px;">
                        <div class="form-group">
                            <button class="btn btn-secondary btn-block close-edit-modal">
                                Cancel
                            </button>
                        </div>
                        <div class="form-group">
                            <button class="btn btn-primary btn-block" id="savePrice">
                                <i class="fas fa-save"></i> Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const editPriceInput = modal.querySelector('#editPrice');
        const editTotalInput = modal.querySelector('#editTotal');

        editPriceInput.addEventListener('input', () => {
            const newPrice = parseFloat(editPriceInput.value) || 0;
            const total = newPrice * cartItem.quantity;
            editTotalInput.value = total.toFixed(2);
        });

        setTimeout(() => {
            editPriceInput.focus();
            editPriceInput.select();
        }, 100);

        modal.querySelector('#savePrice').addEventListener('click', () => {
            const newPrice = parseFloat(editPriceInput.value);

            if (isNaN(newPrice) || newPrice < 0) {
                showNotification('Please enter a valid price', 'error');
                editPriceInput.focus();
                return;
            }

            cartItem.price = newPrice;
            cartItem.price_changed = newPrice !== cartItem.original_price;
            this.updateCartDisplay();
            showNotification('Price updated successfully', 'success');
            modal.remove();
        });

        modal.querySelector('.close-edit-modal').addEventListener('click', () => {
            modal.remove();
        });

        editPriceInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#savePrice').click();
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    removeFromCart(productId) {
        const index = this.cart.findIndex(item => item.id === productId);
        if (index !== -1) {
            const itemName = this.cart[index].name;
            this.cart.splice(index, 1);
            this.updateCartDisplay();
            showNotification(`${itemName} removed from cart`, 'info');
        }
    }

    updateCartQuantity(productId, quantity) {
        const item = this.cart.find(item => item.id === productId);
        if (!item) return;

        if (quantity < 1) {
            this.removeFromCart(productId);
            return;
        }

        if (quantity > item.stock) {
            showNotification(`Only ${item.stock} units available`, 'warning');
            quantity = item.stock;
        }

        item.quantity = quantity;
        this.updateCartDisplay();
    }

    updateCartDisplay() {
        const container = document.getElementById('cartItems');
        if (!container) return;

        if (this.cart.length === 0) {
            container.innerHTML = `
                <div class="empty-cart">
                    <div class="empty-cart-icon">
                        <i class="fas fa-shopping-basket"></i>
                    </div>
                    <h5>Your cart is empty</h5>
                    <p>Select products from the list to start a sale</p>
                </div>
            `;
        } else {
            container.innerHTML = this.cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-header">
                        <img src="${item.product_image || 'https://via.placeholder.com/150?text=No+Image'}" 
                             class="product-img-cart" 
                             alt="${item.name}">
                        <div class="cart-item-info">
                            <div class="cart-item-name">
                                <strong>${item.name}</strong>
                                <small>SKU: ${item.sku}</small>
                                ${item.price_changed ?
                    `<span class="price-changed-badge">Negotiated</span>` :
                    ''}
                            </div>
                            <div class="cart-item-price">
                                <span class="price-text">${formatCurrency(item.price)} × </span>
                                <input type="number" 
                                       class="cart-quantity" 
                                       data-id="${item.id}"
                                       value="${item.quantity}" 
                                       min="1" 
                                       max="${item.stock}">
                            </div>
                            <div class="cart-item-actions">
                                <button class="btn btn-sm btn-light edit-price-btn" data-id="${item.id}" title="Edit Price">
                                    <i class="fas fa-tag"></i>
                                </button>
                                <button class="btn btn-sm btn-light text-danger remove-from-cart" data-id="${item.id}" title="Remove">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        this.updateCartTotals();
    }

    updateCartTotals() {
        this.cartSubtotal = this.cart.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);

        this.cartTotal = this.cartSubtotal - this.discount;
        if (this.cartTotal < 0) this.cartTotal = 0;

        const subtotalElement = document.getElementById('cartSubtotal');
        const totalElement = document.getElementById('cartTotal');

        if (subtotalElement) {
            subtotalElement.textContent = formatCurrency(this.cartSubtotal);
        }

        if (totalElement) {
            totalElement.textContent = formatCurrency(this.cartTotal);
        }

        const pendingAmount = document.getElementById('pendingAmount');
        const amountPaid = document.getElementById('amountPaid');
        if (pendingAmount && amountPaid) {
            const paid = parseFloat(amountPaid.value) || 0;
            pendingAmount.value = (this.cartTotal - paid).toFixed(2);
        }

        // Update cart count badge
        this.updateCartCount();
    }

    updateCartCount() {
        const cartCountBadge = document.getElementById('cartCountBadge');
        if (!cartCountBadge) return;

        const itemCount = this.cart.length;

        if (itemCount > 0) {
            cartCountBadge.textContent = itemCount;
            cartCountBadge.classList.add('active');
        } else {
            cartCountBadge.textContent = '0';
            cartCountBadge.classList.remove('active');
        }
    }

    toggleMobileCart() {
        const cartSection = document.getElementById('cartSection');
        const cartBackdrop = document.getElementById('cartBackdrop');

        if (!cartSection || !cartBackdrop) return;

        const isActive = cartSection.classList.contains('active');

        if (isActive) {
            this.closeMobileCart();
        } else {
            this.openMobileCart();
        }
    }

    openMobileCart() {
        const cartSection = document.getElementById('cartSection');
        const cartBackdrop = document.getElementById('cartBackdrop');

        if (cartSection) {
            cartSection.classList.add('active');
        }

        if (cartBackdrop) {
            cartBackdrop.classList.add('active');
        }

        // Prevent body scroll when cart is open
        document.body.style.overflow = 'hidden';
    }

    closeMobileCart() {
        const cartSection = document.getElementById('cartSection');
        const cartBackdrop = document.getElementById('cartBackdrop');

        if (cartSection) {
            cartSection.classList.remove('active');
        }

        if (cartBackdrop) {
            cartBackdrop.classList.remove('active');
        }

        // Restore body scroll
        document.body.style.overflow = '';
    }

    togglePaymentFields(paymentMethod) {
        const creditInfo = document.getElementById('creditInfo');
        const cashPayment = document.getElementById('cashPayment');

        if (!creditInfo || !cashPayment) return;

        // Update active card class
        document.querySelectorAll('.payment-card').forEach(card => {
            if (card.dataset.method === paymentMethod) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        if (paymentMethod === 'credit') {
            creditInfo.style.display = 'block';
            cashPayment.style.display = 'none';
        } else {
            creditInfo.style.display = 'none';
            cashPayment.style.display = 'block';
        }
    }

    async processCheckout() {
        if (this.cart.length === 0) {
            showNotification('Cart is empty', 'warning');
            return;
        }

        const paymentMethodElement = document.querySelector('input[name="paymentMethod"]:checked');
        if (!paymentMethodElement) {
            showNotification('Please select payment method', 'error');
            return;
        }
        const paymentMethod = paymentMethodElement.value;

        if (paymentMethod === 'credit') {
            const buyerName = document.getElementById('buyerName');
            const buyerPhone = document.getElementById('buyerPhone');
            const amountPaid = document.getElementById('amountPaid');

            if (!buyerName || !buyerPhone) {
                showNotification('Please enter buyer information for credit sale', 'error');
                return;
            }

            const name = buyerName.value.trim();
            const phone = buyerPhone.value.trim();
            const paid = parseFloat(amountPaid?.value || 0) || 0;

            if (!name || !phone) {
                showNotification('Buyer name and phone are required for credit sales', 'error');
                return;
            }

            if (paid > this.cartTotal) {
                showNotification('Amount paid cannot exceed total amount', 'error');
                return;
            }
        } else if (paymentMethod === 'cash') {
            const amountReceived = document.getElementById('amountReceived');
            if (amountReceived) {
                const received = parseFloat(amountReceived.value) || 0;
                if (received < this.cartTotal) {
                    showNotification('Insufficient amount received', 'error');
                    return;
                }
            }
        }

        showLoading(true);

        try {
            // Validate stock availability BEFORE creating the sale
            for (const item of this.cart) {
                const isVariant = item.id.includes('_v_');

                if (isVariant) {
                    const variantId = item.id.split('_v_')[1];
                    const { data: variant } = await supabaseClient
                        .from('product_variants')
                        .select('stock, variant_name')
                        .eq('id', variantId)
                        .single();

                    if (!variant) {
                        throw new Error(`Variant "${item.name}" not found`);
                    }
                    if ((parseInt(variant.stock) || 0) < item.quantity) {
                        throw new Error(`Insufficient stock for "${item.name}". Available: ${variant.stock}, Requested: ${item.quantity}`);
                    }
                } else {
                    const { data: product, error: fetchError } = await supabaseClient
                        .from('products')
                        .select('stock, product_name')
                        .eq('id', item.id)
                        .eq('shop_id', this.shopId)
                        .single();

                    if (fetchError || !product) {
                        throw new Error(`Product "${item.name}" not found or unavailable`);
                    }
                    if ((parseInt(product.stock) || 0) < item.quantity) {
                        throw new Error(`Insufficient stock for "${product.product_name}". Available: ${product.stock}, Requested: ${item.quantity}`);
                    }
                }
            }

            const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const total = this.cartTotal;

            const currentUser = authManager.getCurrentUser();
            if (!currentUser) {
                throw new Error('User not authenticated');
            }

            // Get user identifier - FIXED: Use username/email instead of UUID
            let soldByValue = currentUser.username || currentUser.email || 'pos_user';

            const saleData = {
                shop_id: this.shopId,
                invoice_number: invoiceNumber,
                total_amount: total,
                discount_amount: this.discount,
                payment_method: paymentMethod,
                sold_by: soldByValue,
                amount_paid: total,
                pending_amount: 0,
                sale_status: 'completed'
            };

            // Add optional customer details (available for all payment types)
            const customerName = document.getElementById('customerName')?.value.trim() || '';
            const customerPhone = document.getElementById('customerPhone')?.value.trim() || '';
            const saleRemark = document.getElementById('saleRemark')?.value.trim() || '';

            if (customerName) saleData.buyer_name = customerName;
            if (customerPhone) saleData.buyer_phone = customerPhone;
            if (saleRemark) saleData.buyer_address = saleRemark; // Store remark in buyer_address field

            if (paymentMethod === 'credit') {
                const buyerName = document.getElementById('buyerName');
                const buyerPhone = document.getElementById('buyerPhone');
                const buyerAddress = document.getElementById('buyerAddress');
                const amountPaid = document.getElementById('amountPaid');

                saleData.buyer_name = buyerName ? buyerName.value.trim() : '';
                saleData.buyer_phone = buyerPhone ? buyerPhone.value.trim() : '';
                saleData.buyer_address = buyerAddress ? buyerAddress.value.trim() : '';

                const paid = parseFloat(amountPaid?.value || 0) || 0;
                saleData.amount_paid = paid;
                saleData.pending_amount = total - paid;
                saleData.sale_status = 'credit';

                if (!saleData.buyer_name || !saleData.buyer_phone) {
                    throw new Error('Buyer name and phone are required for credit sales');
                }
            }



            // Create sale record
            const { data: sale, error: saleError } = await supabaseClient
                .from('sales')
                .insert([saleData])
                .select()
                .single();

            if (saleError) {


                // If error is about sold_by, try alternative approach
                if (saleError.message.includes('sold_by')) {
                    // Try with a simpler sold_by value
                    saleData.sold_by = 'system';

                    const { data: sale2, error: saleError2 } = await supabaseClient
                        .from('sales')
                        .insert([saleData])
                        .select()
                        .single();

                    if (saleError2) throw saleError2;
                    return await this.completeSaleProcess(sale2.id, paymentMethod, total, saleData);
                }

                throw saleError;
            }

            await this.completeSaleProcess(sale.id, paymentMethod, total, saleData);

        } catch (error) {


            let errorMessage = 'Failed to process sale';
            if (error.message) {
                errorMessage += ': ' + error.message;
            }

            showNotification(errorMessage, 'error');
        } finally {
            showLoading(false);
        }
    }

    async completeSaleProcess(saleId, paymentMethod, total, saleData) {
        try {
            // Insert sale items
            const saleItems = this.cart.map(item => {
                // For variants, extract the real product_id (before '_v_')
                const isVariant = item.id.includes('_v_');
                const productId = isVariant ? item.id.split('_v_')[0] : item.id;

                return {
                    sale_id: saleId,
                    product_id: productId,
                    product_name: item.name,
                    sku: item.sku,
                    product_image: item.product_image,
                    quantity: item.quantity,
                    unit_price: item.price,
                    original_price: item.original_price,
                    cost_price: item.cost_price,
                    total_price: item.price * item.quantity,
                    price_changed: item.price_changed || false
                };
            });



            const { error: itemsError } = await supabaseClient
                .from('sale_items')
                .insert(saleItems);

            if (itemsError) throw itemsError;



            // Update product stock
            await this.updateProductStocks();

            // Create credit record if needed
            if (paymentMethod === 'credit' && saleData.pending_amount > 0) {
                const creditData = {
                    shop_id: this.shopId,
                    buyer_name: saleData.buyer_name,
                    buyer_phone: saleData.buyer_phone,
                    buyer_address: saleData.buyer_address || '',
                    total_amount: total,
                    amount_paid: saleData.amount_paid,
                    pending_amount: saleData.pending_amount,
                    credit_date: new Date().toISOString().split('T')[0],
                    status: 'pending',
                    sale_id: saleId
                };



                const { error: creditError } = await supabaseClient
                    .from('credits')
                    .insert([creditData]);

                if (creditError) {

                }
            }

            showNotification('Sale completed successfully!', 'success');

            // Save cart items for invoice before clearing
            const invoiceItems = [...this.cart];

            // Clear cart
            this.clearCart();

            // Reset form
            this.resetPaymentForm();

            // Reload recent transactions
            await this.loadRecentTransactions();

            // Reload products to show updated stock
            await this.loadProducts();

            // Get sale details for invoice
            const { data: sale } = await supabaseClient
                .from('sales')
                .select('*')
                .eq('id', saleId)
                .single();

            // Show invoice modal
            this.showInvoice(sale, invoiceItems);

            // Audit Log
            if (window.authManager) {
                await window.authManager.createAuditLog('sell', 'sales', saleId, null, {
                    invoice_number: sale.invoice_number,
                    total_amount: total,
                    payment_method: paymentMethod,
                    items_count: saleItems.length
                });
            }

        } catch (error) {

            throw error;
        }
    }

    async updateProductStocks() {

        for (const item of this.cart) {
            try {
                // Check if this is a variant item (id contains '_v_')
                const isVariant = item.id.includes('_v_');

                if (isVariant) {
                    // Extract variant ID and update variant stock
                    const variantId = item.id.split('_v_')[1];
                    const productId = item.id.split('_v_')[0];

                    const { data: variant, error: fetchError } = await supabaseClient
                        .from('product_variants')
                        .select('stock, variant_name')
                        .eq('id', variantId)
                        .single();

                    if (fetchError || !variant) {
                        throw new Error(`Variant "${item.name}" not found`);
                    }

                    const currentStock = parseInt(variant.stock) || 0;
                    if (currentStock < item.quantity) {
                        throw new Error(`Insufficient stock for ${variant.variant_name}. Available: ${currentStock}, Requested: ${item.quantity}`);
                    }

                    // Update variant stock only — parent stock is just a display total
                    await supabaseClient
                        .from('product_variants')
                        .update({ stock: currentStock - item.quantity })
                        .eq('id', variantId);

                } else {
                    // Regular product — original logic
                    const { data: product, error: fetchError } = await supabaseClient
                        .from('products')
                        .select('stock, product_name')
                        .eq('id', item.id)
                        .eq('shop_id', this.shopId)
                        .single();

                    if (fetchError || !product) {
                        throw new Error(`Product "${item.name}" not found or unavailable`);
                    }

                    const currentStock = parseInt(product.stock) || 0;
                    if (currentStock < item.quantity) {
                        throw new Error(`Insufficient stock for ${product.product_name}. Available: ${currentStock}, Requested: ${item.quantity}`);
                    }

                    const newStock = currentStock - item.quantity;
                    const { error: updateError } = await supabaseClient
                        .from('products')
                        .update({ stock: newStock, updated_at: new Date().toISOString() })
                        .eq('id', item.id)
                        .eq('shop_id', this.shopId);

                    if (updateError) throw updateError;

                    const localProduct = this.products.find(p => p.id === item.id);
                    if (localProduct) localProduct.stock = newStock;
                }

            } catch (error) {
                throw error;
            }
        }
    }

    clearCart() {
        this.cart = [];
        this.discount = 0;
        this.updateCartDisplay();

        const discountInput = document.getElementById('discountAmount');
        if (discountInput) {
            discountInput.value = '';
        }

        showNotification('Cart cleared', 'info');
    }

    holdSale() {
        if (this.cart.length === 0) {
            showNotification('Cart is empty', 'warning');
            return;
        }

        const holdData = {
            cart: this.cart,
            discount: this.discount,
            timestamp: new Date().toISOString()
        };

        localStorage.setItem(`hold_sale_${this.shopId}`, JSON.stringify(holdData));

        showNotification('Sale held successfully', 'success');
    }

    loadHeldSale() {
        const heldData = localStorage.getItem(`hold_sale_${this.shopId}`);
        if (!heldData) {
            showNotification('No held sale found', 'warning');
            return;
        }

        try {
            const holdData = JSON.parse(heldData);
            this.cart = holdData.cart || [];
            this.discount = holdData.discount || 0;
            this.updateCartDisplay();

            const discountInput = document.getElementById('discountAmount');
            if (discountInput) {
                discountInput.value = this.discount;
            }

            showNotification('Held sale loaded successfully', 'success');
        } catch (error) {

            showNotification('Failed to load held sale', 'error');
        }
    }

    resetPaymentForm() {
        const buyerName = document.getElementById('buyerName');
        const buyerPhone = document.getElementById('buyerPhone');
        const buyerAddress = document.getElementById('buyerAddress');
        const amountPaid = document.getElementById('amountPaid');
        const pendingAmount = document.getElementById('pendingAmount');

        if (buyerName) buyerName.value = '';
        if (buyerPhone) buyerPhone.value = '';
        if (buyerAddress) buyerAddress.value = '';
        if (amountPaid) amountPaid.value = '';
        if (pendingAmount) pendingAmount.value = '';

        const amountReceived = document.getElementById('amountReceived');
        const changeAmount = document.getElementById('changeAmount');

        if (amountReceived) amountReceived.value = '';
        if (changeAmount) changeAmount.value = '';

        const cashRadio = document.querySelector('input[value="cash"]');
        if (cashRadio) {
            cashRadio.checked = true;
            this.togglePaymentFields('cash');
        }
    }

    async loadRecentTransactions() {
        try {
            const { data: transactions, error } = await supabaseClient
                .from('sales')
                .select(`
                    id,
                    invoice_number,
                    total_amount,
                    payment_method,
                    sale_status,
                    created_at
                `)
                .eq('shop_id', this.shopId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            this.renderRecentTransactions(transactions || []);

        } catch (error) {

        }
    }

    renderRecentTransactions(transactions) {
        const container = document.getElementById('transactionsList');
        if (!container) return;

        if (transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-receipt fa-2x"></i>
                    <p>No recent transactions</p>
                </div>
            `;
            return;
        }

        container.innerHTML = transactions.map(transaction => `
            <div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-header">
                        <span class="invoice-number">${transaction.invoice_number}</span>
                        <span class="transaction-amount">${formatCurrency(transaction.total_amount)}</span>
                    </div>
                    <div class="transaction-details">
                        <span class="payment-method ${transaction.payment_method}">
                            ${transaction.payment_method.toUpperCase()}
                        </span>
                        <span class="transaction-time">
                            ${formatDate(transaction.created_at)}
                        </span>
                    </div>
                </div>
                <span class="transaction-status ${transaction.sale_status}">
                    ${transaction.sale_status}
                </span>
            </div>
        `).join('');
    }

    showInvoice(sale, cartItems) {
        const shopName = this.shopData?.shop_name || 'Shop';

        const itemsHtml = cartItems.map(item => `
            <tr>
                <td style="padding: 5px 0;">${item.name}<br><small style="color: #666;">${item.quantity} x ${formatCurrency(item.price)}</small></td>
                <td style="text-align: right; vertical-align: top; padding: 5px 0;">${formatCurrency(item.price * item.quantity)}</td>
            </tr>
        `).join('');

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Invoice - ${sale.invoice_number}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap');
                    body { font-family: 'Courier Prime', monospace; width: 80mm; margin: 0 auto; padding: 10px; color: #000; font-size: 12px; }
                    .text-center { text-align: center; }
                    .header { margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                    .shop-name { font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; border-bottom: 1px dashed #000; }
                    .totals { margin-top: 10px; }
                    .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 5px; }
                    .footer { margin-top: 30px; font-size: 10px; border-top: 1px dashed #000; padding-top: 10px; }
                    @media print { body { width: 100%; } .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header text-center">
                    <div class="shop-name">${shopName}</div>
                    <div>INVOICE / RECEIPT</div>
                </div>

                <div class="info-section">
                    <div class="info-row"><span>Date:</span> <span>${new Date(sale.created_at || Date.now()).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})} ${new Date(sale.created_at || Date.now()).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}).toLowerCase()}</span></div>
                    <div class="info-row"><span>Invoice:</span> <span>${sale.invoice_number}</span></div>
                    <div class="info-row"><span>Payment:</span> <span style="text-transform: uppercase;">${sale.payment_method || 'CASH'}</span></div>
                    ${sale.buyer_name ? `<div class="info-row"><span>Customer:</span> <span>${sale.buyer_name}</span></div>` : ''}
                </div>

                <table>
                    <thead>
                        <tr style="border-bottom: 1px dashed #000;">
                            <th style="text-align: left; padding-bottom: 5px;">Item</th>
                            <th style="text-align: right; padding-bottom: 5px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="totals">
                    <div class="info-row"><span>Subtotal:</span> <span>${formatCurrency(parseFloat(sale.total_amount) + parseFloat(sale.discount_amount || 0))}</span></div>
                    <div class="info-row"><span>Discount:</span> <span>-${formatCurrency(sale.discount_amount || 0)}</span></div>
                    <div class="total-row"><span>TOTAL:</span> <span>${formatCurrency(sale.total_amount)}</span></div>
                    ${sale.pending_amount > 0 ? `<div class="info-row" style="color:red;margin-top:5px;"><span>Pending:</span> <span>${formatCurrency(sale.pending_amount)}</span></div>` : ''}
                </div>

                <div class="footer text-center">
                    <p>Thank you for shopping with us!</p>
                    <p>Invoice generated by ${shopName}</p>
                    ${sale.buyer_address && sale.payment_method !== 'credit' ? `<p style="font-style:italic;margin-top:5px;">Note: ${sale.buyer_address}</p>` : ''}
                    <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; background: #000; color: #fff; border: none; cursor: pointer; border-radius: 4px;">Print Now</button>
                    <button class="no-print" onclick="window.close()" style="margin-top: 10px; padding: 8px 15px; background: #666; color: #fff; border: none; cursor: pointer; border-radius: 4px; margin-left:10px;">Close</button>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    printInvoice() {
        if (this.cart.length === 0) {
            showNotification('Cart is empty', 'warning');
            return;
        }

        this.showInvoice({
            invoice_number: `DRAFT-${Date.now()}`,
            total_amount: this.cartTotal,
            discount_amount: this.discount,
            amount_paid: this.cartTotal,
            pending_amount: 0,
            payment_method: 'cash',
            created_at: new Date().toISOString()
        }, this.cart);
    }

    updateCurrentTime() {
        const update = () => {
            const now = new Date();
            const timeElement = document.getElementById('currentTime');
            const dateElement = document.getElementById('currentDate');

            if (timeElement) {
                timeElement.textContent = now.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
            }

            if (dateElement) {
                dateElement.textContent = now.toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
            }
        };

        update();
        setInterval(update, 1000);
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
}

// Initialize POS on pos.html page
if (window.location.pathname.includes('pos.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        window.posManager = new POSManager();
    });
}
