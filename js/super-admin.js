// Super Admin Manager - COMPLETE WORKING VERSION
class SuperAdminManager {
    constructor() {
        this.currentUser = null;
        this.shops = [];
        this.users = [];
        this.logs = [];
        this.activities = [];
        this.currentFilter = 'all'; // Default filter is all time
        this.earningsChart = null;
        this.init();
    }

    async init() {
        // Check authentication
        this.currentUser = authManager.getCurrentUser();

        if (!this.currentUser || this.currentUser.role !== 'super_admin') {
            showNotification('Access denied. Super admin access required.', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }

        // Update UI
        this.updateUserInfo();

        // Setup event listeners
        this.setupEventListeners();

        // Load initial data with default filter (all time)
        await this.loadDashboardData('all');

        // Load shops for dropdown
        await this.loadShopsForDropdown();

        // Load global categories for shop types
        await this.loadGlobalCategories();
    }

    updateUserInfo() {
        const user = this.currentUser;

        // Update all user info elements
        const elements = {
            'userName': user.full_name || 'Super Admin',
            'userFullName': user.full_name || 'Super Admin',
            'userAvatar': (user.full_name || 'SA').charAt(0).toUpperCase(),
            'welcomeName': user.full_name || 'Super Admin'
        };

        for (const [id, value] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                if (id === 'userAvatar') {
                    element.textContent = value;
                } else {
                    element.textContent = value;
                }
            }
        }

        if (user.email) {
            const emailElement = document.getElementById('userEmail');
            if (emailElement) emailElement.textContent = user.email;
        }
    }

    setupEventListeners() {
        // Navigation - Using delegation for dynamic menu
        document.querySelector('.sidebar').addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link || !link.id) return;

            if (link.id === 'logoutLink' || link.id === 'logoutBtn') {
                e.preventDefault();
                authManager.logout();
                return;
            }

            const navMap = {
                'dashboardLink': { section: 'dashboardOverview', title: 'Dashboard' },
                'shopsLink': { section: 'manageShopsSection', title: 'Manage Shops', action: () => this.loadShops() },
                'usersLink': { section: 'manageUsersSection', title: 'Manage Users', action: () => this.loadUsers() },
                'activityLink': { section: 'activitySection', title: 'Shop Activity', action: () => this.loadActivity() },
                'logsLink': { section: 'logsSection', title: 'Admin Logs', action: () => this.loadLogs() },
                'setupLink': { section: 'setupSection', title: 'System Setup', action: () => this.loadSetupData() }
            };

