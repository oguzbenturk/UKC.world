// Picker that selects 0..N additional customers to merge into the primary
// customer's bill. Hands the resolved cohort list back to the parent, which
// renders CustomerBillModal in cohort mode.
//
// Usage: opened from EnhancedCustomerDetailModal next to "Create Bill". The
// primary customer is locked at the top so staff can't accidentally remove
// them. Selecting a customer adds a chip; the Generate button finalises the
// cohort and triggers per-customer data loading.

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Modal, Input, Tag, Button, Empty, Spin, Avatar, App } from 'antd';
import { UserOutlined, SearchOutlined, CloseOutlined, TeamOutlined } from '@ant-design/icons';
import DataService from '@/shared/services/dataService';

const BRAND_TEAL = '#00a8c4';

const CombineBillSetupModal = ({
  open,
  onCancel,
  primaryCustomer,
  onConfirm, // (selectedCustomers: Array<{id, name, email}>) => void
}) => {
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const debounceRef = useRef(null);

  // Reset every time the modal reopens — fresh search per session.
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelected([]);
    }
  }, [open]);

  const primaryId = primaryCustomer?.id;

  const fetchResults = useCallback(async (q) => {
    setLoading(true);
    try {
      const res = await DataService.getCustomersList({ q, limit: 25 });
      const items = res?.items || res?.data || [];
      setResults(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Customer search failed', err);
      message.error('Could not search customers');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [message]);

  // Debounce the search so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = query.trim();
      if (trimmed.length === 0) {
        // Empty query = show recent customers (returned with no q param).
        fetchResults('');
      } else if (trimmed.length >= 2) {
        fetchResults(trimmed);
      }
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, open, fetchResults]);

  // Filter out the primary customer + already-selected customers from the
  // dropdown so they can't be added twice.
  const visibleResults = useMemo(() => {
    const excludeIds = new Set([primaryId, ...selected.map(s => s.id)].filter(Boolean));
    return results.filter(r => !excludeIds.has(r.id));
  }, [results, selected, primaryId]);

  const addCustomer = (c) => {
    if (!c?.id) return;
    setSelected(prev => prev.some(p => p.id === c.id) ? prev : [...prev, c]);
  };
  const removeCustomer = (id) => {
    setSelected(prev => prev.filter(p => p.id !== id));
  };

  const handleConfirm = () => {
    if (selected.length === 0) {
      message.info('Pick at least one additional customer to combine.');
      return;
    }
    onConfirm(selected);
  };

  const primaryName = (() => {
    if (!primaryCustomer) return 'Primary customer';
    const first = primaryCustomer.first_name || primaryCustomer.firstName;
    const last = primaryCustomer.last_name || primaryCustomer.lastName;
    return [first, last].filter(Boolean).join(' ') || primaryCustomer.name || primaryCustomer.email || 'Primary';
  })();

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={
        <div className="flex items-center gap-2">
          <TeamOutlined style={{ color: BRAND_TEAL }} />
          <span>Combine bill with other customers</span>
        </div>
      }
      footer={[
        <Button key="cancel" onClick={onCancel}>Cancel</Button>,
        <Button
          key="confirm"
          type="primary"
          onClick={handleConfirm}
          disabled={selected.length === 0}
          style={{ background: BRAND_TEAL, borderColor: BRAND_TEAL }}
        >
          Generate combined bill ({selected.length + 1} {selected.length === 0 ? 'person' : 'people'})
        </Button>,
      ]}
      width={640}
      destroyOnHidden
    >
      <div className="space-y-4">
        {/* Primary customer (locked) */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Bill To (payer)</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <Avatar size="small" icon={<UserOutlined />} style={{ background: BRAND_TEAL }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{primaryName}</div>
              {primaryCustomer?.email && (
                <div className="text-xs text-slate-500 truncate">{primaryCustomer.email}</div>
              )}
            </div>
            <Tag color="blue" className="m-0">Payer</Tag>
          </div>
        </div>

        {/* Selected additional customers */}
        {selected.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
              Adding to bill ({selected.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selected.map(c => (
                <Tag
                  key={c.id}
                  closable
                  onClose={() => removeCustomer(c.id)}
                  closeIcon={<CloseOutlined />}
                  className="!py-1 !px-2 !text-xs"
                >
                  {c.name || c.email || c.id.slice(0, 8)}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Add a customer</div>
          <Input
            placeholder="Search by name, email or phone…"
            prefix={<SearchOutlined className="text-slate-400" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            allowClear
          />

          <div className="mt-2 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center"><Spin /></div>
            ) : visibleResults.length === 0 ? (
              <div className="py-6">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={query ? 'No matches' : 'Type to search'}
                />
              </div>
            ) : (
              <ul className="m-0 p-0">
                {visibleResults.map(c => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-sky-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                    onClick={() => addCustomer(c)}
                  >
                    <Avatar size="small" icon={<UserOutlined />} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-800 truncate">{c.name || '—'}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {c.email || c.phone || c.id.slice(0, 8)}
                      </div>
                    </div>
                    <span className="text-xs font-medium" style={{ color: BRAND_TEAL }}>+ Add</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CombineBillSetupModal;
