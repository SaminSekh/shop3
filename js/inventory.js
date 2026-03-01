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
                    productImageFile.value = ''; // Reset for next selection
                }
            });
        }

        // Category change (for dependent Type dropdown)
        if (productCategory) {
            productCategory.addEventListener('change', (e) => {
                this.updateProductTypes(e.target.value);
                this.renderDynamicFields();
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
            // Try to load categories from database (Global + Shop Specific)
            const { data: categories, error } = await supabaseClient
                .from('categories')
                .select('*')
                .or(`shop_id.eq.${this.shopId},shop_id.is.null`)
                .order('category_name');

            if (error) {
                // If categories table doesn't exist, use default categories

                this.categories = this.getDefaultCategories();
            } else {
                this.categories = categories || [];

                // Ensure "Other" is always at the top
                this.categories = this.categories.filter(c => (c.category_name || c) !== 'Other');
                this.categories.unshift({ category_name: 'Other' });

                // If no categories exist, add defaults
                if (this.categories.length === 0) {
                    this.categories = this.getDefaultCategories();
                }
            }

            this.populateCategoryFilter();

        } catch (error) {

            // Use default categories on error
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
            const isGlobal = !category.shop_id;

            // 1. Add to Filter (always show all categories)
            const option1 = document.createElement('option');
            option1.value = categoryName;
            option1.textContent = categoryName;
            categoryFilter.appendChild(option1);

            // 2. Add to Product Modal (filtered by Business Type)
            const isOther = categoryName === 'Other' || categoryName === 'Uncategorized';
            const matchesBusinessType = this.businessType && categoryName.toLowerCase() === this.businessType.toLowerCase();

            // Logic: strict filtering
            // 1. If shop is 'general', show everything (including Global, Shop-Specific, Other)
            // 2. If shop has specific type (e.g. 'Restaurant'):
            //    - Show ONLY categories matching that type (Global or Shop-Specific)
            //    - Show Shop-Specific categories (regardless of name)
            //    - DO NOT show 'Other' or 'Uncategorized' automatically

            let shouldShow = false;

            if (this.businessType === 'general' || !this.businessType) {
                shouldShow = true;
            } else {
                // Specific Business Type (e.g. 'Restaurant')
                const isShopSpecific = !!category.shop_id;

                if (isShopSpecific) {
                    shouldShow = true; // Always show custom categories created by this shop
                } else if (matchesBusinessType) {
                    shouldShow = true; // Show global category matching the type
                }
            }

            if (shouldShow) {
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

        // ONLY use database configurations (this.typeConfigs)
        // If nothing is defined, we default to only 'Other'
        const types = this.typeConfigs[standardizedCategory] || this.typeConfigs[category] || [];

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
            return;
        }

        const productRows = this.products.map(product => {
            const profitMargin = product.cost_price && product.selling_price ?
                ((product.selling_price - product.cost_price) / product.cost_price * 100).toFixed(1) : '0.0';

            let status = 'success';
            let statusText = `In Stock (${product.stock})`;

            if (product.stock < 1) {
                status = 'danger';
                statusText = 'Out of Stock';
            } else if (product.stock < 10) {
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

        // Update the table
        tableBody.innerHTML = productRows;

        // Re-bind row checkbox events
        this.bindRowCheckboxes();
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
                const matchesBusinessType = this.businessType && name.toLowerCase() === this.businessType.toLowerCase();

                let shouldShow = false;

                if (this.businessType === 'general' || !this.businessType) {
                    shouldShow = true;
                } else {
                    // Specific Business Type (e.g. 'Restaurant')
                    const isShopSpecific = !!cat.shop_id;

                    if (isShopSpecific) {
                        shouldShow = true; // Always show custom categories created by this shop
                    } else if (matchesBusinessType) {
                        shouldShow = true; // Show global category matching the type
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
        const lowStockCount = this.products.filter(p => p.stock > 0 && p.stock < 10).length;
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
        document.getElementById('lowStockAlert').value = '10';

        // Default category
        let defaultCategory = 'Other';
        if (this.businessType && this.businessType !== 'general') {
            // Try to match business type to available options
            const options = Array.from(document.getElementById('productCategory').options).map(o => o.value);
            const match = options.find(opt => opt.toLowerCase() === this.businessType.toLowerCase());
            if (match) {
                defaultCategory = match;
            }
        }

        document.getElementById('productCategory').value = defaultCategory;
        document.getElementById('productPriority').value = 0;
        this.updateProductTypes(defaultCategory);

        // Render dynamic fields
        this.renderDynamicFields();

        this.generateSKU();

        // Reset photos
        this.clearPhotos();
        this.isManualSku = false;

        // Show modal
        document.getElementById('productModal').classList.add('active');
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

        const reader = new FileReader();
        reader.onload = (e) => {
            this.productImages.push({
                file: file,
                url: e.target.result
            });
            this.renderProductImagesGrid();
        };
        reader.readAsDataURL(file);
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
            emptySlot.onclick = () => document.getElementById('productImageFile').click();
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

            document.getElementById('lowStockAlert').value = product.low_stock_alert || 10;

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
        const lowStockAlert = parseInt(document.getElementById('lowStockAlert').value) || 10;
        const priority = parseInt(document.getElementById('productPriority').value) || 0;

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

        showLoading(true);

        try {
            // Prepare product data
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
            typeFilter.style.display = 'none';
            typeFilter.value = '';
            return;
        }

        // Get unique types for this category from current products
        const types = new Set();
        this.products.forEach(p => {
            if (p.category === category && p.type) {
                types.add(p.type);
            }
        });

        if (types.size === 0) {
            typeFilter.style.display = 'none';
            typeFilter.value = '';
            return;
        }

        typeFilter.innerHTML = '<option value="">All Types</option>';
        Array.from(types).sort().forEach(type => {
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
            if (stockFilter === 'low') matchesStock = product.stock > 0 && product.stock < 10;
            else if (stockFilter === 'out') matchesStock = product.stock < 1;
            else if (stockFilter === 'in') matchesStock = product.stock >= 10;

            // Category match
            const matchesCategory = !categoryFilter || product.category === categoryFilter;

            // Type match
            const matchesType = !typeFilter || product.type === typeFilter;

            return matchesSearch && matchesStock && matchesCategory && matchesType;
        });

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
            } else if (product.stock < 10) {
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
                } else if (product.stock < 10) {
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
            // Priority 1: Check shops table (Source of Truth for Super Admin)
            const { data: shopData, error: shopError } = await supabaseClient
                .from('shops')
                .select('business_type')
                .eq('id', this.shopId)
                .maybeSingle();

            if (shopData && shopData.business_type) {
                this.businessType = shopData.business_type;
                return;
            }

            // Priority 2: Check shop_settings (Fallback)
            const { data: settingsData, error: settingsError } = await supabaseClient
                .from('shop_settings')
                .select('business_type')
                .eq('shop_id', this.shopId)
                .maybeSingle();

            if (settingsData && settingsData.business_type) {
                this.businessType = settingsData.business_type;
            }
        } catch (error) {
            console.error('Error loading business type:', error);
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
