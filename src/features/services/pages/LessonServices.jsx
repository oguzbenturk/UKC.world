import { useState, useEffect } from 'react';
import { 
  App,
  Button, 
  Input, 
  Empty, 
  Drawer,
  Card,
  Alert,
  Skeleton,
  Tag,
  Modal,
  Table,
  Segmented,
  Tabs
} from 'antd';
import { 
  PlusOutlined, 
  SearchOutlined,
  
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  AppstoreOutlined,
  TableOutlined,
  
  UserOutlined,
  UsergroupAddOutlined
} from '@ant-design/icons';
import { useAuth } from "@/shared/hooks/useAuth";
import { serviceApi } from '@/shared/services/serviceApi';
import ServiceForm from '../components/ServiceForm';
import ServiceDetailModal from '../components/ServiceDetailModal';
import StepLessonServiceModal from '../components/StepLessonServiceModal';
import LessonPackageManager from '../components/LessonPackageManager';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

import MultiCurrencyPriceDisplay from '@/shared/components/ui/MultiCurrencyPriceDisplay';

// Removed page title; no Typography components needed

function LessonServices() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { formatCurrency, businessCurrency } = useCurrency();
  
  // Check if user has permission to delete services
  const canDeleteServices = user?.role === 'admin' || user?.role === 'manager';
  const [services, setServices] = useState([]);
  const [_accommodationServices, setAccommodationServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [_availableCategories, setAvailableCategories] = useState([]);
  const [lessonCategories, setLessonCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [disciplineTab, setDisciplineTab] = useState('all');
  
  const [formDrawerVisible, setFormDrawerVisible] = useState(false);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [packageManagerVisible, setPackageManagerVisible] = useState(false);
  const [_customers, setCustomers] = useState([]);

  // Load lesson services on component mount
  useEffect(() => {
    loadServices();
  }, []);

  // Note: Services page should NOT listen to booking updates
  // Services show base prices, not individual booking modifications

  // Function to load/reload services
  const loadServices = async () => {
    try {
      setLoading(true);
      const [servicesData, customersData, categoriesData] = await Promise.all([
        serviceApi.getServices(),
        // In real app, this would be customerApi.getCustomers()
        Promise.resolve([
          { id: 'customer-1', name: 'John Doe', email: 'john@example.com' },
          { id: 'customer-2', name: 'Sarah Smith', email: 'sarah@example.com' },
          { id: 'customer-3', name: 'Mike Johnson', email: 'mike@example.com' }
        ]),
        serviceApi.getFullServiceCategories()
      ]);
      
      // Get lesson-related categories from centralized Categories
      const lessonCats = categoriesData.filter(cat => 
        cat.status === 'active' && (
          cat.type === 'lessons' || 
          cat.name.toLowerCase().includes('lesson')
        )
      );
      setLessonCategories(lessonCats);
      setAvailableCategories(categoriesData);
      
      // Get category names for filtering services
      const lessonCategoryNames = lessonCats.map(cat => cat.name.toLowerCase());
      
      // Filter lesson and accommodation services
      const lessonServices = servicesData.filter(service => {
        const category = service.category?.toLowerCase();
        const serviceType = (service.serviceType || service.service_type || '').toLowerCase();

        const matchesLessonCategory =
          lessonCategoryNames.includes(category) ||
          category === 'lesson' ||
          category === 'lessons' ||
          category === 'kitesurfing' ||
          category === 'wingfoil';

        const matchesLessonType = ['lesson', 'private', 'group', 'semi-private'].includes(serviceType);

        const isRental = category === 'rental' || category === 'rentals' || serviceType === 'rental';

        return (matchesLessonCategory || matchesLessonType) && !isRental;
      });
      const accommodationServices = servicesData.filter(service => 
        service.category === 'accommodation'
      );
      
      setServices(lessonServices);
      setAccommodationServices(accommodationServices);
      setCustomers(customersData);
      setError(null);
  } catch {
  setError('Failed to load lesson services. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Filter services when search changes
  useEffect(() => {
    let result = [...services];

    const normalizeDiscipline = (value) => {
      const v = String(value || '').toLowerCase().trim();
      if (!v) return '';
      if (v === 'foil') return 'kite_foil';
      if (v === 'e-foil' || v === 'e_foil') return 'efoil';
      return v;
    };

    const getSearchText = (service) => (
      `${service.name || ''} ${service.description || ''} ${service.lessonCategoryTag || ''} ${service.levelTag || ''} ${service.serviceType || ''}`
    ).toLowerCase();

    const getBaseDiscipline = (service) => {
      const explicit = normalizeDiscipline(service.disciplineTag);
      if (explicit && explicit !== 'premium') return explicit;

      const text = getSearchText(service);
      if (text.includes('e-foil') || text.includes('efoil')) return 'efoil';
      if (text.includes('wing')) return 'wing';
      if (text.includes('kite foil') || text.includes('foil')) return 'kite_foil';
      if (text.includes('kite')) return 'kite';
      return explicit || 'untagged';
    };

    const isPremiumService = (service) => {
      const explicit = normalizeDiscipline(service.disciplineTag);
      if (explicit === 'premium') return true;
      const text = getSearchText(service);
      return text.includes('premium');
    };

    const matchesDisciplineTab = (service, tab) => {
      if (tab === 'all') return true;
      if (tab === 'premium') return isPremiumService(service);
      if (tab === 'untagged') return getBaseDiscipline(service) === 'untagged' && !isPremiumService(service);
      return getBaseDiscipline(service) === tab;
    };

    // Apply discipline tab filter
    if (disciplineTab !== 'all') {
      result = result.filter((service) => matchesDisciplineTab(service, disciplineTab));
    }
    
    // Apply search filter
    if (searchText) {
      result = result.filter(service =>
        service.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchText.toLowerCase()) ||
        service.instructor?.toLowerCase().includes(searchText.toLowerCase()) ||
        service.level?.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    
    setFilteredServices(result);
  }, [services, searchText, disciplineTab]);

  const getServiceDiscipline = (service) => {
    const normalizeDiscipline = (value) => {
      const v = String(value || '').toLowerCase().trim();
      if (!v) return '';
      if (v === 'foil') return 'kite_foil';
      if (v === 'e-foil' || v === 'e_foil') return 'efoil';
      return v;
    };

    const explicit = normalizeDiscipline(service.disciplineTag);
    if (explicit && explicit !== 'premium') return explicit;

    const text = `${service.name || ''} ${service.description || ''}`.toLowerCase();
    if (text.includes('e-foil') || text.includes('efoil')) return 'efoil';
    if (text.includes('wing')) return 'wing';
    if (text.includes('kite foil') || text.includes('foil')) return 'kite_foil';
    if (text.includes('kite')) return 'kite';
    return explicit || 'untagged';
  };

  const getTabCount = (key) => {
    if (key === 'all') return services.length;

    const textFor = (service) => (
      `${service.name || ''} ${service.description || ''} ${service.lessonCategoryTag || ''} ${service.levelTag || ''} ${service.serviceType || ''}`
    ).toLowerCase();
    const isPremium = (service) => {
      const explicit = String(service.disciplineTag || '').toLowerCase().trim();
      return explicit === 'premium' || textFor(service).includes('premium');
    };

    if (key === 'premium') return services.filter(isPremium).length;
    if (key === 'untagged') return services.filter((service) => getServiceDiscipline(service) === 'untagged' && !isPremium(service)).length;

    return services.filter((service) => getServiceDiscipline(service) === key).length;
  };

  const handleServiceCreated = async (newService) => {
    // Check if it's a lesson service or has lesson-related category
    const isLessonService = newService.category === 'lesson' || 
      lessonCategories.some(cat => cat.name.toLowerCase() === newService.category?.toLowerCase());
    
    if (isLessonService) {
      setServices(prev => [...prev, newService]);
      message.success('Lesson service created successfully!');
    }
    setFormDrawerVisible(false);
  };

  const handleServiceUpdated = async (updatedService) => {
    setServices(prev => prev.map(service => 
      service.id === updatedService.id ? updatedService : service
    ));
    setFormDrawerVisible(false);
    setEditMode(false);
    setSelectedService(null);
    message.success('Lesson service updated successfully!');
  };

  // Handle service refresh after booking updates
  const handleServiceRefresh = async () => {
    await loadServices();
  };

  const handleServiceDeleted = (serviceId) => {
    setServices(prev => prev.filter(service => service.id !== serviceId));
    setDetailModalVisible(false);
    setSelectedService(null);
  };

  const handleEdit = (service) => {
    setSelectedService(service);
    setEditMode(true);
    setFormDrawerVisible(true);
  };

  const handleView = (service) => {
    setSelectedService(service);
    setDetailModalVisible(true);
  };

  const handleDelete = async (service) => {
    // Show confirmation dialog
    Modal.confirm({
      title: 'Delete Service',
      content: `Are you sure you want to delete "${service.name}"? This action cannot be undone.`,
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await serviceApi.deleteService(service.id);
          handleServiceDeleted(service.id);
          message.success('Service deleted successfully!');
        } catch (error) {
          // swallow log; user notified via message
          if (error.response?.status === 403) {
            message.error('You do not have permission to delete services. Only administrators and managers can delete services.');
          } else {
            message.error('Failed to delete service. Please try again.');
          }
        }
      }
    });
  };

  // Helper functions for session display
  const getSessionInitials = (name) => {
    if (!name) return 'LS';
    const words = name.split(' ');
    if (words.length >= 2) {
      return words[0][0].toUpperCase() + words[1][0].toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getSessionColor = (name) => {
    const colors = {
      'Private': 'bg-pink-500',
      'Wing': 'bg-yellow-500', 
      'Semi': 'bg-gray-500',
      'Self': 'bg-cyan-500',
      'FREELANCE': 'bg-green-500',
      'Foil': 'bg-yellow-600',
      'Supervisions': 'bg-red-500',
      'Boat': 'bg-purple-500',
    };
    
    for (const [key, color] of Object.entries(colors)) {
      if (name?.includes(key)) return color;
    }
    return 'bg-blue-500';
  };

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton active />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Toolbar: view toggle + search (left), actions (right) */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val)}
            options={[
              { label: 'Cards', value: 'cards', icon: <AppstoreOutlined /> },
              { label: 'Table', value: 'table', icon: <TableOutlined /> }
            ]}
          />
          <Input
            placeholder="Search Sessions..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full sm:max-w-md"
            size="large"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <Button 
            icon={<ClockCircleOutlined />}
            onClick={() => setPackageManagerVisible(true)}
            size="large"
            className="w-full sm:w-auto"
          >
            Lesson Packages
          </Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => setLessonModalOpen(true)}
            size="large"
            className="w-full sm:w-auto"
          >
            Add Session
          </Button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-2">
        <Tabs
          activeKey={disciplineTab}
          onChange={setDisciplineTab}
          items={[
            { key: 'all', label: `All (${getTabCount('all')})` },
            { key: 'kite', label: `Kite (${getTabCount('kite')})` },
            { key: 'wing', label: `Wing (${getTabCount('wing')})` },
            { key: 'kite_foil', label: `Kite Foil (${getTabCount('kite_foil')})` },
            { key: 'efoil', label: `E-Foil (${getTabCount('efoil')})` },
            { key: 'premium', label: `Premium (${getTabCount('premium')})` },
            { key: 'untagged', label: `Untagged (${getTabCount('untagged')})` },
          ]}
        />
      </div>

      {/* Categories Info Alert */}
      {lessonCategories.length === 0 && !loading && (
        <Alert
          message="No Lesson Categories Found"
          description={
            <div>
              No active lesson categories are configured. 
              <Button 
                type="link" 
                size="small" 
                icon={<SettingOutlined />}
                onClick={() => window.open('/services/categories', '_blank')}
              >
                Set up categories
              </Button>
              to organize your lesson services.
            </div>
          }
          type="warning"
          showIcon
          className="mb-4"
        />
      )}

  {/* Search row merged into toolbar above */}

      {/* Error Display */}
      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* Services - Card or Table view */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredServices.length === 0 ? (
            <div className="col-span-full">
              <Empty 
                description="No lesson sessions found"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => setLessonModalOpen(true)}
                >
                  Add First Session
                </Button>
              </Empty>
            </div>
          ) : (
            filteredServices.map((service) => {
              const capacity = service.max_participants || service.maxParticipants || 1;
              const isPrivate = capacity === 1;
              
              return (
                <Card
                  key={service.id}
                  className="shadow-sm hover:shadow-md transition-shadow"
                  styles={{ body: { padding: '16px' } }}
                  actions={[
                    <Button
                      key="view"
                      type="text"
                      icon={<EyeOutlined />}
                      onClick={() => handleView(service)}
                      title="View Details"
                    />,
                    <Button
                      key="edit"
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(service)}
                      title="Edit"
                    />,
                    ...(canDeleteServices ? [
                      <Button
                        key="delete"
                        type="text"
                        icon={<DeleteOutlined />}
                        danger
                        onClick={() => handleDelete(service)}
                        title="Delete"
                      />
                    ] : [])
                  ]}
                >
                  <div className="space-y-3">
                    {/* Header with icon and title */}
                    <div className="flex items-center">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 text-white font-semibold text-sm ${getSessionColor(service.name)}`}>
                        {getSessionInitials(service.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-base truncate">{service.name}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Tag color="green">{service.category || 'Lesson'}</Tag>
                          <Tag 
                            color={isPrivate ? 'purple' : 'blue'} 
                            icon={isPrivate ? <UserOutlined /> : <UsergroupAddOutlined />}
                          >
                            {isPrivate ? 'Private' : 'Group'}
                          </Tag>
                          {service.disciplineTag && (
                            <Tag color="orange">
                              {service.disciplineTag === 'kite' ? '🪁 Kite' :
                               service.disciplineTag === 'wing' ? '🦅 Wing' :
                               service.disciplineTag === 'kite_foil' ? '🏄 Foil' :
                               service.disciplineTag === 'efoil' ? '⚡ E-Foil' :
                               service.disciplineTag}
                            </Tag>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {service.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {service.description}
                      </p>
                    )}

                    {/* Details */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">
                        Max: {capacity} participant{capacity !== 1 ? 's' : ''}
                      </span>
                      <span className="font-semibold text-lg">
                        <MultiCurrencyPriceDisplay 
                          prices={service.prices}
                          price={service.price}
                          currency={service.currency || businessCurrency || 'EUR'}
                          size="default"
                        />
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <UnifiedTable density="comfortable">
          <Table
          rowKey={(row) => row.id}
          dataSource={filteredServices}
          pagination={{ pageSize: 10 }}
          scroll={{ x: true }}
          columns={[
            {
              title: 'Name',
              dataIndex: 'name',
              key: 'name',
              render: (text, record) => (
                <div className="flex items-center">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center mr-2 text-white font-semibold text-xs ${getSessionColor(record.name)}`}>
                    {getSessionInitials(record.name)}
                  </div>
                  <span className="font-medium">{text}</span>
                </div>
              )
            },
            {
              title: 'Category',
              dataIndex: 'category',
              key: 'category',
              render: (cat) => <Tag color="green">{cat || 'Lesson'}</Tag>
            },
            {
              title: 'Discipline',
              dataIndex: 'disciplineTag',
              key: 'discipline',
              render: (tag) => tag ? (
                <Tag color="orange">
                  {tag === 'kite' ? '🪁 Kite' :
                   tag === 'wing' ? '🦅 Wing' :
                   tag === 'kite_foil' ? '🏄 Foil' :
                   tag === 'efoil' ? '⚡ E-Foil' : tag}
                </Tag>
              ) : <span className="text-gray-400">—</span>
            },
            {
              title: 'Type',
              key: 'type',
              render: (_, record) => {
                const capacity = record.max_participants || record.maxParticipants || 1;
                const isPrivate = capacity === 1;
                return (
                  <Tag color={isPrivate ? 'purple' : 'blue'} icon={isPrivate ? <UserOutlined /> : <UsergroupAddOutlined />}> 
                    {isPrivate ? 'Private' : 'Group'}
                  </Tag>
                );
              }
            },
            {
              title: 'Max Participants',
              key: 'max',
              render: (_, record) => record.max_participants || record.maxParticipants || 1
            },
            {
              title: 'Price',
              key: 'price',
              render: (_, record) => (
                <MultiCurrencyPriceDisplay 
                  prices={record.prices}
                  price={record.price}
                  currency={record.currency || businessCurrency || 'EUR'}
                />
              )
            },
            {
              title: 'Actions',
              key: 'actions',
              fixed: 'right',
              render: (_, record) => (
                <div className="flex gap-1">
                  <Button type="text" icon={<EyeOutlined />} onClick={() => handleView(record)} title="View" />
                  <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Edit" />
                  {canDeleteServices && (
                    <Button type="text" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record)} title="Delete" />
                  )}
                </div>
              )
            }
          ]}
          locale={{
            emptyText: (
              <Empty description="No lesson sessions found" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setLessonModalOpen(true)}>
                  Add First Session
                </Button>
              </Empty>
            )
          }}
          />
        </UnifiedTable>
      )}

      {/* Service Form Drawer (Edit only) */}
      <Drawer
        title={editMode ? "Edit Lesson" : "Add New Lesson"}
        width={600}
        onClose={() => {
          setFormDrawerVisible(false);
          setEditMode(false);
          setSelectedService(null);
        }}
        open={formDrawerVisible}
        styles={{ body: { paddingBottom: 80 } }}
      >
        <ServiceForm
          initialValues={editMode ? selectedService : {}}
          isEditing={editMode}
          defaultCategory={lessonCategories.length > 0 ? lessonCategories[0].name.toLowerCase() : "lesson"}
          onSubmit={editMode ? handleServiceUpdated : handleServiceCreated}
        />
      </Drawer>

      {/* Step-based Lesson Creator */}
      <StepLessonServiceModal
        open={lessonModalOpen}
        onClose={() => setLessonModalOpen(false)}
        onCreated={(created) => {
          handleServiceCreated(created);
          setLessonModalOpen(false);
        }}
      />

      {/* Service Detail Modal */}
      <ServiceDetailModal
        service={selectedService}
        open={detailModalVisible}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedService(null);
        }}
        onEdit={handleEdit}
        onDelete={handleServiceDeleted}
        onServiceUpdate={handleServiceRefresh}
      />

      {/* Lesson Package Manager */}
      <LessonPackageManager
        visible={packageManagerVisible}
        onClose={() => setPackageManagerVisible(false)}
        lessonServices={services}
      />
    </div>
  );
}

export default LessonServices;
