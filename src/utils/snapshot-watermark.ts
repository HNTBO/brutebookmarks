import type { Category } from '../types';

export interface LocalTabGroupSnapshot {
  id: string;
  name: string;
  order: number;
}

export interface SnapshotCacheMeta {
  version: 1;
  cachedAt: number;
  snapshotDigest: string;
  watermarkRevision?: number;
  watermarkUpdatedAt?: number;
}

export interface StartupWatermark {
  source: 'watermark' | 'legacyDigest';
  revision: number;
  updatedAt: number;
  digest?: string;
}

export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildSnapshotDigest(categories: Category[], tabGroups: LocalTabGroupSnapshot[]): string {
  const catParts = [...categories]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
    .map((c) => `${c.id}|${c.name}|${c.order ?? 0}|${c.groupId ?? ''}`);

  const bookmarkParts = categories
    .flatMap((c) =>
      c.bookmarks.map((b) => ({
        id: b.id,
        categoryId: c.id,
        title: b.title,
        url: b.url,
        iconPath: b.iconPath ?? '',
        order: b.order ?? 0,
      })),
    )
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order || a.id.localeCompare(b.id))
    .map((b) => `${b.id}|${b.categoryId}|${b.title}|${b.url}|${b.iconPath}|${b.order}`);

  const groupParts = [...tabGroups]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((g) => `${g.id}|${g.name}|${g.order}`);

  return fnv1a32(`${catParts.join('~')}#${bookmarkParts.join('~')}#${groupParts.join('~')}`);
}

export function shouldRenderSnapshotCache(
  meta: SnapshotCacheMeta | null,
  watermark: StartupWatermark | null,
): boolean {
  if (!meta || !watermark) return false;
  if (watermark.source === 'watermark') {
    return typeof meta.watermarkRevision === 'number' && meta.watermarkRevision === watermark.revision;
  }
  return Boolean(meta.snapshotDigest && watermark.digest && meta.snapshotDigest === watermark.digest);
}
