/**
 * auth-nav.js — Shared auth for pages without home.js
 * Include AFTER i18n.js, config.js, supabase, components.js
 */
(function () {
  if (window.__authNavLoaded) return;
  window.__authNavLoaded = true;

  // NOTE: createClient is accessed inside initClient() — NOT here at top level.
  // Accessing it here would crash silently if window.supabase isn't ready yet.

  const AUTH_MODES = { LOGIN: 'login', SIGNUP: 'signup' };

  let _client     = null;
  let _anonClient = null;
  let _user     = null;
  let _profile  = null;
  let _authMode = AUTH_MODES.LOGIN;

  function isPlaceholder(v) { return !v || /^DEIN(?:E)?_SUPABASE_/i.test(v); }

  function initClient() {
    const factory = window.supabase?.createClient;
    if (typeof factory !== 'function') {
      console.error('[auth-nav] window.supabase.createClient not available');
      return null;
    }
    const url = CONFIG?.SUPABASE_URL;
    const key = CONFIG?.SUPABASE_PUBLISHABLE_KEY || CONFIG?.SUPABASE_ANON;
    if (isPlaceholder(url) || isPlaceholder(key)) {
      console.warn('[auth-nav] Supabase not configured');
      return null;
    }
    try {
      return factory(url, key, {
        auth: { storageKey: 'setradar-auth' },
      });
    } catch (err) {
      console.error('[auth-nav] createClient failed:', err);
      return null;
    }
  }

  function initAnonClient() {
    const factory = window.supabase?.createClient;
    if (typeof factory !== 'function') return null;
    const url = CONFIG?.SUPABASE_URL;
    const key = CONFIG?.SUPABASE_PUBLISHABLE_KEY || CONFIG?.SUPABASE_ANON;
    if (isPlaceholder(url) || isPlaceholder(key)) return null;
    try {
      return factory(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'setradar-anon-auth' },
      });
    } catch { return null; }
  }

  function tt(key) {
    return (typeof window.t === 'function' ? window.t(key) : null) || key;
  }

  function userLabel() {
    if (!_user) return tt('nav.guest');
    return _profile?.display_name
      || _user.user_metadata?.name
      || _user.email
      || tt('nav.guest');
  }

  function updateAuthUi() {
    const el = document.getElementById('navUserState');
    if (!el) return;
    el.textContent = userLabel();
    el.style.cursor = 'pointer';
    if (_user) {
      el.setAttribute('href', 'profile.html');
      el.title = tt('profile.eyebrow').replace('//', '').trim();
    } else {
      el.removeAttribute('href');
      el.title = tt('nav.login');
    }
  }

  function revealNavbar() {
    updateAuthUi();
  }

  function syncBodyLock() {
    const isOpen = document.getElementById('authOverlay')?.classList.contains('open');
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  function setAuthMessage(text = '', type = '') {
    const el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = text;
    el.className = 'auth-message' + (type ? ` ${type}` : '');
  }

  function setAuthBusy(busy) {
    ['authSubmit', 'authGoogleBtn', 'authAppleBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = busy;
    });
  }

  function setAuthMode(mode) {
    _authMode = mode;
    document.getElementById('authModeLogin')?.classList.toggle('active', mode === AUTH_MODES.LOGIN);
    document.getElementById('authModeSignup')?.classList.toggle('active', mode === AUTH_MODES.SIGNUP);
    const submit = document.getElementById('authSubmit');
    if (submit) submit.textContent = mode === AUTH_MODES.LOGIN ? tt('auth.login') : tt('auth.signup');
    const nameRow = document.getElementById('authDisplayNameRow');
    if (nameRow) nameRow.style.display = mode === AUTH_MODES.SIGNUP ? '' : 'none';
    const gLabel = document.getElementById('authGoogleBtnLabel');
    if (gLabel) gLabel.textContent = mode === AUTH_MODES.SIGNUP ? tt('auth.google_signup') : tt('auth.google_login');
    const aLabel = document.getElementById('authAppleBtnLabel');
    if (aLabel) aLabel.textContent = mode === AUTH_MODES.SIGNUP ? tt('auth.apple_signup') : tt('auth.apple_login');
  }

  function openAuthModal(mode = AUTH_MODES.LOGIN) {
    setAuthMode(mode);
    const overlay = document.getElementById('authOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    syncBodyLock();
    setTimeout(() => document.getElementById('authEmail')?.focus(), 60);
  }

  function closeAuthModal() {
    const overlay = document.getElementById('authOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    setAuthMessage('');
    syncBodyLock();
  }

  function getRedirectUrl() {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    return url.toString();
  }

  function cleanupAuthUrl() {
    const url = new URL(window.location.href);
    let changed = false;
    ['code', 'state', 'error', 'error_code', 'error_description'].forEach(key => {
      if (!url.searchParams.has(key)) return;
      url.searchParams.delete(key);
      changed = true;
    });
    if (url.hash) {
      const hp = new URLSearchParams(url.hash.slice(1));
      const authKeys = ['access_token', 'refresh_token', 'expires_at', 'token_type', 'type'];
      if (authKeys.some(k => hp.has(k))) { url.hash = ''; changed = true; }
    }
    if (changed) history.replaceState(null, '', url.toString());
  }

  async function fetchProfile() {
    if (!_client || !_user) { _profile = null; return; }
    try {
      const { data } = await _client.from('profiles')
        .select('user_id, display_name, avatar_url')
        .eq('user_id', _user.id)
        .maybeSingle();
      _profile = data || null;
    } catch { _profile = null; }
  }

  async function ensureProfile() {
    if (!_client || !_user) return;
    if (_profile) return; // already loaded by fetchProfile(), skip upsert
    const fallback = _user.user_metadata?.name || _user.user_metadata?.full_name || _user.email || 'User';
    try {
      const { data } = await _client.from('profiles')
        .upsert({ user_id: _user.id, display_name: fallback }, { onConflict: 'user_id' })
        .select('user_id, display_name, avatar_url')
        .maybeSingle();
      _profile = data || _profile;
    } catch {}
  }

  async function hydrateSession() {
    if (!_client) { revealNavbar(); return; }
    try {
      const { data } = await _client.auth.getSession();
      _user = data?.session?.user || null;
      if (_user) {
        await fetchProfile();
        await ensureProfile();
        cleanupAuthUrl();
      } else {
        _profile = null;
      }
    } catch (err) {
      console.warn('[auth-nav] hydrateSession error:', err);
      _user = null;
      _profile = null;
    } finally {
      revealNavbar();
    }
  }

  async function onAuthSubmit(e) {
    e.preventDefault();
    if (!_client) {
      setAuthMessage('Supabase not available.', 'error');
      return;
    }
    const email       = document.getElementById('authEmail')?.value.trim();
    const password    = document.getElementById('authPassword')?.value || '';
    const displayName = document.getElementById('authDisplayName')?.value.trim();
    if (!email || !password) { setAuthMessage('Email and password required.', 'error'); return; }
    setAuthBusy(true);
    setAuthMessage(_authMode === AUTH_MODES.SIGNUP ? 'Creating account...' : 'Logging in...');
    try {
      if (_authMode === AUTH_MODES.SIGNUP) {
        const { data, error } = await _client.auth.signUp({
          email, password,
          options: { data: { name: displayName || email }, emailRedirectTo: getRedirectUrl() },
        });
        if (error) throw error;
        if (data.session?.user) {
          _user = data.session.user;
          await ensureProfile();
          closeAuthModal();
          updateAuthUi();
        } else {
          setAuthMessage('Check your email to confirm.', 'success');
        }
      } else {
        const { data, error } = await _client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        _user = data.session?.user || null;
        if (_user) { await fetchProfile(); closeAuthModal(); updateAuthUi(); }
      }
    } catch (err) {
      setAuthMessage(err.message || 'Error.', 'error');
    }
    setAuthBusy(false);
  }

  async function onGoogleAuth() {
    if (!_client) return;
    setAuthBusy(true);
    try {
      await _client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getRedirectUrl() },
      });
    } catch (err) {
      setAuthMessage(err.message || 'Google error.', 'error');
      setAuthBusy(false);
    }
  }

  async function onAppleAuth() {
    if (!_client) return;
    setAuthBusy(true);
    try {
      await _client.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: getRedirectUrl() },
      });
    } catch (err) {
      setAuthMessage(err.message || 'Apple error.', 'error');
      setAuthBusy(false);
    }
  }

  function subscribeAuthState() {
    if (!_client) return;
    _client.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'INITIAL_SESSION') return;
      _user = session?.user || null;
      if (_user) {
        await fetchProfile();
        await ensureProfile();
        cleanupAuthUrl();
        closeAuthModal();
      } else {
        _profile = null;
      }
      updateAuthUi();
    });
  }

  function initAuthUi() {
    document.getElementById('authOverlayBg')?.addEventListener('click', closeAuthModal);
    document.getElementById('authModalClose')?.addEventListener('click', closeAuthModal);
    document.getElementById('authModeLogin')?.addEventListener('click', () => setAuthMode(AUTH_MODES.LOGIN));
    document.getElementById('authModeSignup')?.addEventListener('click', () => setAuthMode(AUTH_MODES.SIGNUP));
    document.getElementById('authForm')?.addEventListener('submit', onAuthSubmit);
    document.getElementById('authGoogleBtn')?.addEventListener('click', onGoogleAuth);
    document.getElementById('authAppleBtn')?.addEventListener('click', onAppleAuth);
    document.getElementById('navUserState')?.addEventListener('click', e => {
      if (!_user) { e.preventDefault(); openAuthModal(AUTH_MODES.LOGIN); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('authOverlay')?.classList.contains('open')) {
        closeAuthModal();
      }
    });
    setAuthMode(AUTH_MODES.LOGIN);
    updateAuthUi();
  }

  async function loadNavbarCities() {
    if (!window.SetradarCitySelector) return;
    const client = _anonClient || _client;
    if (!client) { window.SetradarCitySelector.setOptions(['Berlin']); return; }
    try {
      const { data, error } = await client.from('cities').select('name').order('name');
      if (error) throw error;
      const cities = [...new Set((data || []).map(r => String(r.name || '').trim()).filter(Boolean))];
      window.SetradarCitySelector.setOptions(cities.length ? cities : ['Berlin']);
    } catch {
      window.SetradarCitySelector.setOptions(['Berlin']);
    }
  }

  async function init() {
    try { _client = initClient(); _anonClient = initAnonClient(); } catch (err) {
      console.error('[auth-nav] initClient failed:', err);
      _client = null; _anonClient = null;
    }
    revealNavbar();
    initAuthUi();
    await hydrateSession();
    subscribeAuthState();
    loadNavbarCities();
  }

  if (window.componentsReady?.then) {
    window.componentsReady.then(init).catch(() => { revealNavbar(); });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
