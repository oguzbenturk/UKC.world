// Search, sort, status chips (with counts) and membership-type chips.
import { useTranslation } from 'react-i18next';
import { SearchIcon } from '@/features/instructor/earnings/components/EarningsIcons';
import { SORTS, VIEWS } from '../../membersFormat';
import { useTypeLabel } from './MemberParts';

const chipCls = (active) => [
  'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] focus-visible:ring-offset-1',
  active ? 'border-slate-900 bg-slate-900 font-semibold text-white' : 'border-slate-200 bg-white font-medium text-slate-700 hover:border-slate-300',
].join(' ');

const countCls = (active) => `min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`;

export default function MembersToolbar({
  query, onQuery, sort, onSort, view, onView, counts, type, onType, types = [], isDesktop,
}) {
  const { t } = useTranslation(['admin']);
  const typeLabel = useTypeLabel();
  return (
    <div className="flex flex-col gap-2.5">
      <div className={`flex gap-2 ${isDesktop ? 'items-center' : ''}`}>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t('admin:membersPage.search')}</span>
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500"><SearchIcon size={18} /></span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t('admin:membersPage.searchPlaceholder')}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-[15px] text-slate-900 shadow-sm placeholder:text-slate-500 focus:border-[#00798c] focus:outline-none focus:ring-2 focus:ring-[#00798c]/30"
          />
        </label>
        <label className={`flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white pl-3 pr-2 text-sm font-semibold text-slate-700 shadow-sm focus-within:ring-2 focus-within:ring-[#00798c] ${isDesktop ? 'shrink-0' : 'min-w-0 max-w-[40%]'}`}>
          <span className={isDesktop ? 'text-slate-500' : 'sr-only'}>{t('admin:membersPage.sort.label')}</span>
          <select value={sort} onChange={(e) => onSort(e.target.value)} className="h-full min-w-0 cursor-pointer truncate bg-transparent pr-1 focus:outline-none">
            {SORTS.map((s) => <option key={s} value={s}>{t(`admin:membersPage.sort.${s}`)}</option>)}
          </select>
        </label>
      </div>

      <div role="group" aria-label={t('admin:membersPage.filterLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
        {VIEWS.map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)} className={chipCls(view === v)}>
            {t(`admin:membersPage.view.${v}`)}
            <span className={countCls(view === v)}>{counts[v] ?? 0}</span>
          </button>
        ))}
      </div>

      {types.length > 1 && (
        <div role="group" aria-label={t('admin:membersPage.typeLabel')} className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          <span className="shrink-0 text-xs font-semibold text-slate-500">{t('admin:membersPage.typeLabel')}:</span>
          <button type="button" aria-pressed={type === 'all'} onClick={() => onType('all')} className={`${chipCls(type === 'all')} h-8 px-3 text-xs`}>
            {t('admin:membersPage.allTypes')}
          </button>
          {types.map((ty) => (
            <button key={ty.key} type="button" aria-pressed={type === ty.key} onClick={() => onType(ty.key)} className={`${chipCls(type === ty.key)} h-8 px-3 text-xs`}>
              {typeLabel(ty.family, ty.duration)}
              <span className={countCls(type === ty.key)}>{ty.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
