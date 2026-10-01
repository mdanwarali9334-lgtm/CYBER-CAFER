/**
 * Cafe Admin Service Library for PressPoint
 * Handles Cafe Profile, Pricing Management, Staff Management,
 * Add PC Pairing Code generation, Device Management, and Print Job Telemetry.
 */

import { supabase } from './supabase.js';

/**
 * Fetch complete Cafe Admin Dashboard dataset
 * @param {string} cafeId
 */
export async function fetchCafeDashboardData(cafeId) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_get_dashboard_data', {
      p_cafe_id: cafeId
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Failed to load Cafe Admin dashboard data:', err);
    return { success: false, error: err.message || 'Failed to load dashboard data.' };
  }
}

/**
 * Update Cafe Profile information
 * @param {string} cafeId
 * @param {Object} profileData
 */
export async function updateCafeProfile(cafeId, { name, contact_email, contact_phone, address, slug }) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_update_profile', {
      p_cafe_id: cafeId,
      p_name: name,
      p_contact_email: contact_email,
      p_contact_phone: contact_phone,
      p_address: address,
      p_slug: slug
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Update Cafe Profile error:', err);
    return { success: false, error: err.message || 'Could not update Cafe profile.' };
  }
}

/**
 * Update Cafe Print Pricing Rates (Server-Side Enforced & Validated)
 * @param {string} cafeId
 * @param {Object} pricing
 */
export async function updateCafePricing(cafeId, { bw_single, bw_double, color_single, color_double }) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_update_pricing', {
      p_cafe_id: cafeId,
      p_bw_single: parseFloat(bw_single),
      p_bw_double: parseFloat(bw_double),
      p_color_single: parseFloat(color_single),
      p_color_double: parseFloat(color_double)
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Update Cafe Pricing error:', err);
    return { success: false, error: err.message || 'Could not save pricing configuration.' };
  }
}

/**
 * Add a new Staff Member to the Cafe
 * @param {string} cafeId
 * @param {Object} staffData
 */
export async function addCafeStaff(cafeId, { email, full_name, password }) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_add_staff', {
      p_cafe_id: cafeId,
      p_email: email,
      p_full_name: full_name,
      p_password: password
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Add Cafe Staff error:', err);
    return { success: false, error: err.message || 'Could not add staff member.' };
  }
}

/**
 * Update Staff Account Status (active, suspended, disabled)
 * @param {string} cafeId
 * @param {string} staffId
 * @param {string} status
 */
export async function updateStaffStatus(cafeId, staffId, status) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_update_staff_status', {
      p_cafe_id: cafeId,
      p_staff_id: staffId,
      p_status: status
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Update Staff Status error:', err);
    return { success: false, error: err.message || 'Could not update staff status.' };
  }
}

/**
 * Create a secure one-time 15-minute pairing code for Add PC flow
 * @param {string} cafeId
 * @param {string} deviceLabel
 */
export async function createDevicePairingCode(cafeId, deviceLabel = '') {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_create_pairing_code', {
      p_cafe_id: cafeId,
      p_device_label: deviceLabel
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Create Device Pairing Code error:', err);
    return { success: false, error: err.message || 'Could not generate pairing code.' };
  }
}

/**
 * Select the default printer for an authorized device
 * @param {string} deviceId
 * @param {string} printerName
 */
export async function selectDevicePrinter(deviceId, printerName) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_select_printer', {
      p_device_id: deviceId,
      p_printer_name: printerName
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Select Device Printer error:', err);
    return { success: false, error: err.message || 'Could not update default printer.' };
  }
}

/**
 * Revoke device authorization
 * @param {string} deviceId
 */
export async function revokeDevice(deviceId) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_revoke_device', {
      p_device_id: deviceId
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Revoke Device error:', err);
    return { success: false, error: err.message || 'Could not revoke device.' };
  }
}

/**
 * Create a test print job to verify print agent spooling
 * @param {string} cafeId
 * @param {Object} jobData
 */
export async function createTestPrintJob(cafeId, { fileName = 'Test_Document.pdf', colorMode = 'bw', pages = 1 } = {}) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_create_test_print_job', {
      p_cafe_id: cafeId,
      p_file_name: fileName,
      p_color_mode: colorMode,
      p_pages: pages
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Create Test Print Job error:', err);
    return { success: false, error: err.message || 'Could not queue test print job.' };
  }
}

/**
 * Resolve cafe metadata, pricing, and license print capability by public QR identifier or slug
 * @param {string} qrIdentifier
 */
