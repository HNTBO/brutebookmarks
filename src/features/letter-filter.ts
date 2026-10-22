/**
 * Letter filter state for keyboard bookmark filtering.
 *
 * - 'category': each category shows only its bookmarks starting with the letter.
 * - 'flat': categories are flattened into one view of every matching bookmark.
 */
export type LetterFilterMode = 'category' | 'flat';

export interface LetterFilterState {
  letter: string | null;
  mode: LetterFilterMode;
}

export const NO_LETTER_FILTER: LetterFilterState = { letter: null, mode: 'category' };

/**
 * Resolve the filter state after a letter key press.
 * A double press always opens the flat view; a single press of the active
 * letter clears the filter; any other single press keeps the current mode.
 */
export function nextLetterFilterState(
  state: LetterFilterState,
  letter: string,
  isDoublePress: boolean,
): LetterFilterState {
  if (isDoublePress) return { letter, mode: 'flat' };
  if (state.letter === letter) return NO_LETTER_FILTER;
  return { letter, mode: state.mode };
}

/**
 * Detects the same letter pressed twice within `windowMs`.
 * A detected double press is consumed, so a third quick press counts as single.
 */
export function createDoublePressDetector(windowMs: number): (letter: string, at: number) => boolean {
  let last: { letter: string; at: number } | null = null;
  return (letter, at) => {
    const isDouble = last !== null && last.letter === letter && at - last.at <= windowMs;
    last = isDouble ? null : { letter, at };
    return isDouble;
  };
}
