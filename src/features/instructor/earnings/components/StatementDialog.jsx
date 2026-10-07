import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from 'antd';
import dayjs from 'dayjs';
import { DownloadIcon } from './EarningsIcons';
import { primaryButtonClass, secondaryButtonClass } from './earningsStyles';
import { downloadEarningsStatement } from '../earningsApi';

// The backend currently answers format=pdf with 400 PDF_NOT_SUPPORTED (spec §2:
// "CSV only and the UI hides PDF"). Flip this once PDF statements ship.
const PDF_STATEMENTS_ENABLED = false;

const lastMonths = (count, locale) => Array.from({ length: count }, (_, i) => {
  const d = dayjs().startOf('month').subtract(i, 'month');
  return {
    value: d.format('YYYY-MM'),
    label: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d.toDate()),
  };
});

/** Monthly statement download (CSV required by the contract; PDF when the backend supports it). */
export default function StatementDialog({ open, onClose }) {
  const { t, i18n } = useTranslation(['instructor']);
  const months = useMemo(() => lastMonths(12, i18n?.language || 'en'), [i18n?.language]);
  const [month, setMonth] = useState(months[0].value);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const download = async (format) => {
    setBusy(format);
    setError(null);
    try {
      await downloadEarningsStatement({ month, format });
    } catch (err) {
      const status = err?.response?.status;
      setError(format === 'pdf' && (status === 400 || status === 404 || status === 501)
        ? t('instructor:earnings.statement.pdfUnavailable')
        : t('instructor:earnings.statement.error'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={t('instructor:earnings.statement.title')} width={420} centered destroyOnHidden>
      <div className="flex flex-col gap-4 pt-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t('instructor:earnings.statement.month')}</span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#00798c] focus:outline-none focus:ring-2 focus:ring-[#00798c]/40"
          >
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => download('csv')} disabled={Boolean(busy)} className={`${primaryButtonClass} h-11 flex-1 text-sm`}>
            <DownloadIcon size={18} />
            {t('instructor:earnings.statement.csv')}
          </button>
          {PDF_STATEMENTS_ENABLED && (
            <button type="button" onClick={() => download('pdf')} disabled={Boolean(busy)} className={`${secondaryButtonClass} h-11 flex-1 text-sm`}>
              <DownloadIcon size={18} />
              {t('instructor:earnings.statement.pdf')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
