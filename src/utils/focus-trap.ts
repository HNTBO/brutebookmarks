const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Wire a focus trap on a modal element.
 * Only traps when the modal has the `.active` class.
 * Returns a cleanup function to remove the listener.
 */
export function trapFocus(modal: HTMLElement): () => void {
  function handler(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    if (!modal.classList.contains('active')) return;

    const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => el.offsetParent !== null);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  modal.addEventListener('keydown', handler);
  return () => modal.removeEventListener('keydown', handler);
}
