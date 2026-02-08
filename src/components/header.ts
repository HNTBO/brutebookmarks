import { getCardSize, getPageWidth, updateCardSize, updatePageWidth } from '../features/preferences';

export function initSizeController(): void {
  const controller = document.getElementById('size-controller')!;
  const handle = document.getElementById('size-handle')!;
  let isDragging = false;

  function updateHandlePosition(): void {
    const rect = controller.getBoundingClientRect();
    const handleRadius = 8;
    const xPercent = ((getCardSize() - 60) / 60) * 100;
    const yPercent = ((100 - getPageWidth()) / 50) * 100;

    const xPos = handleRadius + (xPercent / 100) * (rect.width - handleRadius * 2);
    const yPos = handleRadius + (yPercent / 100) * (rect.height - handleRadius * 2);

    handle.style.left = `${xPos}px`;
    handle.style.top = `${yPos}px`;
  }

  function startDrag(e: MouseEvent | TouchEvent): void {
    isDragging = true;
    handle.classList.add('dragging');
    e.preventDefault();
  }

  function onDrag(e: MouseEvent | TouchEvent): void {
    if (!isDragging) return;

    const rect = controller.getBoundingClientRect();
    const handleRadius = 8;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const innerWidth = rect.width - handleRadius * 2;
    const innerHeight = rect.height - handleRadius * 2;
    let xPercent = ((clientX - rect.left - handleRadius) / innerWidth) * 100;
    let yPercent = ((clientY - rect.top - handleRadius) / innerHeight) * 100;

    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));

    const newCardSize = Math.round(60 + (xPercent / 100) * 60);
    const newPageWidth = Math.round(100 - (yPercent / 100) * 50);

    updateCardSize(newCardSize);
    updatePageWidth(newPageWidth);
    updateHandlePosition();
  }

  function stopDrag(): void {
    isDragging = false;
    handle.classList.remove('dragging');
  }

  handle.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);

  handle.addEventListener('touchstart', startDrag);
  document.addEventListener('touchmove', onDrag);
  document.addEventListener('touchend', stopDrag);

  controller.addEventListener('click', (e) => {
    if (e.target === handle) return;
    const rect = controller.getBoundingClientRect();
    const handleRadius = 8;
    const innerWidth = rect.width - handleRadius * 2;
    const innerHeight = rect.height - handleRadius * 2;
    let xPercent = ((e.clientX - rect.left - handleRadius) / innerWidth) * 100;
    let yPercent = ((e.clientY - rect.top - handleRadius) / innerHeight) * 100;

    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));

    const newCardSize = Math.round(60 + (xPercent / 100) * 60);
    const newPageWidth = Math.round(100 - (yPercent / 100) * 50);

    updateCardSize(newCardSize);
    updatePageWidth(newPageWidth);
    updateHandlePosition();
  });

  setTimeout(updateHandlePosition, 0);
}
