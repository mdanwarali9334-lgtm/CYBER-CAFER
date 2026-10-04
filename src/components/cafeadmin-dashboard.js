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
  fetchJobSignedPreviewUrl,
  updateJobPrintLayout,
  uploadCustomerPrintDocument
} from '../lib/cafeadmin.js';
import { supabase } from '../lib/supabase.js';
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

  // Realtime & Polling handles
  let pollInterval = null;
  let realtimeChannel = null;

  const cleanupListeners = () => {
    if (pollInterval) clearInterval(pollInterval);
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  };

  // Attach Sign Out
  document.getElementById('cafeSignOutBtn')?.addEventListener('click', async () => {
    cleanupListeners();
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

  async function loadData(silent = false) {
    const res = await fetchCafeDashboardData(cafeId);
    if (!res.success) {
      if (!silent) {
        document.getElementById('cafeTabContent').innerHTML = `
          <div class="alert-box alert-error">
            <p><strong>Failed to load Cafe data:</strong> ${res.error}</p>
            <button class="btn btn-sm btn-secondary mt-3" id="retryLoadBtn">Retry</button>
          </div>
        `;
        document.getElementById('retryLoadBtn')?.addEventListener('click', () => loadData(false));
      }
      return;
    }
    dashboardData = res.data;

    // Update topbar cafe name
    const nameEl = document.getElementById('cafeTopbarName');
    if (nameEl && dashboardData.cafe) {
      nameEl.textContent = `${dashboardData.cafe.name.toUpperCase()} • ${dashboardData.cafe.status.toUpperCase()}`;
    }

    // Update Print Jobs tab badge dynamically
    const activeJobs = (dashboardData.jobs || []).filter(j =>
      ['pending', 'queued', 'assigned', 'downloading', 'printing'].includes(j.status)
    );
    const badgeEl = document.getElementById('tabJobsBadge');
    if (badgeEl) {
      if (activeJobs.length > 0) {
        badgeEl.textContent = activeJobs.length;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // In silent refresh, avoid re-rendering DOM if operator is currently typing or interacting with a modal
    if (silent) {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.id === 'jobsSearchInput' || activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT');
      const isModalOpen = document.getElementById('cafeModalContainer')?.style.display === 'flex' ||
                          document.getElementById('adminPreviewModal') ||
                          document.getElementById('orderDetailsModal');
      if (isModalOpen || isTyping) {
        return;
      }
    }

    renderActiveTab();
  }

  // Subscribe to real-time changes on print_jobs for immediate reactivity
  try {
    realtimeChannel = supabase
      .channel(`cafe-live-jobs-${cafeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_jobs', filter: `cafe_id=eq.${cafeId}` },
        () => {
          loadData(true);
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('[Realtime] Could not subscribe to print_jobs channel:', err);
  }

  // 10-second polling fallback in case websockets are firewalled
  pollInterval = setInterval(() => {
    loadData(true);
  }, 10000);

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
            const isIdEligible = isIdCardEligibleJob(j);

            return `
              <div class="job-card-editorial status-border-${j.status}" data-job-id="${j.id}">
                <div class="job-card-header">
                  <div class="job-card-ident">
                    <span class="job-order-num font-mono font-bold">${escapeHtml(j.order_number || j.job_number)}</span>
                    <span class="job-id-sub font-mono text-muted text-xs">Internal ID: ${escapeHtml(j.job_number)}</span>
                  </div>
                  <div class="job-card-badges">
                    ${isIdEligible ? `<span class="badge font-mono" style="background:rgba(37,99,235,0.12);color:#2563eb;padding:3px 8px;border-radius:12px;font-size:0.7rem;font-weight:700;">🪪 ${j.doc_type === 'aadhaar' ? 'AADHAAR / ID' : j.doc_type === 'other_id' ? 'OTHER ID' : 'ID CARD'}</span>` : ''}
                    <button 
                      type="button" 
                      class="badge-toggle-payment payment-badge-${j.payment_status || 'unpaid'} font-mono" 
                      data-job-id="${j.id}" 
                      data-current-payment="${j.payment_status || 'unpaid'}"
                      ${j.status === 'cancelled' ? 'disabled title="Payment locked for cancelled orders"' : 'title="Click to toggle payment status"'}
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
                      <span>${isIdEligible ? `ID Card Copy: ${j.copies || 1}` : `${j.pages} pg${j.pages > 1 ? 's' : ''}`}</span>
                      ${!isIdEligible && j.copies > 1 ? `<span>${j.copies} copies</span>` : ''}
                      <span>${j.color_mode.toUpperCase()}</span>
                      <span>${j.duplex.toUpperCase()}</span>
                      <span>${(j.orientation || 'portrait').toUpperCase()}</span>
                      ${j.page_range && j.page_range !== 'all' ? `<span>PAGES: ${escapeHtml(j.page_range)}</span>` : ''}
                    </div>
                  </div>

                  ${j.error_message ? `
                    <div class="job-error-notice font-mono text-xs text-danger mt-2" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);padding:6px 10px;border-radius:6px;">
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
                  <button class="btn btn-sm btn-ghost view-job-details-btn" data-job-id="${j.id}" title="View Complete Order Details">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:13px;height:13px;margin-right:4px;">
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                      <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
                    </svg>
                    Details
                  </button>

                  ${!isCompletedOrPurged ? `
                    <button class="btn btn-sm btn-secondary preview-job-btn" data-job-id="${j.id}" title="Inspect and verify document">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Preview
                    </button>
                  ` : `
                    <span class="text-xs font-mono text-muted" title="File was purged after completion for customer privacy">
                      🔒 File Purged
                    </span>
                  `}

                  ${isIdEligible && !isCompletedOrPurged ? `
                    <button class="btn btn-sm btn-secondary open-f4-editor-btn" data-job-id="${j.id}" title="Open A4 ID Card Editor">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:13px;height:13px;margin-right:4px;">
                        <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                      A4 ID Card Editor
                    </button>
                  ` : ''}

                  ${j.status === 'failed' ? `
                    <button class="btn btn-sm btn-primary retry-job-btn" data-job-id="${j.id}" title="Reset and re-queue failed job">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:13px;height:13px;margin-right:4px;">
                        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      Retry Job
                    </button>
                  ` : ''}

                  ${j.status === 'duplex_flip' ? `
                    <button class="btn btn-sm btn-warning confirm-flip-btn" data-job-id="${j.id}" title="Confirm paper flip and resume printing side 2">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" style="width:13px;height:13px;margin-right:4px;">
                        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      Paper Flipped: Print Side 2
                    </button>
                  ` : ''}

                  ${['pending', 'queued'].includes(j.status) ? `
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

    document.getElementById('refreshJobsBtn')?.addEventListener('click', () => loadData(false));
    document.getElementById('jobsQueueTestBtn')?.addEventListener('click', handleQuickTestPrint);

    // Large job warning helper
    const confirmLargeJob = (job) => {
      const totalSheets = (Number(job.pages) || 1) * (Number(job.copies) || 1);
      if (totalSheets >= 30 || Number(job.total_price) >= 100) {
        return confirm(
          `⚠️ Large Print Order Confirmation:\n\n` +
          `Order: ${job.order_number || job.job_number}\n` +
          `Total Output: ${totalSheets} sheets (${job.pages} pages × ${job.copies} copies)\n` +
          `Total Cost: ₹${Number(job.total_price).toFixed(2)}\n\n` +
          `Please ensure the counter printer paper tray is stocked with paper and toner/ink is sufficient before spooling.\n\n` +
          `Proceed to print?`
        );
      }
      return true;
    };

    // Job Card Action Listeners
    content.querySelectorAll('.view-job-details-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const jId = btn.getAttribute('data-job-id');
        const job = allJobs.find(j => j.id === jId);
        if (job) openOrderDetailsModal(job);
      });
    });

    content.querySelectorAll('.preview-job-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const jId = btn.getAttribute('data-job-id');
        const job = allJobs.find(j => j.id === jId);
        if (job) openAdminDocumentPreview(job);
      });
    });

    content.querySelectorAll('.open-f4-editor-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const jId = btn.getAttribute('data-job-id');
        const job = allJobs.find(j => j.id === jId);
        if (job) openCafeAdminF4Editor(job);
      });
    });

    content.querySelectorAll('.send-to-print-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const jId = btn.getAttribute('data-job-id');
        const job = allJobs.find(j => j.id === jId);
        if (job && !confirmLargeJob(job)) return;

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

    content.querySelectorAll('.retry-job-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const jId = btn.getAttribute('data-job-id');
        const job = allJobs.find(j => j.id === jId);
        if (job && !confirmLargeJob(job)) return;

        btn.disabled = true;
        const res = await manageCafeJob(cafeId, jId, 'retry');
        if (!res.success) {
          showNotification(res.error || 'Failed to retry job.', 'error');
          btn.disabled = false;
        } else {
          showNotification('Job reset to pending for retry.', 'success');
          await loadData();
        }
      });
    });

    content.querySelectorAll('.confirm-flip-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const jId = btn.getAttribute('data-job-id');
        btn.disabled = true;
        const res = await manageCafeJob(cafeId, jId, 'confirm_duplex_flip');
        if (!res.success) {
          showNotification(res.error || 'Failed to confirm paper flip.', 'error');
          btn.disabled = false;
        } else {
          showNotification('Paper flip confirmed! Resuming Side 2 printing...', 'success');
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
  // F4 & A4 DOCUMENT & ID CARD LAYOUT EDITOR (STAFF/ADMIN)
  // ----------------------------------------------------
  function isIdCardEligibleJob(job) {
    if (!job) return false;

    // 1. Explicit doc_type check:
    // If explicitly marked as 'normal' document, never show ID card editor
    if (job.doc_type === 'normal') {
      return false;
    }
    // If explicitly marked as an ID card type
    if (job.doc_type === 'aadhaar' || job.doc_type === 'other_id' || job.doc_type === 'id_card') {
      return true;
    }

    // 2. Check files_metadata: if customer uploaded with dedicated side 'front' or 'back'
    if (Array.isArray(job.files_metadata) && job.files_metadata.length > 0) {
      const hasIdSlot = job.files_metadata.some(f => f.side === 'front' || f.side === 'back');
      if (hasIdSlot) return true;

      // If files metadata explicitly marked doc_type === 'normal'
      const isExplicitNormal = job.files_metadata.some(f => f.doc_type === 'normal');
      if (isExplicitNormal) return false;
    }

    // 3. Fallback for legacy orders where doc_type was not captured:
    // Strictly require explicit ID card identity keywords (never generic 'document' or generic image extension)
    if (!job.doc_type) {
      const explicitIdPattern = /(?:^|[^a-zA-Z0-9])(aadhaar|aadhar|voter[_\s-]?id|pan[_\s-]?card|identity[_\s-]?card|id[_\s-]?card|driving[_\s-]?licen[cs]e)(?:$|[^a-zA-Z0-9])/i;
      if (explicitIdPattern.test(job.file_name || '')) return true;

      if (Array.isArray(job.files_metadata)) {
        for (const f of job.files_metadata) {
          if (explicitIdPattern.test(f.name || '')) return true;
        }
      }
    }

    return false;
  }

  async function openCafeAdminF4Editor(job) {
    if (job.status === 'completed' || job.status === 'cancelled' || job.file_url === '[PURGED]') {
      showNotification('This document has been purged after print completion.', 'info');
      return;
    }

    showNotification('Preparing A4 ID Card Editor...', 'info');

    // 1. Gather all printable image sources
    const rawFiles = [];
    if (Array.isArray(job.files_metadata) && job.files_metadata.length > 0) {
      job.files_metadata.forEach((f, idx) => {
        const isImg = (f.type && f.type.startsWith('image/')) || /\.(jpe?g|png|webp|bmp)$/i.test(f.name || '');
        if (isImg && f.storage_path) {
          rawFiles.push({ name: f.name || `Image_${idx + 1}`, storagePath: f.storage_path });
        }
      });
    }

    // If no files from metadata, check primary file_url
    if (rawFiles.length === 0 && job.file_url && !job.file_url.startsWith('spool://') && job.file_url !== '[PURGED]') {
      rawFiles.push({ name: job.file_name || 'Document_Image.jpg', storagePath: job.file_url });
    }

    if (rawFiles.length === 0) {
      showNotification('No image files available for layout editing in this order.', 'warning');
      return;
    }

    // 2. Fetch signed URLs for each image
    const loadedImages = [];
    for (const rf of rawFiles) {
      const sRes = await fetchJobSignedPreviewUrl(rf.storagePath);
      if (sRes.success && sRes.signedUrl) {
        loadedImages.push({
          name: rf.name,
          url: sRes.signedUrl
        });
      }
    }

    if (loadedImages.length === 0) {
      showNotification('Could not load document images for editing.', 'error');
      return;
    }

    // 3. Build Modal DOM
    const modalId = 'cafeAdminF4EditorModal';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-modal-backdrop';
    modal.style.display = 'flex';

    // State
    let currentPaper = 'f4'; // default to F4
    let currentOrientation = 'portrait';
    let elements = [];
    let selectedElementId = null;
    let croppingElementId = null;
    let currentZoom = 1.0;
    let isPreviewMode = false;
    let undoStack = [];
    let redoStack = [];

    const PAPER_DIMENSIONS = {
      a4: {
        portrait: { width: 420, height: 594, dpiW: 2480, dpiH: 3508, label: 'A4: 210 × 297 mm' },
        landscape: { width: 594, height: 420, dpiW: 3508, dpiH: 2480, label: 'A4: 297 × 210 mm' }
      },
      f4: {
        portrait: { width: 420, height: 645, dpiW: 2540, dpiH: 3898, label: 'F4 Standard: 215 × 330 mm' },
        landscape: { width: 645, height: 420, dpiW: 3898, dpiH: 2540, label: 'F4 Standard: 330 × 215 mm' }
      }
    };

    function saveState() {
      undoStack.push(JSON.stringify(elements));
      if (undoStack.length > 30) undoStack.shift();
      redoStack = [];
    }

    modal.innerHTML = `
      <div class="admin-modal-card a4-editor-modal-card">
        <!-- Editor Header -->
        <div class="a4-editor-header">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(37,99,235,0.15);border:1px solid rgba(59,130,246,0.3);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
              🖨
            </div>
            <div>
              <div style="display:flex;gap:8px;align-items:center;">
                <span class="pill-tag font-mono">PRINT WORKSPACE</span>
                <span class="badge font-mono text-xs" style="background:#2563eb;color:#fff;padding:2px 8px;border-radius:12px;font-weight:700;">A4 ID CARD EDITOR</span>
              </div>
              <h2 class="editorial-h2" style="font-size:1.15rem;margin:2px 0 0 0;">
                A4 ID Card Editor &bull; Order #${escapeHtml(job.order_number || job.job_number)} &bull; ${escapeHtml(job.customer_name || 'Customer')}
              </h2>
            </div>
          </div>

          <div style="display:flex;gap:10px;align-items:center;">
            <button class="btn btn-sm btn-ghost close-f4-editor-btn" aria-label="Close Editor" style="font-size:1.4rem;line-height:1;padding:4px 8px;">&times;</button>
          </div>
        </div>

        <!-- Top Controls & Tools Bar -->
        <div class="a4-editor-tools-bar">
          <!-- Paper Size Toggle -->
          <div style="display:flex;gap:5px;align-items:center;">
            <span class="a4-control-label">Paper:</span>
            <button type="button" class="btn btn-xs ${currentPaper === 'f4' ? 'btn-primary' : 'btn-secondary'}" id="paperF4Btn" title="F4 Standard (Foolscap 215×330mm)">F4 Standard</button>
            <button type="button" class="btn btn-xs ${currentPaper === 'a4' ? 'btn-primary' : 'btn-secondary'}" id="paperA4Btn" title="A4 Standard (210×297mm)">A4 Standard</button>
          </div>

          <div style="height:18px;width:1px;background:var(--border-subtle);margin:0 2px;"></div>

          <!-- Orientation Toggle -->
          <div style="display:flex;gap:5px;align-items:center;">
            <span class="a4-control-label">Orientation:</span>
            <button type="button" class="btn btn-xs ${currentOrientation === 'portrait' ? 'btn-primary' : 'btn-secondary'}" id="f4OrientPortraitBtn">Portrait</button>
            <button type="button" class="btn btn-xs ${currentOrientation === 'landscape' ? 'btn-primary' : 'btn-secondary'}" id="f4OrientLandscapeBtn">Landscape</button>
          </div>

          <div style="height:18px;width:1px;background:var(--border-subtle);margin:0 2px;"></div>

          <!-- Quick Presets -->
          <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
            <span class="a4-control-label">Layout:</span>
            <button type="button" class="btn btn-xs btn-secondary" id="f4PresetSideBySideBtn" title="Arrange front & back side-by-side (Standard Indian Aadhaar/PAN layout)">
              🪪 Side-by-Side (Aadhaar)
            </button>
            <button type="button" class="btn btn-xs btn-secondary" id="f4PresetStackedBtn" title="Arrange front and back vertically centered">
              📄 Stacked
            </button>
            <button type="button" class="btn btn-xs btn-secondary" id="f4PresetFitBtn" title="Fit selected element to printable area">
              🔲 Fit to Sheet
            </button>
          </div>

          <div style="height:18px;width:1px;background:var(--border-subtle);margin:0 2px;"></div>

          <!-- Workspace Zoom Controls -->
          <div style="display:flex;gap:4px;align-items:center;">
            <span class="a4-control-label">Zoom:</span>
            <button type="button" class="btn btn-xs btn-secondary" id="f4ZoomOutBtn" title="Zoom out" style="padding:2px 8px;font-weight:700;">−</button>
            <span id="f4ZoomLevel" class="font-mono text-xs" style="min-width:38px;text-align:center;font-weight:600;color:var(--text-primary);">100%</span>
            <button type="button" class="btn btn-xs btn-secondary" id="f4ZoomInBtn" title="Zoom in" style="padding:2px 8px;font-weight:700;">+</button>
            <button type="button" class="btn btn-xs btn-secondary" id="f4ZoomFitBtn" title="Fit entire page in workspace view">⛶ Fit Page</button>
          </div>

          <div style="height:18px;width:1px;background:var(--border-subtle);margin:0 2px;"></div>

          <!-- Print Preview Mode Toggle -->
          <button type="button" class="btn btn-xs btn-secondary" id="f4PrintPreviewBtn" title="Toggle Clean Print Preview Mode without editor guides">
            👁️ Print Preview
          </button>

          <!-- History & Reset -->
          <div style="display:flex;gap:4px;align-items:center;margin-left:auto;">
            <button type="button" class="btn btn-xs btn-ghost text-muted" id="f4UndoBtn" title="Undo (Ctrl+Z)">↩ Undo</button>
            <button type="button" class="btn btn-xs btn-ghost text-muted" id="f4RedoBtn" title="Redo (Ctrl+Y)">↪ Redo</button>
            <button type="button" class="btn btn-xs btn-ghost text-muted" id="f4PresetResetBtn" title="Reset all elements to default">↺ Reset</button>
          </div>
        </div>

        <!-- Main Workspace (A4 Dominant Hero + Compact Sidebar) -->
        <div class="a4-editor-workspace">
          <!-- Canvas Viewport -->
          <div class="a4-canvas-viewport" id="f4CanvasViewport">
            <!-- Sheet Zoom Wrapper -->
            <div class="a4-sheet-zoom-wrapper" id="f4SheetZoomWrapper">
              <div class="a4-paper-sheet ${currentPaper}-${currentOrientation}" id="f4PaperSheet">
                <div class="a4-margin-guide"></div>
                <!-- Interactive Placed Elements Rendered Here -->
              </div>
            </div>

            <!-- Viewport Bottom Status Bar -->
            <div class="a4-sheet-meta font-mono">
              <span id="f4DimensionsLabel" style="font-weight:600;color:#e4e4e7;">F4: 215 × 330 mm (PORTRAIT)</span>
              <span> &bull; 100% Print-Accurate Ratio</span>
              <span> &bull; Click card to select &bull; Drag to position &bull; Drag corners to resize</span>
            </div>
          </div>

          <!-- Compact Controls Sidebar -->
          <div class="a4-editor-sidebar">
            <div class="a4-sidebar-section">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h4 class="a4-sidebar-title" style="margin:0;">ID Photos (<span id="f4ImagesCount">${loadedImages.length}</span>)</h4>
                <span class="text-xs text-muted">A4 Layers</span>
              </div>
              <div class="a4-elements-list" id="f4ElementsList"></div>
              <div style="margin-top:8px;">
                <label class="btn btn-xs btn-secondary w-full" style="text-align:center;cursor:pointer;display:block;">
                  + Add Extra Photo / File
                  <input type="file" id="f4AddExtraFileInput" accept="image/jpeg,image/png,image/webp" style="display:none;" />
                </label>
              </div>
            </div>

            <!-- Selected Element Adjustments -->
            <div class="a4-sidebar-section" id="f4SelectedControls" style="display:none;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <h4 class="a4-sidebar-title" style="margin:0;">Card Adjustments</h4>
                <span id="f4SelectedCardBadge" class="badge font-mono text-xs" style="background:#2563eb;color:#fff;">#1</span>
              </div>

              <!-- In-place Crop action from sidebar -->
              <div class="a4-control-group">
                <button type="button" class="btn btn-xs btn-secondary w-full" id="f4SidebarCropBtn" style="font-weight:600;background:rgba(37,99,235,0.1);border-color:rgba(37,99,235,0.4);color:#60a5fa;">
                  ✂️ Crop Selected Card
                </button>
              </div>

              <div class="a4-control-group">
                <label class="a4-control-label">Scale: <span id="f4ScaleLabel" class="font-mono text-accent">100%</span></label>
                <div style="display:flex;align-items:center;gap:6px;">
                  <button type="button" class="btn btn-xs btn-ghost" id="f4ScaleMinus">-</button>
                  <input type="range" id="f4ScaleSlider" min="30" max="250" value="100" class="a4-slider" />
                  <button type="button" class="btn btn-xs btn-ghost" id="f4ScalePlus">+</button>
                </div>
              </div>

              <div class="a4-control-group">
                <label class="a4-control-label">Rotation</label>
                <div style="display:flex;gap:6px;">
                  <button type="button" class="btn btn-xs btn-secondary flex-1" id="f4RotateCCW">↺ 90° CCW</button>
                  <button type="button" class="btn btn-xs btn-secondary flex-1" id="f4RotateCW">↻ 90° CW</button>
                </div>
              </div>

              <div class="a4-control-group">
                <label class="a4-control-label">Align on Sheet</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                  <button type="button" class="btn btn-xs btn-secondary" id="f4AlignTop">Align Top</button>
                  <button type="button" class="btn btn-xs btn-secondary" id="f4AlignBottom">Align Bottom</button>
                  <button type="button" class="btn btn-xs btn-secondary" id="f4AlignCenter">Center Page</button>
                  <button type="button" class="btn btn-xs btn-secondary" id="f4AlignReset">Reset Pos</button>
                </div>
              </div>

              <div class="a4-control-group" style="padding-top:6px;border-top:1px dashed var(--border-subtle);margin-top:6px;">
                <button type="button" class="btn btn-xs btn-danger w-full" id="f4RemoveElementBtn">🗑 Remove from Page</button>
              </div>
            </div>

            <!-- Print Guarantee Note -->
            <div class="a4-sidebar-section text-xs text-muted" style="margin-top:auto;background:rgba(255,255,255,0.02);border:1px solid var(--border-subtle);border-radius:6px;padding:8px;">
              <p style="margin:0 0 4px 0;font-weight:600;color:var(--text-primary);">🖨 Print Fidelity Guarantee</p>
              <p style="margin:0;font-size:0.75rem;">Workspace WYSIWYG renders at <strong>300 DPI high-definition</strong>. Physical print on counter printer matches this exact sheet arrangement.</p>
            </div>
          </div>
        </div>

        <!-- Editor Footer -->
        <div class="a4-editor-footer" style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--border-subtle);">
          <div style="display:flex;gap:12px;align-items:center;">
            <button type="button" class="btn btn-secondary close-f4-editor-btn">Cancel</button>
            <span class="text-xs text-muted" id="f4FooterInfo">F4 215×330mm &bull; 300 DPI Export (2540×3898 px)</span>
          </div>
          <button type="button" class="btn btn-primary" id="f4SaveAndApplyBtn" style="background:#2563eb;border-color:#2563eb;font-weight:700;padding:8px 20px;">
            ✔ Finalize &amp; Save Print Layout
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Initialize elements from loadedImages
    loadedImages.forEach((imgItem, idx) => {
      // Calculate realistic Aadhaar card default size (approx 170px × 107px on 420px sheet)
      elements.push({
        id: 'elem_' + Math.random().toString(36).substring(2, 9),
        name: imgItem.name || (idx === 0 ? 'Front ID' : 'Back ID'),
        url: imgItem.url,
        originalUrl: imgItem.url,
        x: 35 + (idx * 190),
        y: 60,
        width: 170,
        height: 108,
        rotation: 0,
        scale: 100,
        aspectRatio: 1.585
      });
    });

    if (elements.length > 0) {
      selectedElementId = elements[0].id;
    }

    // Auto-detect natural image ratios
    elements.forEach(elem => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight) {
          elem.aspectRatio = img.naturalWidth / img.naturalHeight;
          elem.height = Math.round(elem.width / elem.aspectRatio);
          renderCanvasElements();
        }
      };
      img.src = elem.url;
    });

    // Helper: close
    function closeEditor() {
      modal.remove();
    }
    modal.querySelectorAll('.close-f4-editor-btn').forEach(btn => btn.addEventListener('click', closeEditor));

    // Workspace Zoom Implementation
    function applyWorkspaceZoom(zoom) {
      currentZoom = Math.max(0.35, Math.min(2.5, Math.round(zoom * 100) / 100));
      const zoomWrapper = document.getElementById('f4SheetZoomWrapper');
      const zoomLabel = document.getElementById('f4ZoomLevel');
      if (zoomWrapper) {
        zoomWrapper.style.transform = `scale(${currentZoom})`;
      }
      if (zoomLabel) {
        zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
      }
    }

    function fitToPage() {
      const vp = document.getElementById('f4CanvasViewport');
      if (!vp) return;
      const curConfig = PAPER_DIMENSIONS[currentPaper][currentOrientation];
      const availW = vp.clientWidth - 48;
      const availH = vp.clientHeight - 48;
      if (availW <= 0 || availH <= 0) return;

      const scaleX = availW / curConfig.width;
      const scaleY = availH / curConfig.height;
      const fitScale = Math.min(scaleX, scaleY);
      applyWorkspaceZoom(Math.min(1.4, Math.max(0.4, fitScale)));
    }

    document.getElementById('f4ZoomInBtn')?.addEventListener('click', () => {
      applyWorkspaceZoom(currentZoom + 0.1);
    });

    document.getElementById('f4ZoomOutBtn')?.addEventListener('click', () => {
      applyWorkspaceZoom(currentZoom - 0.1);
    });

    document.getElementById('f4ZoomFitBtn')?.addEventListener('click', () => {
      fitToPage();
    });

    // Update dimensions / class
    function updateSheetSize() {
      const sheet = document.getElementById('f4PaperSheet');
      const label = document.getElementById('f4DimensionsLabel');
      const footerInfo = document.getElementById('f4FooterInfo');
      const curConfig = PAPER_DIMENSIONS[currentPaper][currentOrientation];

      if (sheet) {
        sheet.className = `a4-paper-sheet ${currentPaper}-${currentOrientation}`;
      }
      if (label) {
        label.textContent = `${curConfig.label} (${currentOrientation.toUpperCase()})`;
      }
      if (footerInfo) {
        footerInfo.innerHTML = `${currentPaper === 'f4' ? 'F4 Standard' : 'A4 Standard'} (${currentOrientation}) &bull; 300 DPI Export (${curConfig.dpiW}×${curConfig.dpiH} px)`;
      }

      // Update toggle buttons
      const f4Btn = document.getElementById('paperF4Btn');
      const a4Btn = document.getElementById('paperA4Btn');
      if (f4Btn && a4Btn) {
        f4Btn.className = `btn btn-xs ${currentPaper === 'f4' ? 'btn-primary' : 'btn-secondary'}`;
        a4Btn.className = `btn btn-xs ${currentPaper === 'a4' ? 'btn-primary' : 'btn-secondary'}`;
      }

      const portBtn = document.getElementById('f4OrientPortraitBtn');
      const landBtn = document.getElementById('f4OrientLandscapeBtn');
      if (portBtn && landBtn) {
        portBtn.className = `btn btn-xs ${currentOrientation === 'portrait' ? 'btn-primary' : 'btn-secondary'}`;
        landBtn.className = `btn btn-xs ${currentOrientation === 'landscape' ? 'btn-primary' : 'btn-secondary'}`;
      }

      renderCanvasElements();
      setTimeout(fitToPage, 50);
    }

    // Paper buttons
    document.getElementById('paperF4Btn')?.addEventListener('click', () => {
      saveState();
      currentPaper = 'f4';
      updateSheetSize();
    });

    document.getElementById('paperA4Btn')?.addEventListener('click', () => {
      saveState();
      currentPaper = 'a4';
      updateSheetSize();
    });

    // Orientation buttons
    document.getElementById('f4OrientPortraitBtn')?.addEventListener('click', () => {
      saveState();
      currentOrientation = 'portrait';
      updateSheetSize();
    });

    document.getElementById('f4OrientLandscapeBtn')?.addEventListener('click', () => {
      saveState();
      currentOrientation = 'landscape';
      updateSheetSize();
    });

    // Presets: Side-by-Side (Aadhaar / PAN - 85.6mm standard card width)
    document.getElementById('f4PresetSideBySideBtn')?.addEventListener('click', () => {
      saveState();
      currentOrientation = 'portrait';
      updateSheetSize();

      // On 420px sheet, Aadhaar cards (approx 170px width each) with 20px gap
      const cardW = 170;
      const cardH = Math.round(cardW / 1.585); // 107px

      if (elements.length >= 2) {
        elements[0].x = 28;
        elements[0].y = 70;
        elements[0].width = cardW;
        elements[0].height = cardH;
        elements[0].rotation = 0;
        elements[0].scale = 100;

        elements[1].x = 222;
        elements[1].y = 70;
        elements[1].width = cardW;
        elements[1].height = cardH;
        elements[1].rotation = 0;
        elements[1].scale = 100;
      } else if (elements.length === 1) {
        elements[0].x = Math.round((420 - cardW) / 2);
        elements[0].y = 70;
        elements[0].width = cardW;
        elements[0].height = cardH;
        elements[0].rotation = 0;
        elements[0].scale = 100;
      }

      renderCanvasElements();
      renderSidebarList();
      updateSelectedUI();
    });

    // Presets: Stacked Top/Bottom
    document.getElementById('f4PresetStackedBtn')?.addEventListener('click', () => {
      saveState();
      currentOrientation = 'portrait';
      updateSheetSize();
      const sheetW = PAPER_DIMENSIONS[currentPaper][currentOrientation].width;
      const cardW = 230;

      elements.forEach((elem, idx) => {
        elem.width = cardW;
        elem.height = Math.round(cardW / (elem.aspectRatio || 1.585));
        elem.x = Math.round((sheetW - cardW) / 2);
        elem.y = 50 + (idx * (elem.height + 25));
        elem.rotation = 0;
        elem.scale = 100;
      });

      renderCanvasElements();
      renderSidebarList();
      updateSelectedUI();
    });

    // Presets: Fit to Sheet
    document.getElementById('f4PresetFitBtn')?.addEventListener('click', () => {
      const selected = elements.find(e => e.id === selectedElementId) || elements[0];
      if (!selected) return;
      saveState();
      const sheet = PAPER_DIMENSIONS[currentPaper][currentOrientation];
      const margin = 20;
      const availW = sheet.width - (margin * 2);
      const availH = sheet.height - (margin * 2);
      const ratio = selected.aspectRatio || 1.414;

      if (availW / availH > ratio) {
        selected.height = availH;
        selected.width = Math.round(availH * ratio);
      } else {
        selected.width = availW;
        selected.height = Math.round(availW / ratio);
      }
      selected.x = Math.round((sheet.width - selected.width) / 2);
      selected.y = Math.round((sheet.height - selected.height) / 2);
      selected.rotation = 0;
      selected.scale = 100;
      renderCanvasElements();
      updateSelectedUI();
    });

    // Presets: Reset
    document.getElementById('f4PresetResetBtn')?.addEventListener('click', () => {
      saveState();
      elements.forEach((elem, idx) => {
        elem.x = 35 + (idx * 190);
        elem.y = 60;
        elem.width = 170;
        elem.height = Math.round(170 / (elem.aspectRatio || 1.585));
        elem.rotation = 0;
        elem.scale = 100;
      });
      renderCanvasElements();
      updateSelectedUI();
    });

    // Undo / Redo
    document.getElementById('f4UndoBtn')?.addEventListener('click', () => {
      if (undoStack.length === 0) return;
      redoStack.push(JSON.stringify(elements));
      const prev = undoStack.pop();
      elements = JSON.parse(prev);
      renderCanvasElements();
      renderSidebarList();
      updateSelectedUI();
    });

    document.getElementById('f4RedoBtn')?.addEventListener('click', () => {
      if (redoStack.length === 0) return;
      undoStack.push(JSON.stringify(elements));
      const next = redoStack.pop();
      elements = JSON.parse(next);
      renderCanvasElements();
      renderSidebarList();
      updateSelectedUI();
    });

    // Print Preview Toggle
    document.getElementById('f4PrintPreviewBtn')?.addEventListener('click', () => {
      isPreviewMode = !isPreviewMode;
      const vp = document.getElementById('f4CanvasViewport');
      const prevBtn = document.getElementById('f4PrintPreviewBtn');
      if (vp) {
        if (isPreviewMode) {
          vp.classList.add('print-preview-mode');
          if (prevBtn) {
            prevBtn.textContent = '✏️ Exit Preview';
            prevBtn.classList.remove('btn-secondary');
            prevBtn.classList.add('btn-primary');
          }
        } else {
          vp.classList.remove('print-preview-mode');
          if (prevBtn) {
            prevBtn.textContent = '👁️ Print Preview';
            prevBtn.classList.remove('btn-primary');
            prevBtn.classList.add('btn-secondary');
          }
        }
      }
    });

    // Render Canvas Elements
    function renderCanvasElements() {
      const sheet = document.getElementById('f4PaperSheet');
      if (!sheet) return;

      // Keep guide
      sheet.innerHTML = '<div class="a4-margin-guide"></div>';

      elements.forEach((elem, idx) => {
        const item = document.createElement('div');
        const isSelected = elem.id === selectedElementId;
        const isCropping = elem.id === croppingElementId;

        item.className = `a4-canvas-element ${isSelected ? 'selected' : ''} ${isCropping ? 'cropping-active' : ''}`;
        item.setAttribute('data-id', elem.id);

        const scaledW = Math.round(elem.width * (elem.scale / 100));
        const scaledH = Math.round(elem.height * (elem.scale / 100));

        item.style.left = `${elem.x}px`;
        item.style.top = `${elem.y}px`;
        item.style.width = `${scaledW}px`;
        item.style.height = `${scaledH}px`;
        item.style.transform = `rotate(${elem.rotation}deg)`;

        // Label name
        const sideLabel = idx === 0 ? 'Front' : (idx === 1 ? 'Back' : `Card ${idx + 1}`);

        item.innerHTML = `
          <img src="${escapeHtml(elem.url)}" alt="${escapeHtml(elem.name)}" draggable="false" style="width:100%;height:100%;object-fit:fill;" />
          <div class="a4-element-drag-handle" title="Drag to reposition">✥</div>
          <div class="a4-element-badge">#${idx + 1} ${sideLabel}</div>
          <div class="a4-element-label font-mono">${escapeHtml(elem.name)}</div>
          
          <!-- Direct Corner Resize Handles -->
          <div class="elem-resize-handle top-left" data-corner="tl" title="Resize"></div>
          <div class="elem-resize-handle top-right" data-corner="tr" title="Resize"></div>
          <div class="elem-resize-handle bottom-right" data-corner="br" title="Resize"></div>
          <div class="elem-resize-handle bottom-left" data-corner="bl" title="Resize"></div>

          <!-- Floating Quick-Bar for Selected Card -->
          <div class="elem-quick-bar">
            <button type="button" class="elem-quick-btn quick-crop-btn" title="Crop this card">✂️ Crop</button>
            <button type="button" class="elem-quick-btn quick-rot-ccw" title="Rotate CCW 90°">↺</button>
            <button type="button" class="elem-quick-btn quick-rot-cw" title="Rotate CW 90°">↻</button>
            <button type="button" class="elem-quick-btn quick-del-btn" style="color:#ef4444;" title="Remove card">🗑</button>
          </div>
        `;

        // Direct selection & Drag
        item.addEventListener('pointerdown', (e) => {
          if (croppingElementId) return; // Disallow moving while in crop mode
          if (e.target.classList.contains('elem-resize-handle') || e.target.closest('.elem-quick-bar')) {
            return; // handled separately
          }

          if (selectedElementId !== elem.id) {
            selectedElementId = elem.id;
            renderCanvasElements();
            renderSidebarList();
            updateSelectedUI();
          }

          initDrag(e, elem, item);
        });

        // Corner resize handles
        item.querySelectorAll('.elem-resize-handle').forEach(handle => {
          handle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            const corner = handle.getAttribute('data-corner');
            initCornerResize(e, elem, item, corner);
          });
        });

        // Quick-bar actions
        item.querySelector('.quick-crop-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openIdCardCroppingModal(elem);
        });

        item.querySelector('.quick-rot-ccw')?.addEventListener('click', (e) => {
          e.stopPropagation();
          saveState();
          elem.rotation = (elem.rotation - 90) % 360;
          renderCanvasElements();
        });

        item.querySelector('.quick-rot-cw')?.addEventListener('click', (e) => {
          e.stopPropagation();
          saveState();
          elem.rotation = (elem.rotation + 90) % 360;
          renderCanvasElements();
        });

        item.querySelector('.quick-del-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          saveState();
          elements = elements.filter(el => el.id !== elem.id);
          selectedElementId = elements.length > 0 ? elements[0].id : null;
          renderCanvasElements();
          renderSidebarList();
          updateSelectedUI();
        });

        sheet.appendChild(item);
      });
    }

    // Drag move on sheet
    function initDrag(e, elem, domItem) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const origX = elem.x;
      const origY = elem.y;
      const sheet = PAPER_DIMENSIONS[currentPaper][currentOrientation];
      let hasMoved = false;

      function onMove(moveEvt) {
        hasMoved = true;
        // Adjust delta for current workspace zoom
        const dx = (moveEvt.clientX - startX) / currentZoom;
        const dy = (moveEvt.clientY - startY) / currentZoom;
        const scaledW = Math.round(elem.width * (elem.scale / 100));
        const scaledH = Math.round(elem.height * (elem.scale / 100));

        elem.x = Math.max(-scaledW + 30, Math.min(origX + dx, sheet.width - 30));
        elem.y = Math.max(0, Math.min(origY + dy, sheet.height - 30));
        domItem.style.left = `${elem.x}px`;
        domItem.style.top = `${elem.y}px`;
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (hasMoved) {
          saveState();
        }
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }

    // Direct Corner Resize on Sheet
    function initCornerResize(e, elem, domItem, corner) {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const origW = elem.width * (elem.scale / 100);
      const origH = elem.height * (elem.scale / 100);
      const origX = elem.x;
      const origY = elem.y;
      const ratio = elem.aspectRatio || (origW / origH);
      let hasChanged = false;

      function onMove(moveEvt) {
        hasChanged = true;
        const dx = (moveEvt.clientX - startX) / currentZoom;
        const dy = (moveEvt.clientY - startY) / currentZoom;

        let newW = origW;
        let newH = origH;
        let newX = origX;
        let newY = origY;

        if (corner === 'br') {
          newW = Math.max(60, origW + dx);
          newH = Math.round(newW / ratio);
        } else if (corner === 'bl') {
          newW = Math.max(60, origW - dx);
          newH = Math.round(newW / ratio);
          newX = origX + (origW - newW);
        } else if (corner === 'tr') {
          newW = Math.max(60, origW + dx);
          newH = Math.round(newW / ratio);
          newY = origY + (origH - newH);
        } else if (corner === 'tl') {
          newW = Math.max(60, origW - dx);
          newH = Math.round(newW / ratio);
          newX = origX + (origW - newW);
          newY = origY + (origH - newH);
        }

        elem.width = Math.round(newW / (elem.scale / 100));
        elem.height = Math.round(newH / (elem.scale / 100));
        elem.x = Math.round(newX);
        elem.y = Math.round(newY);

        domItem.style.width = `${newW}px`;
        domItem.style.height = `${newH}px`;
        domItem.style.left = `${elem.x}px`;
        domItem.style.top = `${elem.y}px`;
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (hasChanged) {
          saveState();
          renderCanvasElements();
          updateSelectedUI();
        }
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }

    // Centered Clean ID Card Cropping Modal Dialog
    function openIdCardCroppingModal(elem) {
      if (!elem) return;

      const cardIdx = elements.findIndex(el => el.id === elem.id);
      const cardSideLabel = cardIdx === 0 ? 'Front Side' : (cardIdx === 1 ? 'Back Side' : `Card #${cardIdx + 1}`);

      const cropModalId = 'idCardCroppingModal';
      const existing = document.getElementById(cropModalId);
      if (existing) existing.remove();

      const cropModal = document.createElement('div');
      cropModal.id = cropModalId;
      cropModal.className = 'admin-modal-backdrop id-card-crop-modal-backdrop';
      cropModal.style.cssText = 'display:flex;position:fixed;top:0;left:0;right:0;bottom:0;z-index:10005;';

      cropModal.innerHTML = `
        <div class="id-card-crop-modal-card">
          <!-- Modal Header -->
          <div class="a4-editor-header" style="padding:12px 18px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:32px;height:32px;border-radius:6px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">
                ✂️
              </div>
              <div>
                <h3 class="font-bold text-sm" style="margin:0;line-height:1.2;">Crop ID Card &bull; ${escapeHtml(cardSideLabel)}</h3>
                <span class="text-xs text-muted font-mono truncate" style="max-width:280px;display:inline-block;">${escapeHtml(elem.name)}</span>
              </div>
            </div>
            <button type="button" class="btn btn-sm btn-ghost close-crop-modal-btn" aria-label="Close" style="font-size:1.3rem;line-height:1;padding:2px 8px;">&times;</button>
          </div>

          <!-- Toolbar -->
          <div class="crop-modal-toolbar">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="text-xs text-muted" style="font-weight:600;">Ratio:</span>
              <button type="button" class="btn btn-xs btn-primary" id="cropRatioFreeBtn">Free Aspect</button>
              <button type="button" class="btn btn-xs btn-secondary" id="cropRatioIdBtn" title="Standard ID Card (85.6 × 54 mm &bull; 1.585:1)">🪪 Standard ID (1.58:1)</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" class="btn btn-xs btn-secondary" id="cropResetFullBtn" title="Reset crop to full uncropped image">↺ Reset to Full</button>
            </div>
          </div>

          <!-- Body: Stage + Live Preview -->
          <div class="crop-modal-body">
            <div class="crop-modal-stage" id="cropModalStage">
              <div class="crop-stage-container" id="cropStageContainer">
                <img id="cropModalTargetImg" src="${escapeHtml(elem.originalUrl || elem.url)}" alt="Target Crop" crossorigin="anonymous" draggable="false" />
                <div class="modal-crop-box" id="modalCropBox">
                  <div class="crop-grid-line h1"></div>
                  <div class="crop-grid-line h2"></div>
                  <div class="crop-grid-line v1"></div>
                  <div class="crop-grid-line v2"></div>
                  <div class="crop-handle nw" data-h="nw"></div>
                  <div class="crop-handle n" data-h="n"></div>
                  <div class="crop-handle ne" data-h="ne"></div>
                  <div class="crop-handle e" data-h="e"></div>
                  <div class="crop-handle se" data-h="se"></div>
                  <div class="crop-handle s" data-h="s"></div>
                  <div class="crop-handle sw" data-h="sw"></div>
                  <div class="crop-handle w" data-h="w"></div>
                </div>
              </div>
            </div>

            <!-- Preview Panel -->
            <div class="crop-modal-preview-panel">
              <div class="text-xs font-bold" style="color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">Live Preview</div>
              <div class="crop-preview-wrap">
                <canvas id="cropPreviewCanvas" width="180" height="114"></canvas>
              </div>
              <div class="font-mono text-xs text-muted" id="cropDimensionInfo" style="text-align:center;">---</div>
              <div class="text-xs text-muted text-center" style="background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);border-radius:6px;padding:8px 6px;line-height:1.4;">
                <span style="color:#10b981;font-weight:600;">🔒 Isolated Crop</span><br>
                Only <strong>${escapeHtml(cardSideLabel)}</strong> will be updated. Other card side remains unchanged.
              </div>
            </div>
          </div>

          <!-- Modal Footer Actions -->
          <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-top:1px solid var(--border-subtle);background:var(--bg-canvas);">
            <button type="button" class="btn btn-secondary close-crop-modal-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="cropApplyModalBtn" style="background:#10b981;border-color:#10b981;font-weight:600;">
              ✔ Apply Crop
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(cropModal);

      const targetImg = cropModal.querySelector('#cropModalTargetImg');
      const cropBox = cropModal.querySelector('#modalCropBox');
      const previewCanvas = cropModal.querySelector('#cropPreviewCanvas');
      const previewCtx = previewCanvas.getContext('2d');
      const dimInfo = cropModal.querySelector('#cropDimensionInfo');
      const freeBtn = cropModal.querySelector('#cropRatioFreeBtn');
      const idBtn = cropModal.querySelector('#cropRatioIdBtn');

      let aspectRatioLock = null; // null for free, or number like 1.585
      let cropState = { x: 0, y: 0, w: 100, h: 100 };
      let imgDispW = 100;
      let imgDispH = 100;

      const closeCropModal = () => {
        cropModal.remove();
      };

      cropModal.querySelectorAll('.close-crop-modal-btn').forEach(b => b.addEventListener('click', closeCropModal));

      function updateCropBoxDOM() {
        cropBox.style.left = `${cropState.x}px`;
        cropBox.style.top = `${cropState.y}px`;
        cropBox.style.width = `${cropState.w}px`;
        cropBox.style.height = `${cropState.h}px`;
        updateLivePreview();
      }

      function updateLivePreview() {
        if (!targetImg.naturalWidth || !targetImg.naturalHeight || imgDispW === 0 || imgDispH === 0) return;

        const natW = targetImg.naturalWidth;
        const natH = targetImg.naturalHeight;

        const fracX = Math.max(0, cropState.x / imgDispW);
        const fracY = Math.max(0, cropState.y / imgDispH);
        const fracW = Math.min(1 - fracX, cropState.w / imgDispW);
        const fracH = Math.min(1 - fracY, cropState.h / imgDispH);

        const sx = Math.round(fracX * natW);
        const sy = Math.round(fracY * natH);
        const sw = Math.max(1, Math.round(fracW * natW));
        const sh = Math.max(1, Math.round(fracH * natH));

        if (dimInfo) {
          dimInfo.textContent = `${sw} × ${sh} px`;
        }

        previewCanvas.width = 180;
        previewCanvas.height = 114;
        previewCtx.clearRect(0, 0, 180, 114);

        const pRatio = sw / sh;
        let dw = 180;
        let dh = Math.round(180 / pRatio);
        if (dh > 114) {
          dh = 114;
          dw = Math.round(114 * pRatio);
        }
        const dx = Math.round((180 - dw) / 2);
        const dy = Math.round((114 - dh) / 2);

        try {
          previewCtx.drawImage(targetImg, sx, sy, sw, sh, dx, dy, dw, dh);
        } catch (_) {}
      }

      function applyRatioToState(r) {
        if (!r) return;
        let newH = Math.round(cropState.w / r);
        if (cropState.y + newH > imgDispH) {
          newH = imgDispH - cropState.y;
          cropState.w = Math.round(newH * r);
        }
        cropState.h = Math.max(20, newH);
      }

      function initGeometry() {
        imgDispW = targetImg.clientWidth || 300;
        imgDispH = targetImg.clientHeight || 200;

        cropState = {
          x: Math.round(imgDispW * 0.05),
          y: Math.round(imgDispH * 0.05),
          w: Math.round(imgDispW * 0.9),
          h: Math.round(imgDispH * 0.9)
        };

        if (aspectRatioLock) {
          applyRatioToState(aspectRatioLock);
        }

        updateCropBoxDOM();
      }

      if (targetImg.complete && targetImg.naturalWidth > 0) {
        initGeometry();
      } else {
        targetImg.onload = initGeometry;
      }

      freeBtn.addEventListener('click', () => {
        aspectRatioLock = null;
        freeBtn.className = 'btn btn-xs btn-primary';
        idBtn.className = 'btn btn-xs btn-secondary';
      });

      idBtn.addEventListener('click', () => {
        aspectRatioLock = 1.585;
        idBtn.className = 'btn btn-xs btn-primary';
        freeBtn.className = 'btn btn-xs btn-secondary';
        applyRatioToState(aspectRatioLock);
        updateCropBoxDOM();
      });

      cropModal.querySelector('#cropResetFullBtn')?.addEventListener('click', () => {
        cropState = {
          x: 0,
          y: 0,
          w: imgDispW,
          h: imgDispH
        };
        if (aspectRatioLock) {
          applyRatioToState(aspectRatioLock);
        }
        updateCropBoxDOM();
      });

      cropBox.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('crop-handle')) return;
        e.preventDefault();
        e.stopPropagation();

        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const origX = cropState.x;
        const origY = cropState.y;

        function onMove(mEvt) {
          const dx = mEvt.clientX - startClientX;
          const dy = mEvt.clientY - startClientY;

          cropState.x = Math.max(0, Math.min(imgDispW - cropState.w, origX + dx));
          cropState.y = Math.max(0, Math.min(imgDispH - cropState.h, origY + dy));
          updateCropBoxDOM();
        }

        function onUp() {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        }

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      cropBox.querySelectorAll('.crop-handle').forEach(h => {
        h.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const dir = h.getAttribute('data-h');
          const startClientX = e.clientX;
          const startClientY = e.clientY;
          const orig = { ...cropState };

          function onMove(mEvt) {
            const dx = mEvt.clientX - startClientX;
            const dy = mEvt.clientY - startClientY;

            if (dir.includes('e')) {
              cropState.w = Math.max(30, Math.min(imgDispW - orig.x, orig.w + dx));
            }
            if (dir.includes('s')) {
              cropState.h = Math.max(30, Math.min(imgDispH - orig.y, orig.h + dy));
            }
            if (dir.includes('w')) {
              const maxLeft = orig.x + orig.w - 30;
              const newX = Math.max(0, Math.min(maxLeft, orig.x + dx));
              cropState.w = orig.w + (orig.x - newX);
              cropState.x = newX;
            }
            if (dir.includes('n')) {
              const maxTop = orig.y + orig.h - 30;
              const newY = Math.max(0, Math.min(maxTop, orig.y + dy));
              cropState.h = orig.h + (orig.y - newY);
              cropState.y = newY;
            }

            if (aspectRatioLock) {
              if (dir.includes('e') || dir.includes('w')) {
                cropState.h = Math.max(20, Math.min(imgDispH - cropState.y, Math.round(cropState.w / aspectRatioLock)));
              } else {
                cropState.w = Math.max(20, Math.min(imgDispW - cropState.x, Math.round(cropState.h * aspectRatioLock)));
              }
            }

            updateCropBoxDOM();
          }

          function onUp() {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          }

          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
      });

      cropModal.querySelector('#cropApplyModalBtn')?.addEventListener('click', async () => {
        const applyBtn = cropModal.querySelector('#cropApplyModalBtn');
        applyBtn.textContent = 'Processing Crop...';
        applyBtn.disabled = true;

        try {
          saveState();

          const natW = targetImg.naturalWidth;
          const natH = targetImg.naturalHeight;

          const fracX = Math.max(0, cropState.x / imgDispW);
          const fracY = Math.max(0, cropState.y / imgDispH);
          const fracW = Math.min(1 - fracX, cropState.w / imgDispW);
          const fracH = Math.min(1 - fracY, cropState.h / imgDispH);

          const sx = Math.round(fracX * natW);
          const sy = Math.round(fracY * natH);
          const sw = Math.max(1, Math.round(fracW * natW));
          const sh = Math.max(1, Math.round(fracH * natH));

          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = sw;
          cropCanvas.height = sh;
          const ctx = cropCanvas.getContext('2d');
          ctx.drawImage(targetImg, sx, sy, sw, sh, 0, 0, sw, sh);

          const croppedBlob = await new Promise(resolve => cropCanvas.toBlob(resolve, 'image/jpeg', 0.96));
          const croppedBlobUrl = URL.createObjectURL(croppedBlob);

          if (!elem.originalUrl) {
            elem.originalUrl = elem.url;
          }

          elem.url = croppedBlobUrl;
          elem.aspectRatio = sw / sh;
          elem.height = Math.round(elem.width / elem.aspectRatio);

          closeCropModal();
          renderCanvasElements();
          renderSidebarList();
          updateSelectedUI();
          showNotification(`Cropped ${cardSideLabel} successfully!`, 'success');
        } catch (err) {
          console.error('Crop error:', err);
          showNotification('Could not apply crop: ' + err.message, 'error');
          applyBtn.textContent = '✔ Apply Crop';
          applyBtn.disabled = false;
        }
      });
    }

    // Sidebar crop button triggers cropping modal
    document.getElementById('f4SidebarCropBtn')?.addEventListener('click', () => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected) {
        openIdCardCroppingModal(selected);
      }
    });

    // Sidebar list
    function renderSidebarList() {
      const list = document.getElementById('f4ElementsList');
      const countEl = document.getElementById('f4ImagesCount');
      if (countEl) countEl.textContent = elements.length;
      if (!list) return;

      if (elements.length === 0) {
        list.innerHTML = `<p class="text-xs text-muted" style="padding:10px 0;">No images placed on page.</p>`;
        return;
      }

      list.innerHTML = elements.map((elem, idx) => {
        const sideLabel = idx === 0 ? 'Front' : (idx === 1 ? 'Back' : `Card ${idx + 1}`);
        return `
          <div class="a4-element-row ${elem.id === selectedElementId ? 'active' : ''}" data-elem-id="${elem.id}">
            <div style="width:36px;height:24px;overflow:hidden;border-radius:3px;border:1px solid var(--border-subtle);flex-shrink:0;">
              <img src="${escapeHtml(elem.url)}" style="width:100%;height:100%;object-fit:cover;" />
            </div>
            <div style="flex:1;min-width:0;">
              <div class="font-mono text-xs truncate" style="font-weight:600;">${escapeHtml(elem.name)}</div>
              <div class="text-xs text-muted">#${idx + 1} &bull; ${sideLabel}</div>
            </div>
            <button type="button" class="btn btn-xs btn-ghost text-muted remove-single-f4-elem" data-id="${elem.id}" title="Remove">&times;</button>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.a4-element-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.classList.contains('remove-single-f4-elem')) return;
          selectedElementId = row.getAttribute('data-elem-id');
          renderCanvasElements();
          renderSidebarList();
          updateSelectedUI();
        });
      });

      list.querySelectorAll('.remove-single-f4-elem').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          saveState();
          const targetId = btn.getAttribute('data-id');
          elements = elements.filter(el => el.id !== targetId);
          if (selectedElementId === targetId) {
            selectedElementId = elements.length > 0 ? elements[0].id : null;
          }
          renderCanvasElements();
          renderSidebarList();
          updateSelectedUI();
        });
      });
    }

    // Selected element controls UI
    function updateSelectedUI() {
      const section = document.getElementById('f4SelectedControls');
      const selected = elements.find(el => el.id === selectedElementId);
      const badge = document.getElementById('f4SelectedCardBadge');

      if (!selected || !section) {
        if (section) section.style.display = 'none';
        return;
      }

      section.style.display = 'block';
      const idx = elements.findIndex(el => el.id === selected.id);
      if (badge) {
        badge.textContent = idx === 0 ? '#1 Front' : (idx === 1 ? '#2 Back' : `#${idx + 1}`);
      }

      const slider = document.getElementById('f4ScaleSlider');
      const scaleLabel = document.getElementById('f4ScaleLabel');
      if (slider) slider.value = selected.scale || 100;
      if (scaleLabel) scaleLabel.textContent = `${selected.scale || 100}%`;
    }

    // Scale controls
    document.getElementById('f4ScaleSlider')?.addEventListener('input', (e) => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected) {
        selected.scale = parseInt(e.target.value, 10);
        document.getElementById('f4ScaleLabel').textContent = `${selected.scale}%`;
        renderCanvasElements();
      }
    });

    document.getElementById('f4ScaleMinus')?.addEventListener('click', () => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected && selected.scale > 30) {
        saveState();
        selected.scale -= 10;
        updateSelectedUI();
        renderCanvasElements();
      }
    });

    document.getElementById('f4ScalePlus')?.addEventListener('click', () => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected && selected.scale < 250) {
        saveState();
        selected.scale += 10;
        updateSelectedUI();
        renderCanvasElements();
      }
    });

    // Rotation controls
    document.getElementById('f4RotateCCW')?.addEventListener('click', () => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected) {
        saveState();
        selected.rotation = (selected.rotation - 90) % 360;
        renderCanvasElements();
      }
    });

    document.getElementById('f4RotateCW')?.addEventListener('click', () => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected) {
        saveState();
        selected.rotation = (selected.rotation + 90) % 360;
        renderCanvasElements();
      }
    });

    // Alignment
    document.getElementById('f4AlignTop')?.addEventListener('click', () => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected) {
        saveState();
        selected.y = 20;
        renderCanvasElements();
      }
    });

    document.getElementById('f4AlignBottom')?.addEventListener('click', () => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected) {
        saveState();
        const scaledH = Math.round(selected.height * (selected.scale / 100));
        selected.y = PAPER_DIMENSIONS[currentPaper][currentOrientation].height - scaledH - 20;
        renderCanvasElements();
      }
    });

    document.getElementById('f4AlignCenter')?.addEventListener('click', () => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected) {
        saveState();
        const sheet = PAPER_DIMENSIONS[currentPaper][currentOrientation];
        const scaledW = Math.round(selected.width * (selected.scale / 100));
        const scaledH = Math.round(selected.height * (selected.scale / 100));
        selected.x = Math.round((sheet.width - scaledW) / 2);
        selected.y = Math.round((sheet.height - scaledH) / 2);
        renderCanvasElements();
      }
    });

    document.getElementById('f4AlignReset')?.addEventListener('click', () => {
      const selected = elements.find(el => el.id === selectedElementId);
      if (selected) {
        saveState();
        selected.x = 35;
        selected.y = 60;
        selected.scale = 100;
        selected.rotation = 0;
        renderCanvasElements();
        updateSelectedUI();
      }
    });

    document.getElementById('f4RemoveElementBtn')?.addEventListener('click', () => {
      if (!selectedElementId) return;
      saveState();
      elements = elements.filter(el => el.id !== selectedElementId);
      selectedElementId = elements.length > 0 ? elements[0].id : null;
      renderCanvasElements();
      renderSidebarList();
      updateSelectedUI();
    });

    // Add extra image
    document.getElementById('f4AddExtraFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const objUrl = URL.createObjectURL(file);
      const newElem = {
        id: 'elem_' + Math.random().toString(36).substring(2, 9),
        name: file.name,
        url: objUrl,
        originalUrl: objUrl,
        x: 40,
        y: 80,
        width: 170,
        height: 108,
        rotation: 0,
        scale: 100,
        aspectRatio: 1.585
      };

      const testImg = new Image();
      testImg.onload = () => {
        if (testImg.naturalWidth && testImg.naturalHeight) {
          newElem.aspectRatio = testImg.naturalWidth / testImg.naturalHeight;
          newElem.height = Math.round(newElem.width / newElem.aspectRatio);
        }
        saveState();
        elements.push(newElem);
        selectedElementId = newElem.id;
        renderCanvasElements();
        renderSidebarList();
        updateSelectedUI();
      };
      testImg.src = objUrl;
      e.target.value = '';
    });

    // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y)
    const onKeyDown = (evt) => {
      if (!document.getElementById(modalId)) {
        window.removeEventListener('keydown', onKeyDown);
        return;
      }
      if (evt.target.tagName === 'INPUT') return;

      if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z') {
        evt.preventDefault();
        document.getElementById('f4UndoBtn')?.click();
      } else if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'y') {
        evt.preventDefault();
        document.getElementById('f4RedoBtn')?.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Initial render & Auto-fit
    updateSheetSize();
    renderSidebarList();
    updateSelectedUI();
    setTimeout(fitToPage, 80);

    // High-Resolution 300 DPI Export & Save to Print Queue
    document.getElementById('f4SaveAndApplyBtn')?.addEventListener('click', async () => {
      if (elements.length === 0) {
        alert('Please place at least one document or ID photo on the canvas.');
        return;
      }

      const saveBtn = document.getElementById('f4SaveAndApplyBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Rendering 300 DPI Composite...';

      try {
        const curConfig = PAPER_DIMENSIONS[currentPaper][currentOrientation];
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = curConfig.dpiW;
        exportCanvas.height = curConfig.dpiH;
        const ctx = exportCanvas.getContext('2d');

        // Crisp white paper background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, curConfig.dpiW, curConfig.dpiH);

        const sheetDisplayW = curConfig.width;
        const scaleFactor = curConfig.dpiW / sheetDisplayW;

        for (const elem of elements) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = () => resolve(); // continue if one image fails
            img.src = elem.url;
          });

          ctx.save();
          const targetX = elem.x * scaleFactor;
          const targetY = elem.y * scaleFactor;
          const targetW = (elem.width * (elem.scale / 100)) * scaleFactor;
          const targetH = (elem.height * (elem.scale / 100)) * scaleFactor;

          const centerX = targetX + (targetW / 2);
          const centerY = targetY + (targetH / 2);

          ctx.translate(centerX, centerY);
          if (elem.rotation !== 0) {
            ctx.rotate((elem.rotation * Math.PI) / 180);
          }

          ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
          ctx.restore();
        }

        saveBtn.textContent = 'Uploading Layout to Print Queue...';

        const compositeBlob = await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/jpeg', 0.95));
        const compositeFileName = `${currentPaper.toUpperCase()}_Layout_${job.order_number || job.job_number}_${Date.now()}.jpg`;
        const compositeFile = new File([compositeBlob], compositeFileName, { type: 'image/jpeg' });

        // Upload to private storage
        const upRes = await uploadCustomerPrintDocument(compositeFile, cafeId);
        if (!upRes.success) {
          throw new Error(upRes.error || 'Failed to upload layout to storage.');
        }

        // Call RPC to update job
        const updateRes = await updateJobPrintLayout(cafeId, job.id, compositeFileName, upRes.filePath);
        if (!updateRes.success) {
          throw new Error(updateRes.error || 'Failed to update job print layout in queue.');
        }

        closeEditor();
        showNotification('Print layout finalized & saved! Print job updated.', 'success');
        await loadData();
      } catch (err) {
        console.error('Save F4 layout error:', err);
        alert('Failed to save layout: ' + (err.message || err));
        saveBtn.disabled = false;
        saveBtn.textContent = '✔ Finalize & Save Print Layout';
      }
    });
  }

  // ----------------------------------------------------
  // ORDER DETAILS MODAL
  // ----------------------------------------------------
  function openOrderDetailsModal(job) {
    const modalId = 'orderDetailsModal';
    let existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const devObj = (dashboardData?.devices || []).find(d => d.id === job.device_id);
    const devLabel = devObj ? (devObj.device_label || 'Counter PC') : (job.device_id ? 'Print PC' : 'Unassigned');
    const isDevOnline = devObj ? (devObj.last_seen_at && (new Date() - new Date(devObj.last_seen_at) < 600000)) : false;
    const isCompletedOrPurged = job.status === 'completed' || job.status === 'cancelled' || job.file_url === '[PURGED]';
    const totalSheets = (Number(job.pages) || 1) * (Number(job.copies) || 1);

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-modal-backdrop';
    modal.style.display = 'flex';

    modal.innerHTML = `
      <div class="admin-modal-card order-details-modal-card">
        <div class="modal-header">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="pill-tag font-mono">ORDER SPECIFICATION</span>
              <span class="job-status-pill status-${job.status} font-mono text-xs">${job.status.toUpperCase()}</span>
              <span class="payment-badge-${job.payment_status || 'unpaid'} font-mono text-xs" style="padding:2px 8px;border-radius:12px;">
                ${(job.payment_status || 'unpaid').toUpperCase()}
              </span>
            </div>
            <h3 class="modal-title font-mono mt-2" style="font-size:1.3rem;">${escapeHtml(job.order_number || job.job_number)}</h3>
            <span class="text-xs text-muted font-mono">Internal ID: ${escapeHtml(job.job_number)}</span>
          </div>
          <button class="modal-close-btn close-order-modal-btn" aria-label="Close Modal">&times;</button>
        </div>

        <div class="order-details-grid">
          <!-- Section 1: Customer Info -->
          <div class="order-details-section">
            <h4>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
              Customer Info
            </h4>
            <div class="detail-item-row">
              <span class="detail-item-label">Name</span>
              <span class="detail-item-value">${escapeHtml(job.customer_name || 'Guest Customer')}</span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Phone</span>
              <span class="detail-item-value font-mono">
                ${job.customer_phone ? `<a href="tel:${escapeHtml(job.customer_phone)}" style="color:var(--text-accent);">${escapeHtml(job.customer_phone)}</a>` : 'Not provided'}
              </span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Submitted</span>
              <span class="detail-item-value font-mono text-xs">${new Date(job.created_at).toLocaleString()}</span>
            </div>
            ${job.completed_at ? `
              <div class="detail-item-row">
                <span class="detail-item-label">Completed</span>
                <span class="detail-item-value font-mono text-xs">${new Date(job.completed_at).toLocaleString()}</span>
              </div>
            ` : ''}
          </div>

          <!-- Section 2: Financials & Payment -->
          <div class="order-details-section">
            <h4>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;"><path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
              Financial & Payment
            </h4>
            <div class="detail-item-row">
              <span class="detail-item-label">Order Total</span>
              <span class="detail-item-value font-mono font-bold text-accent" style="font-size:1.1rem;">₹${Number(job.total_price).toFixed(2)}</span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Payment Status</span>
              <span class="detail-item-value font-mono">
                <span class="payment-badge-${job.payment_status || 'unpaid'} text-xs" style="padding:2px 8px;border-radius:8px;">
                  ${(job.payment_status || 'unpaid').toUpperCase()}
                </span>
              </span>
            </div>
            ${job.status !== 'cancelled' ? `
              <div class="mt-3 text-right">
                <button class="btn btn-sm btn-secondary modal-toggle-pay-btn" data-job-id="${job.id}">
                  Mark as ${job.payment_status === 'paid' ? 'UNPAID' : 'PAID'}
                </button>
              </div>
            ` : ''}
          </div>

          <!-- Section 3: Print Options -->
          <div class="order-details-section">
            <h4>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd"/></svg>
              Print Specifications
            </h4>
            <div class="detail-item-row">
              <span class="detail-item-label">File</span>
              <span class="detail-item-value font-mono text-xs" title="${escapeHtml(job.file_name)}" style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escapeHtml(job.file_name)}
              </span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">${isIdCardEligibleJob(job) ? 'Billable Units' : 'Document Pages'}</span>
              <span class="detail-item-value font-mono">${isIdCardEligibleJob(job) ? `${job.copies || 1} ID Card Copy` : `${job.pages} page${job.pages > 1 ? 's' : ''}`}</span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Quantity (Copies)</span>
              <span class="detail-item-value font-mono">${job.copies}</span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Total Printed Sheets</span>
              <span class="detail-item-value font-mono font-bold">${isIdCardEligibleJob(job) ? `${job.copies || 1} sheet${(job.copies || 1) > 1 ? 's' : ''}` : `${totalSheets} sheets`}</span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Color Mode</span>
              <span class="detail-item-value font-mono">${job.color_mode === 'color' ? 'Full Colour' : 'Black & White'}</span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Duplex</span>
              <span class="detail-item-value font-mono">${job.duplex === 'double' ? 'Double-sided (2-sided)' : 'Single-sided (1-sided)'}</span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Orientation</span>
              <span class="detail-item-value font-mono">${(job.orientation || 'portrait').toUpperCase()}</span>
            </div>
            ${job.page_range && job.page_range !== 'all' ? `
              <div class="detail-item-row">
                <span class="detail-item-label">Page Range</span>
                <span class="detail-item-value font-mono">${escapeHtml(job.page_range)}</span>
              </div>
            ` : ''}
          </div>

          <!-- Section 4: Hardware & Spool Status -->
          <div class="order-details-section">
            <h4>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;"><path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd"/></svg>
              Spool & Hardware Dispatch
            </h4>
            <div class="detail-item-row">
              <span class="detail-item-label">Assigned Workstation</span>
              <span class="detail-item-value font-mono">${escapeHtml(devLabel)}</span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Workstation Status</span>
              <span class="detail-item-value font-mono">
                ${isDevOnline ? `<span style="color:#059669;">● Online</span>` : `<span style="color:#f59e0b;">○ Offline</span>`}
              </span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Assigned Printer</span>
              <span class="detail-item-value font-mono text-xs">${escapeHtml(devObj?.selected_printer || 'System Default')}</span>
            </div>
            <div class="detail-item-row">
              <span class="detail-item-label">Privacy State</span>
              <span class="detail-item-value font-mono text-xs text-muted">
                ${isCompletedOrPurged ? '🔒 File Purged' : 'Active (Private Storage)'}
              </span>
            </div>
            ${job.status === 'duplex_flip' ? `
              <div class="alert-box alert-warning mt-3" style="border: 2px dashed #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 10px 14px;">
                <strong style="color:#d97706;font-size:0.9rem;">📄 MANUAL DUPLEX: Side 1 is Complete!</strong>
                <p class="text-xs text-muted mt-1">
                  Side 1 has finished printing. Please take the paper from the output tray, flip it over, reinsert it into the paper tray, and click "Confirm Paper Flip &amp; Print Side 2" below.
                </p>
              </div>
            ` : ''}
            ${job.error_message ? `
              <div class="alert-box alert-error mt-3" style="padding:8px 12px;font-size:0.8rem;">
                <strong>Printer Error:</strong> ${escapeHtml(job.error_message)}
              </div>
            ` : ''}
          </div>
        </div>

        <div class="modal-actions mt-6" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            ${!isCompletedOrPurged ? `
              <button class="btn btn-secondary modal-preview-doc-btn">
                Preview Document
              </button>
            ` : ''}
            ${isIdCardEligibleJob(job) && !isCompletedOrPurged ? `
              <button class="btn btn-primary modal-open-f4-editor-btn" style="background:#2563eb;border-color:#2563eb;">
                🪪 A4 ID Card Editor
              </button>
            ` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${job.status === 'duplex_flip' ? `
              <button class="btn btn-warning modal-confirm-flip-btn">
                📄 Confirm Paper Flip &amp; Print Side 2
              </button>
            ` : ''}
            ${job.status === 'failed' ? `
              <button class="btn btn-primary modal-retry-job-btn">
                Retry Job
              </button>
            ` : ''}
            ${['pending', 'queued'].includes(job.status) ? `
              <button class="btn btn-primary modal-send-print-btn">
                Send to Print
              </button>
            ` : ''}
            ${!isCompletedOrPurged ? `
              <button class="btn btn-ghost modal-complete-job-btn">
                &check; Complete
              </button>
              <button class="btn btn-ghost text-danger modal-cancel-job-btn">
                Cancel
              </button>
            ` : ''}
            <button class="btn btn-secondary close-order-modal-btn">Close</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelectorAll('.close-order-modal-btn').forEach(b => b.addEventListener('click', closeModal));
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('.modal-confirm-flip-btn')?.addEventListener('click', async () => {
      closeModal();
      const res = await manageCafeJob(cafeId, job.id, 'confirm_duplex_flip');
      if (res.success) {
        showNotification('Paper flip confirmed! Resuming Side 2 printing...', 'success');
        loadData();
      } else {
        showNotification(res.error || 'Failed to confirm paper flip.', 'error');
      }
    });

    modal.querySelector('.modal-toggle-pay-btn')?.addEventListener('click', async () => {
      const next = job.payment_status === 'paid' ? 'unpaid' : 'paid';
      const res = await manageCafeJob(cafeId, job.id, 'update_payment', { paymentStatus: next });
      if (res.success) {
        showNotification(`Payment marked as ${next.toUpperCase()}`, 'success');
        closeModal();
        loadData();
      } else {
        showNotification(res.error || 'Failed to update payment.', 'error');
      }
    });

    modal.querySelector('.modal-preview-doc-btn')?.addEventListener('click', () => {
      closeModal();
      openAdminDocumentPreview(job);
    });

    modal.querySelector('.modal-open-f4-editor-btn')?.addEventListener('click', () => {
      closeModal();
      openCafeAdminF4Editor(job);
    });

    modal.querySelector('.modal-send-print-btn')?.addEventListener('click', async () => {
      const totalSheets = (Number(job.pages) || 1) * (Number(job.copies) || 1);
      if (totalSheets >= 30 || Number(job.total_price) >= 100) {
        const ok = confirm(
          `⚠️ Large Print Order Confirmation:\n\n` +
          `Order: ${job.order_number || job.job_number}\n` +
          `Total Output: ${totalSheets} sheets (${job.pages} pages × ${job.copies} copies)\n` +
          `Total Cost: ₹${Number(job.total_price).toFixed(2)}\n\n` +
          `Please ensure the counter printer paper tray is stocked with paper and toner/ink is sufficient before spooling.\n\n` +
          `Proceed to print?`
        );
        if (!ok) return;
      }
      closeModal();
      const res = await manageCafeJob(cafeId, job.id, 'send_to_print');
      if (!res.success) {
        showNotification(res.error || 'Failed to dispatch to print.', 'error');
      } else {
        showNotification(res.message || 'Job dispatched to print queue.', res.device_id ? 'success' : 'warning');
        loadData();
      }
    });

    modal.querySelector('.modal-retry-job-btn')?.addEventListener('click', async () => {
      closeModal();
      const res = await manageCafeJob(cafeId, job.id, 'retry');
      if (!res.success) {
        showNotification(res.error || 'Failed to retry job.', 'error');
      } else {
        showNotification('Job reset to pending for retry.', 'success');
        loadData();
      }
    });

    modal.querySelector('.modal-complete-job-btn')?.addEventListener('click', async () => {
      if (!confirm('Mark job as Completed? The customer uploaded file will be permanently deleted.')) return;
      closeModal();
      const res = await manageCafeJob(cafeId, job.id, 'complete');
      if (res.success) {
        showNotification('Job marked completed and customer file purged.', 'success');
        loadData();
      } else {
        showNotification(res.error || 'Failed to complete job.', 'error');
      }
    });

    modal.querySelector('.modal-cancel-job-btn')?.addEventListener('click', async () => {
      if (!confirm('Cancel this print job? The customer uploaded file will be permanently deleted.')) return;
      closeModal();
      const res = await manageCafeJob(cafeId, job.id, 'cancel');
      if (res.success) {
        showNotification('Job cancelled and customer file purged.', 'info');
        loadData();
      } else {
        showNotification(res.error || 'Failed to cancel job.', 'error');
      }
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

        <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <span class="text-xs text-muted font-mono">🔒 Temporary 5-minute signed token &bull; Purged on completion</span>
          <div style="display:flex;gap:8px;align-items:center;">
            ${isIdCardEligibleJob(job) ? `
              <button class="btn btn-primary preview-open-f4-editor-btn" style="background:#2563eb;border-color:#2563eb;">
                🪪 Open in A4 ID Card Editor
              </button>
            ` : ''}
            <button class="btn btn-secondary close-admin-preview-btn">Close Preview</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelectorAll('.close-admin-preview-btn').forEach(b => b.addEventListener('click', closeModal));
    modal.querySelector('.preview-open-f4-editor-btn')?.addEventListener('click', () => {
      closeModal();
      openCafeAdminF4Editor(job);
    });
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
