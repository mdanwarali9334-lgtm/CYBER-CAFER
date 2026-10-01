/**
 * Super Admin Control Plane Dashboard
 * High-density, editorial management interface for Cafes, Licensing, Devices, and Security.
 */

import {
  fetchSystemOverview,
  fetchAllCafes,
  createProvisionedCafe,
  updateCafeStatus,
  fetchAllLicenses,
  createProvisionedLicense,
  updateLicenseStatus,
  fetchAllDevices,
  generateDeviceActivationCode,
  revokeDevice,
  fetchAuditLogs,
  fetchAdminAccounts,
} from '../lib/superadmin.js';
import {
  activateDeviceWithCode,
  authenticateDeviceChallenge,
  sendDeviceHeartbeat,
  checkPrintJobAuthorization,
} from '../lib/print-agent-service.js';
import { signOut } from '../lib/auth.js';

export async function renderSuperAdminDashboard(container, { user, profile }) {
  container.innerHTML = `
    <div class="admin-dashboard-layout">
      <!-- Top Administrative Nav -->
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
              <span class="admin-brand-sub font-mono">SUPER ADMIN CONTROL PLANE</span>
            </div>
          </a>
          <div class="admin-status-badge">
            <span class="pulse-dot active" aria-hidden="true"></span>
            <span class="font-mono">DEFENSE-IN-DEPTH ACTIVE &bull; RLS ENFORCED</span>
          </div>
        </div>

        <div class="admin-topbar-right">
          <div class="admin-user-pill">
            <span class="admin-user-role font-mono">SUPER_ADMIN</span>
            <span class="admin-user-email">${user?.email || 'superadmin@presspoint.io'}</span>
          </div>
          <button class="btn btn-sm btn-ghost" id="adminSignOutBtn" title="Sign out of control plane">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" style="width:14px;height:14px;"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H5"/></svg>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <!-- Dashboard Navigation Tabs -->
      <nav class="admin-tabs-nav" aria-label="Admin Sections">
        <div class="site-container admin-tabs-container">
          <button class="admin-tab-btn active" data-tab="overview">Overview</button>
          <button class="admin-tab-btn" data-tab="cafes">Cafes</button>
          <button class="admin-tab-btn" data-tab="licenses">Licenses & Provisioning</button>
          <button class="admin-tab-btn" data-tab="devices">Authorized Devices</button>
          <button class="admin-tab-btn" data-tab="simulator">Print Agent Lab</button>
          <button class="admin-tab-btn" data-tab="accounts">Admin Accounts</button>
          <button class="admin-tab-btn" data-tab="audit">Audit Logs</button>
        </div>
      </nav>

      <!-- Main Content Area -->
      <main class="site-container admin-main-content" id="adminTabContent">
        <div class="admin-loading-state">
          <span class="btn-spinner"></span>
          <p class="font-mono text-muted">Retrieving cryptographic system state...</p>
        </div>
      </main>

      <!-- Global Modal Container for Provisioning Forms -->
      <div id="adminModalContainer" class="admin-modal-backdrop" style="display: none;"></div>
    </div>
  `;

  // Attach Topbar Sign Out
  document.getElementById('adminSignOutBtn')?.addEventListener('click', async () => {
    await signOut();
    window.navigateTo('/login');
  });

  // Determine initial tab from current URL route
  const currentPath = window.location.pathname.toLowerCase();
  let initialTab = 'overview';
  if (currentPath.includes('audit')) initialTab = 'audit';
  else if (currentPath.includes('device')) initialTab = 'devices';
  else if (currentPath.includes('license')) initialTab = 'licenses';
  else if (currentPath.includes('cafe')) initialTab = 'cafes';
  else if (currentPath.includes('account')) initialTab = 'accounts';
  else if (currentPath.includes('sim')) initialTab = 'simulator';

  // Attach Tab Switcher
  const tabButtons = container.querySelectorAll('.admin-tab-btn');
  tabButtons.forEach(btn => {
    const tabName = btn.getAttribute('data-tab');
    if (tabName === initialTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.history.replaceState({}, '', `/super-admin/${tabName}`);
      loadTabContent(tabName);
    });
  });

  // Load Initial Tab
  loadTabContent(initialTab);
}

/**
 * Controller for switching and rendering tabs
 */
async function loadTabContent(tabName) {
  const contentEl = document.getElementById('adminTabContent');
  if (!contentEl) return;

  contentEl.innerHTML = `
    <div class="admin-loading-state">
      <span class="btn-spinner"></span>
      <p class="font-mono text-muted">Loading ${tabName} data...</p>
    </div>
  `;

  try {
    switch (tabName) {
      case 'overview':
        await renderOverviewTab(contentEl);
        break;
      case 'cafes':
        await renderCafesTab(contentEl);
        break;
      case 'licenses':
        await renderLicensesTab(contentEl);
        break;
      case 'devices':
        await renderDevicesTab(contentEl);
        break;
      case 'simulator':
        await renderSimulatorTab(contentEl);
        break;
      case 'accounts':
        await renderAccountsTab(contentEl);
        break;
      case 'audit':
        await renderAuditTab(contentEl);
        break;
      default:
        contentEl.innerHTML = `<p>Unknown section</p>`;
    }
  } catch (err) {
    contentEl.innerHTML = `
      <div class="auth-alert-box alert-error">
        Failed to load section: ${err.message}
      </div>
    `;
  }
}

