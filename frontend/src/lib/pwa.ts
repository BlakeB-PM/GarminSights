interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let _deferredPrompt: BeforeInstallPromptEvent | null = null;
const _subscribers = new Set<() => void>();

const notify = () => _subscribers.forEach(fn => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt = e as BeforeInstallPromptEvent;
  notify();
});

window.addEventListener('appinstalled', () => {
  _deferredPrompt = null;
  notify();
});

export function subscribe(fn: () => void): () => void {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

export function getPrompt(): BeforeInstallPromptEvent | null {
  return _deferredPrompt;
}

export function clearPrompt(): void {
  _deferredPrompt = null;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Tear down every service worker registration + cache for this origin and
// reload. We expose this as a "Reset app data" escape hatch for users whose
// browser is wedged on a stale SW/precache — a common cause of Chrome
// hiding the install option after a prior installable build went bad.
export async function resetPWAState(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  window.location.reload();
}
