import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

let _cachedStats: { count: number; cap: number } | null = null;

export async function getFoundingMemberStats(): Promise<{ count: number; cap: number }> {
  if (_cachedStats) return _cachedStats;

  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) return { count: 0, cap: 1000 };

  try {
    const client = new ConvexHttpClient(url);
    const stats = await client.query(api.preferences.getFoundingMemberStats);
    _cachedStats = stats;
    return stats;
  } catch {
    return { count: 0, cap: 1000 };
  }
}
