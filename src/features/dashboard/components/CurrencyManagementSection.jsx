import { useState, useEffect, useCallback, memo, useMemo } from 'react';
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  BoltIcon
} from '@heroicons/react/24/outline';
import apiClient from '@/shared/services/apiClient';
import { useToast } from '@/shared/contexts/ToastContext';

const FREQUENCY_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' }
];

const formatDate = (dateString) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const StatusBadge = memo(function StatusBadge({ status }) {
  const config = {
    success: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircleIcon },
    failed: { bg: 'bg-red-100', text: 'text-red-800', icon: ExclamationCircleIcon },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: ClockIcon }
  };
  const { bg, text, icon: Icon } = config[status] || config.pending;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      <Icon className="w-3 h-3" />
      {status || 'pending'}
    </span>
  );
});

const CurrencyRow = memo(function CurrencyRow({ 
  currency, 
  onToggleAutoUpdate, 
  onChangeFrequency, 
  onRefresh, 
  onEditRate,
  isLoading 
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(currency.exchange_rate || '');
  const [localLoading, setLocalLoading] = useState(false);

  const handleSaveRate = async () => {
    const rate = parseFloat(editValue);
    if (isNaN(rate) || rate <= 0) return;
    setLocalLoading(true);
    await onEditRate(currency.code, rate);
    setLocalLoading(false);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(currency.exchange_rate || '');
    setEditing(false);
  };

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-slate-900">{currency.code}</span>
          <span className="text-xs text-slate-500">{currency.name || currency.code}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-24 px-2 py-1 text-sm border rounded focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={handleSaveRate}
              disabled={localLoading}
              className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
              title="Save"
            >
              <CheckIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancelEdit}
              className="p-1 text-red-600 hover:text-red-800"
              title="Cancel"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">
              {currency.exchange_rate ? Number(currency.exchange_rate).toFixed(4) : '—'}
            </span>
            <button
              onClick={() => {
                setEditValue(currency.exchange_rate || '');
                setEditing(true);
              }}
              className="p-1 text-slate-400 hover:text-slate-600"
              title="Edit rate"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={currency.auto_update_enabled !== false}
            onChange={(e) => onToggleAutoUpdate(currency.code, e.target.checked)}
            disabled={isLoading}
          />
          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
        </label>
      </td>
      <td className="px-4 py-3">
        <select
          value={currency.update_frequency_hours || 24}
          onChange={(e) => onChangeFrequency(currency.code, parseInt(e.target.value))}
          disabled={isLoading || !currency.auto_update_enabled}
          className="text-sm border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {FREQUENCY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {formatDate(currency.last_updated_at)}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={currency.last_update_status} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {currency.last_update_source || '—'}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onRefresh(currency.code)}
          disabled={isLoading || localLoading}
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
          title="Refresh rate now"
        >
          <ArrowPathIcon className={`w-4 h-4 ${(isLoading || localLoading) ? 'animate-spin' : ''}`} />
        </button>
      </td>
    </tr>
  );
});

