import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseOutlined } from '@ant-design/icons';

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const DUR = '280ms';

/**
 * Shared two-column modal shell used by PackageDetailsModal and the membership purchase modal.
 * Handles: enter/exit animation, body-scroll lock, Escape key, focus management.
 * The parent controls rendering — keep this mounted while open=false to animate the exit.
 */
const TwoColumnModal = ({
  open,
  onClose,
  leftContent,
  rightContent,
  maxWidth = 1000,
  ariaLabelledBy,
}) => {
  const panelRef = useRef(null);
  const [paint, setPaint] = useState(false);

  // Double-rAF enter; immediate false exit (CSS transition handles visual fade-out)
  useLayoutEffect(() => {
    if (!open) { setPaint(false); return; }
    let r1, r2;
    r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setPaint(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [open]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus panel on open
  useEffect(() => {
    if (open && paint && panelRef.current) {
      panelRef.current.focus({ preventScroll: true });
    }
  }, [open, paint]);

  if (typeof document === 'undefined') return null;

  const t = `${DUR} ${EASE}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[1050] flex items-end justify-center md:items-center"
      role="presentation"
      style={{ pointerEvents: open ? undefined : 'none' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/45"
        style={{ opacity: paint ? 1 : 0, transition: `opacity ${t}` }}
        aria-hidden
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className="tcm-panel relative z-[1] flex w-full flex-col outline-none rounded-t-[24px] md:rounded-[24px] border border-[rgba(30,58,138,0.5)] bg-[rgba(255,255,255,0.98)] shadow-[0_20px_40px_-12px_rgba(30,58,138,0.25)] max-h-[92dvh] overflow-y-auto md:my-8 md:max-h-[min(90vh,880px)] md:overflow-hidden mx-0 md:mx-4"
        style={{
          maxWidth,
          opacity: paint ? 1 : 0,
          transform: paint ? 'translate3d(0,0,0)' : 'translate3d(0,14px,0)',
          transition: `opacity ${t}, transform ${t}`,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseOutlined />
        </button>

        {/* Two-column layout */}
        <div className="flex w-full flex-col md:flex-row md:min-h-0 md:flex-1">
          {/* LEFT — image + info */}
          <div className="flex w-full shrink-0 flex-col bg-slate-50 md:w-3/5 md:min-h-0 md:overflow-hidden">
            {leftContent}
          </div>
          {/* RIGHT — options + footer */}
          <div className="flex w-full flex-col border-t border-slate-100 bg-white md:w-2/5 md:min-h-0 md:border-l md:border-t-0 md:overflow-hidden">
            {rightContent}
          </div>
        </div>
      </div>

      <style>{`
        .tcm-panel { -webkit-overflow-scrolling: touch; touch-action: pan-y; }
        .tcm-panel::-webkit-scrollbar { width: 6px; }
        .tcm-panel::-webkit-scrollbar-track { background: transparent; }
        .tcm-panel::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 10px; }
        .tcm-panel::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
        .tcm-scroll { -webkit-overflow-scrolling: touch; }
        .tcm-scroll::-webkit-scrollbar { width: 6px; }
        .tcm-scroll::-webkit-scrollbar-track { background: transparent; }
        .tcm-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 10px; }
        .tcm-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.22); }
        .pkg-desc-clamped {
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>,
    document.body
  );
};

export default TwoColumnModal;
