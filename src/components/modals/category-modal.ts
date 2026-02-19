import {
  getCategories,
  getTabGroups,
  createCategory,
  updateCategory,
  deleteCategory,
  setCategoryGroup,
  createTabGroup,
  isConvexMode,
} from '../../data/store';
import { registerModal } from '../../utils/modal-manager';
import { styledConfirm, styledPrompt } from './confirm-modal';
import { wireModalSwipeDismiss } from '../../utils/modal-swipe-dismiss';

let editingCategoryId: string | null = null;

function populateGroupSelect(currentGroupId?: string): void {
  const section = document.getElementById('category-group-section') as HTMLElement;
  const select = document.getElementById('category-group-select') as HTMLSelectElement;

  if (!isConvexMode()) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  // Keep the first two options (None + Create new), remove the rest
  while (select.options.length > 2) {
    select.remove(2);
  }

  const groups = getTabGroups();
  for (const group of groups) {
    if (group.categories.length === 0) continue; // skip empty/orphan groups
    const option = document.createElement('option');
    option.value = group.id;
    const tabNames = group.categories.map((c) => c.name).join(', ');
    option.textContent = `${group.name} (${tabNames})`;
    select.appendChild(option);
  }

  select.value = currentGroupId ?? '';
}

export function openAddCategoryModal(): void {
  editingCategoryId = null;
  document.getElementById('category-modal-title')!.textContent = 'New Category';
  (document.getElementById('category-name') as HTMLInputElement).value = '';
  (document.getElementById('editing-category-id') as HTMLInputElement).value = '';
  document.getElementById('delete-category-btn')!.classList.add('hidden');
  document.getElementById('category-save-btn')!.textContent = 'Create Category';
  populateGroupSelect();
  document.getElementById('category-modal')!.classList.add('active');
}

export function openEditCategoryModal(categoryId: string): void {
  editingCategoryId = categoryId;
  const category = getCategories().find((c) => c.id === categoryId);
  if (!category) return;

  document.getElementById('category-modal-title')!.textContent = 'Edit Category';
  (document.getElementById('category-name') as HTMLInputElement).value = category.name;
  (document.getElementById('editing-category-id') as HTMLInputElement).value = categoryId;
  document.getElementById('delete-category-btn')!.classList.remove('hidden');
  document.getElementById('category-save-btn')!.textContent = 'Save Changes';
  populateGroupSelect(category.groupId);
  document.getElementById('category-modal')!.classList.add('active');
}

export function closeCategoryModal(): void {
  document.getElementById('category-modal')!.classList.remove('active');
}

async function deleteCategoryFromModal(): Promise<void> {
  const categoryId = (document.getElementById('editing-category-id') as HTMLInputElement).value;
  if (categoryId && (await styledConfirm('Delete this category and all its bookmarks?', 'Delete Category'))) {
    await deleteCategory(categoryId);
    closeCategoryModal();
  }
}

async function saveCategory(event: Event): Promise<void> {
  event.preventDefault();
  const name = (document.getElementById('category-name') as HTMLInputElement).value;
  const groupSelect = document.getElementById('category-group-select') as HTMLSelectElement;
  const selectedGroupValue = isConvexMode() ? groupSelect.value : '';

  if (editingCategoryId) {
    await updateCategory(editingCategoryId, name);

    // Handle group change
    if (isConvexMode()) {
      const category = getCategories().find((c) => c.id === editingCategoryId);
      const currentGroupId = category?.groupId ?? '';

      if (selectedGroupValue === '__new__') {
        const groupName = await styledPrompt('Enter a name for the new group:', 'New Tab Group');
        if (groupName) {
          await createTabGroup(groupName, [editingCategoryId]);
        }
      } else if (selectedGroupValue !== currentGroupId) {
        await setCategoryGroup(editingCategoryId, selectedGroupValue || null);
      }
    }
  } else {
    await createCategory(name);
    // For new categories with group assignment, we'd need the new category ID
    // which Convex returns asynchronously via subscription. Skip for now.
  }
  closeCategoryModal();
}

export function initCategoryModal(): void {
  registerModal('category-modal', closeCategoryModal);

  document.getElementById('category-modal-close')!.addEventListener('click', closeCategoryModal);
  document.getElementById('category-cancel-btn')!.addEventListener('click', closeCategoryModal);
  document.getElementById('category-form')!.addEventListener('submit', saveCategory);
  document.getElementById('delete-category-btn')!.addEventListener('click', deleteCategoryFromModal);

  // Backdrop click (pointer events for mouse/touch/pen parity)
  const modal = document.getElementById('category-modal')!;
  let pointerDownOnBackdrop = false;
  modal.addEventListener('pointerdown', (e) => {
    pointerDownOnBackdrop = e.target === modal;
  });
  modal.addEventListener('pointerup', (e) => {
    if (pointerDownOnBackdrop && e.target === modal) {
      closeCategoryModal();
    }
    pointerDownOnBackdrop = false;
  });

  // Mobile swipe-down to dismiss
  wireModalSwipeDismiss('category-modal', closeCategoryModal);
}
