import DOMPurify from 'dompurify';
import { Marked } from 'marked';

const marked = new Marked({ gfm: true, breaks: false, async: false });
const isRelative = (url: string) => !!url && !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url);
const isExternal = (url: string) => /^https?:\/\//i.test(url);

function resolve(url: string, baseHref: string) {
  const resolved = new URL(url, `https://base${baseHref}`);
  return resolved.pathname + resolved.search + resolved.hash;
}

export function renderMarkdown(source: string, baseHref: string): string {
  const html = marked.parse(source) as string;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    for (const attr of ['src', 'href']) {
      const value = node.getAttribute(attr);
      if (value && isRelative(value)) node.setAttribute(attr, resolve(value, baseHref));
    }
    const href = node.getAttribute('href');
    if (node.tagName === 'A' && href && isExternal(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  try {
    return DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form'], FORBID_ATTR: ['style'], ADD_ATTR: ['target'] });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}
