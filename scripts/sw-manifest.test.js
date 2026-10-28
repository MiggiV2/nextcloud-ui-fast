import { describe, expect, it } from 'vitest';
import { injectManifest } from './sw-manifest.js';

const template = "const VERSION = '__VERSION__';\nconst PRECACHE = __PRECACHE__;\n";

describe('injectManifest', () => {
  it('lists every built asset so the shell and its assets are cached together', () => {
    // when
    const sw = injectManifest(template, ['assets/index-a.js', 'assets/index-b.css', 'assets/dav.worker-c.js']);

    // then
    expect(sw).toContain('const PRECACHE = ["assets/dav.worker-c.js","assets/index-a.js","assets/index-b.css"];');
  });

  it('derives the cache version from the asset names so every release gets a fresh cache', () => {
    // when
    const first = injectManifest(template, ['assets/index-a.js']);
    const same = injectManifest(template, ['assets/index-a.js']);
    const next = injectManifest(template, ['assets/index-z.js']);

    // then
    expect(first).toBe(same);
    expect(first).not.toBe(next);
    expect(first).toMatch(/const VERSION = '[0-9a-f]{12}';/);
  });

  it('fails loudly when the template placeholders are missing', () => {
    expect(() => injectManifest('const x = 1;', ['assets/a.js'])).toThrow(/placeholder/);
  });
});
