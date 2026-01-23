// src/features/rentals/pages/Rentals.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Table,
  Button,
  Modal,
  Form,
  Select,
  DatePicker,
  Input,
  Tag,
  Space,
  Tabs,
  Card,
  Row,
  Col,
  Typography,
  Tooltip,
  Popconfirm,
  Radio,
  Checkbox,
  Alert,
  Spin,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ToolOutlined,
  CalendarOutlined,
  DollarOutlined,
  FileTextOutlined,
  BarChartOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import { formatDate } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import Rental from '@/shared/models/Rental';
import { useData } from '@/shared/hooks/useData';
import { serviceApi } from '@/shared/services/serviceApi';
import dayjs from 'dayjs';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import { createCreatedByAuditColumn } from '@/shared/components/tables/unifiedTableAuditPresets.jsx';
import CalendarViewSwitcher from '@/shared/components/CalendarViewSwitcher';

const { Title } = Typography;
const { Option } = Select;

// Custom styles for the rental form
const rentalFormStyles = `
  .rental-form-modal .ant-modal-content {
    border-radius: 20px;
    overflow: hidden;
  }

  .rental-form-modal .ant-modal-header {
    padding: 8px 16px;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }

  .rental-form-modal .ant-modal-close {
    top: 12px;
    inset-inline-end: 12px;
  }

  .rental-form-modal .ant-modal-body {
    padding: 12px 14px 16px;
    background: #ffffff;
  }

  .rental-form .ant-form-item {
    margin-bottom: 16px;
  }

  .rental-form .ant-form-item-label > label {
    font-weight: 600;
    color: #1f2937;
  }

  .rental-form .ant-select-selector,
  .rental-form .ant-input,
  .rental-form .ant-picker,
  .rental-form .ant-radio-button-wrapper {
    border-radius: 10px;
  }

  .rental-form .ant-radio-button-wrapper {
    padding-inline: 16px;
    border: none;
    box-shadow: none !important;
    background: transparent;
  }

  .rental-form .ant-radio-button-wrapper::before {
    display: none;
  }

  .rental-form .ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled) {
    background: #312e81;
    border-color: #312e81;
    color: #ffffff;
    box-shadow: none;
  }

  .rental-form .ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled):hover {
    border-color: #312e81;
  }

  .rental-form .ant-radio-button-wrapper:first-child,
  .rental-form .ant-radio-button-wrapper:last-child {
    border-radius: 10px;
  }
`;

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

const formatStatValue = (value) => Number(value || 0).toLocaleString('en-US');

const toArray = (value) => (Array.isArray(value) ? value : []);

