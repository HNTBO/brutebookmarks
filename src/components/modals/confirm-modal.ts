let _resolve: ((value: boolean) => void) | null = null;
let _promptResolve: ((value: string | null) => void) | null = null;

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

function close(result: boolean): void {
  const { modal } = getElements();
  modal.classList.remove('active');
  if (_resolve) {
    _resolve(result);
    _resolve = null;
  }
}

function closePrompt(value: string | null): void {
  const { modal } = getElements();
  modal.classList.remove('active');
  if (_promptResolve) {
    _promptResolve(value);
    _promptResolve = null;
  }
}

export function styledConfirm(message: string, title = 'Confirm', okLabel = 'OK', cancelLabel = 'Cancel'): Promise<boolean> {
  const els = getElements();
  els.title.textContent = title;
  els.message.textContent = message;
  els.confirmBtn.textContent = okLabel;
  els.cancelBtn.textContent = cancelLabel;
  els.cancelBtn.style.display = '';
  els.inputGroup.style.display = 'none';
  els.modal.classList.add('active');
  els.confirmBtn.focus();

  return new Promise((resolve) => {
    _resolve = resolve;
  });
}

export function styledAlert(message: string, title = 'Notice'): Promise<void> {
  const els = getElements();
  els.title.textContent = title;
  els.message.textContent = message;
  els.confirmBtn.textContent = 'OK';
  els.cancelBtn.style.display = 'none';
  els.inputGroup.style.display = 'none';
  els.modal.classList.add('active');
  els.confirmBtn.focus();

  return new Promise((resolve) => {
    _resolve = () => resolve();
  });
}

export function styledPrompt(message: string, title = 'Input', defaultValue = ''): Promise<string | null> {
  const els = getElements();
  els.title.textContent = title;
  els.message.textContent = message;
  els.confirmBtn.textContent = 'OK';
  els.cancelBtn.style.display = '';
  els.inputGroup.style.display = '';
  els.input.value = defaultValue;
  els.modal.classList.add('active');
  els.input.focus();

  return new Promise((resolve) => {
    _promptResolve = resolve;
  });
}

export function initConfirmModal(): void {
  const els = getElements();

  els.confirmBtn.addEventListener('click', () => {
    if (_promptResolve) {
      closePrompt(els.input.value);
    } else {
      close(true);
    }
  });

  els.cancelBtn.addEventListener('click', () => {
    if (_promptResolve) {
      closePrompt(null);
    } else {
      close(false);
    }
  });

  els.closeBtn.addEventListener('click', () => {
    if (_promptResolve) {
      closePrompt(null);
    } else {
      close(false);
    }
  });

  // Enter key submits, Escape cancels
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
        close(false);
      }
    }
  });

  // Backdrop click
  let mouseDownOnBackdrop = false;
  els.modal.addEventListener('mousedown', (e) => {
    mouseDownOnBackdrop = e.target === els.modal;
  });
  els.modal.addEventListener('mouseup', (e) => {
    if (mouseDownOnBackdrop && e.target === els.modal) {
      if (_promptResolve) {
        closePrompt(null);
      } else {
        close(false);
      }
    }
    mouseDownOnBackdrop = false;
  });
}
