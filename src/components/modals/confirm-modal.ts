import { wireModalSwipeDismiss } from '../../utils/modal-swipe-dismiss';
import { registerModal } from '../../utils/modal-manager';

let _resolve: ((value: boolean | null) => void) | null = null;
let _promptResolve: ((value: string | null) => void) | null = null;

// --- Modal queue ---
type QueueItem =
  | { type: 'confirm'; args: [string, string, string, string]; resolve: (v: boolean | null) => void }
  | { type: 'alert'; args: [string, string]; resolve: (v: void) => void }
  | { type: 'prompt'; args: [string, string, string]; resolve: (v: string | null) => void };

const _queue: QueueItem[] = [];

function getElements() {
  return {
    modal: document.getElementById('confirm-modal')!,
    title: document.getElementById('confirm-modal-title')!,
    message: document.getElementById('confirm-modal-message')!,
    confirmBtn: document.getElementById('confirm-modal-ok')!,
    cancelBtn: document.getElementById('confirm-modal-cancel')!,
    closeBtn: document.getElementById('confirm-modal-close')!,
    inputGroup: document.getElementById('confirm-modal-input-group')!,
    input: document.getElementById('confirm-modal-input') as HTMLInputElement,
  };
}

function isActive(): boolean {
  return _resolve !== null || _promptResolve !== null;
}

function showNext(): void {
  if (_queue.length === 0) return;
  const item = _queue.shift()!;
  if (item.type === 'confirm') {
    showConfirm(...item.args, item.resolve);
  } else if (item.type === 'alert') {
    showAlert(...item.args, item.resolve);
  } else {
    showPromptDialog(...item.args, item.resolve);
  }
}

function close(result: boolean | null): void {
  const { modal } = getElements();
  modal.classList.remove('active');
  if (_resolve) {
    const r = _resolve;
    _resolve = null;
    r(result);
  }
  showNext();
}

function closePrompt(value: string | null): void {
  const { modal } = getElements();
  modal.classList.remove('active');
  if (_promptResolve) {
    const r = _promptResolve;
    _promptResolve = null;
    r(value);
  }
  showNext();
}

function showConfirm(
  message: string,
  title: string,
  okLabel: string,
  cancelLabel: string,
  resolve: (v: boolean | null) => void,
): void {
  const els = getElements();
  els.title.textContent = title;
  els.message.textContent = message;
  els.confirmBtn.textContent = okLabel;
  els.cancelBtn.textContent = cancelLabel;
  els.cancelBtn.classList.remove('hidden');
  els.inputGroup.classList.add('hidden');
  els.modal.classList.add('active');
  els.confirmBtn.focus();
  _resolve = resolve;
}

function showAlert(
  message: string,
  title: string,
  resolve: (v: void) => void,
): void {
  const els = getElements();
  els.title.textContent = title;
  els.message.textContent = message;
  els.confirmBtn.textContent = 'OK';
  els.cancelBtn.classList.add('hidden');
  els.inputGroup.classList.add('hidden');
  els.modal.classList.add('active');
  els.confirmBtn.focus();
  _resolve = () => resolve();
}

function showPromptDialog(
  message: string,
  title: string,
  defaultValue: string,
  resolve: (v: string | null) => void,
): void {
  const els = getElements();
  els.title.textContent = title;
  els.message.textContent = message;
  els.confirmBtn.textContent = 'OK';
  els.cancelBtn.classList.remove('hidden');
  els.inputGroup.classList.remove('hidden');
  els.input.value = defaultValue;
  els.modal.classList.add('active');
  els.input.focus();
  _promptResolve = resolve;
}

export function styledConfirm(message: string, title = 'Confirm', okLabel = 'OK', cancelLabel = 'Cancel'): Promise<boolean | null> {
  return new Promise((resolve) => {
    if (isActive()) {
      _queue.push({ type: 'confirm', args: [message, title, okLabel, cancelLabel], resolve });
    } else {
      showConfirm(message, title, okLabel, cancelLabel, resolve);
    }
  });
}

export function styledAlert(message: string, title = 'Notice'): Promise<void> {
  return new Promise((resolve) => {
    if (isActive()) {
      _queue.push({ type: 'alert', args: [message, title], resolve });
    } else {
      showAlert(message, title, resolve);
    }
  });
}

export function styledPrompt(message: string, title = 'Input', defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    if (isActive()) {
      _queue.push({ type: 'prompt', args: [message, title, defaultValue], resolve });
    } else {
      showPromptDialog(message, title, defaultValue, resolve);
    }
  });
}

/** Dismiss the confirm modal (resolves promise with null). */
function dismissConfirm(): void {
  if (_promptResolve) {
    closePrompt(null);
  } else {
    close(null);
  }
}

export function initConfirmModal(): void {
  registerModal('confirm-modal', dismissConfirm);

  const els = getElements();

  // OK button → true
  els.confirmBtn.addEventListener('click', () => {
    if (_promptResolve) {
      closePrompt(els.input.value);
    } else {
      close(true);
    }
  });

  // Cancel button → false
  els.cancelBtn.addEventListener('click', () => {
    if (_promptResolve) {
      closePrompt(null);
    } else {
      close(false);
    }
  });

  // X button → null (dismiss)
  els.closeBtn.addEventListener('click', () => {
    if (_promptResolve) {
      closePrompt(null);
    } else {
      close(null);
    }
  });

  // Enter → true, Escape → null (dismiss)
  els.modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (_promptResolve) {
        closePrompt(els.input.value);
      } else {
        close(true);
      }
    } else if (e.key === 'Escape') {
      if (_promptResolve) {
        closePrompt(null);
      } else {
        close(null);
      }
    }
  });

  // Backdrop → null (dismiss; pointer events for mouse/touch/pen parity)
  let pointerDownOnBackdrop = false;
  els.modal.addEventListener('pointerdown', (e) => {
    pointerDownOnBackdrop = e.target === els.modal;
  });
  els.modal.addEventListener('pointerup', (e) => {
    if (pointerDownOnBackdrop && e.target === els.modal) {
      if (_promptResolve) {
        closePrompt(null);
      } else {
        close(null);
      }
    }
    pointerDownOnBackdrop = false;
  });

  // Mobile swipe-down to dismiss
  wireModalSwipeDismiss('confirm-modal', () => {
    if (_promptResolve) {
      closePrompt(null);
    } else {
      close(null);
    }
  });
}
