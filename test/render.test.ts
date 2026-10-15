import { describe, expect, it } from 'vitest';
import { renderContent } from '../src/content/render.ts';

/** Flatten rendered React nodes to plain text for assertions. */
function text(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  const el = node as { props?: { children?: unknown; id?: string } };
  if (el.props?.id !== undefined && el.props.children === undefined) return `[${el.props.id}]`;
  return text(el.props?.children);
}

describe('content renderer', () => {
  it('a bare asterisk (c*) does not swallow later emphasis', () => {
    // The exact hazard: c* followed by a bold run in the same block. Before the
    // right-flanking guard, the italic regex matched from c* to the bold and
    // silently deleted the prose between them.
    const out = renderContent('Delivered c* is 1800 m/s and **that** matters.');
    const t = text(out);
    expect(t).toContain('c* is 1800 m/s');
    expect(t).toContain('that');
    expect(t).toContain('matters');
  });

  it('still renders genuine emphasis', () => {
    expect(text(renderContent('this is *italic* here'))).toBe('this is italic here');
    expect(text(renderContent('this is **bold** here'))).toBe('this is bold here');
  });

  it('backslash escapes an asterisk', () => {
    expect(text(renderContent(String.raw`five \* four`))).toBe('five * four');
  });

  it('unknown directive ids degrade instead of crashing', () => {
    expect(() => renderContent('see {term:not-a-real-concept} and {eq:nope}')).not.toThrow();
  });
});
