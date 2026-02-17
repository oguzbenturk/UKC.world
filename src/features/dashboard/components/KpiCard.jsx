// src/features/dashboard/components/KpiCard.jsx
import { useMemo } from 'react';
import { Spin } from 'antd';

const KpiCard = ({ title, value, prefix = '', precision = 0, note, color = '#334155', breakdown, onCardClick, isLoading }) => {
  const formattedValue = useMemo(() => {
    const num = Number(value);
    if (isLoading || value === undefined || value === null || Number.isNaN(num)) {
      return '...';
    }
    return num.toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  }, [value, precision, isLoading]);

  const handleCardClick = () => {
    if (onCardClick && breakdown) {
      onCardClick(title, breakdown);
    }
  };

  const cardClasses = `
    relative h-full overflow-hidden rounded-2xl border border-slate-100 
    bg-white p-6 shadow-sm transition-all duration-300 
    hover:shadow-md hover:border-slate-200 hover:-translate-y-1
    ${onCardClick ? 'cursor-pointer' : ''}
  `;

  return (
    <div className={cardClasses} onClick={handleCardClick}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
          <Spin />
        </div>
      )}
      <div className="flex flex-col justify-between h-full gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 opacity-80">{title}</p>
          <p
            className="text-3xl font-bold tracking-tight text-slate-900"
          >
            <span className="text-slate-400 font-normal mr-1">{prefix}</span>
            {formattedValue}
          </p>
        </div>
        {note && (
            <div className={`text-xs px-2 py-1 rounded-md inline-block self-start font-medium
                ${note.includes('Completed') ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}
            `}>
                {note}
            </div>
        )}
      </div>
    </div>
  );
};

export default KpiCard;
