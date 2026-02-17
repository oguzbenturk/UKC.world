import { useState, useEffect } from 'react';
import {
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Table,
  Tag,
  Tooltip,
  Spin,
  Grid,
  Card,
  Row,
  Col,
  Space,
  App,
  Tabs,
  Divider,
  Alert
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TableOutlined,
  AppstoreOutlined,
  BookOutlined,
  CarOutlined,
  HomeOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useData } from '@/shared/hooks/useData';
import MultiCurrencyPriceInput from '@/shared/components/ui/MultiCurrencyPriceInput';

const { useBreakpoint } = Grid;

function LessonPackageManager({ visible, onClose, lessonServices }) {
  return (
    <App>
      <LessonPackageManagerInner visible={visible} onClose={onClose} lessonServices={lessonServices} />
    </App>
  );
}

function LessonPackageManagerInner({ visible, onClose, lessonServices }) {
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const { apiClient } = useData();
  const [form] = Form.useForm();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [packageModalVisible, setPackageModalVisible] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [isAutoCalculated, setIsAutoCalculated] = useState(true);
  const [manualPriceOverride, setManualPriceOverride] = useState(false);
  const [priceCalculationDisplay, setPriceCalculationDisplay] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'
  const [disciplineTab, setDisciplineTab] = useState('all');
  const [effectiveLessonServices, setEffectiveLessonServices] = useState(Array.isArray(lessonServices) ? lessonServices : []);
  const [lessonServicesLoading, setLessonServicesLoading] = useState(false);
  const [allServices, setAllServices] = useState([]);
  const [accommodationUnits, setAccommodationUnits] = useState([]);
  const [supportDataLoading, setSupportDataLoading] = useState(false);
  
  const { userCurrency, formatCurrency } = useCurrency();

  const deriveIncludesFromPackageType = (pkgType) => {
    const t = pkgType || 'lesson';
    return {
      includesLessons: ['lesson', 'lesson_rental', 'accommodation_lesson', 'all_inclusive'].includes(t),
      includesRental: ['rental', 'lesson_rental', 'accommodation_rental', 'all_inclusive'].includes(t),
      includesAccommodation: ['accommodation', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive'].includes(t),
    };
  };

  const filterLessonServices = (services = []) => {
    if (!Array.isArray(services)) return [];

    return services.filter((service) => {
      const category = service.category?.toLowerCase();
      const serviceType = (service.serviceType || service.service_type || '').toLowerCase();

      // Exclude non-lesson families first
      const isRental = ['rental', 'rentals'].includes(category) || serviceType === 'rental';
      const isAccommodation = ['accommodation', 'accommodations', 'stay'].includes(category);
      if (isRental || isAccommodation) return false;

      // Include known lesson/service types (broad match to avoid empty dropdown)
      const isLessonCategory = ['lesson', 'lessons', 'kitesurfing', 'wingfoil', 'kite', 'foil'].includes(category);
      const isLessonType = ['lesson', 'private', 'group', 'semi-private', 'semi private'].includes(serviceType);

      // Fallback: if not rental/accommodation and has a name, keep it selectable
      return isLessonCategory || isLessonType || Boolean(service?.name);
    });
  };

  useEffect(() => {
    setEffectiveLessonServices(Array.isArray(lessonServices) ? lessonServices : []);
  }, [lessonServices]);

  useEffect(() => {
    if (!visible || !apiClient) return;

    let cancelled = false;

    (async () => {
      try {
        setLessonServicesLoading(true);
        setSupportDataLoading(true);

        const [servicesResponse, unitsResponse] = await Promise.all([
          apiClient.get('/services'),
          apiClient.get('/accommodation/units').catch(() => ({ data: [] })),
        ]);

        const servicesPayload = servicesResponse?.data;
        const servicesFromResponse = Array.isArray(servicesPayload)
          ? servicesPayload
          : Array.isArray(servicesPayload?.data)
            ? servicesPayload.data
            : Array.isArray(servicesPayload?.services)
              ? servicesPayload.services
              : Array.isArray(servicesPayload?.items)
                ? servicesPayload.items
                : [];

        const unitsPayload = unitsResponse?.data;
        const unitsFromResponse = Array.isArray(unitsPayload)
          ? unitsPayload
          : Array.isArray(unitsPayload?.units)
            ? unitsPayload.units
            : [];

        if (!cancelled) {
          setAllServices(servicesFromResponse);
          setAccommodationUnits(unitsFromResponse);

          if (Array.isArray(lessonServices) && lessonServices.length > 0) {
            setEffectiveLessonServices(lessonServices);
          } else {
            setEffectiveLessonServices(filterLessonServices(servicesFromResponse));
          }
        }
      } catch {
        if (!cancelled) {
          setAllServices([]);
          setAccommodationUnits([]);
          if (!(Array.isArray(lessonServices) && lessonServices.length > 0)) {
            setEffectiveLessonServices([]);
          }
        }
      } finally {
        if (!cancelled) {
          setLessonServicesLoading(false);
          setSupportDataLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, apiClient, lessonServices]);

  const rentalServices = (allServices || []).filter((service) => {
    const category = String(service.category || '').toLowerCase();
    const serviceType = String(service.serviceType || service.service_type || '').toLowerCase();
    return ['rental', 'rentals', 'equipment-rental'].includes(category) || serviceType === 'rental';
  });

  // Get lesson types from available lesson services
  const availableLessonTypes = effectiveLessonServices?.map(service => ({
    value: service.id,
    label: service.name,
    duration: service.duration || 2,
    price: service.price,
  currency: service.currency,
  // pass through service tags for convenience
  disciplineTag: service.disciplineTag || null,
  lessonCategoryTag: service.lessonCategoryTag || null,
  levelTag: service.levelTag || null,
  })) || [];

  const getPackageType = (pkg) => (pkg.packageType || pkg.package_type || 'lesson');

  const hasLesson = (pkg) => {
    const t = getPackageType(pkg);
    return pkg.includesLessons || ['lesson', 'lesson_rental', 'accommodation_lesson', 'all_inclusive'].includes(t);
  };

  const hasRental = (pkg) => {
    const t = getPackageType(pkg);
    return pkg.includesRental || ['rental', 'lesson_rental', 'accommodation_rental', 'all_inclusive'].includes(t);
  };

  const hasAccommodation = (pkg) => {
    const t = getPackageType(pkg);
    return pkg.includesAccommodation || ['accommodation', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive'].includes(t);
  };

  const getPackageServiceTags = (pkg) => {
    const tags = [];
    const matchedLessonService = effectiveLessonServices?.find(s => s.id === pkg.lessonServiceId);

    const compactServiceName = (name, type) => {
      if (!name) return null;

      let compact = name;

      if (type === 'rental') {
        compact = compact
          .replace(/Full Equipment Rental Service/gi, 'rental')
          .replace(/Equipment Rental Service/gi, 'rental')
          .replace(/Rental Service/gi, 'rental')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }

      const maxLength = type === 'rental' ? 24 : 30;
      if (compact.length > maxLength) {
        compact = `${compact.slice(0, maxLength).trimEnd()}...`;
      }

      return compact;
    };

    if (hasLesson(pkg)) {
      tags.push({
        key: 'lesson',
        color: 'blue',
        text: compactServiceName(pkg.lessonServiceName || matchedLessonService?.name, 'lesson') || 'Lesson service not linked'
      });
    }

    if (hasRental(pkg)) {
      tags.push({
        key: 'rental',
        color: 'green',
        text: compactServiceName(pkg.rentalServiceName || pkg.equipmentName, 'rental') || 'Rental service not linked'
      });
    }

    if (hasAccommodation(pkg)) {
      tags.push({
        key: 'accommodation',
        color: 'orange',
        text: compactServiceName(pkg.accommodationUnitName, 'accommodation') || 'Accommodation not linked'
      });
    }

    return tags.length > 0 ? tags : [{ key: 'generic', color: 'default', text: 'Service package' }];
  };

  const resolvePackageDiscipline = (pkg) => {
    const explicit = String(pkg.disciplineTag || '').toLowerCase();
    if (explicit) return explicit;

    const linkedService = effectiveLessonServices.find((s) => s.id === pkg.lessonServiceId);
    const linkedTag = String(linkedService?.disciplineTag || '').toLowerCase();
    if (linkedTag) return linkedTag;

    const text = `${pkg.name || ''} ${pkg.description || ''} ${pkg.lessonServiceName || ''}`.toLowerCase();
    if (text.includes('e-foil') || text.includes('efoil')) return 'efoil';
    if (text.includes('wing')) return 'wing';
    if (text.includes('kite foil') || text.includes('foil')) return 'kite_foil';
    if (text.includes('premium')) return 'premium';
    if (text.includes('kite')) return 'kite';
    return 'untagged';
  };

  const filteredPackages = packages.filter((pkg) =>
    disciplineTab === 'all' || resolvePackageDiscipline(pkg) === disciplineTab
  );

  const getPackageTabCount = (key) => {
    if (key === 'all') return packages.length;
    return packages.filter((pkg) => resolvePackageDiscipline(pkg) === key).length;
  };

  // Load packages from API
  function loadPackages() {
    if (!apiClient) return;
    (async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/services/packages');
        setPackages(response.data || []);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading packages:', error);
        if (error.response?.status === 401) {
          message.warning('Please log in to view packages');
        } else {
          message.error('Failed to load packages');
        }
        setPackages([]);
      } finally {
        setLoading(false);
      }
    })();
  }

  // Load packages from API on component mount
  useEffect(() => {
    if (apiClient) {
      loadPackages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient]);

  // Prefer cards by default on small screens
  useEffect(() => {
    if (!screens.md) {
      setViewMode('cards');
    }
  }, [screens.md]);

  // Auto-calculate price when lesson type or total hours change
  const calculatePackagePrice = () => {
    if (!form) return null;
    
    try {
      const lessonType = form.getFieldValue('lessonType');
      const totalHours = form.getFieldValue('totalHours');
      
      if (lessonType && totalHours && isAutoCalculated) {
        const selectedService = effectiveLessonServices?.find(service => service.id === lessonType);
        if (selectedService?.price) {
          const calculatedPrice = selectedService.price * totalHours;
          form.setFieldsValue({ price: calculatedPrice });
          updatePriceCalculationDisplay();
          return calculatedPrice;
        }
      }
      updatePriceCalculationDisplay();
    } catch {
      // Silent fallback for form calculation
    }
    return null;
  };

  // Update price calculation display
  const updatePriceCalculationDisplay = () => {
    if (!form) {
      setPriceCalculationDisplay('💡 Price automatically calculated from lesson rate × total hours');
      return;
    }
    
    try {
      const lessonType = form.getFieldValue('lessonType');
      const totalHours = form.getFieldValue('totalHours');
      
      if (lessonType && totalHours) {
        const selectedService = effectiveLessonServices?.find(service => service.id === lessonType);
        if (selectedService?.price) {
          setPriceCalculationDisplay(
            `💡 ${formatCurrency(selectedService.price, selectedService.currency)}/hour × ${totalHours} hours = ${formatCurrency(selectedService.price * totalHours, selectedService.currency)}`
          );
          return;
        }
      }
      setPriceCalculationDisplay('💡 Price automatically calculated from lesson rate × total hours');
    } catch {
      setPriceCalculationDisplay('💡 Price automatically calculated from lesson rate × total hours');
    }
  };

  // Handle lesson type change
  const handleLessonTypeChange = (value) => {
    const selectedService = effectiveLessonServices?.find((service) => service.id === value);
    if (selectedService) {
      form.setFieldsValue({
        disciplineTag: selectedService.disciplineTag || form.getFieldValue('disciplineTag') || null,
        lessonCategoryTag: selectedService.lessonCategoryTag || form.getFieldValue('lessonCategoryTag') || null,
        levelTag: selectedService.levelTag || form.getFieldValue('levelTag') || null,
      });
    }

    if (isAutoCalculated) {
      calculatePackagePrice();
    }
  };

  // Handle total hours change
  const handleTotalHoursChange = (_value) => {
    if (isAutoCalculated) {
      calculatePackagePrice();
    }
  };

  // Handle manual price change
  const handlePriceChange = (value) => {
    if (!form || !isAutoCalculated || value === null) return;
    
    try {
      const lessonType = form.getFieldValue('lessonType');
      const totalHours = form.getFieldValue('totalHours');
      
      if (lessonType && totalHours) {
        const selectedService = effectiveLessonServices?.find(service => service.id === lessonType);
        if (selectedService?.price) {
          const calculatedPrice = selectedService.price * totalHours;
          if (Math.abs(value - calculatedPrice) > 0.01) {
            setManualPriceOverride(true);
            setIsAutoCalculated(false);
          }
        }
      }
    } catch {
      // Silent fallback for price calculation
    }
  };

  const handlePricesChange = (prices = []) => {
    const primaryPrice = Array.isArray(prices) && prices.length > 0 ? prices[0]?.price : null;
    if (typeof primaryPrice === 'number') {
      handlePriceChange(primaryPrice);
    }
  };

  // Reset auto-calculation mode
  const resetAutoCalculation = () => {
    setIsAutoCalculated(true);
    setManualPriceOverride(false);
    calculatePackagePrice();
  };

  // (Removed useCallback variant; using hoisted function instead)

  const buildPackageData = (values) => {
    const selectedLessonService = effectiveLessonServices.find(service => service.id === values.lessonType);
    const selectedRentalService = rentalServices.find(service => service.id === values.rentalServiceId);
    const selectedUnit = accommodationUnits.find((unit) => unit.id === values.accommodationUnitId);
    const packageType = values.packageType || 'lesson';
    const includeFlags = deriveIncludesFromPackageType(packageType);
    const needsLesson = includeFlags.includesLessons;
    const totalHoursValue = Number(values.totalHours || 0);
    const suggestedSessions = needsLesson && totalHoursValue > 0
      ? Math.ceil(totalHoursValue / (selectedLessonService?.duration || 2))
      : 0;
    
    // Build prices array from form values (multi-currency support)
    const prices = values.prices || [];
    const primaryPrice = prices.length > 0 ? prices[0].price : (parseFloat(values.price) || 0);
    const primaryCurrency = prices.length > 0 ? prices[0].currencyCode : (values.currency || userCurrency || 'EUR');
    
    return {
      name: values.name,
      price: primaryPrice,
      currency: primaryCurrency,
      prices: prices.filter(p => p.price != null && p.price > 0), // Only send valid prices
      sessionsCount: suggestedSessions,
      totalHours: totalHoursValue,
      packageType,
      includesLessons: includeFlags.includesLessons,
      includesRental: includeFlags.includesRental,
      includesAccommodation: includeFlags.includesAccommodation,
      lessonType: needsLesson ? values.lessonType : null,
      lessonServiceName: needsLesson ? selectedLessonService?.name : null,
      description: values.description || '',
      disciplineTag: values.disciplineTag || selectedLessonService?.disciplineTag || null,
      lessonCategoryTag: values.lessonCategoryTag || selectedLessonService?.lessonCategoryTag || null,
      levelTag: values.levelTag || selectedLessonService?.levelTag || null,
      rentalServiceId: includeFlags.includesRental ? values.rentalServiceId || null : null,
      rentalServiceName: includeFlags.includesRental ? selectedRentalService?.name || null : null,
      accommodationUnitId: includeFlags.includesAccommodation ? values.accommodationUnitId || null : null,
      accommodationUnitName: includeFlags.includesAccommodation ? selectedUnit?.name || null : null,
      rentalDays: includeFlags.includesRental ? Number(values.rentalDays || 1) : 0,
      accommodationNights: includeFlags.includesAccommodation ? Number(values.accommodationNights || 1) : 0,
    };
  };

  const savePackage = async (packageData) => {
    if (editMode && selectedPackage) {
      const response = await apiClient.put(`/services/packages/${selectedPackage.id}`, packageData);
      const updatedPackage = { ...response.data };
      setPackages(prev => prev.map(pkg => (pkg.id === selectedPackage.id ? updatedPackage : pkg)));
      message.success('Package updated successfully!');
    } else {
      const response = await apiClient.post('/services/packages', packageData);
      const newPackage = { ...response.data };
      setPackages(prev => [...prev, newPackage]);
      message.success('Package created successfully!');
    }
  };

  const finalizePackageModal = () => {
    setPackageModalVisible(false);
    setEditMode(false);
    setSelectedPackage(null);
    form.resetFields();
  };

  const handleCreatePackage = async (values) => {
    try {
      setLoading(true);
      const packageData = buildPackageData(values);
      await savePackage(packageData);
      finalizePackageModal();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving package:', error);
      const status = error.response?.status;
      if (status === 401) {
        message.error('Authentication required. Please log in.');
      } else if (status === 403) {
        message.error('You do not have permission to manage packages.');
      } else {
        message.error(editMode ? 'Failed to update package' : 'Failed to create package');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditPackage = (pkg) => {
    setSelectedPackage(pkg);
    setEditMode(true);
    setPackageModalVisible(true);
    setIsAutoCalculated(false); // Disable auto-calc for existing packages
    setManualPriceOverride(false);
    setPriceCalculationDisplay('⚠️ Editing existing package - price calculation disabled');
    
    // Build initial prices from package data
    const initialPrices = pkg.prices && pkg.prices.length > 0 
      ? pkg.prices 
      : [{ currencyCode: pkg.currency || 'EUR', price: pkg.price }];
    
    // Prefer explicit service id, fallback to name match for legacy rows
    const matchedService = effectiveLessonServices?.find(service => service.name === pkg.lessonServiceName);
    const matchedRentalService = rentalServices?.find(service => service.name === pkg.rentalServiceName);
    const matchedAccommodationUnit = accommodationUnits?.find(unit => unit.name === pkg.accommodationUnitName);
    const lessonTypeId = pkg.lessonServiceId || matchedService?.id || pkg.lessonType;
    
    form.setFieldsValue({
      name: pkg.name,
      packageType: pkg.packageType || pkg.package_type || 'lesson',
      lessonType: lessonTypeId,
      rentalServiceId: pkg.rentalServiceId || matchedRentalService?.id || null,
      accommodationUnitId: pkg.accommodationUnitId || matchedAccommodationUnit?.id || null,
      totalHours: pkg.totalHours,
      rentalDays: pkg.rentalDays || pkg.rental_days || 1,
      accommodationNights: pkg.accommodationNights || pkg.accommodation_nights || 1,
      price: pkg.price,
      currency: pkg.currency,
      prices: initialPrices,
      description: pkg.description,
      disciplineTag: pkg.disciplineTag || matchedService?.disciplineTag || null,
      lessonCategoryTag: pkg.lessonCategoryTag || matchedService?.lessonCategoryTag || null,
      levelTag: pkg.levelTag || matchedService?.levelTag || null,
    });
  };

  const handleDeletePackage = async (packageId) => {
    try {
      await apiClient.delete(`/services/packages/${packageId}`);
      setPackages(prev => prev.filter(pkg => pkg.id !== packageId));
      message.success('Package deleted successfully!');
  } catch (error) {
  // eslint-disable-next-line no-console
  console.error('Error deleting package:', error);
      
      if (error.response?.status === 400 && error.response?.data?.linkedServices) {
        // Package has linked services
        const { linkedServices } = error.response.data;
        Modal.confirm({
          title: 'Package Cannot Be Deleted',
          content: (
            <div>
              <p>{error.response.data.details}</p>
              <p><strong>Linked services:</strong></p>
              <ul>
                {linkedServices.map(service => (
                  <li key={service.id}>{service.name}</li>
                ))}
              </ul>
              <p>Would you like to force delete this package? This will remove the package association from all linked services.</p>
            </div>
          ),
          onOk: () => handleForceDeletePackage(packageId),
          okText: 'Force Delete',
          okType: 'danger',
          cancelText: 'Cancel'
        });
      } else if (error.response?.status === 401) {
        message.error('Authentication required. Please log in.');
      } else if (error.response?.status === 403) {
        message.error('You do not have permission to delete packages.');
      } else if (error.response?.status === 404) {
        message.error('Package not found.');
        // Remove from local state anyway
        setPackages(prev => prev.filter(pkg => pkg.id !== packageId));
      } else {
        message.error('Failed to delete package');
      }
    }
  };

  const handleForceDeletePackage = async (packageId) => {
    if (!apiClient) {
      message.error('API client not available');
      return;
    }
    
    try {
  // Use the dedicated force delete endpoint to avoid query parsing issues
  await apiClient.delete(`/services/packages/${packageId}/force`);
      setPackages(prev => prev.filter(pkg => pkg.id !== packageId));
      message.success('Package force deleted successfully!');
  } catch (error) {
  // eslint-disable-next-line no-console
  console.error('Error force deleting package:', error);
      if (error.response?.status === 401) {
        message.error('Authentication required. Please log in.');
      } else if (error.response?.status === 403) {
        message.error('You do not have permission to force delete packages.');
      } else {
        message.error('Failed to force delete package');
      }
    }
  };

  // Refresh button removed per request

  // Table columns for packages
  const columns = [
    {
      title: 'Package Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div className="space-y-1">
          <div className="font-semibold tracking-wide text-slate-800">{text}</div>
          <div className="text-xs tracking-wide text-slate-500">{record.description}</div>
        </div>
      ),
    },
    {
      title: 'Services',
      dataIndex: 'lessonServiceName',
      key: 'lessonServiceName',
  render: (_lessonServiceName, record) => {
        const tags = getPackageServiceTags(record);
        return (
          <Space size={[6, 6]} wrap>
            {tags.map(tag => (
              <Tag key={`${record.id}-${tag.key}`} color={tag.color} className="!rounded-full !px-2 !py-[1px] !text-[11px] !tracking-wide">
                {tag.text}
              </Tag>
            ))}
          </Space>
        );
      }
    },
    {
      title: 'Total Hours',
      dataIndex: 'totalHours',
      key: 'totalHours',
      render: (hours, record) => (
        <div className="text-center leading-tight">
          <div className="font-semibold tracking-wide text-slate-800">{hours}h</div>
          <div className="text-xs tracking-wide text-slate-500">{record.sessionsCount} sessions</div>
        </div>
      ),
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (price, record) => {
        // Show all currency prices if available
        const prices = record.prices && record.prices.length > 0 
          ? record.prices 
          : [{ currencyCode: record.currency, price }];
        
        return (
          <div className="text-right leading-tight">
            {prices.map((p, idx) => (
              <div key={idx} className={idx === 0 ? 'font-semibold tracking-wide text-slate-800' : 'text-xs tracking-wide text-slate-500'}>
                {formatCurrency(p.price, p.currencyCode)}
              </div>
            ))}
            <div className="text-[11px] tracking-wide text-slate-400 mt-1">
              {formatCurrency(record.pricePerHour, record.currency)}/h
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'red'} className="!rounded-full !px-2 !text-[11px] !tracking-wide">
          {status.toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <div className="space-x-2 whitespace-nowrap">
          <Button 
            size="small" 
            icon={<EditOutlined />}
            className="!rounded-md"
            onClick={() => handleEditPackage(record)}
          >
            Edit
          </Button>
          <Button 
            size="small" 
            danger
            icon={<DeleteOutlined />}
            className="!rounded-md"
            onClick={() => handleDeletePackage(record.id)}
          >
            Delete
          </Button>
        </div>
      )
    }
  ];

  // Stats removed from UI; keeping data minimal in this manager

  return (
    <Modal
      title={null}
      open={visible}
      onCancel={onClose}
      width={1200}
      footer={null}
      style={{ top: 20 }}
      styles={{ body: { padding: 20, background: '#f8fafc' } }}
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <h2 className="text-base md:text-lg font-semibold tracking-wide text-slate-800">Lesson Packages</h2>
          <p className="text-xs md:text-sm tracking-wide text-slate-500 mt-1">Manage lesson, rental, and accommodation package combinations in one place.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <Tabs
            activeKey={disciplineTab}
            onChange={setDisciplineTab}
            items={[
              { key: 'all', label: `All (${getPackageTabCount('all')})` },
              { key: 'kite', label: `Kite (${getPackageTabCount('kite')})` },
              { key: 'wing', label: `Wing (${getPackageTabCount('wing')})` },
              { key: 'kite_foil', label: `Kite Foil (${getPackageTabCount('kite_foil')})` },
              { key: 'efoil', label: `E-Foil (${getPackageTabCount('efoil')})` },
              { key: 'premium', label: `Premium (${getPackageTabCount('premium')})` },
              { key: 'untagged', label: `Untagged (${getPackageTabCount('untagged')})` },
            ]}
          />
        </div>

        {/* Actions Row: View toggle + Create button */}
        <div className="flex justify-between items-center gap-3 flex-wrap rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Space.Compact>
              <Button 
                type={viewMode === 'table' ? 'primary' : 'default'}
                icon={<TableOutlined />}
                onClick={() => setViewMode('table')}
                className="!rounded-l-lg !tracking-wide"
              >
                Table
              </Button>
              <Button 
                type={viewMode === 'cards' ? 'primary' : 'default'}
                icon={<AppstoreOutlined />}
                onClick={() => setViewMode('cards')}
                className="!rounded-r-lg !tracking-wide"
              >
                Cards
              </Button>
            </Space.Compact>
          </div>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => {
              setEditMode(false);
              setSelectedPackage(null);
              setIsAutoCalculated(true);
              setManualPriceOverride(false);
              setPriceCalculationDisplay('💡 Price automatically calculated from lesson rate × total hours');
              form.resetFields();
              // Set default values
              form.setFieldsValue({
                currency: 'EUR',
                packageType: undefined,
              });
              setPackageModalVisible(true);
            }}
            className="!rounded-lg !tracking-wide"
          >
            Create Package
          </Button>
        </div>

        {/* Packages List */}
        <Spin spinning={loading}>
          {viewMode === 'table' ? (
            <Table
              columns={columns}
              dataSource={filteredPackages}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              size="middle"
              className="rounded-xl overflow-hidden border border-slate-200 bg-white"
            />
          ) : (
            <div>
              {(!filteredPackages || filteredPackages.length === 0) ? (
                <div className="text-center text-slate-500 py-12 rounded-xl border border-dashed border-slate-300 bg-white tracking-wide">No packages found</div>
              ) : (
                <Row gutter={[18, 18]}>
                  {filteredPackages.map((pkg) => {
                    const perHour = pkg.totalHours ? (pkg.price || 0) / pkg.totalHours : null;
                    const services = getPackageServiceTags(pkg);
                    const rentalDays = pkg.rentalDays || pkg.rental_days || 0;
                    const accommodationNights = pkg.accommodationNights || pkg.accommodation_nights || 0;
                    const packageBreakdown = [
                      {
                        key: 'lessons',
                        label: 'Lessons',
                        value: `${pkg.totalHours || 0}h`,
                        show: Number(pkg.totalHours || 0) > 0,
                      },
                      {
                        key: 'rental',
                        label: 'Rental',
                        value: `${rentalDays} day(s)`,
                        show: Number(rentalDays) > 0,
                      },
                      {
                        key: 'accommodation',
                        label: 'Accommodation',
                        value: `${accommodationNights} night(s)`,
                        show: Number(accommodationNights) > 0,
                      },
                    ].filter((item) => item.show);
                    return (
                      <Col key={pkg.id} xs={24} sm={12} md={8} lg={6}>
                        <Card
                          size="small"
                          className="h-full rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                          styles={{ header: { paddingBottom: 14 }, body: { paddingTop: 14 } }}
                          title={
                            <div className="flex flex-col gap-3">
                              <div className="font-semibold leading-snug tracking-wide text-slate-800">{pkg.name}</div>
                              {pkg.description ? (
                                <div className="text-xs text-slate-500 leading-snug tracking-wide">{pkg.description}</div>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <Tag color={pkg.status === 'active' ? 'green' : 'red'} className="m-0 !rounded-full !px-2 !py-[1px] !text-[11px] !tracking-wide">
                                  {(pkg.status || 'active').toUpperCase()}
                                </Tag>
                                <Tag color="purple" className="m-0 !rounded-full !px-2 !py-[1px] !text-[11px] !tracking-wide">
                                  {(getPackageType(pkg) || 'lesson').replace(/_/g, ' ')}
                                </Tag>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                                {services.map(service => (
                                  <Tag key={`${pkg.id}-${service.key}`} color={service.color} className="m-0 !rounded-full !px-2 !py-[1px] !text-[11px] !tracking-wide max-w-[210px] truncate" title={service.text}>
                                    {service.text}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          }
                          actions={[
                            <Button key="edit" size="small" className="!rounded-md !tracking-wide" icon={<EditOutlined />} onClick={() => handleEditPackage(pkg)}>Edit</Button>,
                            <Button key="delete" size="small" className="!rounded-md !tracking-wide" danger icon={<DeleteOutlined />} onClick={() => handleDeletePackage(pkg.id)}>Delete</Button>
                          ]}
                        >
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div>
                              <div className="text-[11px] tracking-wide text-slate-500">Total Hours</div>
                              <div className="font-semibold tracking-wide text-slate-800">{pkg.totalHours}h</div>
                              <div className="text-[11px] tracking-wide text-slate-500">{pkg.sessionsCount} sessions</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[11px] tracking-wide text-slate-500">Prices</div>
                              {(pkg.prices && pkg.prices.length > 0 
                                ? pkg.prices 
                                : [{ currencyCode: pkg.currency, price: pkg.price }]
                              ).map((p, idx) => (
                                <div key={idx} className={idx === 0 ? 'font-semibold tracking-wide text-slate-800' : 'text-[11px] tracking-wide text-slate-500'}>
                                  {formatCurrency(p.price, p.currencyCode)}
                                </div>
                              ))}
                              <div className="text-[11px] tracking-wide text-slate-400 mt-1">{perHour != null ? `${formatCurrency(perHour, pkg.currency)}/h` : '-'}</div>
                            </div>
                          </div>

                          {packageBreakdown.length > 0 && (
                            <div className="mt-4 space-y-1.5 rounded-lg bg-slate-50 p-3 text-[11px] tracking-wide text-slate-600 border border-slate-100">
                              {packageBreakdown.map((item) => (
                                <div key={`${pkg.id}-${item.key}`} className="flex justify-between">
                                  <span>{item.label}</span>
                                  <span className="font-medium">{item.value}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              )}
            </div>
          )}
        </Spin>
      </div>

      <Modal
        title={null}
        open={packageModalVisible}
        onCancel={() => {
          setPackageModalVisible(false);
          setEditMode(false);
          setSelectedPackage(null);
          setIsAutoCalculated(true);
          setManualPriceOverride(false);
          setPriceCalculationDisplay('');
          form.resetFields();
        }}
        footer={null}
        width={800}
        destroyOnHidden
        zIndex={1050}
        className="clean-modal-override"
        closeIcon={<div className="bg-white/10 hover:bg-white/20 w-7 h-7 flex items-center justify-center rounded-full text-white transition-colors">×</div>}
        styles={{ 
          content: { padding: 0, borderRadius: '16px', overflow: 'hidden', backgroundColor: '#f8fafc' },
          body: { padding: 0 }
        }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 border-b border-violet-500/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg shadow-sm ring-1 ring-white/10">
              {editMode ? '✏️' : '✨'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                {editMode ? 'Edit Package' : 'New Package'}
              </h2>
              <p className="text-violet-100/90 text-xs mt-0.5">
                Configure package composition, services, and pricing.
              </p>
            </div>
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreatePackage}
          requiredMark={false}
          className="p-6 space-y-1 package-creator-form"
          style={{ maxHeight: 'calc(80vh - 80px)', overflowY: 'auto', overflowX: 'hidden' }}
        >
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item
                name="name"
                label="Package Name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input
                  placeholder="e.g. Wing Beginner 8H"
                  className="!rounded-lg !border-slate-200 hover:!border-blue-400 focus:!border-blue-500 !bg-slate-50/50 focus:!bg-white transition-all shadow-sm"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item
                name="packageType"
                label="Package Type"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Select
                  placeholder="Select type"
                  popupClassName="pkg-modal-dropdown"
                  className="!rounded-lg [&_.ant-select-selector]:!rounded-lg [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!bg-slate-50/50 shadow-sm"
                  onChange={(val) => {
                    const includeFlags = deriveIncludesFromPackageType(val);
                    if (!includeFlags.includesLessons) {
                      form.setFieldsValue({ lessonType: undefined, totalHours: undefined });
                    }
                    if (!includeFlags.includesRental) {
                      form.setFieldsValue({ rentalServiceId: undefined, rentalDays: undefined });
                    }
                    if (!includeFlags.includesAccommodation) {
                      form.setFieldsValue({ accommodationUnitId: undefined, accommodationNights: undefined });
                    }
                  }}
                  options={[
                    { value: 'lesson', label: 'Lesson' },
                    { value: 'rental', label: 'Rental' },
                    { value: 'lesson_rental', label: 'Lesson + Rental' },
                    { value: 'accommodation', label: 'Accommodation' },
                    { value: 'accommodation_rental', label: 'Accom. + Rental' },
                    { value: 'accommodation_lesson', label: 'Accom. + Lesson' },
                    { value: 'all_inclusive', label: 'All Inclusive' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea
              rows={2}
              placeholder="Describe what's included in this package"
              className="!rounded-lg !border-slate-200 !bg-slate-50/50 hover:!border-blue-400 focus:!border-blue-500 focus:!bg-white transition-all shadow-sm"
            />
          </Form.Item>

          <Form.Item shouldUpdate noStyle>
            {() => {
              const pType = form.getFieldValue('packageType') || 'lesson';
              const includeFlags = deriveIncludesFromPackageType(pType);
              if (!includeFlags.includesLessons) return null;

              return (
                <>
                  <Divider orientation="left" className="!my-3"><BookOutlined /> Lesson Details</Divider>
                  {availableLessonTypes.length === 0 && !lessonServicesLoading ? (
                    <Alert type="warning" showIcon icon={<InfoCircleOutlined />} message="No lesson services found" description="Create lesson services first in Services → Lessons" style={{ marginBottom: 16 }} />
                  ) : (
                    <Row gutter={16}>
                      <Col xs={24} md={16}>
                        <Form.Item
                          name="lessonType"
                          label="Lesson Type / Service"
                          rules={[{ required: true, message: 'Required' }]}
                        >
                          <Select
                            placeholder={lessonServicesLoading ? 'Loading...' : availableLessonTypes.length === 0 ? 'None found' : 'Select lesson service'}
                            onChange={handleLessonTypeChange}
                            showSearch
                            loading={lessonServicesLoading}
                            disabled={lessonServicesLoading || availableLessonTypes.length === 0}
                            notFoundContent={lessonServicesLoading ? <Spin size="small" /> : 'No services available'}
                            optionFilterProp="label"
                            popupClassName="pkg-modal-dropdown"
                            listHeight={200}
                            className="!rounded-lg [&_.ant-select-selector]:!rounded-lg [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!bg-slate-50/50 shadow-sm"
                            options={availableLessonTypes.map(type => ({
                              value: type.value,
                              label: `${type.label}${type.disciplineTag ? ` · ${String(type.disciplineTag).replace('_', ' ')}` : ''}${type.price ? ` – ${formatCurrency(type.price, type.currency)}/h` : ''}`
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item
                          name="totalHours"
                          label="Total Lesson Hours"
                          rules={[{ required: true, message: 'Required' }]}
                        >
                          <InputNumber
                            min={1}
                            max={60}
                            placeholder="0"
                            style={{ width: '100%' }}
                            addonAfter="h"
                            onChange={handleTotalHoursChange}
                            className="!rounded-lg !border-slate-200 !bg-slate-50/50 shadow-sm"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                </>
              );
            }}
          </Form.Item>

          <Form.Item shouldUpdate noStyle>
            {() => {
              const pType = form.getFieldValue('packageType') || 'lesson';
              const includeFlags = deriveIncludesFromPackageType(pType);
              if (!includeFlags.includesRental) return null;

              return (
                <>
                  <Divider orientation="left" className="!my-3"><CarOutlined /> Rental Details</Divider>
                  {rentalServices.length === 0 && !supportDataLoading ? (
                    <Alert type="warning" showIcon icon={<InfoCircleOutlined />} message="No rental services found" description="Create rental services first in Services → Rentals" style={{ marginBottom: 16 }} />
                  ) : (
                    <Row gutter={16}>
                      <Col xs={24} md={16}>
                        <Form.Item
                          name="rentalServiceId"
                          label="Rental Service"
                          rules={[{ required: true, message: 'Required' }]}
                        >
                          <Select
                            placeholder={supportDataLoading ? 'Loading...' : 'Select rental service'}
                            showSearch
                            loading={supportDataLoading}
                            optionFilterProp="label"
                            popupClassName="pkg-modal-dropdown"
                            className="!rounded-lg [&_.ant-select-selector]:!rounded-lg [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!bg-slate-50/50 shadow-sm"
                            options={rentalServices.map((s) => ({
                              value: s.id,
                              label: `${s.name}${s.price ? ` – ${formatCurrency(s.price, s.currency || 'EUR')}` : ''}`,
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item
                          name="rentalDays"
                          label="Rental Days"
                          rules={[{ required: true, message: 'Required' }]}
                        >
                          <InputNumber min={1} style={{ width: '100%' }} addonAfter="days" className="!rounded-lg !border-slate-200 !bg-slate-50/50 shadow-sm" />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                </>
              );
            }}
          </Form.Item>

          <Form.Item shouldUpdate noStyle>
            {() => {
              const pType = form.getFieldValue('packageType') || 'lesson';
              const includeFlags = deriveIncludesFromPackageType(pType);
              if (!includeFlags.includesAccommodation) return null;

              return (
                <>
                  <Divider orientation="left" className="!my-3"><HomeOutlined /> Accommodation Details</Divider>
                  {accommodationUnits.length === 0 && !supportDataLoading ? (
                    <Alert type="warning" showIcon icon={<InfoCircleOutlined />} message="No accommodation units found" description="Create accommodation units first in Services → Accommodation" style={{ marginBottom: 16 }} />
                  ) : (
                    <Row gutter={16}>
                      <Col xs={24} md={16}>
                        <Form.Item
                          name="accommodationUnitId"
                          label="Room / Unit Type"
                          rules={[{ required: true, message: 'Required' }]}
                        >
                          <Select
                            placeholder={supportDataLoading ? 'Loading...' : 'Select accommodation unit'}
                            showSearch
                            loading={supportDataLoading}
                            optionFilterProp="label"
                            popupClassName="pkg-modal-dropdown"
                            className="!rounded-lg [&_.ant-select-selector]:!rounded-lg [&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!bg-slate-50/50 shadow-sm"
                            options={accommodationUnits.map((u) => ({
                              value: u.id,
                              label: `${u.name}${u.type ? ` · ${u.type}` : ''}`,
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item
                          name="accommodationNights"
                          label="Number of Nights"
                          rules={[{ required: true, message: 'Required' }]}
                        >
                          <InputNumber min={1} style={{ width: '100%' }} addonAfter="nights" className="!rounded-lg !border-slate-200 !bg-slate-50/50 shadow-sm" />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                </>
              );
            }}
          </Form.Item>

          <Divider className="!my-3" />

          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Package Price *</span>
              {isAutoCalculated && <Tag color="blue" className="!text-[10px] !px-1.5 !py-0 !leading-4 !border-none !bg-blue-100 !text-blue-700 !font-semibold">Auto</Tag>}
              {manualPriceOverride && <Tag color="orange" className="!text-[10px] !px-1.5 !py-0 !leading-4 !border-none !bg-orange-100 !text-orange-700 !font-semibold">Manual</Tag>}
            </div>
            <MultiCurrencyPriceInput
              form={form}
              name="prices"
              label="Multi-Currency Pricing"
              required
              compact
              onChange={handlePricesChange}
            />
          </div>

          {isAutoCalculated && !manualPriceOverride && priceCalculationDisplay && (
            <div className="text-xs text-blue-600 bg-blue-50/50 rounded-lg px-3 py-2 border border-blue-100/50 mt-1 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {priceCalculationDisplay}
            </div>
          )}
          {manualPriceOverride && (
            <div className="text-xs text-orange-600 bg-orange-50/50 rounded-lg px-3 py-2 border border-orange-100/50 mt-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                Manual override active
              </div>
              <Button type="link" size="small" onClick={resetAutoCalculation} className="!p-0 !h-auto !text-xs !text-orange-600 hover:!text-orange-700 underline decoration-dotted">Reset to auto</Button>
            </div>
          )}

          <Form.Item name="price" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="currency" initialValue="EUR" hidden>
            <Input />
          </Form.Item>

          {/* Footer */}
          <div className="flex justify-end items-center pt-5 border-t border-slate-100 mt-4">
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setPackageModalVisible(false);
                  setEditMode(false);
                  setSelectedPackage(null);
                  form.resetFields();
                }}
                className="!rounded-lg !border-slate-200 !text-slate-600 hover:!bg-slate-50 hover:!text-slate-800 !px-5"
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                className="!rounded-lg !bg-violet-600 hover:!bg-violet-500 !border-0 !shadow-lg !shadow-violet-200/50 !px-6 !font-medium"
              >
                {editMode ? 'Update Package' : 'Create Package'}
              </Button>
            </div>
          </div>
        </Form>

        <style>{`
          .pkg-modal-dropdown { z-index: 2000 !important; }
          .package-creator-form .ant-form-item-label > label {
            color: #334155;
            font-weight: 600;
          }
          .package-creator-form .ant-input,
          .package-creator-form .ant-input-number,
          .package-creator-form .ant-input-number-group-addon,
          .package-creator-form .ant-select-selector {
            border-radius: 10px !important;
          }
        `}</style>
      </Modal>
    </Modal>
  );
}

export default LessonPackageManager;

