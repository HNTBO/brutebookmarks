export function handleCardMouseMove(e: MouseEvent): void {
  const card = e.currentTarget as HTMLElement;
  const rect = card.getBoundingClientRect();

  // Proximity radius scales with card size (matches CSS % button sizing)
  const proximityRadius = Math.max(25, rect.width * 0.35);

  const editBtn = card.querySelector<HTMLElement>('.edit-btn');
  const deleteBtn = card.querySelector<HTMLElement>('.delete-btn');

  if (editBtn) {
    const br = editBtn.getBoundingClientRect();
    const dx = e.clientX - (br.left + br.width / 2);
    const dy = e.clientY - (br.top + br.height / 2);
    editBtn.classList.toggle('visible', Math.sqrt(dx * dx + dy * dy) <= proximityRadius);
  }

  if (deleteBtn) {
    const br = deleteBtn.getBoundingClientRect();
    const dx = e.clientX - (br.left + br.width / 2);
    const dy = e.clientY - (br.top + br.height / 2);
    deleteBtn.classList.toggle('visible', Math.sqrt(dx * dx + dy * dy) <= proximityRadius);
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
