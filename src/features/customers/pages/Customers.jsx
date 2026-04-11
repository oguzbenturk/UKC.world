// src/pages/Customers.jsx
/* eslint-disable no-unused-vars */
import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Button, Space, Modal, Input, Card, 
  Avatar, Row, Col, Tag, Segmented, Tooltip, Empty, Spin, Dropdown, Drawer
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { 
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender
} from '@tanstack/react-table';
import { useNavigate, useLocation } from 'react-router-dom';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import DataService from '@/shared/services/dataService';
import { 
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  UserOutlined, AppstoreOutlined, BarsOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
  FilterOutlined
 } from '@ant-design/icons';

const CustomerDeleteModal = lazy(() => import('../components/CustomerDeleteModal'));
const EnhancedCustomerDetailModal = lazy(() => import('../components/EnhancedCustomerDetailModal'));

import UserForm from '@/shared/components/ui/UserForm';
import apiClient from '@/shared/services/apiClient';

const Customers = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { formatCurrency, businessCurrency, convertCurrency, userCurrency } = useCurrency();
  const { user: currentUser } = useAuth();
  
  // Staff (admin/manager/instructor/developer) see EUR, customers see their preferred currency
  const isStaff = useMemo(() => {
    const staffRoles = ['admin', 'manager', 'developer', 'instructor'];
    return currentUser && staffRoles.includes(currentUser.role?.toLowerCase());
  }, [currentUser]);
  
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState(''); // debounced query sent to server
  // Top-level quick filters and load-time display removed per request
  const [limit, setLimit] = useState(200);
  const [nextCursor, setNextCursor] = useState(null);
  const nextCursorRef = useRef(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastVisibilityRefetchAt = useRef(0);
  // Always use compact density
  const density = 'small';
  // Column-level filters
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all'); // 'all' | 'paid' | 'package' | 'pending'
  const [balanceSignFilter, setBalanceSignFilter] = useState('all'); // 'all' | 'negative' | 'zero' | 'positive'
  
  // Delete modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  
  // Side panel state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // Add/Edit customer drawer
  const [isFormDrawerOpen, setIsFormDrawerOpen] = useState(false);
  const [formRoles, setFormRoles] = useState([]);
  
  const [stats, setStats] = useState({
    total: 0,
    shopCustomers: 0,
    schoolCustomers: 0
  });
  
  // Component render state monitoring (removed for production)
  
  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  // Stable callback: do NOT depend on nextCursor — it changed after every "load more" and
  // recreated this function, retriggering effects and resetting the list / refetching.
  const fetchCustomers = useCallback(async ({ reset = false, append = false } = {}) => {
    try {
      const showSpinner = !append;
      if (showSpinner) setLoading(true);
      else setIsLoadingMore(true);

      const params = {
        q: q || undefined,
        limit,
        cursor: append ? nextCursorRef.current || undefined : undefined,
      };

      const res = await DataService.getCustomersList(params);

      setCustomers((prev) => {
        const nextList = reset
          ? (res.items || [])
          : append
            ? [...prev, ...(res.items || [])]
            : (res.items || []);
        setStats({ total: nextList.length, shopCustomers: 0, schoolCustomers: nextList.length });
        return nextList;
      });

      setNextCursor(res.nextCursor || null);
    } catch {
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [q, limit]);

  // Detect return from user creation and refresh data
  useEffect(() => {
    if (location.state?.userCreated) {
      fetchCustomers({ reset: true });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, fetchCustomers]);

  // Throttled refresh when returning to the tab (avoid hammering API + React tree on every focus)
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastVisibilityRefetchAt.current < 120_000) return;
      lastVisibilityRefetchAt.current = now;
      fetchCustomers({ reset: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchCustomers]);

  // Debounce search input -> server query (q)
  useEffect(() => {
    const h = setTimeout(() => {
      setQ(searchText.trim());
    }, 300);
    return () => clearTimeout(h);
  }, [searchText]);

  // Initial + refetch when server query or page size changes
  useEffect(() => {
    fetchCustomers({ reset: true });
  }, [q, limit, fetchCustomers]);
  
  
  // Manual refresh button removed; data auto-refreshes on visibility/focus
  
  const handleDelete = useCallback((customer) => {
    // Open the delete modal with customer data
    setCustomerToDelete(customer);
    setDeleteModalVisible(true);
  }, []);
  
  const handleDeleteModalClose = useCallback(() => {
    setDeleteModalVisible(false);
    setCustomerToDelete(null);
  }, []);
  
  const handleDeleteSuccess = useCallback(() => {
    fetchCustomers({ reset: true });
  }, [fetchCustomers]);
  
  const handleAddClick = useCallback(() => {
    // Fetch roles if not loaded yet
    if (formRoles.length === 0) {
      apiClient.get('/roles').then(res => setFormRoles(res.data || [])).catch(() => {});
    }
    setIsFormDrawerOpen(true);
  }, [formRoles.length]);
  
  const handleFormSuccess = useCallback(() => {
    setIsFormDrawerOpen(false);
    fetchCustomers({ reset: true });
  }, [fetchCustomers]);
  
  // Quick filter handled via Segmented in toolbar

  const getPaymentStatusTag = useCallback((status) => {
    switch (status) {
      case 'paid':
        return <Tag color="green">Paid</Tag>;
      case 'package':
        return <Tag color="blue">Package</Tag>;
      case 'partial':
        return <Tag color="orange">Partial</Tag>;
      case 'pending':
        return <Tag color="orange">Pending</Tag>;
      case 'overdue':
        return <Tag color="red">Overdue</Tag>;
      case 'loading':
        return <Tag color="blue">Loading...</Tag>;
      case 'timeout':
        return <Tag color="orange">Refresh needed</Tag>;
      case 'error':
        return <Tag color="red">Error</Tag>;
      default:
        return <Tag color="default">N/A</Tag>;
    }
  }, []);
  
  // Headless table column defs (TanStack)
  const columns = useMemo(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: () => 'Name',
        enableSorting: true,
        cell: ({ row, getValue }) => {
          const record = row.original;
          const rawName = (getValue() ?? '').toString();
          const displayName = rawName.replace(/\s+/g, ' ').trim();

          return (
            <div className="flex items-center gap-2">
              <div className="shrink-0">
                <Avatar size={28} src={record.profile_image_url || record.avatar} icon={<UserOutlined />} />
              </div>
              <div className="min-w-0">
                <a
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCustomer(record);
                    setIsDetailOpen(true);
                  }}
                  className="text-gray-900 font-medium truncate block hover:text-blue-600 text-sm cursor-pointer"
                  title={displayName}
                >
                  {displayName}
                </a>
                {record.email && (
                  <span className="block text-[10px] text-gray-500 truncate" title={record.email}>
                    {record.email}
                  </span>
                )}
              </div>
            </div>
          );
        }
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: () => 'Role',
        enableSorting: true,
        cell: ({ getValue }) => {
          const role = getValue();
          const roleConfig = {
            student: { color: 'blue', label: 'Student' },
            outsider: { color: 'orange', label: 'Outsider' },
            trusted_customer: { color: 'green', label: 'Trusted' },
          };
          const config = roleConfig[role] || { color: 'default', label: role };
          return <Tag color={config.color}>{config.label}</Tag>;
        }
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: () => 'Email',
        enableSorting: true,
        cell: info => info.getValue()
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: () => 'Phone',
        enableSorting: false,
        cell: info => info.getValue() || '—'
      },
      {
        id: 'balance',
        accessorKey: 'balance',
        header: () => (
          <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
            <span>Balance</span>
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [balanceSignFilter],
                items: [
                  { key: 'all', label: 'All' },
                  { key: 'negative', label: '< 0' },
                  { key: 'zero', label: '= 0' },
                  { key: 'positive', label: '> 0' },
                ],
                onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); setBalanceSignFilter(key); }
              }}
            >
              <Button size="small" type={balanceSignFilter !== 'all' ? 'primary' : 'text'} icon={<FilterOutlined />} />
            </Dropdown>
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue, row }) => {
          const value = Number(getValue() || 0);
          const color = value < 0 ? 'text-red-600' : 'text-green-600';
          
          // balance is always returned in EUR by the backend (converted from wallet currency).
          // Never use businessCurrency here — that could be TRY, USD, etc. and would show
          // the EUR amount with the wrong symbol.
          const displayCurrencyCode = 'EUR';
          
          return (
            <div className="text-right w-full">
              <span className={`font-medium ${color}`}>
                {formatCurrency(value, displayCurrencyCode)}
              </span>
            </div>
          );
        }
      },
      {
        id: 'payment_status',
        accessorKey: 'payment_status',
        header: () => (
          <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
            <span>Payment Status</span>
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [paymentStatusFilter],
                items: [
                  { key: 'all', label: 'All' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'paid', label: 'Paid' },
                  { key: 'package', label: 'Package' },
                  { key: 'overdue', label: 'Overdue' },
                ],
                onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); setPaymentStatusFilter(key); }
              }}
            >
              <Button size="small" type={paymentStatusFilter !== 'all' ? 'primary' : 'text'} icon={<FilterOutlined />} />
            </Dropdown>
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => (
          <div className="flex justify-center w-full">
            {getPaymentStatusTag(getValue())}
          </div>
        )
      },
      {
        id: 'actions',
        header: () => <div className="text-center w-full">Actions</div>,
        enableSorting: false,
        cell: ({ row }) => {
          const record = row.original;
          return (
            <div className="flex items-center justify-center w-full gap-2">
              <Tooltip title="Edit Customer">
                <Button type="text" shape="circle" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); navigate(`/customers/${record.id}/edit`); }} />
              </Tooltip>
              <Tooltip title="Delete Customer">
                <Button type="text" danger shape="circle" icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDelete(record); }} />
              </Tooltip>
            </div>
          );
        }
      }
    ],
  [navigate, getPaymentStatusTag, handleDelete, paymentStatusFilter, balanceSignFilter, formatCurrency, businessCurrency]
  );
  
  // Customers are server-filtered by q; column-level filters apply client-side
  const visibleCustomers = useMemo(() => {
    let data = customers;
    if (paymentStatusFilter !== 'all') {
      data = data.filter(c => c.payment_status === paymentStatusFilter);
    }
    if (balanceSignFilter !== 'all') {
      const val = (v) => Number(v || 0);
      if (balanceSignFilter === 'negative') data = data.filter(c => val(c.balance) < 0);
      if (balanceSignFilter === 'zero') data = data.filter(c => val(c.balance) === 0);
      if (balanceSignFilter === 'positive') data = data.filter(c => val(c.balance) > 0);
    }
    return data;
  }, [customers, paymentStatusFilter, balanceSignFilter]);
  
  const renderCards = () => {
  if (visibleCustomers.length === 0) {
      return <Empty description="No customers found" />;
    }
    
    return (
      <Row gutter={[16, 16]}>
    {visibleCustomers.map(customer => (
          <Col xs={24} sm={12} md={8} lg={6} key={customer.id}>
            <Card 
              hoverable
              onClick={() => { setSelectedCustomer(customer); setIsDetailOpen(true); }}
              title={
                <Space>
                  <Avatar src={customer.profile_image_url || customer.avatar} icon={<UserOutlined />} />
                  <span>{customer.name}</span>
                </Space>
              }
              actions={[
                <Tooltip key="edit-tooltip" title="Edit Customer">
                  <EditOutlined 
                    key="edit" 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/customers/${customer.id}/edit`);
                    }} 
                  />
                </Tooltip>,
                <Tooltip key="delete-tooltip" title="Delete Customer">
                  <Button
                    key="delete"
                    type="text"
                    danger
                    shape="circle"
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(customer);
                    }}
                  />
                </Tooltip>,
              ]}
            >
        <Spin spinning={loading && customers.length === 0} size="small">
                <p><strong>Email:</strong> {customer.email}</p>
                <p><strong>Phone:</strong> {customer.phone || 'N/A'}</p>
                <div>
                  <strong>Balance:</strong> 
                  <span style={{ color: (customer.balance || 0) < 0 ? 'red' : 'green' }}>
          {(() => {
            // IMPORTANT: All balances in DB are stored in EUR (base currency)
            const storageCurrency = businessCurrency || 'EUR';
            const customerPreferredCurrency = customer.preferred_currency || storageCurrency;
            let displayAmount = Number(customer.balance || 0);
            let displayCurrencyCode = storageCurrency;
            
            // Only convert for customers viewing (staff sees EUR)
            if (!isStaff && customerPreferredCurrency !== storageCurrency && convertCurrency) {
              displayAmount = convertCurrency(displayAmount, storageCurrency, customerPreferredCurrency);
              displayCurrencyCode = customerPreferredCurrency;
            }
            return ` ${formatCurrency(displayAmount, displayCurrencyCode)}`;
          })()}
                  </span>
                </div>
                <p><strong>Payment Status</strong> {getPaymentStatusTag(customer.payment_status)}</p>
              </Spin>
            </Card>
          </Col>
        ))}
      </Row>
    );
  };
  
  // Build TanStack table instance
  const [sorting, setSorting] = useState([]);
  const table = useReactTable({
    data: visibleCustomers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: false
  });

  const tableRows = table.getRowModel().rows;
  const scrollParentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 46,
    overscan: 12,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const padTop = virtualItems.length ? virtualItems[0].start : 0;
  const padBot = virtualItems.length
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;
  const colCount = columns.length;

  // Density -> padding/text classes
  const densityRow = density === 'small' ? 'text-sm py-1' : density === 'large' ? 'text-base py-3' : 'text-sm py-2';
  const densityHead = density === 'small' ? 'py-2' : density === 'large' ? 'py-4' : 'py-3';

  return (
    <div className="p-6">
      <div className="flex items-center mb-6" style={{ justifyContent: 'space-between' }}>
        <div style={{ flex: '1' }}>
          <Input
            placeholder="Search customers..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            style={{ maxWidth: '300px' }}
          />
        </div>
        
        <div className="flex justify-end gap-3 items-center" style={{ flex: '1' }}>
          {/* View modes removed - only table view now */}
          
          <Button 
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddClick}
            size="middle"
          >
            Add Customer
          </Button>
        </div>
      </div>
      
      {/* Always show table view */}
      <>
        <UnifiedTable density="comfortable">
            <div ref={scrollParentRef} className="max-h-[min(70vh,720px)] overflow-auto">
              <table className="min-w-full text-left border-separate border-spacing-0">
                  <thead className="bg-white">
                    {table.getHeaderGroups().map(headerGroup => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => {
                          const sorted = header.column.getIsSorted();
                          
                          // Determine alignment class based on column
                          let headerAlignmentClass = '';
                          if (header.column.id === 'balance') {
                            headerAlignmentClass = 'text-right';
                          } else if (header.column.id === 'payment_status' || header.column.id === 'actions') {
                            headerAlignmentClass = 'text-center';
                          } else {
                            headerAlignmentClass = 'text-left';
                          }
                          
                          return (
                            <th
                              key={header.id}
                              className={`sticky top-0 z-20 bg-white border-b border-gray-300 px-4 ${densityHead} ${headerAlignmentClass} font-semibold text-gray-800 select-none ${header.column.id === 'email' || header.column.id === 'payment_status' ? 'hidden md:table-cell' : ''}`}
                              onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                            >
                              <div className={`flex items-center gap-1 ${headerAlignmentClass === 'text-right' ? 'justify-end' : headerAlignmentClass === 'text-center' ? 'justify-center' : 'justify-start'}`}>
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {sorted === 'asc' && <span className="text-gray-400">▲</span>}
                                {sorted === 'desc' && <span className="text-gray-400">▼</span>}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {loading && customers.length === 0 ? (
                      <tr>
                        <td colSpan={colCount} className="text-center py-8">
                          <Spin />
                        </td>
                      </tr>
                    ) : !loading && tableRows.length === 0 ? (
                      <tr>
                        <td colSpan={colCount} className="py-12">
                          <div className="flex flex-col items-center justify-center text-gray-500">
                            <Empty description="No customers found">
                              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddClick}>Add Customer</Button>
                            </Empty>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {padTop > 0 && (
                          <tr aria-hidden="true">
                            <td colSpan={colCount} style={{ height: padTop, padding: 0, border: 'none' }} />
                          </tr>
                        )}
                        {virtualItems.map((vRow) => {
                          const row = tableRows[vRow.index];
                          const idx = vRow.index;
                          return (
                            <tr
                              key={row.id}
                              data-index={vRow.index}
                              ref={rowVirtualizer.measureElement}
                              className={`${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100 transition-colors cursor-pointer`}
                              onClick={(e) => {
                                const interactiveSelectors = 'button, a, input, [role="button"], .ant-dropdown-trigger, .ant-select, .ant-tooltip-open';
                                if (e.target.closest(interactiveSelectors)) return;
                                setSelectedCustomer(row.original);
                                setIsDetailOpen(true);
                              }}
                            >
                              {row.getVisibleCells().map((cell) => {
                                let alignmentClass = '';
                                if (cell.column.id === 'balance') {
                                  alignmentClass = 'text-right';
                                } else if (cell.column.id === 'payment_status' || cell.column.id === 'actions') {
                                  alignmentClass = 'text-center';
                                } else {
                                  alignmentClass = 'text-left';
                                }
                                return (
                                  <td
                                    key={cell.id}
                                    className={`px-4 ${densityRow} align-middle border-t border-gray-200 ${alignmentClass} ${cell.column.id === 'email' || cell.column.id === 'payment_status' ? 'hidden md:table-cell' : ''}`}
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        {padBot > 0 && (
                          <tr aria-hidden="true">
                            <td colSpan={colCount} style={{ height: padBot, padding: 0, border: 'none' }} />
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
      </div>
    </UnifiedTable>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 }}>
            <Space>
              <span style={{ color: '#888' }}>Page size:</span>
              <Segmented
                options={[25, 50, 100, 200].map(v => ({ label: String(v), value: v }))}
                value={limit}
                onChange={(v) => { setLimit(v); setNextCursor(null); }}
              />
              <Button
                onClick={() => fetchCustomers({ append: true })}
                disabled={!nextCursor}
                loading={isLoadingMore}
                type="default"
              >
                {nextCursor ? 'Load more' : 'All loaded'}
              </Button>
              <span className="text-gray-400 text-xs max-w-[200px] hidden sm:inline">
                Large lists stay smooth via virtual scrolling; use search to narrow results.
              </span>
            </Space>
          </div>
        </>
        
        {/* Customer Delete Modal */}
        <Suspense fallback={null}>
          {deleteModalVisible && (
            <CustomerDeleteModal
              visible={deleteModalVisible}
              onClose={handleDeleteModalClose}
              userId={customerToDelete?.id}
              userName={customerToDelete?.name || `${customerToDelete?.first_name || ''} ${customerToDelete?.last_name || ''}`.trim()}
              onDeleted={handleDeleteSuccess}
            />
          )}
        </Suspense>
        
        {/* Customer Side Panel */}
        <Suspense fallback={null}>
          <EnhancedCustomerDetailModal
            customer={selectedCustomer}
            isOpen={isDetailOpen}
            onClose={() => { setIsDetailOpen(false); setSelectedCustomer(null); }}
            onUpdate={() => fetchCustomers({ reset: true })}
          />
        </Suspense>
        
        {/* Add Customer Drawer */}
        <Drawer
          open={isFormDrawerOpen}
          onClose={() => setIsFormDrawerOpen(false)}
          width={520}
          closable={false}
          destroyOnHidden
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }, header: { display: 'none' } }}
        >
          <div className="flex-shrink-0 border-b border-slate-200 bg-white px-5 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 m-0">New Customer</h2>
              <button
                onClick={() => setIsFormDrawerOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 border-0 cursor-pointer transition-colors text-base"
              >
                &times;
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <UserForm
              user={null}
              roles={formRoles}
              onSuccess={handleFormSuccess}
              onCancel={() => setIsFormDrawerOpen(false)}
            />
          </div>
        </Drawer>
    </div>
  );
};

export default Customers;