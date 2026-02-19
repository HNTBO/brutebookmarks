import { describe, it, expect } from 'vitest';
import { detectFormat, parseJSON } from '../../src/utils/bookmark-parsers';

// ---------------------------------------------------------------------------
// detectFormat
// ---------------------------------------------------------------------------

describe('detectFormat', () => {
  it('detects Netscape HTML format by DOCTYPE', () => {
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><DT>...';
    expect(detectFormat(html)).toBe('netscape-html');
  });

  it('detects Netscape HTML format by leading <DL tag (case-insensitive)', () => {
    expect(detectFormat('<DL><p>')).toBe('netscape-html');
    expect(detectFormat('  <DL><p>')).toBe('netscape-html');
  });

  it('detects JSON format starting with [', () => {
    expect(detectFormat('[{"name":"cat"}]')).toBe('json');
  });

  it('detects JSON format starting with {', () => {
    expect(detectFormat('{"categories":[]}')).toBe('json');
  });

  it('detects JSON format with leading whitespace', () => {
    expect(detectFormat('  \n  [{"name":"cat"}]')).toBe('json');
  });

  it('returns "unknown" for arbitrary content', () => {
    expect(detectFormat('Hello World')).toBe('unknown');
    expect(detectFormat('')).toBe('unknown');
    expect(detectFormat('Some random text with no special start')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// parseJSON
// ---------------------------------------------------------------------------

describe('parseJSON', () => {
  it('parses a valid category array', () => {
    const input = JSON.stringify([
      {
        id: 'c1',
        name: 'Dev Tools',
        bookmarks: [
          { id: 'b1', title: 'GitHub', url: 'https://github.com', iconPath: null },
        ],
      },
    ]);
    const result = parseJSON(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Dev Tools');
    expect(result[0].bookmarks).toHaveLength(1);
    expect(result[0].bookmarks[0].url).toBe('https://github.com');
  });

  it('throws on non-array input', () => {
    expect(() => parseJSON('{"name":"not an array"}')).toThrow(
      'Expected an array of categories',
    );
  });

  it('throws on invalid category structure (missing name)', () => {
    const input = JSON.stringify([{ bookmarks: [] }]);
    expect(() => parseJSON(input)).toThrow('Invalid category structure');
  });

  it('throws on invalid category structure (missing bookmarks array)', () => {
    const input = JSON.stringify([{ name: 'Test' }]);
    expect(() => parseJSON(input)).toThrow('Invalid category structure');
  });

  it('throws on invalid bookmark structure (missing title)', () => {
    const input = JSON.stringify([
      { name: 'Cat', bookmarks: [{ url: 'https://example.com' }] },
    ]);
    expect(() => parseJSON(input)).toThrow('Invalid bookmark structure');
  });

  it('throws on invalid bookmark structure (missing url)', () => {
    const input = JSON.stringify([
      { name: 'Cat', bookmarks: [{ title: 'Test' }] },
    ]);
    expect(() => parseJSON(input)).toThrow('Invalid bookmark structure');
  });

  it('rejects javascript: URLs', () => {
    const input = JSON.stringify([
      {
        name: 'Cat',
        bookmarks: [{ title: 'XSS', url: 'javascript:alert(1)' }],
      },
    ]);
    expect(() => parseJSON(input)).toThrow('Invalid URL scheme');
  });

  it('truncates category name longer than 200 characters', () => {
    const longName = 'A'.repeat(250);
    const input = JSON.stringify([
      {
        name: longName,
        bookmarks: [
          { title: 'Test', url: 'https://example.com', iconPath: null },
        ],
      },
    ]);
    const result = parseJSON(input);
    expect(result[0].name).toHaveLength(200);
  });

  it('truncates bookmark title longer than 500 characters', () => {
    const longTitle = 'B'.repeat(600);
    const input = JSON.stringify([
      {
        name: 'Cat',
        bookmarks: [
          { title: longTitle, url: 'https://example.com', iconPath: null },
        ],
      },
    ]);
    const result = parseJSON(input);
    expect(result[0].bookmarks[0].title).toHaveLength(500);
  });

  it('throws when bookmark URL exceeds 2048 characters', () => {
    const longUrl = 'https://example.com/' + 'x'.repeat(2048);
    const input = JSON.stringify([
      {
        name: 'Cat',
        bookmarks: [{ title: 'Test', url: longUrl, iconPath: null }],
      },
    ]);
    expect(() => parseJSON(input)).toThrow('Bookmark URL exceeds maximum length');
  });

  it('nullifies iconPath when it is not a string', () => {
    const input = JSON.stringify([
      {
        name: 'Cat',
        bookmarks: [
          { title: 'Test', url: 'https://example.com', iconPath: 12345 },
        ],
      },
    ]);
    const result = parseJSON(input);
    expect(result[0].bookmarks[0].iconPath).toBeNull();
  });

  it('nullifies iconPath when it exceeds 2048 characters', () => {
    const longIcon = 'https://example.com/' + 'i'.repeat(2048);
    const input = JSON.stringify([
      {
        name: 'Cat',
        bookmarks: [
          { title: 'Test', url: 'https://example.com', iconPath: longIcon },
        ],
      },
    ]);
    const result = parseJSON(input);
    expect(result[0].bookmarks[0].iconPath).toBeNull();
  });
});
