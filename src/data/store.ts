import type { Category } from '../types';

const API_BASE = window.location.origin;

export let categories: Category[] = [];

export function setCategories(data: Category[]): void {
  categories = data;
}

export async function initializeData(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/api/data`);
    if (response.ok) {
      categories = await response.json();
    } else {
      throw new Error('Server returned error');
    }
  } catch (error) {
    console.warn('Failed to load from server, using localStorage fallback:', error);
    const savedData = localStorage.getItem('speedDialData');
    if (savedData) {
      categories = JSON.parse(savedData);
    } else {
      categories = [];
    }
  }
}

export async function saveData(): Promise<void> {
  localStorage.setItem('speedDialData', JSON.stringify(categories));

  try {
    const response = await fetch(`${API_BASE}/api/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categories),
    });
    if (!response.ok) {
      console.error('Failed to save to server');
    }
  } catch (error) {
    console.error('Error saving to server:', error);
  }
}
