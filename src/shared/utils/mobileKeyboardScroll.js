/* Global mobile keyboard focus handler.
   When an editable element is focused on a small screen, wait for the
   keyboard animation, then scroll the element into view if visualViewport
   tells us it is occluded by the keyboard.
   Imported once from main.jsx for its side effect (a single focusin
   listener on document). */

const FOCUS_DELAY_MS = 300;
const KEYBOARD_CLEARANCE_PX = 20;

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

const isEditable = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const t = (el.type || '').toLowerCase();
    return t !== 'checkbox' && t !== 'radio' && t !== 'button' && t !== 'submit' && t !== 'file';
  }
  return tag === 'TEXTAREA' || el.isContentEditable;
};

const handleFocus = (e) => {
  if (!isMobile()) return;
  const target = e.target;
  if (!isEditable(target)) return;

  setTimeout(() => {
    if (document.activeElement !== target) return;

    const vv = window.visualViewport;
    const rect = target.getBoundingClientRect();

    if (vv) {
      const visibleTop = vv.offsetTop;
      const visibleBottom = vv.offsetTop + vv.height;
      const occluded =
        rect.bottom > visibleBottom - KEYBOARD_CLEARANCE_PX ||
        rect.top < visibleTop + KEYBOARD_CLEARANCE_PX;
      if (!occluded) return;
    }

    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      target.scrollIntoView();
    }
  }, FOCUS_DELAY_MS);
};

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', handleFocus, { passive: true });
}
