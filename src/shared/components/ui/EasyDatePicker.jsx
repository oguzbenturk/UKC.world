import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from 'antd';
import { CalendarOutlined, CloseCircleFilled } from '@ant-design/icons';
import dayjs from 'dayjs';

// Guided Year → Month → Day picker. Customers (especially on phones) struggle to reach a
// birth year with the classic calendar popup, so instead of a mini-calendar that opens on
// "today", this walks them through three big-target steps: pick the year from a scrollable
// grid, then the month, then the day. Drop-in for antd Form.Item: value is dayjs|null,
// onChange receives dayjs|null.
const EasyDatePicker = ({
  value,
  onChange,
  placeholder = 'Select date',
  format = 'DD/MM/YYYY',
  disabledDate,
  // Inclusive bounds (dayjs). When given they also clamp the year list.
  minDate,
  maxDate,
  fromYear = 1920,
  toYear = dayjs().year(),
  // Year the list centers on when the field is empty (e.g. ~30 for date of birth)
  defaultPickerYear,
  allowClear = true,
  disabled = false,
  size,
  // 'dark' mirrors the public pages' .dark-form skin (anthracite + cyan, see index.css)
  variant = 'light',
  style,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('year');
  const [draftYear, setDraftYear] = useState(null);
  const [draftMonth, setDraftMonth] = useState(null); // 0-11
  const yearScrollRef = useRef(null);
  const focusYearRef = useRef(null);

  const dark = variant === 'dark';
  const ui = dark
    ? {
        field: 'bg-white/5 rounded-xl',
        fieldDisabled: 'text-slate-600 border-white/5 cursor-not-allowed',
        fieldOpen: 'border-[#00a8c4] ring-2 ring-[#00a8c4]/20 cursor-pointer',
        fieldIdle: 'border-white/10 hover:border-[#00a8c4]/60 cursor-pointer',
        valueText: 'text-white',
        placeholder: 'text-[#4b4f54]',
        clearIcon: 'text-[#4b4f54] hover:text-[#00a8c4]',
        calIcon: 'text-[#4b4f54]',
        chipActive: 'bg-[#00a8c4] text-[#0f1013] shadow-sm',
        chipFilled: 'bg-[#00a8c4]/15 text-[#6fd7e8] hover:bg-[#00a8c4]/25',
        chipIdle: 'bg-white/5 text-slate-400 hover:bg-white/10',
        chipOff: 'bg-white/5 text-slate-600 cursor-not-allowed',
        cellSel: 'bg-[#00a8c4] text-[#0f1013] font-semibold',
        cellDis: 'text-slate-600 cursor-not-allowed',
        cell: 'text-slate-200 hover:bg-white/10',
        weekday: 'text-slate-500',
      }
    : {
        field: 'bg-white rounded-lg',
        fieldDisabled: 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed',
        fieldOpen: 'border-sky-500 ring-2 ring-sky-100 cursor-pointer',
        fieldIdle: 'border-slate-300 hover:border-sky-400 cursor-pointer',
        valueText: 'text-slate-800',
        placeholder: 'text-slate-400',
        clearIcon: 'text-slate-300 hover:text-slate-500',
        calIcon: 'text-slate-400',
        chipActive: 'bg-sky-600 text-white shadow-sm',
        chipFilled: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
        chipIdle: 'bg-slate-100 text-slate-500 hover:bg-slate-200',
        chipOff: 'bg-slate-50 text-slate-300 cursor-not-allowed',
        cellSel: 'bg-sky-600 text-white font-semibold',
        cellDis: 'text-slate-300 cursor-not-allowed',
        cell: 'text-slate-700 hover:bg-sky-50',
        weekday: 'text-slate-400',
      };

  const minYear = minDate ? minDate.year() : fromYear;
  const maxYear = maxDate ? Math.min(maxDate.year(), toYear) : toYear;

  const years = useMemo(() => {
    const list = [];
    for (let y = maxYear; y >= minYear; y--) list.push(y);
    return list;
  }, [minYear, maxYear]);

  const isDayDisabled = (d) =>
    (minDate && d.isBefore(minDate, 'day')) ||
    (maxDate && d.isAfter(maxDate, 'day')) ||
    (!!disabledDate && disabledDate(d));

  const hasLimits = !!(disabledDate || minDate || maxDate);

  // A year/month is greyed out only when its entire span is disabled (cheap two-point
  // check — exact for range rules like "no future dates", which is what forms here use).
  const yearDisabled = (y) =>
    hasLimits &&
    isDayDisabled(dayjs(new Date(y, 0, 1)).startOf('day')) &&
    isDayDisabled(dayjs(new Date(y, 11, 31)).endOf('day'));

  const monthDisabled = (y, m) => {
    if (!hasLimits) return false;
    const start = dayjs(new Date(y, m, 1));
    return isDayDisabled(start.startOf('month')) && isDayDisabled(start.endOf('month'));
  };

  const handleOpenChange = (next) => {
    if (disabled) return;
    if (next) {
      if (value) {
        setDraftYear(value.year());
        setDraftMonth(value.month());
        setStep('day');
      } else {
        setDraftYear(null);
        setDraftMonth(null);
        setStep('year');
      }
    }
    setOpen(next);
  };

  // Center the year list on the selected (or suggested) year each time the year step shows.
  // Scrolls the list container directly — scrollIntoView would also scroll the page.
  useEffect(() => {
    if (open && step === 'year') {
      const id = requestAnimationFrame(() => {
        const box = yearScrollRef.current;
        const btn = focusYearRef.current;
        if (box && btn) {
          box.scrollTop = btn.offsetTop - box.clientHeight / 2 + btn.clientHeight / 2;
        }
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open, step]);

  const pickYear = (y) => {
    setDraftYear(y);
    setStep('month');
  };

  const pickMonth = (m) => {
    setDraftMonth(m);
    setStep('day');
  };

  const pickDay = (d) => {
    const date = dayjs(new Date(draftYear, draftMonth, d));
    onChange?.(date);
    setOpen(false);
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange?.(null);
  };

  const focusYear = Math.min(
    maxYear,
    Math.max(minYear, value ? value.year() : (defaultPickerYear ?? maxYear))
  );

  // ── Step chips (breadcrumb header) ──
  const chip = (key, label, filled, enabled) => (
    <button
      key={key}
      type="button"
      disabled={!enabled}
      onClick={() => enabled && setStep(key)}
      className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
        step === key ? ui.chipActive : filled ? ui.chipFilled : enabled ? ui.chipIdle : ui.chipOff
      }`}
    >
      {label}
    </button>
  );

  // ── Panels ──
  const yearPanel = (
    <div ref={yearScrollRef} className="grid grid-cols-4 gap-1.5 max-h-60 overflow-y-auto pr-1">
      {years.map((y) => {
        const isSel = draftYear === y;
        const isDis = yearDisabled(y);
        return (
          <button
            key={y}
            type="button"
            ref={y === focusYear ? focusYearRef : undefined}
            disabled={isDis}
            onClick={() => pickYear(y)}
            className={`rounded-lg py-2 text-sm transition-colors ${
              isSel ? ui.cellSel : isDis ? ui.cellDis : ui.cell
            }`}
          >
            {y}
          </button>
        );
      })}
    </div>
  );

  const monthPanel = (
    <div className="grid grid-cols-3 gap-1.5">
      {Array.from({ length: 12 }, (_, m) => {
        const isSel = draftMonth === m;
        const isDis = monthDisabled(draftYear, m);
        return (
          <button
            key={m}
            type="button"
            disabled={isDis}
            onClick={() => pickMonth(m)}
            className={`rounded-lg py-3 text-sm transition-colors ${
              isSel ? ui.cellSel : isDis ? ui.cellDis : ui.cell
            }`}
          >
            {dayjs().month(m).format('MMM')}
          </button>
        );
      })}
    </div>
  );

  const dayPanel = useMemo(() => {
    if (draftYear == null || draftMonth == null) return null;
    const first = dayjs(new Date(draftYear, draftMonth, 1));
    const daysInMonth = first.daysInMonth();
    const offset = (first.day() + 6) % 7; // week starts Monday
    return (
      <div>
        <div className="grid grid-cols-7 mb-1">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className={`text-center text-xs font-medium py-1 ${ui.weekday}`}>
              {dayjs().day((i + 1) % 7).format('dd')}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: offset }, (_, i) => (
            <div key={`b${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const date = dayjs(new Date(draftYear, draftMonth, d));
            const isDis = hasLimits && isDayDisabled(date);
            const isSel = value && value.isSame(date, 'day');
            return (
              <button
                key={d}
                type="button"
                disabled={isDis}
                onClick={() => pickDay(d)}
                className={`h-9 w-9 mx-auto rounded-full text-sm transition-colors ${
                  isSel ? ui.cellSel : isDis ? ui.cellDis : ui.cell
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftYear, draftMonth, value, disabledDate, minDate, maxDate, variant]);

  const panel = (
    <div className="w-[19rem] p-3 select-none">
      <div className="flex gap-1.5 mb-3">
        {chip('year', draftYear ?? 'Year', draftYear != null, true)}
        {chip('month', draftMonth != null ? dayjs().month(draftMonth).format('MMM') : 'Month', draftMonth != null, draftYear != null)}
        {chip('day', value && draftYear === value.year() && draftMonth === value.month() ? value.date() : 'Day', false, draftYear != null && draftMonth != null)}
      </div>
      {step === 'year' && yearPanel}
      {step === 'month' && monthPanel}
      {step === 'day' && dayPanel}
    </div>
  );

  const heights = { small: 'h-8 text-sm', large: 'h-12 text-base' };
  const height = heights[size] || 'h-10 text-sm';

  return (
    <Popover
      content={panel}
      open={open}
      onOpenChange={handleOpenChange}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      styles={{
        body: {
          padding: 0,
          borderRadius: 12,
          ...(dark ? { background: '#17181c', border: '1px solid rgba(255,255,255,0.08)' } : {}),
        },
      }}
    >
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        className={`group inline-flex items-center gap-2 px-3 border transition-colors ${ui.field} ${height} ${
          disabled ? ui.fieldDisabled : open ? ui.fieldOpen : ui.fieldIdle
        } ${className}`}
        style={style}
      >
        <span className={`flex-1 truncate ${value ? ui.valueText : ui.placeholder}`}>
          {value ? value.format(format) : placeholder}
        </span>
        {allowClear && value && !disabled ? (
          <CloseCircleFilled onClick={clear} className={`transition-colors ${ui.clearIcon}`} />
        ) : (
          <CalendarOutlined className={ui.calIcon} />
        )}
      </div>
    </Popover>
  );
};

export default EasyDatePicker;
