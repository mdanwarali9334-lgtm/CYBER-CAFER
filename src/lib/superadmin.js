/**
 * Super Admin Management Service
 * Provides backend-verified administrative actions for Cafes, Licenses, Devices, and Audit Logs.
 * 
 * STRICT SECURITY PRINCIPLES:
 * 1. All functions verify caller privileges server-side via Supabase RLS and RPCs.
 * 2. Sensitive secrets (bcrypt hashes, raw tokens) are never leaked in client responses.
 * 3. Cross-cafe IDOR vulnerabilities are prevented by server-side ownership checks.
 */

import { supabase } from './supabase.js';
import { normalizeAuthError } from './auth.js';

/**
 * Fetches high-level metrics for the Super Admin Overview tab
 */
export async function fetchSystemOverview() {
  try {
    const { data, error } = await supabase.rpc('super_admin_get_system_overview');
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Lists all cafes in the system
 */
export async function fetchAllCafes() {
  try {
    const { data, error } = await supabase
      .from('cafes')
      .select('id, name, slug, status, contact_email, contact_phone, address, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Provisions a new cafe
 */
export async function createProvisionedCafe({ name, slug, contactEmail, contactPhone, address }) {
  try {
    if (!name || !name.trim()) {
      return { success: false, error: 'Cafe name is required.' };
    }

    const { data, error } = await supabase.rpc('super_admin_create_cafe', {
      p_name: name.trim(),
      p_slug: slug ? slug.trim() : null,
      p_contact_email: contactEmail ? contactEmail.trim() : null,
      p_contact_phone: contactPhone ? contactPhone.trim() : null,
      p_address: address ? address.trim() : null,
    });

    if (error) throw error;
    return { success: true, data: data.cafe };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Updates a cafe's operational status (active, suspended, disabled)
 */
export async function updateCafeStatus(cafeId, newStatus) {
  try {
    const { data, error } = await supabase.rpc('super_admin_update_cafe_status', {
      p_cafe_id: cafeId,
      p_status: newStatus,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Lists all licenses with cafe associations and device slot counts
 */
export async function fetchAllLicenses() {
  try {
    const { data, error } = await supabase
      .from('cafe_licenses')
      .select(`
        id,
        cafe_id,
        license_number,
        status,
        max_devices,
        valid_from,
        expires_at,
        claimed,
        claimed_at,
        created_at,
        cafes ( id, name, status )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Provisions a new license and registration authorization token for a cafe.
 * If licenseNumber or authToken is omitted, the backend generates them automatically.
 */
export async function createProvisionedLicense({
  cafeId,
  licenseNumber = null,
  authToken = null,
  maxDevices = 3,
  validDays = 365,
}) {
  try {
    if (!cafeId) {
      return { success: false, error: 'Target Cafe must be selected.' };
    }

    const { data, error } = await supabase.rpc('super_admin_create_license', {
      p_cafe_id: cafeId,
      p_license_number: licenseNumber ? licenseNumber.trim() : null,
      p_auth_token: authToken ? authToken.trim() : null,
      p_max_devices: parseInt(maxDevices, 10) || 3,
      p_valid_days: parseInt(validDays, 10) || 365,
    });

    if (error) throw error;
    return {
      success: true,
      data: data.license,
      rawAuthToken: data.raw_auth_token,
    };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Updates license status (active, expired, suspended, revoked)
 */
export async function updateLicenseStatus(licenseId, newStatus) {
  try {
    const { data, error } = await supabase.rpc('super_admin_update_license_status', {
      p_license_id: licenseId,
      p_status: newStatus,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Fetches all authorized devices across cafes with live heartbeat statuses
 */
export async function fetchAllDevices(cafeId = null) {
  try {
    let query = supabase
      .from('authorized_devices')
      .select(`
        id,
        cafe_id,
        license_id,
        device_label,
        device_fingerprint,
        key_algorithm,
        tpm_backed,
        key_storage_type,
        status,
        last_seen_at,
        created_at,
        revoked_at,
        cafes ( id, name, status ),
        cafe_licenses ( id, license_number, status, max_devices, expires_at )
      `)
      .order('created_at', { ascending: false });

    if (cafeId) {
      query = query.eq('cafe_id', cafeId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Generates a one-time activation code for provisioning a new PC slot.
 * If rawCode is omitted, the backend generates it automatically.
 */
export async function generateDeviceActivationCode({
  cafeId,
  licenseId,
  deviceLabel,
  rawCode = null,
  expiresHours = 48,
}) {
  try {
    if (!cafeId || !licenseId) {
      return { success: false, error: 'Target Cafe and License must be selected.' };
    }
    if (!deviceLabel || !deviceLabel.trim()) {
      return { success: false, error: 'Device label is required (e.g. PC-01).' };
    }

    const { data, error } = await supabase.rpc('super_admin_generate_device_activation', {
      p_cafe_id: cafeId,
      p_license_id: licenseId,
      p_device_label: deviceLabel.trim(),
      p_raw_code: rawCode ? rawCode.trim() : null,
      p_expires_hours: parseInt(expiresHours, 10) || 48,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Revokes a device's authorization immediately
 */
export async function revokeDevice(deviceId) {
  try {
    const { data, error } = await supabase.rpc('super_admin_revoke_device', {
      p_device_id: deviceId,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Fetches recent audit logs for compliance & security review
 */
export async function fetchAuditLogs(limit = 50) {
  try {
    const { data, error } = await supabase
      .from('auth_audit_logs')
      .select('id, user_id, event_type, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Fetches admin & staff user accounts
 */
export async function fetchAdminAccounts() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        role,
        cafe_id,
        account_status,
        created_at,
        last_login_at,
        cafes ( id, name )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}