            const config = navMap[link.id];
            if (config) {
                e.preventDefault();

                // Clear active class from all links
                document.querySelectorAll('.sidebar .nav-links a').forEach(a => a.classList.remove('active'));

                // Add active class to clicked link
                link.classList.add('active');

                this.showSection(config.section);
                document.getElementById('pageTitle').textContent = config.title;
                if (config.action) config.action();
            }
        });

        // Quick actions
        document.getElementById('quickAddShop').addEventListener('click', () => {
            this.showAddShopModal();
        });

        document.getElementById('quickAddUser').addEventListener('click', () => {
            this.showAddUserModal();
        });

        document.getElementById('refreshDashboard').addEventListener('click', () => {
            this.loadDashboardData();
        });

        document.getElementById('viewAllShops').addEventListener('click', () => {
            this.showSection('manageShopsSection');
            document.getElementById('pageTitle').textContent = 'Manage Shops';
            this.loadShops();
        });

        document.getElementById('viewAllShopsCard').addEventListener('click', (e) => {
            e.preventDefault();
            this.showSection('manageShopsSection');
            document.getElementById('pageTitle').textContent = 'Manage Shops';
            this.loadShops();
        });

        document.getElementById('viewAllUsers').addEventListener('click', () => {
            this.showSection('manageUsersSection');
            document.getElementById('pageTitle').textContent = 'Manage Users';
            this.loadUsers();
        });

        document.getElementById('viewAllUsersCard').addEventListener('click', (e) => {
            e.preventDefault();
            this.showSection('manageUsersSection');
            document.getElementById('pageTitle').textContent = 'Manage Users';
            this.loadUsers();
        });

        // Shop management
        document.getElementById('addShopBtn').addEventListener('click', () => {
            this.showAddShopModal();
        });

        document.getElementById('refreshShops').addEventListener('click', () => {
            this.loadShops();
        });

        document.getElementById('saveShopBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.saveShop();
        });

        // User management
        document.getElementById('addUserBtn').addEventListener('click', () => {
            this.showAddUserModal();
        });

        document.getElementById('refreshUsers').addEventListener('click', () => {
            this.loadUsers();
        });

        document.getElementById('saveUserBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.saveUser();
        });

        // Logs management
        document.getElementById('refreshLogs').addEventListener('click', () => {
            this.loadLogs();
        });

        document.getElementById('refreshActivity').addEventListener('click', () => {
            this.loadActivity();
        });

        // Search and filter
        document.getElementById('shopSearch').addEventListener('input', (e) => {
            this.filterShops(e.target.value);
        });

        document.getElementById('userSearch').addEventListener('input', (e) => {
            this.filterUsers(e.target.value);
        });

        document.getElementById('logSearch').addEventListener('input', (e) => {
            this.filterLogs(e.target.value);
        });

        document.getElementById('activitySearch').addEventListener('input', (e) => {
            this.filterActivity(e.target.value);
        });

        // User role change (for permission updates in Add Modal)
        const newRole = document.getElementById('newRole');
        if (newRole) {
            newRole.addEventListener('change', (e) => {
                this.updatePermissionsBasedOnRole(e.target.value, 'add');
            });
        }

        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(button => {
            button.addEventListener('click', () => {
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

        // Setup Section Listeners
        document.getElementById('addGlobalCategoryBtn')?.addEventListener('click', () => this.addGlobalCategory());
        document.getElementById('syncCategoriesBtn')?.addEventListener('click', () => this.syncCategoriesFromProducts());
        document.getElementById('resetSystemCategoriesBtn')?.addEventListener('click', () => this.resetSystemData());
        document.getElementById('saveTypeConfigBtn')?.addEventListener('click', () => this.saveTypeConfig());
        document.getElementById('addMetadataFieldBtn')?.addEventListener('click', () => this.addMetadataFieldRow());
        document.getElementById('configCategorySelect')?.addEventListener('change', () => this.loadTypeConfigForSelectedCategory());
        document.getElementById('saveDomainSettingsBtn')?.addEventListener('click', () => this.saveDomainSettings());

        // Edit/Update buttons
        document.getElementById('updateShopBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.updateShop();
        });

        document.getElementById('deleteShopBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.deleteShop();
        });

        document.getElementById('updateUserBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.updateUser();
        });

        document.getElementById('deleteUserBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.deleteUser();
        });

        // Date filter dropdown
        const dateFilterSelect = document.getElementById('dateFilterSelect');
        if (dateFilterSelect) {
            dateFilterSelect.addEventListener('change', (e) => {
                const filter = e.target.value;
                const customRange = document.getElementById('customDateRange');

                if (filter === 'custom') {
                    customRange.style.display = 'flex';
                } else {
                    customRange.style.display = 'none';
                    this.applyDateFilter(filter);
                }
            });
        }

        // Apply custom date
        const applyCustomDate = document.getElementById('applyCustomDate');
        if (applyCustomDate) {
            applyCustomDate.addEventListener('click', () => {
                this.applyDateFilter('custom');
            });
        }

        // Bulk Delete Listeners
        document.getElementById('selectAllActivity')?.addEventListener('change', (e) => this.toggleSelectAll('activity', e.target.checked));
        document.getElementById('selectAllLogs')?.addEventListener('change', (e) => this.toggleSelectAll('logs', e.target.checked));
        document.getElementById('bulkDeleteActivity')?.addEventListener('click', () => this.handleBulkDelete('activity'));
        document.getElementById('bulkDeleteLogs')?.addEventListener('click', () => this.handleBulkDelete('logs'));

        // Event delegation for checkboxes
        document.getElementById('activityTable')?.addEventListener('change', (e) => {
            if (e.target.classList.contains('activity-checkbox')) {
                this.updateBulkDeleteButton('activity');
            }
        });
        document.getElementById('logsTable')?.addEventListener('change', (e) => {
            if (e.target.classList.contains('logs-checkbox')) {
                this.updateBulkDeleteButton('logs');
            }
        });
    }

    showSection(sectionId) {
        // Update active nav link
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.classList.remove('active');
        });

        if (sectionId === 'dashboardOverview') {
            const link = document.getElementById('dashboardLink');
            if (link) link.classList.add('active');
        } else if (sectionId === 'manageShopsSection') {
            const link = document.getElementById('shopsLink');
            if (link) link.classList.add('active');
        } else if (sectionId === 'manageUsersSection') {
            const link = document.getElementById('usersLink');
            if (link) link.classList.add('active');
        } else if (sectionId === 'activitySection') {
            const link = document.getElementById('activityLink');
            if (link) link.classList.add('active');
        } else if (sectionId === 'logsSection') {
            const link = document.getElementById('logsLink');
            if (link) link.classList.add('active');
        }

        // Hide all sections
        document.querySelectorAll('.page-section').forEach(section => {
            section.classList.remove('active');
        });

        // Show selected section
        document.getElementById(sectionId).classList.add('active');
    }

    async loadTotalShopBalance() {
        try {
            // 1. Total Sales (All Time)
            const { data: salesData } = await supabaseClient.from('sales').select('total_amount');
            const totalSales = salesData?.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0) || 0;

            // 2. Total Income & Expenses (All Time)
            const { data: expData } = await supabaseClient.from('expenses').select('amount, expense_type');
            const totalIncome = expData?.filter(e => e.expense_type === 'income').reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0;
            const totalExpenses = expData?.filter(e => e.expense_type !== 'income').reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0;

            // 3. Total Assets (Shop Current Balance)
            const { data: shopsData } = await supabaseClient.from('shops').select('current_balance');
            const totalAssets = shopsData?.reduce((sum, s) => sum + parseFloat(s.current_balance || 0), 0) || 0;

            // 4. Total Pending Credit (All Time)
            const { data: creditData } = await supabaseClient.from('credits').select('pending_amount');
            const totalPending = creditData?.reduce((sum, c) => sum + parseFloat(c.pending_amount || 0), 0) || 0;

            // Formula: (Sales + Income + Asset) - (Exp + Pending)
            const totalBalance = (totalSales + totalIncome + totalAssets) - (totalExpenses + totalPending);

            const balanceEl = document.getElementById('totalShopBalance');
            if (balanceEl) balanceEl.textContent = formatCurrency(totalBalance);
        } catch (error) {
            console.error('Error calculating total shop balance:', error);
            const balanceEl = document.getElementById('totalShopBalance');
            if (balanceEl) balanceEl.textContent = formatCurrency(0);
        }
    }

    async loadDashboardData(filter = 'all') {
        showLoading(true);

        this.currentFilter = filter;

        // Load All-Time Shop Balance (independent of filters)
        this.loadTotalShopBalance();

        try {
            // Get date range based on filter
            const dateRange = this.getDateRange(filter);

            // 1. Core Core Stats
            const { count: shopsCount } = await supabaseClient.from('shops').select('*', { count: 'exact', head: true });
            document.getElementById('totalShops').textContent = shopsCount || 0;

            const { count: usersCount } = await supabaseClient.from('profiles').select('*', { count: 'exact', head: true });
            document.getElementById('totalUsers').textContent = usersCount || 0;

            // Group 5: Inventory Logistics (Product Count)
            const { count: productsCount } = await supabaseClient.from('products').select('*', { count: 'exact', head: true });
            document.getElementById('totalProducts').textContent = productsCount || 0;

            // 2. Subscription Stats
            // Shops with due payments
            const now = new Date().toISOString();
            const { data: dueSubs } = await supabaseClient
                .from('shop_subscriptions')
                .select('amount')
                .eq('status', 'active')
                .lt('next_payment_date', now);

            const dueCount = dueSubs?.length || 0;
            const dueAmount = dueSubs?.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0) || 0;

            document.getElementById('shopsDuePaymentCount').textContent = dueCount;
            document.getElementById('shopsDuePaymentAmount').textContent = formatCurrency(dueAmount);

            // 3. Earnings & Transactions
            // Total Earnings for filtered period
            let earningsQuery = supabaseClient
                .from('payment_transactions')
                .select('amount')
                .eq('status', 'completed');

            if (dateRange.start) {
                earningsQuery = earningsQuery.gte('payment_date', dateRange.start);
                if (dateRange.end) {
                    earningsQuery = earningsQuery.lte('payment_date', dateRange.end);
                }
            }

            const { data: earningsData } = await earningsQuery;
            const periodEarnings = earningsData?.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) || 0;

            const earningsValueEl = document.getElementById('todaysEarnings');
            const earningsLabelEl = earningsValueEl?.previousElementSibling;

            if (earningsValueEl) earningsValueEl.textContent = formatCurrency(periodEarnings);
            if (earningsLabelEl) {
                const labelsMap = {
                    'today': "Today's Earnings",
                    'yesterday': "Yesterday's Earnings",
                    'week': "Weekly Earnings",
                    'month': "Monthly Earnings",
                    'year': "Yearly Earnings",
                    'custom': "Selected Period Earnings",
                    'all': "Total Earnings"
                };
                earningsLabelEl.textContent = labelsMap[filter] || "Period Earnings";
            }

            // Pending Transactions (Always show all pending)
            const { count: pendingCount } = await supabaseClient
                .from('payment_transactions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');
            document.getElementById('pendingTransactions').textContent = pendingCount || 0;

            // 4. Estimates
            const { data: allActiveSubs } = await supabaseClient
                .from('shop_subscriptions')
                .select('amount, subscription_type')
                .eq('status', 'active');

            let weeklyEst = 0;
            let monthlyEst = 0;

            allActiveSubs?.forEach(sub => {
                const amount = parseFloat(sub.amount || 0);
                if (sub.subscription_type === 'weekly') {
                    weeklyEst += amount;
                    monthlyEst += amount * 4;
                } else if (sub.subscription_type === 'monthly') {
                    weeklyEst += amount / 4;
                    monthlyEst += amount;
                } else if (sub.subscription_type === 'yearly') {
                    weeklyEst += amount / 52;
                    monthlyEst += amount / 12;
                }
            });

            document.getElementById('weeklyEstimate').textContent = formatCurrency(weeklyEst);
            document.getElementById('monthlyEstimate').textContent = formatCurrency(monthlyEst);

            // 5. Earnings Chart
            await this.loadEarningsChartData(filter);

            // Load recent shops
            await this.loadRecentShops();

            // Load recent users
            await this.loadRecentUsers();

        } catch (error) {
            console.error('Dashboard Load Error:', error);
            showNotification('Failed to load dashboard data', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadEarningsChartData(filter) {
        const dateRange = this.getDateRange(filter);

        try {
            let query = supabaseClient
                .from('payment_transactions')
                .select('amount, payment_date')
                .eq('status', 'completed');

            if (dateRange.start) {
                query = query.gte('payment_date', dateRange.start);
                if (dateRange.end) {
                    query = query.lte('payment_date', dateRange.end);
                }
            }

            const { data, error } = await query;
            if (error) throw error;

            this.renderEarningsChart(data || [], filter);
        } catch (error) {
            console.error('Chart Data Error:', error);
            this.renderEarningsChart([], filter); // Show empty state with message
        }
    }

    renderEarningsChart(transactions, filter) {
        const canvas = document.getElementById('earningsChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Group by date
        const groupedData = {};
        const isToday = filter === 'today';

        if (transactions && Array.isArray(transactions)) {
            transactions.forEach(t => {
                const date = new Date(t.payment_date);
                let key;
                if (isToday) {
                    key = date.getHours() + ":00";
                } else {
                    // Use local date string in YYYY-MM-DD format for consistent grouping and sorting
                    key = date.getFullYear() + '-' +
                        String(date.getMonth() + 1).padStart(2, '0') + '-' +
                        String(date.getDate()).padStart(2, '0');
                }
                groupedData[key] = (groupedData[key] || 0) + parseFloat(t.amount || 0);
            });
        }

        let labels = [], values = [];

        if (isToday) {
            // Show all 24 hours for Today filter
            labels = Array.from({ length: 24 }, (_, i) => i + ":00");
            values = labels.map(l => groupedData[l] || 0);
        } else {
            // Sort keys lexically (YYYY-MM-DD works perfectly for this)
            const sortedKeys = Object.keys(groupedData).sort();

            if (sortedKeys.length === 0) {
                // If no data, show at least one label or handle as empty
                labels = [];
                values = [];
            } else {
                // Format labels for display (e.g., "Feb 11")
                labels = sortedKeys.map(k => {
                    const [y, m, d] = k.split('-');
                    const date = new Date(y, m - 1, d);
                    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                });
                values = sortedKeys.map(k => groupedData[k]);
            }
        }

        if (this.earningsChart) {
            this.earningsChart.destroy();
            this.earningsChart = null;
        }

        // If no data and not Today (which shows 24h axis), show a message
        if (values.length === 0 && !isToday) {
            const container = canvas.parentElement;
            if (container) {
                if (!container.querySelector('.no-data-msg')) {
                    container.insertAdjacentHTML('beforeend', `
                        <div class="no-data-msg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--gray); font-style: italic;">
                            No transaction data found for this period
                        </div>
                    `);
                }
            }
            return;
        } else {
            // Remove no-data message if it exists
            canvas.parentElement?.querySelector('.no-data-msg')?.remove();
        }

        this.earningsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Earnings',
                    data: values,
                    borderColor: '#4361ee',
                    backgroundColor: 'rgba(67, 97, 238, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: filter === 'today' ? 0 : 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `Earnings: ${formatCurrency(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#f1f5f9'
                        },
                        ticks: {
                            callback: value => formatCurrency(value),
                            font: { size: 11 }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: 11 },
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    }


    async updateUsersCount() {
        try {
            const { count: usersCount } = await supabaseClient
                .from('profiles')
                .select('*', { count: 'exact', head: true });
            document.getElementById('totalUsers').textContent = usersCount || 0;
        } catch (error) {

        }
    }

    async loadRecentShops() {
        try {
            const { data: shops } = await supabaseClient
                .from('shops')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);

            if (!shops) return this.renderRecentShops([]);

            // Calculate Net Cash/Assets for each shop based on current filter
            const dateRange = this.getDateRange(this.currentFilter || 'all');

            const shopsWithBalance = await Promise.all(shops.map(async (shop) => {
                // Get sales for period
                let salesQuery = supabaseClient.from('sales').select('total_amount').eq('shop_id', shop.id);
                if (dateRange.start) salesQuery = salesQuery.gte('created_at', dateRange.start);
                if (dateRange.end) salesQuery = salesQuery.lte('created_at', dateRange.end);
                const { data: sales } = await salesQuery;
                const totalSales = sales?.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0) || 0;

                // Get credits (Outstanding)
                const { data: credits } = await supabaseClient.from('credits').select('pending_amount').eq('shop_id', shop.id);
                const pendingBalance = credits?.reduce((sum, c) => sum + (parseFloat(c.pending_amount) || 0), 0) || 0;

                // Get income/expenses for period
                let expQuery = supabaseClient.from('expenses').select('amount, expense_type').eq('shop_id', shop.id);
                if (dateRange.start) expQuery = expQuery.gte('expense_date', dateRange.start);
                if (dateRange.end) expQuery = expQuery.lte('expense_date', dateRange.end);
                const { data: expensesData } = await expQuery;

                const totalExpenses = expensesData?.filter(e => e.expense_type !== 'income').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;
                const totalIncome = expensesData?.filter(e => e.expense_type === 'income').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;

                // Formula: (Sales - Outstanding Credit) + Income - Expenses + Shop Asset
                const currentBalance = parseFloat(shop.current_balance) || 0;
                const cashFromSales = totalSales - pendingBalance;
                const netBalance = cashFromSales + totalIncome - totalExpenses + currentBalance;

                return { ...shop, calculatedBalance: netBalance };
            }));

            this.renderRecentShops(shopsWithBalance);
        } catch (error) {
            this.renderRecentShops([]);
        }
    }

    renderRecentShops(shops) {
        const tableBody = document.getElementById('recentShopsTable');
        if (!tableBody) return;

        // Update table header if possible to reflect period
        const tableHeader = document.getElementById('recentShopsTitle');
        if (tableHeader && this.currentFilter) {
            const filterLabels = {
                'all': 'Total',
                'today': 'Today\'s',
                'yesterday': 'Yesterday\'s',
                'week': 'Weekly',
                'month': 'Monthly',
                'year': 'Yearly'
            };
            const label = filterLabels[this.currentFilter] || 'Period';
            tableHeader.innerHTML = `<i class="fas fa-history"></i> Recent Shops (${label} Balance)`;
        }

        if (shops.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No shops found</td></tr>';
            return;
        }

        tableBody.innerHTML = shops.map(shop => {
            const statusBadge = this.renderStatusBadges(shop.status);

            return `
            <tr>
                <td><strong>${shop.shop_name}</strong></td>
                <td><span class="badge badge-info" style="text-transform: capitalize;">${(shop.business_type || 'general').replace('_', ' ')}</span></td>
                <td>${shop.address || 'N/A'}</td>
                <td>${shop.phone || 'N/A'}</td>
                <td>${statusBadge}</td>
                <td><span class="badge ${shop.calculatedBalance >= 0 ? 'badge-success' : 'badge-danger'}" style="font-size: 0.9em; padding: 5px 10px;">
                    ${formatCurrency(shop.calculatedBalance)}
                </span></td>
                <td>${formatDate(shop.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-info view-shop-btn" data-id="${shop.id}" title="View Details">
                        <i class="fas fa-chart-bar"></i> Details
                    </button>
                    <a href="tel:${shop.phone}" class="btn btn-sm btn-success call-shop-btn" title="Call Shop" style="text-decoration: none;">
                        <i class="fas fa-phone"></i> Call
                    </a>
                    <button class="btn btn-sm btn-primary edit-shop-btn" data-id="${shop.id}" title="Edit Shop">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </td>
            </tr>
            `;
        }).join('');

        // Add event listeners to buttons
        tableBody.querySelectorAll('.view-shop-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const shopId = e.currentTarget.dataset.id;
                this.showShopDetails(shopId);
            });
        });

        tableBody.querySelectorAll('.edit-shop-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const shopId = e.currentTarget.dataset.id;
                this.showEditShopModal(shopId);
            });
        });
    }

    async loadRecentUsers() {
        try {
            const { data: users } = await supabaseClient
                .from('profiles')
                .select('*, shops:shop_id(id, shop_name)')
                .order('created_at', { ascending: false })
                .limit(5);

            this.renderRecentUsers(users || []);
        } catch (error) {

            this.renderRecentUsers([]);
        }
    }

    renderRecentUsers(users) {
        const tableBody = document.getElementById('recentUsersTable');
        if (!tableBody) return;

        if (users.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        <div style="padding: 20px; color: var(--gray);">
                            <i class="fas fa-user-clock fa-2x" style="opacity: 0.5; margin-bottom: 10px;"></i>
                            <p>No recent users found</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = users.map(user => {
            // Get shop name correctly
            let shopName = 'No Shop';
            if (user.shops && Array.isArray(user.shops) && user.shops.length > 0) {
                shopName = user.shops[0].shop_name;
            } else if (user.shops && user.shops.shop_name) {
                shopName = user.shops.shop_name;
            }

            return `
                <tr>
                    <td><strong>${user.username || 'N/A'}</strong></td>
                    <td>${user.full_name || 'N/A'}</td>
                    <td>
                        <span class="badge ${this.getRoleBadgeClass(user.role)}">
                            ${this.formatRole(user.role)}
                        </span>
                    </td>
                    <td>${shopName}</td>
                    <td>
                        <span class="${user.is_active ? 'status-active' : 'status-inactive'}">
                            ${user.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>${formatDate(user.created_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-primary edit-user-btn" data-id="${user.id}">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Add event listeners to edit buttons
        document.querySelectorAll('.edit-user-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.id;
                this.showEditUserModal(userId);
            });
        });
    }

    async loadShops() {
        showLoading(true);

        try {
            const { data: shops } = await supabaseClient
                .from('shops')
                .select('*')
                .order('shop_name');

            this.shops = shops || [];
            this.renderShopsTable();
        } catch (error) {
            showNotification('Failed to load shops', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderShopsTable() {
        const tableBody = document.getElementById('shopsTable');
        if (!tableBody) return;

        if (this.shops.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No shops found</td></tr>';
            return;
        }

        tableBody.innerHTML = this.shops.map(shop => {
            const statusBadge = this.renderStatusBadges(shop.status);

            return `
            <tr>
                <td><strong>${shop.shop_name}</strong></td>
                <td><span class="badge badge-info" style="text-transform: capitalize;">${(shop.business_type || 'general').replace('_', ' ')}</span></td>
                <td>${shop.address || 'N/A'}</td>
                <td>${shop.phone || 'N/A'}</td>
                <td>${statusBadge}</td>
                <td>${formatCurrency(shop.current_balance)}</td>
                <td>${formatDate(shop.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-dark visit-shop-btn" data-id="${shop.id}" title="Visit Shop (Super Admin)">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-info view-shop-btn" data-id="${shop.id}">
                        <i class="fas fa-chart-bar"></i> Details
                    </button>
                    <button class="btn btn-sm btn-primary edit-shop-btn" data-id="${shop.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger delete-shop-btn" data-id="${shop.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
            `;
        }).join('');

        // Add event listeners
        this.attachShopEventListeners();
    }

    attachShopEventListeners() {
        document.querySelectorAll('.view-shop-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const shopId = e.currentTarget.dataset.id;
                this.showShopDetails(shopId);
            });
        });

        document.querySelectorAll('.edit-shop-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const shopId = e.currentTarget.dataset.id;
                this.showEditShopModal(shopId);
            });
        });

        document.querySelectorAll('.delete-shop-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const shopId = e.currentTarget.dataset.id;
                if (confirm('Are you sure you want to delete this shop? This will delete all related data.')) {
                    this.deleteShopById(shopId);
                }
            });
        });

        document.querySelectorAll('.visit-shop-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const shopId = e.currentTarget.dataset.id;
                this.visitShop(shopId);
            });
        });
    }

    visitShop(shopId) {
        // Open dashboard in same tab with shop_id parameter
        // This leverages the "Super Admin Visitor Mode" we implemented in auth.js and shop-dashboard.js
        const url = `dashboard.html?shop_id=${shopId}`;
        window.location.href = url;
    }

    async loadUsers() {
        showLoading(true);

        try {
            const { data: users } = await supabaseClient
                .from('profiles')
                .select('*, shops:shop_id(id, shop_name)')
                .order('created_at', { ascending: false });

            this.users = users || [];
            this.renderUsersTable();
        } catch (error) {
            showNotification('Failed to load users', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderUsersTable() {
        const tableBody = document.getElementById('usersTable');
        if (!tableBody) return;

        if (this.users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No users found</td></tr>';
            return;
        }

        tableBody.innerHTML = this.users.map(user => {
            // Get shop name correctly
            let shopName = 'No Shop';
            if (user.shops && Array.isArray(user.shops) && user.shops.length > 0) {
                shopName = user.shops[0].shop_name;
            } else if (user.shops && user.shops.shop_name) {
                shopName = user.shops.shop_name;
            }

            const createdDate = user.created_at ?
                new Date(user.created_at).toLocaleDateString() : 'N/A';

            const lastLogin = user.last_login ?
                new Date(user.last_login).toLocaleString() : 'Never';

            // Online status check (2 minute threshold)
            let isOnline = false;
            if (user.last_seen) {
                const lastSeen = new Date(user.last_seen);
                const now = new Date();
                const diffMs = now - lastSeen;
                const diffMins = Math.floor(diffMs / 60000);
                isOnline = diffMins < 2;
            }

            const roleBadgeClass = this.getRoleBadgeClass(user.role);
            const roleText = this.formatRole(user.role);
            const statusClass = user.is_active ? 'status-active' : 'status-inactive';
            const statusText = user.is_active ? 'Active' : 'Inactive';

            return `
                <tr>
                    <td>
                        <div class="user-info">
                            <strong>${user.username || 'No username'}</strong>
                            ${isOnline ? '<span class="online-indicator" title="Online Now"></span>' : ''}
                            ${user.email ? `<small>${user.email}</small>` : ''}
                        </div>
                    </td>
                    <td>${user.full_name || 'N/A'}</td>
                    <td>
                        <span class="badge ${roleBadgeClass}">
                            ${roleText}
                        </span>
                    </td>
                    <td>${shopName}</td>
                    <td>
                        <span class="${statusClass}">
                            ${statusText}
                        </span>
                        <button class="btn btn-sm toggle-user-status"
                                data-id="${user.id}"
                                data-status="${user.is_active}"
                                title="${user.is_active ? 'Deactivate' : 'Activate'}">
                            <i class="fas fa-power-off ${user.is_active ? 'text-success' : 'text-danger'}"></i>
                        </button>
                    </td>
                    <td>${createdDate}</td>
                    <td>${lastLogin}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary edit-user-btn" data-id="${user.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger delete-user-btn" data-id="${user.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Add event listeners
        this.attachUserEventListeners();
    }

    attachUserEventListeners() {
        document.querySelectorAll('.edit-user-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.id;
                this.showEditUserModal(userId);
            });
        });

        document.querySelectorAll('.delete-user-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.id;
                if (confirm('Are you sure you want to delete this user?')) {
                    this.deleteUserById(userId);
                }
            });
        });
    }

    async loadShopsForDropdown() {
        try {
            const { data: shops } = await supabaseClient
                .from('shops')
                .select('id, shop_name')
                .order('shop_name');

            const dropdown = document.getElementById('userShop');
            if (!dropdown) return;

            // Clear existing options except first one
            dropdown.innerHTML = '<option value="">No Shop Assigned</option>';

            // Add shop options
            shops.forEach(shop => {
                const option = document.createElement('option');
                option.value = shop.id;
                option.textContent = shop.shop_name;
                dropdown.appendChild(option);
            });
        } catch (error) {

        }
    }

    async showAddShopModal() {
        // Ensure categories are loaded
        if (!this.globalCategories || this.globalCategories.length === 0) {
            await this.loadGlobalCategories();
        }

        // Reset form
        document.getElementById('shopName').value = '';
        document.getElementById('shopAddress').value = '';
        document.getElementById('shopPhone').value = '';
        document.getElementById('shopType').value = 'general';
        document.getElementById('initialBalance').value = '0';

        // Show modal
        document.getElementById('addShopModal').classList.add('active');
    }

    async saveShop() {
        const shopName = document.getElementById('shopName').value.trim();
        const address = document.getElementById('shopAddress').value.trim();
        const phone = document.getElementById('shopPhone').value.trim();
        const businessType = document.getElementById('shopType').value;
        const balance = parseFloat(document.getElementById('initialBalance').value) || 0;

        if (!shopName) {
            showNotification('Shop name is required', 'error');
            return;
        }

        showLoading(true);

        try {
            const { data, error } = await supabaseClient
                .from('shops')
                .insert([{
                    shop_name: shopName,
                    address: address || null,
                    phone: phone || null,
                    business_type: businessType,
                    current_balance: balance,
                    created_by: this.currentUser.id
                }])
                .select();

            if (error) throw error;

            showNotification('Shop created successfully!', 'success');
            this.closeAllModals();

            // Refresh all data
            await this.refreshAllData();

            // Record audit log
            await authManager.createAuditLog('create', 'shops', data[0].id, null, {
                shop_name: shopName,
                address: address,
                phone: phone,
                business_type: businessType,
                initial_balance: balance
            });

        } catch (error) {
            showNotification(error.message || 'Failed to create shop', 'error');
        } finally {
            showLoading(false);
        }
    }

    showAddUserModal() {
        // Reset form
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newFullName').value = '';
        document.getElementById('newPhone').value = '';
        document.getElementById('newEmail').value = '';
        document.getElementById('newRole').value = '';
        document.getElementById('userShop').value = '';
        document.getElementById('userActive').checked = true;

        // Reset permissions
        this.updatePermissionsBasedOnRole('', 'add');

        // Show modal
        document.getElementById('addUserModal').classList.add('active');
    }

    async saveUser() {
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value;
        const fullName = document.getElementById('newFullName').value.trim();
        const phone = document.getElementById('newPhone').value.trim();
        const email = document.getElementById('newEmail').value.trim();
        const role = document.getElementById('newRole').value;
        const shopId = document.getElementById('userShop').value || null;
        const isActive = document.getElementById('userActive').checked;

        if (!username || !password || !fullName || !role) {
            showNotification('Please fill all required fields', 'error');
            return;
        }

        // Collect permissions
        const permissions = {};
        const permKeys = ['dashboard', 'shops', 'pos', 'inventory', 'sales', 'credit', 'expenses', 'users', 'settings', 'audit', 'activity'];
        permKeys.forEach(key => {
            const checkbox = document.getElementById(`addPerm${key.charAt(0).toUpperCase() + key.slice(1)}`);
            if (checkbox) {
                permissions[key] = checkbox.checked;
            }
        });

        if (password.length < 6) {
            showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        if ((role === 'shop_admin' || role === 'shop_staff') && !shopId) {
            showNotification('Please assign a shop for shop admin/staff', 'error');
            return;
        }

        showLoading(true);

        try {
            // Check if username exists
            const { data: existingUser } = await supabaseClient
                .from('profiles')
                .select('username')
                .eq('username', username)
                .single();

            if (existingUser) {
                throw new Error('Username already exists');
            }

            // Create user
            const { data, error } = await supabaseClient
                .from('profiles')
                .insert([{
                    username: username,
                    password: password,
                    full_name: fullName,
                    phone: phone || null,
                    email: email || null,
                    role: role,
                    shop_id: shopId,
                    permissions: permissions,
                    is_active: isActive,
                    created_by: this.currentUser.id
                }])
                .select();

            if (error) throw error;

            showNotification('User created successfully!', 'success');
            this.closeAllModals();

            // Record audit log
            await authManager.createAuditLog('create', 'profiles', null, null, {
                username: username,
                full_name: fullName,
                role: role,
                shop_id: shopId
            });

            // Reset form
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('newFullName').value = '';
            document.getElementById('newPhone').value = '';
            document.getElementById('newEmail').value = '';
            document.getElementById('newRole').value = '';
            document.getElementById('userShop').value = '';
            document.getElementById('userActive').checked = true;

            // IMPORTANT: Refresh recent users in dashboard
            await this.loadRecentUsers();

            // Update users count
            await this.updateUsersCount();

            // If on users management page, reload users
            if (document.getElementById('manageUsersSection').classList.contains('active')) {
                await this.loadUsers();
            }

        } catch (error) {
            showNotification(error.message || 'Failed to create user', 'error');
        } finally {
            showLoading(false);
        }
    }

    async refreshAllData() {
        showLoading(true);

        try {
            // Reload dashboard data
            await this.loadDashboardData();

            // Reload shops dropdown
            await this.loadShopsForDropdown();

            // Check which section is active and reload accordingly
            const activeSection = document.querySelector('.page-section.active');
            if (activeSection) {
                if (activeSection.id === 'manageShopsSection') {
                    await this.loadShops();
                } else if (activeSection.id === 'manageUsersSection') {
                    await this.loadUsers();
                }
            }

        } catch (error) {

        } finally {
            showLoading(false);
        }
    }

    async showEditShopModal(shopId) {
        showLoading(true);

        // Ensure categories are loaded
        if (!this.globalCategories || this.globalCategories.length === 0) {
            await this.loadGlobalCategories();
        }

        try {
            const { data: shop, error } = await supabaseClient
                .from('shops')
                .select('*')
                .eq('id', shopId)
                .single();

            if (error) throw error;

            // Populate form
            const form = document.getElementById('editShopForm');
            form.innerHTML = `
                <input type="hidden" id="editShopId" value="${shop.id}">
                <div class="form-group">
                    <label for="editShopName"><i class="fas fa-signature"></i> Shop Name *</label>
                    <input type="text" id="editShopName" value="${shop.shop_name || ''}" required>
                </div>
                
                <div class="form-group">
                    <label for="editShopAddress"><i class="fas fa-map-marker-alt"></i> Address</label>
                    <textarea id="editShopAddress" rows="3">${shop.address || ''}</textarea>
                </div>
                
                <div class="form-group">
                    <label for="editShopPhone"><i class="fas fa-phone"></i> Phone Number</label>
                    <input type="text" id="editShopPhone" value="${shop.phone || ''}">
                </div>
                
                <div class="form-group">
                    <label for="editShopBalance"><i class="fas fa-rupee-sign"></i> Current Balance</label>
                    <input type="number" id="editShopBalance" value="${shop.current_balance || 0}" step="0.01">
                </div>

                <div class="form-group">
                    <label for="editShopType"><i class="fas fa-tags"></i> Shop Type *</label>
                    <select id="editShopType" required>
                        <option value="general" ${shop.business_type === 'general' ? 'selected' : ''}>General Store</option>
                        ${(this.globalCategories || []).map(cat => `
                            <option value="${cat.category_name}" ${shop.business_type === cat.category_name ? 'selected' : ''}>${cat.category_name}</option>
                        `).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label style="font-weight: 700; color: var(--dark); margin-bottom: 10px; display: block;">
                        <i class="fas fa-shield-alt"></i> Shop Access Controls
                    </label>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #f1f5f9; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <label style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; margin: 0; padding: 12px 8px; background: white; border-radius: 10px; border: 1px solid #e2e8f0; transition: all 0.2s; text-align: center; font-size: 0.8rem; font-weight: 700;">
                            <span style="font-size: 1.2rem;">❄️</span>
                            <span>Freeze</span>
                            <input type="checkbox" id="status_frozen" ${shop.status?.includes('frozen') ? 'checked' : ''} style="margin-top: 5px; width: 18px; height: 18px; pointer-events: none;">
                        </label>
                        <label style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; margin: 0; padding: 12px 8px; background: white; border-radius: 10px; border: 1px solid #e2e8f0; transition: all 0.2s; text-align: center; font-size: 0.8rem; font-weight: 700;">
                            <span style="font-size: 1.2rem;">🛑</span>
                            <span>Stop</span>
                            <input type="checkbox" id="status_stopped" ${shop.status?.includes('stopped') ? 'checked' : ''} style="margin-top: 5px; width: 18px; height: 18px; pointer-events: none;">
                        </label>
                        <label style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; margin: 0; padding: 12px 8px; background: white; border-radius: 10px; border: 1px solid #e2e8f0; transition: all 0.2s; text-align: center; font-size: 0.8rem; font-weight: 700;">
                            <span style="font-size: 1.2rem;">⚡</span>
                            <span>Suspend</span>
                            <input type="checkbox" id="status_suspended" ${shop.status?.includes('suspended') ? 'checked' : ''} style="margin-top: 5px; width: 18px; height: 18px; pointer-events: none;">
                        </label>
                        <label style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; margin: 0; padding: 12px 8px; background: white; border-radius: 10px; border: 1px solid #e2e8f0; transition: all 0.2s; text-align: center; font-size: 0.8rem; font-weight: 700;">
                            <span style="font-size: 1.2rem;">⚠️</span>
                            <span>Warning</span>
                            <input type="checkbox" id="status_warning" ${shop.status?.includes('warning') ? 'checked' : ''} style="margin-top: 5px; width: 18px; height: 18px; pointer-events: none;">
                        </label>
                    </div>
                    <small class="text-muted" style="display: block; margin-top: 8px; font-style: italic;">
                        Freeze blocks access, Stop hides data from stats, Suspend shows warning and Warning shows payment alert.
                    </small>
                </div>

                <div style="margin-top: 20px; padding: 15px; background: #fff5f5; border-radius: 8px; border: 1px solid #feb2b2;">
                    <h5 style="margin-bottom: 12px; font-size: 0.9rem; font-weight: 700; color: #c53030;"><i class="fas fa-headset"></i> Super Admin Contact (For this Shop)</h5>
                    <div class="form-group">
                        <label style="font-size: 0.8rem;">WhatsApp Number</label>
                        <input type="text" id="editAdminWhatsapp" value="${shop.admin_whatsapp || ''}" placeholder="+91...">
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.8rem;">Telegram Username</label>
                        <input type="text" id="editAdminTelegram" value="${shop.admin_telegram || ''}" placeholder="@username">
                    </div>
                    <div class="form-group">
                        <label style="font-size: 0.8rem;">Contact Number</label>
                        <input type="text" id="editAdminPhone" value="${shop.admin_phone || ''}" placeholder="+91...">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.8rem;">Note for Admin</label>
                        <textarea id="editAdminNote" rows="2" placeholder="Any specific instructions or notes for the shop admin">${shop.admin_note || ''}</textarea>
                    </div>
                </div>
            `;

            // Show modal
            document.getElementById('editShopModal').classList.add('active');

            // Add click listeners to handle the custom checkbox cards
            const statusLabels = form.querySelectorAll('.form-group div[style*="grid-template-columns"] label');
            statusLabels.forEach(label => {
                // Initial state
                const checkbox = label.querySelector('input[type="checkbox"]');
                if (checkbox && checkbox.checked) {
                    label.style.borderColor = '#4361ee';
                    label.style.background = '#f8fafc';
                }

                label.addEventListener('click', (e) => {
                    const cb = label.querySelector('input[type="checkbox"]');
                    if (cb) {
                        cb.checked = !cb.checked;
                        label.style.borderColor = cb.checked ? '#4361ee' : '#e2e8f0';
                        label.style.background = cb.checked ? '#f8fafc' : 'white';
                    }
                });
            });

        } catch (error) {
            showNotification('Failed to load shop details', 'error');
        } finally {
            showLoading(false);
        }
    }

    async updateShop() {
        const shopId = document.getElementById('editShopId').value;
        const shopName = document.getElementById('editShopName').value.trim();
        const address = document.getElementById('editShopAddress').value.trim();
        const phone = document.getElementById('editShopPhone').value.trim();
        const businessType = document.getElementById('editShopType').value;
        const balance = parseFloat(document.getElementById('editShopBalance').value) || 0;

        const isAdminPhone = document.getElementById('editAdminPhone').value.trim();
        const isAdminWA = document.getElementById('editAdminWhatsapp').value.trim();
        const isAdminTG = document.getElementById('editAdminTelegram').value.trim();
        const isAdminNote = document.getElementById('editAdminNote').value.trim();

        const statuses = [];
        if (document.getElementById('status_frozen').checked) statuses.push('frozen');
        if (document.getElementById('status_stopped').checked) statuses.push('stopped');
        if (document.getElementById('status_suspended').checked) statuses.push('suspended');
        if (document.getElementById('status_warning').checked) statuses.push('warning');
        const status = statuses.length > 0 ? statuses.join(',') : 'active';

        if (!shopName) {
            showNotification('Shop name is required', 'error');
            return;
        }

        showLoading(true);

        try {
            const { error } = await supabaseClient
                .from('shops')
                .update({
                    shop_name: shopName,
                    address: address || null,
                    phone: phone || null,
                    business_type: businessType,
                    current_balance: balance,
                    status: status,
                    admin_phone: isAdminPhone || null,
                    admin_whatsapp: isAdminWA || null,
                    admin_telegram: isAdminTG || null,
                    admin_note: isAdminNote || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', shopId);

            if (error) throw error;

            showNotification('Shop updated successfully!', 'success');
            this.closeAllModals();

            // Record audit log
            await authManager.createAuditLog('update', 'shops', shopId, null, {
                shop_name: shopName,
                address: address,
                phone: phone,
                business_type: businessType,
                balance: balance
            });

            // Refresh all data
            await this.refreshAllData();

        } catch (error) {
            showNotification(error.message || 'Failed to update shop', 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteShop() {
        const shopId = document.getElementById('editShopId').value;

        if (!confirm('Are you sure you want to delete this shop? This will delete all related data.')) {
            return;
        }

        showLoading(true);

        try {
            const { error } = await supabaseClient
                .from('shops')
                .delete()
                .eq('id', shopId);

            if (error) throw error;

            showNotification('Shop deleted successfully!', 'success');
            this.closeAllModals();

            // Record audit log
            await authManager.createAuditLog('delete', 'shops', shopId, null, { shop_id: shopId });

            // Refresh all data
            await this.refreshAllData();

        } catch (error) {
            showNotification(error.message || 'Failed to delete shop', 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteShopById(shopId) {
        if (!confirm('Are you sure you want to delete this shop? This will delete all related data.')) {
            return;
        }

        showLoading(true);

        try {
            const { error } = await supabaseClient
                .from('shops')
                .delete()
                .eq('id', shopId);

            if (error) throw error;

            showNotification('Shop deleted successfully!', 'success');

            // Refresh all data
            await this.refreshAllData();

        } catch (error) {
            showNotification(error.message || 'Failed to delete shop', 'error');
        } finally {
            showLoading(false);
        }
    }

    async showEditUserModal(userId) {
        showLoading(true);

        try {
            const { data: user, error } = await supabaseClient
                .from('profiles')
                .select('*, shops:shop_id(id, shop_name)')
                .eq('id', userId)
                .single();

            if (error) throw error;

            // Handle potential stringified permissions
            let userPermissions = user.permissions || {};
            if (typeof userPermissions === 'string') {
                try {
                    userPermissions = JSON.parse(userPermissions);
                } catch (e) {
                    console.error('Failed to parse user permissions:', e);
                    userPermissions = {};
                }
            }

            // Get all shops for dropdown
            const { data: shops } = await supabaseClient
                .from('shops')
                .select('id, shop_name')
                .order('shop_name');

            // Build shops dropdown options
            let shopsOptions = '<option value="">No Shop Assigned</option>';
            shops.forEach(shop => {
                const selected = shop.id === user.shop_id ? 'selected' : '';
                shopsOptions += `<option value="${shop.id}" ${selected}>${shop.shop_name}</option>`;
            });

            // Populate form
            const form = document.getElementById('editUserForm');
            form.innerHTML = `
                <input type="hidden" id="editUserId" value="${user.id}">
                <div class="form-row">
                    <div class="form-group">
                        <label for="editUsername"><i class="fas fa-user"></i> Username *</label>
                        <input type="text" id="editUsername" value="${user.username || ''}" required readonly>
                        <small style="color: var(--gray); font-size: 0.85rem;">Username cannot be changed</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="editPassword"><i class="fas fa-lock"></i> New Password</label>
                        <input type="password" id="editPassword" placeholder="Leave blank to keep current">
                        <small style="color: var(--gray); font-size: 0.85rem;">Enter new password to change</small>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="editFullName"><i class="fas fa-id-card"></i> Full Name *</label>
                        <input type="text" id="editFullName" value="${user.full_name || ''}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="editPhone"><i class="fas fa-phone"></i> Phone Number</label>
                        <input type="text" id="editPhone" value="${user.phone || ''}">
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="editEmail"><i class="fas fa-envelope"></i> Email</label>
                        <input type="email" id="editEmail" value="${user.email || ''}">
                    </div>
                    
                    <div class="form-group">
                        <label for="editRole"><i class="fas fa-user-tag"></i> Role *</label>
                        <select id="editRole" required>
                            <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                            <option value="shop_admin" ${user.role === 'shop_admin' ? 'selected' : ''}>Shop Admin</option>
                            <option value="shop_staff" ${user.role === 'shop_staff' ? 'selected' : ''}>Shop Staff</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="editUserShop"><i class="fas fa-store"></i> Assign to Shop</label>
                    <select id="editUserShop">
                        ${shopsOptions}
                    </select>
                </div>
                
                <div class="form-group">
                    <div class="form-check">
                        <input type="checkbox" id="editUserActive" ${user.is_active ? 'checked' : ''}>
                        <label for="editUserActive" class="form-check-label">
                            <i class="fas fa-check-circle"></i> Account Active
                        </label>
                    </div>
                </div>

                <!-- Permissions Section -->
                <div class="permissions-section" style="margin-top: 15px; margin-bottom: 20px;">
                    <h5 style="margin-bottom: 10px; font-weight: 600; color: var(--dark); border-bottom: 1px solid var(--light-gray); padding-bottom: 5px;">
                        <i class="fas fa-key"></i> Permissions
                    </h5>
                    <div class="permissions-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">
                        ${this.renderPermissionCheckboxes(userPermissions)}
                    </div>
                </div>
            `;

            // Show modal
            document.getElementById('editUserModal').classList.add('active');

            // Add role change listener for edit form
            const editRole = document.getElementById('editRole');
            if (editRole) {
                editRole.addEventListener('change', (e) => {
                    this.updatePermissionsBasedOnRole(e.target.value, 'edit');
                });
            }

        } catch (error) {
            showNotification('Failed to load user details', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderPermissionCheckboxes(permissions) {
        // Define all available permissions
        const permissionsList = [
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'shops', label: 'Manage Shops' },
            { key: 'pos', label: 'POS' },
            { key: 'inventory', label: 'Inventory' },
            { key: 'sales', label: 'Sales Report' },
            { key: 'credit', label: 'Credit' },
            { key: 'expenses', label: 'Expenses' },
            { key: 'users', label: 'Users' },
            { key: 'settings', label: 'Settings' },
            { key: 'audit', label: 'Audit Log' },
            { key: 'activity', label: 'Activity' }
        ];

        // Generate HTML for each permission checkbox
        return permissionsList.map(perm => {
            const isChecked = permissions[perm.key] ? 'checked' : '';
            const capitalizedKey = perm.key === 'pos' ? 'POS' : perm.key.charAt(0).toUpperCase() + perm.key.slice(1);

            return `
                <div class="form-check">
                    <input type="checkbox" id="editPerm${capitalizedKey}" class="perm-checkbox" ${isChecked}>
                    <label for="editPerm${capitalizedKey}">${perm.label}</label>
                </div>
            `;
        }).join('');
    }

    updatePermissionsBasedOnRole(role, context = 'add') {
        // Define default permissions for each role
        const defaultPermissions = {
            super_admin: {
                dashboard: true,
                shops: true,
                pos: true,
                inventory: true,
                sales: true,
                credit: true,
                expenses: true,
                users: true,
                settings: true,
                audit: true,
                activity: true
            },
            shop_admin: {
                dashboard: true,
                shops: false,
                pos: true,
                inventory: true,
                sales: true,
                credit: true,
                expenses: true,
                users: true,
                settings: true,
                audit: false,
                activity: true
            },
            shop_staff: {
                dashboard: false,
                shops: false,
                pos: true,
                inventory: true,
                sales: false,
                credit: true,
                expenses: false,
                users: false,
                settings: false,
                audit: false,
                activity: false
            }
        };

        const permissions = defaultPermissions[role] || defaultPermissions.shop_staff;
        const prefix = context === 'add' ? 'addPerm' : 'editPerm';

        // Update checkboxes based on role permissions
        Object.keys(permissions).forEach(perm => {
            const capitalizedPerm = perm === 'pos' ? 'POS' : perm.charAt(0).toUpperCase() + perm.slice(1);
            const checkbox = document.getElementById(`${prefix}${capitalizedPerm}`);
            if (checkbox) {
                checkbox.checked = permissions[perm];
            }
        });
    }

    async updateUser() {
        const userId = document.getElementById('editUserId').value;
        const username = document.getElementById('editUsername').value.trim();
        const password = document.getElementById('editPassword').value;
        const fullName = document.getElementById('editFullName').value.trim();
        const phone = document.getElementById('editPhone').value.trim();
        const email = document.getElementById('editEmail').value.trim();
        const role = document.getElementById('editRole').value;
        const shopId = document.getElementById('editUserShop').value || null;
        const isActive = document.getElementById('editUserActive').checked;

        if (!username || !fullName || !role) {
            showNotification('Please fill all required fields', 'error');
            return;
        }

        if ((role === 'shop_admin' || role === 'shop_staff') && !shopId) {
            showNotification('Please assign a shop for shop admin/staff', 'error');
            return;
        }

        // Collect permissions
        const permissions = {};
        const permKeys = ['dashboard', 'shops', 'pos', 'inventory', 'sales', 'credit', 'expenses', 'users', 'settings', 'audit', 'activity'];
        permKeys.forEach(key => {
            const capitalizedKey = key === 'pos' ? 'POS' : key.charAt(0).toUpperCase() + key.slice(1);
            const checkbox = document.getElementById(`editPerm${capitalizedKey}`);
            if (checkbox) {
                permissions[key] = checkbox.checked;
            }
        });

        showLoading(true);

        try {
            // Prepare update data
            const updateData = {
                full_name: fullName,
                phone: phone || null,
                email: email || null,
                role: role,
                shop_id: shopId,
                permissions: permissions,
                is_active: isActive,
                updated_at: new Date().toISOString()
            };

            // Only update password if provided
            if (password && password.trim() !== '') {
                if (password.length < 6) {
                    throw new Error('Password must be at least 6 characters');
                }
                updateData.password = password;
            }

            // Update user
            const { error } = await supabaseClient
                .from('profiles')
                .update(updateData)
                .eq('id', userId);

            if (error) throw error;

            showNotification('User updated successfully!', 'success');
            this.closeAllModals();

            // Record audit log
            await authManager.createAuditLog('update', 'profiles', userId, null, {
                username: username,
                full_name: fullName,
                role: role,
                is_active: isActive
            });

            // Refresh all data
            await this.refreshAllData();

        } catch (error) {
            showNotification(error.message || 'Failed to update user', 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteUser() {
        const userId = document.getElementById('editUserId').value;

        if (!confirm('Are you sure you want to delete this user?')) {
            return;
        }

        showLoading(true);

        try {
            // First, delete associated audit logs to satisfy foreign key constraint
            await supabaseClient
                .from('audit_logs')
                .delete()
                .eq('user_id', userId);

            // Now delete the profile
            const { error } = await supabaseClient
                .from('profiles')
                .delete()
                .eq('id', userId);

            if (error) throw error;

            showNotification('User deleted successfully!', 'success');
            this.closeAllModals();

            // Record audit log
            await authManager.createAuditLog('delete', 'profiles', userId, null, { user_id: userId });

            // Refresh all data
            await this.refreshAllData();

        } catch (error) {
            showNotification(error.message || 'Failed to delete user', 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteUserById(userId) {
        if (!confirm('Are you sure you want to delete this user?')) {
            return;
        }

        showLoading(true);

        try {
            // First, delete associated audit logs to satisfy foreign key constraint
            await supabaseClient
                .from('audit_logs')
                .delete()
                .eq('user_id', userId);

            // Now delete the profile
            const { error } = await supabaseClient
                .from('profiles')
                .delete()
                .eq('id', userId);

            if (error) throw error;

            showNotification('User deleted successfully!', 'success');

            // Refresh all data
            await this.refreshAllData();

        } catch (error) {
            showNotification(error.message || 'Failed to delete user', 'error');
        } finally {
            showLoading(false);
        }
    }

    filterShops(searchTerm) {
        if (!searchTerm) {
            this.renderShopsTable();
            return;
        }

        const filteredShops = this.shops.filter(shop =>
            shop.shop_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (shop.address && shop.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (shop.phone && shop.phone.includes(searchTerm))
        );

        this.renderFilteredShops(filteredShops);
    }

    renderFilteredShops(filteredShops) {
        const tableBody = document.getElementById('shopsTable');
        if (!tableBody) return;

        if (filteredShops.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No shops found</td></tr>';
            return;
        }

        tableBody.innerHTML = filteredShops.map(shop => {
            const statusBadge = this.renderStatusBadges(shop.status);

            return `
            <tr>
                <td><strong>${shop.shop_name}</strong></td>
                <td>${shop.address || 'N/A'}</td>
                <td>${shop.phone || 'N/A'}</td>
                <td>${statusBadge}</td>
                <td>${formatCurrency(shop.current_balance)}</td>
                <td>${formatDate(shop.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-dark visit-shop-btn" data-id="${shop.id}" title="Visit Shop">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-primary edit-shop-btn" data-id="${shop.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-danger delete-shop-btn" data-id="${shop.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
            `;
        }).join('');

        // Reattach event listeners
        this.attachShopEventListeners();
    }

    filterUsers(searchTerm) {
        if (!searchTerm) {
            this.renderUsersTable();
            return;
        }

        const filteredUsers = this.users.filter(user =>
            user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.full_name && user.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        this.renderFilteredUsers(filteredUsers);
    }

    renderFilteredUsers(filteredUsers) {
        const tableBody = document.getElementById('usersTable');
        if (!tableBody) return;

        if (filteredUsers.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No users found</td></tr>';
            return;
        }

        tableBody.innerHTML = filteredUsers.map(user => {
            // Get shop name correctly
            let shopName = 'No Shop';
            if (user.shops && Array.isArray(user.shops) && user.shops.length > 0) {
                shopName = user.shops[0].shop_name;
            } else if (user.shops && user.shops.shop_name) {
                shopName = user.shops.shop_name;
            }

            return `
                <tr>
                    <td><strong>${user.username || 'N/A'}</strong></td>
                    <td>${user.full_name || 'N/A'}</td>
                    <td>
                        <span class="badge ${this.getRoleBadgeClass(user.role)}">
                            ${this.formatRole(user.role)}
                        </span>
                    </td>
                    <td>${shopName}</td>
                    <td>
                        <span class="${user.is_active ? 'status-active' : 'status-inactive'}">
                            ${user.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>${formatDate(user.created_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-primary edit-user-btn" data-id="${user.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-user-btn" data-id="${user.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Reattach event listeners
        this.attachUserEventListeners();
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }


    getRoleBadgeClass(role) {
        switch (role) {
            case 'super_admin': return 'badge-danger';
            case 'shop_admin': return 'badge-primary';
            case 'shop_staff': return 'badge-info';
            default: return 'badge-secondary';
        }
    }

    formatRole(role) {
        switch (role) {
            case 'super_admin': return 'Super Admin';
            case 'shop_admin': return 'Shop Admin';
            case 'shop_staff': return 'Shop Staff';
            default: return role;
        }
    }

    renderStatusBadges(status) {
        if (!status || status === 'active') {
            return '<span class="badge badge-success">Active</span>';
        }

        let badges = [];
        if (status.includes('frozen')) badges.push('<span class="badge badge-primary"><i class="fas fa-snowflake"></i> Frozen</span>');
        if (status.includes('stopped')) badges.push('<span class="badge badge-dark"><i class="fas fa-hand-paper"></i> Stopped</span>');
        if (status.includes('suspended')) badges.push('<span class="badge badge-danger"><i class="fas fa-exclamation-circle"></i> Suspend</span>');
        if (status.includes('warning')) badges.push('<span class="badge badge-warning"><i class="fas fa-exclamation-triangle"></i> Warning</span>');

        return badges.length > 0 ? `<div style="display:flex; flex-direction:column; gap:4px;">${badges.join('')}</div>` : '<span class="badge badge-success">Active</span>';
    }

    // Helper method to get date range based on filter
    getDateRange(filter) {
        const now = new Date();
        let start, end;

        switch (filter) {
            case 'today':
                start = new Date(now);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setHours(23, 59, 59, 999);
                break;

            case 'yesterday':
                start = new Date(now);
                start.setDate(start.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setDate(end.getDate() - 1);
                end.setHours(23, 59, 59, 999);
                break;

            case 'week':
                start = new Date(now);
                const dayOfWeek = start.getDay();
                const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as first day
                start.setDate(start.getDate() - diff);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setHours(23, 59, 59, 999);
                break;

            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setHours(23, 59, 59, 999);
                break;

            case 'year':
                start = new Date(now.getFullYear(), 0, 1);
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setHours(23, 59, 59, 999);
                break;

            case 'custom':
                const startInput = document.getElementById('startDate')?.value;
                const endInput = document.getElementById('endDate')?.value;
                if (startInput) {
                    start = new Date(startInput);
                    start.setHours(0, 0, 0, 0);
                } else {
                    start = new Date(0); // Beginning of time if no start
                }
                if (endInput) {
                    end = new Date(endInput);
                    end.setHours(23, 59, 59, 999);
                } else {
                    end = new Date(); // Now if no end
                }
                break;

            case 'all':
            default:
                return { start: null, end: null };
        }

        return {
            start: start.toISOString(),
            end: end.toISOString()
        };
    }

    // Apply date filter
    async applyDateFilter(filter) {
        // Update dropdown value
        const dateFilterSelect = document.getElementById('dateFilterSelect');
        if (dateFilterSelect) {
            dateFilterSelect.value = filter;
        }

        // Reload dashboard with new filter
        await this.loadDashboardData(filter);
    }

    // Show shop details modal
    async showShopDetails(shopId) {
        let shop = this.shops.find(s => s.id === shopId);

        if (!shop) {

            try {
                const { data, error } = await supabaseClient
                    .from('shops')
                    .select('*')
                    .eq('id', shopId)
                    .single();

                if (error) throw error;
                shop = data;
            } catch (error) {

                showNotification('Shop not found', 'error');
                return;
            }
        }

        // Store current shop ID for filtering
        this.currentShopId = shopId;

        // Set shop basic info
        const shopNameEl = document.getElementById('shopDetailsName');
        const shopAddressEl = document.getElementById('shopDetailsAddress');

        if (shopNameEl) shopNameEl.textContent = shop.shop_name;
        if (shopAddressEl) shopAddressEl.textContent = shop.address || 'N/A';

        // Show modal
        const modal = document.getElementById('shopDetailsModal');
        if (modal) {
            modal.classList.add('active');
        }

        // Load shop data with default filter (month)
        await this.loadShopDetailsData(shopId, 'month');

        // Add filter change listener
        const detailsFilter = document.getElementById('shopDetailsFilter');
        if (detailsFilter) {
            detailsFilter.onchange = (e) => {
                this.loadShopDetailsData(shopId, e.target.value);
            };
        }
    }

    // Load shop details data
    async loadShopDetailsData(shopId, filter) {

        showLoading(true);

        try {
            const dateRange = this.getDateRange(filter);


            // Update filter label
            const filterLabels = {
                'today': 'Today',
                'yesterday': 'Yesterday',
                'week': 'This Week',
                'month': 'This Month',
                'year': 'This Year'
            };
            document.getElementById('shopDetailsFilterLabel').textContent = filterLabels[filter] || 'This Month';

            // 1. Get total sales for the period
            let salesQuery = supabaseClient.from('sales').select('id, total_amount, discount_amount, created_at').eq('shop_id', shopId);

            if (dateRange.start) {
                salesQuery = salesQuery.gte('created_at', dateRange.start);
                if (dateRange.end) {
                    salesQuery = salesQuery.lte('created_at', dateRange.end);
                }
            }

            const { data: sales, error: salesErr } = await salesQuery;
            if (salesErr) throw salesErr;

            const totalSales = sales?.reduce((sum, sale) => sum + (parseFloat(sale.total_amount) || 0), 0) || 0;
            const totalDiscounts = sales?.reduce((sum, sale) => sum + (parseFloat(sale.discount_amount) || 0), 0) || 0;
            document.getElementById('shopDetailsTotalSales').textContent = formatCurrency(totalSales);


            // 2. Get stock information and product count
            const { data: products, error: prodErr } = await supabaseClient
                .from('products')
                .select('*')
                .eq('shop_id', shopId);

            if (prodErr) throw prodErr;

            // Defensive: Check both 'stock' and 'quantity' columns
            const inStock = products?.reduce((sum, p) => {
                const stockVal = parseInt(p.stock) || parseInt(p.quantity) || 0;
                return sum + stockVal;
            }, 0) || 0;

            const outOfStock = products?.filter(p => {
                const stockVal = parseInt(p.stock) || parseInt(p.quantity) || 0;
                return stockVal === 0;
            }).length || 0;

            const productCount = products?.length || 0;

            const totalInventorySellingValue = products?.reduce((sum, p) => {
                const stockVal = parseInt(p.stock) || parseInt(p.quantity) || 0;
                const price = parseFloat(p.selling_price) || 0;
                return sum + (stockVal * price);
            }, 0) || 0;

            document.getElementById('shopDetailsInStock').textContent = inStock;
            document.getElementById('shopDetailsOutStock').textContent = outOfStock;
            document.getElementById('shopDetailsProductCount').textContent = productCount;


            // 3. Calculate actual profit for the period
            let totalProfit = 0;
            if (sales && sales.length > 0) {
                const saleIds = sales.map(s => s.id);
                // Fetch sale items
                const { data: saleItems, error: itemsErr } = await supabaseClient
                    .from('sale_items')
                    .select('product_id, quantity, unit_price, cost_price') // Added cost_price
                    .in('sale_id', saleIds);

                if (!itemsErr && saleItems && saleItems.length > 0) {
                    // Determine product costs (robust fetch) - for fallback
                    const productIds = [...new Set(saleItems.map(item => item.product_id).filter(id => id))];
                    let productCosts = {};

                    if (productIds.length > 0) {
                        const { data: productsForCost, error: pCostErr } = await supabaseClient
                            .from('products')
                            .select('id, cost_price')
                            .in('id', productIds);

                        if (!pCostErr && productsForCost) {
                            productsForCost.forEach(p => {
                                productCosts[p.id] = parseFloat(p.cost_price || 0);
                            });
                        }
                    }

                    saleItems.forEach(item => {
                        // Use recorded cost price first, then fallback to current product cost
                        let costPrice = 0;
                        if (item.cost_price !== null && item.cost_price !== undefined) {
                            costPrice = parseFloat(item.cost_price);
                        } else {
                            costPrice = productCosts[item.product_id] || 0;
                        }

                        const sellingPrice = parseFloat(item.unit_price) || 0;
                        totalProfit += (sellingPrice - costPrice) * (parseInt(item.quantity) || 0);
                    });

                    // Subtract global discounts from the gross profit
                    totalProfit -= totalDiscounts;
                }
            }
            document.getElementById('shopDetailsTotalProfit').textContent = formatCurrency(totalProfit);

            // Calculate Profit Margin (Markup)
            const totalCostForMargin = totalSales - totalProfit;
            let profitMargin = 0;
            if (totalCostForMargin > 0) {
                profitMargin = (totalProfit / totalCostForMargin) * 100;
            } else if (totalSales > 0) {
                profitMargin = 100;
            }
            if (document.getElementById('shopDetailsProfitMargin')) {
                document.getElementById('shopDetailsProfitMargin').textContent = `${profitMargin.toFixed(1)}%`;
            }

            // 4. Get credit information (Filtered by dateRange)
            let creditQuery = supabaseClient
                .from('credits')
                .select('total_amount, pending_amount, credit_date')
                .eq('shop_id', shopId);

            if (dateRange.start) {
                creditQuery = creditQuery.gte('credit_date', dateRange.start.split('T')[0]);
                if (dateRange.end) {
                    creditQuery = creditQuery.lte('credit_date', dateRange.end.split('T')[0]);
                }
            }

            const { data: credits, error: creditErr } = await creditQuery;

            const totalCredit = credits?.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0) || 0;
            const pendingBalance = credits?.reduce((sum, c) => sum + (parseFloat(c.pending_amount) || 0), 0) || 0;

            document.getElementById('shopDetailsTotalCredit').textContent = formatCurrency(totalCredit);

            // Update credit label to reflect filter if it exists
            const creditFilterLabel = document.querySelector('#shopDetailsTotalCredit + .change');
            if (creditFilterLabel) {
                creditFilterLabel.textContent = filterLabels[filter] || 'All Time';
            }

            document.getElementById('shopDetailsPendingBalance').textContent = formatCurrency(pendingBalance);


            // 5. Get current shop balance
            const { data: shopData, error: shopErr } = await supabaseClient
                .from('shops')
                .select('current_balance')
                .eq('id', shopId)
                .single();

            if (shopErr) throw shopErr;
            const currentBalance = parseFloat(shopData?.current_balance) || 0;

            // 6. Get expenditures and income for the period
            let expensesQuery = supabaseClient.from('expenses').select('amount, expense_type').eq('shop_id', shopId);
            if (dateRange.start) {
                expensesQuery = expensesQuery.gte('expense_date', dateRange.start);
                if (dateRange.end) {
                    expensesQuery = expensesQuery.lte('expense_date', dateRange.end);
                }
            }
            const { data: expensesData, error: expErr } = await expensesQuery;
            if (expErr) {

            }

            const totalExpenses = expensesData?.filter(e => e.expense_type !== 'income').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;
            const totalIncome = expensesData?.filter(e => e.expense_type === 'income').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;
            const totalExpenditure = totalExpenses; // Keep this for valuation calculation if needed


            // 7. Calculate Independent All-Time Stats for "Shop Balance" and "Shop Valuation"
            // Fetch ALL-TIME Sales
            const { data: allSales } = await supabaseClient.from('sales').select('total_amount').eq('shop_id', shopId);
            const allTimeSales = allSales?.reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0) || 0;

            // Fetch ALL-TIME Expenses & Income
            const { data: allExpensesData } = await supabaseClient.from('expenses').select('amount, expense_type').eq('shop_id', shopId);
            const allTimeExpenses = allExpensesData?.filter(e => e.expense_type !== 'income').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;
            const allTimeIncome = allExpensesData?.filter(e => e.expense_type === 'income').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;

            // Fetch ALL-TIME Credits for Pending
            const { data: allCreditsData } = await supabaseClient.from('credits').select('pending_amount').eq('shop_id', shopId);
            const allTimePending = allCreditsData?.reduce((sum, c) => sum + (parseFloat(c.pending_amount) || 0), 0) || 0;

            // Calculate ACTUAL Current Balance (Cash in Hand) - All Time
            // Formula: (allSales + allIncome + currentBalance) - (allExpenses + allPending)
            const actualCashInHand = (allTimeSales + allTimeIncome + currentBalance) - (allTimeExpenses + allTimePending);
            document.getElementById('shopDetailsCurrentBalance').textContent = formatCurrency(actualCashInHand);

            // Calculate ACTUAL Shop Valuation - All Time
            // Formula: (allSales + ActualCashInHand + ProductSellValue) - allExpenses
            const valuation = (allTimeSales + actualCashInHand + totalInventorySellingValue) - allTimeExpenses;
            document.getElementById('shopDetailsValuation').textContent = formatCurrency(valuation);

            // 8. Calculate Today's Expenses
            const todayRange = this.getDateRange('today');
            let todayExpensesQuery = supabaseClient.from('expenses')
                .select('amount')
                .eq('shop_id', shopId)
                .eq('expense_type', 'expense');

            if (todayRange.start) {
                todayExpensesQuery = todayExpensesQuery.gte('expense_date', todayRange.start);
                if (todayRange.end) {
                    todayExpensesQuery = todayExpensesQuery.lte('expense_date', todayRange.end);
                }
            }

            const { data: todayExpenses } = await todayExpensesQuery;
            const totalTodayExpenses = todayExpenses?.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;
            document.getElementById('shopDetailsTodayExpenses').textContent = formatCurrency(totalTodayExpenses);

            // 9. Calculate Product Value (Cost) - Total inventory cost value
            const totalInventoryCostValue = products?.reduce((sum, p) => {
                const stockVal = parseInt(p.stock) || parseInt(p.quantity) || 0;
                const costPrice = parseFloat(p.cost_price) || 0;
                return sum + (stockVal * costPrice);
            }, 0) || 0;
            document.getElementById('shopDetailsProductCostValue').textContent = formatCurrency(totalInventoryCostValue);

            // 10. Product Sell Value (already calculated as totalInventorySellingValue)
            document.getElementById('shopDetailsProductSellValue').textContent = formatCurrency(totalInventorySellingValue);





        } catch (error) {

            showNotification('Failed to load shop details', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadLogs() {

        showLoading(true);

        try {
            const { data, error } = await supabaseClient
                .from('audit_logs')
                .select(`
                    *,
                    profiles:user_id(username, full_name),
                    shops:shop_id(shop_name)
                `)
                .in('table_name', ['profiles', 'shops', 'categories', 'auth', 'shop_settings'])
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) throw error;

            this.logs = data || [];
            this.renderLogsTable();

        } catch (error) {

            showNotification('Failed to load admin logs', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadActivity() {

        showLoading(true);

        try {
            const { data, error } = await supabaseClient
                .from('audit_logs')
                .select(`
                    *,
                    profiles:user_id(username, full_name),
                    shops:shop_id(shop_name)
                `)
                .in('table_name', ['sales', 'products', 'credits', 'credit_payments', 'expenses', 'customers', 'sale_items', 'backups', 'call_history'])
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) throw error;

            this.activities = data || [];
            this.renderActivityTable();

        } catch (error) {

            showNotification('Failed to load shop activities', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderActivityTable(data = this.activities) {
        const tableBody = document.getElementById('activityTable');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No activity found</td></tr>';
            return;
        }

        tableBody.innerHTML = data.map(log => {
            const userName = log.profiles?.full_name || log.profiles?.username || 'Unknown User';
            const shopName = log.shops?.shop_name || 'System / All Shops';
            const details = this.formatLogDetails(log);

            return `
                <tr>
                    <td><input type="checkbox" class="activity-checkbox" value="${log.id}"></td>
                    <td>${formatDate(log.created_at)}</td>
                    <td><strong>${userName}</strong></td>
                    <td>${shopName}</td>
                    <td><span class="badge badge-info">${log.action_type || 'Action'}</span></td>
                    <td><span class="badge badge-secondary">${log.table_name || 'N/A'}</span></td>
                    <td><small class="text-muted" title='${JSON.stringify(log.new_data || {})}'>${details}</small></td>
                </tr>
            `;
        }).join('');
    }

    renderFilteredActivity(filtered) {
        const tableBody = document.getElementById('activityTable');
        if (!tableBody) return;

        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No activity found matching your search</td></tr>';
            return;
        }

        tableBody.innerHTML = filtered.map(log => {
            const userName = log.profiles?.full_name || log.profiles?.username || 'Unknown User';
            const shopName = log.shops?.shop_name || 'System / All Shops';
            const details = this.formatLogDetails(log);

            return `
                <tr>
                    <td><input type="checkbox" class="activity-checkbox" value="${log.id}" onchange="superAdminManager.updateBulkDeleteButton('activity')"></td>
                    <td>${formatDate(log.created_at)}</td>
                    <td><strong>${userName}</strong></td>
                    <td>${shopName}</td>
                    <td><span class="badge badge-info">${log.action_type || 'Action'}</span></td>
                    <td><span class="badge badge-secondary">${log.table_name || 'N/A'}</span></td>
                    <td><small class="text-muted" title='${JSON.stringify(log.new_data || {})}'>${details}</small></td>
                </tr>
            `;
        }).join('');
    }

    formatLogDetails(log) {
        const data = log.new_data || {};
        const action = log.action_type?.toLowerCase();
        const table = log.table_name?.toLowerCase();

        if (table === 'sales' && action === 'sell') {
            return `Sale: ${data.invoice_number} | Amount: ${formatCurrency(data.total_amount)} | Items: ${data.items_count}`;
        }

        if (table === 'products') {
            if (action === 'create') return `Added product: ${data.product_name} (Stock: ${data.stock})`;
            if (action === 'update') return `Updated product: ${data.product_name} (Stock: ${data.stock})`;
            if (action === 'delete') return `Deleted product ID: ${data.product_id || log.record_id}`;
        }

        if (table === 'credits') {
            if (action === 'create') return `New Credit: ${data.buyer_name} | Amount: ${formatCurrency(data.total_amount)}`;
            if (action === 'payment') return `Payment from ${data.buyer_name}: ${formatCurrency(data.amount)}`;
            if (action === 'delete') return `Deleted credit record ID: ${data.credit_id || log.record_id}`;
        }

        if (table === 'expenses') {
            if (action === 'create') return `Added expense: ${data.description} | Amount: ${formatCurrency(data.amount)}`;
            if (action === 'update') return `Updated expense: ${data.description}`;
            if (action === 'delete') return `Deleted expense ID: ${log.record_id}`;
        }

        if (table === 'auth') {
            if (action === 'login') return `User logged in: ${data.username}`;
            if (action === 'logout') return `User logged out: ${data.username}`;
        }

        if (table === 'shops') {
            if (action === 'create') return `Created shop: ${data.shop_name}`;
            if (action === 'update') return `Updated shop: ${data.shop_name}`;
        }

        if (table === 'profiles') {
            if (action === 'create') return `Created user: ${data.full_name || data.username}`;
        }

        // Fallback to generic representation
        const details = log.new_data ? JSON.stringify(log.new_data) : (log.action_type || 'N/A');
        return this.truncateString(details, 80);
    }

    filterActivity(searchTerm) {
        if (!searchTerm) {
            this.renderActivityTable();
            return;
        }

        const filtered = this.activities.filter(log => {
            const userMatch = (log.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.profiles?.username?.toLowerCase().includes(searchTerm.toLowerCase()));
            const actionMatch = log.action_type?.toLowerCase().includes(searchTerm.toLowerCase());
            const shopMatch = log.shops?.shop_name?.toLowerCase().includes(searchTerm.toLowerCase());
            const tableMatch = log.table_name?.toLowerCase().includes(searchTerm.toLowerCase());
            const detailsMatch = JSON.stringify(log.new_data || {}).toLowerCase().includes(searchTerm.toLowerCase());

            return userMatch || actionMatch || shopMatch || tableMatch || detailsMatch;
        });

        this.renderActivityTable(filtered);
    }

    truncateString(str, num) {
        if (!str) return 'N/A';
        if (str.length <= num) return str;
        return str.slice(0, num) + '...';
    }


    renderLogsTable(data = this.logs) {
        const tableBody = document.getElementById('logsTable');
        if (!tableBody) return;

        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No logs found</td></tr>';
            return;
        }

        tableBody.innerHTML = data.map(log => {
            const userName = log.profiles?.full_name || log.profiles?.username || 'Unknown User';
            const shopName = log.shops?.shop_name || 'System / All Shops';
            const details = this.formatLogDetails(log);

            return `
                <tr>
                    <td><input type="checkbox" class="logs-checkbox" value="${log.id}" onchange="superAdminManager.updateBulkDeleteButton('logs')"></td>
                    <td>${formatDate(log.created_at)}</td>
                    <td><strong>${userName}</strong></td>
                    <td><span class="badge badge-info">${log.action_type || 'Action'}</span></td>
                    <td>${shopName}</td>
                    <td><span class="badge badge-secondary">${log.table_name || 'N/A'}</span></td>
                    <td><small class="text-muted" title='${JSON.stringify(log.new_data || {})}'>${details}</small></td>
                </tr>
            `;
        }).join('');
    }

    filterLogs(searchTerm) {
        if (!searchTerm) {
            this.renderLogsTable();
            return;
        }

        const filteredLogs = this.logs.filter(log => {
            const userMatch = (log.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                log.profiles?.username?.toLowerCase().includes(searchTerm.toLowerCase()));
            const actionMatch = log.action_type?.toLowerCase().includes(searchTerm.toLowerCase());
            const shopMatch = log.shops?.shop_name?.toLowerCase().includes(searchTerm.toLowerCase());
            const tableMatch = log.table_name?.toLowerCase().includes(searchTerm.toLowerCase());

            return userMatch || actionMatch || shopMatch || tableMatch;
        });

        this.renderLogsTable(filteredLogs);
    }



    truncateString(str, num) {
        if (!str) return '';
        if (str.length <= num) return str;
        return str.slice(0, num) + '...';
    }

    // --- SYSTEM SETUP & CONFIGURATION ---

    async loadSetupData() {
        await this.loadGlobalCategories();
        await this.loadTypeConfigForSelectedCategory();
        await this.loadDomainSettings();
    }

    async loadDomainSettings() {
        const mgmtInp = document.getElementById('mgmtDomain');
        const publicInp = document.getElementById('publicDomain');
        if (!mgmtInp || !publicInp) return;

        try {
            const { data, error } = await supabaseClient
                .from('system_configs')
                .select('key, value')
                .or('key.eq.mgmt_domain,key.eq.public_shop_domain');

            if (error) throw error;

            data?.forEach(cfg => {
                if (cfg.key === 'mgmt_domain') mgmtInp.value = cfg.value;
                if (cfg.key === 'public_shop_domain') publicInp.value = cfg.value;
            });
        } catch (error) {
            console.error('Failed to load domain settings:', error);
        }
    }

    async saveDomainSettings() {
        let mgmtDomain = document.getElementById('mgmtDomain').value.trim();
        let publicDomain = document.getElementById('publicDomain').value.trim();

        // Sanitize: remove http/https and trailing slash
        mgmtDomain = mgmtDomain.replace(/^https?:\/\//, '').split('/')[0].trim();
        publicDomain = publicDomain.replace(/^https?:\/\//, '').split('/')[0].trim();

        const status = document.getElementById('domainSaveStatus');

        showLoading(true);
        try {
            const updates = [
                { key: 'mgmt_domain', value: mgmtDomain, updated_at: new Date().toISOString() },
                { key: 'public_shop_domain', value: publicDomain, updated_at: new Date().toISOString() }
            ];

            const { error } = await supabaseClient
                .from('system_configs')
                .upsert(updates, { onConflict: 'key' });

            if (error) throw error;

            if (status) {
                status.style.display = 'block';
                setTimeout(() => status.style.display = 'none', 3000);
            }
            showNotification('Domain settings saved!', 'success');
        } catch (error) {
            showNotification('Failed to save domain settings', 'error');
            console.error(error);
        } finally {
            showLoading(false);
        }
    }

    async loadGlobalCategories() {
        try {
            const { data: categories, error } = await supabaseClient
                .from('categories')
                .select('*')
                .order('category_name');

            if (error) throw error;

            this.globalCategories = categories || [];

            // Update UI list if it exists
            const list = document.getElementById('globalCategoriesList');
            if (list) {
                if (this.globalCategories.length === 0) {
                    list.innerHTML = '<div class="text-center p-3">No global categories found.</div>';
                } else {
                    list.innerHTML = this.globalCategories.map(cat => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f1f5f9; background: white;">
                            <div>
                                <strong id="cat-name-${cat.id}">${cat.category_name}</strong>
                                ${cat.shop_id ? `<br><small class="text-muted">Shop Specific (ID: ${cat.shop_id})</small>` : '<br><small class="badge badge-success">Global</small>'}
                            </div>
                            <div style="display: flex; gap: 5px;">
                                <button class="btn btn-sm btn-dark edit-global-cat" data-id="${cat.id}" data-name="${cat.category_name}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-danger delete-global-cat" data-id="${cat.id}" data-name="${cat.category_name}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('');

                    // Add delete listeners
                    list.querySelectorAll('.delete-global-cat').forEach(btn => {
                        btn.addEventListener('click', () => this.deleteGlobalCategory(btn.dataset.id, btn.dataset.name));
                    });

                    // Add edit listeners
                    list.querySelectorAll('.edit-global-cat').forEach(btn => {
                        btn.addEventListener('click', () => this.editGlobalCategory(btn.dataset.id, btn.dataset.name));
                    });
                }
            }

            // Dynamically update the Product Types configuration dropdown and Shop Type selector
            ['configCategorySelect', 'shopType'].forEach(id => {
                const select = document.getElementById(id);
                if (select) {
                    const currentVal = select.value;
                    // Keep the first option
                    while (select.options.length > 1) {
                        select.remove(1);
                    }
                    this.globalCategories.forEach(cat => {
                        const option = document.createElement('option');
                        option.value = cat.category_name;
                        option.textContent = cat.category_name;
                        select.appendChild(option);
                    });
                    // Restore selection if it still exists
                    select.value = currentVal;
                }
            });

        } catch (error) {
            console.error('Failed to load global categories:', error);
            const list = document.getElementById('globalCategoriesList');
            if (list) list.innerHTML = '<div class="text-danger p-3">Failed to load categories.</div>';
        }
    }

    async editGlobalCategory(id, oldName) {
        const newName = prompt('Enter new category name:', oldName);
        if (!newName || newName === oldName) return;

        showLoading(true);
        try {
            const { error: updateError } = await supabaseClient
                .from('categories')
                .update({ category_name: newName })
                .eq('id', id);

            if (updateError) throw updateError;

            // Optional: Update products that used the old name (string-based)
            const { error: productError } = await supabaseClient
                .from('products')
                .update({ category: newName })
                .eq('category', oldName);

            if (productError) console.warn('Could not update all products:', productError.message);

            showNotification('Category updated and products synced!', 'success');
            await this.loadGlobalCategories();
        } catch (error) {
            showNotification(error.message || 'Failed to update category', 'error');
        } finally {
            showLoading(false);
        }
    }

    async syncCategoriesFromProducts() {
        showLoading(true, 'Scanning products...');
        try {
            // Fetch all unique categories from products table
            const { data: products, error: prodError } = await supabaseClient
                .from('products')
                .select('category');

            if (prodError) throw prodError;

            // Extract unique non-null categories
            const uniqueCats = [...new Set(products.map(p => p.category).filter(c => c && typeof c === 'string'))];

            if (uniqueCats.length === 0) {
                showNotification('No existing categories found in products.', 'info');
                return;
            }

            // Fetch existing categories from categories table
            const { data: existingCats } = await supabaseClient
                .from('categories')
                .select('category_name');

            const existingNames = (existingCats || []).map(c => c.category_name);

            // Filter out those already in the table
            const toAdd = uniqueCats.filter(name => !existingNames.includes(name));

            if (toAdd.length === 0) {
                showNotification('All categories are already synced!', 'success');
                return;
            }

            if (!confirm(`Found ${toAdd.length} new categories in products. Import them as Global Categories?`)) {
                return;
            }

            // Insert new categories
            const insertData = toAdd.map(name => ({ category_name: name }));
            const { error: insertError } = await supabaseClient
                .from('categories')
                .insert(insertData);

            if (insertError) throw insertError;

            showNotification(`Successfully imported ${toAdd.length} categories!`, 'success');
            await this.loadGlobalCategories();
        } catch (error) {
            showNotification('Sync failed: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async addGlobalCategory() {
        const input = document.getElementById('newGlobalCategory');
        const name = input.value.trim();

        if (!name) return;

        showLoading(true);
        try {
            const { error } = await supabaseClient
                .from('categories')
                .insert([{ category_name: name }]);

            if (error) throw error;

            showNotification('Category added successfully!', 'success');
            input.value = '';
            await this.loadGlobalCategories();
        } catch (error) {
            showNotification(error.message || 'Failed to add category', 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteGlobalCategory(id, name) {
        if (!confirm(`Are you sure you want to delete "${name}"? This won't delete products, but they will become "Uncategorized" in some views.`)) return;

        showLoading(true);
        try {
            const { error } = await supabaseClient
                .from('categories')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showNotification('Category deleted successfully!', 'success');
            await this.loadGlobalCategories();
        } catch (error) {
            showNotification('Failed to delete category. It might be in use.', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadTypeConfigForSelectedCategory() {
        const select = document.getElementById('configCategorySelect');
        const textarea = document.getElementById('categoryTypesConfig');
        const container = document.getElementById('metadataFieldsList');

        if (!select || !textarea || !container) return;

        const cat = select.value;

        // Clear everything if no category selected
        if (!cat) {
            textarea.value = '';
            container.innerHTML = '';
            return;
        }

        textarea.value = 'Loading...';
        container.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Loading metadata...</div>';

        try {
            // 1. Fetch both Types and Metadata concurrently
            const [typesRes, metaRes] = await Promise.all([
                supabaseClient
                    .from('system_configs')
                    .select('value')
                    .eq('key', `types_${cat}`)
                    .maybeSingle(),
                supabaseClient
                    .from('system_configs')
                    .select('value')
                    .eq('key', `metadata_fields_${cat}`)
                    .maybeSingle()
            ]);

            // 2. Clear current container before rendering new ones
            container.innerHTML = '';

            // 3. Populate Product Types
            if (typesRes.error) throw typesRes.error;
            textarea.value = typesRes.data ? typesRes.data.value : '';

            // 4. Populate Metadata Fields
            if (metaRes.error) throw metaRes.error;
            if (metaRes.data && metaRes.data.value) {
                try {
                    const fields = JSON.parse(metaRes.data.value);
                    if (Array.isArray(fields)) {
                        fields.forEach(field => this.addMetadataFieldRow(field));
                    }
                } catch (e) {
                    console.error('Failed to parse metadata fields JSON', e);
                    container.innerHTML = '<div class="text-danger p-2">Error parsing metadata configuration.</div>';
                }
            } else {
                // No metadata found, container is already empty
            }
        } catch (error) {
            textarea.value = '';
            container.innerHTML = '';
            console.error('Error loading config:', error);
            showNotification('Failed to load category configuration.', 'error');
        }
    }

    addMetadataFieldRow(data = { label: '', type: 'text', options: '' }) {
        const container = document.getElementById('metadataFieldsList');
        if (!container) return;

        // Ensure options is a string for the input field
        const optionsString = Array.isArray(data.options) ? data.options.join(', ') : (data.options || '');

        const row = document.createElement('div');
        row.className = 'metadata-field-row';
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.marginBottom = '12px';
        row.style.background = '#f8fafc';
        row.style.padding = '12px';
        row.style.borderRadius = '10px';
        row.style.border = '1px solid #e2e8f0';
        row.style.alignItems = 'center';
        row.style.flexWrap = 'wrap';

        row.innerHTML = `
            <div style="flex: 2;">
                <label style="font-size: 0.7rem; color: #64748b; margin-bottom: 4px; display: block;">Field Label</label>
                <input type="text" class="form-control meta-label" placeholder="e.g. Material" value="${data.label}">
            </div>
            <div style="flex: 1;">
                <label style="font-size: 0.7rem; color: #64748b; margin-bottom: 4px; display: block;">Field Type</label>
                <select class="form-control meta-type">
                    <option value="text" ${data.type === 'text' ? 'selected' : ''}>Text</option>
                    <option value="number" ${data.type === 'number' ? 'selected' : ''}>Number</option>
                    <option value="select" ${data.type === 'select' ? 'selected' : ''}>Select</option>
                    <option value="date" ${data.type === 'date' ? 'selected' : ''}>Date</option>
                </select>
            </div>
            <div class="meta-options-wrapper" style="flex: 2; ${data.type === 'select' ? 'display: block;' : 'display: none;'}">
                <label style="font-size: 0.7rem; color: #64748b; margin-bottom: 4px; display: block;">Options (Comma Separated)</label>
                <input type="text" class="form-control meta-options" placeholder="Small, Medium, Large" value="${optionsString}">
            </div>
            <div style="padding-top: 20px;">
                <button class="btn btn-sm btn-danger remove-meta-field" title="Remove Field" style="height: 38px; width: 38px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Toggle options input based on type
        const typeSelect = row.querySelector('.meta-type');
        const optionsWrapper = row.querySelector('.meta-options-wrapper');

        typeSelect.addEventListener('change', () => {
            if (typeSelect.value === 'select') {
                optionsWrapper.style.display = 'block';
            } else {
                optionsWrapper.style.display = 'none';
            }
        });

        // Remove row
        row.querySelector('.remove-meta-field').addEventListener('click', () => row.remove());

        container.appendChild(row);
    }

    async saveTypeConfig() {
        const cat = document.getElementById('configCategorySelect').value;
        if (!cat) {
            showNotification('Please select a category first', 'error');
            return;
        }

        const value = document.getElementById('categoryTypesConfig').value.trim();
        const status = document.getElementById('configStatus');

        // Collect metadata fields
        const metadataFields = [];
        document.querySelectorAll('.metadata-field-row').forEach(row => {
            const label = row.querySelector('.meta-label').value.trim();
            const type = row.querySelector('.meta-type').value;
            const options = row.querySelector('.meta-options').value.trim();

            if (label) {
                metadataFields.push({
                    id: label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                    label: label,
                    type: type,
                    options: type === 'select' ? options.split(',').map(o => o.trim()).filter(o => o) : []
                });
            }
        });

        showLoading(true);
        try {
            // 1. Save Types
            const { error: typeError } = await supabaseClient
                .from('system_configs')
                .upsert({
                    key: `types_${cat}`,
                    value: value,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (typeError) throw typeError;

            // 2. Save Metadata Fields
            const { error: metaError } = await supabaseClient
                .from('system_configs')
                .upsert({
                    key: `metadata_fields_${cat}`,
                    value: JSON.stringify(metadataFields),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (metaError) throw metaError;

            if (status) {
                status.style.display = 'block';
                setTimeout(() => status.style.display = 'none', 3000);
            }
            showNotification('Configuration saved!', 'success');
        } catch (error) {
            showNotification('Failed to save configuration.', 'error');
            console.error(error);
        } finally {
            showLoading(false);
        }
    }

    async resetSystemData() {
        const confirm1 = confirm('CRITICAL WARNING: This will permanently DELETE all Categories and Product Types from EVERY product in the system, and clear all global settings. Are you absolutely sure?');
        if (!confirm1) return;

        const confirm2 = confirm('Last chance: All products will become "Uncategorized". Proceed with Wipe?');
        if (!confirm2) return;

        showLoading(true, 'Wiping system data...');
        try {
            // 1. Clear category and type from ALL products
            const { error: prodError } = await supabaseClient
                .from('products')
                .update({ category: null, type: null })
                .neq('product_name', 'System_Internal_Keep_Identifier_DoesNotExist'); // Hack to update all rows without where error

            if (prodError) throw prodError;

            // 2. Delete all rows from categories table
            const { error: catError } = await supabaseClient
                .from('categories')
                .delete()
                .neq('category_name', 'System_Internal_Keep_Identifier_DoesNotExist');

            if (catError) throw catError;

            // 3. Clear system configs related to types and metadata
            const { error: configError } = await supabaseClient
                .from('system_configs')
                .delete()
                .or('key.like.types_%,key.like.metadata_fields_%');

            if (configError) throw configError;

            showNotification('System cleaned successfully! You can now start fresh.', 'success');
            await this.loadGlobalCategories();
            await this.loadTypeConfigForSelectedCategory();
        } catch (error) {
            console.error(error);
            showNotification('Wipe failed: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // Bulk Delete Helpers
    toggleSelectAll(type, checked) {
        const checkboxes = document.querySelectorAll(`.${type}-checkbox`);
        checkboxes.forEach(cb => cb.checked = checked);
        this.updateBulkDeleteButton(type);
    }

    updateBulkDeleteButton(type) {
        const checkedCount = document.querySelectorAll(`.${type}-checkbox:checked`).length;
        const deleteBtn = document.getElementById(type === 'activity' ? 'bulkDeleteActivity' : 'bulkDeleteLogs');
        if (deleteBtn) {
            deleteBtn.style.display = checkedCount > 0 ? 'inline-block' : 'none';
            deleteBtn.innerHTML = `<i class="fas fa-trash-alt"></i> Delete Selected (${checkedCount})`;
        }
    }

    async handleBulkDelete(type) {
        const checkedBoxes = document.querySelectorAll(`.${type}-checkbox:checked`);
        const ids = Array.from(checkedBoxes).map(cb => cb.value);

        if (ids.length === 0) return;

        if (!confirm(`Are you sure you want to delete ${ids.length} selected ${type}? This action cannot be undone.`)) {
            return;
        }

        showLoading(true);
        try {
            const { error } = await supabaseClient
                .from('audit_logs')
                .delete()
                .in('id', ids);

            if (error) throw error;

            showNotification(`Successfully deleted ${ids.length} entries`, 'success');

            // Refresh current data
            if (type === 'activity') {
                await this.loadActivity();
                const selectAll = document.getElementById('selectAllActivity');
                if (selectAll) selectAll.checked = false;
            } else {
                await this.loadLogs();
                const selectAll = document.getElementById('selectAllLogs');
                if (selectAll) selectAll.checked = false;
            }
            this.updateBulkDeleteButton(type);

        } catch (error) {
            console.error('Bulk Delete Error:', error);
            showNotification('Failed to delete entries', 'error');
        } finally {
            showLoading(false);
        }
    }
}



// Initialize when on super-admin page
if (window.location.pathname.includes('super-admin.html')) {
    document.addEventListener('DOMContentLoaded', () => {

        new SuperAdminManager();
    });
}
