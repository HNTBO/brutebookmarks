/**
 * Centralized interaction constants.
 *
 * All gesture thresholds, timers, and distances in one place.
 * Import from here instead of using magic numbers in component files.
 */

// --- Timers (ms) ---

/** Long-press activation delay for touch (bookmark cards). */
export const LONG_PRESS_DELAY = 500;

/** Long-press activation delay for grid background undo/redo menu (touch only).
 *  Deliberately longer than card long-press to require an intentional hold. */
export const GRID_LONG_PRESS_DELAY = 1200;

/** Hover-to-switch delay when dragging a bookmark over a tab. */
export const HOVER_SWITCH_DELAY = 400;

/** Post-drag click guard duration (prevents URL open after desktop drag). */
export const CLICK_GUARD_TIMEOUT = 100;

// --- Distance thresholds (px) ---

/** Mouse/pen drag starts after moving this far from pointerdown. */
export const DRAG_THRESHOLD = 5;

/** Touch movement beyond this cancels a pending long-press timer. */
export const LONG_PRESS_CANCEL_DISTANCE = 10;

/** Horizontal swipe distance to switch tabs. */
export const TAB_SWIPE_THRESHOLD = 50;

/** Vertical movement that cancels a horizontal tab swipe. */
export const TAB_SWIPE_VERTICAL_CANCEL = 15;

/** Horizontal swipe distance to dismiss a context menu. */
export const MENU_SWIPE_DISMISS = 60;

/** Vertical swipe distance to dismiss a modal. */
export const MODAL_SWIPE_DISMISS = 80;

/** Distance from viewport edge that triggers auto-scroll during drag. */
export const AUTO_SCROLL_EDGE = 60;
