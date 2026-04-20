// src/features/rentals/pages/Rentals.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Table,
  Button,
  Tag,
  Space,
  Tabs,
  Card,
  Tooltip,
  Popconfirm,
  Spin,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  CalendarOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { formatDate } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import Rental from '@/shared/models/Rental';
import { useData } from '@/shared/hooks/useData';
import { serviceApi } from '@/shared/services/serviceApi';
import apiClientDefault from '@/shared/services/apiClient';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
dayjs.extend(isBetween);
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import CalendarViewSwitcher from '@/shared/components/CalendarViewSwitcher';
import DataService from '@/shared/services/dataService';
import NewRentalDrawer from '@/features/rentals/components/NewRentalDrawer';

const formatRentalDuration = (duration) => {
  const hours = Number(duration);
  if (!Number.isFinite(hours) || hours <= 0) return '';
  if (hours < 1) {
    const minutes = Math.max(15, Math.round(hours * 60));
    return `${minutes}m`;
  }
  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }
  return `${parseFloat(hours.toFixed(2))}h`;
};

function Rentals() {
  const { apiClient, usersWithStudentRole = [], instructors = [] } = useData();
  const { businessCurrency, formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const messageApi = message;
  const urlParams = new URLSearchParams(location.search);
  const urlTab = urlParams.get('tab');
  const [activeTab, setActiveTab] = useState(urlTab || 'recent');
  const [loading, setLoading] = useState(false);
  const [rentals, setRentals] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRental, setEditingRental] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [equipment, setEquipment] = useState([]);

  // All rental packages for the overview card
  const [_rentalPackages, setRentalPackages] = useState([]);

  // Rental booking requests state
  const [rentalRequests, setRentalRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Mobile responsive
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const actorDirectory = useMemo(() => {
    const directory = {};
    const register = (candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      const id = candidate.id || candidate.user_id || candidate.userId;
      if (!id) return;

      const label =
        candidate.name ||
        candidate.full_name ||
        candidate.fullName ||
        [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() ||
        candidate.email ||
        candidate.username ||
        null;

      if (label) {
        directory[String(id)] = label;
      }
    };

    customers.forEach(register);
    usersWithStudentRole.forEach(register);
    instructors.forEach(register);

    return directory;
  }, [customers, usersWithStudentRole, instructors]);

  const resolveActorLabel = useCallback(
    (actorId, preferredLabel) => {
      if (preferredLabel && typeof preferredLabel === 'string' && preferredLabel.trim()) {
        return preferredLabel.trim();
      }

      if (!actorId) {
        return 'System automation';
      }

      const key = String(actorId);
      if (actorDirectory[key]) {
        return actorDirectory[key];
      }

      const normalized = key.toLowerCase();
      if (normalized === '00000000-0000-0000-0000-000000000000' || normalized === 'system') {
        return 'System automation';
      }

      return key.length > 16 ? `${key.slice(0, 8)}â€¦${key.slice(-4)}` : key;
    },
    [actorDirectory]
  );

  const formatAuditTimestamp = useCallback((value) => {
    if (!value) return null;
    const parsed = dayjs(value);
    if (!parsed.isValid()) return null;
    return parsed.format('MMM DD, YYYY HH:mm');
  }, []);

  const resolveCustomerInfo = useCallback((rental, customersData) => {
    let customerInfo = { customer_name: 'Loading...', customer_email: null };

    if (rental.user_id) {
      const customer = customersData.find((c) => c.id === rental.user_id);
      if (customer) {
        customerInfo = {
          customer_name:
            `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
            customer.name ||
            customer.email ||
            'Customer',
          customer_email: customer.email,
        };
      }
    }

    return customerInfo;
  }, []);

  const buildEquipmentDetails = useCallback((rental, equipmentData) => {
    let equipmentDetails = rental.equipment_details || null;

    if (!equipmentDetails || Object.keys(equipmentDetails).length === 0) {
      const equipmentIds = rental.equipment_ids;
      if (Array.isArray(equipmentIds) && equipmentIds.length > 0) {
        equipmentDetails = {};
        equipmentIds.forEach((equipId) => {
          const equipItem = equipmentData.find((e) => e.id === equipId);
          if (equipItem) {
            equipmentDetails[equipId] = {
              name: equipItem.name,
              category: equipItem.category,
              price: equipItem.price,
            };
          }
        });
      }
    }

    return equipmentDetails;
  }, []);


  // Load customers for dropdowns
  const loadCustomers = useCallback(async () => {
    try {
      if (!apiClient) return;
      const response = await apiClient.get('/users');
      const users = Array.isArray(response.data) ? response.data : [];
      const customersOnly = users.filter(
        (user) =>
          !user.user_role ||
          user.user_role === 'student' ||
          user.user_role === 'customer'
      );
      setCustomers(customersOnly);
    } catch (error) {
      void error;
      setCustomers([]);
    }
  }, [apiClient]);

  // Load equipment (rental services) for dropdowns
  const loadEquipment = useCallback(async () => {
    try {
      const [servicesData, categoriesData] = await Promise.all([
        serviceApi.getServices(),
        serviceApi.getFullServiceCategories(),
      ]);
      const rentalCats = categoriesData.filter(
        (cat) =>
          cat.status === 'active' &&
          (cat.type === 'rental' ||
            cat.name.toLowerCase().includes('rental') ||
            cat.name.toLowerCase().includes('equipment'))
      );
      const rentalCategoryNames = rentalCats.map((cat) =>
        cat.name.toLowerCase()
      );

      const isRentalService = (service) => {
        const cat = service.category?.toLowerCase() || '';
        const name = service.name?.toLowerCase() || '';
        // Category-based match (primary): checks against rental categories from DB
        const categoryMatch =
          rentalCategoryNames.includes(cat) ||
          cat === 'rental' ||
          cat === 'rentals' ||
          cat.includes('rental') ||
          cat.includes('equipment');
        // Name-based fallback: only if the service name explicitly says rental/equipment
        const nameMatch =
          name.includes('rental') ||
          name.includes('equipment');
        return Boolean(categoryMatch || nameMatch);
      };
      const rentalEquipment = servicesData.filter(isRentalService);
      setEquipment(rentalEquipment.length > 0 ? rentalEquipment : servicesData);
    } catch (error) {
      void error;
      setEquipment([]);
    }
  }, []);

  // Load all rental packages for the overview card
  const loadRentalPackages = useCallback(async () => {
    try {
      const client = apiClient || apiClientDefault;
      const res = await client.get('/services/packages/available?packageType=rental');
      setRentalPackages(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRentalPackages([]);
    }
  }, [apiClient]);

  useEffect(() => {
    if (apiClient) {
      loadCustomers();
      loadEquipment();
      loadRentalPackages();
    }
  }, [apiClient, loadCustomers, loadEquipment, loadRentalPackages]);

  // Helper to enrich rentals with customer and equipment details
  const enrichRentalsWithDetails = useCallback(
    async (list) => {
      try {
        // Load customers and equipment if not already loaded
        let customersData = customers;
        let equipmentData = equipment;

        if (customersData.length === 0) {
          try {
            const response = await apiClient.get('/users');
            customersData = Array.isArray(response.data) ? response.data : [];
          } catch (error) {
            void error;
            customersData = [];
          }
        }

        if (equipmentData.length === 0) {
          try {
            const [servicesData, categoriesData] = await Promise.all([
              serviceApi.getServices(),
              serviceApi.getFullServiceCategories(),
            ]);

            const rentalCats = categoriesData.filter(
              (cat) =>
                cat.status === 'active' &&
                (cat.type === 'rental' ||
                  cat.type === 'rentals' ||
                  cat.name.toLowerCase().includes('rental') ||
                  cat.name.toLowerCase().includes('equipment'))
            );

            const rentalCategoryNames = rentalCats.map((cat) =>
              cat.name.toLowerCase()
            );

            const isRentalService = (service) => {
              const cat = service.category?.toLowerCase();
              const name = service.name?.toLowerCase() || '';
              const categoryMatch =
                rentalCategoryNames.includes(cat) ||
                cat === 'rental' ||
                cat === 'rentals' ||
                (cat && (cat.includes('rental') || cat.includes('equipment')));
              const nameMatch =
                name.includes('rental') ||
                name.includes('equipment') ||
                name.includes('kite') ||
                name.includes('board');
              return Boolean(categoryMatch || nameMatch);
            };
            equipmentData = servicesData.filter(isRentalService);

            if (equipmentData.length === 0) {
              equipmentData = servicesData;
            }
          } catch (error) {
            void error;
            equipmentData = [];
          }
        }

        // Enrich rows
        const enriched = list.map((rental) => {
          const customerInfo = resolveCustomerInfo(rental, customersData);
          const equipment_details = buildEquipmentDetails(rental, equipmentData);
          const createdBy = rental.createdBy ?? rental.created_by ?? null;
          const createdByName = rental.createdByName ?? rental.created_by_name ?? null;
          const createdAt = rental.createdAt ?? rental.created_at ?? null;

          return {
            ...rental,
            ...customerInfo,
            equipment_details,
            createdBy,
            createdByName,
            createdAt,
            createdByLabel: resolveActorLabel(createdBy, createdByName),
            createdAtFormatted: formatAuditTimestamp(createdAt),
          };
        });

        return enriched;
      } catch (error) {
        void error;
        return list;
      }
    },
    [
      apiClient,
      buildEquipmentDetails,
      customers,
      equipment,
      formatAuditTimestamp,
      resolveActorLabel,
      resolveCustomerInfo,
    ]
  );

  // Load rental data based on active tab
  const loadRentals = useCallback(async () => {
    if (!apiClient) return;
    if (activeTab === 'requests') return; // Requests tab has its own loader
    setLoading(true);
    try {
      let data;
      switch (activeTab) {
        case 'recent':
          data = await Rental.findRecent(apiClient, 20);
          break;
        case 'total':
          data = await Rental.findAll(apiClient);
          break;
        default:
          data = await Rental.findRecent(apiClient, 20);
      }
      const enrichedData = await enrichRentalsWithDetails(data);
      setRentals(enrichedData);
    } catch (error) {
      void error;
      messageApi.error('Failed to load rental data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, apiClient, enrichRentalsWithDetails, messageApi]);

  // Load rental booking requests from bookings table (made via StudentBookingWizard)
  // AND pending rentals from rentals table (made via RentalBookingModal)
  const loadRentalRequests = useCallback(async () => {
    if (!apiClient) return;
    setRequestsLoading(true);
    try {
      // Fetch both sources in parallel
      const [bookings, pendingRentalsRes] = await Promise.all([
        DataService.getBookings({ service_type: 'rental', status: 'pending' }),
        apiClient.get('/rentals/pending'),
      ]);

      // Tag booking-based requests
      const bookingRequests = (Array.isArray(bookings) ? bookings : []).map(b => ({ ...b, _source: 'booking' }));

      // Normalize rental records to match the booking columns shape
      const pendingRentals = (Array.isArray(pendingRentalsRes?.data) ? pendingRentalsRes.data : []).map(r => {
        const eqDetails = typeof r.equipment_details === 'string' ? JSON.parse(r.equipment_details) : (r.equipment_details || {});
        const eqList = Object.values(eqDetails);
        const equipmentNames = eqList.map(e => e.name).filter(Boolean).join(', ') || 'Rental';
        const totalDuration = eqList.reduce((sum, e) => sum + (Number(e.duration) || 0), 0);
        return {
          ...r,
          _source: 'rental',
          student_name: r.customer_name,
          service_name: equipmentNames,
          service_duration: totalDuration || undefined,
          date: r.rental_date || r.start_date,
          amount: r.total_price,
          status: r.status, // 'pending'
        };
      });

      setRentalRequests([...bookingRequests, ...pendingRentals]);
    } catch (error) {
      void error;
      messageApi.error('Failed to load rental requests');
    } finally {
      setRequestsLoading(false);
    }
  }, [apiClient, messageApi]);

  useEffect(() => {
    if (apiClient) {
      if (activeTab === 'requests') {
        loadRentalRequests();
      } else {
        loadRentals();
      }
    }
  }, [apiClient, activeTab, loadRentals, loadRentalRequests]);

  // Sync URL tab param when tab changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const currentUrlTab = params.get('tab');
    if (activeTab === 'requests' && currentUrlTab !== 'requests') {
      params.set('tab', 'requests');
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
    } else if (activeTab !== 'requests' && currentUrlTab) {
      params.delete('tab');
      const search = params.toString();
      navigate(`${location.pathname}${search ? `?${search}` : ''}`, { replace: true });
    }
  }, [activeTab, location.pathname, location.search, navigate]);

  // Handle booking request status changes (approve / decline)
  const handleBookingStatusChange = useCallback(async (bookingId, newStatus) => {
    try {
      setRequestsLoading(true);
      await apiClient.patch(`/bookings/${bookingId}/status`, { status: newStatus });
      const label = newStatus === 'confirmed' ? 'approved' : newStatus;
      messageApi.success(`Rental request ${label} successfully`);
      await loadRentalRequests();
    } catch (error) {
      const msg = error?.response?.data?.error || error?.response?.data?.message || 'Failed to update booking status';
      messageApi.error(msg);
    } finally {
      setRequestsLoading(false);
    }
  }, [apiClient, messageApi, loadRentalRequests]);

  // Handle rental request approve/decline (for rentals created directly via POST /rentals)
  const handleRentalRequestChange = useCallback(async (rentalId, action) => {
    try {
      setRequestsLoading(true);
      const endpoint = action === 'approve' ? 'activate' : 'cancel';
      await apiClient.patch(`/rentals/${rentalId}/${endpoint}`);
      messageApi.success(`Rental ${action === 'approve' ? 'approved' : 'declined'} successfully`);
      await loadRentalRequests();
    } catch (error) {
      const msg = error?.response?.data?.error || error?.response?.data?.message || `Failed to ${action} rental`;
      messageApi.error(msg);
    } finally {
      setRequestsLoading(false);
    }
  }, [apiClient, messageApi, loadRentalRequests]);

  const handleActivateRequest = (id) => handleRentalRequestChange(id, 'approve');
  const handleCancelRequest = (id) => handleRentalRequestChange(id, 'decline');

  // Handle rental actions
  const handleStatusChange = async (rentalId, newStatus) => {
    try {
      setLoading(true);
      await Rental.update(rentalId, { status: newStatus }, apiClient);
      messageApi.success(`Rental ${newStatus} successfully`);
      await loadRentals();
    } catch (error) {
      void error;
      messageApi.error('Failed to update rental status');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (rental) => {
    setEditingRental(rental);
    setIsModalVisible(true);
  };

  const handleDelete = async (rentalId) => {
    try {
      await Rental.delete(rentalId, apiClient);
      messageApi.success('Rental deleted successfully');
      loadRentals();
    } catch (error) {
      void error;
      messageApi.error('Failed to delete rental');
    }
  };

  const handleOpenCreate = () => {
    setEditingRental(null);
    setIsModalVisible(true);
  };

  const handleDrawerClose = () => {
    setIsModalVisible(false);
    setEditingRental(null);
  };

  // Table columns configuration
  const columns = [
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer',
      ellipsis: true,
      render: (text, record) => {
        const customerName = text || record.customer_name || record.customer_email || 'N/A';
        return <Tooltip title={record.customer_email || customerName}><span className="text-xs font-medium">{customerName}</span></Tooltip>;
      },
    },
    {
      title: 'Equipment',
      dataIndex: 'equipment_details',
      key: 'equipment',
      ellipsis: true,
      render: (equipmentDetails, record) => {
        if (!equipmentDetails) return <span className="text-gray-400 text-xs">{record.equipment_ids?.length || 0} item(s)</span>;
        const items = Object.values(equipmentDetails);
        const label = items[0]?.name || 'Equipment';
        return <Tooltip title={items.map(d => d.name).join(', ')}><span className="text-xs">{label}{items.length > 1 ? ` +${items.length - 1}` : ''}</span></Tooltip>;
      },
    },
    {
      title: 'Date',
      key: 'rental_date',
      width: 90,
      render: (_, record) => <span className="text-xs whitespace-nowrap">{record.rental_date ? formatDate(record.rental_date) : formatDate(record.start_date)}</span>,
    },
    {
      title: 'Price',
      key: 'price_status',
      width: 90,
      render: (_, record) => {
        const total = parseFloat(record.total_price) || 0;
        if (total > 0) {
          return <span className="text-xs font-medium whitespace-nowrap">{formatCurrency(total, record.currency || businessCurrency)}</span>;
        }
        // Package rental: compute service value from equipment_details dailyRate
        if (record.customer_package_id) {
          const eqDetails = typeof record.equipment_details === 'string'
            ? JSON.parse(record.equipment_details)
            : (record.equipment_details || {});
          const items = Object.values(eqDetails);
          const dailyRateSum = items.reduce((s, eq) => s + (parseFloat(eq.dailyRate ?? eq.price ?? 0)), 0);
          if (dailyRateSum > 0) {
            const days = (record.start_date && record.end_date)
              ? Math.max(1, Math.round((new Date(record.end_date) - new Date(record.start_date)) / 86400000))
              : 1;
            const serviceValue = dailyRateSum * days;
            return (
              <span className="whitespace-nowrap flex items-center gap-1">
                <span className="text-xs font-medium">{formatCurrency(serviceValue, record.currency || businessCurrency)}</span>
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1 rounded">pkg</span>
              </span>
            );
          }
          return <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Package</span>;
        }
        return <span className="text-xs text-gray-400">â€”</span>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => {
        const colors = { active: 'green', completed: 'gray', pending: 'orange', cancelled: 'red', overdue: 'volcano', reserved: 'blue', returned: 'cyan' };
        return <Tag color={colors[status] || 'default'} className="!mr-0 !text-xs !leading-tight">{status?.charAt(0).toUpperCase() + status?.slice(1)}</Tag>;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 70,
      render: (_, record) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'active' && <Button type="text" size="small" icon={<CheckOutlined />} onClick={() => handleStatusChange(record.id, 'completed')} />}
          <Popconfirm title="Delete?" onConfirm={() => handleDelete(record.id)} okText="Yes" cancelText="No">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Columns for the Rental Requests tab (bookings with service_type=rental)
  const requestColumns = useMemo(() => [
    {
      title: 'Student',
      key: 'student',
      render: (_, record) => {
        const name = record.student_name || record.studentName || 'Student';
        const initials = name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase())
          .join('') || 'S';
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full
                         bg-gradient-to-br from-sky-100 to-sky-200 text-sky-700
                         text-[11px] font-semibold tracking-wide ring-1 ring-sky-200/60"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="font-medium text-slate-800 text-sm truncate leading-tight">{name}</div>
              {record.group_size > 1 && (
                <span className="text-[10px] uppercase tracking-wider text-sky-700 font-semibold">
                  Group of {record.group_size}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Service',
      key: 'service',
      render: (_, record) => {
        const serviceName = record.service_name || record.serviceName || 'Rental Service';
        return (
          <span className="text-sm font-medium text-slate-700 line-clamp-2 leading-snug">
            {serviceName}
          </span>
        );
      },
    },
    {
      title: 'Date',
      key: 'datetime',
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
      defaultSortOrder: 'descend',
      render: (_, record) => {
        const dateStr = record.date || record.formatted_date;
        const startHour = record.start_hour || record.startHour;
        if (!dateStr) return <span className="text-slate-300">—</span>;
        const d = dayjs(dateStr);
        return (
          <div className="leading-tight">
            <div className="text-sm font-medium text-slate-800 tabular-nums">
              {d.format('MMM DD')}
              <span className="text-slate-400 font-normal ml-1">{d.format('YYYY')}</span>
            </div>
            {startHour != null && (
              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                {String(Math.floor(startHour)).padStart(2, '0')}:{String(Math.round((startHour % 1) * 60)).padStart(2, '0')}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Period',
      key: 'duration',
      width: 90,
      render: (_, record) => {
        const dur = Number(record.service_duration) || Number(record.duration);
        if (!dur) return <span className="text-slate-300">—</span>;
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md
                       bg-slate-100 text-slate-700 text-xs font-medium tabular-nums"
          >
            {formatRentalDuration(dur)}
          </span>
        );
      },
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 110,
      render: (_, record) => {
        const amount = record.final_amount ?? record.finalAmount ?? record.amount ?? 0;
        return (
          <span className="text-sm font-semibold text-slate-800 tabular-nums">
            {formatCurrency(Number(amount), businessCurrency)}
          </span>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Confirmed', value: 'confirmed' },
        { text: 'Cancelled', value: 'cancelled' },
        { text: 'Completed', value: 'completed' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => {
        const statusConfig = {
          pending: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800 ring-amber-200', label: 'Pending' },
          confirmed: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200', label: 'Approved' },
          cancelled: { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-800 ring-rose-200', label: 'Declined' },
          completed: { dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-800 ring-sky-200', label: 'Completed' },
          no_show: { dot: 'bg-slate-400', pill: 'bg-slate-50 text-slate-600 ring-slate-200', label: 'No Show' },
        };
        const c = statusConfig[status] || { dot: 'bg-slate-400', pill: 'bg-slate-50 text-slate-600 ring-slate-200', label: status };
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ring-1 text-[11px] font-semibold ${c.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        );
      },
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 180,
      render: (notes) => {
        if (!notes) return null;
        const display = notes.length > 48 ? `${notes.slice(0, 48)}…` : notes;
        return (
          <Tooltip title={notes}>
            <span className="text-xs text-slate-500 italic leading-snug line-clamp-2">{display}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 96,
      align: 'right',
      render: (_, record) => {
        const isPending = record.status === 'pending';
        const isConfirmed = record.status === 'confirmed';
        const isRental = record._source === 'rental';

        const stop = (e) => e.stopPropagation();
        const onApprove = () => isRental
          ? handleRentalRequestChange(record.id, 'approve')
          : handleBookingStatusChange(record.id, 'confirmed');
        const onDecline = () => isRental
          ? handleRentalRequestChange(record.id, 'decline')
          : handleBookingStatusChange(record.id, 'cancelled');

        const iconBtn = 'inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all';
        const variants = {
          primary: 'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 hover:shadow',
          danger: 'bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 hover:ring-rose-300',
          ghost: 'bg-white text-sky-700 ring-1 ring-sky-200 hover:bg-sky-50 hover:ring-sky-300',
        };

        if (isPending) {
          return (
            <div className="flex items-center justify-end gap-1" onClick={stop}>
              <Tooltip title="Approve">
                <button type="button" onClick={onApprove} aria-label="Approve" className={`${iconBtn} ${variants.primary}`}>
                  <CheckOutlined className="text-xs" />
                </button>
              </Tooltip>
              <Popconfirm
                title="Decline this rental request?"
                description="The student will be notified and any charged amount will be refunded."
                onConfirm={onDecline}
                okText="Decline"
                okButtonProps={{ danger: true }}
                cancelText="Keep"
              >
                <Tooltip title="Decline">
                  <button type="button" aria-label="Decline" className={`${iconBtn} ${variants.danger}`}>
                    <CloseOutlined className="text-xs" />
                  </button>
                </Tooltip>
              </Popconfirm>
            </div>
          );
        }
        if (isConfirmed) {
          return (
            <div className="flex items-center justify-end" onClick={stop}>
              <Tooltip title="Mark Completed">
                <button
                  type="button"
                  onClick={() => handleBookingStatusChange(record.id, 'completed')}
                  aria-label="Mark Completed"
                  className={`${iconBtn} ${variants.ghost}`}
                >
                  <CheckOutlined className="text-xs" />
                </button>
              </Tooltip>
            </div>
          );
        }
        return <span className="text-[11px] text-slate-300 italic">—</span>;
      },
    },
  ], [businessCurrency, formatCurrency, handleBookingStatusChange, handleRentalRequestChange]);

  const renderMobileCards = () => {
    const data = activeTab === 'requests' ? rentalRequests : rentals;
    const isLoading = activeTab === 'requests' ? requestsLoading : loading;
    if (isLoading) return <div className="flex justify-center py-8"><Spin /></div>;
    if (!data.length) return <div className="text-center text-slate-400 py-8">No rentals found</div>;
    return (
      <div className="space-y-3">
        {/* eslint-disable-next-line complexity */}
        {data.map(record => {
          const customerName = record.customer_name || record.student_name || record.customer_email || 'Unknown';
          const statusConfig = {
            active: 'green', completed: 'gray', pending: 'orange',
            cancelled: 'red', overdue: 'volcano', reserved: 'blue', returned: 'cyan',
            confirmed: 'green', upcoming: 'blue',
          };
          const status = record.status || 'pending';
          const equipItems = record.equipment_details
            ? Object.values(record.equipment_details).map(d => d.name || 'Equipment').join(', ')
            : `${record.equipment_ids?.length || 0} item(s)`;
          const date = record.rental_date || record.start_date || record.date;
          return (
            <div key={record.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 text-sm truncate">{customerName}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{equipItems}</p>
                </div>
                <Tag color={statusConfig[status] || 'default'} className="ml-2 flex-shrink-0">
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Tag>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1">
                  <CalendarOutlined />
                  {date ? formatDate(date) : 'â€”'}
                </span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(record.total_price || record.amount || record.final_amount, record.currency || businessCurrency)}
                </span>
              </div>
              {record.notes && (
                <p className="text-xs text-slate-400 mt-2 truncate">{record.notes}</p>
              )}
              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                <Button size="small" icon={<EditOutlined />} onClick={() => activeTab === 'requests' ? null : handleEdit(record)}>Edit</Button>
                {record.status === 'active' && (
                  <Button size="small" icon={<CheckOutlined />} onClick={() => handleStatusChange(record.id, 'completed')}>Complete</Button>
                )}
                {activeTab === 'requests' && record.status === 'pending' && (
                  <>
                    <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleActivateRequest(record.id)}>Approve</Button>
                    <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleCancelRequest(record.id)}>Reject</Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* View Switcher Header */}
      <div className="flex items-center justify-between">
        <CalendarViewSwitcher
          currentView="list"
          views={['list', 'calendar']}
          listPath="/calendars/rentals"
          calendarPath="/rentals/calendar"
          size="large"
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
          New Rental
        </Button>
      </div>

      <Card>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'requests',
              label: (
                <span className="flex items-center">
                  <ShoppingOutlined className="mr-2" />
                  Rental Requests
                  {rentalRequests.length > 0 && (
                    <Tag color="orange" className="ml-2 !mr-0" style={{ borderRadius: 10, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
                      {rentalRequests.length}
                    </Tag>
                  )}
                </span>
              ),
            },
            {
              key: 'recent',
              label: (
                <span className="flex items-center">
                  <ClockCircleOutlined className="mr-2" />
                  Recent Rentals
                </span>
              ),
            },
            {
              key: 'total',
              label: (
                <span className="flex items-center">
                  <ToolOutlined className="mr-2" />
                  Total Rentals
                </span>
              ),
            },
          ]}
        />

        {isMobile ? (
          /* Mobile card layout */
          renderMobileCards()
        ) : (
          /* Desktop table layout */
          activeTab === 'requests' ? (
            <UnifiedTable density="compact">
              <Table
                columns={requestColumns}
                dataSource={rentalRequests}
                loading={requestsLoading}
                rowKey="id"
                size="small"
                pagination={{
                  pageSize: 25,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} rental requests`,
                }}
                scroll={{ x: 1000 }}
                locale={{ emptyText: 'No rental booking requests found' }}
                onRow={(record) => ({
                  onClick: () => {
                    if (record._source === 'rental') handleEdit(record);
                  },
                  className: record._source === 'rental' ? 'cursor-pointer hover:bg-sky-50/40' : '',
                })}
              />
            </UnifiedTable>
          ) : (
            <UnifiedTable density="compact">
              <Table
                columns={columns}
                dataSource={rentals}
                loading={loading}
                rowKey="id"
                size="small"
                pagination={{
                  pageSize: activeTab === 'recent' ? 20 : 25,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} ${activeTab === 'recent' ? 'recent' : 'total'} rentals`,
                }}
                scroll={{ x: 800 }}
              />
            </UnifiedTable>
          )
        )}
      </Card>

      {/* Rental Form Drawer */}
      <NewRentalDrawer
        isOpen={isModalVisible}
        onClose={handleDrawerClose}
        onSuccess={() => {
          loadRentals();
          loadRentalRequests();
        }}
        editingRental={editingRental}
      />
    </div>
  );
}

export default Rentals;
