// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

const base = '/remote.php/dav/files/demo/Notes/Projects/';

describe('renderMarkdown', () => {
  it('renders GitHub flavoured markdown', () => {
    // when
    const html = renderMarkdown('# Titel\n\n- [x] erledigt\n\n| a | b |\n|---|---|\n| 1 | 2 |', base);

    // then
    expect(html).toContain('<h1>Titel</h1>');
    expect(html).toMatch(/<input[^>]*checked/);
    expect(html).toContain('<table>');
  });

  it('strips scripts, event handlers and javascript links because the page shares the Nextcloud origin', () => {
    // when
    const html = renderMarkdown(
      '<script>alert(1)</script><img src="x.png" onerror="alert(2)"><iframe src="https://evil"></iframe>\n\n[klick](javascript:alert(3))',
      base,
    );

    // then
    expect(html).not.toMatch(/<script|onerror|href="javascript:|<iframe/i);
    expect(html).toContain('klick');
  });

  it('drops inline styles so a shared note cannot overlay the app', () => {
    // when
    const html = renderMarkdown('<div style="position:fixed;inset:0">fake login</div>', base);

    // then
    expect(html).not.toContain('style=');
    expect(html).toContain('fake login');
  });

  it('blocks data: and blob: links', () => {
    // when
    const html = renderMarkdown('[a](data:text/html;base64,PHNjcmlwdD4=)\n\n[b](blob:https://x/1)', base);

    // then
    expect(html).not.toMatch(/href="(data|blob):/);
  });

  it('resolves relative images and links against the note folder', () => {
    // when
    const html = renderMarkdown('![bild](pics/a%20b.png) [doc](../Archive/x.pdf) ![](<my pic.png>)', base);

    // then
    expect(html).toContain('src="/remote.php/dav/files/demo/Notes/Projects/pics/a%20b.png"');
    expect(html).toContain('href="/remote.php/dav/files/demo/Notes/Archive/x.pdf"');
    expect(html).toContain('src="/remote.php/dav/files/demo/Notes/Projects/my%20pic.png"');
  });

  it('opens external links in a new tab without leaking the opener', () => {
    // when
    const html = renderMarkdown('[ext](https://example.org) [anchor](#abschnitt)', base);

    // then
    expect(html).toMatch(/<a href="https:\/\/example\.org\/?"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    expect(html).toContain('href="#abschnitt"');
    expect(html).not.toMatch(/href="#abschnitt"[^>]*target/);
  });
});
