// Sort menu (design board "Desktop — My students"): a button showing the
// current sort that opens a small "Sort by" list with a tick on the selected
// option. Mobile shows the icon only. Keyboard: ↑/↓ move, Enter/Space pick,
// Esc or Tab close; a click outside closes it too.
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, ChevronDownIcon } from '../../earnings/components/EarningsIcons';
import { SORTS } from '../studentsFormat';
import { SortIcon } from './StudentsIcons';

export default function SortMenu({ value, onChange, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const optionRefs = useRef([]);
  const label = t(`instructor:students.sort.${value}`);

  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  // Focus the selected option when the menu opens.
  useEffect(() => {
    if (!open) return;
    const index = Math.max(SORTS.indexOf(value), 0);
    optionRefs.current[index]?.focus();
  }, [open, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  const pick = (key) => {
    if (key !== value) onChange(key);
    close();
  };

  const onMenuKeyDown = (event) => {
    const index = optionRefs.current.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      optionRefs.current[(index + step + SORTS.length) % SORTS.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      optionRefs.current[event.key === 'Home' ? 0 : SORTS.length - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const onButtonKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={isDesktop ? undefined : t('instructor:students.sort.current', { sort: label })}
        title={isDesktop ? undefined : t('instructor:students.sort.label')}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
        className={[
          'flex h-11 items-center gap-2 rounded-2xl border bg-white text-sm font-semibold text-slate-800 shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] motion-safe:transition-colors',
          open ? 'border-[#00798c] ring-4 ring-[#00798c]/10' : 'border-slate-200 hover:border-slate-300',
          isDesktop ? 'px-3' : 'w-11 justify-center',
        ].join(' ')}
      >
        <SortIcon size={isDesktop ? 16 : 18} className="text-slate-500" />
        {isDesktop && (
          <>
            <span className="sr-only">{t('instructor:students.sort.label')}: </span>
            <span>{label}</span>
            <ChevronDownIcon size={16} className={`text-slate-500 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          role="listbox"
          aria-label={t('instructor:students.sort.label')}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-[calc(100%+8px)] z-30 flex w-56 flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.14),0_2px_6px_rgba(15,23,42,0.06)]"
        >
          <span aria-hidden="true" className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {t('instructor:students.sort.label')}
          </span>
          {SORTS.map((key, i) => {
            const selected = key === value;
            return (
              <button
                key={key}
                ref={(el) => { optionRefs.current[i] = el; }}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(key)}
                className={[
                  'flex h-10 items-center justify-between rounded-xl px-2.5 text-left text-sm focus-visible:outline-none',
                  selected
                    ? 'bg-cyan-50 font-semibold text-[#00687a] focus-visible:ring-2 focus-visible:ring-[#00798c]'
                    : 'font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:text-slate-900',
                ].join(' ')}
              >
                {t(`instructor:students.sort.${key}`)}
                {selected && <CheckIcon size={16} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
