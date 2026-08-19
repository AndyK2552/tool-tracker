// Html5Qrcode's stop() and pause() both throw *synchronously* (not a
// rejected promise) when called on a scanner that isn't in an active
// scanning state — e.g. stop() firing from an effect cleanup while start()
// is still pending (camera permission prompt not yet resolved). That
// synchronous throw escapes a chained .catch() entirely and was crashing
// the app with an uncaught error. These wrappers swallow it safely.
//
// clear() is separate and returns void, not a Promise — chaining .catch()
// directly on it throws "Cannot read properties of undefined (reading 'catch')".

function safeClear(scanner) {
  try {
    scanner.clear();
  } catch {
    // element already removed/cleared — nothing to do
  }
}

export function safeStopScanner(scanner) {
  try {
    scanner.stop().then(() => safeClear(scanner)).catch(() => safeClear(scanner));
  } catch {
    safeClear(scanner);
  }
}

export function safePauseScanner(scanner, shouldPauseVideo) {
  try {
    scanner.pause(shouldPauseVideo);
  } catch {
    // already paused or stopped — nothing to do
  }
}

// Zooms the camera in a bit so small QR stickers are readable without
// having to hold the phone right up against them. Not all devices/browsers
// expose zoom control (notably iOS Safari often doesn't), so this silently
// no-ops rather than failing the scan if it's unsupported.
export async function applyDefaultZoom(scanner, targetZoom = 3) {
  try {
    const zoom = scanner.getRunningTrackCameraCapabilities().zoomFeature();
    if (!zoom.isSupported()) return;
    const clamped = Math.min(Math.max(targetZoom, zoom.min()), zoom.max());
    await zoom.apply(clamped);
  } catch {
    // zoom control not available on this device/browser
  }
}
