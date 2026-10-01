/**
 * PRESSPOINT — MODERN DIGITAL PRINTING FOR CYBER CAFES
 * Interactive Client Controller
 */

import { initRouter } from './lib/router.js';
import { onAuthStateChange, getCurrentSession, signOut } from './lib/auth.js';

document.addEventListener('DOMContentLoaded', () => {
  initThemeSystem();
  initScrollEffects();
  initMobileMenu();
  initHeroSimulation();
  initHowItWorksStepper();
  initTerminalQueueInteractions();
  initThemeShowcaseDeck();
  initPurgeSimulator();
  initModalsAndActions();
  initAccordion();
  initRouter();
  initAuthStateListener();
});


/* --------------------------------------------------------------------------
   1. INDEPENDENT THEME SYSTEM (LIGHT & DARK MODE)
   -------------------------------------------------------------------------- */
function initThemeSystem() {
  const html = document.documentElement;
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  
  // 1. Detect saved or system preference
  const savedTheme = localStorage.getItem('presspoint-theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
  setTheme(initialTheme);

  // 2. Nav toggle button listener
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = html.getAttribute('data-theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      setTheme(next);
      showToast(`Switched to ${next === 'dark' ? 'Obsidian Dark' : 'Paper Light'} mode`);
    });
  }

  // 3. Listen for OS theme changes if user hasn't overridden
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('presspoint-theme')) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });
}

function setTheme(theme) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  localStorage.setItem('presspoint-theme', theme);

  // Sync Section 14 showcase deck buttons if present
  const lightDeckBtn = document.getElementById('demoLightBtn');
  const darkDeckBtn = document.getElementById('demoDarkBtn');
  if (lightDeckBtn && darkDeckBtn) {
    if (theme === 'light') {
      lightDeckBtn.classList.add('active');
      darkDeckBtn.classList.remove('active');
    } else {
      darkDeckBtn.classList.add('active');
      lightDeckBtn.classList.remove('active');
    }
  }
}

/* --------------------------------------------------------------------------
   2. SCROLL PROGRESS & NAVBAR ELEVATION
   -------------------------------------------------------------------------- */
function initScrollEffects() {
  const progressBar = document.getElementById('scrollProgress');
  const navbar = document.getElementById('navbar');

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

    if (progressBar) {
      progressBar.style.width = `${scrollPct}%`;
    }

    if (navbar) {
      if (scrollTop > 20) {
        navbar.style.boxShadow = 'var(--shadow-md)';
      } else {
        navbar.style.boxShadow = 'none';
      }
    }
  }, { passive: true });
}

/* --------------------------------------------------------------------------
   3. MOBILE MENU DRAWER
   -------------------------------------------------------------------------- */
function initMobileMenu() {
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const mobileDrawer = document.getElementById('mobileDrawer');

  if (!mobileBtn || !mobileDrawer) return;

  mobileBtn.addEventListener('click', () => {
    const isExpanded = mobileBtn.getAttribute('aria-expanded') === 'true';
    mobileBtn.setAttribute('aria-expanded', !isExpanded);
    mobileDrawer.classList.toggle('open');
    mobileDrawer.setAttribute('aria-hidden', isExpanded);
  });

  // Close drawer when clicking any link
  const links = mobileDrawer.querySelectorAll('a, button');
  links.forEach(link => {
    link.addEventListener('click', () => {
      mobileDrawer.classList.remove('open');
      mobileBtn.setAttribute('aria-expanded', 'false');
      mobileDrawer.setAttribute('aria-hidden', 'true');
    });
  });
}

/* --------------------------------------------------------------------------
   4. HERO REALISTIC MULTI-DEVICE SIMULATION CYCLE
   -------------------------------------------------------------------------- */
