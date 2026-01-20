import React, { useState, useEffect } from 'react';
import { 
  Button, 
  Input, 
  Empty, 
  Drawer,
  Card,
  Row,
  Col,
  Statistic,
  Alert,
  Skeleton
} from 'antd';
import { 
  PlusOutlined, 
  SearchOutlined,
  AppstoreOutlined,
  DollarOutlined
} from '@ant-design/icons';
import { useAuth } from "@/shared/hooks/useAuth";
import { serviceApi } from '@/shared/services/serviceApi';
import ServiceCard from '../components/ServiceCard';
import ServiceForm from '../components/ServiceForm';
import ServiceDetailModal from '../components/ServiceDetailModal';

function AllServices() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState(null);
  
  const [formDrawerVisible, setFormDrawerVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Load services on component mount
  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoading(true);
        const servicesData = await serviceApi.getServices();
        setServices(servicesData);
        setError(null);
      } catch (err) {
        setError('Failed to load services. Please try again later.');
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
        service.category?.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    
    setFilteredServices(result);
  }, [services, searchText]);

  const handleServiceCreated = (newService) => {
    setServices(prev => [...prev, newService]);
    setFormDrawerVisible(false);
  };

  const handleServiceUpdated = (updatedService) => {
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

  const totalRevenue = services.reduce((sum, service) => sum + (service.price || 0), 0);

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton active />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <AppstoreOutlined className="text-blue-500" />
            All Services
          </h1>
          <p className="text-gray-600 mt-1">Manage all available services across categories</p>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => setFormDrawerVisible(true)}
          size="large"
        >
          Add Service
        </Button>
      </div>

      {/* Stats Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Services"
              value={services.length}
              prefix={<AppstoreOutlined />}
              valueStyle={{ color: 'var(--brand-primary)' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Value"
              value={totalRevenue}
              prefix={<DollarOutlined />}
              valueStyle={{ color: 'var(--brand-success)' }}
              precision={2}
            />
          </Card>
        </Col>
      </Row>

      {/* Search and Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search services..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1"
            size="large"
          />
        </div>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredServices.length > 0 ? (
          filteredServices.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              onEdit={handleEdit}
              onView={handleView}
            />
          ))
        ) : (
          <div className="col-span-full">
            <Empty 
              description="No services found"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        )}
      </div>

      {/* Service Form Drawer */}
      <Drawer
        title={editMode ? "Edit Service" : "Add New Service"}
        width={600}
        onClose={() => {
          setFormDrawerVisible(false);
          setEditMode(false);
          setSelectedService(null);
        }}
        open={formDrawerVisible}
        bodyStyle={{ paddingBottom: 80 }}
      >
        <ServiceForm
          service={editMode ? selectedService : null}
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

export default AllServices;
