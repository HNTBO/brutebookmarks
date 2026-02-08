import { categories, setCategories, saveData } from '../../data/store';
import { renderCategories } from '../categories';

let editingCategoryId: string | null = null;

export function openAddCategoryModal(): void {
  editingCategoryId = null;
  document.getElementById('category-modal-title')!.textContent = 'New Category';
  (document.getElementById('category-name') as HTMLInputElement).value = '';
  (document.getElementById('editing-category-id') as HTMLInputElement).value = '';
  (document.getElementById('delete-category-btn') as HTMLElement).style.display = 'none';
  document.getElementById('category-save-btn')!.textContent = 'Create Category';
  document.getElementById('category-modal')!.classList.add('active');
}

export function openEditCategoryModal(categoryId: string): void {
  editingCategoryId = categoryId;
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return;

  document.getElementById('category-modal-title')!.textContent = 'Edit Category';
  (document.getElementById('category-name') as HTMLInputElement).value = category.name;
  (document.getElementById('editing-category-id') as HTMLInputElement).value = categoryId;
  (document.getElementById('delete-category-btn') as HTMLElement).style.display = 'block';
  document.getElementById('category-save-btn')!.textContent = 'Save Changes';
  document.getElementById('category-modal')!.classList.add('active');
}

export function closeCategoryModal(): void {
  document.getElementById('category-modal')!.classList.remove('active');
}

function deleteCategoryFromModal(): void {
  const categoryId = (document.getElementById('editing-category-id') as HTMLInputElement).value;
  if (categoryId && confirm('Delete this category and all its bookmarks?')) {
    setCategories(categories.filter((c) => c.id !== categoryId));
    saveData();
    renderCategories();
    closeCategoryModal();
  }
}

function saveCategory(event: Event): void {
  event.preventDefault();
  const name = (document.getElementById('category-name') as HTMLInputElement).value;

  if (editingCategoryId) {
    const category = categories.find((c) => c.id === editingCategoryId);
    if (category) {
      category.name = name;
    }
  } else {
    const newCategory = {
      id: 'c' + Date.now(),
      name,
      bookmarks: [],
    };
    categories.push(newCategory);
  }
  saveData();
  renderCategories();
  closeCategoryModal();
}

export function initCategoryModal(): void {
  document.getElementById('category-modal-close')!.addEventListener('click', closeCategoryModal);
  document.getElementById('category-cancel-btn')!.addEventListener('click', closeCategoryModal);
  document.getElementById('category-form')!.addEventListener('submit', saveCategory);
  document.getElementById('delete-category-btn')!.addEventListener('click', deleteCategoryFromModal);

  // Backdrop click
  let mouseDownOnBackdrop = false;
  const modal = document.getElementById('category-modal')!;
  modal.addEventListener('mousedown', (e) => {
    mouseDownOnBackdrop = e.target === modal;
  });
  modal.addEventListener('mouseup', (e) => {
    if (mouseDownOnBackdrop && e.target === modal) {
      closeCategoryModal();
    }
    mouseDownOnBackdrop = false;
  });
}
