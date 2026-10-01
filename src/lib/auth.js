/**
 * Authentication Service
 * Security-hardened authentication workflows using Supabase Auth
 */

import { supabase } from './supabase.js';

// Client-side rate-limit guard against brute force bursts
const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 60 * 1000;
let loginAttempts = [];

/**
 * Validates input formats before sending to Supabase
 */
export function validateAuthInputs(email, password = null) {
  const errors = [];

  if (!email || typeof email !== 'string') {
    errors.push('Email address is required.');
  } else {
    const trimmed = email.trim();
    if (trimmed.length > 254) {
      errors.push('Email address exceeds maximum allowed length.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      errors.push('Please enter a valid email address.');
    }
  }

  if (password !== null) {
    if (!password || typeof password !== 'string') {
      errors.push('Password is required.');
    } else if (password.length < 8) {
      errors.push('Password must be at least 8 characters in length.');
    } else if (password.length > 72) {
      // bcrypt max length guard
      errors.push('Password must not exceed 72 characters.');
    }
  }

  return errors;
}

/**
 * Normalizes error messages to prevent account enumeration
 * and hide internal database or provider details.
 */
export function normalizeAuthError(err) {
  if (!err) return null;
  const msg = (err.message || '').toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
    return 'Invalid email or password. Please verify and try again.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || err.status === 429) {
    return 'Too many authentication attempts. Please wait a few moments before trying again.';
  }
  if (msg.includes('user not found') || msg.includes('email not confirmed')) {
    return 'Invalid email or password. Please verify and try again.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Network communication failure. Please check your internet connection.';
  }
  if (msg.includes('user already registered') || msg.includes('email address is already registered')) {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (msg.includes('license') || msg.includes('claimed') || msg.includes('token')) {
    if (msg.includes('already been registered') || msg.includes('already claimed')) {
      return 'This cafe license has already been registered and claimed.';
    }
    if (msg.includes('expired')) {
      return 'This license has expired. Please contact support.';
    }
    return 'The provided license information could not be verified.';
  }

  // Safe fallback: never expose raw SQL, paths, or keys
  return 'Authentication service is temporarily unavailable. Please try again shortly.';
}

/**
 * Security Audit Event Logger
 * Enforces zero-leakage: passwords, tokens, and secrets are strictly stripped.
 */
export async function logAuthEvent(eventType, metadata = {}) {
  try {
    // Sanitize metadata: remove any accidental sensitive keys
    const sanitized = { ...metadata };
    delete sanitized.password;
    delete sanitized.confirmPassword;
    delete sanitized.token;
    delete sanitized.auth_token;
    delete sanitized.authToken;
    delete sanitized.access_token;
    delete sanitized.refresh_token;
    delete sanitized.secret;
    delete sanitized.hash;
    delete sanitized.token_hash;
    delete sanitized.tokenHash;

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    await supabase.from('auth_audit_logs').insert({
      user_id: userId,
      event_type: eventType,
      metadata: sanitized,
    });
  } catch (e) {
    // Silent fail on client side to prevent blocking authentication
    console.debug('[Auth Audit] Event logged with fallback');
  }
}

/**
 * Sign In with email and password
 */
export async function signIn(email, password) {
  // 1. Client-side burst rate limiting
  const now = Date.now();
  loginAttempts = loginAttempts.filter(ts => now - ts < ATTEMPT_WINDOW_MS);
  if (loginAttempts.length >= ATTEMPT_LIMIT) {
    await logAuthEvent('login_failure', { reason: 'client_rate_limit_exceeded' });
    return {
      success: false,
      error: 'Too many login attempts. Please wait 60 seconds before trying again.',
    };
  }

  // 2. Input validation
  const validationErrors = validateAuthInputs(email, password);
  if (validationErrors.length > 0) {
    return { success: false, error: validationErrors[0] };
  }

  loginAttempts.push(now);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      await logAuthEvent('login_failure', { reason: 'bad_credentials' });
      return { success: false, error: normalizeAuthError(error) };
    }

    // 3. Fetch profile with role and cafe_id
    const { profile, error: profileErr } = await getProfile(data.user.id);

    // 4. Check account status
    if (profile && profile.account_status !== 'active') {
      await supabase.auth.signOut();
      await logAuthEvent('login_failure', { reason: 'account_suspended' });
      return {
        success: false,
        error: 'This account has been suspended or is pending review. Please contact administrator.',
      };
    }

    // 5. Update last_login_at
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id);

    await logAuthEvent('login_success', { role: profile?.role || 'staff' });

    // Reset attempt counter on success
    loginAttempts = [];

    return {
      success: true,
      user: data.user,
      session: data.session,
      profile,
    };
  } catch (err) {
    await logAuthEvent('login_failure', { reason: 'exception' });
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Sign Out
 */
export async function signOut() {
  try {
    await logAuthEvent('logout');
    await supabase.auth.signOut();
    return { success: true };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Request Password Reset Link
 * Never reveals whether an email exists in the system (anti-enumeration)
 */
export async function resetPasswordForEmail(email) {
  const validationErrors = validateAuthInputs(email);
  if (validationErrors.length > 0) {
    return { success: false, error: validationErrors[0] };
  }

  try {
    const redirectUrl = `${window.location.origin}/update-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: redirectUrl }
    );

    await logAuthEvent('password_reset_requested');

    // If rate limited, return rate limit message
    if (error && (error.status === 429 || error.message?.includes('rate limit'))) {
      return { success: false, error: normalizeAuthError(error) };
    }

    // Standardized generic response regardless of whether email exists
    return {
      success: true,
      message: 'If an active account exists for this address, a secure password reset link has been dispatched.',
    };
  } catch (err) {
    return {
      success: true,
      message: 'If an active account exists for this address, a secure password reset link has been dispatched.',
    };
  }
}

/**
 * Update Password (authenticated session or recovery link)
 */
export async function updatePassword(newPassword) {
  const validationErrors = validateAuthInputs('user@domain.com', newPassword);
  if (validationErrors.length > 0) {
    return { success: false, error: validationErrors[0] };
  }

  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { success: false, error: normalizeAuthError(error) };
    }

    await logAuthEvent('password_changed');
    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, error: normalizeAuthError(err) };
  }
}

/**
 * Get currently authenticated user profile
 */
export async function getProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, cafe_id, account_status, created_at, updated_at, last_login_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return { profile: null, error };
    }

    return { profile: data, error: null };
  } catch (err) {
    return { profile: null, error: err };
  }
}

/**
 * Get current session and profile
 */
export async function getCurrentSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return { session: null, user: null, profile: null };

    const { profile } = await getProfile(session.user.id);
    return {
      session,
      user: session.user,
      profile,
    };
  } catch (e) {
    return { session: null, user: null, profile: null };
  }
}

/**
 * Subscribe to Auth State Changes
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    let profile = null;
    if (session?.user) {
      const res = await getProfile(session.user.id);
      profile = res.profile;
    }
    callback(event, session, profile);
  });
}

/**
 * --------------------------------------------------------------------------
 * REGISTRATION MODULE WORKFLOWS (STEP 1 & STEP 2)
 * --------------------------------------------------------------------------
 */

/**
 * Validate Registration Step 1 (Personal Details)
 */
export function validateRegistrationStep1({ fullName, email, password, confirmPassword }) {
  const errors = [];

  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    errors.push('Full Name is required.');
  } else if (fullName.trim().length < 2) {
    errors.push('Full Name must be at least 2 characters.');
  } else if (fullName.trim().length > 100) {
    errors.push('Full Name cannot exceed 100 characters.');
  }

  const authErrors = validateAuthInputs(email, password);
  errors.push(...authErrors);

  if (password && confirmPassword !== password) {
    errors.push('Passwords do not match. Please re-enter your password.');
  }

  return errors;
}

/**
 * Validate Registration Step 2 (Cafe Verification Details)
 */
export function validateRegistrationStep2({ cafeName, licenseNumber, authToken }) {
  const errors = [];

  if (!cafeName || typeof cafeName !== 'string' || !cafeName.trim()) {
    errors.push('Cafe Name is required.');
  } else if (cafeName.trim().length < 2) {
    errors.push('Cafe Name must be at least 2 characters.');
  } else if (cafeName.trim().length > 150) {
    errors.push('Cafe Name cannot exceed 150 characters.');
  }

  if (!licenseNumber || typeof licenseNumber !== 'string' || !licenseNumber.trim()) {
    errors.push('License Number is required.');
  } else if (licenseNumber.trim().length < 5) {
    errors.push('License Number must be at least 5 characters.');
  } else if (licenseNumber.trim().length > 50) {
    errors.push('License Number cannot exceed 50 characters.');
  }

  if (!authToken || typeof authToken !== 'string' || !authToken.trim()) {
    errors.push('Authorization Token is required.');
  } else if (authToken.trim().length < 5) {
    errors.push('Authorization Token must be at least 5 characters.');
  } else if (authToken.trim().length > 64) {
    errors.push('Authorization Token cannot exceed 64 characters.');
  }

  return errors;
}

/**
 * Server-side License Preflight Verification
 * Calls the PostgreSQL verify_cafe_license SECURITY DEFINER RPC.
 */
export async function verifyCafeLicensePreflight({ cafeName, licenseNumber, authToken }) {
  const validationErrors = validateRegistrationStep2({ cafeName, licenseNumber, authToken });
  if (validationErrors.length > 0) {
    return { valid: false, error: validationErrors[0] };
  }

  try {
    const { data, error } = await supabase.rpc('verify_cafe_license', {
      p_cafe_name: cafeName.trim(),
      p_license_number: licenseNumber.trim(),
      p_auth_token: authToken.trim(),
    });

    if (error) {
      return { valid: false, error: 'The provided license information could not be verified.' };
    }

    if (!data || !data.valid) {
      return { valid: false, error: data?.error || 'The provided license information could not be verified.' };
    }

    return { valid: true, cafeName: data.cafe_name };
  } catch (err) {
    return { valid: false, error: 'The provided license information could not be verified.' };
  }
}

/**
 * Register Cafe Admin
 * Server-side verified registration:
 * Atomic claim of provisioned cafe license + Supabase Auth account creation.
 */
export async function registerCafeAdmin({
  fullName,
  email,
  password,
  confirmPassword,
  cafeName,
  licenseNumber,
  authToken,
}) {
  // 1. Validate Step 1
  const step1Errors = validateRegistrationStep1({ fullName, email, password, confirmPassword });
  if (step1Errors.length > 0) {
    return { success: false, error: step1Errors[0] };
  }

  // 2. Validate Step 2
  const step2Errors = validateRegistrationStep2({ cafeName, licenseNumber, authToken });
  if (step2Errors.length > 0) {
    return { success: false, error: step2Errors[0] };
  }

  // 3. Server-side Preflight License Check
  const preflight = await verifyCafeLicensePreflight({ cafeName, licenseNumber, authToken });
  if (!preflight.valid) {
    await logAuthEvent('registration_failure', {
      reason: 'license_verification_failed',
      email: email.trim().toLowerCase(),
    });
    return { success: false, error: preflight.error };
  }

  // 4. Create Account in Supabase Auth
  // The PostgreSQL trigger handle_new_user() will atomically verify the license again,
  // link the verified cafe_id, mark the license claimed, and assign role 'cafe_admin'.
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role: 'cafe_admin',
          cafe_name: cafeName.trim(),
          license_number: licenseNumber.trim(),
          auth_token: authToken.trim(),
        },
      },
    });

    if (error) {
      await logAuthEvent('registration_failure', {
        reason: 'auth_signup_error',
        email: email.trim().toLowerCase(),
      });
      return { success: false, error: normalizeAuthError(error) };
    }

    // Check if user object was returned
    if (!data.user) {
      return { success: false, error: 'Registration could not be completed. Please try again.' };
    }

    // If session was automatically established, fetch the profile
    let profile = null;
    if (data.session) {
      const pRes = await getProfile(data.user.id);
      profile = pRes.profile;
    }

    return {
      success: true,
      user: data.user,
      session: data.session,
      profile,
      message: 'Cafe Admin registration completed successfully.',
    };
  } catch (err) {
    await logAuthEvent('registration_failure', {
      reason: 'unexpected_exception',
      email: email.trim().toLowerCase(),
    });
    return { success: false, error: normalizeAuthError(err) };
  }
}

