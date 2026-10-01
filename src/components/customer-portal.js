/**
 * Customer Printing Portal Component for PressPoint (Step 5)
 * Dedicated mobile-first and desktop-responsive portal accessed via Cafe QR scan.
 * Strictly resolves Cafe by public QR identifier / slug, enforces server-side pricing,
 * validates active license status, and handles multi-file upload with print settings.
 * 
 * Mobile Flow:
 * CAFE IDENTIFICATION -> FILE UPLOAD -> CUSTOMER DETAILS -> PRINT SETTINGS -> 
 * PRICE CALCULATION -> ORDER PREVIEW -> SUBMIT PRINT ORDER -> ORDER CONFIRMATION
 */

import { resolveCafeByQr, submitCustomerPrintOrder, uploadCustomerPrintDocument } from '../lib/cafeadmin.js';

export async function renderCustomerPortal(routePath, container) {
  // Extract identifier from /c/:slug or /print/:qrId
  let identifier = '';
  if (routePath.startsWith('/c/')) {
    identifier = decodeURIComponent(routePath.replace('/c/', '').split('/')[0].split('?')[0]);
  } else if (routePath.startsWith('/print/')) {
    identifier = decodeURIComponent(routePath.replace('/print/', '').split('/')[0].split('?')[0]);
  }

  if (!identifier) {
    renderErrorState(container, 'Invalid QR code URL. No cyber cafe identifier was provided.');
    return;
  }

  // Render initial loading state
  container.innerHTML = `
    <div class="auth-page-wrapper customer-portal-theme">
      <div class="auth-card-editorial customer-portal-card text-center">
        <div class="admin-loading-state py-8">
          <span class="btn-spinner"></span>
          <p class="font-mono text-muted mt-4">Connecting to Cyber Cafe Counter...</p>
        </div>
      </div>
    </div>
  `;

  const res = await resolveCafeByQr(identifier);

  if (!res || !res.success || !res.cafe) {
    renderErrorState(container, res?.error || 'Cyber Cafe not found. Please scan an authentic counter QR code.');
    return;
  }

  const { cafe, can_print, status_message, pricing } = res;
  renderPortalMain(container, { cafe, can_print, status_message, pricing, identifier });
}

function renderErrorState(container, message) {
  container.innerHTML = `
    <div class="auth-page-wrapper customer-portal-theme">
      <div class="auth-card-editorial customer-portal-card text-center">
        <div class="access-denied-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <span class="pill-tag font-mono">COUNTER LOOKUP</span>
        <h1 class="editorial-h2">Cafe Not Recognized</h1>
        <p class="auth-subtext mt-2">${escapeHtml(message)}</p>
        <div class="auth-actions-group mt-6">
          <a href="/" class="btn btn-secondary w-full">Return to PressPoint Home</a>
        </div>
      </div>
    </div>
  `;
}