function initHeroSimulation() {
  const runBtn = document.getElementById('runSimulationBtn');
  const phoneDocCard = document.getElementById('phoneDocCard');
  const scanLaser = document.getElementById('scanLaser');
  const streamPacket = document.getElementById('streamPacket');
  const heroOrderCard = document.getElementById('heroOrderCard');
  const heroPrintActionBtn = document.getElementById('heroPrintActionBtn');
  const heroPrintBtnLabel = document.getElementById('heroPrintBtnLabel');
  const heroPaperSheet = document.getElementById('heroPaperSheet');
  const printerLed = document.getElementById('printerLed');
  const liveClock = document.getElementById('liveTerminalClock');

  // Real-time clock update in terminal
  setInterval(() => {
    if (liveClock) {
      const now = new Date();
      liveClock.textContent = now.toTimeString().split(' ')[0];
    }
  }, 1000);

  let isSimulating = false;

  const runCycle = () => {
    if (isSimulating) return;
    isSimulating = true;
    showToast('Starting simulated customer-to-printer workflow...');

    // Phase 1: Phone transmission
    if (phoneDocCard) phoneDocCard.classList.add('pulse-transmitting');
    if (runBtn) runBtn.disabled = true;

    // Phase 2: QR Laser Scan
    setTimeout(() => {
      if (scanLaser) scanLaser.classList.add('scanning');
      if (streamPacket) streamPacket.classList.add('transmitting');
    }, 600);

    // Phase 3: Terminal Order Arrival & Chime
    setTimeout(() => {
      if (heroOrderCard) {
        heroOrderCard.style.borderColor = 'var(--text-accent)';
        heroOrderCard.style.boxShadow = '0 0 16px rgba(12, 102, 228, 0.4)';
      }
      if (heroPrintBtnLabel) heroPrintBtnLabel.textContent = 'Spooling to Printer...';
    }, 1800);

    // Phase 4: Printer activity & paper ejection
    setTimeout(() => {
      if (scanLaser) scanLaser.classList.remove('scanning');
      if (streamPacket) streamPacket.classList.remove('transmitting');
      if (printerLed) {
        printerLed.style.background = '#0C66E4';
        printerLed.style.boxShadow = '0 0 10px #0C66E4';
      }
      if (heroPaperSheet) heroPaperSheet.classList.add('ejecting');
    }, 2800);

    // Phase 5: Complete & Auto-Purge
    setTimeout(() => {
      if (phoneDocCard) phoneDocCard.classList.remove('pulse-transmitting');
      if (heroPaperSheet) heroPaperSheet.classList.remove('ejecting');
      if (printerLed) {
        printerLed.style.background = '#38D983';
        printerLed.style.boxShadow = '0 0 8px #38D983';
      }
      if (heroOrderCard) {
        heroOrderCard.style.borderColor = 'rgba(255, 255, 255, 0.09)';
        heroOrderCard.style.boxShadow = 'none';
      }
      if (heroPrintBtnLabel) heroPrintBtnLabel.textContent = 'Printed & Purged ✓';
      if (runBtn) runBtn.disabled = false;
      isSimulating = false;
      showToast('Document printed & RAM buffer automatically unlinked.');
    }, 5000);
  };

  if (runBtn) runBtn.addEventListener('click', runCycle);
  if (heroPrintActionBtn) heroPrintActionBtn.addEventListener('click', runCycle);
}

/* --------------------------------------------------------------------------
   5. HOW IT WORKS 4-STEP INTERACTIVE STEPPER
   -------------------------------------------------------------------------- */
function initHowItWorksStepper() {
  const tabButtons = document.querySelectorAll('.step-nav-btn');
  const stepViews = document.querySelectorAll('.step-view');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const stepNumber = btn.getAttribute('data-step');

      // Update button states
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Update views
      stepViews.forEach(view => {
        view.classList.remove('active');
      });
      const activeView = document.getElementById(`step-view-${stepNumber}`);
      if (activeView) activeView.classList.add('active');
    });
  });
}

/* --------------------------------------------------------------------------
   6. CAFE OPERATOR TERMINAL QUEUE INTERACTIONS
   -------------------------------------------------------------------------- */
function initTerminalQueueInteractions() {
  const filterTabs = document.querySelectorAll('.tool-tab');
  const rows = document.querySelectorAll('.job-row');
  const printButtons = document.querySelectorAll('.interactive-print-btn');
  const statActiveJobs = document.getElementById('statActiveJobs');

  // Filter tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.getAttribute('data-filter');
      rows.forEach(row => {
        if (filter === 'all') {
          row.style.display = '';
        } else if (filter === 'ready') {
          row.style.display = row.classList.contains('state-ready') ? '' : 'none';
        } else if (filter === 'printing') {
          row.style.display = row.classList.contains('state-printing') ? '' : 'none';
        } else if (filter === 'completed') {
          row.style.display = row.classList.contains('state-completed') ? '' : 'none';
        }
      });
    });
  });

  // Interactive Print document buttons
  printButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const ticketId = btn.getAttribute('data-id');
      const row = document.querySelector(`.job-row[data-id="${ticketId}"]`);
      if (!row) return;

      btn.disabled = true;
      btn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
          <circle cx="8" cy="8" r="6" stroke-dasharray="28" stroke-dashoffset="10"/>
        </svg>
        <span>Spooling...</span>
      `;

      const statusCell = row.querySelector('.job-live-status');
      if (statusCell) {
        statusCell.innerHTML = `
          <span class="pulse-dot blue"></span>
          <span class="status-txt">Printing to Canon iR...</span>
        `;
      }

      showToast(`Job #PP-${ticketId} dispatched to local printer queue.`);

      setTimeout(() => {
        row.classList.remove('state-ready');
        row.classList.add('state-completed');
        
        if (statusCell) {
          statusCell.innerHTML = `
            <span class="text-green font-semibold">&check; Done &bull; Memory Purged</span>
          `;
        }

        btn.className = 'btn btn-sm btn-ghost';
        btn.innerHTML = '<span>Archived ✓</span>';

        if (statActiveJobs) {
          const current = parseInt(statActiveJobs.textContent, 10);
          if (current > 0) statActiveJobs.textContent = current - 1;
        }

        showToast(`Job #PP-${ticketId} completed. Ephemeral buffer zero-filled.`);
      }, 2400);
    });
  });
}