const UpdateLogsModal = memo(function UpdateLogsModal({ isOpen, onClose, currencyCode, logs }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-30" onClick={onClose} />
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-lg font-semibold text-slate-900">
              Update History {currencyCode && `- ${currencyCode}`}
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[60vh]">
            {logs.length === 0 ? (
              <p className="p-4 text-center text-slate-500">No update logs found</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Currency</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Old Rate</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">New Rate</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Change</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Source</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-4 py-2 font-medium">{log.currency_code}</td>
                      <td className="px-4 py-2 font-mono">
                        {log.old_rate ? Number(log.old_rate).toFixed(4) : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono">
                        {log.new_rate ? Number(log.new_rate).toFixed(4) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {log.rate_change_percent ? (
                          <span className={log.rate_change_percent > 0 ? 'text-green-600' : 'text-red-600'}>
                            {log.rate_change_percent > 0 ? '+' : ''}{Number(log.rate_change_percent).toFixed(2)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs">{log.source || '—'}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={log.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const CustomerRateCard = memo(function CustomerRateCard({ currencies, onRefresh, onMarginSave, isLoading }) {
  const sharedMargin = currencies.length > 0
    ? Number(currencies[0].rate_margin_percent ?? 0)
    : 0;
  const [marginInput, setMarginInput] = useState(String(sharedMargin));
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError } = useToast();

  // Keep local state in sync when currency data refreshes
  useEffect(() => {
    setMarginInput(String(sharedMargin));
  }, [sharedMargin]);

  const margin = parseFloat(marginInput) || 0;
  const marginChanged = parseFloat(marginInput) !== sharedMargin;

  const previewFor = (c) => {
    const raw = Number(c.raw_rate || c.exchange_rate || 0);
    return raw > 0 ? (raw * (1 + margin / 100)).toFixed(4) : '—';
  };

  const handleSaveMargin = async () => {
    const val = parseFloat(marginInput);
    if (isNaN(val) || val < 0 || val > 20) {
      showError('Margin must be between 0% and 20%');
      return;
    }
    setSaving(true);
    try {
      await Promise.all(currencies.map(c => onMarginSave(c.code, val)));
      showSuccess(`Margin updated — applied to ${currencies.map(c => c.code).join(', ')}`);
    } catch {
      showError('Failed to save margin');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveMargin();
    if (e.key === 'Escape') setMarginInput(String(sharedMargin));
  };

  const sourceLabels = { yahoo: 'Yahoo Finance (live)', open_er: 'Open ER (hourly)', fxrates: 'FXRates API', ecb: 'ECB', manual: 'Manual', cached: 'Cached' };
  const anyAutoUpdate = currencies.some(c => c.auto_update_enabled !== false);
  const mixedMargins = currencies.some(c => Number(c.rate_margin_percent ?? 0) !== sharedMargin);

  if (currencies.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <BoltIcon className="w-5 h-5 text-sky-500" />
          <span className="font-semibold text-slate-800 text-base">
            EUR → {currencies.map(c => c.code).join(' / ')} — Customer Rate
          </span>
          {anyAutoUpdate && (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">Auto-update ON</span>
          )}
          {mixedMargins && (
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full" title="Stored margins differ across currencies. Saving will set all to the input value.">
              Mixed margins
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currencies.map(c => (
            <button
              key={c.code}
              onClick={() => onRefresh(c.code)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg disabled:opacity-50 transition-colors"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {c.code}
            </button>
          ))}
        </div>
      </div>

      {/* Single shared margin control */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Your margin (applied to all)</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-semibold text-slate-500">+</span>
              <input
                type="number"
                min="0"
                max="20"
                step="0.1"
                value={marginInput}
                onChange={(e) => setMarginInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-24 text-xl font-bold font-mono border-b-2 border-slate-300 focus:border-sky-500 outline-none bg-transparent text-slate-800 pb-0.5"
              />
              <span className="text-lg font-semibold text-slate-500">%</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Markup added to live rates for {currencies.map(c => c.code).join(', ')}</p>
          </div>
          {marginChanged && (
            <button
              onClick={handleSaveMargin}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-sky-500 hover:bg-sky-600 text-white rounded-md disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : `Save margin (${currencies.length} ${currencies.length === 1 ? 'currency' : 'currencies'})`}
            </button>
          )}
        </div>
      </div>

      {/* Per-currency rate columns */}
      <div className={`grid gap-3 ${currencies.length === 1 ? 'grid-cols-1' : currencies.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {currencies.map(c => {
          const rawRate = Number(c.raw_rate || c.exchange_rate || 0);
          const sourceLabel = sourceLabels[c.last_update_source] || c.last_update_source || '—';
          return (
            <div key={c.code} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">EUR → {c.code}</span>
                <span className="text-[10px] text-slate-400">Source: {sourceLabel}</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="p-3">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">Live</p>
                  <p className="text-base font-bold text-slate-800 font-mono">
                    {rawRate > 0 ? rawRate.toFixed(4) : '—'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {c.last_updated_at ? `Updated ${formatDate(c.last_updated_at)}` : 'Never fetched'}
                  </p>
                </div>
                <div className="p-3 bg-sky-500 text-white">
                  <p className="text-[10px] font-medium text-sky-100 uppercase tracking-wide mb-1">Customers see</p>
                  <p className="text-base font-bold font-mono">{previewFor(c)}</p>
                  <p className="text-[10px] text-sky-200 mt-1">
                    {marginChanged ? 'Preview — save to apply' : 'Currently stored'}
                  </p>
                </div>
              </div>
              <div className="px-3 py-1.5 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400">
                <span>Auto-update: every {c.update_frequency_hours || 1}h</span>
                <span>·</span>
                <StatusBadge status={c.last_update_status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const CurrencyManagementSection = memo(function CurrencyManagementSection() {
  const [currencies, setCurrencies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedCurrencyForLogs, setSelectedCurrencyForLogs] = useState(null);
  const { showSuccess, showError } = useToast();

  const fetchCurrencies = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get('/currencies');
      setCurrencies(response.data || []);
    } catch {
      showError('Failed to load currencies');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchCurrencies();
  }, [fetchCurrencies]);

  const handleToggleAutoUpdate = useCallback(async (code, enabled) => {
    try {
      await apiClient.put(`/currencies/${code}/auto-update`, { enabled });
      showSuccess(`Auto-update ${enabled ? 'enabled' : 'disabled'} for ${code}`);
      fetchCurrencies();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to toggle auto-update');
    }
  }, [showSuccess, showError, fetchCurrencies]);

  const handleChangeFrequency = useCallback(async (code, hours) => {
    try {
      await apiClient.put(`/currencies/${code}/frequency`, { hours });
      showSuccess(`Update frequency set to ${hours} hours for ${code}`);
      fetchCurrencies();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to set frequency');
    }
  }, [showSuccess, showError, fetchCurrencies]);

  const handleRefresh = useCallback(async (code) => {
    try {
      setIsLoading(true);
      await apiClient.post(`/currencies/${code}/refresh`);
      showSuccess(`Rate refreshed for ${code}`);
      fetchCurrencies();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to refresh rate');
    } finally {
      setIsLoading(false);
    }
  }, [showSuccess, showError, fetchCurrencies]);

  const handleEditRate = useCallback(async (code, rate) => {
    try {
      await apiClient.put(`/currencies/${code}/rate`, { exchangeRate: rate });
      showSuccess(`Rate updated for ${code}`);
      fetchCurrencies();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to update rate');
    }
  }, [showSuccess, showError, fetchCurrencies]);

  const handleMarginSave = useCallback(async (code, marginPercent) => {
    await apiClient.put(`/currencies/${code}/margin`, { marginPercent });
    fetchCurrencies();
  }, [fetchCurrencies]);

  const handleViewLogs = useCallback(async (currencyCode = null) => {
    try {
      const params = currencyCode ? { currencyCode, limit: 50 } : { limit: 50 };
      const response = await apiClient.get('/currencies/logs', { params });
      setLogs(response.data || []);
      setSelectedCurrencyForLogs(currencyCode);
      setLogsModalOpen(true);
    } catch {
      showError('Failed to load update logs');
    }
  }, [showError]);

  const activeCurrencies = currencies.filter(c => c.is_active);
  const inactiveCurrencies = currencies.filter(c => !c.is_active);
  const CUSTOMER_RATE_CODES = ['TRY', 'USD', 'GBP'];
  const customerRateCurrencies = CUSTOMER_RATE_CODES
    .map(code => activeCurrencies.find(c => c.code === code))
    .filter(c => c && !c.base_currency);

  return (
    <div className="space-y-6">
      {customerRateCurrencies.length > 0 && (
        <CustomerRateCard
          currencies={customerRateCurrencies}
          onRefresh={handleRefresh}
          onMarginSave={handleMarginSave}
          isLoading={isLoading}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-slate-900">Exchange Rates Management</h3>
          <p className="mt-1 text-sm text-slate-500">
            Manage exchange rates relative to EUR (base currency). Enable auto-update to fetch rates automatically.
          </p>
        </div>
        <button
          onClick={() => handleViewLogs()}
          className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md"
        >
          View All Logs
        </button>
      </div>

      {/* Active Currencies Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Currency</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rate (1 EUR =)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Auto-Update</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Frequency</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Last Updated</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Source</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {activeCurrencies.map((currency) => (
              <CurrencyRow
                key={currency.code}
                currency={currency}
                onToggleAutoUpdate={handleToggleAutoUpdate}
                onChangeFrequency={handleChangeFrequency}
                onRefresh={handleRefresh}
                onEditRate={handleEditRate}
                isLoading={isLoading}
              />
            ))}
            {activeCurrencies.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No active currencies found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inactive Currencies Accordion */}
      {inactiveCurrencies.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm text-slate-500 hover:text-slate-700">
            <ChevronDownIcon className="w-4 h-4 group-open:hidden" />
            <ChevronUpIcon className="w-4 h-4 hidden group-open:block" />
            {inactiveCurrencies.length} inactive currencies
          </summary>
          <div className="mt-3 overflow-x-auto border rounded-lg opacity-75">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100 bg-slate-50">
                {inactiveCurrencies.map((currency) => (
                  <CurrencyRow
                    key={currency.code}
                    currency={currency}
                    onToggleAutoUpdate={handleToggleAutoUpdate}
                    onChangeFrequency={handleChangeFrequency}
                    onRefresh={handleRefresh}
                    onEditRate={handleEditRate}
                    isLoading={isLoading}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Update Logs Modal */}
      <UpdateLogsModal
        isOpen={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        currencyCode={selectedCurrencyForLogs}
        logs={logs}
      />
    </div>
  );
});

export default CurrencyManagementSection;