function renderPortalMain(container, { cafe, can_print, status_message, pricing, identifier }) {
  const bwSingle = pricing?.bw_single || 2.00;
  const bwDouble = pricing?.bw_double || 3.00;
  const colorSingle = pricing?.color_single || 10.00;
  const colorDouble = pricing?.color_double || 18.00;

  // State store for uploaded files & customer details
  // files: Array of { id, file, name, size, type, previewUrl, pages, copies, color_mode, duplex, orientation, page_range }
  let uploadedFiles = [];
  let isPreviewMode = false;
  let isSubmitting = false;

  function renderView() {
    container.innerHTML = `
      <div class="auth-page-wrapper customer-portal-theme">
        <div class="customer-portal-container">
          <!-- 1. Cafe Counter Header Banner -->
          <header class="customer-cafe-header">
            <div class="cafe-header-left">
              <span class="pill-tag font-mono">VERIFIED COUNTER</span>
              <h1 class="customer-cafe-title">${escapeHtml(cafe.name)}</h1>
              <p class="customer-cafe-meta font-mono">
                ${cafe.address ? `<span>📍 ${escapeHtml(cafe.address)}</span> &bull; ` : ''}
                ${cafe.contact_phone ? `<span>📞 ${escapeHtml(cafe.contact_phone)}</span>` : ''}
              </p>
            </div>
            <div class="cafe-header-right">
              <span class="status-pill ${can_print ? 'pill-active' : 'pill-revoked'}">
                <span class="pill-dot"></span>
                <span>${can_print ? 'READY FOR PRINTING' : 'PRINTING SUSPENDED'}</span>
              </span>
            </div>
          </header>

          ${!can_print ? `
            <div class="alert-box alert-error mt-4">
              <p><strong>Notice:</strong> ${escapeHtml(status_message || 'This Cafe cannot accept new print jobs at this time. Its license may be expired or suspended.')}</p>
            </div>
          ` : ''}

          <!-- Rates Pill Strip -->
          <div class="portal-rates-strip mt-4">
            <div class="rate-pill-item">
              <span class="rate-pill-lbl font-mono">B/W SINGLE</span>
              <span class="rate-pill-val font-mono">₹${bwSingle.toFixed(2)}</span>
            </div>
            <div class="rate-pill-item">
              <span class="rate-pill-lbl font-mono">B/W DUPLEX</span>
              <span class="rate-pill-val font-mono">₹${bwDouble.toFixed(2)}</span>
            </div>
            <div class="rate-pill-item">
              <span class="rate-pill-lbl font-mono">COLOUR SINGLE</span>
              <span class="rate-pill-val font-mono">₹${colorSingle.toFixed(2)}</span>
            </div>
            <div class="rate-pill-item">
              <span class="rate-pill-lbl font-mono">COLOUR DUPLEX</span>
              <span class="rate-pill-val font-mono">₹${colorDouble.toFixed(2)}</span>
            </div>
          </div>

          <!-- Alert Notification Box -->
          <div id="portalAlertBox" class="alert-box alert-error mt-4" style="display: none;"></div>

          ${isPreviewMode ? renderPreviewSection() : renderInputSection()}

          <!-- Security & Privacy Footnote -->
          <footer class="portal-footer text-center mt-6">
            <p class="text-xs text-muted font-mono">
              PressPoint Secure Digital Counter &bull; Zero Public Exposure &bull; Pay at Counter
            </p>
          </footer>
        </div>
      </div>
    `;

    attachEventHandlers();
  }

  // Section A: Form & File Upload Mode
  function renderInputSection() {
    return `
      <div class="customer-order-card mt-6">
        <form id="customerOrderForm" novalidate>
          <!-- STEP 1: Multi-File Upload -->
          <div class="order-section">
            <div class="order-section-title">
              <span class="step-num font-mono">01</span>
              <div>
                <h3>Upload Printable Documents</h3>
                <p class="text-xs text-muted">Supports PDF and JPG/JPEG/PNG images up to 25MB each.</p>
              </div>
            </div>

            <!-- Drag & Drop / File Input Zone -->
            <div class="file-upload-dropzone" id="fileDropzone">
              <input type="file" id="orderFileInput" class="file-hidden-input" accept=".pdf,.jpg,.jpeg,.png" multiple />
              <div class="dropzone-content">
                <div class="dropzone-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:32px;height:32px;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </div>
                <strong class="dropzone-label">Tap or drag files to upload</strong>
                <span class="dropzone-hint font-mono">Select one or multiple documents</span>
              </div>
            </div>

            <!-- Uploaded Files List -->
            <div class="uploaded-files-list mt-4" id="uploadedFilesList">
              ${uploadedFiles.length === 0 ? `
                <div class="empty-files-placeholder">
                  <p class="text-muted text-sm text-center py-2 font-mono">No files uploaded yet. Select at least 1 document to proceed.</p>
                </div>
              ` : uploadedFiles.map((f, idx) => `
                <div class="file-item-card" data-file-id="${f.id}">
                  <div class="file-item-left">
                    <div class="file-icon-box ${f.type.includes('pdf') ? 'pdf' : 'img'}">
                      ${f.type.includes('pdf') ? `
                        <span class="font-mono text-xs font-bold">PDF</span>
                      ` : f.previewUrl ? `
                        <img src="${f.previewUrl}" alt="Preview" class="file-thumb-mini" />
                      ` : `
                        <span class="font-mono text-xs font-bold">IMG</span>
                      `}
                    </div>
                    <div class="file-meta-col">
                      <strong class="file-name-text">${escapeHtml(f.name)}</strong>
                      <span class="file-size-text font-mono">${formatFileSize(f.size)} &bull; ${f.pages} pg${f.pages > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div class="file-item-right" style="display:flex;gap:8px;align-items:center;">
                    <button type="button" class="btn btn-sm btn-secondary preview-doc-btn" data-file-id="${f.id}" title="Preview Document">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Preview
                    </button>
                    <button type="button" class="btn btn-sm btn-ghost text-danger remove-file-btn" data-file-id="${f.id}" title="Remove file">
                      &times;
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>

            ${uploadedFiles.length > 0 ? `
              <div class="add-more-wrap mt-3 text-right">
                <button type="button" class="btn btn-sm btn-secondary" id="addMoreFilesBtn">
                  + Add Another Document
                </button>
              </div>
            ` : ''}
          </div>

          <!-- STEP 2: Customer Details -->
          <div class="order-section mt-6">
            <div class="order-section-title">
              <span class="step-num font-mono">02</span>
              <div>
                <h3>Customer Details</h3>
                <p class="text-xs text-muted">To identify your documents at the counter.</p>
              </div>
            </div>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="custNameInput" class="form-label">Your Name <span class="text-danger">*</span></label>
                <input type="text" id="custNameInput" class="form-input" placeholder="e.g. Rahul Sharma" required />
              </div>
              <div class="form-group">
                <label for="custPhoneInput" class="form-label">Phone Number <span class="text-muted">(Optional)</span></label>
                <input type="tel" id="custPhoneInput" class="form-input" placeholder="+91 98765 43210" />
              </div>
            </div>
          </div>

          <!-- STEP 3: Print Settings -->
          <div class="order-section mt-6">
            <div class="order-section-title">
              <span class="step-num font-mono">03</span>
              <div>
                <h3>Print Configuration</h3>
                <p class="text-xs text-muted">Applied to all documents in this order.</p>
              </div>
            </div>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="orderCopiesInput" class="form-label">Number of Copies</label>
                <input type="number" id="orderCopiesInput" class="form-input" min="1" max="50" value="1" required />
              </div>
              <div class="form-group">
                <label for="orderOrientationInput" class="form-label">Orientation</label>
                <select id="orderOrientationInput" class="form-input">
                  <option value="portrait" selected>Portrait (Standard)</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
            </div>

            <!-- Color Mode Selection -->
            <div class="form-group mt-4">
              <label class="form-label">Color Output</label>
              <div class="radio-options-grid">
                <label class="radio-card-option">
                  <input type="radio" name="colorMode" value="bw" checked />
                  <div class="radio-card-content">
                    <strong>Black & White</strong>
                    <span class="font-mono text-xs text-muted">Single: ₹${bwSingle.toFixed(2)} | Duplex: ₹${bwDouble.toFixed(2)}</span>
                  </div>
                </label>
                <label class="radio-card-option">
                  <input type="radio" name="colorMode" value="color" />
                  <div class="radio-card-content">
                    <strong>Full Colour</strong>
                    <span class="font-mono text-xs text-accent">Single: ₹${colorSingle.toFixed(2)} | Duplex: ₹${colorDouble.toFixed(2)}</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- Duplex Selection -->
            <div class="form-group mt-4">
              <label class="form-label">Sides</label>
              <div class="radio-options-grid">
                <label class="radio-card-option">
                  <input type="radio" name="duplex" value="single" checked />
                  <div class="radio-card-content">
                    <strong>Single-Sided</strong>
                    <span class="font-mono text-xs text-muted">Front only</span>
                  </div>
                </label>
                <label class="radio-card-option">
                  <input type="radio" name="duplex" value="double" />
                  <div class="radio-card-content">
                    <strong>Double-Sided (Duplex)</strong>
                    <span class="font-mono text-xs text-muted">Back-to-back</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- Page Selection -->
            <div class="form-group mt-4">
              <label for="pageRangeInput" class="form-label">Page Selection</label>
              <input type="text" id="pageRangeInput" class="form-input" placeholder="all (or specify: e.g. 1-3, 5)" value="all" />
              <span class="field-hint">Leave as 'all' to print entire documents.</span>
            </div>
          </div>

          <!-- STEP 4: Live Price Calculation Box -->
          <div class="order-summary-box mt-6">
            <div class="summary-row">
              <span class="text-muted">Total Documents:</span>
              <span class="font-mono font-bold" id="totalDocsDisplay">${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="summary-row mt-1">
              <span class="text-muted">Applicable Rate:</span>
              <span class="font-mono" id="rateDisplay">₹${bwSingle.toFixed(2)} / page</span>
            </div>
            <div class="summary-total-row mt-2">
              <div>
                <span class="summary-total-lbl font-mono">ESTIMATED TOTAL</span>
                <p class="text-xs text-muted">Pay at counter upon collection</p>
              </div>
              <div class="summary-total-price font-mono" id="estimatedTotalDisplay">₹0.00</div>
            </div>
          </div>

          <!-- Continue to Preview Action -->
          <div class="order-submit-wrap mt-6">
            <button 
              type="button" 
              class="btn btn-primary btn-xl w-full" 
              id="continueToPreviewBtn" 
              ${!can_print || uploadedFiles.length === 0 ? 'disabled' : ''}
            >
              Review Order Details &rarr;
            </button>
          </div>
        </form>
      </div>
    `;
  }

  // Section B: Order Preview Mode (Review before final submission)
  function renderPreviewSection() {
    const custName = document.getElementById('custNameInput')?.value || 'Guest';
    const custPhone = document.getElementById('custPhoneInput')?.value || '';
    const colorMode = container.querySelector('input[name="colorMode"]:checked')?.value || 'bw';
    const duplex = container.querySelector('input[name="duplex"]:checked')?.value || 'single';
    const copies = parseInt(document.getElementById('orderCopiesInput')?.value || '1', 10);
    const orientation = document.getElementById('orderOrientationInput')?.value || 'portrait';
    const pageRange = document.getElementById('pageRangeInput')?.value || 'all';

    const calculatedTotal = calculateGrandTotal({ copies, colorMode, duplex });

    return `
      <div class="customer-order-card mt-6">
        <div class="preview-header-row">
          <div>
            <span class="pill-tag font-mono">ORDER PREVIEW</span>
            <h2 class="editorial-h2">Review Your Print Order</h2>
            <p class="auth-subtext">Confirm your documents and print specifications before transmitting to the counter.</p>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" id="backToEditBtn">&larr; Edit Order</button>
        </div>

        <!-- Cafe & Customer Details Preview -->
        <div class="preview-details-grid mt-6">
          <div class="preview-detail-cell">
            <span class="preview-lbl font-mono">TARGET CAFE</span>
            <strong>${escapeHtml(cafe.name)}</strong>
          </div>
          <div class="preview-detail-cell">
            <span class="preview-lbl font-mono">CUSTOMER NAME</span>
            <strong>${escapeHtml(custName)}</strong>
          </div>
          <div class="preview-detail-cell">
            <span class="preview-lbl font-mono">CONTACT PHONE</span>
            <span class="font-mono">${custPhone ? escapeHtml(custPhone) : 'Not Provided'}</span>
          </div>
          <div class="preview-detail-cell">
            <span class="preview-lbl font-mono">PAYMENT STATUS</span>
            <span class="badge badge-staff font-mono text-warning">UNPAID / PENDING (COUNTER)</span>
          </div>
        </div>

        <!-- Files & Print Specs Breakdown -->
        <div class="preview-files-breakdown mt-6">
          <h3 class="font-mono text-xs text-muted mb-3">DOCUMENTS IN THIS ORDER (${uploadedFiles.length}):</h3>
          <div class="preview-files-list">
            ${uploadedFiles.map((f, i) => {
              const fileRate = (colorMode === 'color') 
                ? (duplex === 'double' ? colorDouble : colorSingle)
                : (duplex === 'double' ? bwDouble : bwSingle);
              const fileSubtotal = (f.pages * copies * fileRate).toFixed(2);
              return `
                <div class="preview-file-row">
                  <div class="preview-file-info">
                    <span class="font-mono text-xs text-accent">#${i + 1}</span>
                    <strong>${escapeHtml(f.name)}</strong>
                    <div class="preview-file-tags font-mono text-xs text-muted mt-1">
                      <span>${f.pages} pg${f.pages > 1 ? 's' : ''}</span> &bull; 
                      <span>${copies} cop${copies > 1 ? 'ies' : 'y'}</span> &bull; 
                      <span>${colorMode.toUpperCase()}</span> &bull; 
                      <span>${duplex.toUpperCase()}</span> &bull; 
                      <span>${orientation.toUpperCase()}</span>
                      ${pageRange !== 'all' ? ` &bull; <span>PAGES: ${escapeHtml(pageRange)}</span>` : ''}
                    </div>
                  </div>
                  <div class="preview-file-price font-mono font-bold">
                    ₹${fileSubtotal}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Total Bill Box -->
        <div class="order-summary-box mt-6">
          <div class="summary-total-row">
            <div>
              <span class="summary-total-lbl font-mono">FINAL AMOUNT DUE</span>
              <p class="text-xs text-muted">Authoritative server-side calculation</p>
            </div>
            <div class="summary-total-price font-mono">₹${calculatedTotal.toFixed(2)}</div>
          </div>
        </div>

        <!-- Submission Actions -->
        <div class="order-submit-wrap mt-6">
          <button 
            type="button" 
            class="btn btn-primary btn-xl w-full" 
            id="finalSubmitOrderBtn"
            ${!can_print || isSubmitting ? 'disabled' : ''}
          >
            <span class="btn-spinner" id="finalSubmitSpinner" style="display: none;"></span>
            <span id="finalSubmitBtnLabel">Transmit Order to Cafe Counter</span>
          </button>
          <button type="button" class="btn btn-ghost w-full mt-2" id="cancelPreviewBtn">
            Cancel & Return to Edit
          </button>
        </div>
      </div>
    `;
  }

  // Section C: Confirmation Screen
  function renderOrderSuccess(orderData) {
    container.innerHTML = `
      <div class="auth-page-wrapper customer-portal-theme">
        <div class="customer-portal-container">
          <div class="order-receipt-card text-center">
            <div class="receipt-success-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:36px;height:36px;color:#10b981;">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <span class="pill-tag font-mono">ORDER TRANSMITTED SUCCESSFULLY</span>
            <h1 class="receipt-title">Ready for Printing!</h1>
            <p class="auth-subtext mt-1">Your print order was safely sent to <strong>${escapeHtml(cafe.name)}</strong>.</p>

            <!-- Order Token Box -->
            <div class="receipt-token-box mt-6">
              <span class="token-lbl font-mono">ORDER NUMBER</span>
              <div class="job-number-display font-mono">${escapeHtml(orderData.order_number || orderData.job_number)}</div>
              <span class="text-xs text-muted font-mono mt-1">INTERNAL JOB ID: ${escapeHtml(orderData.job_number)}</span>
            </div>

            <!-- Specs Summary -->
            <div class="receipt-specs-grid mt-6">
              <div class="spec-cell">
                <span class="spec-lbl font-mono">TOTAL DUE AT COUNTER</span>
                <strong class="font-mono text-accent">₹${orderData.total_price}</strong>
              </div>
              <div class="spec-cell">
                <span class="spec-lbl font-mono">PAYMENT STATUS</span>
                <strong class="font-mono text-warning">UNPAID / PENDING</strong>
              </div>
              <div class="spec-cell">
                <span class="spec-lbl font-mono">TOTAL DOCUMENTS</span>
                <strong class="font-mono">${orderData.files_count || 1} File(s)</strong>
              </div>
            </div>

            <!-- Actionable Instruction -->
            <div class="receipt-instructions mt-6">
              <div class="alert-box alert-secondary">
                <p class="text-sm font-semibold text-center">
                  👉 Please proceed to the Cafe counter at <strong>${escapeHtml(cafe.name)}</strong>. Present Order Number <strong>${escapeHtml(orderData.order_number || orderData.job_number)}</strong> to the operator to pay ₹${orderData.total_price} and collect your prints.
                </p>
              </div>
            </div>

            <div class="receipt-actions mt-6">
              <button class="btn btn-secondary w-full" id="newOrderBtn">Submit Another Print Job</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('newOrderBtn')?.addEventListener('click', () => {
      uploadedFiles = [];
      isPreviewMode = false;
      isSubmitting = false;
      renderView();
    });
  }

  function calculateGrandTotal({ copies = 1, colorMode = 'bw', duplex = 'single' }) {
    if (uploadedFiles.length === 0) return 0;
    let total = 0;
    const rate = (colorMode === 'color') 
      ? (duplex === 'double' ? colorDouble : colorSingle)
      : (duplex === 'double' ? bwDouble : bwSingle);

    for (const f of uploadedFiles) {
      total += (f.pages * copies * rate);
    }
    return total;
  }

  function updatePriceDisplay() {
    const copies = Math.max(1, parseInt(document.getElementById('orderCopiesInput')?.value || '1', 10));
    const colorMode = container.querySelector('input[name="colorMode"]:checked')?.value || 'bw';
    const duplex = container.querySelector('input[name="duplex"]:checked')?.value || 'single';

    const rate = (colorMode === 'color') 
      ? (duplex === 'double' ? colorDouble : colorSingle)
      : (duplex === 'double' ? bwDouble : bwSingle);

    const rateDisplay = document.getElementById('rateDisplay');
    const totalDisplay = document.getElementById('estimatedTotalDisplay');
    const totalDocsDisplay = document.getElementById('totalDocsDisplay');
    const continueBtn = document.getElementById('continueToPreviewBtn');

    const total = calculateGrandTotal({ copies, colorMode, duplex });

    if (rateDisplay) rateDisplay.textContent = `₹${rate.toFixed(2)} / ${duplex === 'double' ? 'sheet' : 'page'}`;
    if (totalDisplay) totalDisplay.textContent = `₹${total.toFixed(2)}`;
    if (totalDocsDisplay) totalDocsDisplay.textContent = `${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}`;
    if (continueBtn) {
      continueBtn.disabled = !can_print || uploadedFiles.length === 0;
    }
  }

  function showAlert(msg) {
    const alertBox = document.getElementById('portalAlertBox');
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.style.display = 'block';
      alertBox.scrollIntoView({ behavior: 'smooth' });
    } else {
      alert(msg);
    }
  }

  function hideAlert() {
    const alertBox = document.getElementById('portalAlertBox');
    if (alertBox) alertBox.style.display = 'none';
  }

  function attachEventHandlers() {
    if (isPreviewMode) {
      // Handlers for Order Preview screen
      document.getElementById('backToEditBtn')?.addEventListener('click', () => {
        isPreviewMode = false;
        renderView();
      });
      document.getElementById('cancelPreviewBtn')?.addEventListener('click', () => {
        isPreviewMode = false;
        renderView();
      });

      // Final Submit Button (Idempotent, duplicate protection)
      document.getElementById('finalSubmitOrderBtn')?.addEventListener('click', handleFinalSubmit);
      return;
    }

    // Handlers for Form / Upload Screen
    const fileInput = document.getElementById('orderFileInput');
    const fileDropzone = document.getElementById('fileDropzone');
    const addMoreBtn = document.getElementById('addMoreFilesBtn');

    fileDropzone?.addEventListener('click', () => {
      fileInput.click();
    });

    addMoreBtn?.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput?.addEventListener('change', handleFileSelection);

    // Remove file button handlers
    container.querySelectorAll('.remove-file-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fId = btn.getAttribute('data-file-id');
        const target = uploadedFiles.find(f => f.id === fId);
        if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
        uploadedFiles = uploadedFiles.filter(f => f.id !== fId);
        renderView();
      });
    });

    // Preview document button handlers (Customer-side document preview)
    container.querySelectorAll('.preview-doc-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fId = btn.getAttribute('data-file-id');
        const fileItem = uploadedFiles.find(f => f.id === fId);
        if (fileItem) openCustomerPreviewModal(fileItem);
      });
    });

    // Dynamic price recalculation listeners
    const copiesInput = document.getElementById('orderCopiesInput');
    const colorRadios = container.querySelectorAll('input[name="colorMode"]');
    const duplexRadios = container.querySelectorAll('input[name="duplex"]');

    copiesInput?.addEventListener('input', updatePriceDisplay);
    colorRadios.forEach(r => r.addEventListener('change', updatePriceDisplay));
    duplexRadios.forEach(r => r.addEventListener('change', updatePriceDisplay));

    // Continue to Preview button
    document.getElementById('continueToPreviewBtn')?.addEventListener('click', () => {
      hideAlert();
      if (uploadedFiles.length === 0) {
        showAlert('Please upload at least one printable document (PDF or Image).');
        return;
      }
      const nameInput = document.getElementById('custNameInput');
      if (nameInput && !nameInput.value.trim()) {
        showAlert('Please enter your name so the counter operator can identify your order.');
        nameInput.focus();
        return;
      }
      isPreviewMode = true;
      renderView();
    });
  }

  async function handleFileSelection(e) {
    hideAlert();
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    const maxSizeBytes = 26214400; // 25 MB

    let errorOccurred = false;

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !allowedExtensions.includes(ext)) {
        showAlert(`File "${file.name}" is not supported. Please upload only PDF, JPG, or PNG files.`);
        errorOccurred = true;
        continue;
      }

      if (file.size > maxSizeBytes) {
        showAlert(`File "${file.name}" exceeds the 25MB limit. Please upload a smaller file.`);
        errorOccurred = true;
        continue;
      }

      // Safe local preview blob URL (zero server roundtrip)
      const previewUrl = URL.createObjectURL(file);
      let detectedPages = 1;

      if (ext === 'pdf') {
        try {
          const buf = await file.arrayBuffer();
          const text = new TextDecoder('latin1').decode(buf);
          const pageMatches = text.match(/\/Type\s*\/Page\b/g);
          if (pageMatches && pageMatches.length > 0) {
            detectedPages = Math.min(1000, Math.max(1, pageMatches.length));
          }
        } catch (err) {
          detectedPages = 1;
        }
      }

      uploadedFiles.push({
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
        previewUrl,
        pages: detectedPages
      });
    }

    // Reset input value so same file can be re-selected if removed
    e.target.value = '';

    if (!errorOccurred) {
      renderView();
    }
  }

  function openCustomerPreviewModal(fileItem) {
    const modalId = 'customerPreviewModal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    const isPdf = fileItem.type.includes('pdf') || fileItem.name.toLowerCase().endsWith('.pdf');
    let zoomLevel = 100;

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-modal-backdrop';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="admin-modal-card preview-modal-card">
        <div class="modal-header">
          <div>
            <span class="pill-tag font-mono">${isPdf ? 'PDF DOCUMENT' : 'IMAGE'}</span>
            <h2 class="editorial-h2" style="font-size:1.15rem;margin-top:4px;">${escapeHtml(fileItem.name)}</h2>
            <span class="text-xs text-muted font-mono">${formatFileSize(fileItem.size)} &bull; ${fileItem.pages} page${fileItem.pages > 1 ? 's' : ''}</span>
          </div>
          <button class="btn btn-sm btn-ghost close-preview-modal-btn" aria-label="Close Preview">&times;</button>
        </div>

        <div class="modal-body preview-modal-body">
          <div class="preview-zoom-bar">
            <button class="btn btn-sm btn-ghost" id="custZoomOutBtn" title="Zoom Out">&minus;</button>
            <span class="font-mono text-xs" id="custZoomVal">100%</span>
            <button class="btn btn-sm btn-ghost" id="custZoomInBtn" title="Zoom In">&plus;</button>
            <button class="btn btn-sm btn-ghost" id="custZoomFitBtn">Fit</button>
          </div>

          <div class="preview-stage-container" id="custPreviewStage">
            ${isPdf ? `
              <iframe 
                src="${fileItem.previewUrl}#toolbar=1" 
                class="pdf-preview-frame" 
                title="Customer Document Preview"
                onerror="this.parentElement.innerHTML='<div class=\\'alert-box alert-warning\\'>Preview unavailable for this file.</div>'"
              ></iframe>
            ` : `
              <div class="image-preview-wrapper" id="custImgWrap">
                <img src="${fileItem.previewUrl}" alt="Customer Document" id="custPreviewImg" />
              </div>
            `}
          </div>
        </div>

        <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
          <span class="text-xs text-muted font-mono">🔒 Local preview only &bull; Zero server exposure</span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary close-preview-modal-btn">Close</button>
            <button class="btn btn-primary" id="custConfirmDocBtn">
              &check; Confirm: This is the correct document
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelectorAll('.close-preview-modal-btn').forEach(b => b.addEventListener('click', closeModal));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.getElementById('custConfirmDocBtn')?.addEventListener('click', () => {
      closeModal();
      showAlert('Document confirmed! Ready for print settings.');
    });

    // Zoom handlers
    const updateZoom = (z) => {
      zoomLevel = Math.max(50, Math.min(250, z));
      document.getElementById('custZoomVal').textContent = `${zoomLevel}%`;
      const stage = document.getElementById('custPreviewStage');
      const img = document.getElementById('custPreviewImg');
      if (img) {
        img.style.transform = `scale(${zoomLevel / 100})`;
        img.style.transformOrigin = 'center top';
      } else if (stage) {
        stage.style.zoom = `${zoomLevel}%`;
      }
    };

    document.getElementById('custZoomInBtn')?.addEventListener('click', () => updateZoom(zoomLevel + 25));
    document.getElementById('custZoomOutBtn')?.addEventListener('click', () => updateZoom(zoomLevel - 25));
    document.getElementById('custZoomFitBtn')?.addEventListener('click', () => updateZoom(100));
  }

  async function handleFinalSubmit() {
    if (isSubmitting || !can_print) return;

    const submitBtn = document.getElementById('finalSubmitOrderBtn');
    const spinner = document.getElementById('finalSubmitSpinner');
    const label = document.getElementById('finalSubmitBtnLabel');

    isSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (label) label.textContent = 'Transmitting Order...';

    try {
      const custName = document.getElementById('custNameInput')?.value?.trim() || 'Guest Customer';
      const custPhone = document.getElementById('custPhoneInput')?.value?.trim() || null;
      const copies = Math.max(1, parseInt(document.getElementById('orderCopiesInput')?.value || '1', 10));
      const orientation = document.getElementById('orderOrientationInput')?.value || 'portrait';
      const colorMode = container.querySelector('input[name="colorMode"]:checked')?.value || 'bw';
      const duplex = container.querySelector('input[name="duplex"]:checked')?.value || 'single';
      const pageRange = document.getElementById('pageRangeInput')?.value?.trim() || 'all';

      // 1. Upload files to private storage bucket 'print-documents'
      const preparedFilesMeta = [];

      for (const item of uploadedFiles) {
        // Upload each file
        const upRes = await uploadCustomerPrintDocument(item.file, cafe.id || identifier);
        preparedFilesMeta.push({
          name: item.name,
          size: item.size,
          type: item.type,
          pages: item.pages,
          copies,
          color_mode: colorMode,
          duplex,
          orientation,
          page_range: pageRange,
          storage_path: upRes.success ? upRes.filePath : null
        });
      }

      // 2. Submit order to backend RPC
      const orderPayload = {
        qrIdentifier: identifier,
        customerName: custName,
        customerPhone: custPhone,
        files: preparedFilesMeta,
        fileName: preparedFilesMeta[0]?.name || 'Customer_Document.pdf',
        pages: preparedFilesMeta[0]?.pages || 1,
        copies,
        colorMode,
        duplex,
        orientation,
        pageRange
      };

      const res = await submitCustomerPrintOrder(orderPayload);

      if (res && res.success) {
        renderOrderSuccess(res);
      } else {
        throw new Error(res?.error || 'Failed to submit order to cafe counter.');
      }
    } catch (err) {
      console.error('Order submission exception:', err);
      alert(err.message || 'An error occurred while submitting your order. Please try again.');
      isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (label) label.textContent = 'Transmit Order to Cafe Counter';
    }
  }

  // Initial render of portal view
  renderView();
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
