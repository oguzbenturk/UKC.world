// src/pages/Instructors.jsx
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button, Avatar, Select, Input, Modal, Form, InputNumber, DatePicker, Tooltip } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { PlusOutlined, UserOutlined, EditOutlined, EyeOutlined, DeleteOutlined, SearchOutlined, WalletOutlined } from '@ant-design/icons';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';
import { useAuth } from "@/shared/hooks/useAuth";
import { useData } from '@/shared/hooks/useData';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatCurrency } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import moment from 'moment';
import EnhancedInstructorDetailModal from '../components/EnhancedInstructorDetailModal';
import EnhancedManagerDetailPanel from '@/features/manager/components/EnhancedManagerDetailPanel';
import AddInstructorModal from '../components/AddInstructorModal';

/** Extract discipline tags from the skills array returned by the API */
const getDisciplines = (instructor) =>
  (instructor.skills || []).map(s => s.discipline_tag).filter(Boolean);

const STATUS_MAP = {
  active:   { color: 'green',   label: 'Active',   dot: 'bg-emerald-500' },
  inactive: { color: 'default', label: 'Inactive', dot: 'bg-slate-400'   },
  on_leave: { color: 'orange',  label: 'On Leave', dot: 'bg-amber-500'   },
};

const DISCIPLINE_STYLES = {
  kite:      { emoji: '🪁', label: 'Kite',      bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200/60' },
  wing:      { emoji: '🦅', label: 'Wing',      bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200/60' },
  kite_foil: { emoji: '🏄', label: 'Kite Foil', bg: 'bg-cyan-50',   text: 'text-cyan-700',   border: 'border-cyan-200/60' },
  efoil:     { emoji: '⚡', label: 'E-Foil',    bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200/60' },
  premium:   { emoji: '⭐', label: 'Premium',   bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200/60' },
};

const DisciplineTag = ({ tag }) => {
  const style = DISCIPLINE_STYLES[tag] || { label: tag, bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200/60' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium border leading-4 ${style.bg} ${style.text} ${style.border}`}>
      {style.label}
    </span>
  );
};

/** Same pill style as disciplines; staff who also carry manager commission use role_name === 'manager'. */
const ManagerTag = () => (
  <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium border leading-4 bg-indigo-50 text-indigo-700 border-indigo-200/60">
    Manager
  </span>
);

/** Instructor-only owed (Pay records instructor payroll, not manager commissions). */
const instructorOwedFromBal = (bal) => {
  if (!bal) return 0;
  if (bal.instructor && typeof bal.instructor.balance === 'number') return bal.instructor.balance;
  return Number(bal.balance) || 0;
};

const BalanceCell = ({ bal, fmt }) => {
  if (!bal) return <span className="text-slate-300 text-xs">—</span>;
  const inst = bal.instructor ?? {
    totalEarned: bal.totalEarned,
    totalPaid: bal.totalPaid,
    balance: bal.balance,
  };
  const hasMgr = bal.manager && (bal.manager.totalEarned > 0 || bal.manager.totalPaid > 0);
  const tooltip = hasMgr ? (
    <div className="max-w-xs space-y-1.5 text-[11px]">
      <div>
        <span className="font-semibold text-slate-200">Instructor</span>
        <div className="text-slate-300">
          {fmt(inst.totalEarned)} earned · {fmt(inst.totalPaid)} paid · <span className="text-white">{fmt(inst.balance)} owed</span>
        </div>
      </div>
      <div>
        <span className="font-semibold text-slate-200">Manager commission</span>
        <div className="text-slate-300">
          {fmt(bal.manager.totalEarned)} earned · {fmt(bal.manager.totalPaid)} paid · <span className="text-white">{fmt(bal.manager.balance)} owed</span>
        </div>
      </div>
      <div className="border-t border-white/10 pt-1.5 text-slate-100 font-medium">
        Combined owed: {fmt(bal.balance)}
      </div>
    </div>
  ) : null;

  let inner;
  if (bal.balance > 0) inner = <span className="text-xs font-semibold text-red-500 whitespace-nowrap">-{fmt(bal.balance)}</span>;
  else if (bal.balance < 0) inner = <span className="text-xs font-semibold text-emerald-600 whitespace-nowrap">+{fmt(Math.abs(bal.balance))}</span>;
  else inner = <span className="text-xs font-semibold text-emerald-600 whitespace-nowrap">✓ Paid</span>;

  return tooltip ? (
    <Tooltip title={tooltip} placement="left" classNames={{ root: 'max-w-sm' }}>
      {inner}
    </Tooltip>
  ) : (
    inner
  );
};

const InstructorMobileCard = ({ record, onAction, isAdmin, balanceData, fmt }) => {
  const disciplines = getDisciplines(record);
  const bal = balanceData?.[record.id];
  const statusInfo = STATUS_MAP[record.status] || STATUS_MAP.active;
  return (
    <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-sm mb-2.5 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <Avatar icon={<UserOutlined />} size={36} src={record.avatar_url} className="ring-2 ring-white shadow-sm" />
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${statusInfo.dot}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm text-slate-800 truncate">{record.name}</span>
              {record.role_name === 'manager' && <ManagerTag />}
              {record.is_freelance && <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded bg-amber-50 text-amber-600 border border-amber-200/60 leading-none">Freelance</span>}
            </div>
            <div className="text-xs text-slate-400 truncate">{record.email}</div>
          </div>
        </div>
      </div>
      {(disciplines.length > 0 || record.role_name === 'manager') && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {disciplines.map(s => <DisciplineTag key={s} tag={s} />)}
          {record.role_name === 'manager' && <ManagerTag />}
        </div>
      )}
      {isAdmin && bal && (
        <div className="flex items-center justify-between text-xs mb-2.5 px-2 py-1.5 rounded-lg bg-slate-50">
          <span className="text-slate-400">{fmt(bal.totalEarned)} earned · {fmt(bal.totalPaid)} paid</span>
          <span className={`font-semibold ${bal.balance > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
            {bal.balance > 0 ? fmt(bal.balance) + ' owed' : '✓ Settled'}
          </span>
        </div>
      )}
      <div className="flex justify-end gap-1.5 pt-2.5 border-t border-slate-100">
        {isAdmin && bal && instructorOwedFromBal(bal) > 0 && (
          <Button size="small" type="primary" icon={<WalletOutlined />} onClick={() => onAction('pay', record)}>Pay</Button>
        )}
        <Button size="small" icon={<EyeOutlined />} onClick={() => onAction('open', record)}>Open</Button>
        <Button size="small" icon={<EditOutlined />} onClick={() => onAction('edit', record)} />
        {isAdmin && (
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onAction('delete', record)} />
        )}
      </div>
    </div>
  );
};

function Instructors() {
  const { user } = useAuth();
  const { instructors, loading, error, deleteInstructor, apiClient } = useData();
  const { businessCurrency } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSpecialization, setFilterSpecialization] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [initialTab, setInitialTab] = useState('info');
  const [balances, setBalances] = useState({});
  const [payModal, setPayModal] = useState({ open: false, instructor: null });
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payForm] = Form.useForm();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const navigate = useNavigate();
  
  const isAdmin = user && ['manager', 'admin'].includes(user.role);
  const fmt = (v) => formatCurrency(Number(v) || 0, businessCurrency || 'EUR');

  // Fetch all instructor balances
  const fetchBalances = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await apiClient.get('/finances/instructor-balances');
      setBalances(res.data || {});
    } catch {
      // silent — balances are supplementary
    }
  }, [apiClient, isAdmin]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);
  
  // Derive all unique discipline tags from skills array
  const allSpecializations = useMemo(() =>
    [...new Set(instructors.flatMap(i => getDisciplines(i)))].sort(),
    [instructors]
  );

  // Auto-open modal when navigated via notification link (?open=<id>&tab=<section>)
  useEffect(() => {
    const openId = searchParams.get('open');
    const tab = searchParams.get('tab') || 'info';
    if (!openId || instructors.length === 0) return;
    const target = instructors.find((i) => i.id === openId);
    if (target) {
      setInitialTab(tab);
      setSelectedInstructor(target);
      setIsDetailOpen(true);
      // Clean up params so refreshing doesn't re-open
      setSearchParams((prev) => { prev.delete('open'); prev.delete('tab'); return prev; }, { replace: true });
    }
  }, [instructors, searchParams, setSearchParams]);

  const activeCount = instructors.filter(i => i.status === 'active' || !i.status).length;
  const inactiveCount = instructors.length - activeCount;
  
  // Apply filters and search
  const filteredInstructors = useMemo(() => instructors.filter(instructor => {
    if (filterStatus !== 'all' && (instructor.status || 'active') !== filterStatus) return false;
    
    const disciplines = getDisciplines(instructor);
    if (filterSpecialization !== 'all' && !disciplines.includes(filterSpecialization)) return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        instructor.name?.toLowerCase().includes(q) ||
        instructor.email?.toLowerCase().includes(q) ||
        disciplines.some(d => d.toLowerCase().includes(q))
      );
    }
    return true;
  }), [instructors, filterStatus, filterSpecialization, searchQuery]);
  
  const handleDeleteInstructor = (instructorId) => {
    Modal.confirm({
      title: 'Delete Instructor',
      content: 'Are you sure you want to delete this instructor? This action cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      centered: true,
      onOk: async () => {
        try {
          await deleteInstructor(instructorId);
        } catch {
          message.error('Failed to delete instructor');
        }
      },
    });
  };

  const openPayModal = (instructor) => {
    const bal = balances[instructor.id];
    const owedInstr = instructorOwedFromBal(bal);
    setPayModal({ open: true, instructor });
    payForm.setFieldsValue({
      amount: owedInstr > 0 ? owedInstr : 0,
      payment_date: moment(),
      payment_method: 'bank_transfer',
      description: `Salary payment – ${instructor.name}`,
    });
  };

  const handlePay = async (values) => {
    setPaySubmitting(true);
    try {
      await apiClient.post('/finances/instructor-payments', {
        instructor_id: payModal.instructor.id,
        amount: Math.abs(values.amount),
        description: values.description,
        payment_date: values.payment_date.format('YYYY-MM-DD'),
        payment_method: values.payment_method,
      });
      message.success(`Payment of ${fmt(values.amount)} recorded for ${payModal.instructor.name}`);
      setPayModal({ open: false, instructor: null });
      payForm.resetFields();
      fetchBalances();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setPaySubmitting(false);
    }
  };

  return (
    <div className="min-h-[60vh] p-4 sm:p-8 max-w-[1400px] mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Team & Instructors</h1>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-md border border-slate-200 font-medium text-slate-700 shadow-sm">
              <UserOutlined className="text-blue-500" />
              Total: {instructors.length}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {activeCount} Active
            </span>
            {inactiveCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300" />
                {inactiveCount} Inactive/Leave
              </span>
            )}
            <span className="hidden sm:inline-block w-px h-4 bg-slate-300 mx-1" />
            <span className="hidden sm:inline text-slate-400">Manage your school's teaching staff, specializations, and payroll</span>
          </div>
        </div>
        
        {isAdmin && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
            className="w-full sm:w-auto shrink-0 shadow-sm hover:shadow font-medium bg-blue-600 hover:bg-blue-500 border-0"
          >
            Add New Instructor
          </Button>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center gap-3 py-1">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search name, email, discipline…"
          prefix={<SearchOutlined className="text-slate-400" />}
          allowClear
          className="sm:max-w-md w-full"
          size="large"
        />
        <Select
          value={filterStatus}
          onChange={setFilterStatus}
          className="sm:w-44 w-full"
          size="large"
          options={[
            { value: 'all', label: 'All Statuses' },
            { value: 'active', label: '● Active' },
            { value: 'inactive', label: '● Inactive' },
            { value: 'on_leave', label: '● On Leave' },
          ]}
        />
        <Select
          value={filterSpecialization}
          onChange={setFilterSpecialization}
          className="sm:w-56 w-full"
          showSearch
          size="large"
          options={[
            { value: 'all', label: 'All Disciplines' },
            ...allSpecializations.map(s => {
              const d = DISCIPLINE_STYLES[s];
              return { value: s, label: d ? d.label : s };
            }),
          ]}
        />
        {(searchQuery || filterStatus !== 'all' || filterSpecialization !== 'all') && (
          <Button
            type="text"
            className="text-slate-500 hover:text-slate-800"
            onClick={() => { setSearchQuery(''); setFilterStatus('all'); setFilterSpecialization('all'); }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          <p className="mt-3 text-sm text-slate-400">Loading instructors…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-5 text-center">
          <p className="text-red-600 text-sm font-medium">{error}</p>
          <button className="text-red-500 underline text-xs mt-2" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      ) : filteredInstructors.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200 shadow-sm">
          <UserOutlined className="text-4xl text-slate-200" />
          <p className="mt-3 text-base text-slate-500 font-medium">No instructors found</p>
          <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
          <UnifiedResponsiveTable 
            title={null}
            density="comfortable"
            className="border-slate-200/80 shadow-sm rounded-xl overflow-hidden"
            dataSource={filteredInstructors}
            rowKey="id"
            mobileCardRenderer={(props) => (
              <InstructorMobileCard 
                {...props} 
                isAdmin={isAdmin}
                balanceData={balances}
                fmt={fmt}
                onAction={(action, record) => {
                  if (action === 'open') { setSelectedInstructor(record); setIsDetailOpen(true); }
                  else if (action === 'edit') navigate(`/instructors/edit/${record.id}`);
                  else if (action === 'delete') handleDeleteInstructor(record.id);
                  else if (action === 'pay') openPayModal(record);
                }} 
              />
            )}
            columns={[
              {
                title: 'Instructor',
                key: 'name',
                render: (_, record) => {
                  const statusInfo = STATUS_MAP[record.status] || STATUS_MAP.active;
                  return (
                    <div className="flex items-center gap-2.5 py-0.5">
                      <div className="relative shrink-0">
                        <Avatar src={record.avatar_url} icon={<UserOutlined />} size={32} className="ring-2 ring-white shadow-sm" />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white ${statusInfo.dot}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-slate-800 truncate text-sm">{record.name}</span>
                          {record.role_name === 'manager' && <ManagerTag />}
                          {record.is_freelance && <span className="shrink-0 px-1 py-0 text-[10px] font-semibold uppercase rounded bg-amber-50 text-amber-600 border border-amber-200/60 leading-4">FL</span>}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{record.email}</div>
                      </div>
                    </div>
                  );
                }
              },
              {
                title: 'Disciplines',
                key: 'disciplines',
                width: 150,
                render: (_, record) => {
                  const disciplines = getDisciplines(record);
                  const showMgr = record.role_name === 'manager';
                  if (disciplines.length === 0 && !showMgr) return <span className="text-slate-300">—</span>;
                  return (
                    <div className="grid grid-cols-2 gap-1">
                      {disciplines.map(s => <DisciplineTag key={s} tag={s} />)}
                      {showMgr && <ManagerTag key="manager" />}
                    </div>
                  );
                }
              },
              ...(isAdmin ? [{
                title: 'Balance',
                key: 'balance',
                width: 110,
                render: (_, record) => <BalanceCell bal={balances[record.id]} fmt={fmt} />
              }] : []),
              { 
                title: '',
                key: 'actions',
                width: isAdmin ? 150 : 80,
                render: (_, instructor) => (
                  <div className="flex items-center justify-end gap-1">
                    {isAdmin && instructorOwedFromBal(balances[instructor.id]) > 0 && (
                      <Button size="small" type="primary" ghost onClick={() => openPayModal(instructor)} className="border-orange-300 text-orange-500 hover:text-orange-600 hover:border-orange-400">Pay</Button>
                    )}
                    <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => { setSelectedInstructor(instructor); setIsDetailOpen(true); }} className="text-slate-400 hover:text-blue-500" />
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => navigate(`/instructors/edit/${instructor.id}`)} className="text-slate-400 hover:text-blue-500" />
                    {isAdmin && <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDeleteInstructor(instructor.id)} className="text-slate-300 hover:text-red-500" />}
                  </div>
                )
              }
            ]}
          />
      )}

      {/* ── Detail Modal ───────────────────────────────────── */}
      {selectedInstructor?.role_name === 'manager' ? (
        <EnhancedManagerDetailPanel
          manager={selectedInstructor}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          onUpdate={() => { fetchBalances(); }}
        />
      ) : (
        <EnhancedInstructorDetailModal
          instructor={selectedInstructor}
          isOpen={isDetailOpen}
          initialTab={initialTab}
          onClose={() => { setIsDetailOpen(false); setInitialTab('info'); }}
          onUpdate={() => { fetchBalances(); }}
        />
      )}

      {/* ── Quick Pay Modal ────────────────────────────────── */}
      <Modal
        title={null}
        open={payModal.open}
        onCancel={() => { setPayModal({ open: false, instructor: null }); payForm.resetFields(); }}
        footer={null}
        destroyOnHidden
        width={440}
      >
        {payModal.instructor && (
          <>
            {/* Modal header with instructor info */}
            <div className="flex items-center gap-3 mb-5">
              <Avatar src={payModal.instructor.avatar_url} icon={<UserOutlined />} size={44} className="ring-2 ring-slate-100 shadow-sm" />
              <div>
                <h3 className="text-base font-semibold text-slate-800">{payModal.instructor.name}</h3>
                <p className="text-xs text-slate-400">Record salary payment</p>
              </div>
            </div>

            {/* Balance summary cards */}
            {balances[payModal.instructor.id] && (() => {
              const bal = balances[payModal.instructor.id];
              const inst = bal.instructor ?? bal;
              const instOwed = instructorOwedFromBal(bal);
              return (
                <>
                  <p className="text-[11px] text-slate-500 mb-2">
                    This payment applies to <strong className="text-slate-700">instructor earnings</strong> only ({fmt(instOwed)} owed).
                    {bal.manager && (bal.manager.totalEarned > 0 || bal.manager.totalPaid > 0) && (
                      <span> Manager commission is settled separately ({fmt(bal.manager.balance)} owed).</span>
                    )}
                  </p>
                  <div className="grid grid-cols-3 gap-2 mb-5">
                    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/60 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-blue-500/80 font-medium">Instructor earned</div>
                      <div className="text-sm font-bold text-blue-700 mt-0.5">{fmt(inst.totalEarned)}</div>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100/60 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-500/80 font-medium">Instructor paid</div>
                      <div className="text-sm font-bold text-emerald-700 mt-0.5">{fmt(inst.totalPaid)}</div>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100/60 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-orange-500/80 font-medium">Instructor owed</div>
                      <div className="text-sm font-bold text-orange-700 mt-0.5">{fmt(instOwed)}</div>
                    </div>
                  </div>
                </>
              );
            })()}
          </>
        )}

        <Form form={payForm} layout="vertical" onFinish={handlePay} requiredMark={false} size="middle">
          <Form.Item name="amount" label={<span className="text-xs font-medium text-slate-600">Payment Amount</span>} rules={[{ required: true, message: 'Enter amount' }]}>
            <InputNumber min={0.01} step={0.01} className="w-full" prefix={businessCurrency || '€'} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="payment_date" label={<span className="text-xs font-medium text-slate-600">Date</span>} rules={[{ required: true, message: 'Select date' }]}>
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item name="payment_method" label={<span className="text-xs font-medium text-slate-600">Method</span>} rules={[{ required: true }]}>
              <Select>
                <Select.Option value="bank_transfer">🏦 Bank Transfer</Select.Option>
                <Select.Option value="cash">💵 Cash</Select.Option>
                <Select.Option value="paypal">🅿️ PayPal</Select.Option>
                <Select.Option value="other">📋 Other</Select.Option>
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="description" label={<span className="text-xs font-medium text-slate-600">Note</span>} rules={[{ required: true, message: 'Enter description' }]}>
            <Input.TextArea rows={2} placeholder="e.g. March salary, bonus…" className="resize-none" />
          </Form.Item>
          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 mt-1">
            <Button onClick={() => { setPayModal({ open: false, instructor: null }); payForm.resetFields(); }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={paySubmitting} icon={<WalletOutlined />}>
              Record Payment
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ── Add Instructor Modal ──────────────────────────── */}
      <AddInstructorModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => fetchBalances()}
      />
    </div>
  );
}

export default Instructors;