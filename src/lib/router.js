/**
 * Client-Side Router for PressPoint
 * Handles public landing page, authentication views, and protected route guards.
 */

import { renderAuthView } from '../components/auth-ui.js';

export function initRouter() {
  const landingContent = document.getElementById('main-content');
  const heroAnnounce = document.querySelector('.top-announcement');
  const footer = document.querySelector('.site-footer');
  let authContainer = document.getElementById('auth-view-container');

  if (!authContainer) {
    authContainer = document.createElement('div');
    authContainer.id = 'auth-view-container';
    authContainer.style.display = 'none';
    document.body.insertBefore(authContainer, footer);
  }

  const navbar = document.getElementById('navbar');
  const scrollProgress = document.querySelector('.scroll-progress-container');

  function handleRoute() {
    const hash = window.location.hash || '';
    const search = window.location.search || '';

    // Check for expired or invalid OTP recovery link in hash or search params
    if (
      hash.includes('otp_expired') ||
      search.includes('otp_expired') ||
      hash.includes('Email+link+is+invalid') ||
      search.includes('Email+link+is+invalid') ||
      (hash.includes('access_denied') && hash.includes('expired')) ||
      (search.includes('access_denied') && search.includes('expired'))
    ) {
      sessionStorage.setItem('presspoint_recovery_error', 'otp_expired');
      window.history.replaceState(null, '', '/reset-password');
    } else if (
      hash.includes('type=recovery') ||
      (hash.includes('access_token=') && !hash.includes('error='))
    ) {
      // Supabase recovery session detected in hash
      sessionStorage.setItem('presspoint_recovery_mode', 'true');
      sessionStorage.removeItem('presspoint_recovery_error');
      // Clean sensitive authentication fragments from the visible browser URL
      window.history.replaceState(null, '', '/reset-password');
    }

    let path = window.location.pathname;

    // Normalize /update-password to /reset-password
    if (path === '/update-password') {
      path = '/reset-password';
      window.history.replaceState(null, '', '/reset-password');
    }

    // If recovery mode or recovery error is active, force path to /reset-password
    if (
      (sessionStorage.getItem('presspoint_recovery_mode') === 'true' ||
       sessionStorage.getItem('presspoint_recovery_error') === 'otp_expired') &&
      (path === '/' || path === '')
    ) {
      path = '/reset-password';
      window.history.replaceState(null, '', '/reset-password');
    }

    if (path === '/' || path === '') {
      // Show landing page elements
      if (navbar) navbar.style.display = '';
      if (scrollProgress) scrollProgress.style.display = '';
      if (heroAnnounce) heroAnnounce.style.display = '';
      if (landingContent) landingContent.style.display = '';
      if (footer) footer.style.display = '';
      if (authContainer) authContainer.style.display = 'none';
    } else {
      // Show dedicated auth / admin / cafe workstation view (hide public elements)
      if (navbar) navbar.style.display = 'none';
      if (scrollProgress) scrollProgress.style.display = 'none';
      if (heroAnnounce) heroAnnounce.style.display = 'none';
      if (landingContent) landingContent.style.display = 'none';
      if (footer) footer.style.display = 'none';
      if (authContainer) {
        authContainer.style.display = 'block';
        renderAuthView(path, authContainer);
      }
    }

    // Scroll to top on navigation
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Intercept anchor clicks matching internal routes
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (href && (
      href.startsWith('/login') ||
      href.startsWith('/register') ||
      href.startsWith('/reset-password') ||
      href.startsWith('/update-password') ||
      href.startsWith('/admin') ||
      href.startsWith('/super-admin') ||
      href.startsWith('/cafe') ||
      href.startsWith('/staff') ||
      href.startsWith('/c/') ||
      href.startsWith('/print/') ||
      href.startsWith('/security-tests') ||
      href === '/'
    )) {
      e.preventDefault();
      window.history.pushState({}, '', href);
      handleRoute();
    }
  });

  window.addEventListener('popstate', handleRoute);

  window.navigateTo = (path) => {
    window.history.pushState({}, '', path);
    handleRoute();
  };

  // Initial route execution
  handleRoute();
}
