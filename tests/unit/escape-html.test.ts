import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/utils/escape-html';

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('&')).toBe('&amp;');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<')).toBe('&lt;');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('>')).toBe('&gt;');
  });

  it('escapes double quote', () => {
    expect(escapeHtml('"')).toBe('&quot;');
  });

  it('escapes single quote', () => {
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('escapes multiple special characters in one string', () => {
    expect(escapeHtml('<div class="test">')).toBe(
      '&lt;div class=&quot;test&quot;&gt;',
    );
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('leaves strings with no special characters unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('neutralizes a script injection attempt', () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
    );
  });

  it('neutralizes an attribute breakout attempt', () => {
    expect(escapeHtml('" onload="alert(1)')).toBe(
      '&quot; onload=&quot;alert(1)',
    );
  });
});
