import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon } from '../../earnings/components/EarningsIcons';
import { FILTERS } from '../studentsFormat';
import { CloseIcon } from './StudentsIcons';
import SortMenu from './SortMenu';

const isTypingTarget = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function SearchField({ value, onChange, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const inputRef = useRef(null);

  // "/" focuses search (desktop), Esc clears it.
  useEffect(() => {
    if (!isDesktop) return undefined;
    const onKey = (event) => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !isTypingTarget(document.activeElement)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop]);

  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
        <SearchIcon size={18} />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); } }}
        placeholder={t('instructor:students.searchPlaceholder')}
        aria-label={t('instructor:students.searchLabel')}
        enterKeyHint="search"
        autoComplete="off"
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-10 text-[15px] text-slate-900 shadow-sm placeholder:text-slate-500 focus:border-[#00798c] focus:outline-none focus:ring-2 focus:ring-[#00798c]/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => { onChange(''); inputRef.current?.focus(); }}
          aria-label={t('instructor:students.clearSearch')}
          className="absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
        >
          <CloseIcon size={16} />
        </button>
      ) : isDesktop && (
        <kbd className="pointer-events-none absolute inset-y-0 right-3 my-auto flex h-6 items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 font-sans text-xs font-semibold text-slate-500">/</kbd>
      )}
    </div>
  );
}

function FilterChips({ value, onChange, counts }) {
  const { t } = useTranslation(['instructor']);
  return (
    <div role="group" aria-label={t('instructor:students.filter.label')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      {FILTERS.map((key) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            className={[
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] focus-visible:ring-offset-1 motion-safe:transition-colors',
              active
                ? 'border-slate-900 bg-slate-900 font-semibold text-white'
                : 'border-slate-200 bg-white font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50',
            ].join(' ')}
          >
            {t(`instructor:students.filter.${key}`)}
            <span className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {counts[key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function StudentsToolbar({ query, onQueryChange, filter, onFilterChange, sort, onSortChange, counts, isDesktop }) {
  return (
    <div className={`flex gap-3 ${isDesktop ? 'flex-row-reverse items-center justify-between' : 'flex-col'}`}>
      <div className={`flex gap-2 ${isDesktop ? 'w-[420px] shrink-0' : ''}`}>
        <SearchField value={query} onChange={onQueryChange} isDesktop={isDesktop} />
        <SortMenu value={sort} onChange={onSortChange} isDesktop={isDesktop} />
      </div>
      <FilterChips value={filter} onChange={onFilterChange} counts={counts} />
    </div>
  );
}
