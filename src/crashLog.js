const KEY = 'lastCrashLog';

export function logCrash(source, error) {
  try {
    const entry = {
      source,
      message: error?.message || String(error),
      stack: error?.stack || null,
      time: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // storage unavailable — nothing more we can do
  }
}

export function getLastCrash() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLastCrash() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function installGlobalCrashLogging() {
  window.addEventListener('error', (event) => {
    logCrash('window.onerror', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    logCrash('unhandledrejection', event.reason);
  });
}
