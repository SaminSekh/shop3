// Inventory Management - FIXED VERSION
class InventoryManager {
    constructor() {
        this.currentUser = null;
        this.shopId = null;
        this.products = [];
        this.categories = [];
        this.selectedProducts = new Set(); // Using Set for efficient selection tracking
        this.businessType = 'general';
        this.productImages = []; // Array of image objects { file: File|null, url: string|null }
        this.typeConfigs = {}; // Global type configurations
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

        // Update UI
        this.updateUI();

        // Load Shop Config (Currency, etc.)
        await initializeShopConfig(this.shopId);

        // Load low stock threshold from shop settings
        try {
            const { data: settings } = await supabaseClient
                .from('shop_settings')
                .select('low_stock_threshold')
                .eq('shop_id', this.shopId)
                .maybeSingle();
            this.lowStockThreshold = settings?.low_stock_threshold || 10;
        } catch (e) {
            this.lowStockThreshold = 10;
        }

        // Setup event listeners
        this.setupEventListeners();

        // Load type configurations
        await this.loadTypeConfigs();

        // Load Business Type
        await this.loadBusinessType();

        // Load inventory data
        await this.loadInventory();

        // Load categories - handle gracefully if table doesn't exist
        await this.loadCategories();
    }

    updateUI() {
        // Update user info
        document.getElementById('userName').textContent = this.currentUser.full_name || this.currentUser.username;
        document.getElementById('userRole').textContent = this.currentUser.role === 'shop_admin' ? 'Shop Admin' : 'Shop Staff';

    }