/* --------------------------------------------------------------------------
   1. OVERVIEW TAB
   -------------------------------------------------------------------------- */
async function renderOverviewTab(container) {
  const [overviewRes, cafesRes, licensesRes] = await Promise.all([
    fetchSystemOverview(),
    fetchAllCafes(),
    fetchAllLicenses(),
  ]);

  const overview = overviewRes.data || {
    total_cafes: cafesRes.data?.length || 0,
    active_cafes: cafesRes.data?.filter(c => c.status === 'active').length || 0,
    total_licenses: licensesRes.data?.length || 0,
    active_licenses: licensesRes.data?.filter(l => l.status === 'active').length || 0,
    total_devices: 0,
    online_devices: 0,
    recent_logs: [],
  };

  container.innerHTML = `
    <div class="admin-overview-grid">
      <!-- Metric Cards -->
      <div class="admin-metric-card">
        <div class="metric-header">
          <span class="metric-title font-mono">PROVISIONED CAFES</span>
          <span class="badge-subtle">${overview.active_cafes} ACTIVE</span>
        </div>
        <div class="metric-value">${overview.total_cafes}</div>
        <p class="metric-desc">Multi-tenant cyber cafes under centralized licensing.</p>
      </div>

      <div class="admin-metric-card">
        <div class="metric-header">
          <span class="metric-title font-mono">ACTIVE LICENSES</span>
          <span class="badge-subtle">${overview.total_licenses} ISSUED</span>
        </div>
        <div class="metric-value">${overview.active_licenses}</div>
        <p class="metric-desc">Cryptographically anchored seat authorizations.</p>
      </div>

      <div class="admin-metric-card">
        <div class="metric-header">
          <span class="metric-title font-mono">AUTHORIZED DEVICES</span>
          <span class="badge-subtle">${overview.online_devices} ONLINE</span>
        </div>
        <div class="metric-value">${overview.total_devices}</div>
        <p class="metric-desc">Windows Print Agent PC slots with public key identities.</p>
      </div>

      <div class="admin-metric-card">
        <div class="metric-header">
          <span class="metric-title font-mono">SECURITY INTEGRITY</span>
          <span class="badge-subtle text-accent">HARDENED</span>
        </div>
        <div class="metric-value font-mono" style="font-size: 1.5rem; margin-top: 8px;">100% RLS</div>
        <p class="metric-desc">Zero service-role keys exposed. Challenge-response active.</p>
      </div>
    </div>

    <!-- Quick Action Launchpad -->
    <div class="admin-action-bar">
      <div>
        <h3 class="editorial-h3">Administrative Launchpad</h3>
        <p class="text-muted">Direct provisioning tools for expanding network capacity.</p>
      </div>
      <div class="admin-action-buttons">
        <button class="btn btn-secondary btn-sm" id="btnQuickNewCafe">+ Provision Cafe</button>
        <button class="btn btn-secondary btn-sm" id="btnQuickNewLicense">+ Issue License</button>
        <button class="btn btn-primary btn-sm" id="btnQuickNewPC">+ Authorize PC Slot</button>
      </div>
    </div>

    <!-- Live Audit Feed Snippet -->
    <div class="admin-card-section">
      <div class="section-title-row">
        <div>
          <h3 class="editorial-h3">Recent System Security Events</h3>
          <p class="text-muted">Real-time audit log of administrative and cryptographic operations.</p>
        </div>
        <button class="btn btn-ghost btn-sm font-mono" id="btnViewAllAudit">View All Logs &rarr;</button>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event Type</th>
              <th>User / Device</th>
              <th>Security Metadata</th>
            </tr>
          </thead>
          <tbody>
            ${(overview.recent_logs || []).slice(0, 6).map(log => `
              <tr>
                <td class="font-mono text-muted text-sm">${new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                <td><span class="audit-event-pill ${getEventClass(log.event_type)} font-mono">${log.event_type}</span></td>
                <td class="font-mono text-sm">${log.user_id ? log.user_id.substring(0, 8) + '...' : 'System / Device'}</td>
                <td class="font-mono text-xs text-muted">${formatMetadata(log.metadata)}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted">No recent logs recorded</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach Launchpad Events
  document.getElementById('btnQuickNewCafe')?.addEventListener('click', () => openNewCafeModal());
  document.getElementById('btnQuickNewLicense')?.addEventListener('click', () => openNewLicenseModal());
  document.getElementById('btnQuickNewPC')?.addEventListener('click', () => openNewActivationModal());
  document.getElementById('btnViewAllAudit')?.addEventListener('click', () => {
    document.querySelector('[data-tab="audit"]')?.click();
  });
}

/* --------------------------------------------------------------------------
   2. CAFES TAB
   -------------------------------------------------------------------------- */
async function renderCafesTab(container) {
  const result = await fetchAllCafes();
  const cafes = result.data || [];

  container.innerHTML = `
    <div class="admin-card-section">
      <div class="section-title-row">
        <div>
          <h2 class="editorial-h2">Provisioned Cyber Cafes</h2>
          <p class="text-muted">Super Admin provisioned establishments. Only provisioned cafes can be claimed during registration.</p>
        </div>
        <button class="btn btn-primary btn-sm" id="btnAddNewCafe">+ Provision New Cafe</button>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Cafe Name</th>
              <th>Slug / Identifier</th>
              <th>Status</th>
              <th>Contact Details</th>
              <th>Provisioned Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${cafes.map(cafe => `
              <tr>
                <td><strong>${escapeHtml(cafe.name)}</strong></td>
                <td class="font-mono text-sm">${cafe.slug}</td>
                <td><span class="status-pill status-${cafe.status} font-mono">${cafe.status.toUpperCase()}</span></td>
                <td class="text-sm">
                  ${cafe.contact_email ? `<div>${escapeHtml(cafe.contact_email)}</div>` : ''}
                  ${cafe.contact_phone ? `<div class="text-muted">${escapeHtml(cafe.contact_phone)}</div>` : '<span class="text-muted font-mono">None</span>'}
                </td>
                <td class="font-mono text-sm">${new Date(cafe.created_at).toLocaleDateString()}</td>
                <td>
                  <div class="table-actions">
                    ${cafe.status === 'active' 
                      ? `<button class="btn btn-xs btn-outline-danger btn-cafe-status" data-id="${cafe.id}" data-status="suspended">Suspend</button>`
                      : `<button class="btn btn-xs btn-secondary btn-cafe-status" data-id="${cafe.id}" data-status="active">Activate</button>`
                    }
                    ${cafe.status !== 'disabled' 
                      ? `<button class="btn btn-xs btn-ghost btn-cafe-status" data-id="${cafe.id}" data-status="disabled">Disable</button>` 
                      : ''
                    }
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btnAddNewCafe')?.addEventListener('click', () => openNewCafeModal());

  container.querySelectorAll('.btn-cafe-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cafeId = btn.getAttribute('data-id');
      const newStatus = btn.getAttribute('data-status');
      btn.disabled = true;
      btn.textContent = 'Updating...';
      const res = await updateCafeStatus(cafeId, newStatus);
      if (res.success) {
        loadTabContent('cafes');
      } else {
        alert(res.error || 'Failed to update cafe status.');
        btn.disabled = false;
      }
    });
  });
}

