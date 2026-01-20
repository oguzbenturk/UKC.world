import React, { useState, useEffect } from 'react';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { 
  Button, 
  Input, 
  Empty, 
  Drawer,
  Card,
  Table,
  Alert,
  Skeleton,
  Tag,
  Space,
  Typography,
  Dropdown,
  Modal
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  PlusOutlined, 
  SearchOutlined,
  ToolOutlined,
  MoreOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useAuth } from "@/shared/hooks/useAuth";
import { serviceApi } from '@/shared/services/serviceApi';
import ServiceForm from '../components/ServiceForm';
import ServiceDetailModal from '../components/ServiceDetailModal';

const { Title } = Typography;

function RentalServices() {
  const { formatCurrency, businessCurrency } = useCurrency();
  const { user } = useAuth();
  
  // Check if user has permission to delete services
  const canDeleteServices = user?.role === 'admin' || user?.role === 'manager';
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [rentalCategories, setRentalCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  const [formDrawerVisible, setFormDrawerVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Load rental services on component mount
  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoading(true);
        const [servicesData, categoriesData] = await Promise.all([
          serviceApi.getServices(),
          serviceApi.getFullServiceCategories()
        ]);
        
        // Get rental-related categories from centralized Categories
        const rentalCats = categoriesData.filter(cat => 
          cat.status === 'active' && (
            cat.type === 'rental' || 
            cat.name.toLowerCase().includes('rental') ||
            cat.name.toLowerCase().includes('equipment')
          )
        );
        setRentalCategories(rentalCats);
        setAvailableCategories(categoriesData);
        
        // Get category names for filtering services
        const rentalCategoryNames = rentalCats.map(cat => cat.name.toLowerCase());
        
        // Filter rental services
        const rentalServices = servicesData.filter(service => 
          rentalCategoryNames.includes(service.category?.toLowerCase()) ||
          service.category === 'rental' // fallback for old data
        );
        
        setServices(rentalServices);
        setError(null);
      } catch (err) {
        setError('Failed to load rental services. Please try again later.');
        console.error('Services API error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadServices();
  }, []);

  // Filter services when search changes
  useEffect(() => {
    let result = [...services];
    
    // Apply search filter
    if (searchText) {
      result = result.filter(service =>
        service.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchText.toLowerCase()) ||
        service.brand?.toLowerCase().includes(searchText.toLowerCase()) ||
        service.category?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      result = result.filter(service => {
        const serviceName = service.name?.toLowerCase() || '';
        const serviceDesc = service.description?.toLowerCase() || '';
        const searchText = serviceName + ' ' + serviceDesc;
        
        switch(categoryFilter) {
          case 'kites':
            return searchText.includes('kite') && !searchText.includes('dlab') && !searchText.includes('sls');
          case 'dlab-kites':
            return searchText.includes('dlab');
          case 'sls-kites':
            return searchText.includes('sls');
          case 'boards':
            return searchText.includes('board') || searchText.includes('twintip') || searchText.includes('directional');
          case 'accessories':
            return searchText.includes('harness') || searchText.includes('helmet') || 
                   searchText.includes('wetsuit') || searchText.includes('accessory') ||
                   searchText.includes('pump') || searchText.includes('bag');
          default:
            return true;
        }
      });
    }
    
    setFilteredServices(result);
  }, [services, searchText, categoryFilter]);

  const handleServiceCreated = async (newService) => {
    if (newService.category === 'rental') {
      setServices(prev => [...prev, newService]);
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
      title: 'Delete Rental Service',
      content: `Are you sure you want to delete "${service.name}"? This action cannot be undone.`,
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await serviceApi.deleteService(service.id);
          handleServiceDeleted(service.id);
          message.success('Rental service deleted successfully!');
        } catch (error) {
          console.error('Error deleting service:', error);
          if (error.response?.status === 403) {
            message.error('You do not have permission to delete services. Only administrators and managers can delete services.');
          } else {
            message.error('Failed to delete service. Please try again.');
          }
        }
      }
    });
  };

  // Table columns configuration
  const columns = [
    {
      title: 'Equipment',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div className="flex items-center">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 text-white font-semibold text-sm ${getEquipmentColor(record.name)}`}>
            {getEquipmentInitials(record.name)}
          </div>
          <div>
            <div className="font-medium">{text}</div>
            <div className="text-sm text-gray-500">{record.description}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (category) => {
        const color = getCategoryColor(category);
        return <Tag color={color}>{category?.charAt(0).toUpperCase() + category?.slice(1)}</Tag>;
      },
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
      render: (brand) => brand || '-',
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
      render: (duration, record) => {
        if (record.duration_type === 'hourly') {
          return `${duration} hour${duration !== 1 ? 's' : ''}`;
        }
        return `${duration} day${duration !== 1 ? 's' : ''}`;
      },
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (price, record) => (
        <span className="font-medium">
          {formatCurrency(Number(price || 0), record.currency || businessCurrency || 'EUR')} <span className="text-gray-500">/ {record.duration_type === 'hourly' ? 'hour' : 'day'}</span>
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              {
                key: 'view',
                icon: <EyeOutlined />,
                label: 'View Details',
                onClick: () => handleView(record),
              },
              {
                key: 'edit',
                icon: <EditOutlined />,
                label: 'Edit',
                onClick: () => handleEdit(record),
              },
              ...(canDeleteServices ? [{
                key: 'delete',
                icon: <DeleteOutlined />,
                label: 'Delete',
                onClick: () => handleDelete(record),
                danger: true,
              }] : []),
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  // Helper functions for equipment display
  const getEquipmentInitials = (name) => {
    if (!name) return 'EQ';
    const words = name.split(' ');
    if (words.length >= 2) {
      return words[0][0].toUpperCase() + words[1][0].toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getEquipmentColor = (name) => {
    const colors = {
      'Kite': 'bg-blue-500',
      'Board': 'bg-green-500', 
      'Harness': 'bg-purple-500',
      'Wetsuit': 'bg-cyan-500',
      'Helmet': 'bg-yellow-500',
      'DLAB': 'bg-red-500',
      'SLS': 'bg-orange-500',
      'Pump': 'bg-gray-500',
      'Bag': 'bg-indigo-500',
    };
    
    for (const [key, color] of Object.entries(colors)) {
      if (name?.includes(key)) return color;
    }
    return 'bg-blue-500';
  };

  const getCategoryColor = (category) => {
    const colors = {
      'rental': 'blue',
      'kite': 'red',
      'board': 'green',
      'accessory': 'purple',
      'equipment': 'orange',
    };
    return colors[category?.toLowerCase()] || 'blue';
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Title level={2} className="!mb-1">Rentals</Title>
          <p className="text-gray-600">
            Manage kitesurfing equipment rentals and inventory
            {rentalCategories.length > 0 && (
              <span> • Using categories: {rentalCategories.map(cat => cat.name).join(', ')}</span>
            )}
          </p>
        </div>
        <Space size="middle">
          <Button 
            icon={<SettingOutlined />}
            onClick={() => window.open('/services/categories', '_blank')}
            title="Manage rental categories"
          >
            Manage Categories
          </Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => setFormDrawerVisible(true)}
            size="large"
          >
            Add Rental Service
          </Button>
        </Space>
      </div>

      {/* Categories Info Alert */}
      {rentalCategories.length === 0 && !loading && (
        <Alert
          message="No Rental Categories Found"
          description={
            <div>
              No active rental categories are configured. 
              <Button 
                type="link" 
                size="small" 
                icon={<SettingOutlined />}
                onClick={() => window.open('/services/categories', '_blank')}
              >
                Set up categories
              </Button>
              to organize your rental services.
            </div>
          }
          type="warning"
          showIcon
          className="mb-4"
        />
      )}

      {/* Search and Filters */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Input
            placeholder="Search Equipment..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="max-w-md"
            size="large"
          />
          
          {/* Category Filter */}
          <Space.Compact size="large">
            <Button 
              type={categoryFilter === 'all' ? 'primary' : 'default'}
              onClick={() => setCategoryFilter('all')}
            >
              All
            </Button>
            <Button 
              type={categoryFilter === 'kites' ? 'primary' : 'default'}
              onClick={() => setCategoryFilter('kites')}
            >
              Kites
            </Button>
            <Button 
              type={categoryFilter === 'dlab-kites' ? 'primary' : 'default'}
              onClick={() => setCategoryFilter('dlab-kites')}
            >
              DLAB-Kites
            </Button>
            <Button 
              type={categoryFilter === 'sls-kites' ? 'primary' : 'default'}
              onClick={() => setCategoryFilter('sls-kites')}
            >
              SLS Kites
            </Button>
            <Button 
              type={categoryFilter === 'boards' ? 'primary' : 'default'}
              onClick={() => setCategoryFilter('boards')}
            >
              Boards
            </Button>
            <Button 
              type={categoryFilter === 'accessories' ? 'primary' : 'default'}
              onClick={() => setCategoryFilter('accessories')}
            >
              Accessories
            </Button>
          </Space.Compact>
        </div>
        
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => setFormDrawerVisible(true)}
        >
          Add Rental Service
        </Button>
      </div>

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

      {/* Table */}
      <Card className="shadow-sm">
        <Table
          columns={columns}
          dataSource={filteredServices.map(service => ({
            ...service,
            key: service.id
          }))}
          pagination={{
            total: filteredServices.length,
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} rental services`,
          }}
          loading={loading}
          locale={{
            emptyText: (
              <Empty 
                description="No rental services found"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => setFormDrawerVisible(true)}
                >
                  Add First Rental Service
                </Button>
              </Empty>
            )
          }}
        />
      </Card>

      {/* Service Form Drawer */}
      <Drawer
        title={editMode ? "Edit Rental Service" : "Add New Rental Service"}
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
          defaultCategory={rentalCategories.length > 0 ? rentalCategories[0].name.toLowerCase() : "rental"}
          onSubmit={editMode ? handleServiceUpdated : handleServiceCreated}
        />
      </Drawer>

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
      />
    </div>
  );
}

export default RentalServices;
