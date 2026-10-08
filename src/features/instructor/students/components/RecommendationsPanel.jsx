// Gear / lesson / rental / room picks the instructor suggests to the student.
import { useId, useState } from 'react';
import { Popconfirm, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../../earnings/components/earningsStyles';
import { formatShortDate, useMoney } from '../../earnings/earningsFormat';
import { PlusIcon } from '../../dashboard/components/DashboardIcons';
import { useLocale } from '../../dashboard/components/lessonText';
import { useRecommendationCatalog } from '../useStudents';
import { GiftIcon, TrashIcon } from './StudentsIcons';
import { Sheet, fieldClass, labelClass } from './parts';

const TYPES = ['product', 'service', 'rental', 'accommodation', 'custom'];
const TYPE_BADGE = {
  product: 'bg-sky-50 text-sky-800',
  service: 'bg-emerald-50 text-emerald-800',
  rental: 'bg-amber-50 text-amber-900',
  accommodation: 'bg-violet-50 text-violet-800',
  custom: 'bg-slate-100 text-slate-700',
};

const itemPrice = (type, item) => {
  if (!item) return null;
  const raw = type === 'accommodation' ? (item.nightly_price ?? item.base_price) : item.price;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function RecommendForm({ onSubmit, saving, onClose }) {
  const { t } = useTranslation(['instructor']);
  const ids = useId();
  const { money } = useMoney();
  const [type, setType] = useState('product');
  const [itemId, setItemId] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const catalog = useRecommendationCatalog(type, type !== 'custom');
  const items = catalog.data || [];
  const selected = items.find((i) => String(i.id) === String(itemId));

  const pickType = (next) => { setType(next); setItemId(null); setError(null); };

  const submit = async (event) => {
    event.preventDefault();
    const name = type === 'custom' ? customName.trim() : (selected?.name || '');
    if (!name) {
      setError(type === 'custom' ? t('instructor:students.recs.nameRequired') : t('instructor:students.recs.itemRequired'));
      return;
    }
    const price = type === 'custom' ? (Number(customPrice) > 0 ? Number(customPrice) : null) : itemPrice(type, selected);
    try {
      await onSubmit({
        itemType: type,
        itemId: type === 'custom' ? null : String(selected.id),
        itemName: name,
        itemPrice: price,
        itemImage: selected ? (selected.image_url || selected.imageUrl || selected.thumbnail || null) : null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch {
      // toast shown by the mutation
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-5 pb-5 pt-1 lg:px-0 lg:pb-0">
      <div className="flex flex-col gap-1.5">
        <span id={`${ids}-type`} className={labelClass}>{t('instructor:students.recs.category')}</span>
        <div role="radiogroup" aria-labelledby={`${ids}-type`} className="flex flex-wrap gap-2">
          {TYPES.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={type === key}
              onClick={() => pickType(key)}
              className={`h-10 rounded-xl border px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] ${type === key ? 'border-[#00798c] bg-cyan-50 font-semibold text-[#00687a]' : 'border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50'}`}
            >
              {t(`instructor:students.recs.types.${key}`)}
            </button>
          ))}
        </div>
      </div>

      {type === 'custom' ? (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-name`} className={labelClass}>{t('instructor:students.recs.name')}</label>
            <input id={`${ids}-name`} value={customName} onChange={(e) => { setCustomName(e.target.value); setError(null); }} className={fieldClass} placeholder={t('instructor:students.recs.namePlaceholder')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-price`} className={labelClass}>{t('instructor:students.recs.price')}</label>
            <input id={`${ids}-price`} type="number" inputMode="decimal" min="0" step="0.01" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} className={fieldClass} placeholder="0.00" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-item`} className={labelClass}>{t('instructor:students.recs.item')}</label>
          <Select
            id={`${ids}-item`}
            showSearch
            size="large"
            value={itemId}
            onChange={(v) => { setItemId(v); setError(null); }}
            loading={catalog.isLoading}
            placeholder={catalog.isLoading ? t('instructor:students.recs.loadingItems') : t('instructor:students.recs.selectItem')}
            notFoundContent={catalog.isLoading ? t('instructor:students.recs.loadingItems') : t('instructor:students.recs.noItems')}
            optionFilterProp="label"
            options={items.map((item) => {
              const price = itemPrice(type, item);
              return { value: item.id, label: price ? `${item.name} — ${money(price)}` : item.name };
            })}
            className="w-full"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-notes`} className={labelClass}>{t('instructor:students.recs.note')}</label>
        <textarea id={`${ids}-notes`} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('instructor:students.recs.notePlaceholder')} className={fieldClass} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className={`${secondaryButtonClass} h-12 sm:h-11`}>{t('instructor:students.cancel')}</button>
        <button type="submit" disabled={saving} className={`${primaryButtonClass} h-12 text-base sm:h-11 sm:text-sm`}>
          {saving ? t('instructor:students.saving') : t('instructor:students.recs.save')}
        </button>
      </div>
    </form>
  );
}

function RecItem({ rec, onRemove, removing }) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  const { money } = useMoney(rec.currency || 'EUR');
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGE[rec.itemType] || TYPE_BADGE.custom}`}>
            {t(`instructor:students.recs.types.${TYPES.includes(rec.itemType) ? rec.itemType : 'custom'}`)}
          </span>
          <span className="text-sm font-semibold text-slate-900">{rec.itemName}</span>
          {rec.itemPrice != null && <span className="text-sm tabular-nums text-slate-600">{money(rec.itemPrice)}</span>}
        </div>
        {rec.notes && <p className="text-sm text-slate-600">“{rec.notes}”</p>}
        <span className="text-xs text-slate-500">{formatShortDate(rec.createdAt, locale)}</span>
      </div>
      <Popconfirm
        title={t('instructor:students.recs.removeConfirm')}
        okText={t('instructor:students.remove')}
        cancelText={t('instructor:students.cancel')}
        okButtonProps={{ danger: true, loading: removing }}
        onConfirm={() => onRemove(rec.id)}
      >
        <button
          type="button"
          aria-label={t('instructor:students.recs.removeLabel', { name: rec.itemName })}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
        >
          <TrashIcon size={16} />
        </button>
      </Popconfirm>
    </li>
  );
}

export default function RecommendationsPanel({ recommendations = [], actions, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const [open, setOpen] = useState(false);
  return (
    <section className={`${cardClass} flex flex-col gap-2 p-4 lg:p-5`} aria-labelledby="recs-title" data-testid="recs-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="recs-title" className="text-base font-semibold text-slate-900">{t('instructor:students.recs.title')}</h2>
          <span className="text-sm text-slate-600">{t('instructor:students.recs.subtitle')}</span>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={`${secondaryButtonClass} h-10 shrink-0 text-sm`}>
          <PlusIcon size={16} />
          {t('instructor:students.recs.add')}
        </button>
      </div>
      {recommendations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"><GiftIcon size={18} /></span>
          <p className="text-sm text-slate-600">{t('instructor:students.recs.empty')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {recommendations.map((rec) => (
            <RecItem key={rec.id} rec={rec} onRemove={(id) => actions.removeRecommendation.mutate(id)} removing={actions.removeRecommendation.isPending} />
          ))}
        </ul>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('instructor:students.recs.sheetTitle')} isDesktop={isDesktop} width={520}>
        <RecommendForm onSubmit={actions.addRecommendation.mutateAsync} saving={actions.addRecommendation.isPending} onClose={() => setOpen(false)} />
      </Sheet>
    </section>
  );
}
