import React, { useState, useEffect } from 'react';

/**
 * Tabs component for switching between different views
 * 
 * @param {Object} props - Component props
 * @param {Array<Object>} props.tabs - Array of tab objects with id, label, and content
 * @param {string} [props.defaultTabId] - ID of the default selected tab
 * @param {function} [props.onChange] - Callback function when tab changes
 */
function Tabs({ tabs, defaultTabId, onChange }) {
  const [selectedTab, setSelectedTab] = useState(defaultTabId || (tabs.length > 0 ? tabs[0].id : null));

  // When the defaultTabId changes externally, update the selected tab
  useEffect(() => {
    if (defaultTabId) {
      setSelectedTab(defaultTabId);
    }
  }, [defaultTabId]);

  const handleTabChange = (tabId) => {
    setSelectedTab(tabId);
    if (onChange) {
      onChange(tabId);
    }
  };

  // Find the selected tab content
  const activeTab = tabs.find(tab => tab.id === selectedTab) || tabs[0];

  return (
    <div>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                tab.id === selectedTab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              aria-current={tab.id === selectedTab ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="py-4">
        {activeTab.content}
      </div>
    </div>
  );
}

export default Tabs;
