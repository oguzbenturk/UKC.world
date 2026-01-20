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
    relative h-full overflow-hidden rounded-2xl border border-slate-200/80 
    bg-white/80 p-5 shadow-lg backdrop-blur-sm transition-all duration-300 
    hover:shadow-xl hover:border-slate-300/80
    ${onCardClick ? 'cursor-pointer' : ''}
  `;

  return (
    <div className={cardClasses} onClick={handleCardClick}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50">
          <Spin />
        </div>
      )}
      <div className="flex flex-col justify-between h-full">
        <div>
          <p className="text-sm font-semibold text-slate-600">{title}</p>
          <p
            className="mt-2 text-3xl font-bold"
            style={{ color }}
          >
            {prefix}{formattedValue}
          </p>
        </div>
        {note && <p className="mt-4 text-xs text-slate-500">{note}</p>}
      </div>
    </div>
  );
};

export default KpiCard;
