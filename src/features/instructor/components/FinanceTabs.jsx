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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleChange(tab.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              tab.key === activeKey
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge != null && (
              <span className="ml-2 inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-white/20 px-2 text-xs">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab?.description && (
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {activeTab.description}
        </p>
      )}

      <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 xl:p-6 transition">
        {activeTab?.content}
      </div>
    </div>
  );
};

export default FinanceTabs;
