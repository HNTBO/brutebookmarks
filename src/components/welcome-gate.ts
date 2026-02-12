import type { AppMode } from '../data/local-storage';
import { getFoundingMemberStats } from '../data/founding-stats';

let _resolve: ((mode: AppMode) => void) | null = null;

export function showWelcomeGate(): Promise<AppMode> {
  const gate = document.getElementById('welcome-gate');
  if (!gate) return Promise.resolve('local');

  gate.classList.add('active');

  // Fetch founding member count in the background
  getFoundingMemberStats().then((stats) => {
    const el = document.getElementById('gate-founding-count');
    if (el) el.textContent = `(${stats.count} / ${stats.cap} claimed)`;
  });

  return new Promise<AppMode>((resolve) => {
    _resolve = resolve;

    document.getElementById('gate-local-btn')!.addEventListener('click', () => {
      resolve('local');
      _resolve = null;
    }, { once: true });

    document.getElementById('gate-sync-btn')!.addEventListener('click', () => {
      resolve('sync');
      _resolve = null;
    }, { once: true });
  });
}

export function hideWelcomeGate(): void {
  const gate = document.getElementById('welcome-gate');
  if (gate) gate.classList.remove('active');
}
