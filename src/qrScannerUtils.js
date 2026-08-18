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
