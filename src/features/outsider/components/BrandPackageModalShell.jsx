import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseOutlined } from '@ant-design/icons';
import { PACKAGE_DETAILS_MODAL_CLEAR_MS } from '@/features/outsider/stores/packageDetailsModalStore';

const MODAL_EASE_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Shared chrome for academy `PackageDetailsModal` and experience bundle detail:
 * portal overlay, cyan border panel, enter/exit motion, body scroll lock.
 */
export default function BrandPackageModalShell({
  open,
  onClose,
  animationKey,
  ariaLabelledBy,
  maxWidthClass = 'max-w-[900px]',
  maxHeightClass = 'max-h-[min(90dvh,90vh)]',
  children,
}) {
  const panelRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(open);
  const [paintOpen, setPaintOpen] = useState(false);

  useEffect(() => {
    if (open) setShouldRender(true);
  }, [open]);

  useLayoutEffect(() => {
    if (!shouldRender) return undefined;

    if (open) {
      setPaintOpen(false);
      let id1 = 0;
      let id2 = 0;
      id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setPaintOpen(true));
      });
      return () => {
        cancelAnimationFrame(id1);
        cancelAnimationFrame(id2);
      };
    }

    setPaintOpen(false);
    const t = setTimeout(() => setShouldRender(false), PACKAGE_DETAILS_MODAL_CLEAR_MS);
    return () => clearTimeout(t);
  }, [open, shouldRender, animationKey]);

  useEffect(() => {
    if (!shouldRender) return undefined;
    const prevOverflow = document.body.style.overflow;
    const lockId = requestAnimationFrame(() => {
      document.body.style.overflow = 'hidden';
    });
    return () => {
      cancelAnimationFrame(lockId);
      document.body.style.overflow = prevOverflow;
    };
  }, [shouldRender]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && paintOpen && panelRef.current) {
      panelRef.current.focus({ preventScroll: true });
    }
  }, [open, paintOpen, animationKey]);

  const visuallyOpen = open && paintOpen;

  const overlay =
    shouldRender && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="pkg-modal-root fixed inset-0 z-[1050] flex items-start justify-center overflow-y-auto p-4 pb-8 pt-6 md:items-center md:py-8"
            role="presentation"
          >
            <div
              className={`pkg-modal-bd absolute inset-0 bg-black/45 ${visuallyOpen ? 'pkg-modal-bd--open' : ''}`}
              aria-hidden
              onClick={() => {
                if (open) onClose();
              }}
            />
            <div className="relative z-[1] flex w-full min-h-0 items-start justify-center pointer-events-none md:min-h-full md:items-center">
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={ariaLabelledBy}
                tabIndex={-1}
                className={`package-details-modal-shell pkg-modal-panel pointer-events-auto relative my-0 flex w-full ${maxWidthClass} ${maxHeightClass} flex-col overflow-y-auto rounded-[24px] border border-[rgba(0,168,196,0.5)] bg-[rgba(255,255,255,0.98)] shadow-[0_20px_40px_-12px_rgba(0,168,196,0.25)] outline-none md:my-8 md:max-h-[min(90vh,880px)] md:min-h-0 ${visuallyOpen ? 'pkg-modal-panel--open' : ''}`}
                style={{ pointerEvents: open ? 'auto' : 'none' }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <CloseOutlined />
                </button>
                {children}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {overlay}
      <style>{`
        .pkg-modal-root {
          isolation: isolate;
        }
        .pkg-modal-bd {
          opacity: 0;
          transition: opacity ${PACKAGE_DETAILS_MODAL_CLEAR_MS}ms ${MODAL_EASE_CSS};
          transform: translateZ(0);
        }
        .pkg-modal-bd.pkg-modal-bd--open {
          opacity: 1;
        }
        .pkg-modal-panel {
          opacity: 0;
          transform: translate3d(0, 14px, 0);
          transition: opacity ${PACKAGE_DETAILS_MODAL_CLEAR_MS}ms ${MODAL_EASE_CSS},
            transform ${PACKAGE_DETAILS_MODAL_CLEAR_MS}ms ${MODAL_EASE_CSS};
          backface-visibility: hidden;
        }
        .pkg-modal-panel.pkg-modal-panel--open {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }
        @media (prefers-reduced-motion: reduce) {
          .pkg-modal-bd,
          .pkg-modal-panel {
            transition-duration: 0.01ms;
          }
        }
        .package-details-modal-shell {
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }
        .package-details-modal-shell::-webkit-scrollbar {
          width: 6px;
        }
        .package-details-modal-shell::-webkit-scrollbar-track {
          background: transparent;
        }
        .package-details-modal-shell::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 10px;
        }
        .package-details-modal-shell::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.25);
        }
        .pkg-modal-scroll {
          -webkit-overflow-scrolling: touch;
        }
        .pkg-modal-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .pkg-modal-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .pkg-modal-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.12);
          border-radius: 10px;
        }
        .pkg-modal-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.22);
        }
      `}</style>
    </>
  );
}