export async function resolveCafeByQr(qrIdentifier) {
  try {
    const { data, error } = await supabase.rpc('resolve_cafe_by_qr', {
      p_qr_identifier: qrIdentifier
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Resolve Cafe by QR error:', err);
    return { success: false, error: err.message || 'Failed to resolve Cafe from QR.' };
  }
}

/**
 * Upload a printable file securely to private storage bucket 'print-documents'
 * @param {File} file
 * @param {string} cafeIdOrIdentifier
 */
export async function uploadCustomerPrintDocument(file, cafeIdOrIdentifier = 'temp') {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const safeExt = ['pdf', 'jpg', 'jpeg', 'png'].includes(ext) ? ext : 'pdf';
    const randomKey = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${safeExt}`;
    const filePath = `uploads/${cafeIdOrIdentifier}/${randomKey}`;

    const { data, error } = await supabase.storage
      .from('print-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('[Upload] Storage upload failed:', error.message, '| File:', file.name, '| Path:', filePath);
      throw error;
    }
    console.log('[Upload] File uploaded successfully to private bucket:', data.path);
    return { success: true, filePath: data.path, fileName: file.name, fileSize: file.size, fileType: file.type };
  } catch (err) {
    console.error('[Upload] uploadCustomerPrintDocument exception:', err.message, '| File:', file.name);
    return { success: false, error: err.message || 'Failed to upload document.' };
  }
}


/**
 * Submit a customer print order using Cafe QR identifier with server-side pricing
 * Supports multiple files, customer details, print settings, and server calculation
 * @param {Object} orderData
 */
export async function submitCustomerPrintOrder({
  qrIdentifier,
  customerName = 'Guest',
  customerPhone = null,
  files = [],
  fileName = 'Customer_Document.pdf',
  pages = 1,
  copies = 1,
  colorMode = 'bw',
  duplex = 'single',
  orientation = 'portrait',
  pageRange = 'all'
}) {
  try {
    const { data, error } = await supabase.rpc('submit_customer_print_order', {
      p_qr_identifier: qrIdentifier,
      p_file_name: fileName,
      p_pages: parseInt(pages, 10) || 1,
      p_copies: parseInt(copies, 10) || 1,
      p_color_mode: colorMode,
      p_duplex: duplex,
      p_customer_name: customerName,
      p_customer_phone: customerPhone || null,
      p_files: Array.isArray(files) && files.length > 0 ? files : [],
      p_orientation: orientation,
      p_page_range: pageRange
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Submit customer print order error:', err);
    return { success: false, error: err.message || 'Failed to submit print order.' };
  }
}

/**
 * Manage Print Job (send to print, update payment, complete, cancel)
 * @param {string} cafeId
 * @param {string} jobId
 * @param {string} action
 * @param {Object} options
 */
export async function manageCafeJob(cafeId, jobId, action, { paymentStatus = null, deviceId = null } = {}) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_manage_job', {
      p_cafe_id: cafeId,
      p_job_id: jobId,
      p_action: action,
      p_payment_status: paymentStatus,
      p_device_id: deviceId
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error(`Manage Job (${action}) error:`, err);
    return { success: false, error: err.message || 'Operation failed.' };
  }
}

/**
 * Generate a short-lived (5 min) secure signed URL for document preview
 * @param {string} storagePath
 */
export async function fetchJobSignedPreviewUrl(storagePath) {
  try {
    if (!storagePath || storagePath === '[PURGED]' || storagePath.startsWith('spool://')) {
      return { success: false, error: 'Document is not available for preview.' };
    }

    const cleanPath = storagePath.replace(/^print-documents\//, '');
    const { data, error } = await supabase.storage
      .from('print-documents')
      .createSignedUrl(cleanPath, 300); // 5 minutes

    if (error) throw error;
    return { success: true, signedUrl: data.signedUrl };
  } catch (err) {
    console.error('Signed URL generation error:', err);
    return { success: false, error: 'Preview unavailable for this file.' };
  }
}

/**
 * Update print job with finalized F4/A4 composite layout file
 * @param {string} cafeId
 * @param {string} jobId
 * @param {string} fileName
 * @param {string} storagePath
 */
export async function updateJobPrintLayout(cafeId, jobId, fileName, storagePath) {
  try {
    const { data, error } = await supabase.rpc('cafe_admin_update_job_layout', {
      p_cafe_id: cafeId,
      p_job_id: jobId,
      p_file_name: fileName,
      p_storage_path: storagePath
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Update print layout error:', err);
    return { success: false, error: err.message || 'Failed to update job layout.' };
  }
}