    setupEventListeners() {
        // Add product button
        const addProductBtn = document.getElementById('addProductBtn');
        if (addProductBtn) {
            addProductBtn.addEventListener('click', () => {
                this.showAddProductModal();
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportInventoryBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportInventory();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshInventory');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadInventory();
            });
        }

        // Search input
        const searchInput = document.getElementById('inventorySearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterProducts(e.target.value);
            });
        }

        // Stock filter
        const stockFilter = document.getElementById('stockFilter');
        if (stockFilter) {
            stockFilter.addEventListener('change', (e) => {
                this.filterByStock(e.target.value);
            });
        }

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
            typeFilter.addEventListener('change', () => {
                this.filterProductsCombined();
            });
        }

        // Save product button
        const saveProductBtn = document.getElementById('saveProductBtn');
        if (saveProductBtn) {
            saveProductBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveProduct();
            });
        }

        // Delete product button
        const deleteProductBtn = document.getElementById('deleteProductBtn');
        if (deleteProductBtn) {
            deleteProductBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.deleteProduct();
            });
        }

        // Generate SKU button
        const generateSKUBtn = document.getElementById('generateSKU');
        if (generateSKUBtn) {
            generateSKUBtn.addEventListener('click', () => {
                this.generateSKU(true); // Force generate new variation
            });
        }

        // Auto-generate SKU from name
        const productNameInput = document.getElementById('productName');
        const skuInput = document.getElementById('productSKU');

        if (productNameInput) {
            productNameInput.addEventListener('input', (e) => {
                // Always update if not manually touched or empty
                if (!this.isManualSku || !skuInput.value) {
                    this.generateSKU();
                }
            });
        }

        if (skuInput) {
            skuInput.addEventListener('input', () => {
                this.isManualSku = true; // User manually typed, stop auto-generating
            });
        }

        // Multi-Photo Upload handling
        const productImageFile = document.getElementById('productImageFile');
        if (productImageFile) {
            productImageFile.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    this.handlePhotoSelection(files[0]);
                    productImageFile.value = '';
                }
            });
        }

        // Camera file input
        const productCameraFile = document.getElementById('productCameraFile');
        if (productCameraFile) {
            productCameraFile.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    this.handlePhotoSelection(files[0]);
                    productCameraFile.value = '';
                }
            });
        }

        // Category change (for dependent Type dropdown)
        const productCategoryEl = document.getElementById('productCategory');
        if (productCategoryEl) {
            productCategoryEl.addEventListener('change', (e) => {
                this.updateProductTypes(e.target.value);
                this.renderDynamicFields();
            });
        }

        // Variants toggle and add button
        const enableVariants = document.getElementById('enableVariants');
        if (enableVariants) {
            enableVariants.addEventListener('change', (e) => {
                const section = document.getElementById('variantsSection');
                if (section) {
                    section.style.display = e.target.checked ? 'block' : 'none';
                    if (e.target.checked && document.getElementById('variantsList').children.length === 0) {
                        this.addVariantRow();
                    }
                }
            });
        }

        const addVariantBtn = document.getElementById('addVariantBtn');
        if (addVariantBtn) {
            addVariantBtn.addEventListener('click', () => {
                this.addVariantRow();
            });
        }

        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAllModals();
            });
        });

        // Close modal when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAllModals();
                }
            });
        });

        // Edit product event delegation
        document.addEventListener('click', (e) => {
            if (e.target.closest('.edit-product-btn')) {
                const btn = e.target.closest('.edit-product-btn');
                const productId = btn.dataset.id;
                this.showEditProductModal(productId);
            }
        });

        // Select All toggle
        const selectAllBtn = document.getElementById('selectAllProducts');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });
        }

        // Bulk Action buttons
        const bulkEditBtn = document.getElementById('bulkEditBtn');
        if (bulkEditBtn) {
            bulkEditBtn.addEventListener('click', () => {
                this.showBulkEditModal();
            });
        }

        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => {
                this.handleBulkDelete();
            });
        }

        const cancelSelectionBtn = document.getElementById('cancelSelection');
        if (cancelSelectionBtn) {
            cancelSelectionBtn.addEventListener('click', () => {
                this.clearSelection();
            });
        }

        const applyBulkUpdateBtn = document.getElementById('applyBulkUpdateBtn');
        if (applyBulkUpdateBtn) {
            applyBulkUpdateBtn.addEventListener('click', () => {
                this.applyBulkUpdate();
            });
        }

        // Category change for bulk modal
        const bulkCategory = document.getElementById('bulkCategory');
        if (bulkCategory) {
            bulkCategory.addEventListener('change', (e) => {
                this.updateProductTypes(e.target.value, '', 'bulkType');
            });
        }

        // Delete product event delegation
        document.addEventListener('click', (e) => {
            if (e.target.closest('.delete-product-btn')) {
                const btn = e.target.closest('.delete-product-btn');
                const productId = btn.dataset.id;
                if (confirm('Are you sure you want to delete this product?')) {
                    this.deleteProductById(productId);
                }
            }
        });
    }

    async loadInventory() {
        showLoading(true);

        try {
            // Fetch shop logo first
            const { data: shop } = await supabaseClient
                .from('shops')
                .select('shop_logo')
                .eq('id', this.shopId)
                .single();

            this.shopLogo = shop?.shop_logo || null;

            // Set shop logo as favicon
            if (this.shopLogo) {
                setFavicon(this.shopLogo);
            }

            const { data: products, error } = await supabaseClient
                .from('products')
                .select('*')
                .eq('shop_id', this.shopId)
                .order('product_name');

            if (error) {
                // Handle specific error
                if (error.message.includes('column "category" does not exist')) {

                    this.products = products || [];
                } else {
                    throw error;
                }
            } else {
                this.products = products || [];
            }

            // Add variant stocks to product display totals
            if (this.products.length > 0) {
                const allIds = this.products.map(p => p.id);
                const { data: variantStocks } = await supabaseClient
                    .from('product_variants')
                    .select('product_id, stock')
                    .in('product_id', allIds)
                    .eq('is_active', true);

                if (variantStocks && variantStocks.length > 0) {
                    const totals = {};
                    variantStocks.forEach(v => { totals[v.product_id] = (totals[v.product_id] || 0) + (parseInt(v.stock) || 0); });
                    this.products.forEach(p => {
                        if (totals[p.id]) {
                            p._baseStock = parseInt(p.stock) || 0;
                            p.stock = p._baseStock + totals[p.id];
                        }
                    });
                }
            }

            this.renderProducts();
            this.updateInventoryStats();

        } catch (error) {

            showNotification('Failed to load inventory', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadCategories() {
        try {
            // Load categories from database (Global + Shop Specific)
            const { data: categories, error } = await supabaseClient
                .from('categories')
                .select('*')
                .or(`shop_id.eq.${this.shopId},shop_id.is.null`)
                .order('category_name');

            if (error) {
                this.categories = this.getDefaultCategories();
            } else {
                this.categories = categories || [];

                // Ensure "Other" is always available as a utility category
                const hasOther = this.categories.some(c => (c.category_name || c) === 'Other');
                if (!hasOther) {
                    this.categories.unshift({ category_name: 'Other' });
                } else {
                    // Move "Other" to the top
                    this.categories = this.categories.filter(c => (c.category_name || c) !== 'Other');
                    this.categories.unshift({ category_name: 'Other' });
                }

                // If no categories exist, add defaults
                if (this.categories.length <= 1) {
                    this.categories = this.getDefaultCategories();
                }
            }

            this.populateCategoryFilter();

        } catch (error) {
            this.categories = this.getDefaultCategories();
            this.populateCategoryFilter();
        }
    }

    async loadTypeConfigs() {
        try {
            const { data } = await supabaseClient
                .from('system_configs')
                .select('key, value')
                .or('key.like.types_%,key.like.metadata_fields_%');

            this.typeConfigs = {};
            this.metadataConfigs = {};

            if (data) {
                data.forEach(config => {
                    if (config.key.startsWith('types_')) {
                        const category = config.key.replace('types_', '');
                        this.typeConfigs[category] = config.value.split(',').map(t => t.trim());
                    } else if (config.key.startsWith('metadata_fields_')) {
                        const category = config.key.replace('metadata_fields_', '');
                        try {
                            this.metadataConfigs[category] = JSON.parse(config.value);
                        } catch (e) {
                            console.error('Failed to parse metadata config', e);
                        }
                    }
                });
            }
        } catch (error) {
            console.warn('Flexible configurations not available, using defaults');
        }
    }

    getDefaultCategories() {
        return [
            { category_name: 'Other' },
            { category_name: 'Service' }
        ];
    }

    populateCategoryFilter() {
        const categoryFilter = document.getElementById('categoryFilter');
        const productCategory = document.getElementById('productCategory');

        if (!categoryFilter || !productCategory) return;

        // For Filter: Clear existing options except the first one (All Categories)
        while (categoryFilter.options.length > 1) {
            categoryFilter.remove(1);
        }

        // For Product Modal: Clear EVERYTHING
        while (productCategory.options.length > 0) {
            productCategory.remove(0);
        }

        // Add category options
        this.categories.forEach(category => {
            const categoryName = category.category_name || category;
            const isShopSpecific = !!category.shop_id;

            // Determine if this category should appear based on business type
            let shouldShowInFilter = false;
            let shouldShowInModal = false;

            if (this.businessType === 'general' || !this.businessType) {
                // General store: show everything
                shouldShowInFilter = true;
                shouldShowInModal = true;
            } else {
                // Specific Business Type (e.g. 'Cloth'):
                // - Show the category matching the business type name
                // - Show shop-specific (custom) categories created by this shop
                // - Show 'Other' and 'Service' as utility categories
                const matchesBusinessType = categoryName.toLowerCase() === this.businessType.toLowerCase();
                const isUtility = categoryName === 'Other' || categoryName === 'Service';

                if (matchesBusinessType || isShopSpecific || isUtility) {
                    shouldShowInFilter = true;
                    shouldShowInModal = true;
                }
            }

            // 1. Add to Filter dropdown
            if (shouldShowInFilter) {
                const option1 = document.createElement('option');
                option1.value = categoryName;
                option1.textContent = categoryName;
                categoryFilter.appendChild(option1);
            }

            // 2. Add to Product Modal dropdown
            if (shouldShowInModal) {
                const option2 = document.createElement('option');
                option2.value = categoryName;
                option2.textContent = categoryName;
                productCategory.appendChild(option2);
            }
        });
    }

    updateProductTypes(category, selectedType = '', targetId = 'productType') {
        const typeSelect = document.getElementById(targetId);
        if (!typeSelect) return;

        // Reset type options
        typeSelect.innerHTML = targetId === 'bulkType' ? '<option value="">No Change</option>' : '<option value="">Select Type</option>';

        if (!category) return;

        // Standardize category name for lookup (handle both lower and sentence case)
        const standardizedCategory = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

        // Look up types from system_configs (set by Super Admin)
        // Try exact match first, then standardized, then business type match
        let types = this.typeConfigs[category] || this.typeConfigs[standardizedCategory] || [];

        // If no types found for this category AND shop has a specific business type,
        // try loading types configured for the business type category
        if (types.length === 0 && this.businessType && this.businessType !== 'general') {
            const bizTypeStd = this.businessType.charAt(0).toUpperCase() + this.businessType.slice(1).toLowerCase();
            types = this.typeConfigs[this.businessType] || this.typeConfigs[bizTypeStd] || [];
        }

        types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (type === selectedType) option.selected = true;
            typeSelect.appendChild(option);
        });

        // Add 'Other' if not present and category selected
        if (category && !types.includes('Other')) {
            const otherOption = document.createElement('option');
            otherOption.value = 'Other';
            otherOption.textContent = 'Other';
            if ('Other' === selectedType) otherOption.selected = true;
            typeSelect.appendChild(otherOption);
        }
    }

    renderProducts() {
        const tableBody = document.getElementById('inventoryTable');
        if (!tableBody) return;

        if (this.products.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-box-open fa-2x"></i>
                            <p>No products found</p>
                            <small>Click "Add Product" to get started</small>
                        </div>
                    </td>
                </tr>
            `;
            this.renderInventoryPagination(0);
            return;
        }

        // Pagination
        const perPage = 20;
        this.inventoryPage = this.inventoryPage || 1;
        const totalProducts = this.products.length;
        const totalPages = Math.ceil(totalProducts / perPage);
        const start = (this.inventoryPage - 1) * perPage;
        const pageProducts = this.products.slice(start, start + perPage);

        const productRows = pageProducts.map(product => {
            const profitMargin = product.cost_price && product.selling_price ?
                ((product.selling_price - product.cost_price) / product.cost_price * 100).toFixed(1) : '0.0';

            let status = 'success';
            let statusText = `In Stock (${product.stock})`;

            if (product.stock < 1) {
                status = 'danger';
                statusText = 'Out of Stock';
            } else if (product.stock < this.lowStockThreshold) {
                status = 'warning';
                statusText = `Low Stock (${product.stock})`;
            }

            // Get category
            let category = 'Uncategorized';
            if (typeof product.category === 'string') {
                category = product.category;
            } else if (product.category && product.category.category_name) {
                category = product.category.category_name;
            }

            const isHidden = product.show_in_store === false;

            return `
                <tr class="${this.selectedProducts.has(product.id) ? 'selected-row' : ''}" ${isHidden ? 'style="opacity: 0.7;"' : ''}>
                    <td>
                        <input type="checkbox" class="product-checkbox" data-id="${product.id}" 
                               ${this.selectedProducts.has(product.id) ? 'checked' : ''}>
                    </td>
                    <td>
                        <div class="product-info-wrapper">
                            <img src="${product.product_image || this.shopLogo || 'https://via.placeholder.com/150?text=No+Image'}" 
                                 class="product-img-inventory" 
                                 alt="${product.product_name}">
                            <div class="product-info">
                                <strong>${product.product_name}</strong>
                                ${isHidden ? '<small style="color: #e74c3c;"><i class="fas fa-eye-slash"></i> Hidden from store</small>' : (product.description ? `<small>${product.description.substring(0, 50)}...</small>` : '')}
                            </div>
                        </div>
                    </td>
                    <td>${product.sku}</td>
                    <td>${category}</td>
                    <td>${product.type || 'N/A'}</td>
                    <td>
                        <span class="stock-badge ${status}">
                            ${product.stock}
                        </span>
                    </td>
                    <td>${formatCurrency(product.cost_price || 0)}</td>
                    <td>${formatCurrency(product.selling_price || 0)}</td>
                    <td>
                        <span class="profit-badge ${parseFloat(profitMargin) > 0 ? 'positive' : 'negative'}">
                            ${profitMargin}%
                        </span>
                    </td>
                    <td>
                        <span class="status-badge ${status}">
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary edit-product-btn" data-id="${product.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${this.currentUser.role === 'shop_admin' ? `
                            <button class="btn btn-sm btn-danger delete-product-btn" data-id="${product.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Update the table
        tableBody.innerHTML = productRows;

        // Render pagination
        this.renderInventoryPagination(totalProducts);

        // Re-bind row checkbox events
        this.bindRowCheckboxes();
    }

    renderInventoryPagination(totalProducts) {
        let paginationEl = document.getElementById('inventoryPagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'inventoryPagination';
            const tableContainer = document.querySelector('.table-container');
            if (tableContainer) tableContainer.after(paginationEl);
        }

        const perPage = 20;
        const totalPages = Math.ceil(totalProducts / perPage);
        const currentPage = this.inventoryPage || 1;

        if (totalPages <= 1) {
            paginationEl.innerHTML = totalProducts > 0 ? `<div style="text-align:center;padding:10px;font-size:0.8rem;color:#64748b;">${totalProducts} product(s)</div>` : '';
            return;
        }

        paginationEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;">
                <span style="font-size:0.8rem;color:#64748b;">Showing ${(currentPage-1)*perPage+1}-${Math.min(currentPage*perPage, totalProducts)} of ${totalProducts}</span>
                <div style="display:flex;gap:4px;align-items:center;">
                    <button onclick="window.inventoryManager.inventoryPage=1;window.inventoryManager.renderProducts();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
                    <button onclick="window.inventoryManager.inventoryPage--;window.inventoryManager.renderProducts();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
                    <span style="padding:6px 12px;background:var(--primary);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${currentPage} / ${totalPages}</span>
                    <button onclick="window.inventoryManager.inventoryPage++;window.inventoryManager.renderProducts();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
                    <button onclick="window.inventoryManager.inventoryPage=${totalPages};window.inventoryManager.renderProducts();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
                </div>
            </div>
        `;
    }

    bindRowCheckboxes() {
        const checkboxes = document.querySelectorAll('.product-checkbox');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                if (e.target.checked) {
                    this.selectedProducts.add(id);
                } else {
                    this.selectedProducts.delete(id);
                }
                this.updateBulkActionBar();

                // Update row highlight
                const row = e.target.closest('tr');
                if (row) row.classList.toggle('selected-row', e.target.checked);

                // Update Select All state
                const selectAll = document.getElementById('selectAllProducts');
                if (selectAll) {
                    selectAll.checked = this.selectedProducts.size === this.products.length && this.products.length > 0;
                }
            });
        });
    }

    toggleSelectAll(checked) {
        if (checked) {
            this.products.forEach(p => this.selectedProducts.add(p.id));
        } else {
            this.selectedProducts.clear();
        }
        this.renderProducts();
        this.updateBulkActionBar();
    }

    clearSelection() {
        this.selectedProducts.clear();
        const selectAll = document.getElementById('selectAllProducts');
        if (selectAll) selectAll.checked = false;
        this.renderProducts();
        this.updateBulkActionBar();
    }

    updateBulkActionBar() {
        const bar = document.getElementById('bulkActionBar');
        const count = document.getElementById('selectedCount');
        if (!bar || !count) return;

        if (this.selectedProducts.size > 0) {
            count.textContent = this.selectedProducts.size;
            bar.classList.add('active');
        } else {
            bar.classList.remove('active');
        }
    }

    async showBulkEditModal() {
        const modal = document.getElementById('bulkEditModal');
        const count = document.getElementById('bulkEditCount');
        const form = document.getElementById('bulkEditForm');

        if (!modal || !form) return;

        count.textContent = this.selectedProducts.size;
        form.reset();

        const bulkCat = document.getElementById('bulkCategory');
        if (bulkCat) {
            bulkCat.innerHTML = '<option value="">No Change</option>';
            this.categories.forEach(cat => {
                const name = cat.category_name || cat;
                const isShopSpecific = !!cat.shop_id;

                let shouldShow = false;

                if (this.businessType === 'general' || !this.businessType) {
                    shouldShow = true;
                } else {
                    // Specific Business Type: show matching, shop-specific, and utility categories
                    const matchesBusinessType = name.toLowerCase() === this.businessType.toLowerCase();
                    const isUtility = name === 'Other' || name === 'Service';

                    if (matchesBusinessType || isShopSpecific || isUtility) {
                        shouldShow = true;
                    }
                }

                if (shouldShow) {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    bulkCat.appendChild(opt);
                }
            });
        }

        // Render dynamic metadata fields based on current category
        this.renderBulkDynamicFields();

        // Add event listener for category change to update dynamic fields
        const bulkCatSelect = document.getElementById('bulkCategory');
        if (bulkCatSelect) {
            bulkCatSelect.removeEventListener('change', this.handleBulkCategoryChange);
            this.handleBulkCategoryChange = () => {
                this.updateProductTypes(bulkCatSelect.value, '', 'bulkType');
                this.renderBulkDynamicFields();
            };
            bulkCatSelect.addEventListener('change', this.handleBulkCategoryChange);
        }

        modal.classList.add('active');
    }

    renderBulkDynamicFields() {
        const container = document.getElementById('bulkDynamicFields');
        if (!container) return;

        container.innerHTML = '';
        let fields = [];

        // Get current category from bulk edit form
        const categoryElem = document.getElementById('bulkCategory');
        const selectedCategory = categoryElem ? categoryElem.value : null;

        if (!selectedCategory) {
            container.style.display = 'none';
            return;
        }

        // Priority 1: Use custom metadata fields from system_configs
        if (this.metadataConfigs && this.metadataConfigs[selectedCategory]) {
            fields = this.metadataConfigs[selectedCategory];
        }

        if (fields.length > 0) {
            let row;
            fields.forEach((field, index) => {
                // Start a new row every 2 fields
                if (index % 2 === 0) {
                    row = document.createElement('div');
                    row.className = 'form-row';
                    container.appendChild(row);
                }

                const group = document.createElement('div');
                group.className = 'form-group';

                const label = document.createElement('label');

                // Add appropriate icon based on label/type
                let iconClass = 'fas fa-info-circle';
                const labelLower = field.label.toLowerCase();
                if (labelLower.includes('date') || labelLower.includes('expiry')) iconClass = 'fas fa-calendar-alt';
                else if (labelLower.includes('time')) iconClass = 'fas fa-clock';
                else if (labelLower.includes('weight') || labelLower.includes('unit') || labelLower.includes('volume')) iconClass = 'fas fa-weight';
                else if (labelLower.includes('size')) iconClass = 'fas fa-tag';
                else if (labelLower.includes('material')) iconClass = 'fas fa-layer-group';
                else if (labelLower.includes('color')) iconClass = 'fas fa-palette';
                else if (labelLower.includes('brand')) iconClass = 'fas fa-trademark';
                else if (labelLower.includes('warranty') || labelLower.includes('expiry')) iconClass = 'fas fa-shield-alt';
                else if (labelLower.includes('veg')) iconClass = 'fas fa-leaf';

                label.innerHTML = `<i class="${iconClass}"></i> ${field.label}`;
                group.appendChild(label);

                let input;
                if (field.type === 'select') {
                    input = document.createElement('select');
                    // Add empty/placeholder option
                    const placeholder = document.createElement('option');
                    placeholder.value = '';
                    placeholder.textContent = 'No Change';
                    input.appendChild(placeholder);

                    const options = Array.isArray(field.options) ? field.options : [];
                    options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt;
                        input.appendChild(option);
                    });
                } else {
                    input = document.createElement('input');
                    input.type = field.type;
                    input.placeholder = 'Leave for no change';
                }
                input.id = 'bulk_dyn_' + (field.id || field.label.toLowerCase().replace(/\s+/g, '_'));
                input.className = 'bulk-dynamic-field-input';
                group.appendChild(input);
                row.appendChild(group);
            });
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    async applyBulkUpdate() {
        const selectedIds = Array.from(this.selectedProducts);
        if (selectedIds.length === 0) return;

        const category = document.getElementById('bulkCategory').value;
        const type = document.getElementById('bulkType').value;
        const costPriceInput = document.getElementById('bulkCostPrice').value;
        const sellingPriceInput = document.getElementById('bulkSellingPrice').value;
        const description = document.getElementById('bulkDescription').value.trim();
        const lowStockAlertInput = document.getElementById('bulkLowStockAlert').value;
        const priorityInput = document.getElementById('bulkPriority').value;
        const showInStore = document.getElementById('bulkShowInStore').value;

        const stockValueInput = document.getElementById('bulkStockValue').value;
        const stockAction = document.getElementById('stockAction').value;

        // Get dynamic metadata field values
        const metadataValues = {};
        let hasMetadataChanges = false;
        document.querySelectorAll('.bulk-dynamic-field-input').forEach(input => {
            if (input.value && input.value !== '') {
                const id = input.id.replace('bulk_dyn_', '');
                metadataValues[id] = input.value;
                hasMetadataChanges = true;
            }
        });

        // Build update object only with changed fields
        const updates = {};
        if (category) updates.category = category;
        if (type && type !== 'No Change') updates.type = type;
        if (costPriceInput !== '') updates.cost_price = parseFloat(costPriceInput);
        if (sellingPriceInput !== '') updates.selling_price = parseFloat(sellingPriceInput);
        if (description) updates.description = description;
        if (lowStockAlertInput !== '') updates.low_stock_alert = parseInt(lowStockAlertInput);
        if (priorityInput !== '') updates.priority = parseInt(priorityInput);
        if (showInStore !== '') updates.show_in_store = showInStore === 'true';
        updates.updated_at = new Date().toISOString();

        showLoading(true);
        let successCount = 0;

        try {
            // Process updates
            for (const id of selectedIds) {
                const currentProduct = this.products.find(p => p.id === id);
                const finalUpdates = { ...updates };

                // Handle Stock Adjustment
                if (stockValueInput !== '') {
                    const stockValue = parseFloat(stockValueInput);
                    if (stockAction === 'set') {
                        finalUpdates.stock = stockValue;
                    } else if (stockAction === 'add') {
                        finalUpdates.stock = (currentProduct.stock || 0) + stockValue;
                    } else if (stockAction === 'sub') {
                        finalUpdates.stock = Math.max(0, (currentProduct.stock || 0) - stockValue);
                    }
                }

                // Handle Metadata Merge
                if (hasMetadataChanges) {
                    const currentMeta = typeof currentProduct.metadata === 'string'
                        ? JSON.parse(currentProduct.metadata || '{}')
                        : (currentProduct.metadata || {});

                    finalUpdates.metadata = { ...currentMeta, ...metadataValues };
                }

                if (Object.keys(finalUpdates).length > 1) { // More than just updated_at
                    const { error } = await supabaseClient
                        .from('products')
                        .update(finalUpdates)
                        .eq('id', id);

                    if (!error) successCount++;
                }
            }

            showNotification(`Updated ${successCount} products successfully`, 'success');
            await this.loadInventory();
            this.clearSelection();
            document.getElementById('bulkEditModal').classList.remove('active');

            // Audit logging
            if (window.authManager) {
                await window.authManager.createAuditLog('bulk_update', 'products', null, null, {
                    count: successCount,
                    fields: Object.keys(updates)
                });
            }

        } catch (error) {

            showNotification('Failed to apply bulk updates', 'error');
        } finally {
            showLoading(false);
        }
    }

    async handleBulkDelete() {
        const count = this.selectedProducts.size;
        if (count === 0) return;

        if (!confirm(`Are you sure you want to delete ${count} selected products? This action cannot be undone.`)) {
            return;
        }

        showLoading(true);
        const selectedIds = Array.from(this.selectedProducts);

        try {
            const { error } = await supabaseClient
                .from('products')
                .delete()
                .in('id', selectedIds);

            if (error) throw error;

            showNotification(`Deleted ${count} products`, 'success');
            await this.loadInventory();
            this.clearSelection();

            // Audit Log
            if (window.authManager) {
                await window.authManager.createAuditLog('bulk_delete', 'products', null, null, {
                    count: count,
                    product_ids: selectedIds
                });
            }

        } catch (error) {

            showNotification('Failed to delete products', 'error');
        } finally {
            showLoading(false);
        }
    }

    updateInventoryStats() {
        const totalProducts = this.products.length;
        const lowStockCount = this.products.filter(p => p.stock > 0 && p.stock < this.lowStockThreshold).length;
        const outOfStockCount = this.products.filter(p => p.stock < 1).length;

        // Calculate inventory value
        const inventoryValue = this.products.reduce((sum, product) => {
            return sum + (parseFloat(product.cost_price || 0) * product.stock);
        }, 0);

        // Update display
        document.getElementById('totalProducts').textContent = totalProducts;
        document.getElementById('lowStockCount').textContent = lowStockCount;
        document.getElementById('outOfStockCount').textContent = outOfStockCount;
        document.getElementById('inventoryValue').textContent = formatCurrency(inventoryValue);
    }

    showAddProductModal() {
        // Reset form
        document.getElementById('modalTitle').textContent = 'Add New Product';
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
        document.getElementById('deleteProductBtn').style.display = 'none';

        // Set default values
        document.getElementById('productStock').value = '0';
        document.getElementById('lowStockAlert').value = this.lowStockThreshold || '10';

        // Default category: Use the business type category if shop has a specific type
        let defaultCategory = 'Other';
        if (this.businessType && this.businessType !== 'general') {
            const options = Array.from(document.getElementById('productCategory').options).map(o => o.value);
            const match = options.find(opt => opt.toLowerCase() === this.businessType.toLowerCase());
            if (match) {
                defaultCategory = match;
            }
        }

        document.getElementById('productCategory').value = defaultCategory;
        document.getElementById('productPriority').value = 0;

        // Default: show in store is checked for new products
        const showInStoreCheckbox = document.getElementById('showInStore');
        if (showInStoreCheckbox) showInStoreCheckbox.checked = true;

        // Load product types for the selected category (respects business type)
        this.updateProductTypes(defaultCategory);

        // Render dynamic fields
        this.renderDynamicFields();

        this.generateSKU();

        // Reset photos
        this.clearPhotos();
        this.isManualSku = false;

        // Reset variants
        this.resetVariants();
        // Show variants option for new products
        const enableVariantsCheckbox = document.getElementById('enableVariants');
        if (enableVariantsCheckbox) {
            enableVariantsCheckbox.parentElement.parentElement.style.display = '';
            enableVariantsCheckbox.disabled = false;
        }

        // Show modal
        document.getElementById('productModal').classList.add('active');
    }

    addVariantRow(data = {}) {
        const container = document.getElementById('variantsList');
        if (!container) return;

        // Get dynamic fields for current category
        const categoryElem = document.getElementById('productCategory');
        const selectedCategory = categoryElem ? categoryElem.value : null;
        let dynamicFields = [];
        if (selectedCategory && this.metadataConfigs && this.metadataConfigs[selectedCategory]) {
            dynamicFields = this.metadataConfigs[selectedCategory];
        }

        // Get base product values for placeholders
        const baseCost = document.getElementById('costPrice')?.value || '';
        const basePrice = document.getElementById('sellingPrice')?.value || '';
        const baseStock = document.getElementById('productStock')?.value || '0';
        const baseDynamicValues = this.getDynamicFieldValues();

        // Get existing variant attributes (for edit mode)
        let existingAttrs = data.attributes || {};
        if (typeof existingAttrs === 'string') { try { existingAttrs = JSON.parse(existingAttrs); } catch(e) { existingAttrs = {}; } }

        const row = document.createElement('div');
        row.className = 'variant-row';
        row.style.cssText = 'margin-bottom:14px;padding:18px;background:white;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.04);transition:border-color 0.2s;';

        // Build dynamic fields HTML with base values as placeholders
        let dynamicFieldsHtml = '';
        if (dynamicFields.length > 0) {
            dynamicFieldsHtml = '<div class="variant-dynamic-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed #e2e8f0;">';
            dynamicFields.forEach(field => {
                const fieldId = field.id || field.label.toLowerCase().replace(/\s+/g, '_');
                const existingVal = existingAttrs[fieldId] || '';
                const baseVal = baseDynamicValues[fieldId] || '';

                if (field.type === 'select') {
                    const options = Array.isArray(field.options) ? field.options : [];
                    dynamicFieldsHtml += `<div style="position:relative;"><label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;">${field.label}</label><select class="variant-attr" data-field-id="${fieldId}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;background:white;color:#334155;outline:none;">`;
                    dynamicFieldsHtml += `<option value="">${baseVal ? '↑ ' + baseVal + ' (base)' : 'Select ' + field.label}</option>`;
                    options.forEach(opt => {
                        dynamicFieldsHtml += `<option value="${opt}" ${existingVal === opt ? 'selected' : ''}>${opt}</option>`;
                    });
                    dynamicFieldsHtml += '</select></div>';
                } else {
                    dynamicFieldsHtml += `<div style="position:relative;"><label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;">${field.label}</label><input type="${field.type || 'text'}" class="variant-attr" data-field-id="${fieldId}" placeholder="${baseVal || 'Enter ' + field.label}" value="${existingVal}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;outline:none;color:#334155;"></div>`;
                }
            });
            dynamicFieldsHtml += '</div>';
        }

        row.innerHTML = `
            <div style="display:flex;gap:12px;align-items:center;">
                <div class="variant-img-preview" style="width:56px;height:56px;border-radius:10px;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;flex-shrink:0;background:#f8fafc;transition:border-color 0.2s;" title="Add image">
                    <i class="fas fa-camera" style="color:#94a3b8;font-size:1rem;"></i>
                </div>
                <input type="file" class="variant-img-input" accept="image/*" style="display:none;">
                <div style="flex:1;">
                    <input type="text" class="variant-name" placeholder="Variant name (e.g. Red, XL, 500ml)" value="${data.name || data.variant_name || ''}" style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.95rem;font-weight:600;outline:none;color:#1e293b;">
                </div>
                <button type="button" class="btn btn-sm btn-danger remove-variant-btn" style="width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:8px;flex-shrink:0;background:#fee2e2;border:1px solid #fecaca;color:#dc2626;">
                    <i class="fas fa-trash-alt" style="font-size:0.8rem;"></i>
                </button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;">
                <div style="position:relative;">
                    <label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#64748b;font-weight:600;">STOCK</label>
                    <input type="number" class="variant-stock" placeholder="${baseStock}" value="${data.stock || 0}" min="0" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;outline:none;">
                </div>
                <div style="position:relative;">
                    <label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#64748b;font-weight:600;">COST</label>
                    <input type="number" class="variant-cost" placeholder="${baseCost || '0.00'}" value="${data.cost_price || ''}" step="0.01" min="0" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;outline:none;">
                </div>
                <div style="position:relative;">
                    <label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#10b981;font-weight:700;">PRICE *</label>
                    <input type="number" class="variant-price" placeholder="${basePrice || '0.00'}" value="${data.price || ''}" step="0.01" min="0" style="width:100%;padding:10px 12px;border:1px solid #d1fae5;border-radius:8px;font-size:0.85rem;outline:none;background:#f0fdf4;" required>
                </div>
            </div>
            ${dynamicFieldsHtml}
        `;

        // Hover effect
        row.addEventListener('mouseenter', () => { row.style.borderColor = '#93c5fd'; row.style.boxShadow = '0 2px 8px rgba(59,130,246,0.08)'; });
        row.addEventListener('mouseleave', () => { row.style.borderColor = '#e2e8f0'; row.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; });

        const imgPreview = row.querySelector('.variant-img-preview');
        const imgInput = row.querySelector('.variant-img-input');
        imgPreview.addEventListener('click', () => imgInput.click());
        imgPreview.addEventListener('mouseenter', () => { imgPreview.style.borderColor = '#93c5fd'; });
        imgPreview.addEventListener('mouseleave', () => { imgPreview.style.borderColor = '#cbd5e1'; });
        imgPreview.addEventListener('click', () => {
            // Show camera/gallery picker for variant image
            this.showVariantImagePicker(row, imgPreview);
        });

        row.querySelector('.remove-variant-btn').addEventListener('click', () => row.remove());
        container.appendChild(row);
    }

    getVariants() {
        const rows = document.querySelectorAll('#variantsList .variant-row');
        const variants = [];
        rows.forEach(row => {
            const name = row.querySelector('.variant-name').value.trim();
            const stock = parseInt(row.querySelector('.variant-stock').value) || 0;
            const costPrice = parseFloat(row.querySelector('.variant-cost').value) || 0;
            const price = parseFloat(row.querySelector('.variant-price').value) || 0;
            const imageFile = row._variantFile || null;

            // Collect dynamic attribute fields
            const attributes = {};
            row.querySelectorAll('.variant-attr').forEach(input => {
                const fieldId = input.dataset.fieldId;
                const val = input.value.trim();
                if (fieldId && val) {
                    attributes[fieldId] = val;
                }
            });

            if (name) {
                variants.push({ name, stock, costPrice, price, imageFile, attributes });
            }
        });
        return variants;
    }

    resetVariants() {
        const container = document.getElementById('variantsList');
        if (container) container.innerHTML = '';
        const checkbox = document.getElementById('enableVariants');
        if (checkbox) { checkbox.checked = false; checkbox.disabled = false; }
        const section = document.getElementById('variantsSection');
        if (section) section.style.display = 'none';
    }

    addVariantRowWithData(v) {
        // Add a variant row pre-filled with existing data from database
        const container = document.getElementById('variantsList');
        if (!container) return;

        // Get base product values for placeholders
        const baseCost = document.getElementById('costPrice')?.value || '';
        const basePrice = document.getElementById('sellingPrice')?.value || '';
        const baseStock = document.getElementById('productStock')?.value || '0';
        const baseDynamicValues = this.getDynamicFieldValues();

        // Get dynamic fields for current category
        const categoryElem = document.getElementById('productCategory');
        const selectedCategory = categoryElem ? categoryElem.value : null;
        let dynamicFields = [];
        if (selectedCategory && this.metadataConfigs && this.metadataConfigs[selectedCategory]) {
            dynamicFields = this.metadataConfigs[selectedCategory];
        }

        // Get existing variant attributes
        let existingAttrs = v.attributes || {};
        if (typeof existingAttrs === 'string') { try { existingAttrs = JSON.parse(existingAttrs); } catch(e) { existingAttrs = {}; } }

        // Build dynamic fields HTML
        let dynamicFieldsHtml = '';
        if (dynamicFields.length > 0) {
            dynamicFieldsHtml = '<div class="variant-dynamic-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed #e2e8f0;">';
            dynamicFields.forEach(field => {
                const fieldId = field.id || field.label.toLowerCase().replace(/\s+/g, '_');
                const existingVal = existingAttrs[fieldId] || '';
                const baseVal = baseDynamicValues[fieldId] || '';

                if (field.type === 'select') {
                    const options = Array.isArray(field.options) ? field.options : [];
                    dynamicFieldsHtml += `<div style="position:relative;"><label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;">${field.label}</label><select class="variant-attr" data-field-id="${fieldId}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;background:white;color:#334155;outline:none;">`;
                    dynamicFieldsHtml += `<option value="">${baseVal ? '↑ ' + baseVal + ' (base)' : 'Select ' + field.label}</option>`;
                    options.forEach(opt => {
                        dynamicFieldsHtml += `<option value="${opt}" ${existingVal === opt ? 'selected' : ''}>${opt}</option>`;
                    });
                    dynamicFieldsHtml += '</select></div>';
                } else {
                    dynamicFieldsHtml += `<div style="position:relative;"><label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#64748b;font-weight:600;text-transform:uppercase;">${field.label}</label><input type="${field.type || 'text'}" class="variant-attr" data-field-id="${fieldId}" placeholder="${baseVal || 'Enter ' + field.label}" value="${existingVal}" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;outline:none;color:#334155;"></div>`;
                }
            });
            dynamicFieldsHtml += '</div>';
        }

        const row = document.createElement('div');
        row.className = 'variant-row';
        row.dataset.variantDbId = v.id || '';
        row.style.cssText = 'margin-bottom:14px;padding:18px;background:white;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.04);transition:border-color 0.2s;';

        row.innerHTML = `
            <div style="display:flex;gap:12px;align-items:center;">
                <div class="variant-img-preview" style="width:56px;height:56px;border-radius:10px;border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;flex-shrink:0;background:#f8fafc;" title="Change image">
                    ${v.image_url ? `<img src="${v.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : '<i class="fas fa-camera" style="color:#94a3b8;font-size:1rem;"></i>'}
                </div>
                <div style="flex:1;">
                    <input type="text" class="variant-name" placeholder="Variant name" value="${v.variant_name || ''}" style="width:100%;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.95rem;font-weight:600;outline:none;color:#1e293b;">
                </div>
                <button type="button" class="btn btn-sm btn-danger remove-variant-btn" style="width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:8px;flex-shrink:0;background:#fee2e2;border:1px solid #fecaca;color:#dc2626;" title="Delete variant">
                    <i class="fas fa-trash-alt" style="font-size:0.8rem;"></i>
                </button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;">
                <div style="position:relative;">
                    <label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#64748b;font-weight:600;">STOCK</label>
                    <input type="number" class="variant-stock" placeholder="${baseStock}" value="${v.stock || 0}" min="0" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;outline:none;">
                </div>
                <div style="position:relative;">
                    <label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#64748b;font-weight:600;">COST</label>
                    <input type="number" class="variant-cost" placeholder="${baseCost || '0.00'}" value="${v.cost_price || ''}" step="0.01" min="0" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:0.85rem;outline:none;">
                </div>
                <div style="position:relative;">
                    <label style="position:absolute;top:-8px;left:10px;background:white;padding:0 4px;font-size:0.65rem;color:#10b981;font-weight:700;">PRICE *</label>
                    <input type="number" class="variant-price" placeholder="${basePrice || '0.00'}" value="${v.price || ''}" step="0.01" min="0" style="width:100%;padding:10px 12px;border:1px solid #d1fae5;border-radius:8px;font-size:0.85rem;outline:none;background:#f0fdf4;" required>
                </div>
            </div>
            ${dynamicFieldsHtml}
        `;

        // Hover effect
        row.addEventListener('mouseenter', () => { row.style.borderColor = '#93c5fd'; row.style.boxShadow = '0 2px 8px rgba(59,130,246,0.08)'; });
        row.addEventListener('mouseleave', () => { row.style.borderColor = '#e2e8f0'; row.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; });

        const imgPreview = row.querySelector('.variant-img-preview');
        imgPreview.addEventListener('click', () => {
            this.showVariantImagePicker(row, imgPreview);
        });

        row.querySelector('.remove-variant-btn').addEventListener('click', async () => {
            const dbId = row.dataset.variantDbId;
            if (dbId) {
                if (confirm('Delete this variant permanently?')) {
                    await supabaseClient.from('product_variants').delete().eq('id', dbId);
                    row.remove();
                    showNotification('Variant deleted', 'success');
                }
            } else {
                row.remove();
            }
        });

        container.appendChild(row);
    }

    async saveProductWithVariants(baseName, baseSku, category, productType, baseCost, basePrice, baseStock, description, lowStockAlert, priority, showInStore, dynamicValues, variants) {
        try {
            // 1. Upload main product image
            let mainImageUrl = null;
            if (this.productImages.length > 0) {
                const img = this.productImages[0];
                if (img.file) {
                    const fileExt = img.file.name.split('.').pop();
                    const fileName = `${this.shopId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const { error } = await supabaseClient.storage.from('products').upload(fileName, img.file);
                    if (!error) {
                        const { data: { publicUrl } } = supabaseClient.storage.from('products').getPublicUrl(fileName);
                        mainImageUrl = publicUrl;
                    }
                } else if (img.url) {
                    mainImageUrl = img.url;
                }
            }

            // 2. Create the SINGLE parent product
            const variantTotalStock = variants.reduce((sum, v) => sum + v.stock, 0);
            const productData = {
                shop_id: this.shopId,
                product_name: baseName,
                sku: baseSku,
                category: category || null,
                type: productType || null,
                stock: baseStock,
                cost_price: baseCost,
                selling_price: basePrice,
                product_image: mainImageUrl,
                description: description || null,
                low_stock_alert: lowStockAlert,
                priority: priority,
                show_in_store: showInStore,
                metadata: { ...dynamicValues, has_variants: true, base_stock: baseStock },
                updated_at: new Date().toISOString()
            };

            const { data: savedProduct, error: productError } = await supabaseClient
                .from('products')
                .insert([productData])
                .select()
                .single();

            if (productError) throw productError;

            const productId = savedProduct.id;

            // 3. Upload variant images and insert variant rows
            const variantRows = [];
            for (let i = 0; i < variants.length; i++) {
                const v = variants[i];
                let variantImageUrl = null;

                if (v.imageFile) {
                    const fileExt = v.imageFile.name.split('.').pop();
                    const fileName = `${this.shopId}/variants/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const { error } = await supabaseClient.storage.from('products').upload(fileName, v.imageFile);
                    if (!error) {
                        const { data: { publicUrl } } = supabaseClient.storage.from('products').getPublicUrl(fileName);
                        variantImageUrl = publicUrl;
                    }
                }

                variantRows.push({
                    product_id: productId,
                    shop_id: this.shopId,
                    variant_name: v.name,
                    attributes: { name: v.name, ...(v.attributes || {}), ...(!Object.keys(v.attributes || {}).length ? dynamicValues : {}) },
                    sku: `${baseSku}-${v.name.replace(/\s+/g, '').toUpperCase()}-${i + 1}`,
                    price: v.price || basePrice,
                    cost_price: v.costPrice || baseCost,
                    stock: v.stock,
                    image_url: variantImageUrl || mainImageUrl,
                    is_active: true
                });
            }

            const { error: variantError } = await supabaseClient
                .from('product_variants')
                .insert(variantRows);

            if (variantError) throw variantError;

            showNotification(`Product created with ${variants.length} variant(s)!`, 'success');
            this.closeAllModals();
            await this.loadInventory();

        } catch (error) {
            console.error('Variant save error:', error);
            showNotification('Failed to save: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            showLoading(false);
        }
    }

    async saveVariantsForProduct(productId) {
        const rows = document.querySelectorAll('#variantsList .variant-row');
        if (rows.length === 0) return;

        // Get main product dynamic values as fallback
        const mainDynamicValues = this.getDynamicFieldValues();

        for (const row of rows) {
            const dbId = row.dataset.variantDbId;
            const name = row.querySelector('.variant-name').value.trim();
            const stock = parseInt(row.querySelector('.variant-stock').value) || 0;
            const costPrice = parseFloat(row.querySelector('.variant-cost').value) || 0;
            const price = parseFloat(row.querySelector('.variant-price').value) || 0;

            if (!name) continue;

            // Collect variant-specific attributes
            const attributes = { name };
            row.querySelectorAll('.variant-attr').forEach(input => {
                const fieldId = input.dataset.fieldId;
                const val = input.value.trim();
                if (fieldId && val) attributes[fieldId] = val;
            });

            // If no variant-specific attrs filled, use main product values as default
            if (Object.keys(attributes).length <= 1 && Object.keys(mainDynamicValues).length > 0) {
                Object.assign(attributes, mainDynamicValues);
            }

            // Upload new image if changed
            let imageUrl = null;
            if (row._variantFile) {
                const fileExt = row._variantFile.name.split('.').pop();
                const fileName = `${this.shopId}/variants/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const { error } = await supabaseClient.storage.from('products').upload(fileName, row._variantFile);
                if (!error) {
                    const { data: { publicUrl } } = supabaseClient.storage.from('products').getPublicUrl(fileName);
                    imageUrl = publicUrl;
                }
            }

            if (dbId) {
                // Update existing variant
                const updateData = { variant_name: name, stock, cost_price: costPrice, price, attributes };
                if (imageUrl) updateData.image_url = imageUrl;
                await supabaseClient.from('product_variants').update(updateData).eq('id', dbId);
            } else {
                // Insert new variant
                const baseSku = document.getElementById('productSKU').value || '';
                await supabaseClient.from('product_variants').insert([{
                    product_id: productId,
                    shop_id: this.shopId,
                    variant_name: name,
                    attributes: attributes,
                    sku: `${baseSku}-${name.replace(/\s+/g, '').toUpperCase()}`,
                    price: price,
                    cost_price: costPrice,
                    stock: stock,
                    image_url: imageUrl,
                    is_active: true
                }]);
            }
        }

        // Don't modify parent stock — it stores only base stock
        // POS and inventory calculate total dynamically
    }

    showImageSourcePicker() {
        // Remove existing picker if any
        const existing = document.getElementById('imageSourcePicker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.id = 'imageSourcePicker';
        picker.className = 'modal active';
        picker.innerHTML = `
            <div class="modal-content" style="max-width:300px;border-radius:16px;overflow:hidden;">
                <div style="padding:20px;text-align:center;">
                    <h4 style="margin:0 0 16px;font-size:1rem;color:#334155;">Add Image</h4>
                    <div style="display:flex;gap:12px;">
                        <button id="pickCamera" style="flex:1;padding:20px 12px;border:2px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;transition:all 0.2s;">
                            <i class="fas fa-camera" style="font-size:1.5rem;color:#3b82f6;"></i>
                            <span style="font-size:0.8rem;font-weight:600;color:#334155;">Camera</span>
                        </button>
                        <button id="pickGallery" style="flex:1;padding:20px 12px;border:2px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;transition:all 0.2s;">
                            <i class="fas fa-images" style="font-size:1.5rem;color:#8b5cf6;"></i>
                            <span style="font-size:0.8rem;font-weight:600;color:#334155;">Gallery</span>
                        </button>
                    </div>
                    <button style="margin-top:12px;padding:8px 20px;border:none;background:#f1f5f9;border-radius:8px;cursor:pointer;font-size:0.8rem;color:#64748b;" onclick="this.closest('.modal').remove()">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(picker);
        picker.addEventListener('click', (e) => { if (e.target === picker) picker.remove(); });

        picker.querySelector('#pickCamera').addEventListener('click', () => {
            picker.remove();
            document.getElementById('productCameraFile').click();
        });

        picker.querySelector('#pickGallery').addEventListener('click', () => {
            picker.remove();
            document.getElementById('productImageFile').click();
        });
    }

    showVariantImagePicker(row, imgPreview) {
        const existing = document.getElementById('imageSourcePicker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.id = 'imageSourcePicker';
        picker.className = 'modal active';
        picker.innerHTML = `
            <div class="modal-content" style="max-width:300px;border-radius:16px;overflow:hidden;">
                <div style="padding:20px;text-align:center;">
                    <h4 style="margin:0 0 16px;font-size:1rem;color:#334155;">Add Variant Image</h4>
                    <div style="display:flex;gap:12px;">
                        <button id="vpickCamera" style="flex:1;padding:20px 12px;border:2px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;">
                            <i class="fas fa-camera" style="font-size:1.5rem;color:#3b82f6;"></i>
                            <span style="font-size:0.8rem;font-weight:600;color:#334155;">Camera</span>
                        </button>
                        <button id="vpickGallery" style="flex:1;padding:20px 12px;border:2px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;">
                            <i class="fas fa-images" style="font-size:1.5rem;color:#8b5cf6;"></i>
                            <span style="font-size:0.8rem;font-weight:600;color:#334155;">Gallery</span>
                        </button>
                    </div>
                    <button style="margin-top:12px;padding:8px 20px;border:none;background:#f1f5f9;border-radius:8px;cursor:pointer;font-size:0.8rem;color:#64748b;" onclick="this.closest('.modal').remove()">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(picker);
        picker.addEventListener('click', (e) => { if (e.target === picker) picker.remove(); });

        const handleFile = (file) => {
            if (file && file.type.startsWith('image/')) {
                compressImage(file, 800, 0.7).then(compressed => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        imgPreview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
                        imgPreview.style.border = '2px solid #93c5fd';
                    };
                    reader.readAsDataURL(compressed);
                    row._variantFile = compressed;
                });
            }
        };

        picker.querySelector('#vpickCamera').addEventListener('click', () => {
            picker.remove();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'environment';
            input.onchange = (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
            input.click();
        });

        picker.querySelector('#vpickGallery').addEventListener('click', () => {
            picker.remove();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
            input.click();
        });
    }

    handlePhotoSelection(file) {
        if (!file.type.startsWith('image/')) {
            showNotification('Please select an image file', 'error');
            return;
        }

        if (this.productImages.length >= 5) {
            showNotification('Maximum 5 images allowed per product', 'warning');
            return;
        }

        // Compress image before storing
        compressImage(file, 800, 0.7).then(compressedFile => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.productImages.push({
                    file: compressedFile,
                    url: e.target.result
                });
                this.renderProductImagesGrid();
            };
            reader.readAsDataURL(compressedFile);
        });
    }

    renderProductImagesGrid() {
        const grid = document.getElementById('productImagesGrid');
        if (!grid) return;

        grid.innerHTML = '';

        // Render current images
        this.productImages.forEach((img, index) => {
            const slot = document.createElement('div');
            slot.className = 'image-slot';
            slot.innerHTML = `
                <img src="${img.url}" alt="Product image">
                <button type="button" class="remove-image" onclick="inventoryManager.removeProductImage(${index})">
                    <i class="fas fa-times"></i>
                </button>
                ${index === 0 ? '<span class="primary-badge">Primary</span>' : ''}
            `;
            grid.appendChild(slot);
        });

        // Render empty slots up to 5
        if (this.productImages.length < 5) {
            const emptySlot = document.createElement('div');
            emptySlot.className = 'image-slot empty';
            emptySlot.onclick = () => this.showImageSourcePicker();
            emptySlot.innerHTML = `<i class="fas fa-plus"></i>`;
            grid.appendChild(emptySlot);
        }
    }

    removeProductImage(index) {
        this.productImages.splice(index, 1);
        this.renderProductImagesGrid();
    }

    clearPhotos() {
        this.productImages = [];
        this.renderProductImagesGrid();
        const fileInput = document.getElementById('productImageFile');
        if (fileInput) fileInput.value = '';
    }

    async showEditProductModal(productId) {
        showLoading(true);

        try {
            const { data: product, error } = await supabaseClient
                .from('products')
                .select('*')
                .eq('id', productId)
                .single();

            if (error) throw error;

            // Populate form
            document.getElementById('modalTitle').textContent = 'Edit Product';
            document.getElementById('productId').value = product.id;
            document.getElementById('productName').value = product.product_name || '';
            document.getElementById('productSKU').value = product.sku || '';
            document.getElementById('productPriority').value = product.priority || 0;

            // Handle category - check if column exists
            let categoryValue = 'Other';
            if (product.category) {
                categoryValue = product.category;
            }
            document.getElementById('productCategory').value = categoryValue;
            this.updateProductTypes(categoryValue, product.type || '');

            document.getElementById('productStock').value = product.stock || 0;
            document.getElementById('costPrice').value = product.cost_price || '';
            document.getElementById('sellingPrice').value = product.selling_price || '';

            // Handle Multiple Images
            this.productImages = [];

            // Try product_images column first
            let imageList = product.product_images || [];
            if (typeof imageList === 'string') {
                try { imageList = JSON.parse(imageList); } catch (e) { imageList = []; }
            }

            // Fallback to metadata
            if (imageList.length === 0 && product.metadata && product.metadata.product_images) {
                imageList = product.metadata.product_images;
            }

            // Fallback to legacy single product_image
            if (imageList.length === 0 && product.product_image) {
                imageList = [product.product_image];
            }

            if (Array.isArray(imageList)) {
                this.productImages = imageList.map(url => ({ file: null, url: url }));
            }
            this.renderProductImagesGrid();

            if (product.description) {
                document.getElementById('productDescription').value = product.description;
            }

            document.getElementById('lowStockAlert').value = product.low_stock_alert || this.lowStockThreshold || 10;

            // Set show in store checkbox
            const showInStoreCheckbox = document.getElementById('showInStore');
            if (showInStoreCheckbox) {
                showInStoreCheckbox.checked = product.show_in_store !== false;
            }

            // Variant editing: Load variants from product_variants table
            this.resetVariants();
            const enableVariantsCheckbox = document.getElementById('enableVariants');
            const variantsSection = document.getElementById('variantsSection');
            const variantsList = document.getElementById('variantsList');

            if (enableVariantsCheckbox && variantsSection && variantsList) {
                // Show the variant section and allow editing
                enableVariantsCheckbox.parentElement.parentElement.style.display = '';
                enableVariantsCheckbox.disabled = false;

                // Load existing variants from database
                try {
                    const { data: existingVariants } = await supabaseClient
                        .from('product_variants')
                        .select('*')
                        .eq('product_id', product.id)
                        .order('created_at');

                    if (existingVariants && existingVariants.length > 0) {
                        enableVariantsCheckbox.checked = true;
                        variantsSection.style.display = 'block';

                        // Show existing variants with edit/delete capability
                        existingVariants.forEach(v => {
                            this.addVariantRowWithData(v);
                        });
                    }
                } catch (e) {
                    console.warn('Could not load variants:', e);
                }
            }

            // Reset manual SKU flag for editing
            this.isManualSku = true;

            // Render dynamic fields and populate them
            this.renderDynamicFields(product);

            // Show delete button for admin
            document.getElementById('deleteProductBtn').style.display =
                this.currentUser.role === 'shop_admin' ? 'block' : 'none';

            // Show modal
            document.getElementById('productModal').classList.add('active');

        } catch (error) {

            showNotification('Failed to load product details', 'error');
        } finally {
            showLoading(false);
        }
    }

    async saveProduct() {
        // Get form values
        const productId = document.getElementById('productId').value;
        const productName = document.getElementById('productName').value.trim();
        const sku = document.getElementById('productSKU').value.trim();
        const category = document.getElementById('productCategory').value.trim();
        const productType = document.getElementById('productType').value.trim();
        const stock = parseInt(document.getElementById('productStock').value) || 0;
        const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
        const sellingPrice = parseFloat(document.getElementById('sellingPrice').value) || 0;
        const description = document.getElementById('productDescription').value.trim();
        const lowStockAlert = parseInt(document.getElementById('lowStockAlert').value) || this.lowStockThreshold || 10;
        const priority = parseInt(document.getElementById('productPriority').value) || 0;
        const showInStore = document.getElementById('showInStore')?.checked !== false;

        // Get dynamic fields values
        const dynamicValues = this.getDynamicFieldValues();

        // Validate
        if (!productName || !sku) {
            showNotification('Product name and SKU are required', 'error');
            return;
        }

        if (costPrice < 0 || sellingPrice < 0 || stock < 0) {
            showNotification('Prices and stock cannot be negative', 'error');
            return;
        }

        // Check if variants are enabled (only for NEW products, not edits)
        const variantsEnabled = document.getElementById('enableVariants')?.checked && !productId;
        const variants = variantsEnabled ? this.getVariants() : [];

        if (variantsEnabled && variants.length === 0) {
            showNotification('Please add at least one variant or disable variants', 'error');
            return;
        }

        showLoading(true);

        try {
            // If variants enabled, save multiple products
            if (variantsEnabled && variants.length > 0) {
                console.log('[Save] Saving', variants.length, 'variants for:', productName);
                await this.saveProductWithVariants(productName, sku, category, productType, costPrice, sellingPrice, stock, description, lowStockAlert, priority, showInStore, dynamicValues, variants);
                return;
            }

            // Prepare product data (single product save)
            const productData = {
                shop_id: this.shopId,
                product_name: productName,
                sku: sku,
                stock: stock,
                cost_price: costPrice,
                selling_price: sellingPrice,
                updated_at: new Date().toISOString()
            };

            // Add optional fields only if they have values
            if (category && category !== '') {
                productData.category = category;
            }

            if (productType && productType !== '') {
                productData.type = productType;
            }

            if (description && description !== '') {
                productData.description = description;
            }

            // Store dynamic fields in metadata if column exists, or in description as JSON string block
            productData.metadata = dynamicValues;

            productData.low_stock_alert = lowStockAlert;
            productData.priority = priority;
            productData.show_in_store = showInStore;

            // Handle Multiple Image Uploads
            const finalImageUrls = [];
            for (const img of this.productImages) {
                if (img.file) {
                    try {
                        const fileExt = img.file.name.split('.').pop();
                        const fileName = `${this.shopId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

                        const { error: uploadError } = await supabaseClient
                            .storage
                            .from('products')
                            .upload(fileName, img.file);

                        if (uploadError) {
                            console.error('Upload error:', uploadError);
                            continue; // Skip failed uploads but keep going
                        }

                        const { data: { publicUrl } } = supabaseClient
                            .storage
                            .from('products')
                            .getPublicUrl(fileName);

                        finalImageUrls.push(publicUrl);
                    } catch (err) {
                        console.error('File upload exception:', err);
                    }
                } else if (img.url) {
                    finalImageUrls.push(img.url);
                }
            }

            if (finalImageUrls.length > 0) {
                productData.product_image = finalImageUrls[0]; // Primary image
                productData.product_images = finalImageUrls; // All images

                // Also store in metadata as fallback
                productData.metadata = {
                    ...(productData.metadata || {}),
                    product_images: finalImageUrls
                };
            } else {
                productData.product_image = null;
                productData.product_images = [];
            }

            let result;

            if (productId) {
                // Update existing product
                const { data, error } = await supabaseClient
                    .from('products')
                    .update(productData)
                    .eq('id', productId)
                    .select()
                    .single();

                if (error) {
                    // Handle missing columns
                    if (error.message.includes('column "category" does not exist') ||
                        error.message.includes('column "type" does not exist') ||
                        error.message.includes('column "product_image" does not exist') ||
                        error.message.includes('column "product_images" does not exist')) {

                        // Remove problematic columns and try again
                        if (error.message.includes('column "category"')) delete productData.category;
                        if (error.message.includes('column "type"')) delete productData.type;
                        if (error.message.includes('column "product_image"')) delete productData.product_image;
                        if (error.message.includes('column "product_images"')) delete productData.product_images;
                        if (error.message.includes('column "metadata"')) {
                            // If metadata column missing, append to description
                            if (Object.keys(dynamicValues).length > 0) {
                                productData.description = (productData.description || '') +
                                    '\n--SPECIFICATIONS--\n' + JSON.stringify(dynamicValues);
                            }
                            delete productData.metadata;
                        }

                        const { data: updatedData, error: updateError } = await supabaseClient
                            .from('products')
                            .update(productData)
                            .eq('id', productId)
                            .select()
                            .single();

                        if (updateError) throw updateError;
                        result = updatedData;
                    } else {
                        throw error;
                    }
                } else {
                    result = data;
                }

                showNotification('Product updated successfully', 'success');

                // Save/update variants if variant section is active
                const variantsChecked = document.getElementById('enableVariants')?.checked;
                if (variantsChecked) {
                    await this.saveVariantsForProduct(productId);
                }

                // Audit Log
                if (window.authManager) {
                    await window.authManager.createAuditLog('update', 'products', productId, null, {
                        product_name: productName,
                        sku: sku,
                        stock: stock,
                        selling_price: sellingPrice
                    });
                }
            } else {
                // Add new product
                const { data, error } = await supabaseClient
                    .from('products')
                    .insert([productData])
                    .select()
                    .single();

                if (error) {
                    // Handle missing columns or duplicate SKU
                    if (error.message.includes('column "category" does not exist') ||
                        error.message.includes('column "type" does not exist') ||
                        error.message.includes('column "product_image" does not exist') ||
                        error.message.includes('column "product_images" does not exist')) {

                        // Remove problematic columns and try again
                        if (error.message.includes('column "category"')) delete productData.category;
                        if (error.message.includes('column "type"')) delete productData.type;
                        if (error.message.includes('column "product_image"')) delete productData.product_image;
                        if (error.message.includes('column "product_images"')) delete productData.product_images;
                        if (error.message.includes('column "metadata"')) {
                            // If metadata column missing, append to description
                            if (Object.keys(dynamicValues).length > 0) {
                                productData.description = (productData.description || '') +
                                    '\n--SPECIFICATIONS--\n' + JSON.stringify(dynamicValues);
                            }
                            delete productData.metadata;
                        }

                        const { data: newData, error: insertError } = await supabaseClient
                            .from('products')
                            .insert([productData])
                            .select()
                            .single();

                        if (insertError) {
                            if (insertError.code === '23505') { // Unique constraint violation
                                throw new Error('SKU already exists');
                            }
                            throw insertError;
                        }
                        result = newData;
                    } else if (error.code === '23505') { // Unique constraint violation
                        throw new Error('SKU already exists');
                    } else {
                        throw error;
                    }
                } else {
                    result = data;
                }

                showNotification('Product added successfully', 'success');

                // Audit Log
                if (window.authManager) {
                    await window.authManager.createAuditLog('create', 'products', result?.id, null, {
                        product_name: productName,
                        sku: sku,
                        stock: stock,
                        selling_price: sellingPrice
                    });
                }
            }

            // Close modal and refresh
            this.closeAllModals();
            await this.loadInventory();

        } catch (error) {

            showNotification('Failed to save product: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteProduct() {
        const productId = document.getElementById('productId').value;

        if (!productId) return;

        if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            return;
        }

        showLoading(true);

        try {
            // Check if product has sales
            const { data: sales, error: salesError } = await supabaseClient
                .from('sale_items')
                .select('id')
                .eq('product_id', productId)
                .limit(1);

            if (salesError) throw salesError;

            if (sales && sales.length > 0) {
                showNotification('Cannot delete product with sales history. You can set stock to 0 instead.', 'error');
                return;
            }

            // Delete product
            const { error } = await supabaseClient
                .from('products')
                .delete()
                .eq('id', productId);

            if (error) throw error;

            showNotification('Product deleted successfully', 'success');

            // Audit Log
            if (window.authManager) {
                await window.authManager.createAuditLog('delete', 'products', productId, null, { product_id: productId });
            }

            // Close modal and refresh sli
            this.closeAllModals();
            await this.loadInventory();

        } catch (error) {

            showNotification('Failed to delete product', 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteProductById(productId) {
        if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            return;
        }

        showLoading(true);

        try {
            // Check if product has sales
            const { data: sales, error: salesError } = await supabaseClient
                .from('sale_items')
                .select('id')
                .eq('product_id', productId)
                .limit(1);

            if (salesError) throw salesError;

            if (sales && sales.length > 0) {
                showNotification('Cannot delete product with sales history. You can set stock to 0 instead.', 'error');
                return;
            }

            // Delete product
            const { error } = await supabaseClient
                .from('products')
                .delete()
                .eq('id', productId);

            if (error) throw error;

            showNotification('Product deleted successfully', 'success');

            // Audit Log
            if (window.authManager) {
                await window.authManager.createAuditLog('delete', 'products', productId, null, { product_id: productId });
            }

            // Refresh inventory
            await this.loadInventory();

        } catch (error) {

            showNotification('Failed to delete product', 'error');
        } finally {
            showLoading(false);
        }
    }

    generateSKU(force = false) {
        const name = document.getElementById('productName').value.trim();
        const skuInput = document.getElementById('productSKU');

        if (!name && !force) return;

        // Smart Algorithm for accurate 5-6 char SKU
        const words = name.split(/\s+/).filter(w => w.length > 0);
        let prefix = '';
        let suffix = '';

        if (words.length > 0) {
            // Take 3 chars from first word, preferring consonants
            const first = words[0].replace(/[aeiou]/ig, '');
            prefix = (first.length >= 3 ? first : words[0]).substring(0, 3);
        }

        // Try to find numbers (size etc)
        const digits = name.match(/\d+/);
        if (digits) {
            suffix = digits[0].substring(0, 2);
        }

        // Add first letter of last word if available
        let lastChar = '';
        if (words.length > 1) {
            lastChar = words[words.length - 1].charAt(0);
        }

        let baseSku = (prefix + suffix + lastChar).toUpperCase().substring(0, 6);

        // Padding if too short
        if (baseSku.length < 4) {
            const extra = Math.random().toString(36).substring(2, 6 - baseSku.length).toUpperCase();
            baseSku += extra;
        }

        // If 'force' (refresh button clicked), always make it different by adding random at end or changing padding
        if (force) {
            const randomChar = Math.random().toString(36).substring(2, 3).toUpperCase();
            if (baseSku.length >= 6) {
                baseSku = baseSku.substring(0, 5) + randomChar;
            } else {
                baseSku += randomChar;
            }
        }

        skuInput.value = baseSku.substring(0, 6);
    }

    filterProducts(searchTerm) {
        this.filterProductsCombined();
    }

    filterByStock(filterType) {
        this.filterProductsCombined();
    }

    filterByCategory(category) {
        this.handleCategoryChange(category);
    }

    loadTypes(category) {
        const typeFilter = document.getElementById('typeFilter');
        if (!typeFilter) return;

        if (!category) {
            // No category selected: show all types relevant to business type
            this.populateTypeFilter();
            return;
        }

        // Get configured types from system_configs for this category
        const standardizedCategory = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        let configuredTypes = this.typeConfigs[category] || this.typeConfigs[standardizedCategory] || [];

        // If no types found for this category, try the business type category
        if (configuredTypes.length === 0 && this.businessType && this.businessType !== 'general') {
            const bizTypeStd = this.businessType.charAt(0).toUpperCase() + this.businessType.slice(1).toLowerCase();
            configuredTypes = this.typeConfigs[this.businessType] || this.typeConfigs[bizTypeStd] || [];
        }

        // Also get unique types from actual products in this category
        const productTypes = new Set();
        this.products.forEach(p => {
            if (p.category === category && p.type) {
                productTypes.add(p.type);
            }
        });

        // Merge configured + product types
        const allTypes = new Set([...configuredTypes, ...productTypes]);

        if (allTypes.size === 0) {
            typeFilter.style.display = 'none';
            typeFilter.value = '';
            return;
        }

        typeFilter.innerHTML = '<option value="">All Types</option>';
        Array.from(allTypes).sort().forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            opt.textContent = type;
            typeFilter.appendChild(opt);
        });

        typeFilter.style.display = 'inline-block';
    }

    handleCategoryChange(category) {
        this.loadTypes(category);
        this.filterProductsCombined();
    }

    filterProductsCombined() {
        const searchTerm = document.getElementById('inventorySearch')?.value.toLowerCase() || '';
        const stockFilter = document.getElementById('stockFilter')?.value || 'all';
        const categoryFilter = document.getElementById('categoryFilter')?.value || '';
        const typeFilter = document.getElementById('typeFilter')?.value || '';

        const filtered = this.products.filter(product => {
            // Search match
            const matchesSearch = !searchTerm ||
                product.product_name.toLowerCase().includes(searchTerm) ||
                product.sku.toLowerCase().includes(searchTerm) ||
                (product.description && product.description.toLowerCase().includes(searchTerm));

            // Stock match
            let matchesStock = true;
            if (stockFilter === 'low') matchesStock = product.stock > 0 && product.stock < this.lowStockThreshold;
            else if (stockFilter === 'out') matchesStock = product.stock < 1;
            else if (stockFilter === 'in') matchesStock = product.stock >= this.lowStockThreshold;

            // Category match
            const matchesCategory = !categoryFilter || product.category === categoryFilter;

            // Type match
            const matchesType = !typeFilter || product.type === typeFilter;

            return matchesSearch && matchesStock && matchesCategory && matchesType;
        });

        this.inventoryPage = 1;
        this.renderFilteredProducts(filtered);
    }

    renderFilteredProducts(filteredProducts) {
        const tableBody = document.getElementById('inventoryTable');
        if (!tableBody) return;

        if (filteredProducts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-search fa-2x"></i>
                            <p>No products found</p>
                            <small>Try a different filter</small>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filteredProducts.map(product => {
            const profitMargin = product.cost_price && product.selling_price ?
                ((product.selling_price - product.cost_price) / product.cost_price * 100).toFixed(1) : '0.0';

            let status = 'success';
            let statusText = `In Stock (${product.stock})`;

            if (product.stock < 1) {
                status = 'danger';
                statusText = 'Out of Stock';
            } else if (product.stock < this.lowStockThreshold) {
                status = 'warning';
                statusText = `Low Stock (${product.stock})`;
            }

            // Get category
            let category = 'Uncategorized';
            if (typeof product.category === 'string') {
                category = product.category;
            } else if (product.category && product.category.category_name) {
                category = product.category.category_name;
            }

            return `
                <tr class="${this.selectedProducts.has(product.id) ? 'selected-row' : ''}">
                    <td>
                        <input type="checkbox" class="product-checkbox" data-id="${product.id}" 
                               ${this.selectedProducts.has(product.id) ? 'checked' : ''}>
                    </td>
                    <td>
                        <div class="product-info-wrapper">
                            <img src="${product.product_image || this.shopLogo || 'https://via.placeholder.com/150?text=No+Image'}" 
                                 class="product-img-inventory" 
                                 alt="${product.product_name}">
                            <div class="product-info">
                                <strong>${product.product_name}</strong>
                                ${product.description ? `<small>${product.description.substring(0, 50)}...</small>` : ''}
                            </div>
                        </div>
                    </td>
                    <td>${product.sku}</td>
                    <td>${category}</td>
                    <td>${product.type || 'N/A'}</td>
                    <td>
                        <span class="stock-badge ${status}">
                            ${product.stock}
                        </span>
                    </td>
                    <td>${formatCurrency(product.cost_price || 0)}</td>
                    <td>${formatCurrency(product.selling_price || 0)}</td>
                    <td>
                        <span class="profit-badge ${parseFloat(profitMargin) > 0 ? 'positive' : 'negative'}">
                            ${profitMargin}%
                        </span>
                    </td>
                    <td>
                        <span class="status-badge ${status}">
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary edit-product-btn" data-id="${product.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${this.currentUser.role === 'shop_admin' ? `
                            <button class="btn btn-sm btn-danger delete-product-btn" data-id="${product.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Re-bind row checkbox events
        this.bindRowCheckboxes();
    }

    async exportInventory() {
        showLoading(true);

        try {
            // Get all products with details
            const { data: products, error } = await supabaseClient
                .from('products')
                .select('*')
                .eq('shop_id', this.shopId)
                .order('product_name');

            if (error) throw error;

            // Create CSV content
            let csv = 'Product Name,SKU,Category,Stock,Cost Price,Selling Price,Profit Margin,Status\n';

            products.forEach(product => {
                const profitMargin = product.cost_price && product.selling_price ?
                    ((product.selling_price - product.cost_price) / product.cost_price * 100).toFixed(2) : '0.00';

                let status = 'In Stock';
                if (product.stock < 1) {
                    status = 'Out of Stock';
                } else if (product.stock < this.lowStockThreshold) {
                    status = 'Low Stock';
                }

                // Get category
                let category = 'Uncategorized';
                if (typeof product.category === 'string') {
                    category = product.category;
                }

                csv += `"${product.product_name}","${product.sku}","${category}",${product.stock},${product.cost_price || 0},${product.selling_price || 0},${profitMargin}%,"${status}"\n`;
            });

            // Create download link
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inventory_${this.shopId}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification('Inventory exported successfully', 'success');

        } catch (error) {

            showNotification('Failed to export inventory', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadBusinessType() {
        try {
            // Priority 1: Check shops table (Source of Truth set by Super Admin)
            const { data: shopData, error: shopError } = await supabaseClient
                .from('shops')
                .select('business_type')
                .eq('id', this.shopId)
                .maybeSingle();

            if (shopData && shopData.business_type) {
                this.businessType = shopData.business_type;
            } else {
                // Priority 2: Check shop_settings (Fallback)
                const { data: settingsData, error: settingsError } = await supabaseClient
                    .from('shop_settings')
                    .select('business_type')
                    .eq('shop_id', this.shopId)
                    .maybeSingle();

                if (settingsData && settingsData.business_type) {
                    this.businessType = settingsData.business_type;
                }
            }

            // Populate the Type Filter dropdown with types relevant to the business type
            this.populateTypeFilter();

        } catch (error) {
            console.error('Error loading business type:', error);
        }
    }

    populateTypeFilter() {
        const typeFilter = document.getElementById('typeFilter');
        if (!typeFilter) return;

        // Clear existing options except the first one
        while (typeFilter.options.length > 1) {
            typeFilter.remove(1);
        }

        // If shop has a specific business type, show types configured for it
        if (this.businessType && this.businessType !== 'general') {
            const bizTypeStd = this.businessType.charAt(0).toUpperCase() + this.businessType.slice(1).toLowerCase();
            const types = this.typeConfigs[this.businessType] || this.typeConfigs[bizTypeStd] || [];

            types.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                typeFilter.appendChild(option);
            });
        } else {
            // General store: collect all unique types from all configs
            const allTypes = new Set();
            Object.values(this.typeConfigs).forEach(types => {
                types.forEach(t => allTypes.add(t));
            });

            // Also add types from loaded products
            this.products.forEach(p => {
                if (p.type) allTypes.add(p.type);
            });

            Array.from(allTypes).sort().forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                typeFilter.appendChild(option);
            });
        }
    }

    renderDynamicFields(product = null) {
        const container = document.getElementById('dynamicFields');
        if (!container) return;

        container.innerHTML = '';
        let fields = [];

        // Get current category from form
        const categoryElem = document.getElementById('productCategory');
        const selectedCategory = categoryElem ? categoryElem.value : null;

        // Try to parse existing values from product
        let values = {};
        if (product) {
            if (product.metadata) {
                values = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : product.metadata;
            } else if (product.description && product.description.includes('--SPECIFICATIONS--')) {
                try {
                    const parts = product.description.split('--SPECIFICATIONS--');
                    values = JSON.parse(parts[1].trim());
                } catch (e) { console.error('Failed to parse specifications from description', e); }
            }
        }

        // Priority 1: Use custom metadata fields from system_configs (loaded into this.metadataConfigs)
        if (selectedCategory && this.metadataConfigs && this.metadataConfigs[selectedCategory]) {
            fields = this.metadataConfigs[selectedCategory];
        } else {
            // Priority 2: Fallback to hardcoded businessType-based fields (Legacy support)
            switch (this.businessType) {
                case 'restaurant':
                    fields = [
                        { id: 'dietary', label: 'Dietary Type', type: 'select', options: ['Veg', 'Non-Veg', 'Vegan', 'Eggitarian'] },
                        { id: 'prepTime', label: 'Preparation Time (mins)', type: 'number' }
                    ];
                    break;
                case 'medicine':
                    fields = [
                        { id: 'expiryDate', label: 'Expiry Date', type: 'date' },
                        { id: 'batchNo', label: 'Batch Number', type: 'text' },
                        { id: 'dosageForm', label: 'Dosage Form', type: 'select', options: ['Tablet', 'Syrup', 'Capsule', 'Injection', 'Ointment'] }
                    ];
                    break;
                case 'grocery':
                    fields = [
                        { id: 'unit', label: 'Unit', type: 'select', options: ['kg', 'gm', 'ltr', 'ml', 'unit', 'packet'] },
                        { id: 'weight', label: 'Weight/Volume', type: 'number' }
                    ];
                    break;
                case 'cloth':
                    fields = [
                        { id: 'size', label: 'Size', type: 'select', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'] },
                        { id: 'color', label: 'Color', type: 'text' },
                        { id: 'material', label: 'Material', type: 'text' }
                    ];
                    break;
                case 'footwear':
                    fields = [
                        { id: 'size', label: 'Size (EU/UK)', type: 'text' },
                        { id: 'color', label: 'Color', type: 'text' },
                        { id: 'material', label: 'Material', type: 'text' }
                    ];
                    break;
                case 'cosmetics':
                    fields = [
                        { id: 'skinType', label: 'Skin Type', type: 'select', options: ['All', 'Oily', 'Dry', 'Combination', 'Sensitive'] },
                        { id: 'volume', label: 'Volume/Weight', type: 'text' }
                    ];
                    break;
                case 'electronics':
                    fields = [
                        { id: 'brand', label: 'Brand', type: 'text' },
                        { id: 'warranty', label: 'Warranty', type: 'text' },
                        { id: 'model', label: 'Model Name', type: 'text' }
                    ];
                    break;
                case 'furniture':
                    fields = [
                        { id: 'material', label: 'Material', type: 'text' },
                        { id: 'dimensions', label: 'Dimensions', type: 'text' }
                    ];
                    break;
                case 'home_appliances':
                    fields = [
                        { id: 'power', label: 'Power Rating', type: 'text' },
                        { id: 'warranty', label: 'Warranty Period', type: 'text' }
                    ];
                    break;
                case 'toys':
                    fields = [
                        { id: 'ageGroup', label: 'Age Group', type: 'select', options: ['0-3 Years', '3-6 Years', '6-12 Years', '12+ Years'] },
                        { id: 'material', label: 'Material', type: 'text' }
                    ];
                    break;
                case 'pet_supplies':
                    fields = [
                        { id: 'lifeStage', label: 'Life Stage', type: 'select', options: ['Junior', 'Adult', 'Senior'] },
                        { id: 'flavor', label: 'Flavor', type: 'text' }
                    ];
                    break;
                case 'jewellery':
                    fields = [
                        { id: 'purity', label: 'Purity/Karat', type: 'text' },
                        { id: 'material', label: 'Primary Material', type: 'text' }
                    ];
                    break;
            }
        }

        if (fields.length > 0) {
            let row;
            fields.forEach((field, index) => {
                // Start a new row every 2 fields
                if (index % 2 === 0) {
                    row = document.createElement('div');
                    row.className = 'form-row';
                    container.appendChild(row);
                }

                const group = document.createElement('div');
                group.className = 'form-group';

                const label = document.createElement('label');

                // Add appropriate icon based on label/type
                let iconClass = 'fas fa-info-circle';
                const labelLower = field.label.toLowerCase();
                if (labelLower.includes('date') || labelLower.includes('expiry')) iconClass = 'fas fa-calendar-alt';
                else if (labelLower.includes('time')) iconClass = 'fas fa-clock';
                else if (labelLower.includes('weight') || labelLower.includes('unit') || labelLower.includes('volume')) iconClass = 'fas fa-weight';
                else if (labelLower.includes('size')) iconClass = 'fas fa-tag';
                else if (labelLower.includes('material')) iconClass = 'fas fa-layer-group';
                else if (labelLower.includes('color')) iconClass = 'fas fa-palette';
                else if (labelLower.includes('brand')) iconClass = 'fas fa-trademark';
                else if (labelLower.includes('warranty') || labelLower.includes('expiry')) iconClass = 'fas fa-shield-alt';
                else if (labelLower.includes('veg')) iconClass = 'fas fa-leaf';

                label.innerHTML = `<i class="${iconClass}"></i> ${field.label}`;
                group.appendChild(label);

                let input;
                if (field.type === 'select') {
                    input = document.createElement('select');
                    // Add empty/placeholder option
                    const placeholder = document.createElement('option');
                    placeholder.value = '';
                    placeholder.textContent = `-- Select ${field.label} --`;
                    input.appendChild(placeholder);

                    const options = Array.isArray(field.options) ? field.options : [];
                    options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt;
                        input.appendChild(option);
                    });
                } else {
                    input = document.createElement('input');
                    input.type = field.type;
                    input.placeholder = `Enter ${field.label}`;
                }
                input.id = 'dyn_' + (field.id || field.label.toLowerCase().replace(/\s+/g, '_'));
                input.className = 'dynamic-field-input';
                if (values[field.id || field.label.toLowerCase().replace(/\s+/g, '_')]) {
                    input.value = values[field.id || field.label.toLowerCase().replace(/\s+/g, '_')];
                }
                group.appendChild(input);
                row.appendChild(group);
            });
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    getDynamicFieldValues() {
        const values = {};
        document.querySelectorAll('.dynamic-field-input').forEach(input => {
            const id = input.id.replace('dyn_', '');
            values[id] = input.value;
        });
        return values;
    }

    async startCamera() {
        const modal = document.getElementById('cameraModal');
        const video = document.getElementById('cameraVideo');
        if (!modal || !video) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.cameraFacingMode || 'environment' },
                audio: false
            });
            video.srcObject = stream;
            this.cameraStream = stream;
            modal.classList.add('active');
        } catch (err) {
            console.error('Camera access error:', err);
            showNotification('Could not access camera. Please check permissions.', 'error');
            // Fallback: trigger file input with capture
            document.getElementById('productImageFile').click();
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        const video = document.getElementById('cameraVideo');
        if (video) video.srcObject = null;
    }

    switchCamera() {
        this.cameraFacingMode = this.cameraFacingMode === 'user' ? 'environment' : 'user';
        this.stopCamera();
        this.startCamera();
    }

    takePicture() {
        const video = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');
        if (!video || !canvas) return;

        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            const file = new File([blob], `captured_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            this.handlePhotoSelection(file);
            this.closeAllModals();
        }, 'image/jpeg', 0.8);
    }

    closeAllModals() {
        this.stopCamera();
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
}

// Initialize on inventory page
if (window.location.pathname.includes('inventory.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        window.inventoryManager = new InventoryManager();
    });
}
