import { ConvexError } from 'convex/values';

export const IMPORT_CAPACITY = 'BOOKMARK_IMPORT_CAPACITY';

export function validateSyncImportCount(data: { bookmarks: unknown[] }[]): void {
  if (data.length > 500) throw new Error(`Import exceeds maximum of 500 categories (got ${data.length})`);
  const bookmarks = data.reduce((sum, cat) => sum + cat.bookmarks.length, 0);
  if (bookmarks > 5000) throw new Error(`Import exceeds maximum of 5000 bookmarks (got ${bookmarks})`);
}

// Convex may redact ordinary exceptions at the client boundary. Translate
// database byte-limit failures inside the import mutation, where they occur.
export function isTransactionByteLimit(error: unknown): boolean {
  return error instanceof Error && /^(?:Uncaught )?(?:Error: )?Too many bytes (?:read|written) in a single function execution \(limit:/im.test(error.message);
}

export function isImportCapacityError(error: unknown): boolean {
  if (error instanceof ConvexError) return error.data === IMPORT_CAPACITY;
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 413) return true;
  if (!(error instanceof Error)) return false;
  return error.name === 'QuotaExceededError' || isTransactionByteLimit(error)
    || /\b413[: ]+ *(?:Payload Too Large|Request Entity Too Large|Content Too Large)\b/i.test(error.message)
    || /\bArguments for bookmarks(?:\.js)?:importBulk are too large \(actual:/i.test(error.message);
}
