const PROXIMITY_RADIUS = 45;

export function handleCardMouseMove(e: MouseEvent): void {
  const card = e.currentTarget as HTMLElement;
  const rect = card.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const editBtn = card.querySelector<HTMLElement>('.edit-btn');
  const deleteBtn = card.querySelector<HTMLElement>('.delete-btn');

  const editDistance = Math.sqrt(Math.pow(mouseX - 14, 2) + Math.pow(mouseY - 14, 2));
  const deleteDistance = Math.sqrt(Math.pow(mouseX - (rect.width - 14), 2) + Math.pow(mouseY - 14, 2));

  if (editBtn) {
    editBtn.classList.toggle('visible', editDistance <= PROXIMITY_RADIUS);
  }

  if (deleteBtn) {
    deleteBtn.classList.toggle('visible', deleteDistance <= PROXIMITY_RADIUS);
  }
}

export function handleCardMouseLeave(e: MouseEvent): void {
  const card = e.currentTarget as HTMLElement;
  const editBtn = card.querySelector<HTMLElement>('.edit-btn');
  const deleteBtn = card.querySelector<HTMLElement>('.delete-btn');

  if (editBtn) editBtn.classList.remove('visible');
  if (deleteBtn) deleteBtn.classList.remove('visible');
}

export function openBookmark(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
