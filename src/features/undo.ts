interface UndoEntry {
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
}

interface UndoGroup {
  entries: UndoEntry[];
}

type StackItem = UndoEntry | UndoGroup;

const undoStack: StackItem[] = [];
const redoStack: StackItem[] = [];
const MAX_STACK = 50;

let _isUndoing = false;
let _groupEntries: UndoEntry[] | null = null;
let _afterUndoRedo: (() => void) | null = null;

export function pushUndo(entry: UndoEntry): void {
  if (_isUndoing) return;
  if (_groupEntries) {
    _groupEntries.push(entry);
    return;
  }
  undoStack.push(entry);
  if (undoStack.length > MAX_STACK) undoStack.shift();
  redoStack.length = 0;
}

export function beginGroup(): void {
  _groupEntries = [];
}

export function endGroup(): void {
  if (!_groupEntries) return;
  if (_groupEntries.length > 0) {
    undoStack.push({ entries: _groupEntries });
    if (undoStack.length > MAX_STACK) undoStack.shift();
    redoStack.length = 0;
  }
  _groupEntries = null;
}

export function isUndoing(): boolean {
  return _isUndoing;
}

/**
 * Run a function as an undo group. All pushUndo() calls within fn()
 * are collected into a single group that undoes/redoes atomically.
 * Safe against exceptions (endGroup is always called via finally).
 * Nested calls are flattened — inner runInUndoGroup adds to the outer group.
 */
export async function runInUndoGroup(fn: () => Promise<void> | void): Promise<void> {
  const isNested = _groupEntries !== null;
  if (!isNested) beginGroup();
  try {
    await fn();
  } finally {
    if (!isNested) endGroup();
  }
}

export function setAfterUndoRedoCallback(cb: () => void): void {
  _afterUndoRedo = cb;
}

async function executeItem(item: StackItem, direction: 'undo' | 'redo'): Promise<void> {
  if ('entries' in item) {
    const items = direction === 'undo' ? [...item.entries].reverse() : item.entries;
    for (const entry of items) {
      await (direction === 'undo' ? entry.undo() : entry.redo());
    }
  } else {
    await (direction === 'undo' ? item.undo() : item.redo());
  }
}

export async function undo(): Promise<void> {
  const item = undoStack.pop();
  if (!item) return;
  _isUndoing = true;
  try {
    await executeItem(item, 'undo');
    redoStack.push(item);
  } catch (err) {
    // Restore item so it's not lost
    undoStack.push(item);
    throw err;
  } finally {
    _isUndoing = false;
  }
  _afterUndoRedo?.();
}

export async function redo(): Promise<void> {
  const item = redoStack.pop();
  if (!item) return;
  _isUndoing = true;
  try {
    await executeItem(item, 'redo');
    undoStack.push(item);
  } catch (err) {
    // Restore item so it's not lost
    redoStack.push(item);
    throw err;
  } finally {
    _isUndoing = false;
  }
  _afterUndoRedo?.();
}