/* --------------------------------------------------------------------------
   3. LICENSES TAB
   -------------------------------------------------------------------------- */
async function renderLicensesTab(container) {
  const result = await fetchAllLicenses();
  const licenses = result.data || [];

  container.innerHTML = `
    <div class="admin-card-section">
      <div class="section-title-row">
        <div>
          <h2 class="editorial-h2">License Management & Tokens</h2>
          <p class="text-muted">Issue seats, configure PC slots, and generate secure one-time registration authorization tokens.</p>
        </div>
        <button class="btn btn-primary btn-sm" id="btnAddNewLicense">+ Issue New License</button>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>License Number</th>
              <th>Assigned Cafe</th>
              <th>Status</th>
              <th>PC Slots</th>
              <th>Expiration</th>
              <th>Claim Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${licenses.map(lic => {
              const isExpired = new Date(lic.expires_at) <= new Date();
              const effectiveStatus = isExpired ? 'expired' : lic.status;
              return `
                <tr>
                  <td><code class="font-mono text-accent font-bold">${lic.license_number}</code></td>
                  <td>${escapeHtml(lic.cafes?.name || 'Unassigned')}</td>
                  <td><span class="status-pill status-${effectiveStatus} font-mono">${effectiveStatus.toUpperCase()}</span></td>
                  <td class="font-mono text-center"><strong>${lic.max_devices || 3}</strong> max PCs</td>
                  <td class="font-mono text-sm">${new Date(lic.expires_at).toLocaleDateString()}</td>
                  <td>
                    ${lic.claimed 
                      ? `<span class="badge-claimed font-mono">Claimed</span>` 
                      : `<span class="badge-unclaimed font-mono">Ready to Claim</span>`
                    }
                  </td>
                  <td>
                    <div class="table-actions">
                      ${lic.status === 'active'
                        ? `<button class="btn btn-xs btn-outline-danger btn-lic-status" data-id="${lic.id}" data-status="suspended">Suspend</button>`
                        : `<button class="btn btn-xs btn-secondary btn-lic-status" data-id="${lic.id}" data-status="active">Activate</button>`
                      }
                      ${lic.status !== 'revoked'
                        ? `<button class="btn btn-xs btn-ghost btn-lic-status" data-id="${lic.id}" data-status="revoked">Revoke</button>`
                        : ''
                      }
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btnAddNewLicense')?.addEventListener('click', () => openNewLicenseModal());

  container.querySelectorAll('.btn-lic-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const licId = btn.getAttribute('data-id');
      const newStatus = btn.getAttribute('data-status');
      btn.disabled = true;
      btn.textContent = 'Updating...';
      const res = await updateLicenseStatus(licId, newStatus);
      if (res.success) {
        loadTabContent('licenses');
      } else {
        alert(res.error || 'Failed to update license.');
        btn.disabled = false;
      }
    });
  });
}

/* --------------------------------------------------------------------------
   4. AUTHORIZED DEVICES TAB
   -------------------------------------------------------------------------- */
