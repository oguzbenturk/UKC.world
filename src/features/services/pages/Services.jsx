// src/pages/Services.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Button, 
  Input, 
  Modal, 
  Empty, 
  Drawer,
  Tag,
  Alert,
  Skeleton,
  Card,
  Row,
  Col
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  PlusOutlined, 
  SearchOutlined, 
  BookOutlined,
  AppstoreOutlined,
  ShoppingCartOutlined,
  InfoCircleOutlined,
  HomeOutlined,
  ToolOutlined
} from '@ant-design/icons';
import { useAuth } from "@/shared/hooks/useAuth";
import { useNavigate } from 'react-router-dom';
import { serviceApi } from '@/shared/services/serviceApi';
import ServiceCard from '../components/ServiceCard';
import ServiceForm from '../components/ServiceForm';
import StepLessonServiceModal from '../components/StepLessonServiceModal';
import ServiceDetailModal from '../components/ServiceDetailModal';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import dayjs from 'dayjs';
import { useData } from '@/shared/hooks/useData';



// eslint-disable-next-line complexity
function Services() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { formatCurrency, businessCurrency } = useCurrency();
  const { usersWithStudentRole = [], instructors = [] } = useData();
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [_categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  
  const [formDrawerVisible, setFormDrawerVisible] = useState(false);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  
  const [selectedService, setSelectedService] = useState(null);
  const [editMode, setEditMode] = useState(false);
  
  const [cart, setCart] = useState([]);
  const [cartDrawerVisible, setCartDrawerVisible] = useState(false);

  const actorDirectory = React.useMemo(() => {
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

    usersWithStudentRole.forEach(register);
    instructors.forEach(register);
    if (user) {
      register(user);
    }

    return directory;
  }, [usersWithStudentRole, instructors, user]);

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

  const decorateService = useCallback(
    (service) => {
      if (!service || typeof service !== 'object') {
        return service;
      }

      const createdBy = service.createdBy ?? service.created_by ?? null;
      const createdByName = service.createdByName ?? service.created_by_name ?? null;
      const createdAt = service.createdAt ?? service.created_at ?? null;

      return {
        ...service,
        createdBy,
        createdByName,
        createdAt,
        createdByLabel: resolveActorLabel(createdBy, createdByName),
        createdAtFormatted: formatAuditTimestamp(createdAt),
      };
    },
    [formatAuditTimestamp, resolveActorLabel]
  );

  // Service Categories Configuration (memoized)
  const serviceCategories = React.useMemo(() => ({
    all: {
      title: 'All Services',
      icon: <AppstoreOutlined />,
      color: 'var(--brand-primary)'
    },
    accommodation: {
      title: 'Accommodation',
      icon: <HomeOutlined />,
      color: '#fa8c16'
    },
    lesson: {
      title: 'Lessons',
      icon: <BookOutlined />,
      color: 'var(--brand-success)'
    },
    rental: {
      title: 'Rentals',
      icon: <ToolOutlined />,
      color: '#eb2f96'
    },
    sales: {
      title: 'Shop',
      icon: <ShoppingCartOutlined />,
      color: '#722ed1'
    }
  }), []);

  // Count services per category
  const serviceCounts = React.useMemo(() => {
    const counts = {
      all: services.length
    };
    
    Object.keys(serviceCategories).forEach(categoryKey => {
      if (categoryKey !== 'all') {
        counts[categoryKey] = services.filter(service => service.category === categoryKey).length;
      }
    });
    
    return counts;
  }, [services, serviceCategories]);

  // Load services and categories on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [rawServices, categoriesData] = await Promise.all([
          serviceApi.getServices(),
          serviceApi.getCategories()
        ]);
        
        const servicesData = Array.isArray(rawServices)
          ? rawServices.map(decorateService)
          : [];

        setServices(servicesData);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        setError(null);
  } catch {
        setError('Failed to load services. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [decorateService]);

  // Filter services when filters change
  useEffect(() => {
    let result = [...services];
    
    // Apply category filter
    if (selectedCategory !== 'all') {
      result = result.filter(service => service.category === selectedCategory);
    }
    
    // Apply search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      result = result.filter(service =>
        service.name?.toLowerCase().includes(searchLower) ||
        service.description?.toLowerCase().includes(searchLower) ||
        service.category?.toLowerCase().includes(searchLower) ||
        service.createdByLabel?.toLowerCase().includes(searchLower) ||
        service.createdAtFormatted?.toLowerCase().includes(searchLower)
      );
    }
    
    setFilteredServices(result);
  }, [services, selectedCategory, searchText]);

  // Handle category selection
  const handleCategorySelect = (categoryKey) => {
    setSelectedCategory(categoryKey);
  };
  const handleCreateService = async (serviceData) => {
    try {
      setLoading(true);
  const newService = await serviceApi.createService(serviceData);
  setServices(prev => [...prev, decorateService(newService)]);
      setFormDrawerVisible(false);
      setLessonModalOpen(false);
      message.success('Service created successfully!');
    } catch (error) {
      message.error(`Failed to create service: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditService = async (serviceData) => {
    try {
      setLoading(true);
      const updatedService = await serviceApi.updateService(selectedService.id, serviceData);
      
      setServices(prev => 
        prev.map(service => service.id === selectedService.id ? decorateService(updatedService) : service)
      );
      
      setFormDrawerVisible(false);
      setEditMode(false);
      setSelectedService(null);
      message.success('Service updated successfully!');
    } catch (error) {
      message.error(`Failed to update service: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteService = async (id) => {
    try {
      setLoading(true);
      await serviceApi.deleteService(id);
      setServices(prev => prev.filter(service => service.id !== id));
      setConfirmDeleteVisible(false);
      setSelectedService(null);
      message.success('Service deleted successfully!');
    } catch (error) {
      message.error(`Failed to delete service: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const showEditForm = (service) => {
    setSelectedService(service);
    setEditMode(true);
    setFormDrawerVisible(true);
  };

  const showServiceDetails = (service) => {
    setSelectedService(service);
    setDetailModalVisible(true);
  };

  const confirmDelete = (id) => {
    const service = services.find(s => s.id === id);
    setSelectedService(service);
    setConfirmDeleteVisible(true);
  };
  
  // Booking functionality
  const handleBookService = (bookingDetails) => {
    // Add to cart
    const uid = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCart(prev => [...prev, { ...bookingDetails, _uid: uid }]);
    message.success(
      <span>
        Added to cart! <a onClick={() => setCartDrawerVisible(true)}>View Cart</a>
      </span>,
      5
    );
  };
  
  const handleRemoveFromCart = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
    message.success('Item removed from cart');
  };
  
  const handleCheckout = () => {
    // In a real app, this would navigate to the checkout page
    navigate('/checkout', { state: { items: cart } });
    setCartDrawerVisible(false);
    setCart([]);
    message.success('Proceeding to checkout...');
  };

  const hasPermissionToEdit = ['admin', 'manager'].includes(user?.role);

  // Display skeletons while loading
  const renderSkeletons = () => {
    const keys = ['sk-1','sk-2','sk-3','sk-4','sk-5','sk-6'];
    return keys.map((k) => (
      <Col xs={24} sm={12} lg={8} xl={6} key={k}>
        <Card className="service-card h-full">
          <Skeleton.Image className="w-full h-40 mb-4" active />
          <Skeleton active paragraph={{ rows: 2 }} />
          <div className="flex justify-between mt-4">
            <Skeleton.Button active />
            <Skeleton.Button active />
          </div>
        </Card>
      </Col>
    ));
  };

  const categoryCount = React.useMemo(
    () => Object.keys(serviceCategories).filter((key) => key !== 'all').length,
    [serviceCategories]
  );

  const categoryTitle = selectedCategory === 'all'
    ? 'All Services'
    : serviceCategories[selectedCategory]?.title ?? 'Services';

  const heroStats = React.useMemo(
    () => ([
      { label: 'Total', value: services.length, hint: 'Catalog items' },
      { label: 'Categories', value: categoryCount, hint: 'Types offered' },
      { label: 'In cart', value: cart.length, hint: 'Awaiting checkout' }
    ]),
    [cart.length, categoryCount, services.length]
  );

  const heroDescription = React.useMemo(() => {
    const quantity = filteredServices.length;
    const noun = quantity === 1 ? 'service' : 'services';
    if (selectedCategory === 'all') {
      return `${quantity} ${noun} available across your catalog`;
    }
    return `${quantity} ${noun} available in ${categoryTitle.toLowerCase()}`;
  }, [categoryTitle, filteredServices.length, selectedCategory]);

  return (
    <div className="container mx-auto space-y-6 px-4 py-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 p-6 text-white shadow-[0_18px_42px_rgba(29,78,216,0.28)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="flex-1 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/80 shadow-sm">
              <AppstoreOutlined /> Services Console
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold leading-tight">{categoryTitle}</h1>
              <p className="text-sm text-white/75">{heroDescription}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {heroStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/20 bg-white/14 p-3 text-center shadow-[0_10px_26px_rgba(24,64,192,0.28)] backdrop-blur"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/90">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                  <p className="mt-1 text-[11px] text-white/70">{stat.hint}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-3 rounded-3xl border border-white/18 bg-white/14 p-5 backdrop-blur-xl shadow-[0_16px_36px_rgba(14,58,190,0.32)] lg:mt-0 lg:w-80">
            <p className="text-sm text-white/80">Manage services, organize offerings, and finalize bookings.</p>
            {cart.length > 0 && (
              <Button
                type="primary"
                icon={<ShoppingCartOutlined />}
                onClick={() => setCartDrawerVisible(true)}
                className="h-11 rounded-2xl border-0 bg-white text-sky-600 shadow-[0_10px_25px_rgba(11,78,240,0.35)] transition hover:bg-slate-100"
              >
                Open cart ({cart.length})
              </Button>
            )}
            {hasPermissionToEdit && (
              <Button
                ghost
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditMode(false);
                  setSelectedService(null);
                  if (selectedCategory === 'lesson') {
                    setLessonModalOpen(true);
                  } else {
                    setFormDrawerVisible(true);
                  }
                }}
                className="h-11 rounded-2xl border-white/45 text-white shadow-[0_8px_22px_rgba(255,255,255,0.22)] hover:bg-white/15"
              >
                Create service
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert
          message="Unable to load services"
          description={error}
          type="error"
          showIcon
          className="rounded-2xl border border-red-100 bg-white text-red-700 shadow-[0_12px_30px_rgba(248,113,113,0.22)]"
        />
      )}

      <div className="space-y-6 rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap gap-2">
          {Object.entries(serviceCategories).map(([key, category]) => {
            const isActive = selectedCategory === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleCategorySelect(key)}
                className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'border-transparent bg-sky-600/90 text-white shadow-[0_10px_24px_rgba(15,116,255,0.25)]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                <span className="text-base">{category.icon}</span>
                <span>{category.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {serviceCounts[key] || 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Input
            placeholder="Search services..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            size="large"
            className="md:max-w-sm rounded-2xl"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              <SearchOutlined className="text-xs" />
              Live filter
            </span>
            <span>{heroDescription}</span>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        {loading ? (
          <Row gutter={[24, 24]}>{renderSkeletons()}</Row>
        ) : filteredServices.length > 0 ? (
          <Row gutter={[24, 24]}>
            {filteredServices.map((service) => (
              <Col xs={24} sm={12} lg={8} xl={6} key={service.id}>
                <ServiceCard
                  service={service}
                  onEdit={hasPermissionToEdit ? showEditForm : undefined}
                  onDelete={hasPermissionToEdit ? confirmDelete : undefined}
                  onView={showServiceDetails}
                  onBook={() => showServiceDetails(service)}
                />
              </Col>
            ))}
          </Row>
        ) : (
          <div className="py-10">
            <Empty
              description={
                <span>
                  No services found in this category. {hasPermissionToEdit && 'Create a new service to get started.'}
                </span>
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              {hasPermissionToEdit && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditMode(false);
                    setSelectedService(null);
                    if (selectedCategory === 'lesson') {
                      setLessonModalOpen(true);
                    } else {
                      setFormDrawerVisible(true);
                    }
                  }}
                  className="rounded-2xl"
                >
                  Create service
                </Button>
              )}
            </Empty>
          </div>
        )}
      </div>

      {/* Create/Edit Form Drawer */}
      <Drawer
        title={editMode ? "Edit Service" : "Create New Service"}
        placement="right"
        width={800}
        onClose={() => setFormDrawerVisible(false)}
        open={formDrawerVisible}
  destroyOnHidden
      >
        <ServiceForm
          onSubmit={editMode ? handleEditService : handleCreateService}
          initialValues={selectedService}
          isEditing={editMode}
        />
      </Drawer>

      {/* Step-based Lesson Creator */}
      <StepLessonServiceModal
        open={lessonModalOpen}
        onClose={() => setLessonModalOpen(false)}
        onCreated={(created) => {
          setServices((prev) => [...prev, created]);
          setLessonModalOpen(false);
        }}
      />
      
      {/* Service Detail Modal */}
      <ServiceDetailModal
        service={selectedService}
        open={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        onBook={handleBookService}
      />
      
      {/* Delete Confirmation Modal */}
      <Modal
        title="Delete Service"
        open={confirmDeleteVisible}
        onCancel={() => setConfirmDeleteVisible(false)}
        onOk={() => handleDeleteService(selectedService?.id)}
        okText="Delete"
        okButtonProps={{ danger: true }}
      >
        <p>Are you sure you want to delete "{selectedService?.name}"?</p>
        <p className="text-red-600">This action cannot be undone.</p>
      </Modal>
      
      {/* Shopping Cart Drawer */}
      <Drawer
        title={
          <div className="flex items-center">
            <ShoppingCartOutlined className="mr-2 text-lg" />
            <span>Your Cart ({cart.length} items)</span>
          </div>
        }
        placement="right"
        width={400}
        onClose={() => setCartDrawerVisible(false)}
        open={cartDrawerVisible}
        footer={
          <div className="flex flex-col gap-4">
            <div className="flex justify-between text-lg font-bold">
              <span>Total:</span>
              <span>{formatCurrency(cart.reduce((total, item) => total + Number(item.price || 0), 0), cart[0]?.currency || businessCurrency || 'EUR')}</span>
            </div>
            <Button 
              type="primary" 
              block 
              size="large"
              onClick={handleCheckout}
              disabled={cart.length === 0}
            >
              Proceed to Checkout
            </Button>
          </div>
        }
      >
        {cart.length === 0 ? (
          <Empty description="Your cart is empty" />
        ) : (
          <div className="space-y-4">
            {cart.map((item, index) => (
              <div key={item._uid || `${item.serviceName || 'svc'}-${item.price || '0'}-${item.time || ''}-${item.date || ''}`} className="border border-gray-200 rounded-md p-3 relative">
                <Tag color="blue" className="mb-2">{item.isPackage ? 'Package' : 'Single Session'}</Tag>
                <h4 className="font-medium">{item.serviceName}</h4>
                
                {item.date && item.time && (
                  <div className="text-sm text-gray-500 mb-2">
                    <p>
                      <BookOutlined className="mr-1" />
                      {new Date(item.date).toLocaleDateString()} at {item.time}
                    </p>
                  </div>
                )}
                
                <div className="flex justify-between mt-2">
                  <span className="font-bold">{formatCurrency(item.price || 0, item.currency || businessCurrency || 'EUR')}</span>
                  <Button 
                    danger 
                    size="small" 
                    onClick={() => handleRemoveFromCart(index)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            
            <Alert
              message={
                <span className="flex items-center">
                  <InfoCircleOutlined className="mr-2" />
                  Booking Information
                </span>
              }
              description="You'll be able to choose user details and confirm your booking on the next step."
              type="info"
              showIcon={false}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default Services;
