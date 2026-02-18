import DOMPurify from 'dompurify';

export const sanitizeHtml = (unsafeHtml) => {
  if (typeof unsafeHtml !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(unsafeHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  });
};

export default sanitizeHtml;
