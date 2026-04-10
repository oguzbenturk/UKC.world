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
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border leading-4 tracking-wide uppercase ${style.bg} ${style.text} ${style.border}`}>
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
    <div className="p-4 bg-white rounded-2xl border border-slate-200/60 shadow-sm mb-3 hover:shadow-md transition-all duration-200">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <Avatar icon={<UserOutlined />} size={44} src={record.avatar_url} className="ring-2 ring-white shadow-md" />
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${statusInfo.dot}`}
                  style={statusInfo.dot === 'bg-emerald-500' ? { boxShadow: '0 0 6px rgba(52,211,153,0.4)' } : {}} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-[15px] text-slate-800 truncate">{record.name}</span>
              {record.role_name === 'manager' && <ManagerTag />}
              {record.is_freelance && <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-md bg-amber-50 text-amber-600 border border-amber-200/60 leading-none tracking-wider">FL</span>}
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">{record.email}</div>
          </div>
        </div>
      </div>
      {(disciplines.length > 0 || record.role_name === 'manager') && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {disciplines.map(s => <DisciplineTag key={s} tag={s} />)}
          {record.role_name === 'manager' && <ManagerTag />}
        </div>
      )}
      {isAdmin && bal && (
        <div className="flex items-center justify-between text-xs mb-3 px-3 py-2 rounded-xl bg-slate-50/80 border border-slate-100">
          <span className="text-slate-400">{fmt(bal.totalEarned)} earned · {fmt(bal.totalPaid)} paid</span>
          <span className={`font-bold ${bal.balance > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
            {bal.balance > 0 ? fmt(bal.balance) + ' owed' : '✓ Settled'}
          </span>
        </div>
      )}
      <div className="flex justify-end gap-1.5 pt-3 border-t border-slate-100">
        {isAdmin && bal && instructorOwedFromBal(bal) > 0 && (
          <Button size="small" type="primary" icon={<WalletOutlined />} onClick={() => onAction('pay', record)}
            className="!rounded-lg" style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)' }}>Pay</Button>
        )}
        <Button size="small" icon={<EyeOutlined />} onClick={() => onAction('open', record)} className="!rounded-lg">Open</Button>
        <Button size="small" icon={<EditOutlined />} onClick={() => onAction('edit', record)} className="!rounded-lg" />
        {isAdmin && (
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onAction('delete', record)} className="!rounded-lg" />
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
    <div className="min-h-[60vh] max-w-[1400px] mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="mx-4 mt-4 mb-5 px-5 sm:px-6 py-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center">
            <UserOutlined className="text-slate-500 text-sm" />
          </div>
          <div>
            <h1 className="text-lg font-duotone-bold-extended text-slate-800 tracking-tight uppercase leading-tight">
              Team & Instructors
            </h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[11px] font-medium text-slate-400">{instructors.length} Total</span>
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {activeCount} Active
              </span>
              {inactiveCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {inactiveCount} Away
                </span>
              )}
            </div>
          </div>
        </div>

        {isAdmin && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalOpen(true)}
            className="w-full sm:w-auto shrink-0 font-semibold text-[12px] border-0 h-9 px-5 rounded-lg bg-slate-900 hover:bg-slate-800"
          >
            Add Instructor
          </Button>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <div className="px-4 sm:px-4 mb-5">
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-xl px-4 py-3 shadow-sm">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, email, discipline…"
            prefix={<SearchOutlined className="text-slate-400" />}
            allowClear
            className="sm:max-w-sm w-full !rounded-lg"
            size="large"
          />
          <div className="hidden sm:block w-px h-7 bg-slate-200" />
          <Select
            value={filterStatus}
            onChange={setFilterStatus}
            className="sm:w-40 w-full"
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
            className="sm:w-48 w-full"
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
              className="text-slate-500 hover:text-slate-800 font-medium"
              onClick={() => { setSearchQuery(''); setFilterStatus('all'); setFilterSpecialization('all'); }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      <div className="px-4 sm:px-4">
      {loading ? (
        <div className="text-center py-20">
          <div className="inline-block w-8 h-8 border-[3px] border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
          <p className="mt-4 text-sm text-slate-400 font-duotone-regular">Loading instructors…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
          <p className="text-red-600 text-sm font-medium">{error}</p>
          <button className="text-red-500 underline text-xs mt-2" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      ) : filteredInstructors.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <UserOutlined className="text-2xl text-slate-300" />
          </div>
          <p className="text-base text-slate-600 font-semibold">No instructors found</p>
          <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
          <UnifiedResponsiveTable
            title={null}
            density="comfortable"
            className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden [&_.ant-table]:!rounded-2xl [&_.ant-table-thead>tr>th]:!bg-slate-50/80 [&_.ant-table-thead>tr>th]:!border-b-slate-200/40 [&_.ant-table-thead>tr>th]:!text-[10px] [&_.ant-table-thead>tr>th]:!uppercase [&_.ant-table-thead>tr>th]:!tracking-widest [&_.ant-table-thead>tr>th]:!font-bold [&_.ant-table-thead>tr>th]:!text-slate-400 [&_.ant-table-thead>tr>th]:!py-3 [&_.ant-table-tbody>tr:hover>td]:!bg-cyan-50/30 [&_.ant-table-tbody>tr>td]:!border-b-slate-100/60 [&_.ant-table-tbody>tr>td]:!py-3.5"
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
                    <div className="flex items-center gap-3 py-0.5">
                      <div className="relative shrink-0">
                        <Avatar src={record.avatar_url} icon={<UserOutlined />} size={38} className="ring-2 ring-white shadow-md" />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${statusInfo.dot}`}
                              style={statusInfo.dot === 'bg-emerald-500' ? { boxShadow: '0 0 4px rgba(52,211,153,0.4)' } : {}} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-800 truncate text-[13px]">{record.name}</span>
                          {record.role_name === 'manager' && <ManagerTag />}
                          {record.is_freelance && <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-md bg-amber-50 text-amber-600 border border-amber-200/60 leading-none tracking-wider">FL</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">{record.email}</div>
                      </div>
                    </div>
                  );
                }
              },
              {
                title: 'Disciplines',
                key: 'disciplines',
                width: 180,
                render: (_, record) => {
                  const disciplines = getDisciplines(record);
                  const showMgr = record.role_name === 'manager';
                  if (disciplines.length === 0 && !showMgr) return <span className="text-slate-300">—</span>;
                  return (
                    <div className="flex flex-wrap gap-1">
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
                width: isAdmin ? 160 : 80,
                render: (_, instructor) => (
                  <div className="flex items-center justify-end gap-1">
                    {isAdmin && instructorOwedFromBal(balances[instructor.id]) > 0 && (
                      <Button size="small" onClick={() => openPayModal(instructor)}
                        className="!rounded-lg !border-orange-200 !text-orange-500 hover:!text-orange-600 hover:!border-orange-300 hover:!bg-orange-50 !text-[11px] !font-semibold !px-2.5"
                      >Pay</Button>
                    )}
                    <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => { setSelectedInstructor(instructor); setIsDetailOpen(true); }} className="!text-slate-400 hover:!text-cyan-600 hover:!bg-cyan-50/60 !rounded-lg" />
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => navigate(`/instructors/edit/${instructor.id}`)} className="!text-slate-400 hover:!text-cyan-600 hover:!bg-cyan-50/60 !rounded-lg" />
                    {isAdmin && <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDeleteInstructor(instructor.id)} className="!text-slate-300 hover:!text-red-500 hover:!bg-red-50/60 !rounded-lg" />}
                  </div>
                )
              }
            ]}
          />
      )}
      </div>

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