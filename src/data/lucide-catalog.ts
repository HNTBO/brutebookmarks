import shapes from 'lucide-static/icon-nodes.json';
import keywords from 'lucide-static/tags.json';
import license from 'lucide-static/LICENSE?raw';
import { escapeHtml } from '../utils/escape-html';

type Shape = [string, Record<string, string>];
const icons = new Map(Object.entries(shapes) as [string, Shape[]][]);
const tags: Record<string, string[]> = keywords;
const favorites: (keyof typeof shapes)[] = ['house', 'router', 'server', 'folder', 'bookmark', 'star', 'globe', 'code', 'headphones', 'camera', 'book-open', 'heart'];
const names = [...new Set([...favorites, ...icons.keys()])];

export function searchIcons(query: string): string[] {
  const term = query.trim().toLowerCase().replace(/\s+/g, '-');
  if (!term) return names;
  const matches = names.filter(name => name.includes(term));
  const exact = matches.indexOf(term);
  if (exact > 0) matches.unshift(...matches.splice(exact, 1));
  return matches.concat(names.filter(name => !name.includes(term) &&
    tags[name]?.some(tag => tag.replace(/\s+/g, '-').includes(term))));
}

export function hasIcon(name: string): boolean {
  return icons.has(name);
}

// Shape markup always comes from the pinned package, including when recoloring a backup.
export function iconSvg(name: string, color: string, portable = false): string {
  const nodes = icons.get(name);
  if (!nodes || !(color === 'currentColor' || /^#[0-9a-f]{6}$/i.test(color))) throw new Error('Invalid Lucide icon');
  const body = nodes.map(([tag, attrs]) => {
    const attributes = Object.entries(attrs).map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(' ');
    return `<${tag} ${attributes}/>`;
  }).join('');
  const notice = portable ? `<metadata>${escapeHtml(license)}</metadata>` : '';
  return `<svg data-bb-lucide="${name}" stroke="${color}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${notice}${body}</svg>`;
}
