// Payment Management System - Super Admin
class PaymentManager {
    constructor() {
        this.currentUser = null;
        this.subscriptions = [];
        this.transactions = [];
        this.notifications = [];
        this.shops = [];
        this.paymentSettings = null;
        this.currentTab = 'subscriptions';
    }

    async init() {
        try {
            // Wait for authManager to be ready
            if (!window.authManager) {
                setTimeout(() => this.init(), 100);
                return;
            }

            // Get current user from authManager
            const user = authManager.getCurrentUser();

            if (!user) {
                showNotification('Please log in first', 'error');
                window.location.href = 'index.html';
                return;
            }

            if (user.role !== 'super_admin') {
                showNotification('Access denied. Super admin only.', 'error');
                window.location.href = 'dashboard.html';
                return;
            }

            this.currentUser = user;
            this.setupEventListeners();
            await this.loadInitialData();
        } catch (error) {
            console.error('Initialization error:', error);
            showNotification('Failed to initialize payment manager', 'error');
        }
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.payment-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Subscriptions
        document.getElementById('addSubscriptionBtn')?.addEventListener('click', () => this.showAddSubscriptionModal());
        document.getElementById('saveSubscriptionBtn')?.addEventListener('click', () => this.saveSubscription());
        document.getElementById('refreshSubscriptions')?.addEventListener('click', () => this.loadSubscriptions());
        document.getElementById('subscriptionSearch')?.addEventListener('input', (e) => this.filterSubscriptions(e.target.value));
        document.getElementById('statusFilter')?.addEventListener('change', () => this.loadSubscriptions());

        // Transactions
        document.getElementById('recordPaymentBtn')?.addEventListener('click', () => this.showRecordPaymentModal());
        document.getElementById('savePaymentBtn')?.addEventListener('click', () => this.recordPayment());
        document.getElementById('exportTransactionsBtn')?.addEventListener('click', () => this.exportTransactions());
        document.getElementById('transactionSearch')?.addEventListener('input', (e) => this.filterTransactions(e.target.value));

        // Payment Settings
        document.getElementById('savePaymentSettingsBtn')?.addEventListener('click', () => this.savePaymentSettings());
        document.getElementById('uploadQrBtn')?.addEventListener('click', () => this.uploadQRCode());
        document.getElementById('uploadUsdtQrBtn')?.addEventListener('click', () => this.uploadUsdtQRCode());

        // Notifications
        document.getElementById('sendNotificationBtn')?.addEventListener('click', () => this.showSendNotificationModal());
        document.getElementById('sendNotificationSubmitBtn')?.addEventListener('click', () => this.sendNotification());

        // Notification preview
        document.getElementById('notificationTitle')?.addEventListener('input', (e) => {
            document.getElementById('previewTitle').textContent = e.target.value || 'Notification Title';
        });
        document.getElementById('notificationMessage')?.addEventListener('input', (e) => {
            document.getElementById('previewMessage').textContent = e.target.value || 'Notification message will appear here...';
        });

        // Modal close handlers
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => this.closeModals());
        });

        // Close modal on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModals();
            });
        });
    }

    async loadInitialData() {
        showLoading(true);
        try {
            await Promise.all([
                this.loadShops(),
                this.loadSubscriptions(),
                this.loadTransactions(),
                this.loadPaymentSettings(),
                this.loadNotifications()
            ]);
            this.updateStatistics();
        } catch (error) {
            console.error('Error loading initial data:', error);
            showNotification('Failed to load data', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadShops() {
        try {
            const { data, error } = await supabaseClient
                .from('shops')
                .select('*')
                .order('shop_name');

            if (error) throw error;
            this.shops = data || [];

            // Populate shop dropdowns
            this.populateShopDropdowns();
        } catch (error) {
            console.error('Error loading shops:', error);
        }
    }

    populateShopDropdowns() {
        const dropdowns = [
            'subscriptionShopId',
            'paymentShopId',
            'notificationShopId',
            'notificationShopFilter'
        ];

        dropdowns.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            const currentValue = select.value;
            const isFilter = id.includes('Filter');

            select.innerHTML = isFilter ? '<option value="all">All Shops</option>' : '<option value="">-- Select Shop --</option>';

            if (id === 'notificationShopId') {
                select.innerHTML += '<option value="all">All Shops</option>';
            }

            this.shops.forEach(shop => {
                const option = document.createElement('option');
                option.value = shop.id;
                option.textContent = shop.shop_name;
                select.appendChild(option);
            });

            if (currentValue) select.value = currentValue;
        });
    }

    async loadSubscriptions() {
        try {
            const statusFilter = document.getElementById('statusFilter')?.value || 'all';
            let query = supabaseClient
                .from('shop_subscriptions')
                .select(`
                    *,
                    shops (
                        id,
                        shop_name
                    )
                `)
                .order('created_at', { ascending: false });

            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            const { data, error } = await query;
            if (error) throw error;

            this.subscriptions = data || [];
            this.renderSubscriptions();
        } catch (error) {
            console.error('Error loading subscriptions:', error);
            showNotification('Failed to load subscriptions', 'error');
        }
    }

    renderSubscriptions() {
        const container = document.getElementById('subscriptionsList');
        if (!container) return;

        if (this.subscriptions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-receipt fa-3x" style="color: #cbd5e1; margin-bottom: 15px;"></i>
                    <p>No subscriptions found</p>
                    <button class="btn btn-primary btn-action" onclick="paymentManager.showAddSubscriptionModal()">
                        <i class="fas fa-plus"></i> Add First Subscription
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.subscriptions.map(sub => this.renderSubscriptionCard(sub)).join('');
        this.attachSubscriptionEventListeners();
    }

    renderSubscriptionCard(sub) {
        const shop = sub.shops;
        const statusClass = `status-${sub.status}`;
        const dueAmount = this.calculateDueAmount(sub);
        const nextPayment = sub.next_payment_date ? new Date(sub.next_payment_date).toLocaleDateString() : 'N/A';
        const lastPayment = sub.last_payment_date ? new Date(sub.last_payment_date).toLocaleDateString() : 'Never';

        return `
            <div class="subscription-card" data-subscription-id="${sub.id}">
                <div class="subscription-header">
                    <div class="shop-name-badge">
                        <i class="fas fa-store"></i> ${shop?.shop_name || 'Unknown Shop'}
                    </div>
                    <span class="status-badge ${statusClass}">
                        ${sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                    </span>
                </div>
                <div class="subscription-details">
                    <div class="detail-item">
                        <div class="detail-label">Subscription Type</div>
                        <div class="detail-value">${sub.subscription_type.charAt(0).toUpperCase() + sub.subscription_type.slice(1)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Amount</div>
                        <div class="detail-value">₹${parseFloat(sub.amount).toFixed(2)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Last Payment</div>
                        <div class="detail-value">${lastPayment}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Next Payment</div>
                        <div class="detail-value">${nextPayment}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Due Amount</div>
                        <div class="detail-value" style="color: ${dueAmount > 0 ? '#ef4444' : '#10b981'}">
                            ₹${dueAmount.toFixed(2)}
                        </div>
                    </div>
                </div>
                <div class="subscription-actions">
                    <button class="btn btn-sm btn-primary" onclick="paymentManager.editSubscription('${sub.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-success" onclick="paymentManager.showRecordPaymentModal('${sub.shop_id}')">
                        <i class="fas fa-money-bill-wave"></i> Record Payment
                    </button>
                    <button class="btn btn-sm btn-info" onclick="paymentManager.downloadSubscriptionDetails('${sub.id}')">
                        <i class="fas fa-download"></i> Download
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="paymentManager.showSendNotificationModal('${sub.shop_id}')">
                        <i class="fas fa-bell"></i> Notify
                    </button>
                    ${sub.status === 'active' ?
                `<button class="btn btn-sm btn-danger" onclick="paymentManager.freezeShop('${sub.shop_id}')">
                            <i class="fas fa-snowflake"></i> Freeze
                        </button>` :
                `<button class="btn btn-sm btn-success" onclick="paymentManager.activateShop('${sub.shop_id}')">
                            <i class="fas fa-check"></i> Activate
                        </button>`
            }
                </div>
            </div>
        `;
    }

    calculateDueAmount(subscription) {
        if (subscription.subscription_type === 'once') return 0;
        if (!subscription.next_payment_date) return 0;

        const nextDate = new Date(subscription.next_payment_date);
        const now = new Date();

        if (nextDate > now) return 0;

        // Calculate how many payment periods have passed
        const diffTime = Math.abs(now - nextDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let periodsOverdue = 0;
        switch (subscription.subscription_type) {
            case 'weekly':
                periodsOverdue = Math.ceil(diffDays / 7);
                break;
            case 'monthly':
                periodsOverdue = Math.ceil(diffDays / 30);
                break;
            case 'yearly':
                periodsOverdue = Math.ceil(diffDays / 365);
                break;
        }

        return subscription.amount * periodsOverdue;
    }

    attachSubscriptionEventListeners() {
        // Event listeners are attached via onclick in the HTML
    }

    filterSubscriptions(searchTerm) {
        const cards = document.querySelectorAll('.subscription-card');
        const term = searchTerm.toLowerCase();

        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            card.style.display = text.includes(term) ? 'block' : 'none';
        });
    }

    showAddSubscriptionModal(shopId = null) {
        const modal = document.getElementById('addSubscriptionModal');
        const form = document.getElementById('subscriptionForm');
        form.reset();
        document.getElementById('subscriptionId').value = '';
        document.getElementById('subscriptionModalTitle').textContent = 'Add Subscription';

        // Set today's date as default
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('subscriptionStartDate').value = today;

        if (shopId) {
            document.getElementById('subscriptionShopId').value = shopId;
        }

        modal.classList.add('active');
    }

    async editSubscription(subscriptionId) {
        const subscription = this.subscriptions.find(s => s.id === subscriptionId);
        if (!subscription) return;

        document.getElementById('subscriptionId').value = subscription.id;
        document.getElementById('subscriptionShopId').value = subscription.shop_id;
        document.getElementById('subscriptionType').value = subscription.subscription_type;
        document.getElementById('subscriptionAmount').value = subscription.amount;
        document.getElementById('subscriptionStartDate').value = subscription.start_date?.split('T')[0] || '';
        document.getElementById('subscriptionEndDate').value = subscription.end_date?.split('T')[0] || '';
        document.getElementById('subscriptionStatus').value = subscription.status;
        document.getElementById('subscriptionModalTitle').textContent = 'Edit Subscription';

        document.getElementById('addSubscriptionModal').classList.add('active');
    }

    async saveSubscription() {
        const form = document.getElementById('subscriptionForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const subscriptionId = document.getElementById('subscriptionId').value;
        const shopId = document.getElementById('subscriptionShopId').value;
        const type = document.getElementById('subscriptionType').value;
        const amount = parseFloat(document.getElementById('subscriptionAmount').value);
        const startDate = document.getElementById('subscriptionStartDate').value;
        const endDate = document.getElementById('subscriptionEndDate').value || null;
        const status = document.getElementById('subscriptionStatus').value;

        // Calculate next payment date
        let nextPaymentDate = null;
        if (type !== 'once') {
            const start = new Date(startDate);
            switch (type) {
                case 'weekly':
                    nextPaymentDate = new Date(start.setDate(start.getDate() + 7));
                    break;
                case 'monthly':
                    nextPaymentDate = new Date(start.setMonth(start.getMonth() + 1));
                    break;
                case 'yearly':
                    nextPaymentDate = new Date(start.setFullYear(start.getFullYear() + 1));
                    break;
            }
        }

        const subscriptionData = {
            shop_id: shopId,
            subscription_type: type,
            amount: amount,
            start_date: startDate,
            end_date: endDate,
            status: status,
            next_payment_date: nextPaymentDate
        };

        try {
            showLoading(true);

            if (subscriptionId) {
                // Update existing
                const { error } = await supabaseClient
                    .from('shop_subscriptions')
                    .update(subscriptionData)
                    .eq('id', subscriptionId);

                if (error) throw error;
                showNotification('Subscription updated successfully', 'success');
            } else {
                // Create new
                const { error } = await supabaseClient
                    .from('shop_subscriptions')
                    .insert([subscriptionData]);

                if (error) throw error;
                showNotification('Subscription created successfully', 'success');
            }

            this.closeModals();
            await this.loadSubscriptions();
            this.updateStatistics();
        } catch (error) {
            console.error('Error saving subscription:', error);
            showNotification('Failed to save subscription: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadTransactions() {
        try {
            const { data, error } = await supabaseClient
                .from('payment_transactions')
                .select(`
                    *,
                    shops (
                        id,
                        shop_name
                    )
                `)
                .order('payment_date', { ascending: false });

            if (error) throw error;
            this.transactions = data || [];
            this.renderTransactions();
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    }

    renderTransactions() {
        const tbody = document.getElementById('transactionsTable');
        if (!tbody) return;

        if (this.transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No transactions found</td></tr>';
            return;
        }

        tbody.innerHTML = this.transactions.map(txn => `
            <tr>
                <td>${new Date(txn.payment_date).toLocaleDateString()}</td>
                <td>${txn.shops?.shop_name || 'Unknown'}</td>
                <td>₹${parseFloat(txn.amount).toFixed(2)}</td>
                <td>${txn.payment_method.toUpperCase()}</td>
                <td>${txn.transaction_reference || '-'}</td>
                <td><span class="badge badge-${txn.status}">${txn.status}</span></td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        ${txn.status === 'pending' ? `
                        <button class="btn btn-sm btn-success" onclick="paymentManager.approveTransaction('${txn.id}')" title="Approve">
                            <i class="fas fa-check"></i>
                        </button>` : ''}
                        <button class="btn btn-sm btn-primary" onclick="paymentManager.editTransaction('${txn.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="paymentManager.deleteTransaction('${txn.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    filterTransactions(searchTerm) {
        const rows = document.querySelectorAll('#transactionsTable tr');
        const term = searchTerm.toLowerCase();

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    }

    showRecordPaymentModal(shopId = null) {
        const modal = document.getElementById('recordPaymentModal');
        const form = document.getElementById('paymentForm');
        form.reset();
        document.getElementById('paymentTransactionId').value = '';

        // Reset modal title and button text (in case it was changed by edit)
        document.querySelector('#recordPaymentModal h3').innerHTML = '<i class="fas fa-money-bill-wave"></i> Record Payment';
        document.getElementById('savePaymentBtn').innerHTML = '<i class="fas fa-save"></i> Record Payment';

        // Set today's date as default
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('paymentDate').value = today;

        if (shopId) {
            document.getElementById('paymentShopId').value = shopId;
        }

        modal.classList.add('active');
    }

    async recordPayment() {
        const form = document.getElementById('paymentForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const transactionId = document.getElementById('paymentTransactionId').value;
        const shopId = document.getElementById('paymentShopId').value;
        const amount = parseFloat(document.getElementById('paymentAmount').value);
        const paymentDate = document.getElementById('paymentDate').value;
        const method = document.getElementById('paymentMethod').value;
        const reference = document.getElementById('transactionReference').value;
        const notes = document.getElementById('paymentNotes').value;

        try {
            showLoading(true);

            // Get the subscription for this shop if creating new or if needed
            let subscriptionId = null;
            if (!transactionId) {
                const { data: subscription } = await supabaseClient
                    .from('shop_subscriptions')
                    .select('id')
                    .eq('shop_id', shopId)
                    // Removed .eq('status', 'active') to allow finding paused/frozen subscriptions
                    .single();
                subscriptionId = subscription?.id;
            }

            const transactionData = {
                shop_id: shopId,
                amount: amount,
                payment_date: paymentDate,
                payment_method: method,
                transaction_reference: reference,
                notes: notes,
                // Only set status if it's a new transaction or we want to reset it (here we keep existing status for updates unless specified otherwise)
                // For simplified logic: New transactions are completed by default in the original code, but let's default to completed unless logic changes.
                // If editing, we generally don't change status automatically unless it was 'pending' and we want to keep it pending? 
                // Let's assume editing keeps status or sets to completed if not specified.
                // Actually, let's just update the fields we edit.
            };

            if (!transactionId) {
                transactionData.status = 'completed';
                transactionData.created_by = this.currentUser.id;
                transactionData.subscription_id = subscriptionId;
            }

            let error;
            if (transactionId) {
                const { error: updateError } = await supabaseClient
                    .from('payment_transactions')
                    .update(transactionData)
                    .eq('id', transactionId);
                error = updateError;
            } else {
                const { error: insertError } = await supabaseClient
                    .from('payment_transactions')
                    .insert([transactionData]);
                error = insertError;
            }

            if (error) throw error;

            // Update subscription last payment date and next payment date if it's a new payment
            // For edits, we might not want to re-trigger this logic complexity unless date changed, 
            // but for now let's keep it simple and only do it for new payments or if requested.
            // The original code did it for every recordPayment. 
            // ALWAYS update subscription if transaction is completed (New or Edited)
            // This ensures manual "Record Payment" or "Edit -> Complete" updates the subscription
            // We find the latest subscription and update it.
            if (!error && (transactionData.status === 'completed' || (!transactionId /* new defaults to completed */))) {
                const { data: subscription } = await supabaseClient
                    .from('shop_subscriptions')
                    .select('*')
                    .eq('shop_id', shopId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (subscription) {
                    // Check if this payment is newer than the last recorded payment
                    const currentLastDate = subscription.last_payment_date ? new Date(subscription.last_payment_date) : new Date(0);
                    const newPaymentDate = new Date(paymentDate);

                    // Update if this payment is newer or same day (to allow corrections), or if never paid
                    if (newPaymentDate >= currentLastDate) {
                        const nextPayment = this.calculateNextPaymentDate(subscription.subscription_type, newPaymentDate);
                        await supabaseClient
                            .from('shop_subscriptions')
                            .update({
                                last_payment_date: paymentDate,
                                next_payment_date: nextPayment,
                                status: 'active' // Auto-activate
                            })
                            .eq('id', subscription.id);
                    }
                }
            }

            showNotification(transactionId ? 'Transaction updated successfully' : 'Payment recorded successfully', 'success');
            this.closeModals();
            await this.loadTransactions();
            await this.loadSubscriptions();
            this.updateStatistics();
        } catch (error) {
            console.error('Error recording payment:', error);
            showNotification('Failed to record payment: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    calculateNextPaymentDate(type, fromDate) {
        if (type === 'once') return null;

        const date = new Date(fromDate);
        switch (type) {
            case 'weekly':
                date.setDate(date.getDate() + 7);
                break;
            case 'monthly':
                date.setMonth(date.getMonth() + 1);
                break;
            case 'yearly':
                date.setFullYear(date.getFullYear() + 1);
                break;
        }
        return date.toISOString();
    }

    async editTransaction(id) {
        const txn = this.transactions.find(t => t.id === id);
        if (!txn) return;

        this.showRecordPaymentModal();

        // Fill form
        document.getElementById('paymentTransactionId').value = txn.id;
        document.getElementById('paymentShopId').value = txn.shop_id;
        document.getElementById('paymentAmount').value = txn.amount;
        document.getElementById('paymentDate').value = new Date(txn.payment_date).toISOString().split('T')[0];
        document.getElementById('paymentMethod').value = txn.payment_method;
        document.getElementById('transactionReference').value = txn.transaction_reference || '';
        document.getElementById('paymentNotes').value = txn.notes || '';

        // Update modal title logic if you wish, but the tool doesn't allow changing the modal HTML easily right now without more edits. 
        // We'll rely on the button saying "Record Payment" or we could change text via JS
        document.querySelector('#recordPaymentModal h3').innerHTML = '<i class="fas fa-edit"></i> Edit Transaction';
        document.getElementById('savePaymentBtn').innerHTML = '<i class="fas fa-save"></i> Update Payment';

        // Add event listener to reset title on close? 
        // The showRecordPaymentModal resets the form, but not the texts. 
        // Simple fix: update showRecordPaymentModal to reset texts or handle it there.
        // For now, let's keep it simple.
    }

    async approveTransaction(id) {
        if (!confirm('Are you sure you want to approve this transaction?')) return;

        try {
            showLoading(true);

            // 1. Get transaction details to know shop and date
            const { data: transaction, error: txnError } = await supabaseClient
                .from('payment_transactions')
                .select('*')
                .eq('id', id)
                .single();

            if (txnError) throw txnError;

            // 2. Update transaction status
            const { error } = await supabaseClient
                .from('payment_transactions')
                .update({ status: 'completed' })
                .eq('id', id);

            if (error) throw error;

            // 3. Update subscription dates
            const { data: subscription } = await supabaseClient
                .from('shop_subscriptions')
                .select('*')
                .eq('shop_id', transaction.shop_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (subscription) {
                const paymentDate = transaction.payment_date;
                const nextPayment = this.calculateNextPaymentDate(subscription.subscription_type, new Date(paymentDate));

                await supabaseClient
                    .from('shop_subscriptions')
                    .update({
                        last_payment_date: paymentDate,
                        next_payment_date: nextPayment,
                        status: 'active' // Auto-activate shop on payment
                    })
                    .eq('id', subscription.id);
            }

            showNotification('Transaction approved successfully', 'success');
            await this.loadTransactions();
            await this.loadSubscriptions();
            this.updateStatistics();
        } catch (error) {
            console.error('Error approving transaction:', error);
            showNotification('Failed to approve transaction', 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteTransaction(id) {
        if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) return;

        try {
            showLoading(true);
            const { error } = await supabaseClient
                .from('payment_transactions')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showNotification('Transaction deleted successfully', 'success');
            await this.loadTransactions();
            this.updateStatistics();
        } catch (error) {
            console.error('Error deleting transaction:', error);
            showNotification('Failed to delete transaction', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadPaymentSettings() {
        try {
            const { data, error } = await supabaseClient
                .from('payment_settings')
                .select('*')
                .order('updated_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            this.paymentSettings = data;
            this.renderPaymentSettings();
        } catch (error) {
            console.error('Error loading payment settings:', error);
        }
    }

    renderPaymentSettings() {
        if (!this.paymentSettings) return;

        // Standard Fields
        document.getElementById('upiId').value = this.paymentSettings.upi_id || '';
        document.getElementById('bankName').value = this.paymentSettings.bank_name || '';
        document.getElementById('accountHolderName').value = this.paymentSettings.account_holder_name || '';
        document.getElementById('accountNumber').value = this.paymentSettings.account_number || '';
        document.getElementById('ifscCode').value = this.paymentSettings.ifsc_code || '';
        document.getElementById('paymentPhone').value = this.paymentSettings.phone_number || '';
        document.getElementById('paymentInstructions').value = this.paymentSettings.payment_instructions || '';

        if (this.paymentSettings.qr_code_url) {
            document.getElementById('qrCodePreview').style.display = 'block';
            document.getElementById('qrCodeImage').src = this.paymentSettings.qr_code_url;
        }

        // Additional Fields (JSONB)
        const details = this.paymentSettings.additional_details || {};

        document.getElementById('upiNumber').value = details.upi_number || '';
        document.getElementById('upiName').value = details.upi_name || '';
        document.getElementById('bankBranch').value = details.bank_branch || '';

        document.getElementById('usdtAddress').value = details.usdt_address || '';
        document.getElementById('usdtType').value = details.usdt_type || '';

        if (details.usdt_qr_code_url) {
            document.getElementById('usdtQrPreview').style.display = 'block';
            document.getElementById('usdtQrImage').src = details.usdt_qr_code_url;
        }

        document.getElementById('otherPaymentNumber').value = details.other_payment_number || '';
        document.getElementById('otherPaymentDetails').value = details.other_payment_details || '';
    }

    async uploadQRCode() {
        const fileInput = document.getElementById('qrCodeFile');
        const file = fileInput.files[0];

        if (!file) {
            showNotification('Please select a file to upload', 'warning');
            return;
        }

        try {
            showLoading(true);

            // Upload to Supabase storage (you'll need to set up a storage bucket)
            const fileName = `qr-${Date.now()}.${file.name.split('.').pop()}`;
            const { data, error } = await supabaseClient.storage
                .from('payment-qr-codes')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (error) throw error;

            const { data: { publicUrl } } = supabaseClient.storage
                .from('payment-qr-codes')
                .getPublicUrl(fileName);

            // Update preview
            document.getElementById('qrCodePreview').style.display = 'block';
            document.getElementById('qrCodeImage').src = publicUrl;

            // Update payment settings (will be saved when user clicks save)
            if (!this.paymentSettings) {
                this.paymentSettings = {};
            }
            this.paymentSettings.qr_code_url = publicUrl;

            showNotification('QR Code uploaded successfully. Click "Save Settings" to apply.', 'success');
        } catch (error) {
            console.error('Error uploading QR code:', error);
            showNotification('Failed to upload QR code. Please check storage configuration.', 'error');
        } finally {
            showLoading(false);
        }
    }

    async uploadUsdtQRCode() {
        const fileInput = document.getElementById('usdtQrFile');
        const file = fileInput.files[0];

        if (!file) {
            showNotification('Please select a USDT QR file to upload', 'warning');
            return;
        }

        try {
            showLoading(true);

            const fileName = `usdt-qr-${Date.now()}.${file.name.split('.').pop()}`;
            const { data, error } = await supabaseClient.storage
                .from('payment-qr-codes')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (error) throw error;

            const { data: { publicUrl } } = supabaseClient.storage
                .from('payment-qr-codes')
                .getPublicUrl(fileName);

            // Update preview
            document.getElementById('usdtQrPreview').style.display = 'block';
            document.getElementById('usdtQrImage').src = publicUrl;

            // Update payment settings object locally
            if (!this.paymentSettings) {
                this.paymentSettings = {};
            }
            if (!this.paymentSettings.additional_details) {
                this.paymentSettings.additional_details = {};
            }
            this.paymentSettings.additional_details.usdt_qr_code_url = publicUrl;

            showNotification('USDT QR Code uploaded successfully. Click "Save Settings" to apply.', 'success');
        } catch (error) {
            console.error('Error uploading USDT QR code:', error);
            showNotification('Failed to upload USDT QR code.', 'error');
        } finally {
            showLoading(false);
        }
    }

    async savePaymentSettings() {
        // Collect Additional Details
        const additionalDetails = {
            upi_number: document.getElementById('upiNumber').value,
            upi_name: document.getElementById('upiName').value,
            bank_branch: document.getElementById('bankBranch').value,
            usdt_address: document.getElementById('usdtAddress').value,
            usdt_type: document.getElementById('usdtType').value,
            usdt_qr_code_url: this.paymentSettings?.additional_details?.usdt_qr_code_url || null,
            other_payment_number: document.getElementById('otherPaymentNumber').value,
            other_payment_details: document.getElementById('otherPaymentDetails').value
        };

        const settingsData = {
            qr_code_url: this.paymentSettings?.qr_code_url || null,
            upi_id: document.getElementById('upiId').value,
            bank_name: document.getElementById('bankName').value,
            account_holder_name: document.getElementById('accountHolderName').value,
            account_number: document.getElementById('accountNumber').value,
            ifsc_code: document.getElementById('ifscCode').value,
            phone_number: document.getElementById('paymentPhone').value,
            payment_instructions: document.getElementById('paymentInstructions').value,
            additional_details: additionalDetails
        };

        try {
            showLoading(true);

            if (this.paymentSettings?.id) {
                // Update existing
                const { error } = await supabaseClient
                    .from('payment_settings')
                    .update(settingsData)
                    .eq('id', this.paymentSettings.id);

                if (error) throw error;
            } else {
                // Create new
                const { data, error } = await supabaseClient
                    .from('payment_settings')
                    .insert([settingsData])
                    .select()
                    .single();

                if (error) throw error;
                this.paymentSettings = data;
            }

            showNotification('Payment settings saved successfully', 'success');
            await this.loadPaymentSettings(); // Reload to ensure sync
        } catch (error) {
            console.error('Error saving payment settings:', error);
            showNotification('Failed to save payment settings: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadNotifications() {
        try {
            const filter = document.getElementById('notificationShopFilter')?.value;
            let query = supabaseClient
                .from('payment_notifications')
                .select(`
                    *,
                    shops (
                        id,
                        shop_name
                    )
                `)
                .order('created_at', { ascending: false });

            if (filter && filter !== 'all') {
                query = query.eq('shop_id', filter);
            }

            const { data, error } = await query;
            if (error) throw error;

            this.notifications = data || [];
            this.renderNotifications();
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    renderNotifications() {
        const tbody = document.getElementById('notificationsTable');
        if (!tbody) return;

        if (this.notifications.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No notifications found</td></tr>';
            return;
        }

        tbody.innerHTML = this.notifications.map(notif => `
            <tr>
                <td>${new Date(notif.created_at).toLocaleDateString()}</td>
                <td>${notif.shops?.shop_name || 'All Shops'}</td>
                <td>${notif.title}</td>
                <td><span class="badge badge-${notif.notification_type}">${notif.notification_type}</span></td>
                <td><span class="badge badge-${notif.is_read ? 'success' : 'warning'}">${notif.is_read ? 'Read' : 'Unread'}</span></td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="paymentManager.viewNotificationDetails('${notif.id}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="paymentManager.showSendNotificationModal(null, '${notif.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="paymentManager.deleteNotification('${notif.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    showSendNotificationModal(shopId = null, notificationId = null) {
        const modal = document.getElementById('sendNotificationModal');
        const form = document.getElementById('notificationForm');
        form.reset();

        // Reset title 
        document.querySelector('#sendNotificationModal h3').innerHTML = '<i class="fas fa-paper-plane"></i> Send Notification';
        document.getElementById('sendNotificationSubmitBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Send Notification';

        // Clear any previous edit ID
        const existingIdInput = document.getElementById('notificationId');
        if (existingIdInput) existingIdInput.remove();

        if (notificationId) {
            // Edit Mode
            const notif = this.notifications.find(n => n.id === notificationId);
            if (notif) {
                // Add hidden input for ID
                const idInput = document.createElement('input');
                idInput.type = 'hidden';
                idInput.id = 'notificationId';
                idInput.value = notificationId;
                form.appendChild(idInput);

                document.getElementById('notificationShopId').value = notif.shop_id;
                document.getElementById('notificationType').value = notif.notification_type;
                document.getElementById('notificationTitle').value = notif.title;
                document.getElementById('notificationMessage').value = notif.message;
                document.getElementById('previewTitle').textContent = notif.title;
                document.getElementById('previewMessage').textContent = notif.message;

                document.querySelector('#sendNotificationModal h3').innerHTML = '<i class="fas fa-edit"></i> Edit Notification';
                document.getElementById('sendNotificationSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Notification';
            }
        } else if (shopId) {
            document.getElementById('notificationShopId').value = shopId;
        }

        modal.classList.add('active');
    }

    async sendNotification() {
        const form = document.getElementById('notificationForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const notificationIdInput = document.getElementById('notificationId');
        const notificationId = notificationIdInput ? notificationIdInput.value : null;

        const shopId = document.getElementById('notificationShopId').value;
        const type = document.getElementById('notificationType').value;
        const title = document.getElementById('notificationTitle').value;
        const message = document.getElementById('notificationMessage').value;

        try {
            showLoading(true);

            if (notificationId) {
                // Update existing
                const { error } = await supabaseClient
                    .from('payment_notifications')
                    .update({
                        shop_id: shopId,
                        title: title,
                        message: message,
                        notification_type: type
                    })
                    .eq('id', notificationId);

                if (error) throw error;
                showNotification('Notification updated system', 'success');

            } else {
                // Create new
                // If "all" is selected, send to all shops
                const targetShops = shopId === 'all' ? this.shops.map(s => s.id) : [shopId];

                const notifications = targetShops.map(sid => ({
                    shop_id: sid,
                    title: title,
                    message: message,
                    notification_type: type,
                    is_read: false,
                    created_by: this.currentUser.id
                }));

                const { error } = await supabaseClient
                    .from('payment_notifications')
                    .insert(notifications);

                if (error) throw error;
                showNotification(`Notification sent to ${targetShops.length} shop(s)`, 'success');
            }

            this.closeModals();
            await this.loadNotifications();
        } catch (error) {
            console.error('Error processing notification:', error);
            showNotification('Failed to process notification: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async freezeShop(shopId) {
        if (!confirm('Are you sure you want to freeze this shop? This will prevent access until unfrozen.')) {
            return;
        }

        try {
            await this.updateShopSubscriptionStatus(shopId, 'frozen');
            await this.sendAutoNotification(shopId, 'freeze', 'Shop Frozen', 'Your shop has been frozen due to payment issues. Please contact admin.');
            showNotification('Shop frozen successfully', 'success');
        } catch (error) {
            console.error('Error freezing shop:', error);
            showNotification('Failed to freeze shop', 'error');
        }
    }

    async activateShop(shopId) {
        try {
            await this.updateShopSubscriptionStatus(shopId, 'active');
            await this.sendAutoNotification(shopId, 'general', 'Shop Activated', 'Your shop has been reactivated. Thank you for your payment.');
            showNotification('Shop activated successfully', 'success');
        } catch (error) {
            console.error('Error activating shop:', error);
            showNotification('Failed to activate shop', 'error');
        }
    }

    async updateShopSubscriptionStatus(shopId, status) {
        const { error } = await supabaseClient
            .from('shop_subscriptions')
            .update({ status: status })
            .eq('shop_id', shopId);

        if (error) throw error;

        await this.loadSubscriptions();
        this.updateStatistics();
    }

    async sendAutoNotification(shopId, type, title, message) {
        await supabaseClient
            .from('payment_notifications')
            .insert([{
                shop_id: shopId,
                title: title,
                message: message,
                notification_type: type,
                created_by: this.currentUser.id
            }]);
    }

    updateStatistics() {
        // Total Revenue
        const totalRevenue = this.transactions
            .filter(t => t.status === 'completed')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        document.getElementById('totalRevenue').textContent = `₹${totalRevenue.toFixed(2)}`;

        // Due Payments
        let dueAmount = 0;
        let dueShopsCount = 0;
        this.subscriptions.forEach(sub => {
            const due = this.calculateDueAmount(sub);
            if (due > 0) {
                dueAmount += due;
                dueShopsCount++;
            }
        });
        document.getElementById('duePayments').textContent = `₹${dueAmount.toFixed(2)}`;
        document.getElementById('dueShopsCount').textContent = `${dueShopsCount} Shops`;

        // Active Subscriptions
        const activeCount = this.subscriptions.filter(s => s.status === 'active').length;
        document.getElementById('activeSubscriptions').textContent = activeCount;

        // Overdue
        const overdueCount = this.subscriptions.filter(sub => {
            if (!sub.next_payment_date || sub.subscription_type === 'once') return false;
            return new Date(sub.next_payment_date) < new Date();
        }).length;
        document.getElementById('overdueCount').textContent = overdueCount;
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.payment-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.payment-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });

        this.currentTab = tabName;

        // Load data for the tab if needed
        if (tabName === 'actions') {
            this.renderShopActions();
        }
    }

    renderShopActions() {
        const container = document.getElementById('shopActionsList');
        if (!container) return;

        container.innerHTML = this.shops.map(shop => {
            const subscription = this.subscriptions.find(s => s.shop_id === shop.id);
            const status = subscription?.status || 'no subscription';

            return `
                <div class="subscription-card">
                    <div class="subscription-header">
                        <div class="shop-name-badge">
                            <i class="fas fa-store"></i> ${shop.shop_name}
                        </div>
                        <span class="status-badge status-${status.replace(' ', '-')}">
                            ${status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                    </div>
                    <div class="action-buttons-grid">
                        <button class="action-btn action-freeze" onclick="paymentManager.updateShopSubscriptionStatus('${shop.id}', 'frozen')">
                            <i class="fas fa-snowflake"></i> Freeze
                        </button>
                        <button class="action-btn action-suspend" onclick="paymentManager.updateShopSubscriptionStatus('${shop.id}', 'suspended')">
                            <i class="fas fa-pause"></i> Suspend
                        </button>
                        <button class="action-btn action-stop" onclick="paymentManager.updateShopSubscriptionStatus('${shop.id}', 'stopped')">
                            <i class="fas fa-stop"></i> Stop
                        </button>
                        <button class="action-btn action-warning" onclick="paymentManager.sendWarning('${shop.id}')">
                            <i class="fas fa-exclamation-triangle"></i> Warning
                        </button>
                        <button class="action-btn action-activate" onclick="paymentManager.updateShopSubscriptionStatus('${shop.id}', 'active')">
                            <i class="fas fa-check"></i> Activate
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async sendWarning(shopId) {
        const message = prompt('Enter warning message:');
        if (!message) return;

        await this.sendAutoNotification(shopId, 'warning', 'Payment Warning', message);
        showNotification('Warning sent successfully', 'success');
        await this.loadNotifications();
    }

    async downloadSubscriptionDetails(subscriptionId) {
        // Implementation for downloading subscription details
        showNotification('Download functionality coming soon', 'info');
    }

    async viewTransactionDetails(transactionId) {
        const transaction = this.transactions.find(t => t.id === transactionId);
        if (!transaction) return;

        alert(`Transaction Details:\n\nShop: ${transaction.shops?.shop_name}\nAmount: ₹${transaction.amount}\nMethod: ${transaction.payment_method}\nDate: ${new Date(transaction.payment_date).toLocaleDateString()}\nReference: ${transaction.transaction_reference || 'N/A'}\nNotes: ${transaction.notes || 'N/A'}`);
    }

    async deleteNotification(id) {
        if (!confirm('Are you sure you want to delete this notification?')) return;

        try {
            showLoading(true);
            const { error } = await supabaseClient
                .from('payment_notifications')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showNotification('Notification deleted successfully', 'success');
            await this.loadNotifications();
        } catch (error) {
            console.error('Error deleting notification:', error);
            showNotification('Failed to delete notification', 'error');
        } finally {
            showLoading(false);
        }
    }

    async downloadReceipt(transactionId) {
        showNotification('Receipt download functionality coming soon', 'info');
    }

    async viewNotificationDetails(notificationId) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (!notification) return;

        alert(`${notification.title}\n\n${notification.message}\n\nType: ${notification.notification_type}\nDate: ${new Date(notification.created_at).toLocaleDateString()}`);
    }

    async exportTransactions() {
        showNotification('Export functionality coming soon', 'info');
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
}

// Initialize payment manager
const paymentManager = new PaymentManager();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    paymentManager.init();
});
