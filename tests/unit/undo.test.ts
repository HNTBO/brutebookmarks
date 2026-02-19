import { describe, it, expect, vi, beforeEach } from 'vitest';

// Helper: fresh-import the undo module to reset module-level state between tests.
async function freshImport() {
  const mod = await import('../../src/features/undo');
  return mod;
}

describe('undo system', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // -----------------------------------------------------------------------
  // Basic push / undo / redo
  // -----------------------------------------------------------------------

  it('pushUndo adds to stack; undo executes undo fn; redo executes redo fn', async () => {
    const { pushUndo, undo, redo } = await freshImport();
    const undoFn = vi.fn();
    const redoFn = vi.fn();

    pushUndo({ undo: undoFn, redo: redoFn });

    await undo();
    expect(undoFn).toHaveBeenCalledTimes(1);
    expect(redoFn).not.toHaveBeenCalled();

    await redo();
    expect(redoFn).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Empty-stack no-ops
  // -----------------------------------------------------------------------

  it('undo on empty stack is a no-op', async () => {
    const { undo } = await freshImport();
    // Should not throw
    await expect(undo()).resolves.toBeUndefined();
  });

  it('redo on empty stack is a no-op', async () => {
    const { redo } = await freshImport();
    await expect(redo()).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // pushUndo clears redo stack
  // -----------------------------------------------------------------------

  it('pushUndo clears the redo stack', async () => {
    const { pushUndo, undo, redo } = await freshImport();
    const undoFn1 = vi.fn();
    const redoFn1 = vi.fn();
    const undoFn2 = vi.fn();
    const redoFn2 = vi.fn();

    pushUndo({ undo: undoFn1, redo: redoFn1 });
    await undo(); // moves entry to redo stack

    // Push a new entry — this should clear the redo stack
    pushUndo({ undo: undoFn2, redo: redoFn2 });

    // Redo should now be a no-op (redo stack was cleared)
    await redo();
    expect(redoFn1).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Grouping
  // -----------------------------------------------------------------------

  it('beginGroup/endGroup creates grouped entries that undo/redo together', async () => {
    const { pushUndo, beginGroup, endGroup, undo, redo } = await freshImport();
    const order: string[] = [];

    beginGroup();
    pushUndo({
      undo: () => { order.push('undo-A'); },
      redo: () => { order.push('redo-A'); },
    });
    pushUndo({
      undo: () => { order.push('undo-B'); },
      redo: () => { order.push('redo-B'); },
    });
    endGroup();

    // Undo should execute both entries in REVERSED order
    await undo();
    expect(order).toEqual(['undo-B', 'undo-A']);

    // Redo should execute both entries in ORIGINAL order
    order.length = 0;
    await redo();
    expect(order).toEqual(['redo-A', 'redo-B']);
  });

  // -----------------------------------------------------------------------
  // MAX_STACK overflow
  // -----------------------------------------------------------------------

  it('drops oldest entry when stack exceeds MAX_STACK (50)', async () => {
    const { pushUndo, undo } = await freshImport();
    const fns: ReturnType<typeof vi.fn>[] = [];

    for (let i = 0; i < 51; i++) {
      const fn = vi.fn();
      fns.push(fn);
      pushUndo({ undo: fn, redo: vi.fn() });
    }

    // The first entry (fns[0]) should have been dropped.
    // Undo all 50 remaining entries.
    for (let i = 0; i < 50; i++) {
      await undo();
    }

    // fns[0] was shifted off — should never have been called
    expect(fns[0]).not.toHaveBeenCalled();
    // fns[1] through fns[50] should each have been called once
    for (let i = 1; i <= 50; i++) {
      expect(fns[i]).toHaveBeenCalledTimes(1);
    }

    // One more undo should be a no-op (stack empty)
    await expect(undo()).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // isUndoing flag
  // -----------------------------------------------------------------------

  it('isUndoing is true during undo execution, false otherwise', async () => {
    const { pushUndo, undo, isUndoing } = await freshImport();
    let flagDuringUndo = false;

    expect(isUndoing()).toBe(false);

    pushUndo({
      undo: () => { flagDuringUndo = isUndoing(); },
      redo: vi.fn(),
    });

    await undo();
    expect(flagDuringUndo).toBe(true);
    expect(isUndoing()).toBe(false);
  });

  it('isUndoing is true during redo execution', async () => {
    const { pushUndo, undo, redo, isUndoing } = await freshImport();
    let flagDuringRedo = false;

    pushUndo({
      undo: vi.fn(),
      redo: () => { flagDuringRedo = isUndoing(); },
    });

    await undo();
    await redo();
    expect(flagDuringRedo).toBe(true);
    expect(isUndoing()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // pushUndo ignored during undo/redo execution
  // -----------------------------------------------------------------------

  it('pushUndo is ignored while undo is executing (isUndoing guard)', async () => {
    const { pushUndo, undo, redo } = await freshImport();
    const sneakyRedo = vi.fn();

    pushUndo({
      undo: () => {
        // Attempt to push during undo — should be silently ignored
        pushUndo({ undo: vi.fn(), redo: sneakyRedo });
      },
      redo: vi.fn(),
    });

    await undo();

    // The sneaky entry should NOT be on the stack, so redo should only
    // find the original entry (which was moved to redo stack by undo()).
    await redo();
    expect(sneakyRedo).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Async undo/redo functions
  // -----------------------------------------------------------------------

  it('handles async undo/redo functions correctly', async () => {
    const { pushUndo, undo, redo } = await freshImport();
    const order: string[] = [];

    pushUndo({
      undo: async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push('async-undo');
      },
      redo: async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push('async-redo');
      },
    });

    await undo();
    expect(order).toEqual(['async-undo']);

    await redo();
    expect(order).toEqual(['async-undo', 'async-redo']);
  });
});
