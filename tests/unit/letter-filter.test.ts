import { describe, expect, it } from 'vitest';
import { createDoublePressDetector, nextLetterFilterState, NO_LETTER_FILTER } from '../../src/features/letter-filter';

describe('nextLetterFilterState', () => {
  it('filters per category on a single press', () => {
    expect(nextLetterFilterState(NO_LETTER_FILTER, 'g', false)).toEqual({ letter: 'g', mode: 'category' });
  });

  it('opens the flat view on a double press', () => {
    const afterFirst = nextLetterFilterState(NO_LETTER_FILTER, 'g', false);
    expect(nextLetterFilterState(afterFirst, 'g', true)).toEqual({ letter: 'g', mode: 'flat' });
  });

  it('clears the filter when the active letter is pressed once, in either mode', () => {
    expect(nextLetterFilterState({ letter: 'g', mode: 'category' }, 'g', false)).toEqual(NO_LETTER_FILTER);
    expect(nextLetterFilterState({ letter: 'g', mode: 'flat' }, 'g', false)).toEqual(NO_LETTER_FILTER);
  });

  it('keeps the current mode when switching letters', () => {
    expect(nextLetterFilterState({ letter: 'g', mode: 'category' }, 'h', false)).toEqual({ letter: 'h', mode: 'category' });
    expect(nextLetterFilterState({ letter: 'g', mode: 'flat' }, 'h', false)).toEqual({ letter: 'h', mode: 'flat' });
  });
});

describe('createDoublePressDetector', () => {
  it('detects the same letter within the window', () => {
    const isDouble = createDoublePressDetector(400);
    expect(isDouble('g', 0)).toBe(false);
    expect(isDouble('g', 300)).toBe(true);
  });

  it('ignores slow repeats and different letters', () => {
    const isDouble = createDoublePressDetector(400);
    expect(isDouble('g', 0)).toBe(false);
    expect(isDouble('g', 500)).toBe(false);
    expect(isDouble('h', 600)).toBe(false);
  });

  it('consumes a double press so a third quick press is single', () => {
    const isDouble = createDoublePressDetector(400);
    expect(isDouble('g', 0)).toBe(false);
    expect(isDouble('g', 100)).toBe(true);
    expect(isDouble('g', 200)).toBe(false);
  });
});