function Rentals() {
  const { apiClient, usersWithStudentRole = [], instructors = [] } = useData();
  const { businessCurrency, formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  // Use static message API directly - no need for useMessage hook
  const messageApi = message;
  const [activeTab, setActiveTab] = useState('recent');
  const [loading, setLoading] = useState(false);
  const [rentals, setRentals] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRental, setEditingRental] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [form] = Form.useForm();
  
  // Package-based rental state
  const [usePackage, setUsePackage] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [availableRentalPackages, setAvailableRentalPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  
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

      return key.length > 16 ? `${key.slice(0, 8)}…${key.slice(-4)}` : key;
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


  // Inject custom styles
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = rentalFormStyles;
    document.head.appendChild(styleElement);

    return () => {
      document.head.removeChild(styleElement);
    };
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

      const rentalServices = servicesData.filter(isRentalService);
      setEquipment(rentalServices.length > 0 ? rentalServices : servicesData);
    } catch (error) {
      void error;
      setEquipment([]);
    }
  }, []);

  useEffect(() => {
    if (apiClient) {
      loadCustomers();
      loadEquipment();
    }
  }, [apiClient, loadCustomers, loadEquipment]);

  // Family participant state
  const [participantMode, setParticipantMode] = useState('single');

  // Watch customer selection to fetch their rental packages
  const watchedCustomerId = Form.useWatch('customer_id', form);
  
  // Fetch available rental packages when customer is selected
  useEffect(() => {
    const fetchRentalPackages = async () => {
      if (!watchedCustomerId || !apiClient) {
        setAvailableRentalPackages([]);
        setUsePackage(false);
        setSelectedPackageId(null);
        return;
      }
      
      setPackagesLoading(true);
      try {
        const response = await apiClient.get(`/services/customer-packages/${watchedCustomerId}/rental`);
        const packages = Array.isArray(response.data) ? response.data : [];
        setAvailableRentalPackages(packages);
        // Auto-reset package selection when customer changes
        setUsePackage(false);
        setSelectedPackageId(null);
      } catch (error) {
        console.error('Failed to fetch rental packages:', error);
        setAvailableRentalPackages([]);
      } finally {
        setPackagesLoading(false);
      }
    };
    
    fetchRentalPackages();
  }, [watchedCustomerId, apiClient]);

  const watchedEquipmentIds = Form.useWatch('equipment_ids', form);
  const normalizedEquipmentIds = useMemo(() => {
    return Array.isArray(watchedEquipmentIds) ? watchedEquipmentIds : [];
  }, [watchedEquipmentIds]);

  const selectedEquipmentItems = useMemo(() => {
    if (!normalizedEquipmentIds.length) return [];
    return (equipment || []).filter((item) => normalizedEquipmentIds.includes(item.id));
  }, [equipment, normalizedEquipmentIds]);

  const equipmentSummary = useMemo(() => {
    if (!selectedEquipmentItems.length) {
      return {
        count: 0,
        durationLabel: null,
        priceLabel: null,
      };
    }

    const totalDuration = selectedEquipmentItems.reduce((total, item) => {
      return total + (Number(item.duration) || 0);
    }, 0);

    const totalPrice = selectedEquipmentItems.reduce((total, item) => {
      return total + (Number(item.price) || 0);
    }, 0);

    const durationLabel = formatRentalDuration(totalDuration) || null;
    const priceLabel = totalPrice
      ? formatCurrency(totalPrice, selectedEquipmentItems.find((item) => item.currency)?.currency || businessCurrency)
      : null;

    return {
      count: selectedEquipmentItems.length,
      durationLabel,
      priceLabel,
    };
  }, [selectedEquipmentItems, businessCurrency, formatCurrency]);

  useEffect(() => {
    if (participantMode === 'single') {
      form.setFieldsValue({ customer_ids: undefined });
    } else {
      form.setFieldsValue({ customer_id: undefined });
    }
  }, [participantMode, form]);

  const renderCustomerOptions = useCallback(() => {
    if (!Array.isArray(customers) || customers.length === 0) {
      return (
        <Option disabled value="" key="no-customers">
          No customers available
        </Option>
      );
    }

    return customers.map((customer) => {
      const displayName = customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
      const primaryLabel = displayName || customer.email || 'Customer';

      return (
        <Option key={customer.id} value={customer.id}>
          <div className="flex flex-col">
            <span className="font-medium text-slate-900">{primaryLabel}</span>
            {customer.email && customer.email !== primaryLabel && (
              <span className="text-xs text-slate-500">{customer.email}</span>
            )}
          </div>
        </Option>
      );
    });
  }, [customers]);

  const renderEquipmentOptions = useCallback(() => {
    if (!Array.isArray(equipment) || equipment.length === 0) {
      return (
        <Option disabled value="" key="no-equipment">
          No rental services available
        </Option>
      );
    }

    return equipment.map((item) => {
      const meta = [];
      if (item.price != null) {
        meta.push(formatCurrency(item.price, item.currency || businessCurrency || 'EUR'));
      }
      const durationLabel = formatRentalDuration(item.duration);
      if (durationLabel) {
        meta.push(durationLabel);
      }
      const subtitle = meta.join(' • ');

      return (
        <Option key={item.id} value={item.id}>
          <div className="flex flex-col">
            <span className="font-medium text-slate-900">{item.name}</span>
            {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
          </div>
        </Option>
      );
    });
  }, [equipment, formatCurrency, businessCurrency]);

  const createRentalsForCustomers = useCallback(
    async (customerIds, basePayload) => {
      await Promise.all(
        customerIds.map((customerId) =>
          Rental.create(
            {
              ...basePayload,
              user_id: customerId,
            },
            apiClient
          )
        )
      );
    },
    [apiClient]
  );

  const upsertRental = useCallback(
    async (customerId, basePayload, rental) => {
      const payload = { ...basePayload, user_id: customerId };

      if (rental) {
        await Rental.update(rental.id, payload, apiClient);
        return 'updated';
      }

      await Rental.create(payload, apiClient);
      return 'created';
    },
    [apiClient]
  );

  useEffect(() => {
    if (isModalVisible && !editingRental) {
      form.setFieldsValue({
        status: 'active',
        rental_date: dayjs(),
      });
    }
  }, [isModalVisible, editingRental, form]);

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

  useEffect(() => {
    if (apiClient) {
      loadRentals();
    }
  }, [apiClient, loadRentals]);

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
    const isMultiple = rental.participant_type === 'multiple';
    setEditingRental(rental);
    setParticipantMode(isMultiple ? 'multiple' : 'single');
    form.resetFields();
    form.setFieldsValue({
      customer_id: isMultiple ? undefined : rental.user_id,
      customer_ids: isMultiple ? [rental.user_id] : undefined,
      equipment_ids: rental.equipment_ids || [],
      rental_date: rental.rental_date ? dayjs(rental.rental_date) : dayjs(),
      status: rental.status || 'active',
      notes: rental.notes,
    });
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
    setParticipantMode('single');
    form.resetFields();
    setIsModalVisible(true);
  };

  const resetModalState = useCallback(() => {
    setIsModalVisible(false);
    setEditingRental(null);
    form.resetFields();
    setParticipantMode('single');
    setUsePackage(false);
    setSelectedPackageId(null);
    setAvailableRentalPackages([]);
  }, [form]);

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const rentalDate = values.rental_date || dayjs();

      const basePayload = {
        equipment_ids: values.equipment_ids,
        rental_date: rentalDate ? rentalDate.format('YYYY-MM-DD') : null,
        status: values.status || 'active',
        notes: values.notes,
        start_date: rentalDate ? rentalDate.startOf('day').toISOString() : new Date().toISOString(),
        end_date: rentalDate ? rentalDate.endOf('day').toISOString() : new Date().toISOString(),
        participant_type: participantMode,
        // Package-based rental fields
        use_package: usePackage && !!selectedPackageId,
        customer_package_id: usePackage ? selectedPackageId : null,
        rental_days: 1, // Default to 1 day per rental
      };

      const customerIds = toArray(values.customer_ids);
      const isMultipleCreation = !editingRental && participantMode === 'multiple';

      if (isMultipleCreation) {
        if (customerIds.length === 0) {
          messageApi.warning('Select at least one customer');
          return;
        }

        await createRentalsForCustomers(customerIds, basePayload);
        messageApi.success(`Created ${customerIds.length} rental${customerIds.length > 1 ? 's' : ''}`);
        resetModalState();
        await loadRentals();
        return;
      }

      const primaryCustomerId =
        participantMode === 'multiple' ? customerIds[0] ?? null : values.customer_id;

      if (!primaryCustomerId) {
        messageApi.warning('Please select a customer');
        return;
      }

      const action = await upsertRental(primaryCustomerId, basePayload, editingRental);
      messageApi.success(`Rental ${action} successfully`);

      resetModalState();
      await loadRentals();
    } catch (error) {
      void error;
      messageApi.error('Failed to save rental');
    }
  };

  const handleModalCancel = () => {
    resetModalState();
  };

  // Table columns configuration
  const columns = [
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer',
      render: (text, record) => {
        const customerName =
          text ||
          record.customer_name ||
          (record.customer_email && record.customer_email !== 'test@example.com'
            ? record.customer_email
            : null) ||
          'Loading...';

        return (
          <div>
            <div className="font-medium flex items-center">
              <UserOutlined className="mr-1" />
              {customerName}
            </div>
            {(() => {
              if (!record.participant_type) return null;
              const normalized = String(record.participant_type).toLowerCase();
              let tagConfig = null;

              if (normalized === 'multiple') {
                tagConfig = { color: 'geekblue', label: 'Multiple' };
              } else if (normalized === 'single' || normalized === 'self') {
                tagConfig = { color: 'blue', label: 'Single' };
              } else if (normalized === 'family' || normalized === 'family_member') {
                tagConfig = { color: 'magenta', label: 'Family' };
              }

              return tagConfig ? (
                <div className="mt-1">
                  <Tag color={tagConfig.color}>{tagConfig.label}</Tag>
                </div>
              ) : null;
            })()}
            {record.customer_email && record.customer_email !== 'test@example.com' && (
              <div className="text-sm text-gray-500">{record.customer_email}</div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Equipment',
      dataIndex: 'equipment_details',
      key: 'equipment',
      render: (equipmentDetails, record) => (
        <div>
          {equipmentDetails ? (
            Object.entries(equipmentDetails).map(([id, details]) => (
              <Tag key={id} icon={<ToolOutlined />}> {details.name || 'Unknown Equipment'} </Tag>
            ))
          ) : (
            <span className="text-gray-500">{record.equipment_ids?.length || 0} item(s)</span>
          )}
        </div>
      ),
    },
    {
      title: 'Rental Date',
      key: 'rental_date',
      render: (_, record) => (
        <div className="flex items-center">
          <CalendarOutlined className="mr-1" />
          <span className="text-sm font-medium">
            {record.rental_date ? formatDate(record.rental_date) : formatDate(record.start_date)}
          </span>
        </div>
      ),
    },
    {
      title: 'Price & Status',
      key: 'price_status',
      render: (_, record) => (
        <div>
          <div className="flex items-center mb-1">
            <DollarOutlined className="mr-1" />
            <span className="font-medium">{formatCurrency(record.total_price, record.currency || businessCurrency)}</span>
          </div>
          <div>{record.is_paid ? <Tag color="green">Paid</Tag> : <Tag color="orange">Unpaid</Tag>}</div>
          {record.requires_deposit && (
            <div className="text-xs text-gray-500 mt-1">
              Deposit: {formatCurrency(record.deposit_amount, record.currency || businessCurrency)}
              {record.deposit_returned && <Tag color="green" size="small">Returned</Tag>}
            </div>
          )}
        </div>
      ),
    },
    createCreatedByAuditColumn(),
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 200,
      render: (notes) => (
        <div className="flex items-start">
          <FileTextOutlined className="mr-2 mt-1 text-gray-400 flex-shrink-0" />
          <div className="text-sm">
            {notes ? (
              <span className="text-gray-700" title={notes}>
                {notes.length > 50 ? `${notes.substring(0, 50)}...` : notes}
              </span>
            ) : (
              <span className="text-gray-400 italic">No notes</span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusConfig = {
          active: { color: 'green', icon: <CheckOutlined /> },
          completed: { color: 'gray', icon: <CheckOutlined /> },
        };
        const config = statusConfig[status] || { color: 'default', icon: null };

        return (
          <Tag color={config.color} icon={config.icon}>
            {status?.charAt(0).toUpperCase() + status?.slice(1)}
          </Tag>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>

          {record.status === 'active' && (
            <Tooltip title="Mark as Completed">
              <Button type="text" icon={<CheckOutlined />} onClick={() => handleStatusChange(record.id, 'completed')} />
            </Tooltip>
          )}

          <Popconfirm
            title="Are you sure you want to delete this rental?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const rentalStats = useMemo(() => {
    if (!Array.isArray(rentals) || rentals.length === 0) {
      return {
        total: 0,
        today: 0,
        active: 0,
        unpaid: 0,
      };
    }

    const startOfToday = dayjs().startOf('day');
    const endOfToday = dayjs().endOf('day');
    let today = 0;

    rentals.forEach((rental) => {
      const rentalDateRaw = rental.rental_date || rental.start_date || rental.created_at || rental.createdAt;
      const rentalDate = rentalDateRaw ? dayjs(rentalDateRaw) : null;
      if (rentalDate?.isValid() && rentalDate.isBetween(startOfToday, endOfToday, null, '[]')) {
        today += 1;
      }
    });

    return {
      total: rentals.length,
      today,
    };
  }, [rentals]);

  const dashboardStats = useMemo(() => [
    {
      key: 'today',
      label: 'Rentals today',
      value: rentalStats.today,
      icon: <CalendarOutlined />,
      helper: dayjs().format('dddd, MMM D'),
    },
    {
      key: 'total',
      label: activeTab === 'recent' ? 'Recent list size' : 'Total rentals',
      value: rentalStats.total,
      icon: <BarChartOutlined />,
      helper: activeTab === 'recent' ? 'Showing the latest 20 records' : 'Across all recorded rentals',
    },
  ], [rentalStats, activeTab]);

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
        <div className="text-sm text-slate-500">
          Equipment Rentals
        </div>
      </div>

      <Card
        variant="borderless"
        className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
        styles={{ body: { padding: 32 } }}
      >
          <div className="pointer-events-none absolute -top-16 right-10 h-40 w-40 rounded-full bg-indigo-100" />
          <div className="pointer-events-none absolute -bottom-20 left-12 h-44 w-44 rounded-full bg-sky-50" />
          <div className="relative space-y-6">
            <div className="space-y-2">
              <Title level={2} className="!mb-0 text-slate-900">Equipment Rentals</Title>
              <p className="text-slate-600 text-base">
                Track today&apos;s activity and keep an eye on open rentals before diving into the details below.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {dashboardStats.map((stat) => (
                <div
                  key={stat.key}
                  className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {stat.label}
                      </p>
                      <p className="mt-2 text-3xl font-semibold text-slate-900">
                        {formatStatValue(stat.value)}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      {stat.icon}
                    </div>
                  </div>
                  {stat.helper ? (
                    <p className="mt-3 text-xs text-slate-500">{stat.helper}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Card>

      <Card>
        <div className="mb-6">
          <Row justify="space-between" align="middle">
            <Col>
              <Title level={3} className="!mb-0">Rental Overview</Title>
              <p className="text-gray-600 mb-4">
                Manage equipment rentals with automatic time and price calculation based on selected rental services.
              </p>
            </Col>
            <Col>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
                New Rental
              </Button>
            </Col>
          </Row>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
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

        <UnifiedTable density="comfortable">
          <Table
            columns={columns}
            dataSource={rentals}
            loading={loading}
            rowKey="id"
            pagination={{
              pageSize: activeTab === 'recent' ? 20 : 25,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} ${activeTab === 'recent' ? 'recent' : 'total'} rentals`,
            }}
            scroll={{ x: 1200 }}
          />
        </UnifiedTable>
      </Card>

      {/* Rental Form Modal */}
      <Modal
        title={null}
        open={isModalVisible}
        onCancel={handleModalCancel}
        width={780}
        destroyOnHidden
        footer={null}
        className="rental-form-modal"
        styles={{ body: { padding: 0 } }}
      >
        {/* Modern gradient header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-5 -mx-6 -mt-5 mb-0 rounded-t-lg">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            {editingRental ? '✏️ Edit Rental' : '🏄 New Rental'}
          </h2>
          <p className="text-orange-100 text-sm mt-1">
            {editingRental ? 'Update the rental details below' : 'Assign equipment to customers for their session'}
          </p>
        </div>

        <Form form={form} layout="vertical" preserve={false} className="rental-form px-6 py-5">
          <div className="rounded-2xl bg-white">
            <div className="space-y-5">
              <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-slate-200/70 pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Participants</p>
                    <h3 className="text-base font-semibold text-slate-800">Assign renters</h3>
                  </div>
                  <Radio.Group
                    value={participantMode}
                    onChange={(e) => setParticipantMode(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    size="middle"
                  >
                    <Radio.Button value="single">Single</Radio.Button>
                    <Radio.Button value="multiple" disabled={Boolean(editingRental)} title={editingRental ? 'Multiple selection is available when creating a new rental.' : undefined}>
                      Multiple
                    </Radio.Button>
                  </Radio.Group>
                </div>
                <div className="grid gap-3">
                  {participantMode === 'single' ? (
                    <Form.Item
                      name="customer_id"
                      label="Customer"
                      rules={[{ required: true, message: 'Please select a customer' }]}
                    >
                      <Select
                        placeholder="Search customer name or email"
                        showSearch
                        size="middle"
                        optionFilterProp="children"
                        className="w-full"
                      >
                        {renderCustomerOptions()}
                      </Select>
                    </Form.Item>
                  ) : (
                    <Form.Item
                      name="customer_ids"
                      label="Customers"
                      rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one customer' }]}
                    >
                      <Select
                        mode="multiple"
                        placeholder="Select customers"
                        showSearch
                        size="middle"
                        optionFilterProp="children"
                        className="w-full"
                        maxTagCount="responsive"
                      >
                        {renderCustomerOptions()}
                      </Select>
                    </Form.Item>
                  )}
                </div>
              </section>

              <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4">
                <div className="border-b border-slate-200/70 pb-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Equipment</p>
                  <h3 className="text-base font-semibold text-slate-800">Choose rental services</h3>
                </div>
                <Form.Item
                  name="equipment_ids"
                  label={null}
                  rules={[{ required: true, message: 'Select at least one rental service' }]}
                >
                  <Select
                    mode="multiple"
                    placeholder="Add equipment packages"
                    showSearch
                    size="middle"
                    optionFilterProp="children"
                    className="w-full"
                    maxTagCount="responsive"
                  >
                    {renderEquipmentOptions()}
                  </Select>
                </Form.Item>
                {equipmentSummary.count > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                    <span>
                      {equipmentSummary.count} {equipmentSummary.count === 1 ? 'service' : 'services'}
                    </span>
                    {equipmentSummary.durationLabel && <span>• {equipmentSummary.durationLabel}</span>}
                    {equipmentSummary.priceLabel && !usePackage && <span>• {equipmentSummary.priceLabel}</span>}
                    {usePackage && selectedPackageId && (
                      <Tag color="green" className="ml-2">📦 Using Package</Tag>
                    )}
                  </div>
                )}
              </section>

              {/* Package Selection Section - Only show for single customer with packages */}
              {participantMode === 'single' && !editingRental && (
                <section className="space-y-4 rounded-xl border border-slate-200/70 bg-gradient-to-br from-green-50/50 to-emerald-50/50 p-4">
                  <div className="border-b border-slate-200/70 pb-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">💳 Payment Method</p>
                    <h3 className="text-base font-semibold text-slate-800">Use Package or Charge Wallet</h3>
                  </div>
                  
                  {packagesLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Spin size="small" />
                      <span className="ml-2 text-slate-500 text-sm">Loading packages...</span>
                    </div>
                  ) : availableRentalPackages.length > 0 ? (
                    <div className="space-y-3">
                      <Checkbox 
                        checked={usePackage}
                        onChange={(e) => {
                          setUsePackage(e.target.checked);
                          if (!e.target.checked) {
                            setSelectedPackageId(null);
                          } else if (availableRentalPackages.length === 1) {
                            setSelectedPackageId(availableRentalPackages[0].id);
                          }
                        }}
                      >
                        <span className="font-medium text-slate-700">Use rental days from package</span>
                      </Checkbox>
                      
                      {usePackage && (
                        <Select
                          value={selectedPackageId}
                          onChange={setSelectedPackageId}
                          placeholder="Select a package"
                          className="w-full"
                          size="middle"
                        >
                          {availableRentalPackages.map((pkg) => (
                            <Option key={pkg.id} value={pkg.id}>
                              <div className="flex items-center justify-between">
                                <span>{pkg.packageName}</span>
                                <Tag color="green" className="ml-2">
                                  {pkg.rentalDaysRemaining} day{pkg.rentalDaysRemaining !== 1 ? 's' : ''} left
                                </Tag>
                              </div>
                            </Option>
                          ))}
                        </Select>
                      )}
                      
                      {usePackage && selectedPackageId && (
                        <Alert
                          type="success"
                          showIcon
                          message="Package rental day will be used"
                          description="1 rental day will be deducted from the selected package. No wallet charge will be applied."
                          className="text-xs"
                        />
                      )}
                    </div>
                  ) : watchedCustomerId ? (
                    <Alert
                      type="info"
                      showIcon
                      message="No rental packages available"
                      description="This customer doesn't have any active packages with remaining rental days. The rental will be charged to their wallet."
                      className="text-xs"
                    />
                  ) : (
                    <div className="text-slate-500 text-sm py-2">
                      Select a customer to check for available rental packages.
                    </div>
                  )}
                </section>
              )}

              <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Form.Item
                    name="rental_date"
                    label="Rental date"
                    rules={[{ required: true, message: 'Please select a rental date' }]}
                  >
                    <DatePicker
                      size="middle"
                      className="w-full"
                      placeholder="Choose rental date"
                      disabledDate={(current) => current && current < dayjs().startOf('day')}
                    />
                  </Form.Item>
                  <Form.Item
                    name="status"
                    label="Status"
                    rules={[{ required: true, message: 'Please select a status' }]}
                  >
                    <Select placeholder="Select status" size="middle">
                      <Option value="active">Active</Option>
                      <Option value="completed">Completed</Option>
                    </Select>
                  </Form.Item>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4">
                <Form.Item name="notes" label={<span className="font-medium text-slate-700">Notes</span>}>
                  <Input.TextArea
                    rows={3}
                    placeholder="Add equipment handover notes or customer preferences"
                    className="resize-none rounded-lg"
                    showCount
                    maxLength={500}
                  />
                </Form.Item>
              </section>

              {/* Action buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <Button onClick={handleModalCancel} className="rounded-lg">
                  Cancel
                </Button>
                <Button 
                  type="primary" 
                  onClick={handleModalOk}
                  className="rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 border-0 shadow-md hover:shadow-lg transition-all"
                >
                  {editingRental ? 'Update Rental' : 'Create Rental'}
                </Button>
              </div>
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default Rentals;