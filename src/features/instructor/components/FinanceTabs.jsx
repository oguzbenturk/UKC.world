import { useMemo, useState } from 'react';

const FinanceTabs = ({ tabs = [], initialKey, onChange }) => {
  const map = useMemo(() => Object.fromEntries(tabs.map((tab) => [tab.key, tab])), [tabs]);
  const fallbackKey = initialKey ?? tabs[0]?.key ?? null;
  const [activeKey, setActiveKey] = useState(fallbackKey);

  const handleChange = (key) => {
    setActiveKey(key);
    onChange?.(key);
  };

  const activeTab = map[activeKey] ?? null;

  if (!tabs.length) {
    return null;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-100 pb-2 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === activeKey}
            onClick={() => handleChange(tab.key)}
            className={`rounded-full px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
              tab.key === activeKey
                ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge != null && (
              <span className={`ml-1 sm:ml-1.5 inline-flex h-4 sm:h-5 min-w-[1rem] sm:min-w-[1.25rem] items-center justify-center rounded-full px-1 sm:px-1.5 text-[9px] sm:text-[11px] font-semibold tabular-nums ${
                tab.key === activeKey ? 'bg-white/25' : 'bg-slate-200/80 text-slate-500'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab?.description && (
        <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 hidden sm:block">
          {activeTab.description}
        </p>
      )}

      <div className="transition">
        {activeTab?.content}
      </div>
    </div>
  );
};

export default FinanceTabs;
