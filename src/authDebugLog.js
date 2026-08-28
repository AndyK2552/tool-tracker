const KEY = 'authDebugLog';
const MAX_ENTRIES = 25;

export function logAuthEvent(label, details) {
  try {
    const existing = JSON.parse(localStorage.getItem(KEY) || '[]');
    existing.push({ label, details, time: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(existing.slice(-MAX_ENTRIES)));
  } catch {
    // storage unavailable — nothing more we can do
  }
}

export function getAuthLog() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearAuthLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// Pulls out Supabase's own error params from the callback URL, if present.
// Supabase appends these to the redirect when a magic-link exchange fails
// (e.g. otp_expired, access_denied) — info we were previously discarding
// entirely since nothing read it before the URL got cleaned up.
export function parseAuthParamsFromLocation() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const get = (key) => search.get(key) || hash.get(key) || null;

  return {
    href: window.location.href,
    code: get('code'),
    token_hash: get('token_hash'),
    type: get('type'),
    error: get('error'),
    error_code: get('error_code'),
    error_description: get('error_description'),
  };
}