/* --------------------------------------------------------------------------
   7. THEME SHOWCASE CONTROL DECK (SECTION 14)
   -------------------------------------------------------------------------- */
function initThemeShowcaseDeck() {
  const lightBtn = document.getElementById('demoLightBtn');
  const darkBtn = document.getElementById('demoDarkBtn');
  const previewFrame = document.getElementById('themePreviewFrame');

  if (!lightBtn || !darkBtn || !previewFrame) return;

  lightBtn.addEventListener('click', () => {
    setTheme('light');
    showToast('Applied Paper Light theme');
  });

  darkBtn.addEventListener('click', () => {
    setTheme('dark');
    showToast('Applied Obsidian Dark theme');
  });
}

/* --------------------------------------------------------------------------
   8. PRIVACY AUTO-PURGE & DOCUMENT SHREDDER SIMULATOR
   -------------------------------------------------------------------------- */
function initPurgeSimulator() {
  const triggerBtn = document.getElementById('triggerPurgeBtn');
  const shredDoc = document.getElementById('shredDoc');
  const shredBadge = document.getElementById('shredBadge');
  const auditLogBox = document.getElementById('auditLogBox');

  if (!triggerBtn || !shredDoc || !auditLogBox) return;

  let isPurged = false;

  triggerBtn.addEventListener('click', () => {
    if (!isPurged) {
      // Execute purge
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = '<span>Purging RAM...</span>';
      shredDoc.classList.add('shredding');
      if (shredBadge) {
        shredBadge.textContent = 'Unlinking Inode...';
        shredBadge.style.background = 'var(--status-amber-bg)';
        shredBadge.style.color = 'var(--status-amber)';
      }

      // Add log entries with slight delay
      setTimeout(() => {
        const log1 = document.createElement('div');
        log1.className = 'log-line text-accent';
        log1.textContent = `[${getCurrentTime()}] Cryptographic key unlinked from buffer 0x7FFE94.`;
        auditLogBox.appendChild(log1);
      }, 600);

      setTimeout(() => {
        shredDoc.classList.remove('shredding');
        shredDoc.classList.add('purged-zero');

        const log2 = document.createElement('div');
        log2.className = 'log-line text-green';
        log2.textContent = `[${getCurrentTime()}] ZERO-FILL COMPLETE: 0 bytes retained. Sanitization verified.`;
        auditLogBox.appendChild(log2);

        triggerBtn.disabled = false;
        triggerBtn.className = 'btn btn-sm btn-secondary';
        triggerBtn.innerHTML = '<span>Reset Test Asset</span>';
        isPurged = true;
        showToast('Document securely destroyed with cryptographic zero-fill.');
      }, 1400);

    } else {
      // Reset doc
      shredDoc.classList.remove('purged-zero');
      if (shredBadge) {
        shredBadge.textContent = 'In Memory Buffer';
        shredBadge.style.background = 'var(--status-blue-bg)';
        shredBadge.style.color = 'var(--status-blue)';
      }
      triggerBtn.className = 'btn btn-sm btn-outline-danger';
      triggerBtn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="2 4 4 4 14 4"/><path d="M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4"/><line x1="7" y1="7" x2="7" y2="11"/><line x1="9" y1="7" x2="9" y2="11"/></svg>
        <span>Trigger Auto-Purge Test</span>
      `;
      isPurged = false;
      showToast('New test document buffered in memory.');
    }
  });
}

function getCurrentTime() {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

/* --------------------------------------------------------------------------
   9. MODALS, TOASTS & ACTION HANDLERS
   -------------------------------------------------------------------------- */
function initModalsAndActions() {
  const loginModal = document.getElementById('loginModal');
  const openLoginBtn = document.getElementById('openLoginModalBtn');
  const mobileLoginBtn = document.getElementById('mobileLoginBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  const staffLoginForm = document.getElementById('staffLoginForm');

  const openModal = () => {
    if (loginModal) {
      loginModal.classList.add('open');
      loginModal.setAttribute('aria-hidden', 'false');
      const input = document.getElementById('cafeIdInput');
      if (input) input.focus();
    }
  };

  const closeModal = () => {
    if (loginModal) {
      loginModal.classList.remove('open');
      loginModal.setAttribute('aria-hidden', 'true');
    }
  };

  // Navigate directly to dedicated secure auth portal
  if (openLoginBtn) {
    openLoginBtn.addEventListener('click', () => {
      window.navigateTo('/login');
    });
  }
  if (mobileLoginBtn) {
    mobileLoginBtn.addEventListener('click', () => {
      window.navigateTo('/login');
    });
  }
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);

  // Close modal when clicking backdrop
  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) closeModal();
    });
  }

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && loginModal && loginModal.classList.contains('open')) {
      closeModal();
    }
  });

  // Submit login simulation
  if (staffLoginForm) {
    staffLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      closeModal();
      window.navigateTo('/login');
    });
  }

  // CTA Buttons
  const ctaRegisterBtn = document.getElementById('ctaRegisterBtn');
  const ctaContactBtn = document.getElementById('ctaContactBtn');
  if (ctaRegisterBtn) {
    ctaRegisterBtn.addEventListener('click', () => {
      showToast('Welcome! Your custom acrylic counter QR stand kit has been requested.');
    });
  }
  if (ctaContactBtn) {
    ctaContactBtn.addEventListener('click', () => {
      showToast('Support line available 24/7 for cafe operators: support@presspoint.local');
    });
  }

  // Footer links
  const policyLinks = document.querySelectorAll('.open-policy-link');
  policyLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const type = link.getAttribute('data-policy');
      showToast(`Opened ${type.toUpperCase()} specification: Zero permanent document retention.`);
    });
  });

  const footerContact = document.getElementById('footerContactLink');
  if (footerContact) {
    footerContact.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('PressPoint Cafe Operations Desk: +1 (800) 555-PRINT / help@presspoint.io');
    });
  }
}

/* --------------------------------------------------------------------------
   10. AUTH STATE SYNCHRONIZATION
   -------------------------------------------------------------------------- */
async function initAuthStateListener() {
  const openLoginBtn = document.getElementById('openLoginModalBtn');

  const updateNavAuthUI = (user, profile) => {
    if (user && profile) {
      if (openLoginBtn) {
        openLoginBtn.textContent = `${profile.role}: ${user.email.split('@')[0]}`;
        openLoginBtn.title = `Signed in as ${user.email} (${profile.role})`;
        openLoginBtn.onclick = () => {
          if (profile.role === 'super_admin') window.navigateTo('/admin/audit');
          else if (profile.role === 'cafe_admin') window.navigateTo('/cafe/settings');
          else window.navigateTo('/staff/terminal');
        };
      }
    } else {
      if (openLoginBtn) {
        openLoginBtn.textContent = 'Staff Sign In';
        openLoginBtn.title = 'Staff Sign In';
        openLoginBtn.onclick = () => window.navigateTo('/login');
      }
    }
  };

  // Initial check
  const { user, profile } = await getCurrentSession();
  updateNavAuthUI(user, profile);

  // Listen for real-time auth changes
  onAuthStateChange((event, session, userProfile) => {
    updateNavAuthUI(session?.user || null, userProfile);
  });
}


/* --------------------------------------------------------------------------
   10. OWNER SECTION ACCORDION
   -------------------------------------------------------------------------- */
function initAccordion() {
  const items = document.querySelectorAll('.owner-features-accordion .accordion-item');
  items.forEach(item => {
    item.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

/* --------------------------------------------------------------------------
   TOAST HELPER
   -------------------------------------------------------------------------- */
function showToast(message) {
  const shelf = document.getElementById('toastShelf');
  if (!shelf) return;

  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.innerHTML = `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; color: var(--status-green); flex-shrink: 0;">
      <polyline points="3 8 7 12 13 4"/>
    </svg>
    <span>${message}</span>
  `;

  shelf.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 300ms ease, transform 300ms ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
