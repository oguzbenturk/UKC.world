// src/pages/Customers.jsx
/* eslint-disable no-unused-vars */
import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { 
  Button, Space, Modal, Input, Card, 
  Avatar, Row, Col, Tag, Segmented, Tooltip, Empty, Spin, Dropdown
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
  CheckCircleOutlined, ClockCircleOutlined, DollarCircleOutlined,
  FilterOutlined
 } from '@ant-design/icons';

const CustomerDeleteModal = lazy(() => import('../components/CustomerDeleteModal'));

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
  const [limit, setLimit] = useState(50);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Always use compact density
  const density = 'small';
  // Column-level filters
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all'); // 'all' | 'paid' | 'package' | 'pending'
  const [balanceSignFilter, setBalanceSignFilter] = useState('all'); // 'all' | 'negative' | 'zero' | 'positive'
  
  // Delete modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  
  const [stats, setStats] = useState({
    total: 0,
    shopCustomers: 0,
    schoolCustomers: 0
  });
  
  // Component render state monitoring (removed for production)
  
  // Define fetchCustomers BEFORE effects that reference it to avoid TDZ errors
  const fetchCustomers = useCallback(async ({ reset = false, append = false } = {}) => {
    try {
      const pageStartTime = performance.now();
      const showSpinner = !append;
      if (showSpinner) setLoading(true);
      else setIsLoadingMore(true);

      const params = {
        q: q || undefined,
        // balance filter removed; filtering happens via table columns
        limit,
        cursor: append ? nextCursor : undefined,
      };

      const res = await DataService.getCustomersList(params);

      // Apply list and derive stats in one pass (without bookings-based metrics)
      setCustomers(prev => {
        const nextList = reset ? (res.items || []) : (append ? [...prev, ...(res.items || [])] : (res.items || []));
        setStats({ total: nextList.length, shopCustomers: 0, schoolCustomers: nextList.length });
        return nextList;
      });

      setNextCursor(res.nextCursor || null);

    // load time display removed
    } catch {
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [q, limit, nextCursor]);
  
  useEffect(() => {
    // initial load
    fetchCustomers({ reset: true });
  }, [fetchCustomers]);

  // Detect return from user creation and refresh data
  useEffect(() => {
    if (location.state?.userCreated) {
      fetchCustomers({ reset: true });
      // Clear the state to prevent repeated refreshes
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, fetchCustomers]);

  // Auto-refresh when page becomes visible (user switches back to tab or navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchCustomers({ reset: true });
      }
    };

    const handleFocus = () => {
      fetchCustomers({ reset: true });
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchCustomers]);

  // Force refresh when component mounts (navigation back to page)
  useEffect(() => {
    // Always refresh when component mounts/remounts
    const timeoutId = setTimeout(() => {
      fetchCustomers({ reset: true });
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [location.pathname, fetchCustomers]);

  // Debounce search input -> server query (q)
  useEffect(() => {
    const h = setTimeout(() => {
      setQ(searchText.trim());
    }, 300);
    return () => clearTimeout(h);
  }, [searchText]);

  // Re-fetch when q or page size changes
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
    navigate('/customers/new');
  }, [navigate]);
  
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
              <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                <Avatar
                  size={32}
                  src={record.profile_image_url || record.avatar}
                  icon={<UserOutlined />}
                />
              </div>
              <div className="min-w-0 flex-1">
                <a
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/customers/${record.id}/profile`);
                  }}
                  className="text-gray-900 font-medium truncate block hover:text-blue-600 text-sm"
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
          return (
            <Tag color={role === 'outsider' ? 'orange' : 'blue'}>
              {role === 'outsider' ? 'Outsider' : 'Student'}
            </Tag>
          );
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
            <span className="inline-flex items-center gap-1">Balance <DollarCircleOutlined /></span>
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
          
          // IMPORTANT: All balances in DB are stored in EUR (base currency)
          const storageCurrency = businessCurrency || 'EUR';
          const customerPreferredCurrency = row.original?.preferred_currency || storageCurrency;
          
          // Staff sees EUR (no conversion needed), customers see their preferred currency
          let displayAmount = value;
          let displayCurrencyCode = storageCurrency;
          
          if (!isStaff && customerPreferredCurrency !== storageCurrency && convertCurrency) {
            // Convert FROM EUR TO customer's preferred currency
            displayAmount = convertCurrency(value, storageCurrency, customerPreferredCurrency);
            displayCurrencyCode = customerPreferredCurrency;
          }
          
          return (
            <div className="text-right w-full">
              <span className={`font-medium ${color}`}>
                {formatCurrency(Number(displayAmount) || 0, displayCurrencyCode)}
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
              onClick={() => navigate(`/customers/${customer.id}/profile`)}
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

  // Density -> padding/text classes
  const densityRow = density === 'small' ? 'text-sm py-1' : density === 'large' ? 'text-base py-3' : 'text-sm py-2';
  const densityHead = density === 'small' ? 'py-2' : density === 'large' ? 'py-4' : 'py-3';

  return (
    <div className="p-6">
  {/* Ultra-compact KPI tiles */}
  <div className="mb-2 grid grid-cols-3 gap-2">
        {/* Total Customers */}
        <div className="rounded-lg p-2 bg-white border border-sky-100/70">
          <div className="flex items-center gap-2 leading-tight">
            <div className="h-6 w-6 rounded-full bg-sky-600 text-white flex items-center justify-center">
              <UserOutlined />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-sky-600/90 font-medium">Total Customers</div>
              <div className="text-base font-semibold text-gray-900">{stats.total}</div>
            </div>
          </div>
        </div>

        {/* Shop Customers */}
        <div className="rounded-lg p-2 bg-white border border-emerald-100/70">
          <div className="flex items-center gap-2 leading-tight">
            <div className="h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
              <CheckCircleOutlined />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-600/90 font-medium">Shop Customers</div>
              <div className="text-base font-semibold text-gray-900">{stats.shopCustomers}</div>
            </div>
          </div>
        </div>

        {/* School Customers */}
        <div className="rounded-lg p-2 bg-white border border-amber-100/70">
          <div className="flex items-center gap-2 leading-tight">
            <div className="h-6 w-6 rounded-full bg-amber-500 text-white flex items-center justify-center">
              <ClockCircleOutlined />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-amber-600/90 font-medium">School Customers</div>
              <div className="text-base font-semibold text-gray-900">{stats.schoolCustomers}</div>
            </div>
          </div>
        </div>
      </div>
    
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
        <UnifiedTable stickyFirstCol density="comfortable">
            <div className="max-h-[600px] overflow-auto">
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
                              className={`sticky top-0 z-10 bg-white border-b border-gray-300 px-4 ${densityHead} ${headerAlignmentClass} font-semibold text-gray-800 select-none ${header.column.id === 'email' || header.column.id === 'payment_status' ? 'hidden md:table-cell' : ''}`}
                              onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                              style={{
                                position: 'sticky',
                                left: header.index === 0 ? 0 : undefined,
                                zIndex: header.index === 0 ? 30 : 20,
                                boxShadow: header.index === 0 ? '2px 0 0 rgba(0,0,0,0.05)' : undefined,
                                minWidth: header.index === 0 ? '140px' : undefined,
                                maxWidth: header.index === 0 ? '200px' : undefined,
                                width: header.index === 0 ? '140px' : undefined
                              }}
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
                    {table.getRowModel().rows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100 transition-colors cursor-pointer`}
                        onClick={(e) => {
                          // Prevent row navigation when clicking interactive elements
                          const interactiveSelectors = 'button, a, input, [role="button"], .ant-dropdown-trigger, .ant-select, .ant-tooltip-open';
                          if (e.target.closest(interactiveSelectors)) return;
                          navigate(`/customers/${row.original.id}/profile`);
                        }}
                      >
                        {row.getVisibleCells().map((cell, cellIdx) => {
                          // Determine alignment class based on column
                          let alignmentClass = '';
                          if (cell.column.id === 'balance') {
                            alignmentClass = 'text-right';
                          } else if (cell.column.id === 'payment_status' || cell.column.id === 'actions') {
                            alignmentClass = 'text-center';
                          } else {
                            alignmentClass = 'text-left';
                          }
                          const isFirstColumn = cellIdx === 0;
                          const isStripedRow = idx % 2 === 0;
                          const stickyBackground = isStripedRow ? '#f9fafb' : '#ffffff';
                          
                          return (
                            <td
                              key={cell.id}
                              className={`px-4 ${densityRow} align-middle border-t border-gray-200 ${alignmentClass} ${cell.column.id === 'email' || cell.column.id === 'payment_status' ? 'hidden md:table-cell' : ''}`}
                              style={{
                                position: isFirstColumn ? 'sticky' : undefined,
                                left: isFirstColumn ? 0 : undefined,
                                zIndex: isFirstColumn ? 25 : 1,
                                boxShadow: isFirstColumn ? '2px 0 0 rgba(0,0,0,0.05)' : undefined,
                                minWidth: isFirstColumn ? '140px' : undefined,
                                maxWidth: isFirstColumn ? '200px' : undefined,
                                width: isFirstColumn ? '140px' : undefined,
                                background: isFirstColumn ? stickyBackground : undefined
                              }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!loading && table.getRowModel().rows.length === 0 && (
                      <tr>
                        <td colSpan={columns.length} className="py-12">
                          <div className="flex flex-col items-center justify-center text-gray-500">
                            <Empty description="No customers found">
                              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddClick}>Add Customer</Button>
                            </Empty>
                          </div>
                        </td>
                      </tr>
                    )}
                    {loading && customers.length === 0 && (
                      <tr>
                        <td colSpan={columns.length} className="text-center py-8">
                          <Spin />
                        </td>
                      </tr>
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
    </div>
  );
};

export default Customers;