import { useState, useEffect, useCallback, memo } from 'react';
import { 
  ArrowPathIcon, 
  ChevronDownIcon, 
  ChevronUpIcon, 
  PencilIcon, 
  CheckIcon, 
  XMarkIcon, 
  ClockIcon, 
  ExclamationCircleIcon, 
  CheckCircleIcon 
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

  return (
    <div className="space-y-6">
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
