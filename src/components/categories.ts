import { categories } from '../data/store';
import { getIconUrl, FALLBACK_ICON } from '../utils/icons';
import { getCardSize, getShowCardNames } from '../features/preferences';
import { handleCardMouseMove, handleCardMouseLeave } from './bookmark-card';
import {
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleCategoryDragOver,
  handleCategoryDragLeave,
  handleCategoryDrop,
} from '../features/drag-drop';

export function renderCategories(): void {
  const container = document.getElementById('categories-container')!;
  container.innerHTML = '';

  if (categories.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No categories yet</h3>
        <p>Click "+ Category" to get started</p>
      </div>
    `;
    return;
  }

  const currentCardSize = getCardSize();
  const showCardNames = getShowCardNames();

  categories.forEach((category) => {
    const categoryEl = document.createElement('div');
    categoryEl.className = 'category';
    categoryEl.dataset.categoryId = category.id;
    categoryEl.innerHTML = `
      <div class="category-header">
        <div class="category-title">
          ${category.name}
        </div>
        <button class="category-edit-btn" data-category-id="${category.id}" title="Edit category">✎</button>
      </div>
      <div class="bookmarks-grid" data-category-id="${category.id}" style="grid-template-columns: repeat(auto-fill, minmax(${currentCardSize}px, 1fr))">
        ${category.bookmarks
          .map(
            (bookmark, index) => `
          <div class="bookmark-card ${!showCardNames ? 'hide-title' : ''}"
               draggable="true"
               data-bookmark-id="${bookmark.id}"
               data-category-id="${category.id}"
               data-index="${index}"
               data-url="${bookmark.url}">
            <button class="edit-btn" data-action="edit-bookmark" data-category-id="${category.id}" data-bookmark-id="${bookmark.id}">✎</button>
            <button class="delete-btn" data-action="delete-bookmark" data-category-id="${category.id}" data-bookmark-id="${bookmark.id}">×</button>
            <img class="bookmark-icon" src="${getIconUrl(bookmark)}" alt="${bookmark.title}" onerror="this.src='${FALLBACK_ICON}'">
            <div class="bookmark-title">${bookmark.title}</div>
          </div>
        `,
          )
          .join('')}
        <div class="bookmark-card add-bookmark" data-action="add-bookmark" data-category-id="${category.id}">
          <div class="plus-icon">+</div>
          <div class="add-bookmark-text">Add</div>
        </div>
      </div>
    `;
    container.appendChild(categoryEl);

    // Wire event listeners for bookmark cards
    const bookmarkCards = categoryEl.querySelectorAll<HTMLElement>('.bookmark-card:not(.add-bookmark)');
    bookmarkCards.forEach((card) => {
      card.addEventListener('dragstart', handleDragStart as EventListener);
      card.addEventListener('dragend', handleDragEnd as EventListener);
      card.addEventListener('dragover', handleDragOver as EventListener);
      card.addEventListener('drop', ((e: DragEvent) => handleDrop(e, renderCategories)) as EventListener);
      card.addEventListener('dragleave', handleDragLeave as EventListener);
      card.addEventListener('mousemove', handleCardMouseMove as EventListener);
      card.addEventListener('mouseleave', handleCardMouseLeave as EventListener);

      // Click to open bookmark
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-action]')) return;
        const url = card.dataset.url;
        if (url) window.open(url, '_blank');
      });
    });

    // Category-level drag handlers
    categoryEl.addEventListener('dragover', handleCategoryDragOver as EventListener);
    categoryEl.addEventListener('dragleave', handleCategoryDragLeave as EventListener);
    categoryEl.addEventListener('drop', ((e: DragEvent) => handleCategoryDrop(e, renderCategories)) as EventListener);
  });
}