async function renderDevicesTab(container) {
  const result = await fetchAllDevices();
  const devices = result.data || [];

  container.innerHTML = `
    <div class="admin-card-section">
      <div class="section-title-row">
        <div>
          <h2 class="editorial-h2">Authorized PC Workstations</h2>
          <p class="text-muted">Enforces maximum device slots per license. Every PC is bound by an asymmetric cryptographic key.</p>
        </div>
        <button class="btn btn-primary btn-sm" id="btnGenerateActivationCode">+ Authorize PC Slot</button>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Workstation Label</th>
              <th>Assigned Cafe</th>
              <th>License Reference</th>
              <th>Hardware Security</th>
              <th>Authorization Status</th>
              <th>Heartbeat / Online</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${devices.map(dev => {
              const isRecent = dev.last_seen_at && (Date.now() - new Date(dev.last_seen_at).getTime()) < (5 * 60 * 1000);
              const isRevoked = dev.status === 'revoked';
              return `
                <tr>
                  <td>
                    <strong>${escapeHtml(dev.device_label)}</strong>
                    <div class="font-mono text-xs text-muted">ID: ${dev.id.substring(0, 8)}...</div>
                  </td>
                  <td>${escapeHtml(dev.cafes?.name || 'Unknown')}</td>
                  <td class="font-mono text-sm">${dev.cafe_licenses?.license_number || 'N/A'}</td>
                  <td>
                    ${dev.tpm_backed 
                      ? `<span class="tpm-badge font-mono">&check; TPM 2.0 Hardware</span>`
                      : `<span class="software-key-badge font-mono">CNG Software Key</span>`
                    }
                  </td>
                  <td><span class="status-pill status-${dev.status} font-mono">${dev.status.toUpperCase()}</span></td>
                  <td>
                    ${!isRevoked && isRecent 
                      ? `<div class="online-indicator"><span class="pulse-dot active"></span> <strong>Online</strong></div>`
                      : `<div class="online-indicator"><span class="pulse-dot offline"></span> <span class="text-muted">${dev.last_seen_at ? 'Seen ' + new Date(dev.last_seen_at).toLocaleTimeString() : 'Never'}</span></div>`
                    }
                  </td>
                  <td>
                    ${dev.status !== 'revoked'
                      ? `<button class="btn btn-xs btn-outline-danger btn-revoke-device" data-id="${dev.id}">Revoke PC</button>`
                      : `<span class="text-muted font-mono text-xs">Revoked (${new Date(dev.revoked_at || dev.created_at).toLocaleDateString()})</span>`
                    }
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="7" class="text-center py-6 text-muted">No authorized devices found. Provision an activation code to onboard a counter PC.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btnGenerateActivationCode')?.addEventListener('click', () => openNewActivationModal());

  container.querySelectorAll('.btn-revoke-device').forEach(btn => {
    btn.addEventListener('click', async () => {
      const devId = btn.getAttribute('data-id');
      if (!confirm('Are you sure you want to revoke this device? Its cryptographic sessions will be instantly invalidated and it will be blocked from print queues.')) {
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Revoking...';
      const res = await revokeDevice(devId);
      if (res.success) {
        loadTabContent('devices');
      } else {
        alert(res.error || 'Failed to revoke device.');
        btn.disabled = false;
      }
    });
  });
}

/* --------------------------------------------------------------------------
   5. SIMULATOR / HARDWARE LAB TAB
   -------------------------------------------------------------------------- */
async function renderSimulatorTab(container) {
  const [cafesRes, licensesRes] = await Promise.all([
    fetchAllCafes(),
    fetchAllLicenses(),
  ]);

  const cafes = cafesRes.data || [];
  const licenses = licensesRes.data || [];

  container.innerHTML = `
    <div class="admin-card-section">
      <div class="section-title-row">
        <div>
          <h2 class="editorial-h2">Windows Print Agent Hardware Lab & Simulator</h2>
          <p class="text-muted">Interactive verification console demonstrating asymmetric ECDSA P-256 key generation, one-time PC activation, challenge-response signature verification, and live heartbeat telemetry.</p>
        </div>
      </div>

      <div class="simulator-layout">
        <!-- Control Form -->
        <div class="simulator-controls">
          <h3 class="editorial-h3">1. One-Time PC Activation</h3>
          <div class="auth-input-group">
            <label class="auth-label">Target Cafe</label>
            <select id="simCafeSelect" class="auth-input">
              ${cafes.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>

          <div class="auth-input-group">
            <label class="auth-label">License Number</label>
            <select id="simLicSelect" class="auth-input">
              ${licenses.map(l => `<option value="${l.license_number}">${l.license_number} (${l.cafes?.name})</option>`).join('')}
            </select>
          </div>

          <div class="auth-input-group">
            <label class="auth-label">Activation Code</label>
            <input type="text" id="simActCode" class="auth-input font-mono" placeholder="ACT-METRO-XXXX-XXXX" />
          </div>

          <div class="auth-input-group">
            <label class="auth-label">Workstation Label</label>
            <input type="text" id="simDevLabel" class="auth-input" value="Counter PC-01 Express" />
          </div>

          <div class="auth-actions-group">
            <button class="btn btn-primary w-full" id="btnSimActivate">
              <span>Execute PC Activation (ECDSA P-256)</span>
            </button>
          </div>

          <hr style="border-color: var(--border-subtle); margin: 24px 0;" />

          <h3 class="editorial-h3">2. Live Telemetry & Challenge Authentication</h3>
          <div class="sim-actions-grid">
            <button class="btn btn-secondary btn-sm" id="btnSimChallenge" disabled>
              Prove Identity (Challenge Nonce)
            </button>
            <button class="btn btn-secondary btn-sm" id="btnSimHeartbeat" disabled>
              Send Heartbeat (Ping)
            </button>
            <button class="btn btn-ghost btn-sm text-accent" id="btnSimIDOR" disabled>
              Test Cross-Cafe IDOR Block
            </button>
          </div>
        </div>

        <!-- Terminal Output Screen -->
        <div class="simulator-terminal">
          <div class="terminal-top">
            <div class="terminal-dots">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </div>
            <span class="terminal-title font-mono">PRINT AGENT ENCLAVE TELEMETRY</span>
          </div>
          <div class="terminal-body font-mono" id="simTerminalLog">
            <div class="term-line info">[AGENT_INIT] Cryptographic engine initialized. Ready for device provisioning.</div>
            <div class="term-line info">[CAPABILITY] Hardware TPM detection policy: CNG software enclave fallback active.</div>
            <div class="term-line text-muted">Awaiting activation request...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  let activeSessionData = null;

  function appendLog(type, msg) {
    const term = document.getElementById('simTerminalLog');
    if (!term) return;
    const line = document.createElement('div');
    line.className = `term-line ${type}`;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    line.innerHTML = `<span class="term-time">[${time}]</span> ${escapeHtml(msg)}`;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }

  // 1. Activation Handler
  document.getElementById('btnSimActivate')?.addEventListener('click', async () => {
    const cafeId = document.getElementById('simCafeSelect').value;
    const licenseNumber = document.getElementById('simLicSelect').value;
    const activationCode = document.getElementById('simActCode').value;
    const deviceLabel = document.getElementById('simDevLabel').value;

    if (!activationCode) {
      alert('Please enter an activation code. You can generate one from the Authorized Devices tab.');
      return;
    }

    appendLog('info', `Generating asymmetric ECDSA P-256 key pair in device enclave...`);
    const btn = document.getElementById('btnSimActivate');
    btn.disabled = true;

    const res = await activateDeviceWithCode({
      cafeId,
      licenseNumber,
      activationCode,
      deviceLabel,
    });

    btn.disabled = false;

    if (res.success) {
      activeSessionData = res;
      appendLog('success', `[AUTHORIZED] PC slot provisioned! Device ID: ${res.deviceId}`);
      appendLog('success', `Public Key registered (SPKI Base64): ${res.publicKeySpki.substring(0, 32)}...`);
      appendLog('info', `Private key strictly retained in host memory. Zero server transmission.`);
      
      document.getElementById('btnSimChallenge').disabled = false;
      document.getElementById('btnSimHeartbeat').disabled = false;
      document.getElementById('btnSimIDOR').disabled = false;
    } else {
      appendLog('error', `[ACTIVATION_FAILED] ${res.error}`);
    }
  });

  // 2. Challenge-Response
  document.getElementById('btnSimChallenge')?.addEventListener('click', async () => {
    if (!activeSessionData) return;
    appendLog('info', `Requesting cryptographic challenge nonce from Supabase...`);

    const res = await authenticateDeviceChallenge(activeSessionData.deviceId, activeSessionData.privateKey);
    if (res.success) {
      activeSessionData.sessionToken = res.sessionToken;
      appendLog('success', `[CHALLENGE_VERIFIED] Signature valid! Session Token issued (24hr).`);
      appendLog('info', `Session Token hash registered. Server will authorize print jobs.`);
    } else {
      appendLog('error', `[CHALLENGE_FAILED] ${res.error}`);
    }
  });

  // 3. Heartbeat
  document.getElementById('btnSimHeartbeat')?.addEventListener('click', async () => {
    if (!activeSessionData || !activeSessionData.sessionToken) {
      appendLog('error', 'Must authenticate challenge first to obtain session token.');
      return;
    }
    appendLog('info', `Dispatching authenticated telemetry heartbeat...`);
    const res = await sendDeviceHeartbeat(activeSessionData.deviceId, activeSessionData.sessionToken);
    if (res.success) {
      appendLog('success', `[HEARTBEAT_ACK] Status: Online. Recorded at ${new Date(res.lastSeenAt).toLocaleTimeString()}`);
    } else {
      appendLog('error', `[HEARTBEAT_REJECTED] ${res.error}`);
    }
  });

  // 4. Test Cross-Cafe IDOR
  document.getElementById('btnSimIDOR')?.addEventListener('click', async () => {
    if (!activeSessionData || !activeSessionData.sessionToken) {
      appendLog('error', 'Must authenticate challenge first to obtain session token.');
      return;
    }
    const fakeCafeId = '99999999-9999-9999-9999-999999999999';
    appendLog('info', `Simulating cross-cafe print job request to foreign Cafe ID: ${fakeCafeId}...`);
    const res = await checkPrintJobAuthorization(activeSessionData.deviceId, activeSessionData.sessionToken, fakeCafeId);
    if (!res.authorized) {
      appendLog('success', `[IDOR_BLOCKED] Server-side policy correctly rejected foreign cafe request: ${res.error}`);
    } else {
      appendLog('error', `[SECURITY_VIOLATION] Unexpectedly authorized!`);
    }
  });
}

/* --------------------------------------------------------------------------
   6. ADMIN ACCOUNTS TAB
   -------------------------------------------------------------------------- */
async function renderAccountsTab(container) {
  const result = await fetchAdminAccounts();
  const accounts = result.data || [];

  container.innerHTML = `
    <div class="admin-card-section">
      <div class="section-title-row">
        <div>
          <h2 class="editorial-h2">Administrative User Directory</h2>
          <p class="text-muted">Enforces strict separation of Super Admin, Cafe Admin, and Staff credentials.</p>
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>User Account</th>
              <th>Full Name</th>
              <th>System Role</th>
              <th>Associated Cafe</th>
              <th>Account Status</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            ${accounts.map(acc => `
              <tr>
                <td><strong>${escapeHtml(acc.email)}</strong></td>
                <td>${escapeHtml(acc.full_name || 'N/A')}</td>
                <td><span class="role-badge role-${acc.role} font-mono">${acc.role.toUpperCase()}</span></td>
                <td>${acc.cafes?.name ? escapeHtml(acc.cafes.name) : '<span class="text-muted font-mono">System-wide</span>'}</td>
                <td><span class="status-pill status-${acc.account_status} font-mono">${acc.account_status.toUpperCase()}</span></td>
                <td class="font-mono text-sm">${acc.last_login_at ? new Date(acc.last_login_at).toLocaleDateString() : 'Never'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   7. AUDIT LOGS TAB
   -------------------------------------------------------------------------- */
async function renderAuditTab(container) {
  const result = await fetchAuditLogs(100);
  const logs = result.data || [];

  container.innerHTML = `
    <div class="admin-card-section">
      <div class="section-title-row">
        <div>
          <h2 class="editorial-h2">Cryptographic & Security Audit Log</h2>
          <p class="text-muted">Zero-leakage compliance event store tracking device provisioning, authentications, revocations, and administrative updates.</p>
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event Type</th>
              <th>User / Principal</th>
              <th>Sanitized Event Metadata</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => `
              <tr>
                <td class="font-mono text-sm text-muted">${new Date(log.created_at).toLocaleString()}</td>
                <td><span class="audit-event-pill ${getEventClass(log.event_type)} font-mono">${log.event_type}</span></td>
                <td class="font-mono text-xs">${log.user_id ? log.user_id.substring(0, 8) + '...' : 'System / Device'}</td>
                <td class="font-mono text-xs text-muted">${formatMetadata(log.metadata)}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center py-6 text-muted">No audit logs recorded</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   MODALS: PROVISIONING WORKFLOWS
   -------------------------------------------------------------------------- */

function openNewCafeModal() {
  const modal = document.getElementById('adminModalContainer');
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="admin-modal-card">
      <div class="modal-header">
        <h3 class="editorial-h3">Provision New Cafe</h3>
        <button class="modal-close-btn" id="modalCloseBtn">&times;</button>
      </div>
      <p class="text-muted text-sm" style="margin-bottom: 20px;">
        Creates a registered establishment entry in the database. Can later be claimed by the Cafe Admin during registration.
      </p>

      <form id="provisionCafeForm" class="auth-form" novalidate>
        <div class="auth-input-group">
          <label class="auth-label">Cafe Name *</label>
          <input type="text" id="cafeNameInput" class="auth-input" placeholder="e.g. Metro Xerox & Printing" required />
        </div>

        <div class="auth-input-group">
          <label class="auth-label">Custom Slug (Optional)</label>
          <input type="text" id="cafeSlugInput" class="auth-input font-mono" placeholder="metro-xerox" />
        </div>

        <div class="auth-input-group">
          <label class="auth-label">Contact Email</label>
          <input type="email" id="cafeEmailInput" class="auth-input" placeholder="owner@metro.in" />
        </div>

        <div class="auth-input-group">
          <label class="auth-label">Contact Phone</label>
          <input type="tel" id="cafePhoneInput" class="auth-input" placeholder="+91 98765 43210" />
        </div>

        <div class="auth-input-group">
          <label class="auth-label">Address</label>
          <input type="text" id="cafeAddressInput" class="auth-input" placeholder="Shop 4, Metro Plaza, Sector 18" />
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="modalCancelBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btnSubmitCafe">Provision Cafe</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn')?.addEventListener('click', closeModal);

  document.getElementById('provisionCafeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cafeNameInput').value;
    const slug = document.getElementById('cafeSlugInput').value;
    const contactEmail = document.getElementById('cafeEmailInput').value;
    const contactPhone = document.getElementById('cafePhoneInput').value;
    const address = document.getElementById('cafeAddressInput').value;

    const btn = document.getElementById('btnSubmitCafe');
    btn.disabled = true;
    btn.textContent = 'Provisioning...';

    const res = await createProvisionedCafe({ name, slug, contactEmail, contactPhone, address });
    if (res.success) {
      closeModal();
      loadTabContent('cafes');
    } else {
      alert(res.error || 'Failed to create cafe.');
      btn.disabled = false;
      btn.textContent = 'Provision Cafe';
    }
  });
}

async function openNewLicenseModal() {
  const modal = document.getElementById('adminModalContainer');
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="admin-modal-card">
      <div class="modal-header">
        <h3 class="editorial-h3">Issue Cafe License</h3>
        <button class="modal-close-btn" id="modalCloseBtn">&times;</button>
      </div>
      <p class="text-muted text-sm" style="margin-bottom: 20px;">
        Select the cafe and parameters. The unique License Number and high-entropy Authorization Token will be generated automatically on the server.
      </p>

      <div id="modalAlertBox" class="auth-alert-box alert-error" style="display: none;"></div>

      <form id="provisionLicenseForm" class="auth-form" novalidate>
        <div class="auth-input-group">
          <label class="auth-label">Target Cafe *</label>
          <select id="licCafeSelect" class="auth-input" required>
            <option value="">Loading cafes...</option>
          </select>
        </div>

        <div class="auth-input-group">
          <label class="auth-label">Maximum Authorized PC Slots</label>
          <input type="number" id="licMaxPCs" class="auth-input font-mono" value="3" min="1" max="50" required />
          <p class="auth-input-hint">Server-enforced seat capacity for counter workstations.</p>
        </div>

        <div class="auth-input-group">
          <label class="auth-label">Validity Period</label>
          <select id="licValidDays" class="auth-input">
            <option value="30">30 Days (Pilot Trial)</option>
            <option value="90">90 Days (Quarterly)</option>
            <option value="180">180 Days (Half-Year)</option>
            <option value="365" selected>1 Year (365 Days Annual)</option>
            <option value="730">2 Years (730 Days Enterprise)</option>
          </select>
        </div>

        <div class="auto-gen-notice font-mono">
          <span>&check; License Number format: CC-XXXX-XXXX-XXXX (Auto-generated)</span>
          <span>&check; Authorization Token: Cryptographic high-entropy (Auto-generated)</span>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="modalCancelBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btnSubmitLic">Issue License</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn')?.addEventListener('click', closeModal);

  // Load cafes into select
  const cafesRes = await fetchAllCafes();
  const select = document.getElementById('licCafeSelect');
  if (select && cafesRes.data) {
    select.innerHTML = cafesRes.data.map(c => `<option value="${c.id}">${c.name} (${c.status})</option>`).join('') || '<option value="">No provisioned cafes available</option>';
  }

  document.getElementById('provisionLicenseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cafeId = document.getElementById('licCafeSelect').value;
    const maxDevices = document.getElementById('licMaxPCs').value;
    const validDays = document.getElementById('licValidDays').value;
    const alertBox = document.getElementById('modalAlertBox');

    if (!cafeId) {
      if (alertBox) {
        alertBox.textContent = 'Please select a target cafe.';
        alertBox.style.display = 'block';
      }
      return;
    }

    const btn = document.getElementById('btnSubmitLic');
    btn.disabled = true;
    btn.textContent = 'Generating Secure Credentials...';

    const res = await createProvisionedLicense({
      cafeId,
      maxDevices,
      validDays,
    });

    if (res.success) {
      // Show secure one-time credentials card
      const selectedCafeName = select.options[select.selectedIndex]?.text || 'Target Cafe';
      modal.innerHTML = `
        <div class="admin-modal-card credential-card">
          <div class="modal-header">
            <h3 class="editorial-h3 text-accent">&check; License Issued Successfully</h3>
            <button class="modal-close-btn" id="modalDoneCloseBtn">&times;</button>
          </div>
          <p class="text-muted text-sm">
            Transmit these credentials securely to the cafe administrator. The Authorization Token will not be shown again in plaintext.
          </p>

          <div class="cred-reveal-box">
            <div class="cred-row">
              <span class="cred-label font-mono">TARGET CAFE</span>
              <strong class="cred-value">${escapeHtml(selectedCafeName)}</strong>
            </div>

            <div class="cred-row">
              <span class="cred-label font-mono">LICENSE NUMBER</span>
              <div class="cred-copy-wrap">
                <code class="cred-value-code font-mono">${res.data.license_number}</code>
                <button type="button" class="btn btn-xs btn-secondary btn-copy-cred" data-copy="${res.data.license_number}">Copy</button>
              </div>
            </div>

            <div class="cred-row">
              <span class="cred-label font-mono">AUTHORIZATION TOKEN</span>
              <div class="cred-copy-wrap">
                <code class="cred-value-code font-mono text-accent">${res.rawAuthToken}</code>
                <button type="button" class="btn btn-xs btn-secondary btn-copy-cred" data-copy="${res.rawAuthToken}">Copy</button>
              </div>
            </div>

            <div class="cred-row">
              <span class="cred-label font-mono">PC CAPACITY & EXPIRY</span>
              <span class="text-sm font-mono">${res.data.max_devices} PC Slots &bull; Expires ${new Date(res.data.expires_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-primary" id="btnDoneLic">Done &bull; Refresh Licenses</button>
          </div>
        </div>
      `;

      attachCopyHandlers(modal);
      document.getElementById('modalDoneCloseBtn')?.addEventListener('click', () => {
        closeModal();
        loadTabContent('licenses');
      });
      document.getElementById('btnDoneLic')?.addEventListener('click', () => {
        closeModal();
        loadTabContent('licenses');
      });
    } else {
      if (alertBox) {
        alertBox.textContent = res.error || 'Failed to issue license.';
        alertBox.style.display = 'block';
      }
      btn.disabled = false;
      btn.textContent = 'Issue License';
    }
  });
}

async function openNewActivationModal() {
  const modal = document.getElementById('adminModalContainer');
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="admin-modal-card">
      <div class="modal-header">
        <h3 class="editorial-h3">Authorize PC Workstation Slot</h3>
        <button class="modal-close-btn" id="modalCloseBtn">&times;</button>
      </div>
      <p class="text-muted text-sm" style="margin-bottom: 20px;">
        Generates an unpredictable, single-use activation code. Slot capacity is strictly enforced server-side against the license.
      </p>

      <div id="modalAlertBox" class="auth-alert-box alert-error" style="display: none;"></div>

      <form id="provisionPCForm" class="auth-form" novalidate>
        <div class="auth-input-group">
          <label class="auth-label">Target Cafe License *</label>
          <select id="pcLicSelect" class="auth-input" required>
            <option value="">Loading active licenses...</option>
          </select>
        </div>

        <div class="auth-input-group">
          <label class="auth-label">Workstation Label *</label>
          <input type="text" id="pcLabelInput" class="auth-input" value="PC-0${Math.floor(Math.random() * 8) + 1} Counter Xerox" required />
          <p class="auth-input-hint">Human-readable label for dashboard identification.</p>
        </div>

        <div class="auto-gen-notice font-mono">
          <span>&check; Device ID: UUID v4 (Auto-generated on binding)</span>
          <span>&check; Activation Code: ACT-XXXX-XXXX (Auto-generated single-use)</span>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="modalCancelBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btnSubmitPC">Authorize PC Slot</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn')?.addEventListener('click', closeModal);

  // Load active licenses
  const licRes = await fetchAllLicenses();
  const select = document.getElementById('pcLicSelect');
  let selectedMap = {};

  if (select && licRes.data) {
    const activeLics = licRes.data.filter(l => l.status === 'active' && new Date(l.expires_at) > new Date());
    select.innerHTML = activeLics.map(l => {
      selectedMap[l.id] = l.cafe_id;
      return `<option value="${l.id}">${l.license_number} — ${l.cafes?.name || 'Cafe'}</option>`;
    }).join('') || '<option value="">No active licenses available</option>';
  }

  document.getElementById('provisionPCForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const licenseId = document.getElementById('pcLicSelect').value;
    const cafeId = selectedMap[licenseId];
    const deviceLabel = document.getElementById('pcLabelInput').value;
    const alertBox = document.getElementById('modalAlertBox');

    if (!licenseId || !cafeId) {
      if (alertBox) {
        alertBox.textContent = 'Please select an active license.';
        alertBox.style.display = 'block';
      }
      return;
    }

    const btn = document.getElementById('btnSubmitPC');
    btn.disabled = true;
    btn.textContent = 'Allocating Slot & Code...';

    const res = await generateDeviceActivationCode({
      cafeId,
      licenseId,
      deviceLabel,
    });

    if (res.success) {
      const actData = res.data;
      modal.innerHTML = `
        <div class="admin-modal-card credential-card">
          <div class="modal-header">
            <h3 class="editorial-h3 text-accent">&check; PC Slot Authorized</h3>
            <button class="modal-close-btn" id="modalDoneCloseBtn">&times;</button>
          </div>
          <p class="text-muted text-sm">
            Enter this code into the Windows Print Agent on the target machine. Once activated, the machine registers its public key and binds to this seat.
          </p>

          <div class="cred-reveal-box">
            <div class="cred-row">
              <span class="cred-label font-mono">WORKSTATION LABEL</span>
              <strong class="cred-value">${escapeHtml(actData.device_label)}</strong>
            </div>

            <div class="cred-row">
              <span class="cred-label font-mono">SINGLE-USE ACTIVATION CODE</span>
              <div class="cred-copy-wrap">
                <code class="cred-value-code font-mono text-accent" style="font-size: 1.15rem;">${actData.activation_code}</code>
                <button type="button" class="btn btn-xs btn-secondary btn-copy-cred" data-copy="${actData.activation_code}">Copy</button>
              </div>
            </div>

            <div class="cred-row">
              <span class="cred-label font-mono">EXPIRATION</span>
              <span class="text-sm font-mono text-muted">Valid for 48 hours (Until ${new Date(actData.expires_at).toLocaleString()})</span>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-primary" id="btnDonePC">Done &bull; Refresh Devices</button>
          </div>
        </div>
      `;

      attachCopyHandlers(modal);
      document.getElementById('modalDoneCloseBtn')?.addEventListener('click', () => {
        closeModal();
        loadTabContent('devices');
      });
      document.getElementById('btnDonePC')?.addEventListener('click', () => {
        closeModal();
        loadTabContent('devices');
      });
    } else {
      if (alertBox) {
        alertBox.textContent = res.error || 'Failed to authorize PC slot.';
        alertBox.style.display = 'block';
      }
      btn.disabled = false;
      btn.textContent = 'Authorize PC Slot';
    }
  });
}

function attachCopyHandlers(parent) {
  parent.querySelectorAll('.btn-copy-cred').forEach(btn => {
    btn.addEventListener('click', async () => {
      const textToCopy = btn.getAttribute('data-copy');
      if (textToCopy) {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('btn-copied');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('btn-copied');
        }, 1500);
      }
    });
  });
}

function closeModal() {
  const modal = document.getElementById('adminModalContainer');
  if (modal) {
    modal.style.display = 'none';
    modal.innerHTML = '';
  }
}

/* --------------------------------------------------------------------------
   UTILITY HELPERS
   -------------------------------------------------------------------------- */
function getEventClass(eventType) {
  if (eventType.includes('failure') || eventType.includes('rejected') || eventType.includes('revoked')) {
    return 'audit-error';
  }
  if (eventType.includes('success') || eventType.includes('activated') || eventType.includes('created')) {
    return 'audit-success';
  }
  return 'audit-info';
}

function formatMetadata(meta) {
  if (!meta) return '{}';
  const clean = { ...meta };
  delete clean.password;
  delete clean.token;
  delete clean.secret;
  return JSON.stringify(clean).substring(0, 60);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
