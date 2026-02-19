/**
 * Centralized modal close pipeline.
 *
 * Each modal registers a close function via `registerModal()`.
 * The manager provides:
 * - `dismissModal(id)` — close a specific modal through its proper function
 * - `dismissAllModals()` — close all active modals (used by global Escape)
 * - `isModalActive(id)` — check if a modal is open
 *
 * This eliminates the pattern of direct classList.remove('active') calls
 * that bypass cleanup/promise resolution (e.g. confirm-modal).
 */

import { trapFocus } from './focus-trap';

type CloseFn = () => void;

const registry = new Map<string, CloseFn>();

/** Register a modal's close function. Call once during init. */
export function registerModal(modalId: string, closeFn: CloseFn): void {
  registry.set(modalId, closeFn);
  const el = document.getElementById(modalId);
  if (el) trapFocus(el);
}

/** Close a specific modal through its registered close function. */
export function dismissModal(modalId: string): void {
  const closeFn = registry.get(modalId);
  if (closeFn) {
    closeFn();
  } else {
    // Fallback for unregistered modals — direct class removal
    document.getElementById(modalId)?.classList.remove('active');
  }
}

/** Check if a modal is currently active. */
export function isModalActive(modalId: string): boolean {
  return document.getElementById(modalId)?.classList.contains('active') ?? false;
}

/** Close only the topmost (last-registered) active modal. Used by global Escape. */
export function dismissTopModal(): void {
  const entries = Array.from(registry.entries());
  for (let i = entries.length - 1; i >= 0; i--) {
    const [modalId, closeFn] = entries[i];
    if (isModalActive(modalId)) {
      closeFn();
      return;
    }
  }
}

/** Close all currently active modals via their registered close functions. */
export function dismissAllModals(): void {
  for (const [modalId, closeFn] of registry) {
    if (isModalActive(modalId)) {
      closeFn();
    }
  }
}
