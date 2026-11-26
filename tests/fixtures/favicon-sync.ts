import { getFunctionName, type FunctionReference } from 'convex/server';
import { replaceIcon, update } from '../../convex/bookmarks';
import { initConvexClient } from '../../src/data/convex-client';
import { activateConvex } from '../../src/data/store';

type Row = { title: string; url: string; iconPath?: string; importedFavicon?: true; userId: string };
let row: Row;
let complete: (result: unknown) => void;
export let writes = 0;

const ctx = {
  auth: { getUserIdentity: async () => ({ subject: 'fixture' }) },
  db: {
    get: async () => row,
    patch: async (id: string, patch: Partial<Row>) => { if (id === 'one') Object.assign(row, patch); },
    query: () => ({ withIndex: () => ({ first: async () => ({ _id: 'watermark', revision: 1 }) }) }),
  },
};

export function start(rowData: Omit<Row, 'userId'>) {
  row = { ...rowData, userId: 'fixture' };
  window.__BB_MOCK_CONVEX_CLIENT__ = {
    onUpdate: () => () => {},
    action: () => new Promise(resolve => { complete = resolve; }),
    mutation: async (ref: FunctionReference<'mutation'>, args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      if (name === 'bookmarks:create') {
        row = { ...args, userId: 'fixture' } as Row;
        return 'one';
      }
      if (name !== 'bookmarks:update' && name !== 'bookmarks:replaceIcon') throw new Error(name);
      const mutation = (name === 'bookmarks:update' ? update : replaceIcon) as unknown as {
        _handler(context: typeof ctx, args: Record<string, unknown>): Promise<unknown>;
      };
      const result = await mutation._handler(ctx, args);
      writes++;
      return result;
    },
  } as unknown as Window['__BB_MOCK_CONVEX_CLIENT__'];
  initConvexClient();
  activateConvex();
}

export function saveEditAndFinish(edit: Partial<Row>, result: unknown) {
  Object.assign(row, edit);
  complete(result);
}

export function current() { return row; }
