// Subscription Management - Shop Admin
class SubscriptionManager {
    constructor() {
        this.currentUser = null;
        this.currentShop = null;
        this.subscription = null;
        this.paymentHistory = [];
        this.notifications = [];
        this.paymentSettings = null;
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

            this.currentUser = user;

            // Get shop details
            if (user.shop_id) {
                const { data: shop } = await supabaseClient
                    .from('shops')
                    .select('*')
                    .eq('id', user.shop_id)
                    .single();

                this.currentShop = shop;
                document.getElementById('shopNameHeader').textContent = shop?.name || 'My Shop';
            }

            this.setupEventListeners();
            await this.loadData();
        } catch (error) {
            console.error('Initialization error:', error);
            showNotification('Failed to initialize', 'error');
        }
    }

    setupEventListeners() {
        // Submit payment
        document.getElementById('submitPaymentBtn')?.addEventListener('click', () => this.submitPayment());

        // Download history
        document.getElementById('downloadHistoryBtn')?.addEventListener('click', () => this.downloadHistory());

        // Set today's date as default
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('submissionPaymentDate');
        if (dateInput) dateInput.value = today;
    }

    async loadData() {
        if (!this.currentShop) {
            this.showNoSubscriptionMessage();
            return;
        }

        showLoading(true);
        try {
            await Promise.all([
                this.loadSubscription(),
                this.loadPaymentHistory(),
                this.loadNotifications(),
                this.loadPaymentSettings()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
            showNotification('Failed to load subscription data', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadSubscription() {
        if (!this.currentShop) return;

        try {
            const { data, error } = await supabaseClient
                .from('shop_subscriptions')
                .select('*')
                .eq('shop_id', this.currentShop.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            this.subscription = data;
            this.renderSubscription();
            this.updateStatusAlert();
        } catch (error) {
            console.error('Error loading subscription:', error);
            this.showNoSubscriptionMessage();
        }
    }

    renderSubscription() {
        if (!this.subscription) {
            this.showNoSubscriptionMessage();
            return;
        }

        // Status
        const status = this.subscription.status;
        const statusBadge = document.getElementById('subscriptionStatus');
        statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusBadge.className = `subscription-status status-${status}`;

        // Plan type
        document.getElementById('planType').textContent =
            this.subscription.subscription_type.charAt(0).toUpperCase() +
            this.subscription.subscription_type.slice(1);

        // Amount
        document.getElementById('planAmount').textContent =
            `₹${parseFloat(this.subscription.amount).toFixed(2)}`;

        // Next payment
        if (this.subscription.next_payment_date) {
            const nextDate = new Date(this.subscription.next_payment_date);
            document.getElementById('nextPayment').textContent = nextDate.toLocaleDateString();

            // Days remaining
            const today = new Date();
            const diffTime = nextDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const daysElem = document.getElementById('daysRemaining');
            if (diffDays < 0) {
                daysElem.textContent = 'Overdue';
                daysElem.style.color = '#ef4444';
            } else if (diffDays === 0) {
                daysElem.textContent = 'Today';
                daysElem.style.color = '#f59e0b';
            } else {
                daysElem.textContent = `${diffDays} days`;
                daysElem.style.color = diffDays <= 7 ? '#f59e0b' : '#10b981';
            }
        } else {
            document.getElementById('nextPayment').textContent = 'N/A';
            document.getElementById('daysRemaining').textContent = '-';
        }

        // Last payment
        if (this.subscription.last_payment_date) {
            document.getElementById('lastPaymentDate').textContent =
                new Date(this.subscription.last_payment_date).toLocaleDateString();
        }
    }

    updateStatusAlert() {
        const alertBox = document.getElementById('statusAlert');
        if (!this.subscription) {
            alertBox.innerHTML = `
                <div class="alert-box alert-info">
                    <i class="fas fa-info-circle"></i>
                    <strong>No Active Subscription</strong><br>
                    Please contact the super admin to set up your subscription.
                </div>
            `;
            alertBox.style.display = 'block';
            return;
        }

        const status = this.subscription.status;
        const nextDate = this.subscription.next_payment_date ? new Date(this.subscription.next_payment_date) : null;
        const today = new Date();

        let alertHtml = '';

        if (status === 'frozen') {
            alertHtml = `
                <div class="alert-box alert-danger">
                    <i class="fas fa-snowflake"></i>
                    <strong>Account Frozen</strong><br>
                    Your shop account has been frozen. Please make pending payments to reactivate your account.
                </div>
            `;
        } else if (status === 'suspended') {
            alertHtml = `
                <div class="alert-box alert-danger">
                    <i class="fas fa-pause-circle"></i>
                    <strong>Account Suspended</strong><br>
                    Your shop account is currently suspended. Please contact support.
                </div>
            `;
        } else if (status === 'stopped') {
            alertHtml = `
                <div class="alert-box alert-danger">
                    <i class="fas fa-stop-circle"></i>
                    <strong>Account Stopped</strong><br>
                    Your shop account has been stopped. Please contact support.
                </div>
            `;
        } else if (nextDate && nextDate < today) {
            const overdueDays = Math.ceil((today - nextDate) / (1000 * 60 * 60 * 24));
            alertHtml = `
                <div class="alert-box alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Payment Overdue</strong><br>
                    Your payment is overdue by ${overdueDays} day(s). Please make a payment as soon as possible.
                </div>
            `;
        } else if (nextDate) {
            const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) {
                alertHtml = `
                    <div class="alert-box alert-warning">
                        <i class="fas fa-clock"></i>
                        <strong>Payment Due Soon</strong><br>
                        Your next payment is due in ${diffDays} day(s) on ${nextDate.toLocaleDateString()}.
                    </div>
                `;
            }
        }

        if (alertHtml) {
            alertBox.innerHTML = alertHtml;
            alertBox.style.display = 'block';
        } else {
            alertBox.style.display = 'none';
        }
    }

    async loadPaymentHistory() {
        if (!this.currentShop) return;

        try {
            const { data, error } = await supabaseClient
                .from('payment_transactions')
                .select('*')
                .eq('shop_id', this.currentShop.id)
                .order('payment_date', { ascending: false });

            if (error) throw error;

            this.paymentHistory = data || [];
            this.renderPaymentHistory();
            this.updatePaymentStats();
        } catch (error) {
            console.error('Error loading payment history:', error);
        }
    }

    renderPaymentHistory() {
        const tbody = document.getElementById('paymentHistoryTable');
        if (!tbody) return;

        if (this.paymentHistory.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No payment history found</td></tr>';
            return;
        }

        tbody.innerHTML = this.paymentHistory.map((payment, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${new Date(payment.payment_date).toLocaleDateString()}</td>
                <td><strong>₹${parseFloat(payment.amount).toFixed(2)}</strong></td>
                <td>${payment.payment_method.toUpperCase()}</td>
                <td>${payment.transaction_reference || '-'}</td>
                <td>
                    <span class="badge badge-${payment.status === 'completed' ? 'success' : payment.status === 'pending' ? 'warning' : 'danger'}">
                        ${payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                    </span>
                </td>
                <td><small class="text-muted">${payment.notes || '-'}</small></td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="subscriptionManager.viewPaymentDetails('${payment.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="subscriptionManager.downloadReceipt('${payment.id}')">
                        <i class="fas fa-download"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    updatePaymentStats() {
        // Total paid
        const totalPaid = this.paymentHistory
            .filter(p => p.status === 'completed')
            .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        document.getElementById('totalPaidAmount').textContent = `₹${totalPaid.toFixed(0)}`;

        // Payment count
        document.getElementById('paymentCount').textContent = this.paymentHistory.length;

        // Calculate due amount
        if (this.subscription) {
            const dueAmount = this.calculateDueAmount();
            document.getElementById('dueAmount').textContent = `₹${dueAmount.toFixed(2)}`;
        }
    }

    calculateDueAmount() {
        if (!this.subscription || this.subscription.subscription_type === 'once') return 0;
        if (!this.subscription.next_payment_date) return 0;

        const nextDate = new Date(this.subscription.next_payment_date);
        const now = new Date();

        if (nextDate > now) return 0;

        const diffTime = Math.abs(now - nextDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let periodsOverdue = 0;
        switch (this.subscription.subscription_type) {
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

        return this.subscription.amount * periodsOverdue;
    }

    async loadNotifications() {
        if (!this.currentShop) return;

        try {
            const { data, error } = await supabaseClient
                .from('payment_notifications')
                .select('*')
                .eq('shop_id', this.currentShop.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.notifications = data || [];
            this.renderNotifications();
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    renderNotifications() {
        const container = document.getElementById('notificationsContainer');
        if (!container) return;

        if (this.notifications.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bell-slash fa-2x" style="color: #cbd5e1; margin-bottom: 10px;"></i>
                    <p>No notifications</p>
                </div>
            `;
            return;
        }

        const unreadCount = this.notifications.filter(n => !n.is_read).length;
        const unreadBadge = document.getElementById('unreadCount');
        if (unreadCount > 0) {
            unreadBadge.textContent = `${unreadCount} Unread`;
            unreadBadge.style.display = 'inline';
        } else {
            unreadBadge.style.display = 'none';
        }

        container.innerHTML = this.notifications.slice(0, 10).map(notif => {
            const typeClass = notif.notification_type === 'warning' || notif.notification_type === 'payment_due' ? 'warning' :
                notif.notification_type === 'freeze' || notif.notification_type === 'suspension' ? 'danger' : '';

            return `
                <div class="notification-card ${!notif.is_read ? 'unread' : ''} ${typeClass}" 
                     onclick="subscriptionManager.markAsRead('${notif.id}')">
                    <div class="notification-header">
                        <div class="notification-title">
                            ${!notif.is_read ? '<i class="fas fa-circle" style="font-size: 0.5rem; color: #f59e0b; margin-right: 8px;"></i>' : ''}
                            ${notif.title}
                        </div>
                        <div class="notification-date">${new Date(notif.created_at).toLocaleDateString()}</div>
                    </div>
                    <div class="notification-message">${notif.message}</div>
                    <div style="margin-top: 8px; font-size: 0.85rem; color: #64748b;">
                        <i class="fas fa-tag"></i> ${notif.notification_type.replace('_', ' ').toUpperCase()}
                    </div>
                </div>
            `;
        }).join('');
    }

    async markAsRead(notificationId) {
        try {
            await supabaseClient
                .from('payment_notifications')
                .update({ is_read: true })
                .eq('id', notificationId);

            // Update local state
            const notif = this.notifications.find(n => n.id === notificationId);
            if (notif) notif.is_read = true;

            this.renderNotifications();
        } catch (error) {
            console.error('Error marking notification as read:', error);
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
            this.renderPaymentMethods();
        } catch (error) {
            console.error('Error loading payment settings:', error);
        }
    }

    renderPaymentMethods() {
        const container = document.getElementById('paymentMethodsContainer');
        if (!container) return;

        if (!this.paymentSettings) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-info-circle fa-2x" style="color: #cbd5e1; margin-bottom: 10px;"></i>
                    <p>Payment methods not configured yet</p>
                </div>
            `;
            return;
        }

        let methodsHtml = '';

        const details = this.paymentSettings.additional_details || {};

        // UPI Payment (with QR Code)
        const qrUrl = this.paymentSettings.qr_code_url;
        const hasUpi = this.paymentSettings.upi_id || details.upi_number || (qrUrl && qrUrl.length > 5);

        if (hasUpi) {
            methodsHtml += `
                <div class="payment-method-card">
                    <div class="payment-method-header">
                        <div class="payment-method-icon icon-upi">
                            <i class="fas fa-mobile-alt"></i>
                        </div>
                        <div>
                            <h4 style="margin: 0;">UPI Payment</h4>
                            <p style="margin: 5px 0 0; color: #64748b; font-size: 0.9rem;">${details.upi_name || 'Pay via UPI'}</p>
                        </div>
                    </div>

                    ${(qrUrl && qrUrl.length > 5) ? `
                    <div class="qr-code-display" style="margin-bottom: 20px; text-align: center;">
                        <img src="${qrUrl}" alt="Payment QR Code" 
                             style="max-width: 220px; width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; display: inline-block; cursor: zoom-in;"
                             onclick="subscriptionManager.viewFullImage('${qrUrl}')"
                             onerror="this.parentElement.style.display='none'; console.error('Failed to load QR image');">
                        <p style="margin-top: 10px; color: #64748b; font-size: 0.85rem;">Click/Scan with any UPI app</p>
                    </div>` : ''}

                    ${this.paymentSettings.upi_id ? `
                    <div class="info-row">
                        <div class="info-label">UPI ID</div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="info-value">${this.paymentSettings.upi_id}</div>
                            <button class="copy-btn" onclick="subscriptionManager.copyToClipboard('${this.paymentSettings.upi_id}')">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>` : ''}
                    ${details.upi_number ? `
                    <div class="info-row">
                        <div class="info-label">Number</div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="info-value">${details.upi_number}</div>
                            <button class="copy-btn" onclick="subscriptionManager.copyToClipboard('${details.upi_number}')">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>` : ''}
                </div>
            `;
        }

        // Bank Transfer Method (Enhanced)
        if (this.paymentSettings.bank_name) {
            methodsHtml += `
                <div class="payment-method-card">
                    <div class="payment-method-header">
                        <div class="payment-method-icon icon-bank">
                            <i class="fas fa-university"></i>
                        </div>
                        <div>
                            <h4 style="margin: 0;">Bank Transfer</h4>
                            <p style="margin: 5px 0 0; color: #64748b; font-size: 0.9rem;">NEFT/RTGS/IMPS</p>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Bank Name</div>
                        <div class="info-value">${this.paymentSettings.bank_name}</div>
                    </div>
                    ${this.paymentSettings.account_holder_name ? `
                    <div class="info-row">
                        <div class="info-label">Account Holder</div>
                        <div class="info-value">${this.paymentSettings.account_holder_name}</div>
                    </div>
                    ` : ''}
                    ${this.paymentSettings.account_number ? `
                    <div class="info-row">
                        <div class="info-label">Account Number</div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="info-value">${this.paymentSettings.account_number}</div>
                            <button class="copy-btn" onclick="subscriptionManager.copyToClipboard('${this.paymentSettings.account_number}')">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    ` : ''}
                    ${this.paymentSettings.ifsc_code ? `
                    <div class="info-row">
                        <div class="info-label">IFSC Code</div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="info-value">${this.paymentSettings.ifsc_code}</div>
                            <button class="copy-btn" onclick="subscriptionManager.copyToClipboard('${this.paymentSettings.ifsc_code}')">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    ` : ''}
                    ${details.bank_branch ? `
                    <div class="info-row">
                        <div class="info-label">Branch</div>
                        <div class="info-value">${details.bank_branch}</div>
                    </div>
                    ` : ''}
                </div>
            `;
        }

        // USDT / Crypto Method (New)
        if (details.usdt_address) {
            methodsHtml += `
            <div class="payment-method-card">
                <div class="payment-method-header">
                    <div class="payment-method-icon icon-crypto" style="background: #e0f2fe; color: #0284c7; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-coins"></i>
                    </div>
                    <div>
                        <h4 style="margin: 0;">Crypto Payment</h4>
                        <p style="margin: 5px 0 0; color: #64748b; font-size: 0.9rem;">${details.usdt_type || 'USDT'} Transfer</p>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-label">Network</div>
                    <div class="info-value"><span style="background: #e0f2fe; color: #0284c7; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">${details.usdt_type || 'Unknown'}</span></div>
                </div>
                <div class="info-row">
                    <div class="info-label">Address</div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="info-value" style="word-break: break-all; font-family: monospace; font-size: 0.9rem;">${details.usdt_address}</div>
                        <button class="copy-btn" onclick="subscriptionManager.copyToClipboard('${details.usdt_address}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
                ${details.usdt_qr_code_url ? `
                <div class="qr-code-display" style="margin-top: 15px; text-align: center;">
                    <img src="${details.usdt_qr_code_url}" alt="Crypto QR Code" 
                         style="max-width: 150px; border-radius: 8px; border: 1px solid #e2e8f0; cursor: zoom-in;"
                         onclick="subscriptionManager.viewFullImage('${details.usdt_qr_code_url}')">
                    <p style="margin-top: 5px; color: #64748b; font-size: 0.8rem;">Click/Scan to pay</p>
                </div>` : ''}
            </div>`;
        }

        // Other Payment Methods (New)
        if (details.other_payment_number || details.other_payment_details) {
            methodsHtml += `
            <div class="payment-method-card">
                <div class="payment-method-header">
                    <div class="payment-method-icon icon-other" style="background: #f1f5f9; color: #475569; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-wallet"></i>
                    </div>
                    <div>
                        <h4 style="margin: 0;">Other Payment</h4>
                        <p style="margin: 5px 0 0; color: #64748b; font-size: 0.9rem;">Alternative Methods</p>
                    </div>
                </div>
                ${details.other_payment_number ? `
                <div class="info-row">
                    <div class="info-label">Method/Number</div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="info-value">${details.other_payment_number}</div>
                        <button class="copy-btn" onclick="subscriptionManager.copyToClipboard('${details.other_payment_number}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>` : ''}
                ${details.other_payment_details ? `
                <div class="info-row" style="margin-top: 10px;">
                     <div class="info-label">Details</div>
                    <p style="color: #475569; white-space: pre-wrap; margin: 0; font-size: 0.95rem;">${details.other_payment_details}</p>
                </div>` : ''}
            </div>`;
        }

        // Additional Instructions
        if (this.paymentSettings.payment_instructions) {
            methodsHtml += `
                <div class="payment-method-card" style="grid-column: 1 / -1;">
                    <h4><i class="fas fa-info-circle"></i> Payment Instructions</h4>
                    <p style="color: #475569; line-height: 1.6; margin: 10px 0 0;">
                        ${this.paymentSettings.payment_instructions}
                    </p>
                </div>
            `;
        }

        // Contact Info
        if (this.paymentSettings.phone_number) {
            methodsHtml += `
                <div class="payment-method-card" style="grid-column: 1 / -1;">
                    <h4><i class="fas fa-phone"></i> Contact for Payment Issues</h4>
                    <p style="color: #475569; margin: 10px 0 0;">
                        Phone: <strong>${this.paymentSettings.phone_number}</strong>
                    </p>
                </div>
            `;
        }

        container.innerHTML = methodsHtml || `
            <div class="empty-state">
                <p>No payment methods configured</p>
            </div>
        `;
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showNotification('Failed to copy', 'error');
        });
    }

    async submitPayment() {
        const form = document.getElementById('paymentSubmissionForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        if (!this.currentShop) {
            showNotification('Shop information not found', 'error');
            return;
        }

        const paymentDate = document.getElementById('submissionPaymentDate').value;
        const amount = parseFloat(document.getElementById('submissionAmount').value);
        const method = document.getElementById('submissionMethod').value;
        const reference = document.getElementById('submissionReference').value;
        const notes = document.getElementById('submissionNotes').value;

        const paymentData = {
            shop_id: this.currentShop.id,
            subscription_id: this.subscription?.id || null,
            amount: amount,
            payment_date: paymentDate,
            payment_method: method,
            transaction_reference: reference,
            notes: notes,
            status: 'pending',
            created_by: this.currentUser.id
        };

        try {
            showLoading(true);

            const { error } = await supabaseClient
                .from('payment_transactions')
                .insert([paymentData]);

            if (error) throw error;

            showNotification('Payment submitted successfully! Waiting for admin verification.', 'success');
            form.reset();

            // Set today's date again
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('submissionPaymentDate').value = today;

            await this.loadPaymentHistory();
        } catch (error) {
            console.error('Error submitting payment:', error);
            showNotification('Failed to submit payment: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    viewPaymentDetails(paymentId) {
        const payment = this.paymentHistory.find(p => p.id === paymentId);
        if (!payment) return;

        const details = `
Payment Details
────────────────
Date: ${new Date(payment.payment_date).toLocaleDateString()}
Amount: ₹${parseFloat(payment.amount).toFixed(2)}
Method: ${payment.payment_method.toUpperCase()}
Reference: ${payment.transaction_reference || 'N/A'}
Status: ${payment.status.toUpperCase()}
${payment.notes ? '\nNotes: ' + payment.notes : ''}
        `.trim();

        alert(details);
    }

    downloadReceipt(paymentId) {
        const payment = this.paymentHistory.find(p => p.id === paymentId);
        if (!payment) return;

        // Generate simple text receipt
        const receipt = `
═══════════════════════════════════════
         PAYMENT RECEIPT
═══════════════════════════════════════

Shop: ${this.currentShop?.shop_name || 'N/A'}
Receipt ID: ${payment.id}

───────────────────────────────────────
Date: ${new Date(payment.payment_date).toLocaleDateString()}
Amount Paid: ₹${parseFloat(payment.amount).toFixed(2)}
Payment Method: ${payment.payment_method.toUpperCase()}
Transaction Ref: ${payment.transaction_reference || 'N/A'}
Status: ${payment.status.toUpperCase()}
───────────────────────────────────────

${payment.notes ? 'Notes: ' + payment.notes + '\n\n' : ''}
Thank you for your payment!

═══════════════════════════════════════
        `.trim();

        // Create and download
        const blob = new Blob([receipt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payment_receipt_${payment.id.substring(0, 8)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Receipt downloaded', 'success');
    }

    downloadHistory() {
        if (this.paymentHistory.length === 0) {
            showNotification('No payment history to download', 'info');
            return;
        }

        // Generate CSV
        const headers = 'Date,Amount,Method,Reference,Status,Notes\n';
        const rows = this.paymentHistory.map(p => {
            return `${new Date(p.payment_date).toLocaleDateString()},${p.amount},${p.payment_method},${p.transaction_reference || ''},${p.status},"${p.notes || ''}"`;
        }).join('\n');

        const csv = headers + rows;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payment_history_${this.currentShop?.shop_name || 'shop'}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Payment history downloaded', 'success');
    }

    viewFullImage(url) {
        if (!url) return;

        // Create modal if it doesn't exist
        let imgModal = document.getElementById('imageFullViewModal');
        if (!imgModal) {
            const modalHtml = `
                <div class="modal" id="imageFullViewModal" style="z-index: 99999;">
                    <div class="modal-content" style="max-width: 500px; padding: 10px; border-radius: 12px; background: white; text-align: center; position: relative;">
                        <button class="close-modal" style="position: absolute; top: 10px; right: 15px; background: white; border: none; border-radius: 50%; width: 30px; height: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;">&times;</button>
                        <img id="fullViewImage" src="" style="width: 100%; height: auto; border-radius: 8px; max-height: 80vh; object-fit: contain;">
                        <div style="padding: 15px; background: #f8fafc; margin-top: 10px; border-radius: 8px;">
                            <p style="font-weight: 600; color: #1e293b; margin: 0;">Scan QR Code to Pay</p>
                            <p style="font-size: 0.85rem; color: #64748b; margin-top: 5px;">Make sure to save the transaction ID after payment.</p>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            imgModal = document.getElementById('imageFullViewModal');

            // Close logic
            imgModal.querySelector('.close-modal').addEventListener('click', () => {
                imgModal.classList.remove('active');
            });
            imgModal.addEventListener('click', (e) => {
                if (e.target === imgModal) imgModal.classList.remove('active');
            });
        }

        // Set image and show
        const fullImg = document.getElementById('fullViewImage');
        if (fullImg) {
            fullImg.src = url;
            imgModal.classList.add('active');
        }
    }

    showNoSubscriptionMessage() {
        const heroCard = document.querySelector('.subscription-hero');
        if (heroCard) {
            heroCard.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <i class="fas fa-exclamation-circle fa-3x" style="opacity: 0.5; margin-bottom: 15px;"></i>
                    <h3>No Active Subscription</h3>
                    <p style="opacity: 0.9; margin-top: 10px;">
                        Please contact the super administrator to set up your subscription plan.
                    </p>
                </div>
            `;
        }
    }
}

// Initialize subscription manager
const subscriptionManager = new SubscriptionManager();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    subscriptionManager.init();
});
