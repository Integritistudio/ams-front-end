/** Non-React bridge so services/api.js can drive the global loader overlay. */

let pending = 0;
let label = 'Please wait…';
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn({ pending, label, active: pending > 0 });
    } catch (_e) {
      /* ignore */
    }
  });
}

export function subscribeApiLoading(listener) {
  listeners.add(listener);
  listener({ pending, label, active: pending > 0 });
  return () => listeners.delete(listener);
}

export function beginApiLoading(nextLabel) {
  pending += 1;
  if (nextLabel) label = nextLabel;
  notify();
}

export function endApiLoading() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) label = 'Please wait…';
  notify();
}

export function apiLoadingLabelFor(method, path) {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'DELETE') return 'Deleting…';
  if (m === 'POST') {
    if (String(path).includes('/login')) return 'Signing in…';
    if (String(path).includes('/reply')) return 'Posting reply…';
    if (String(path).includes('/improve')) return 'Improving with AI…';
    if (String(path).includes('/uploads')) return 'Uploading…';
    return 'Saving…';
  }
  if (m === 'PUT' || m === 'PATCH') {
    if (String(path).includes('/approve')) return 'Approving…';
    if (String(path).includes('/reject')) return 'Rejecting…';
    if (String(path).includes('/hold')) return 'Updating…';
    return 'Updating…';
  }
  return 'Loading…';
}
