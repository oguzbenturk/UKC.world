// src/features/dashboard/components/ChartCard.jsx
import { Spin } from 'antd';

const ChartCard = ({ title, children, isLoading }) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
    <div className="mb-6">
        <h3 className="text-base font-bold text-slate-800 tracking-tight">{title}</h3>
    </div>
    <div className="h-80 w-full">
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center">
            <Spin size="large" />
        </div>
      ) : (
        children
      )}
    </div>
  </div>
);

export default ChartCard;
