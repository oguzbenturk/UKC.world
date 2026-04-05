export function setDocumentTitle(title) {
  if (typeof document !== 'undefined' && title) {
    document.title = title;
  }
}

export function setMetaTag(name, content) {
  if (typeof document === 'undefined' || !content) return;
  let el = document.querySelector(`meta[name='${name}']`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function setOgTag(property, content) {
  if (typeof document === 'undefined' || !content) return;
  let el = document.querySelector(`meta[property='${property}']`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function setLinkTag(rel, href) {
  if (typeof document === 'undefined' || !href) return;
  let el = document.querySelector(`link[rel='${rel}']`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function usePageSEO({ title, description, path }) {
  // lightweight effect replacement without React imports to avoid coupling
  queueMicrotask(() => {
    if (title) setDocumentTitle(title);
    if (description) setMetaTag('description', description);
    if (title) setOgTag('og:title', title);
    if (description) setOgTag('og:description', description);
    if (path) {
      const makeAbsolute = (p) => {
        if (/^https?:\/\//i.test(p)) return p;
        const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || 'https://plannivo.com';
        if (p.startsWith('/')) return `${origin}${p}`;
        return `${origin}/${p}`;
      };
      const absoluteUrl = makeAbsolute(path);
      setOgTag('og:url', absoluteUrl);
      setLinkTag('canonical', absoluteUrl);
    }
  });
}
