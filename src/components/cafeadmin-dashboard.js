/**
 * Cafe Admin Dashboard Component for PressPoint
 * Complete control interface for Cafe Profile, Pricing, Staff,
 * Print Agent pairing, device discovery, and printer management.
 */

import {
  fetchCafeDashboardData,
  updateCafeProfile,
  updateCafePricing,
  addCafeStaff,
  updateStaffStatus,
  createDevicePairingCode,
  selectDevicePrinter,
  revokeDevice,
  createTestPrintJob,
  manageCafeJob,
  fetchJobSignedPreviewUrl
} from '../lib/cafeadmin.js';
import { signOut } from '../lib/auth.js';
import QRCode from 'qrcode';

export async function renderCafeAdminDashboard(container, { user, profile, isStaff = false } = {}) {
  const cafeId = profile?.cafe_id;

  if (!cafeId) {
    container.innerHTML = `
      <div class="auth-page-wrapper">
        <div class="auth-card-editorial text-center">
          <div class="access-denied-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <span class="pill-tag font-mono">UNASSIGNED ACCOUNT</span>
          <h1 class="editorial-h2">No Cafe Assigned</h1>
          <p class="auth-subtext">This account does not have an active Cafe provisioned. Please complete registration or contact Super Admin.</p>
          <div class="auth-actions-group">
            <button class="btn btn-primary" id="unassignedSignOutBtn">Sign Out</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('unassignedSignOutBtn')?.addEventListener('click', async () => {
      await signOut();
      window.navigateTo('/login');
    });
    return;
  }

  // Initial layout container
  container.innerHTML = `
    <div class="admin-dashboard-layout cafe-admin-theme">
      <!-- Top Cafe Nav -->
      <header class="admin-topbar">
        <div class="admin-topbar-left">
          <a href="/" class="admin-brand">
            <span class="brand-symbol" aria-hidden="true">
              <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="2" y="2" width="24" height="24" rx="5"/>
                <path d="M7 8H21M7 13H17M7 18H14"/>
                <circle cx="20.5" cy="18.5" r="2" fill="var(--text-accent)"/>
              </svg>
            </span>
            <div class="admin-brand-info">
              <span class="admin-brand-title">PressPoint</span>
              <span class="admin-brand-sub font-mono">${isStaff ? 'CAFE STAFF TERMINAL' : 'CAFE ADMIN WORKSTATION'}</span>
            </div>
          </a>
          <div class="admin-status-badge">
            <span class="pulse-dot active" aria-hidden="true"></span>
            <span class="font-mono" id="cafeTopbarName">LOADING CAFE...</span>
          </div>
        </div>

        <div class="admin-topbar-right">
          <div class="admin-user-pill">
            <span class="admin-user-role font-mono">${isStaff ? 'STAFF' : 'CAFE_ADMIN'}</span>
            <span class="admin-user-email">${user?.email || (isStaff ? 'staff@cafe.com' : 'admin@cafe.com')}</span>
          </div>
          <button class="btn btn-sm btn-ghost" id="cafeSignOutBtn" title="Sign out of Cafe workstation">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" style="width:14px;height:14px;"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H5"/></svg>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <!-- Dashboard Navigation Tabs -->
      <nav class="admin-tabs-nav" aria-label="Cafe Admin Sections">
        <div class="site-container admin-tabs-container">
          ${!isStaff ? `<button class="admin-tab-btn" data-tab="overview">Overview</button>` : ''}
          <button class="admin-tab-btn" data-tab="jobs">
            Print Jobs
            <span class="tab-badge" id="tabJobsBadge" style="display:none;background:#2563eb;color:#fff;border-radius:12px;padding:2px 7px;font-size:0.75rem;margin-left:6px;font-weight:700;">0</span>
          </button>
          <button class="admin-tab-btn" data-tab="history">Order History</button>
          ${!isStaff ? `<button class="admin-tab-btn" data-tab="earnings">Earnings</button>` : ''}
          <button class="admin-tab-btn" data-tab="qrcode">Cafe QR Code</button>
          <button class="admin-tab-btn" data-tab="devices">Print Agent / PCs</button>
          ${!isStaff ? `
            <button class="admin-tab-btn" data-tab="pricing">Pricing</button>
            <button class="admin-tab-btn" data-tab="staff">Staff</button>
            <button class="admin-tab-btn" data-tab="profile">Cafe Profile</button>
            <button class="admin-tab-btn" data-tab="license">License</button>
            <button class="admin-tab-btn" data-tab="settings">Settings</button>
          ` : ''}
        </div>
      </nav>

      <!-- Main Content Area -->
      <main class="site-container admin-main-content" id="cafeTabContent">
        <div class="admin-loading-state">
          <span class="btn-spinner"></span>
          <p class="font-mono text-muted">Retrieving cafe configuration & devices...</p>
        </div>
      </main>

      <!-- Modal Container -->
      <div id="cafeModalContainer" class="admin-modal-backdrop" style="display: none;"></div>
    </div>
  `;

  // Attach Sign Out
  document.getElementById('cafeSignOutBtn')?.addEventListener('click', async () => {
    await signOut();
    window.navigateTo('/login');
  });

  // State store
  let dashboardData = null;
  const currentPath = window.location.pathname.toLowerCase();
  let activeTab = isStaff ? 'jobs' : 'overview';
  if (currentPath.includes('job') || currentPath.includes('print-job')) activeTab = 'jobs';
  else if (currentPath.includes('history')) activeTab = 'history';
  else if (currentPath.includes('earning') && !isStaff) activeTab = 'earnings';
  else if (currentPath.includes('qr')) activeTab = 'qrcode';
  else if (currentPath.includes('device')) activeTab = 'devices';
  else if (currentPath.includes('pricing') && !isStaff) activeTab = 'pricing';
  else if (currentPath.includes('staff') && !isStaff) activeTab = 'staff';
  else if (currentPath.includes('profile') && !isStaff) activeTab = 'profile';
  else if (currentPath.includes('license') && !isStaff) activeTab = 'license';
  else if (currentPath.includes('setting') && !isStaff) activeTab = 'settings';
  else activeTab = isStaff ? 'jobs' : 'overview';

  async function loadData() {
    const res = await fetchCafeDashboardData(cafeId);
    if (!res.success) {
      document.getElementById('cafeTabContent').innerHTML = `
        <div class="alert-box alert-error">
          <p><strong>Failed to load Cafe data:</strong> ${res.error}</p>
          <button class="btn btn-sm btn-secondary mt-3" id="retryLoadBtn">Retry</button>
        </div>
      `;
      document.getElementById('retryLoadBtn')?.addEventListener('click', loadData);
      return;
    }
    dashboardData = res.data;

    // Update topbar cafe name
    const nameEl = document.getElementById('cafeTopbarName');
    if (nameEl && dashboardData.cafe) {
      nameEl.textContent = `${dashboardData.cafe.name.toUpperCase()} • ${dashboardData.cafe.status.toUpperCase()}`;
    }

    renderActiveTab();
  }

  // Tab switcher
  const tabButtons = container.querySelectorAll('.admin-tab-btn');
  tabButtons.forEach(btn => {
    const tabName = btn.getAttribute('data-tab');
    if (tabName === activeTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.getAttribute('data-tab');
      window.history.replaceState({}, '', `/cafe/${activeTab}`);
      renderActiveTab();
    });
  });

  function renderActiveTab() {
    const content = document.getElementById('cafeTabContent');
    if (!content || !dashboardData) return;

    switch (activeTab) {
      case 'overview':
        renderOverviewTab(content, dashboardData);
        break;
      case 'jobs':
        renderJobsTab(content, dashboardData);
        break;
      case 'history':
        renderHistoryTab(content, dashboardData);
        break;
      case 'earnings':
        renderEarningsTab(content, dashboardData);
        break;
      case 'qrcode':
        renderQrTab(content, dashboardData);
        break;
      case 'devices':
        renderDevicesTab(content, dashboardData);
        break;
      case 'pricing':
        renderPricingTab(content, dashboardData);
        break;
      case 'staff':
        renderStaffTab(content, dashboardData);
        break;
      case 'profile':
        renderProfileTab(content, dashboardData);
        break;
      case 'license':
        renderLicenseTab(content, dashboardData);
        break;
      case 'settings':
        renderSettingsTab(content, dashboardData);
        break;
      default:
        if (isStaff) renderJobsTab(content, dashboardData);
        else renderOverviewTab(content, dashboardData);
    }
  }

  // ----------------------------------------------------
  // TAB 1: OVERVIEW
  // ----------------------------------------------------
  function renderOverviewTab(content, data) {
    const { cafe, license, pricing, stats, devices, jobs, earnings } = data;
    const maxDev = stats.max_devices || license?.max_devices || 3;
    const activeDev = stats.active_devices || 0;
    const pendingJobsCount = (jobs || []).filter(j => ['pending', 'queued', 'assigned', 'downloading', 'printing'].includes(j.status)).length;
    const weekEarnings = earnings?.week_earnings ? Number(earnings.week_earnings).toFixed(2) : '0.00';

    content.innerHTML = `
      <div class="tab-pane-fade">
        <!-- Top Metrics Row -->
        <div class="admin-overview-grid">
          <div class="admin-metric-card">
            <div class="metric-header">
              <span class="metric-title font-mono">AUTHORIZED COMPUTERS</span>
              <span class="metric-badge font-mono ${activeDev >= maxDev ? 'text-warning' : 'text-accent'}">${activeDev}/${maxDev}</span>
            </div>
            <div class="metric-value">${activeDev}</div>
            <div class="metric-desc font-mono">
              ${activeDev >= maxDev ? 'Capacity reached' : `${maxDev - activeDev} device slots available`}
            </div>
          </div>

          <div class="admin-metric-card" style="cursor:pointer;" id="overviewActiveQueueCard">
            <div class="metric-header">
              <span class="metric-title font-mono">LIVE PRINT QUEUE</span>
              <span class="metric-badge font-mono text-accent">QUEUE &rarr;</span>
            </div>
            <div class="metric-value font-mono">${pendingJobsCount}</div>
            <div class="metric-desc font-mono text-muted">
              ${pendingJobsCount === 0 ? 'Queue is clear & ready' : `${pendingJobsCount} active job(s) pending execution`}
            </div>
          </div>

          <div class="admin-metric-card" style="cursor:pointer;" id="overviewEarningsCard">
            <div class="metric-header">
              <span class="metric-title font-mono">THIS WEEK'S EARNINGS</span>
              <span class="metric-badge font-mono text-green">LIVE &rarr;</span>
            </div>
            <div class="metric-value font-mono">₹${weekEarnings}</div>
            <div class="metric-desc font-mono text-muted">
              From completed counter orders this week
            </div>
          </div>

          <div class="admin-metric-card">
            <div class="metric-header">
              <span class="metric-title font-mono">PRINT RATES</span>
              <span class="metric-badge font-mono">A4</span>
            </div>
            <div class="metric-value font-mono">₹${Number(pricing?.bw_single || 2.0).toFixed(2)}</div>
            <div class="metric-desc font-mono text-muted">
              B/W Single: ₹${Number(pricing?.bw_single || 2.0).toFixed(2)} &bull; Colour: ₹${Number(pricing?.color_single || 10.0).toFixed(2)}
            </div>
          </div>
        </div>

        <!-- Quick Actions & Agent Status Card -->
        <div class="overview-banner-card mt-6">
          <div class="banner-content">
            <div class="banner-tag font-mono">OPERATIONAL PRINT WORKSPACE</div>
            <h2 class="editorial-h2">Counter Order Dispatcher</h2>
            <p class="auth-subtext">Manage live customer orders, preview uploaded documents securely, and dispatch directly to authorized Windows Print PCs.</p>
            <div class="banner-actions">
              <button class="btn btn-primary" id="overviewOpenJobsBtn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;">
                  <path d="M5 7V3h10v4M5 13H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M5 11h10v6H5v-6z"/>
                </svg>
                <span>Open Print Jobs Queue (${pendingJobsCount})</span>
              </button>
              <button class="btn btn-secondary" id="overviewDownloadAgentBtn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;"><path d="M3 13v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3M7 9l3 3 3-3M10 2v10"/></svg>
                <span>Download Print Agent</span>
              </button>
              <button class="btn btn-secondary" id="overviewQrBtn">
                <span>Customer Counter QR</span>
              </button>
            </div>
          </div>
          <div class="banner-stats-pill">
            <span class="pill-dot ${activeDev > 0 ? 'dot-green' : 'dot-yellow'}"></span>
            <span class="font-mono">${activeDev > 0 ? `${activeDev} PC CONNECTED & ONLINE` : 'NO PC CONNECTED'}</span>
          </div>
        </div>

        <!-- Two Column Layout: Connected PCs & Recent Jobs -->
        <div class="dashboard-two-col mt-6">
          <!-- Left: Connected PCs -->
          <div class="col-card">
            <div class="col-card-header">
              <h3 class="col-card-title">Connected Counter PCs</h3>
              <button class="btn btn-sm btn-ghost" id="viewAllDevicesBtn">Manage All</button>
            </div>
            <div class="device-mini-list">
              ${devices.length === 0 ? `
                <div class="empty-state-mini">
                  <p class="text-muted">No Windows PCs paired yet. Click <strong>Add PC</strong> to connect your first counter computer.</p>
                </div>
              ` : devices.slice(0, 3).map(dev => `
                <div class="device-mini-item">
                  <div class="device-mini-left">
                    <span class="status-indicator ${dev.status === 'authorized' ? 'online' : 'offline'}"></span>
                    <div>
                      <strong>${escapeHtml(dev.device_label || 'Unnamed PC')}</strong>
                      <p class="font-mono text-muted text-xs">Printer: ${escapeHtml(dev.selected_printer || 'No printer selected')}</p>
                    </div>
                  </div>
                  <div class="device-mini-right font-mono text-xs text-muted">
                    ${dev.last_seen_at ? formatTimeAgo(dev.last_seen_at) : 'Never seen'}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Right: Recent Print Activity -->
          <div class="col-card">
            <div class="col-card-header">
              <h3 class="col-card-title">Live Print Queue</h3>
              <button class="btn btn-sm btn-secondary" id="quickTestPrintBtn">+ Queue Test Print</button>
            </div>
            <div class="jobs-mini-list">
              ${jobs.length === 0 ? `
                <div class="empty-state-mini">
                  <p class="text-muted">No print jobs received yet. Click <strong>Queue Test Print</strong> to verify spooling.</p>
                </div>
              ` : jobs.slice(0, 4).map(j => `
                <div class="job-mini-item">
                  <div class="job-mini-left">
                    <span class="job-badge font-mono ${j.status}">${j.status.toUpperCase()}</span>
                    <div>
                      <strong>${escapeHtml(j.file_name)}</strong>
                      <p class="text-muted text-xs font-mono">${escapeHtml(j.customer_name || 'Guest')} &bull; ${j.pages} pgs &bull; ${j.color_mode.toUpperCase()} &bull; ₹${Number(j.total_price).toFixed(2)}</p>
                    </div>
                  </div>
                  <span class="job-num font-mono text-xs">${escapeHtml(j.order_number || j.job_number)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('overviewOpenJobsBtn')?.addEventListener('click', () => {
      document.querySelector('[data-tab="jobs"]')?.click();
    });
    document.getElementById('overviewActiveQueueCard')?.addEventListener('click', () => {
      document.querySelector('[data-tab="jobs"]')?.click();
    });
    document.getElementById('overviewEarningsCard')?.addEventListener('click', () => {
      document.querySelector('[data-tab="earnings"]')?.click();
    });
    document.getElementById('overviewDownloadAgentBtn')?.addEventListener('click', downloadAgentInstaller);
    document.getElementById('overviewQrBtn')?.addEventListener('click', () => {
      document.querySelector('[data-tab="qrcode"]')?.click();
    });
    document.getElementById('viewAllDevicesBtn')?.addEventListener('click', () => {
      document.querySelector('[data-tab="devices"]')?.click();
    });
    document.getElementById('quickTestPrintBtn')?.addEventListener('click', handleQuickTestPrint);
  }

  // ----------------------------------------------------
  // TAB 1B: DEDICATED PRINT JOBS SECTION (OPERATIONAL WORKSPACE)
  // ----------------------------------------------------
  let jobsFilterStatus = 'all';
  let jobsFilterSearch = '';
  let jobsFilterPayment = 'all';
  let jobsFilterColor = 'all';
  let jobsFilterDuplex = 'all';
  let jobsSortOrder = 'newest';

  function renderJobsTab(content, data) {
    const allJobs = data.jobs || [];
    const devices = data.devices || [];

    // Filter status counts
    const pendingCount = allJobs.filter(j => j.status === 'pending').length;
    const queuedCount = allJobs.filter(j => j.status === 'queued' || j.status === 'assigned').length;
    const printingCount = allJobs.filter(j => j.status === 'printing' || j.status === 'downloading').length;
    const completedCount = allJobs.filter(j => j.status === 'completed').length;
    const failedCount = allJobs.filter(j => j.status === 'failed').length;
    const cancelledCount = allJobs.filter(j => j.status === 'cancelled').length;

    // Filter computation
    let filtered = allJobs.filter(j => {
      if (jobsFilterStatus === 'pending' && j.status !== 'pending') return false;
      if (jobsFilterStatus === 'queued' && j.status !== 'queued' && j.status !== 'assigned') return false;
      if (jobsFilterStatus === 'printing' && j.status !== 'printing' && j.status !== 'downloading') return false;
      if (jobsFilterStatus === 'completed' && j.status !== 'completed') return false;
      if (jobsFilterStatus === 'failed' && j.status !== 'failed') return false;
      if (jobsFilterStatus === 'cancelled' && j.status !== 'cancelled') return false;

      if (jobsFilterPayment !== 'all' && (j.payment_status || 'unpaid') !== jobsFilterPayment) return false;
      if (jobsFilterColor !== 'all' && j.color_mode !== jobsFilterColor) return false;
      if (jobsFilterDuplex !== 'all' && j.duplex !== jobsFilterDuplex) return false;

      if (jobsFilterSearch.trim()) {
        const q = jobsFilterSearch.toLowerCase().trim();
        const mOrder = (j.order_number || '').toLowerCase().includes(q);
        const mJob = (j.job_number || '').toLowerCase().includes(q);
        const mCust = (j.customer_name || '').toLowerCase().includes(q);
        const mFile = (j.file_name || '').toLowerCase().includes(q);
        if (!mOrder && !mJob && !mCust && !mFile) return false;
      }

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (jobsSortOrder === 'oldest' || jobsSortOrder === 'queue') {
        return new Date(a.created_at) - new Date(b.created_at); // FIFO Queue order
      }
      return new Date(b.created_at) - new Date(a.created_at); // Newest first
    });

    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">OPERATIONAL WORKSPACE</span>
            <h2 class="editorial-h2">Print Jobs Queue</h2>
            <p class="auth-subtext">Manage incoming customer print orders, inspect and preview files, verify payment, and dispatch to authorized print PCs.</p>
          </div>
          <div class="section-actions" style="display:flex;gap:8px;">
            <button class="btn btn-secondary" id="refreshJobsBtn">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:14px;height:14px;"><path d="M4 4v5h5M16 16v-5h-5M15.5 6.5A7 7 0 0 0 4.5 9.5M4.5 13.5A7 7 0 0 0 15.5 10.5"/></svg>
              <span>Refresh</span>
            </button>
            <button class="btn btn-primary" id="jobsQueueTestBtn">
              <span>+ Queue Test Job</span>
            </button>
          </div>
        </div>

        <!-- Filters Bar: Status Tabs -->
        <div class="jobs-filter-tabs-bar mt-4">
          <button class="filter-tab-pill ${jobsFilterStatus === 'all' ? 'active' : ''}" data-status="all">All (${allJobs.length})</button>
          <button class="filter-tab-pill ${jobsFilterStatus === 'pending' ? 'active' : ''}" data-status="pending">Pending (${pendingCount})</button>
          <button class="filter-tab-pill ${jobsFilterStatus === 'queued' ? 'active' : ''}" data-status="queued">Queued (${queuedCount})</button>
          <button class="filter-tab-pill ${jobsFilterStatus === 'printing' ? 'active' : ''}" data-status="printing">Printing (${printingCount})</button>
          <button class="filter-tab-pill ${jobsFilterStatus === 'completed' ? 'active' : ''}" data-status="completed">Completed (${completedCount})</button>
          <button class="filter-tab-pill ${jobsFilterStatus === 'failed' ? 'active' : ''}" data-status="failed">Failed (${failedCount})</button>
          <button class="filter-tab-pill ${jobsFilterStatus === 'cancelled' ? 'active' : ''}" data-status="cancelled">Cancelled (${cancelledCount})</button>
        </div>

        <!-- Secondary Search & Options Bar -->
        <div class="jobs-controls-row mt-4">
          <div class="jobs-search-wrap">
            <input 
              type="text" 
              id="jobsSearchInput" 
              class="form-input form-input-sm" 
              placeholder="Search by Order #, Customer, or File..." 
              value="${escapeHtml(jobsFilterSearch)}"
            />
          </div>
          <div class="jobs-selects-wrap">
            <select id="jobsPaymentSelect" class="form-input form-input-sm">
              <option value="all" ${jobsFilterPayment === 'all' ? 'selected' : ''}>All Payments</option>
              <option value="paid" ${jobsFilterPayment === 'paid' ? 'selected' : ''}>Paid Only</option>
              <option value="unpaid" ${jobsFilterPayment === 'unpaid' ? 'selected' : ''}>Unpaid Only</option>
            </select>
            <select id="jobsColorSelect" class="form-input form-input-sm">
              <option value="all" ${jobsFilterColor === 'all' ? 'selected' : ''}>All Output</option>
              <option value="bw" ${jobsFilterColor === 'bw' ? 'selected' : ''}>B/W Only</option>
              <option value="color" ${jobsFilterColor === 'color' ? 'selected' : ''}>Colour Only</option>
            </select>
            <select id="jobsDuplexSelect" class="form-input form-input-sm">
              <option value="all" ${jobsFilterDuplex === 'all' ? 'selected' : ''}>All Sides</option>
              <option value="single" ${jobsFilterDuplex === 'single' ? 'selected' : ''}>Single-sided</option>
              <option value="double" ${jobsFilterDuplex === 'double' ? 'selected' : ''}>Double-sided</option>
            </select>
            <select id="jobsSortSelect" class="form-input form-input-sm">
              <option value="newest" ${jobsSortOrder === 'newest' ? 'selected' : ''}>Newest First</option>
              <option value="queue" ${jobsSortOrder === 'queue' ? 'selected' : ''}>Queue Order (FIFO)</option>
            </select>
          </div>
        </div>

        <!-- Jobs Operational List -->
        <div class="jobs-cards-grid mt-6">
          ${filtered.length === 0 ? `
            <div class="empty-state-card text-center py-12">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;color:var(--text-tertiary);margin:0 auto 12px;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <h3 class="font-bold">No print jobs found</h3>
              <p class="text-sm text-muted mt-1">No orders match the current filter selection.</p>
            </div>
          ` : filtered.map(j => {
            const devObj = devices.find(d => d.id === j.device_id);
            const devLabel = devObj ? (devObj.device_label || 'Counter PC') : (j.device_id ? 'Print PC' : 'Unassigned');
            const isCompletedOrPurged = j.status === 'completed' || j.status === 'cancelled' || j.file_url === '[PURGED]';

            return `
              <div class="job-card-editorial status-border-${j.status}" data-job-id="${j.id}">
                <div class="job-card-header">
                  <div class="job-card-ident">
                    <span class="job-order-num font-mono font-bold">${escapeHtml(j.order_number || j.job_number)}</span>
                    <span class="job-id-sub font-mono text-muted text-xs">Internal ID: ${escapeHtml(j.job_number)}</span>
                  </div>
                  <div class="job-card-badges">
                    <button 
                      type="button" 
                      class="badge-toggle-payment payment-badge-${j.payment_status || 'unpaid'} font-mono" 
                      data-job-id="${j.id}" 
                      data-current-payment="${j.payment_status || 'unpaid'}"
                      title="Click to toggle payment status"
                    >
                      ${(j.payment_status || 'unpaid').toUpperCase()}
                    </button>
                    <span class="job-status-pill status-${j.status} font-mono">
                      <span class="pill-dot"></span>
                      ${j.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div class="job-card-body">
                  <div class="job-card-cust">
                    <strong class="cust-name-text">${escapeHtml(j.customer_name || 'Guest Customer')}</strong>
                    ${j.customer_phone ? `<span class="cust-phone-text font-mono text-xs text-muted">📞 ${escapeHtml(j.customer_phone)}</span>` : ''}
                  </div>

                  <div class="job-file-spec-row">
                    <div class="job-file-info">
                      <span class="file-type-icon ${j.file_name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'img'} font-mono">
                        ${j.file_name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}
                      </span>
                      <span class="file-name-truncate" title="${escapeHtml(j.file_name)}">${escapeHtml(j.file_name)}</span>
                    </div>
                    <div class="job-specs-pills font-mono text-xs">
                      <span>${j.pages} pg${j.pages > 1 ? 's' : ''}</span>
                      <span>${j.copies} cop${j.copies > 1 ? 'ies' : 'y'}</span>
                      <span>${j.color_mode.toUpperCase()}</span>
                      <span>${j.duplex.toUpperCase()}</span>
                      <span>${(j.orientation || 'portrait').toUpperCase()}</span>
                      ${j.page_range && j.page_range !== 'all' ? `<span>PAGES: ${escapeHtml(j.page_range)}</span>` : ''}
                    </div>
                  </div>

                  ${j.error_message ? `
                    <div class="job-error-notice font-mono text-xs text-danger mt-2">
                      ⚠️ ${escapeHtml(j.error_message)}
                    </div>
                  ` : ''}

                  <div class="job-meta-footer">
                    <div class="job-device-info font-mono text-xs text-muted">
                      <span>PC: ${escapeHtml(devLabel)}</span> &bull; 
                      <span>${formatTimeAgo(j.created_at)}</span>
                    </div>
                    <div class="job-price-display font-mono font-bold">
                      ₹${Number(j.total_price).toFixed(2)}
                    </div>
                  </div>
                </div>

                <!-- Actions Bar -->
                <div class="job-card-actions">
                  ${!isCompletedOrPurged ? `
                    <button class="btn btn-sm btn-secondary preview-job-btn" data-job-id="${j.id}" title="Inspect and verify document">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Preview Document
                    </button>
                  ` : `
                    <span class="text-xs font-mono text-muted" title="File was purged after completion for customer privacy">
                      🔒 File Purged
                    </span>
                  `}

                  ${['pending', 'queued', 'failed'].includes(j.status) ? `
                    <button class="btn btn-sm btn-primary send-to-print-btn" data-job-id="${j.id}">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:13px;height:13px;margin-right:4px;">
                        <path d="M5 7V3h10v4M5 13H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M5 11h10v6H5v-6z"/>
                      </svg>
                      Send to Print
                    </button>
                  ` : ''}

                  ${!isCompletedOrPurged ? `
                    <button class="btn btn-sm btn-ghost mark-complete-btn" data-job-id="${j.id}" title="Mark completed and purge customer file">
                      &check; Complete
                    </button>
                    <button class="btn btn-sm btn-ghost text-danger cancel-job-btn" data-job-id="${j.id}" title="Cancel job and purge customer file">
                      Cancel
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Filter status tabs
    content.querySelectorAll('.filter-tab-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        jobsFilterStatus = pill.getAttribute('data-status');
        renderJobsTab(content, data);
      });
    });

    // Search and select filters
    const sInput = document.getElementById('jobsSearchInput');
    sInput?.addEventListener('input', (e) => {
      jobsFilterSearch = e.target.value;
      renderJobsTab(content, data);
    });

    document.getElementById('jobsPaymentSelect')?.addEventListener('change', (e) => {
      jobsFilterPayment = e.target.value;
      renderJobsTab(content, data);
    });

    document.getElementById('jobsColorSelect')?.addEventListener('change', (e) => {
      jobsFilterColor = e.target.value;
      renderJobsTab(content, data);
    });

    document.getElementById('jobsDuplexSelect')?.addEventListener('change', (e) => {
      jobsFilterDuplex = e.target.value;
      renderJobsTab(content, data);
    });

    document.getElementById('jobsSortSelect')?.addEventListener('change', (e) => {
      jobsSortOrder = e.target.value;
      renderJobsTab(content, data);
    });

    document.getElementById('refreshJobsBtn')?.addEventListener('click', loadData);
    document.getElementById('jobsQueueTestBtn')?.addEventListener('click', handleQuickTestPrint);

    // Job Card Action Listeners
    content.querySelectorAll('.preview-job-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const jId = btn.getAttribute('data-job-id');
        const job = allJobs.find(j => j.id === jId);
        if (job) openAdminDocumentPreview(job);
      });
    });

    content.querySelectorAll('.send-to-print-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const jId = btn.getAttribute('data-job-id');
        btn.disabled = true;
        const res = await manageCafeJob(cafeId, jId, 'send_to_print');
        if (!res.success) {
          showNotification(res.error || 'Failed to dispatch to print.', 'error');
          btn.disabled = false;
        } else {
          showNotification(res.message || 'Job dispatched to print queue.', res.device_id ? 'success' : 'warning');
          await loadData();
        }
      });
    });

    content.querySelectorAll('.badge-toggle-payment').forEach(btn => {
      btn.addEventListener('click', async () => {
        const jId = btn.getAttribute('data-job-id');
        const curr = btn.getAttribute('data-current-payment');
        const next = curr === 'paid' ? 'unpaid' : 'paid';
        const res = await manageCafeJob(cafeId, jId, 'update_payment', { paymentStatus: next });
        if (res.success) {
          showNotification(`Payment marked as ${next.toUpperCase()}`, 'success');
          loadData();
        } else {
          showNotification(res.error || 'Failed to update payment.', 'error');
        }
      });
    });

    content.querySelectorAll('.mark-complete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Mark job as Completed? The customer uploaded file will be permanently deleted.')) return;
        const jId = btn.getAttribute('data-job-id');
        const res = await manageCafeJob(cafeId, jId, 'complete');
        if (res.success) {
          showNotification('Job marked completed and customer file purged.', 'success');
          loadData();
        } else {
          showNotification(res.error || 'Failed to complete job.', 'error');
        }
      });
    });

    content.querySelectorAll('.cancel-job-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Cancel this print job? The customer uploaded file will be permanently deleted.')) return;
        const jId = btn.getAttribute('data-job-id');
        const res = await manageCafeJob(cafeId, jId, 'cancel');
        if (res.success) {
          showNotification('Job cancelled and customer file purged.', 'info');
          loadData();
        } else {
          showNotification(res.error || 'Failed to cancel job.', 'error');
        }
      });
    });
  }

  // ----------------------------------------------------
  // TAB 1C: ORDER HISTORY (NON-SENSITIVE RECORDS ONLY)
  // ----------------------------------------------------
  function renderHistoryTab(content, data) {
    const historicalJobs = (data.jobs || []).filter(j => j.status === 'completed' || j.status === 'cancelled');

    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">BUSINESS AUDIT TRAIL</span>
            <h2 class="editorial-h2">Order &amp; Print History</h2>
            <p class="auth-subtext">Historical business records of completed and closed orders. In strict compliance with customer privacy rules, all uploaded documents are permanently purged upon completion.</p>
          </div>
          <div class="section-actions">
            <span class="badge badge-staff font-mono">🔒 CUSTOMER FILES PURGED</span>
          </div>
        </div>

        <div class="history-table-container mt-6">
          ${historicalJobs.length === 0 ? `
            <div class="empty-state-card text-center py-12">
              <p class="text-muted font-mono">No completed orders in history yet.</p>
            </div>
          ` : `
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Date &bull; Time</th>
                    <th>Pages / Mode</th>
                    <th>Copies</th>
                    <th>Total Price</th>
                    <th>Payment</th>
                    <th>Privacy State</th>
                  </tr>
                </thead>
                <tbody>
                  ${historicalJobs.map(j => `
                    <tr>
                      <td class="font-mono font-bold">${escapeHtml(j.order_number || j.job_number)}</td>
                      <td>${escapeHtml(j.customer_name || 'Guest')}</td>
                      <td>
                        <span class="job-status-pill status-${j.status} font-mono text-xs">
                          ${j.status.toUpperCase()}
                        </span>
                      </td>
                      <td class="font-mono text-xs text-muted">
                        ${j.completed_at ? new Date(j.completed_at).toLocaleString() : new Date(j.created_at).toLocaleString()}
                      </td>
                      <td class="font-mono text-xs">
                        ${j.pages} pg${j.pages > 1 ? 's' : ''} &bull; ${j.color_mode.toUpperCase()} &bull; ${j.duplex.toUpperCase()}
                      </td>
                      <td class="font-mono text-xs">${j.copies}</td>
                      <td class="font-mono font-bold">₹${Number(j.total_price).toFixed(2)}</td>
                      <td>
                        <span class="payment-badge-${j.payment_status || 'unpaid'} font-mono text-xs">
                          ${(j.payment_status || 'unpaid').toUpperCase()}
                        </span>
                      </td>
                      <td class="font-mono text-xs text-muted">
                        <span title="Document was permanently deleted after completion">🔒 File Purged</span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------
  // TAB 1D: EARNINGS DASHBOARD
  // ----------------------------------------------------
  function renderEarningsTab(content, data) {
    const earnings = data.earnings || {};
    const weekEarn = Number(earnings.week_earnings || 0).toFixed(2);
    const todayEarn = Number(earnings.today_earnings || 0).toFixed(2);
    const monthEarn = Number(earnings.month_earnings || 0).toFixed(2);
    const paidAmount = Number(earnings.paid_amount || 0).toFixed(2);
    const pendingAmount = Number(earnings.pending_amount || 0).toFixed(2);
    const bwRev = Number(earnings.bw_revenue || 0).toFixed(2);
    const colorRev = Number(earnings.color_revenue || 0).toFixed(2);
    const completedCount = earnings.total_completed_orders || 0;

    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">FINANCIAL INTELLIGENCE</span>
            <h2 class="editorial-h2">Earnings &amp; Revenue Analytics</h2>
            <p class="auth-subtext">Real-time revenue metrics computed directly from authentic completed and paid customer transactions.</p>
          </div>
        </div>

        <!-- Prominent Hero Weekly Earnings Card -->
        <div class="earnings-hero-card mt-6">
          <div class="earnings-hero-content">
            <span class="font-mono text-xs tracking-wider uppercase text-muted">CALCULATED WEEKLY REVENUE</span>
            <div class="earnings-hero-amount font-mono font-bold">
              ₹${weekEarn}
            </div>
            <div class="earnings-hero-badge mt-2">
              <span class="pill-tag font-mono text-green">THIS WEEK</span>
            </div>
          </div>
        </div>

        <!-- 4 Metrics Row -->
        <div class="admin-overview-grid mt-6">
          <div class="admin-metric-card">
            <div class="metric-header">
              <span class="metric-title font-mono">TODAY'S REVENUE</span>
              <span class="metric-badge font-mono text-accent">TODAY</span>
            </div>
            <div class="metric-value font-mono">₹${todayEarn}</div>
            <div class="metric-desc font-mono text-muted">Cleared revenue today</div>
          </div>

          <div class="admin-metric-card">
            <div class="metric-header">
              <span class="metric-title font-mono">MONTHLY REVENUE</span>
              <span class="metric-badge font-mono text-accent">THIS MONTH</span>
            </div>
            <div class="metric-value font-mono">₹${monthEarn}</div>
            <div class="metric-desc font-mono text-muted">Calendar month to date</div>
          </div>

          <div class="admin-metric-card">
            <div class="metric-header">
              <span class="metric-title font-mono">COLLECTED / PAID</span>
              <span class="metric-badge font-mono text-green">&check;</span>
            </div>
            <div class="metric-value font-mono">₹${paidAmount}</div>
            <div class="metric-desc font-mono text-muted">Total collected from paid orders</div>
          </div>

          <div class="admin-metric-card">
            <div class="metric-header">
              <span class="metric-title font-mono">PENDING COUNTER BALANCE</span>
              <span class="metric-badge font-mono text-warning">UNPAID</span>
            </div>
            <div class="metric-value font-mono">₹${pendingAmount}</div>
            <div class="metric-desc font-mono text-muted">Pending payment upon counter pickup</div>
          </div>
        </div>

        <!-- Revenue Breakdown Cards -->
        <div class="dashboard-two-col mt-6">
          <div class="col-card">
            <div class="col-card-header">
              <h3 class="col-card-title">Revenue by Output Mode</h3>
            </div>
            <div class="breakdown-list p-4">
              <div class="breakdown-row" style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-subtle);">
                <div>
                  <strong>Black &amp; White Printing</strong>
                  <p class="text-xs text-muted font-mono">Standard monochrome documents</p>
                </div>
                <div class="font-mono font-bold text-lg">₹${bwRev}</div>
              </div>
              <div class="breakdown-row" style="display:flex;justify-content:space-between;padding:12px 0;">
                <div>
                  <strong>Colour Printing</strong>
                  <p class="text-xs text-muted font-mono">Full colour photo &amp; graphic sheets</p>
                </div>
                <div class="font-mono font-bold text-lg text-accent">₹${colorRev}</div>
              </div>
            </div>
          </div>

          <div class="col-card">
            <div class="col-card-header">
              <h3 class="col-card-title">Order Fulfillment Performance</h3>
            </div>
            <div class="breakdown-list p-4">
              <div class="breakdown-row" style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-subtle);">
                <div>
                  <strong>Total Orders Completed</strong>
                  <p class="text-xs text-muted font-mono">Successfully spooled and handed over</p>
                </div>
                <div class="font-mono font-bold text-lg text-green">${completedCount} Orders</div>
              </div>
              <div class="breakdown-row" style="display:flex;justify-content:space-between;padding:12px 0;">
                <div>
                  <strong>Cancelled / Purged Orders</strong>
                  <p class="text-xs text-muted font-mono">Zero revenue counted from cancelled orders</p>
                </div>
                <div class="font-mono font-bold text-lg text-muted">
                  ${(data.jobs || []).filter(j => j.status === 'cancelled').length} Orders
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------
  // ADMIN DOCUMENT PREVIEW MODAL (CRITICAL FIX)
  // ----------------------------------------------------
  async function openAdminDocumentPreview(job) {
    if (job.status === 'completed' || job.status === 'cancelled' || job.file_url === '[PURGED]') {
      showNotification('This document was permanently purged for customer privacy after print completion.', 'info');
      return;
    }

    // Resolve best available storage path:
    // 1. Use file_url if it's a real storage path (not spool://)
    // 2. Fall back to files_metadata[].storage_path for any file that has one
    let resolvedPath = null;
    if (job.file_url && !job.file_url.startsWith('spool://') && job.file_url !== '[PURGED]') {
      resolvedPath = job.file_url;
    } else {
      // Try to find storage_path in files_metadata array
      const meta = Array.isArray(job.files_metadata) ? job.files_metadata : [];
      for (const f of meta) {
        if (f.storage_path && f.storage_path.length > 0) {
          resolvedPath = f.storage_path;
          break;
        }
      }
    }

    if (!resolvedPath) {
      showNotification('Document is spooled directly on the local counter PC. Cloud preview is unavailable.', 'info');
      return;
    }

    showNotification('Generating secure signed preview...', 'info');
    const signedRes = await fetchJobSignedPreviewUrl(resolvedPath);

    if (!signedRes.success || !signedRes.signedUrl) {
      showNotification('Preview unavailable for this file.', 'warning');
      return;
    }

    const modalId = 'adminPreviewModal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    const isPdf = job.file_name.toLowerCase().endsWith('.pdf');
    let zoomLevel = 100;

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-modal-backdrop';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="admin-modal-card preview-modal-card">
        <div class="modal-header">
          <div>
            <span class="pill-tag font-mono">${isPdf ? 'PDF DOCUMENT' : 'IMAGE FILE'}</span>
            <h2 class="editorial-h2" style="font-size:1.15rem;margin-top:4px;">${escapeHtml(job.file_name)}</h2>
            <span class="text-xs text-muted font-mono">
              Order: ${escapeHtml(job.order_number || job.job_number)} &bull; Customer: ${escapeHtml(job.customer_name || 'Guest')} &bull; ${job.pages} page${job.pages > 1 ? 's' : ''} &bull; ${job.copies} copy
            </span>
          </div>
          <button class="btn btn-sm btn-ghost close-admin-preview-btn" aria-label="Close Preview">&times;</button>
        </div>

        <div class="modal-body preview-modal-body">
          <div class="preview-zoom-bar">
            <button class="btn btn-sm btn-ghost" id="adminZoomOutBtn" title="Zoom Out">&minus;</button>
            <span class="font-mono text-xs" id="adminZoomVal">100%</span>
            <button class="btn btn-sm btn-ghost" id="adminZoomInBtn" title="Zoom In">&plus;</button>
            <button class="btn btn-sm btn-ghost" id="adminZoomFitBtn">Fit</button>
            <a href="${signedRes.signedUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-ghost font-mono text-xs" style="margin-left:auto;">
              Expand Full Screen &nearr;
            </a>
          </div>

          <div class="preview-stage-container" id="adminPreviewStage">
            ${isPdf ? `
              <iframe 
                src="${signedRes.signedUrl}#toolbar=1" 
                class="pdf-preview-frame" 
                title="Admin Document Preview"
                onerror="this.parentElement.innerHTML='<div class=\\'alert-box alert-warning\\'>Preview unavailable for this file.</div>'"
              ></iframe>
            ` : `
              <div class="image-preview-wrapper" id="adminImgWrap">
                <img src="${signedRes.signedUrl}" alt="Print Job Document" id="adminPreviewImg" />
              </div>
            `}
          </div>
        </div>

        <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
          <span class="text-xs text-muted font-mono">🔒 Temporary 5-minute signed token &bull; Purged on completion</span>
          <button class="btn btn-secondary close-admin-preview-btn">Close Preview</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelectorAll('.close-admin-preview-btn').forEach(b => b.addEventListener('click', closeModal));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Zoom handlers
    const updateZoom = (z) => {
      zoomLevel = Math.max(50, Math.min(250, z));
      document.getElementById('adminZoomVal').textContent = `${zoomLevel}%`;
      const stage = document.getElementById('adminPreviewStage');
      const img = document.getElementById('adminPreviewImg');
      if (img) {
        img.style.transform = `scale(${zoomLevel / 100})`;
        img.style.transformOrigin = 'center top';
      } else if (stage) {
        stage.style.zoom = `${zoomLevel}%`;
      }
    };

    document.getElementById('adminZoomInBtn')?.addEventListener('click', () => updateZoom(zoomLevel + 25));
    document.getElementById('adminZoomOutBtn')?.addEventListener('click', () => updateZoom(zoomLevel - 25));
    document.getElementById('adminZoomFitBtn')?.addEventListener('click', () => updateZoom(100));
  }

  // ----------------------------------------------------
  // TAB 2: CAFE QR CODE (DEDICATED SECTION)
  // ----------------------------------------------------
  async function renderQrTab(content, data) {
    const { cafe, license } = data;
    const isLicenseActive = license?.status === 'active' && (!license.expires_at || new Date(license.expires_at) > new Date());
    
    // Stable, non-sensitive Customer Entry Point URL
    // Priority: custom slug if set, fallback to qr_code_id
    const customerIdentifier = cafe.slug || cafe.qr_code_id || cafe.id;
    const customerEntryUrl = `${window.location.origin}/c/${customerIdentifier}`;

    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">CUSTOMER PORTAL ENTRY</span>
            <h2 class="editorial-h2">Unique Cafe Customer QR Code</h2>
            <p class="auth-subtext">Every cyber cafe has its own permanent, cryptographically stable customer-facing QR identity for mobile scan-to-print.</p>
          </div>
          <div class="section-actions">
            <button class="btn btn-secondary" id="openCustomerPortalBtn">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;">
                <path d="M10 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6M13 3h4v4M9 11l8-8"/>
              </svg>
              <span>Test Customer Portal</span>
            </button>
            <button class="btn btn-primary" id="printQrBtn">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;">
                <path d="M5 7V3h10v4M5 13H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M5 11h10v6H5v-6z"/>
              </svg>
              <span>Print Display Card</span>
            </button>
          </div>
        </div>

        ${!isLicenseActive ? `
          <div class="alert-box alert-error mt-4">
            <p><strong>License Status Notice:</strong> Your cafe license is currently inactive or expired. Customers scanning your QR code will be notified that order submission is temporarily paused.</p>
          </div>
        ` : ''}

        <!-- Two Column Layout: Left QR Card & Right Counter Display Preview -->
        <div class="dashboard-two-col mt-6">
          <!-- Left: High-Res QR Generator & Direct Links -->
          <div class="col-card qr-main-card">
            <div class="col-card-header">
              <h3 class="col-card-title">Permanent Cafe QR Identity</h3>
              <span class="status-pill ${isLicenseActive ? 'pill-active' : 'pill-revoked'}">
                <span class="pill-dot"></span>
                <span>${isLicenseActive ? 'READY FOR PRINTING' : 'LICENSE SUSPENDED'}</span>
              </span>
            </div>

            <!-- Canvas wrapper -->
            <div class="qr-canvas-center-wrap mt-4 text-center">
              <div class="qr-canvas-box" id="qrCanvasBox">
                <canvas id="cafeQrCanvas" width="280" height="280"></canvas>
              </div>
              <div class="qr-caption mt-2">
                <strong class="font-mono text-base">${escapeHtml(cafe.name)}</strong>
                <p class="text-xs text-muted font-mono mt-1">PUBLIC QR ID: ${cafe.qr_code_id || cafe.id}</p>
              </div>
            </div>

            <!-- Download Button -->
            <div class="qr-card-actions mt-4">
              <button class="btn btn-secondary w-full" id="downloadQrPngBtn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;">
                  <path d="M3 13v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3M7 9l3 3 3-3M10 2v10"/>
                </svg>
                <span>Download High-Resolution PNG (1024x1024)</span>
              </button>
            </div>

            <!-- Customer Entry Point URL Box -->
            <div class="entry-url-box mt-4">
              <label class="form-label font-mono">CUSTOMER URL / ENTRY POINT</label>
              <div class="url-copy-row">
                <input type="text" id="customerUrlInput" class="form-input font-mono" value="${customerEntryUrl}" readonly />
                <button class="btn btn-sm btn-secondary" id="copyCustomerUrlBtn">Copy</button>
              </div>
              <span class="field-hint">Customers can open this link directly in mobile browsers.</span>
            </div>

            <!-- Security Architecture Notice -->
            <div class="alert-box alert-secondary mt-4">
              <div class="text-xs">
                <strong>Zero Sensitive Credentials:</strong> This QR code is purely a public entry pointer. It never contains administrative tokens, passwords, database credentials, or private device keys.
              </div>
            </div>
          </div>

          <!-- Right: Official Print-Friendly Physical Counter Layout -->
          <div class="col-card qr-counter-preview-card">
            <div class="col-card-header">
              <h3 class="col-card-title">Counter Display Layout (Print Preview)</h3>
              <span class="badge badge-staff font-mono">STANDARDIZED FORMAT</span>
            </div>

            <div class="counter-display-sheet mt-4" id="counterDisplaySheetPreview">
              <div class="counter-sheet-border">
                <div class="counter-sheet-cafe-name">${escapeHtml(cafe.name)}</div>
                <div class="counter-sheet-scan-heading">SCAN TO PRINT</div>
                <div class="counter-sheet-qr-frame">
                  <canvas id="previewSheetCanvas" width="220" height="220"></canvas>
                </div>
                <div class="counter-sheet-instructions">
                  Upload your documents and submit a print order.
                </div>
                <div class="counter-sheet-footer font-mono">
                  <span>Powered by PressPoint Digital Counter</span>
                  <span class="counter-footer-url">${customerEntryUrl}</span>
                </div>
              </div>
            </div>

            <div class="mt-4 text-center">
              <button class="btn btn-primary" id="printCounterSheetBtn">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;">
                  <path d="M5 7V3h10v4M5 13H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M5 11h10v6H5v-6z"/>
                </svg>
                <span>Print Physical Counter Stand</span>
              </button>
              <p class="text-xs text-muted mt-2">Print on A4/cardstock to place beside your counter monitor or glass counter.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Render QR Code onto both canvases using QRCode library
    const canvasMain = document.getElementById('cafeQrCanvas');
    const canvasPreview = document.getElementById('previewSheetCanvas');

    try {
      if (canvasMain) {
        await QRCode.toCanvas(canvasMain, customerEntryUrl, {
          width: 280,
          margin: 2,
          color: {
            dark: '#111827',
            light: '#ffffff'
          }
        });
      }
      if (canvasPreview) {
        await QRCode.toCanvas(canvasPreview, customerEntryUrl, {
          width: 220,
          margin: 2,
          color: {
            dark: '#111827',
            light: '#ffffff'
          }
        });
      }
    } catch (err) {
      console.error('Failed to render QR Code to canvas:', err);
    }

    // Attach Event Handlers:
    // 1. Download PNG in Ultra High-Res (1024x1024)
    document.getElementById('downloadQrPngBtn')?.addEventListener('click', async () => {
      try {
        const offscreenCanvas = document.createElement('canvas');
        await QRCode.toCanvas(offscreenCanvas, customerEntryUrl, {
          width: 1024,
          margin: 2,
          color: {
            dark: '#111827',
            light: '#ffffff'
          }
        });
        const pngUrl = offscreenCanvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = `${(cafe.slug || 'cafe')}-presspoint-qr.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        showNotification('High-resolution QR code downloaded.', 'success');
      } catch (err) {
        showNotification('Could not generate high-res QR download.', 'error');
      }
    });

    // 2. Copy Customer URL
    document.getElementById('copyCustomerUrlBtn')?.addEventListener('click', async () => {
      const urlInput = document.getElementById('customerUrlInput');
      if (urlInput) {
        urlInput.select();
        await navigator.clipboard.writeText(customerEntryUrl);
        showNotification('Customer portal link copied to clipboard.', 'success');
      }
    });

    // 3. Open / Test Customer Portal
    const openCustomerPortal = () => {
      window.open(customerEntryUrl, '_blank');
    };
    document.getElementById('openCustomerPortalBtn')?.addEventListener('click', openCustomerPortal);

    // 4. Print Physical Counter Stand (clean print window)
    const handlePrintSheet = async () => {
      try {
        const printCanvas = document.createElement('canvas');
        await QRCode.toCanvas(printCanvas, customerEntryUrl, {
          width: 600,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' }
        });
        const qrImgData = printCanvas.toDataURL('image/png');

        const printWindow = window.open('', '_blank', 'width=800,height=950');
        if (!printWindow) {
          alert('Popup blocked. Please allow popups for printing.');
          return;
        }

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>PressPoint Counter Stand - ${escapeHtml(cafe.name)}</title>
            <style>
              @page { size: auto; margin: 15mm; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #ffffff;
                color: #111827;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 90vh;
                margin: 0;
                padding: 20px;
                box-sizing: border-box;
                text-align: center;
              }
              .counter-frame {
                border: 3px solid #111827;
                border-radius: 20px;
                padding: 48px 36px;
                max-width: 520px;
                width: 100%;
                box-sizing: border-box;
                box-shadow: 0 4px 20px rgba(0,0,0,0.05);
              }
              .cafe-title {
                font-size: 32px;
                font-weight: 800;
                letter-spacing: -0.02em;
                text-transform: uppercase;
                margin-bottom: 6px;
                color: #111827;
              }
              .scan-title {
                font-size: 36px;
                font-weight: 900;
                letter-spacing: 0.08em;
                color: #2563eb;
                margin-bottom: 28px;
              }
              .qr-box {
                display: inline-block;
                padding: 16px;
                border: 3px solid #111827;
                border-radius: 16px;
                background: #ffffff;
                margin-bottom: 28px;
              }
              .qr-box img {
                display: block;
                width: 300px;
                height: 300px;
              }
              .instructions {
                font-size: 20px;
                font-weight: 700;
                color: #1f2937;
                margin-bottom: 16px;
                line-height: 1.4;
              }
              .footer-url {
                font-size: 13px;
                color: #4b5563;
                font-family: monospace;
                border-top: 1px dashed #d1d5db;
                padding-top: 16px;
                margin-top: 16px;
              }
            </style>
          </head>
          <body>
            <div class="counter-frame">
              <div class="cafe-title">${escapeHtml(cafe.name)}</div>
              <div class="scan-title">SCAN TO PRINT</div>
              <div class="qr-box">
                <img src="${qrImgData}" alt="Cafe QR Code" />
              </div>
              <div class="instructions">Upload your documents and submit a print order.</div>
              <div class="footer-url">${customerEntryUrl}</div>
            </div>
            <script>
              window.onload = function() {
                window.print();
              };
            <\/script>
          </body>
          </html>
        `);
        printWindow.document.close();
      } catch (e) {
        console.error('Print display error:', e);
        showNotification('Failed to generate print layout.', 'error');
      }
    };

    document.getElementById('printQrBtn')?.addEventListener('click', handlePrintSheet);
    document.getElementById('printCounterSheetBtn')?.addEventListener('click', handlePrintSheet);
  }

  // ----------------------------------------------------
  // TAB 3: PRINT AGENT & DEVICES
  // ----------------------------------------------------
  function renderDevicesTab(content, data) {
    const { devices, stats, license } = data;
    const maxDev = stats.max_devices || license?.max_devices || 3;
    const activeDev = devices.filter(d => d.status === 'authorized').length;

    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">COUNTER HARDWARE</span>
            <h2 class="editorial-h2">Windows Print Agent & Authorized PCs</h2>
            <p class="auth-subtext">Manage local Windows computers authorized to connect to this Cafe and receive secure print jobs.</p>
          </div>
          <div class="section-actions">
            <button class="btn btn-secondary" id="downloadAgentBtnMain">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;"><path d="M3 13v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3M7 9l3 3 3-3M10 2v10"/></svg>
              <span>Download Agent (.bat)</span>
            </button>
            <button class="btn btn-primary" id="openAddPcModalBtn">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;"><path d="M12 4v16m8-8H4"/></svg>
              <span>Add PC</span>
            </button>
          </div>
        </div>

        <!-- Setup Guide Accordion/Card -->
        <div class="setup-guide-card mt-6">
          <div class="guide-header">
            <div class="guide-badge font-mono">OFFICIAL WINDOWS SETUP GUIDE</div>
            <h3 class="guide-title">How to connect your counter PC in 6 easy steps:</h3>
          </div>
          <div class="guide-steps-grid">
            <div class="step-card">
              <span class="step-num font-mono">01</span>
              <h4>Download Agent</h4>
              <p>Click <strong>Download Agent</strong> above to get the official installer package on the Windows PC.</p>
            </div>
            <div class="step-card">
              <span class="step-num font-mono">02</span>
              <h4>Run Installer</h4>
              <p>Run <code>CyberCafe_Print_Agent_Setup.bat</code>. It provisions required directories and auto-startup.</p>
            </div>
            <div class="step-card">
              <span class="step-num font-mono">03</span>
              <h4>Launch Agent</h4>
              <p>The Print Agent starts and opens its lightweight local counter console at <code>localhost:9876</code>.</p>
            </div>
            <div class="step-card">
              <span class="step-num font-mono">04</span>
              <h4>Click "Add PC"</h4>
              <p>Click the <strong>Add PC</strong> button on this dashboard to generate a one-time 15-minute pairing code.</p>
            </div>
            <div class="step-card">
              <span class="step-num font-mono">05</span>
              <h4>Complete Pairing</h4>
              <p>Enter the pairing code into the Print Agent. An ECDSA P-256 keypair is generated and bound to your PC.</p>
            </div>
            <div class="step-card">
              <span class="step-num font-mono">06</span>
              <h4>Auto-Start & Ready</h4>
              <p>The agent automatically restarts on Windows boot and quietly listens for print jobs.</p>
            </div>
          </div>
        </div>

        <!-- Device Capacity Counter -->
        <div class="capacity-banner mt-6">
          <div class="capacity-left">
            <strong class="font-mono">AUTHORIZED PCS: ${activeDev} / ${maxDev}</strong>
            <span class="text-muted text-sm ml-2 font-mono">(${maxDev - activeDev} slots remaining on current license)</span>
          </div>
          <div class="capacity-bar-wrap">
            <div class="capacity-bar-fill" style="width: ${(activeDev / maxDev) * 100}%"></div>
          </div>
        </div>

        <!-- Devices Table -->
        <div class="data-table-container mt-6">
          <table class="data-table">
            <thead>
              <tr>
                <th>Device Label</th>
                <th>Status</th>
                <th>Discovered Windows Printers</th>
                <th>Selected Default Printer</th>
                <th>Hardware Security</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${devices.length === 0 ? `
                <tr>
                  <td colspan="7" class="text-center py-6 text-muted">
                    No authorized PCs connected to this Cafe yet. Click <strong>Add PC</strong> to pair your first counter machine.
                  </td>
                </tr>
              ` : devices.map(dev => {
                const isOnline = dev.status === 'authorized' && dev.last_seen_at && (new Date() - new Date(dev.last_seen_at) < 300000);
                const printers = Array.isArray(dev.discovered_printers) ? dev.discovered_printers : [];
                return `
                  <tr>
                    <td>
                      <strong>${dev.device_label || 'Unnamed PC'}</strong>
                      <div class="font-mono text-xs text-muted">ID: ${dev.id.substring(0, 8)}...</div>
                    </td>
                    <td>
                      <span class="status-pill ${dev.status === 'authorized' ? (isOnline ? 'pill-active' : 'pill-yellow') : 'pill-revoked'}">
                        <span class="pill-dot"></span>
                        <span>${dev.status === 'authorized' ? (isOnline ? 'Online' : 'Offline') : 'Revoked'}</span>
                      </span>
                    </td>
                    <td>
                      ${printers.length === 0 ? `
                        <span class="text-muted text-xs">Waiting for agent discovery...</span>
                      ` : `
                        <div class="printer-tags-list">
                          ${printers.map(p => `<span class="printer-tag font-mono text-xs" title="${p.Name || p.name}">${(p.Name || p.name).substring(0, 20)}</span>`).join(' ')}
                        </div>
                      `}
                    </td>
                    <td>
                      <select class="form-select form-select-sm device-printer-select" data-device-id="${dev.id}" ${dev.status !== 'authorized' ? 'disabled' : ''}>
                        <option value="">${dev.selected_printer ? `Current: ${dev.selected_printer}` : '-- Select Printer --'}</option>
                        ${printers.map(p => {
                          const pName = p.Name || p.name;
                          return `<option value="${pName}" ${dev.selected_printer === pName ? 'selected' : ''}>${pName}</option>`;
                        }).join('')}
                      </select>
                    </td>
                    <td class="font-mono text-xs">
                      ${dev.tpm_backed ? '<span class="text-green">&check; TPM 2.0</span>' : '<span class="text-muted">OS Software Key</span>'}
                    </td>
                    <td class="font-mono text-xs text-muted">
                      ${dev.last_seen_at ? formatTimeAgo(dev.last_seen_at) : 'Never'}
                    </td>
                    <td>
                      ${dev.status === 'authorized' ? `
                        <button class="btn btn-sm btn-ghost text-danger revoke-device-btn" data-device-id="${dev.id}" data-label="${dev.device_label}">
                          Revoke
                        </button>
                      ` : `
                        <span class="text-muted text-xs font-mono">Revoked</span>
                      `}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('downloadAgentBtnMain')?.addEventListener('click', downloadAgentInstaller);
    document.getElementById('openAddPcModalBtn')?.addEventListener('click', openAddPcModal);

    // Printer selection change handlers
    content.querySelectorAll('.device-printer-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const deviceId = sel.getAttribute('data-device-id');
        const printerName = e.target.value;
        if (!printerName) return;

        sel.disabled = true;
        const res = await selectDevicePrinter(deviceId, printerName);
        sel.disabled = false;
        if (res.success) {
          showNotification('Default printer updated successfully.', 'success');
          loadData();
        } else {
          showNotification(res.error, 'error');
        }
      });
    });

    // Revoke device handlers
    content.querySelectorAll('.revoke-device-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const devId = btn.getAttribute('data-device-id');
        const label = btn.getAttribute('data-label');
        if (!confirm(`Are you sure you want to revoke authorization for "${label}"? This PC will immediately lose access to receive print jobs.`)) return;

        btn.disabled = true;
        const res = await revokeDevice(devId);
        if (res.success) {
          showNotification(`Device "${label}" has been revoked.`, 'success');
          loadData();
        } else {
          btn.disabled = false;
          showNotification(res.error, 'error');
        }
      });
    });
  }

  // ----------------------------------------------------
  // TAB 3: PRICING MANAGEMENT
  // ----------------------------------------------------
  function renderPricingTab(content, data) {
    const { pricing } = data;
    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">REVENUE & RATES</span>
            <h2 class="editorial-h2">Print Pricing Configuration</h2>
            <p class="auth-subtext">Set the per-page printing rates charged to customers. These rates are validated and enforced server-side.</p>
          </div>
        </div>

        <div class="pricing-management-layout mt-6">
          <form id="pricingForm" class="pricing-card-editorial">
            <div class="alert-box alert-info mb-4">
              <p><strong>Strict Authorization:</strong> Only Cafe Administrators can update rates. Staff members have read-only access to customer pricing.</p>
            </div>

            <div class="pricing-category-box">
              <div class="pricing-cat-header">
                <div class="font-mono text-accent">STANDARD MONOCHROME</div>
                <h3>Black & White Printing</h3>
              </div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label for="bwSingleInput" class="form-label">Single-Sided (₹ / page)</label>
                  <div class="currency-input-wrap">
                    <span class="currency-symbol">₹</span>
                    <input type="number" id="bwSingleInput" class="form-input" step="0.25" min="0.10" max="1000" value="${pricing?.bw_single || 2.00}" required />
                  </div>
                  <span class="field-hint">Common rate: ₹2.00 – ₹3.00</span>
                </div>

                <div class="form-group">
                  <label for="bwDoubleInput" class="form-label">Double-Sided (₹ / sheet)</label>
                  <div class="currency-input-wrap">
                    <span class="currency-symbol">₹</span>
                    <input type="number" id="bwDoubleInput" class="form-input" step="0.25" min="0.10" max="1000" value="${pricing?.bw_double || 3.00}" required />
                  </div>
                  <span class="field-hint">Common rate: ₹3.00 – ₹5.00</span>
                </div>
              </div>
            </div>

            <div class="pricing-category-box mt-6">
              <div class="pricing-cat-header">
                <div class="font-mono text-accent">VIBRANT FULL COLOUR</div>
                <h3>Colour Printing</h3>
              </div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label for="colorSingleInput" class="form-label">Single-Sided (₹ / page)</label>
                  <div class="currency-input-wrap">
                    <span class="currency-symbol">₹</span>
                    <input type="number" id="colorSingleInput" class="form-input" step="0.50" min="0.10" max="1000" value="${pricing?.color_single || 10.00}" required />
                  </div>
                  <span class="field-hint">Common rate: ₹10.00 – ₹15.00</span>
                </div>

                <div class="form-group">
                  <label for="colorDoubleInput" class="form-label">Double-Sided (₹ / sheet)</label>
                  <div class="currency-input-wrap">
                    <span class="currency-symbol">₹</span>
                    <input type="number" id="colorDoubleInput" class="form-input" step="0.50" min="0.10" max="1000" value="${pricing?.color_double || 18.00}" required />
                  </div>
                  <span class="field-hint">Common rate: ₹18.00 – ₹25.00</span>
                </div>
              </div>
            </div>

            <div class="pricing-footer mt-6">
              <div class="pricing-last-updated font-mono text-xs text-muted">
                Last updated: ${pricing?.updated_at ? new Date(pricing.updated_at).toLocaleString() : 'System Default'}
              </div>
              <button type="submit" class="btn btn-primary" id="savePricingBtn">
                <span class="btn-spinner" id="pricingSpinner" style="display: none;"></span>
                <span id="savePricingLabel">Save Pricing Rates</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('pricingForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bwSingle = parseFloat(document.getElementById('bwSingleInput').value);
      const bwDouble = parseFloat(document.getElementById('bwDoubleInput').value);
      const colorSingle = parseFloat(document.getElementById('colorSingleInput').value);
      const colorDouble = parseFloat(document.getElementById('colorDoubleInput').value);

      const spinner = document.getElementById('pricingSpinner');
      const label = document.getElementById('savePricingLabel');
      const btn = document.getElementById('savePricingBtn');

      btn.disabled = true;
      spinner.style.display = 'inline-block';
      label.textContent = 'Saving...';

      const res = await updateCafePricing(cafeId, {
        bw_single: bwSingle,
        bw_double: bwDouble,
        color_single: colorSingle,
        color_double: colorDouble
      });

      btn.disabled = false;
      spinner.style.display = 'none';
      label.textContent = 'Save Pricing Rates';

      if (res.success) {
        showNotification('Pricing rates successfully saved to server.', 'success');
        loadData();
      } else {
        showNotification(res.error, 'error');
      }
    });
  }

  // ----------------------------------------------------
  // TAB 4: STAFF MANAGEMENT FOUNDATION
  // ----------------------------------------------------
  function renderStaffTab(content, data) {
    const { staff } = data;
    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">STAFF ACCESS</span>
            <h2 class="editorial-h2">Cafe Staff Accounts</h2>
            <p class="auth-subtext">Manage counter staff accounts authorized to process customer print jobs and operate printing terminals.</p>
          </div>
          <button class="btn btn-primary" id="openAddStaffModalBtn">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;"><path d="M12 4v16m8-8H4"/></svg>
            <span>Add Staff Member</span>
          </button>
        </div>

        <div class="alert-box alert-info mt-6">
          <p><strong>Role Permissions:</strong> Staff accounts can view the print queue and process print orders. Staff accounts cannot change pricing, alter license details, or access revenue totals.</p>
        </div>

        <!-- Staff Table -->
        <div class="data-table-container mt-6">
          <table class="data-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Email Address</th>
                <th>Role</th>
                <th>Account Status</th>
                <th>Created</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${staff.length === 0 ? `
                <tr>
                  <td colspan="7" class="text-center py-6 text-muted">
                    No staff accounts created yet. Click <strong>Add Staff Member</strong> to create your first counter operator.
                  </td>
                </tr>
              ` : staff.map(st => `
                <tr>
                  <td><strong>${st.full_name || 'Staff Member'}</strong></td>
                  <td class="font-mono">${st.email}</td>
                  <td><span class="badge badge-staff font-mono">STAFF</span></td>
                  <td>
                    <span class="status-pill ${st.account_status === 'active' ? 'pill-active' : 'pill-revoked'}">
                      <span class="pill-dot"></span>
                      <span>${st.account_status.toUpperCase()}</span>
                    </span>
                  </td>
                  <td class="font-mono text-xs text-muted">${new Date(st.created_at).toLocaleDateString()}</td>
                  <td class="font-mono text-xs text-muted">${st.last_login_at ? formatTimeAgo(st.last_login_at) : 'Never'}</td>
                  <td>
                    ${st.account_status === 'active' ? `
                      <button class="btn btn-sm btn-ghost text-danger toggle-staff-btn" data-staff-id="${st.id}" data-action="disabled" data-name="${st.full_name || st.email}">
                        Disable
                      </button>
                    ` : `
                      <button class="btn btn-sm btn-ghost text-accent toggle-staff-btn" data-staff-id="${st.id}" data-action="active" data-name="${st.full_name || st.email}">
                        Enable
                      </button>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('openAddStaffModalBtn')?.addEventListener('click', openAddStaffModal);

    content.querySelectorAll('.toggle-staff-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const staffId = btn.getAttribute('data-staff-id');
        const action = btn.getAttribute('data-action');
        const name = btn.getAttribute('data-name');

        if (!confirm(`Are you sure you want to change status to "${action}" for ${name}?`)) return;

        btn.disabled = true;
        const res = await updateStaffStatus(cafeId, staffId, action);
        if (res.success) {
          showNotification(`Staff member status updated to ${action}.`, 'success');
          loadData();
        } else {
          btn.disabled = false;
          showNotification(res.error, 'error');
        }
      });
    });
  }

  // ----------------------------------------------------
  // TAB 5: CAFE PROFILE
  // ----------------------------------------------------
  function renderProfileTab(content, data) {
    const { cafe, license } = data;
    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">BUSINESS IDENTITY</span>
            <h2 class="editorial-h2">Cafe Profile Information</h2>
            <p class="auth-subtext">Manage public-facing information for your Cyber Cafe. Immutable security identifiers are locked and protected.</p>
          </div>
        </div>

        <div class="profile-layout-grid mt-6">
          <!-- Editable Fields Form -->
          <form id="cafeProfileForm" class="profile-card">
            <h3 class="card-section-title">Editable Cafe Details</h3>

            <div class="form-group mt-4">
              <label for="profName" class="form-label">Cafe Business Name</label>
              <input type="text" id="profName" class="form-input" value="${cafe.name || ''}" required />
            </div>

            <div class="form-grid-2 mt-4">
              <div class="form-group">
                <label for="profEmail" class="form-label">Contact Email</label>
                <input type="email" id="profEmail" class="form-input" value="${cafe.contact_email || ''}" required />
              </div>
              <div class="form-group">
                <label for="profPhone" class="form-label">Contact Phone</label>
                <input type="tel" id="profPhone" class="form-input" value="${cafe.contact_phone || ''}" placeholder="+91 98765 43210" />
              </div>
            </div>

            <div class="form-group mt-4">
              <label for="profAddress" class="form-label">Physical Address</label>
              <input type="text" id="profAddress" class="form-input" value="${cafe.address || ''}" placeholder="Shop 4, Ground Floor, Central Plaza..." />
            </div>

            <div class="form-group mt-4">
              <label for="profSlug" class="form-label">Custom URL Slug</label>
              <div class="slug-input-wrap">
                <span class="slug-prefix">presspoint.io/c/</span>
                <input type="text" id="profSlug" class="form-input slug-input" value="${cafe.slug || ''}" pattern="^[a-z0-9-]+$" required />
              </div>
              <span class="field-hint">Customers can open your kiosk upload portal using this direct slug.</span>
            </div>

            <div class="profile-actions mt-6">
              <button type="submit" class="btn btn-primary" id="saveProfileBtn">
                <span class="btn-spinner" id="profileSpinner" style="display: none;"></span>
                <span id="saveProfileLabel">Save Profile Changes</span>
              </button>
            </div>
          </form>

          <!-- Read-Only Protected Security Identifiers -->
          <div class="protected-identifiers-card">
            <div class="protected-header">
              <div class="lock-icon">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px;">
                  <rect x="3" y="9" width="14" height="9" rx="2" ry="2"/>
                  <path d="M6 9V5a4 4 0 0 1 8 0v4"/>
                </svg>
              </div>
              <div>
                <h3 class="protected-title">Protected Security Identifiers</h3>
                <p class="text-xs text-muted">Immutable cryptographic tokens managed solely by Super Admin.</p>
              </div>
            </div>

            <div class="id-item mt-4">
              <span class="id-label font-mono">CAFE ID (UUID)</span>
              <code class="id-code font-mono">${cafe.id}</code>
            </div>

            <div class="id-item mt-3">
              <span class="id-label font-mono">ACTIVE LICENSE NUMBER</span>
              <code class="id-code font-mono text-accent">${license?.license_number || 'N/A'}</code>
            </div>

            <div class="id-item mt-3">
              <span class="id-label font-mono">LICENSE STATUS</span>
              <span class="status-pill ${license?.status === 'active' ? 'pill-active' : 'pill-revoked'}">
                <span class="pill-dot"></span>
                <span>${(license?.status || 'INACTIVE').toUpperCase()}</span>
              </span>
            </div>

            <div class="id-item mt-3">
              <span class="id-label font-mono">AUTHORIZATION TOKEN</span>
              <code class="id-code font-mono">•••••••••••••••• (Hash Protected)</code>
            </div>

            <div class="alert-box alert-secondary mt-4">
              <p class="text-xs text-muted">Device identities and license credentials are cryptographically isolated per tenant and cannot be modified from the Cafe Admin workstation.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('cafeProfileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('profName').value;
      const email = document.getElementById('profEmail').value;
      const phone = document.getElementById('profPhone').value;
      const address = document.getElementById('profAddress').value;
      const slug = document.getElementById('profSlug').value;

      const spinner = document.getElementById('profileSpinner');
      const label = document.getElementById('saveProfileLabel');
      const btn = document.getElementById('saveProfileBtn');

      btn.disabled = true;
      spinner.style.display = 'inline-block';
      label.textContent = 'Saving...';

      const res = await updateCafeProfile(cafeId, {
        name,
        contact_email: email,
        contact_phone: phone,
        address,
        slug
      });

      btn.disabled = false;
      spinner.style.display = 'none';
      label.textContent = 'Save Profile Changes';

      if (res.success) {
        showNotification('Cafe profile updated successfully.', 'success');
        loadData();
      } else {
        showNotification(res.error, 'error');
      }
    });
  }

  // ----------------------------------------------------
  // TAB 6: LICENSE
  // ----------------------------------------------------
  function renderLicenseTab(content, data) {
    const { license, stats } = data;
    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">SUBSCRIPTION & SEATS</span>
            <h2 class="editorial-h2">Cafe License Status</h2>
            <p class="auth-subtext">View your active PressPoint license parameters, device seat allocations, and validity duration.</p>
          </div>
        </div>

        <div class="license-display-card mt-6">
          <div class="license-banner-row">
            <div>
              <span class="license-meta-lbl font-mono">OFFICIAL LICENSE NUMBER</span>
              <div class="license-number-big font-mono">${license?.license_number || 'UNLICENSED'}</div>
            </div>
            <span class="status-pill ${license?.status === 'active' ? 'pill-active' : 'pill-revoked'}">
              <span class="pill-dot"></span>
              <span>${(license?.status || 'INACTIVE').toUpperCase()}</span>
            </span>
          </div>

          <div class="license-grid-3 mt-6">
            <div class="license-param-box">
              <span class="param-lbl font-mono">MAX AUTHORIZED PCS</span>
              <span class="param-val">${license?.max_devices || 3} Computers</span>
              <span class="param-sub font-mono text-muted">${stats.active_devices || 0} active</span>
            </div>

            <div class="license-param-box">
              <span class="param-lbl font-mono">VALIDITY PERIOD</span>
              <span class="param-val font-mono">${license?.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'N/A'}</span>
              <span class="param-sub font-mono text-green">Active Subscription</span>
            </div>

            <div class="license-param-box">
              <span class="param-lbl font-mono">REGISTRATION CLAIM</span>
              <span class="param-val font-mono">${license?.claimed_at ? new Date(license.claimed_at).toLocaleDateString() : 'Claimed'}</span>
              <span class="param-sub font-mono text-muted">Bound to Cafe</span>
            </div>
          </div>

          <div class="alert-box alert-secondary mt-6">
            <p>To upgrade your PC seat limit or extend your license term, contact your PressPoint account manager or Super Administrator.</p>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------
  // TAB 7: SETTINGS
  // ----------------------------------------------------
  function renderSettingsTab(content, data) {
    const { cafe } = data;
    content.innerHTML = `
      <div class="tab-pane-fade">
        <div class="section-editorial-header">
          <div>
            <span class="pill-tag font-mono">CONFIGURATION</span>
            <h2 class="editorial-h2">Workstation Settings</h2>
            <p class="auth-subtext">Defense-in-depth telemetry, local print agent heartbeat configuration, and session security.</p>
          </div>
        </div>

        <div class="settings-grid mt-6">
          <div class="settings-card">
            <h3>Print Agent Heartbeat Settings</h3>
            <p class="text-sm text-muted mt-1">Configure interval for local Print Agent heartbeat pings to detect counter PC network disconnects.</p>
            <div class="form-group mt-4">
              <label class="form-label">Heartbeat Frequency</label>
              <input type="text" class="form-input font-mono" value="Every 60 seconds (Auto-reconnect with backoff)" disabled />
            </div>
            <div class="form-group mt-3">
              <label class="form-label">Offline Alarm Threshold</label>
              <input type="text" class="form-input font-mono" value="5 minutes without signal" disabled />
            </div>
          </div>

          <div class="settings-card">
            <h3>Cryptographic Integrity</h3>
            <p class="text-sm text-muted mt-1">Verification parameters for zero-trust print job dispatching.</p>
            <div class="setting-row mt-4">
              <span>Device Keypair Standard</span>
              <strong class="font-mono text-accent">ECDSA P-256 (prime256v1)</strong>
            </div>
            <div class="setting-row mt-3">
              <span>Challenge Nonce Expiry</span>
              <strong class="font-mono">5 Minutes (Replay Protected)</strong>
            </div>
            <div class="setting-row mt-3">
              <span>Temporary Spool Cleanup</span>
              <strong class="font-mono text-green">Immediate Post-Print Purge</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------
  // MODALS & ACTIONS
  // ----------------------------------------------------

  // 1. ADD PC MODAL (One-Time Pairing Code)
  function openAddPcModal() {
    const modal = document.getElementById('cafeModalContainer');
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="admin-modal-card">
        <div class="modal-header">
          <div>
            <span class="pill-tag font-mono">ONE-TIME PAIRING</span>
            <h3 class="modal-title">Add Windows Counter PC</h3>
            <p class="auth-subtext">Generate a 15-minute pairing code to authorize a new computer running the Print Agent.</p>
          </div>
          <button class="modal-close-btn" id="closeAddPcModalBtn">&times;</button>
        </div>

        <div id="addPcStep1">
          <div class="form-group mt-4">
            <label for="newPcLabelInput" class="form-label">PC Label / Counter Identifier</label>
            <input type="text" id="newPcLabelInput" class="form-input" placeholder="e.g. Counter-PC-01, Counter-Billing-PC" required />
            <span class="field-hint">A friendly name to identify this workstation in your dashboard.</span>
          </div>

          <div class="modal-actions mt-6">
            <button class="btn btn-secondary" id="cancelAddPcBtn">Cancel</button>
            <button class="btn btn-primary" id="generatePairingCodeBtn">
              <span class="btn-spinner" id="genPairingSpinner" style="display: none;"></span>
              <span id="genPairingLabel">Generate Pairing Code</span>
            </button>
          </div>
        </div>

        <div id="addPcStep2" style="display: none;">
          <div class="pairing-code-display mt-4">
            <span class="pairing-code-label font-mono">YOUR ONE-TIME PAIRING CODE</span>
            <div class="pairing-code-box font-mono" id="pairingCodeValue">PC-XXXXXX</div>
            <span class="pairing-timer font-mono text-xs text-accent">Valid for 15 minutes</span>
          </div>

          <div class="alert-box alert-secondary mt-4">
            <p class="text-xs">
              <strong>Instructions:</strong> Open the Print Agent on your Windows PC (<code>http://localhost:9876</code>) and enter this code. The PC will automatically generate an ECDSA P-256 keypair and connect.
            </p>
          </div>

          <div class="modal-actions mt-6">
            <button class="btn btn-secondary" id="copyPairingCodeBtn">Copy Code</button>
            <button class="btn btn-primary" id="finishAddPcBtn">Done</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('closeAddPcModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelAddPcBtn').addEventListener('click', closeModal);

    document.getElementById('generatePairingCodeBtn').addEventListener('click', async () => {
      const label = document.getElementById('newPcLabelInput').value.trim();
      const spinner = document.getElementById('genPairingSpinner');
      const btnLabel = document.getElementById('genPairingLabel');
      const btn = document.getElementById('generatePairingCodeBtn');

      btn.disabled = true;
      spinner.style.display = 'inline-block';
      btnLabel.textContent = 'Generating...';

      const res = await createDevicePairingCode(cafeId, label);

      btn.disabled = false;
      spinner.style.display = 'none';
      btnLabel.textContent = 'Generate Pairing Code';

      if (!res.success) {
        showNotification(res.error, 'error');
        return;
      }

      document.getElementById('addPcStep1').style.display = 'none';
      document.getElementById('addPcStep2').style.display = 'block';
      document.getElementById('pairingCodeValue').textContent = res.data.pairing_code;

      document.getElementById('copyPairingCodeBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(res.data.pairing_code);
        showNotification('Pairing code copied to clipboard!', 'success');
      });

      document.getElementById('finishAddPcBtn').addEventListener('click', () => {
        closeModal();
        loadData();
      });
    });
  }

  // 2. ADD STAFF MODAL
  function openAddStaffModal() {
    const modal = document.getElementById('cafeModalContainer');
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="admin-modal-card">
        <div class="modal-header">
          <div>
            <span class="pill-tag font-mono">STAFF PROVISIONING</span>
            <h3 class="modal-title">Add Staff Member</h3>
            <p class="auth-subtext">Create a counter operator account with role: <code>staff</code>.</p>
          </div>
          <button class="modal-close-btn" id="closeAddStaffModalBtn">&times;</button>
        </div>

        <form id="addStaffForm" class="mt-4">
          <div class="form-group">
            <label for="staffFullNameInput" class="form-label">Full Name</label>
            <input type="text" id="staffFullNameInput" class="form-input" placeholder="e.g. Rahul Sharma" required />
          </div>

          <div class="form-group mt-3">
            <label for="staffEmailInput" class="form-label">Email Address</label>
            <input type="email" id="staffEmailInput" class="form-input" placeholder="rahul@cybercafe.com" required />
          </div>

          <div class="form-group mt-3">
            <label for="staffPasswordInput" class="form-label">Temporary Password (min 8 characters)</label>
            <input type="password" id="staffPasswordInput" class="form-input" placeholder="••••••••••••" minlength="8" required />
            <span class="field-hint">The staff member can change their password upon first login.</span>
          </div>

          <div class="modal-actions mt-6">
            <button type="button" class="btn btn-secondary" id="cancelAddStaffBtn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="submitAddStaffBtn">
              <span class="btn-spinner" id="staffSpinner" style="display: none;"></span>
              <span id="staffBtnLabel">Create Staff Account</span>
            </button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('closeAddStaffModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelAddStaffBtn').addEventListener('click', closeModal);

    document.getElementById('addStaffForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('staffFullNameInput').value.trim();
      const email = document.getElementById('staffEmailInput').value.trim();
      const password = document.getElementById('staffPasswordInput').value;

      const spinner = document.getElementById('staffSpinner');
      const label = document.getElementById('staffBtnLabel');
      const btn = document.getElementById('submitAddStaffBtn');

      btn.disabled = true;
      spinner.style.display = 'inline-block';
      label.textContent = 'Creating...';

      const res = await addCafeStaff(cafeId, {
        email,
        full_name: fullName,
        password
      });

      btn.disabled = false;
      spinner.style.display = 'none';
      label.textContent = 'Create Staff Account';

      if (res.success) {
        showNotification(`Staff member "${fullName}" added successfully.`, 'success');
        closeModal();
        loadData();
      } else {
        showNotification(res.error, 'error');
      }
    });
  }

  function closeModal() {
    const modal = document.getElementById('cafeModalContainer');
    if (modal) modal.style.display = 'none';
  }

  // 3. QUICK TEST PRINT JOB
  async function handleQuickTestPrint() {
    const btn = document.getElementById('quickTestPrintBtn');
    if (btn) btn.disabled = true;

    const res = await createTestPrintJob(cafeId, {
      fileName: 'Customer_Application_Form.pdf',
      colorMode: 'bw',
      pages: 2
    });

    if (btn) btn.disabled = false;

    if (res.success) {
      showNotification(`Test print job ${res.data.job_number} created and queued!`, 'success');
      loadData();
    } else {
      showNotification(res.error, 'error');
    }
  }

  // 4. DOWNLOAD PRINT AGENT INSTALLER
  function downloadAgentInstaller() {
    const webAppUrl = window.location.origin || 'http://localhost:5173';
    const clientSupabaseUrl = import.meta.env?.VITE_SUPABASE_URL || '';
    const clientSupabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

    // Generate the official Windows installer batch script with dynamic Web App Location
    const installerBatchContent = `@echo off
title PressPoint Print Agent Setup
color 0A
echo ========================================================
echo       PressPoint Windows Print Agent Installer
echo ========================================================
echo.

:: 1. Configuration & Web App Location
set "APP_WEB_URL=${webAppUrl}"
set "INSTALL_DIR=%LOCALAPPDATA%\\PressPointPrintAgent"
echo [*] Installing to: %INSTALL_DIR%
echo [*] Web Application Location: %APP_WEB_URL%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\\spool" mkdir "%INSTALL_DIR%\\spool"

:: 2. Obtain Print Agent Runtime Files
echo [*] Provisioning Print Agent runtime files...
if exist "%~dp0print_agent_service.mjs" (
    copy /Y "%~dp0print_agent_service.mjs" "%INSTALL_DIR%\\print_agent_service.mjs" >nul 2>&1
    echo [OK] Copied local agent file.
) else (
    echo [*] Fetching print_agent_service.mjs from %APP_WEB_URL%/print_agent_service.mjs...
    curl -s -f -o "%INSTALL_DIR%\\print_agent_service.mjs" "%APP_WEB_URL%/print_agent_service.mjs"
    if exist "%INSTALL_DIR%\\print_agent_service.mjs" (
        echo [OK] Successfully downloaded print_agent_service.mjs.
    ) else (
        echo [!] Warning: Could not download agent from %APP_WEB_URL%. Please ensure web server is running.
    )
)

:: 3. Provision Environment Configuration
(
echo VITE_SUPABASE_URL=${clientSupabaseUrl}
echo VITE_SUPABASE_ANON_KEY=${clientSupabaseAnonKey}
echo VITE_APP_WEB_URL=%APP_WEB_URL%
) > "%INSTALL_DIR%\\.env"

:: 4. Configure Windows Automatic Startup on User Login (HKCU\\Run)
echo [*] Configuring automatic startup in Windows Registry...
reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PressPointPrintAgent" /t REG_SZ /d "\\"%INSTALL_DIR%\\run_agent.bat\\"" /f >nul 2>&1
echo [OK] Automatic startup configured.

:: 5. Write launch script
(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo node print_agent_service.mjs
) > "%INSTALL_DIR%\\run_agent.bat"

echo.
echo ========================================================
echo [OK] Print Agent setup completed successfully!
echo [*] Starting local agent interface on http://localhost:9876...
echo ========================================================
echo.

start "" "http://localhost:9876"
cd /d "%INSTALL_DIR%"
node print_agent_service.mjs
pause
`;

    const blob = new Blob([installerBatchContent], { type: 'application/x-bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CyberCafe_Print_Agent_Setup.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('Official Windows installer script downloaded. Run on the printer PC.', 'success');
  }

  // Notifications helper
  function showNotification(msg, type = 'info') {
    const existing = document.getElementById('cafeToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'cafeToast';
    toast.className = `cafe-toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function formatTimeAgo(dateStr) {
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial load
  await loadData();
}
