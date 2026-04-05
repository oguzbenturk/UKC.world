import { useState, useEffect, useMemo } from 'react';
import { 
  Button, 
  Drawer,
  Card,
  Row,
  Col,
  Statistic,
  Alert,
  Skeleton,
  Select
} from 'antd';
import { 
  PlusOutlined, 
  HomeOutlined,
  DollarOutlined,
  UserOutlined,
  CalendarOutlined,
  StarOutlined
} from '@ant-design/icons';
import { serviceApi } from '@/shared/services/serviceApi';
import { logger } from '@/shared/utils/logger';
import ServiceForm from '../components/ServiceForm';
import ServiceDetailModal from '../components/ServiceDetailModal';
import AccommodationSearchBar from '../components/accommodation/AccommodationSearchBar';
import FiltersPanel from '../components/accommodation/FiltersPanel';
import PropertyCard from '../components/accommodation/PropertyCard';
import PropertyDetailModal from '../components/accommodation/PropertyDetailModal';
import RoomRateSelectorDrawer from '../components/accommodation/RoomRateSelectorDrawer';

function AccommodationServices() {
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText] = useState('');
  const [error, setError] = useState(null);
  const [query, setQuery] = useState(null);
  const [filters, setFilters] = useState({ price: [0, 500], rating: 0, amenities: [] });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortMode, setSortMode] = useState('recommended');
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  
  const [formDrawerVisible, setFormDrawerVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Load accommodation services on component mount
  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoading(true);
        const servicesData = await serviceApi.getServices();
        // Filter only accommodation services
        const accommodationServices = servicesData.filter(service => 
          service.category === 'accommodation'
        );
        setServices(accommodationServices);
        setError(null);
      } catch (err) {
        setError('Failed to load accommodation services. Please try again later.');
        logger.error('Services API error', { error: String(err) });
      } finally {
        setLoading(false);
      }
    };
    
    loadServices();
  }, []);

  // Nights derived from selected date range
  const nights = useMemo(() => {
    const [start, end] = query?.dates || [];
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const ms = endDate.setHours(0, 0, 0, 0) - startDate.setHours(0, 0, 0, 0);
    return ms > 0 ? Math.ceil(ms / (1000 * 60 * 60 * 24)) : 0;
  }, [query?.dates]);

  // Filter services when search or filters change
  useEffect(() => {
    let result = [...services];
    // Text search
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(service =>
        service.name?.toLowerCase().includes(q) ||
        service.description?.toLowerCase().includes(q) ||
        service.location?.toLowerCase().includes(q)
      );
    }
    // Price filter
    if (filters?.price) {
      const [min, max] = filters.price;
      result = result.filter(s => {
        const price = parseFloat(s.price) || 0;
        return price >= min && price <= max;
      });
    }
    // Rating filter
    if (filters?.rating) {
      result = result.filter(s => (s.rating || 0) >= filters.rating);
    }
    // Amenities filter (require all selected)
    if (filters?.amenities?.length) {
      const req = new Set(filters.amenities);
      result = result.filter(s => {
        const feats = new Set(s.features || []);
        for (const a of req) if (!feats.has(a)) return false;
        return true;
      });
    }
    setFilteredServices(result);
  }, [services, searchText, filters]);

  const handleServiceCreated = (newService) => {
    if (newService.category === 'accommodation') {
      setServices(prev => [...prev, newService]);
    }
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

  // Legacy handleView removed; new flow opens PropertyDetailModal via PropertyCard

  const averagePrice = services.length > 0 
    ? services.reduce((sum, service) => {
        const price = parseFloat(service.price) || 0;
        return sum + price;
      }, 0) / services.length 
    : 0;

  const totalCapacity = services.reduce((sum, service) => {
    const capacity = parseInt(service.capacity) || 0;
    return sum + capacity;
  }, 0);

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton active />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Hero + Search */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <HomeOutlined className="text-orange-500" />
            Accommodation
          </h1>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => setFormDrawerVisible(true)}
          size="large"
          style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
        >
          Add Accommodation
        </Button>
      </div>

      <AccommodationSearchBar onChange={setQuery} onSubmit={setQuery} />

  {/* Stats Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="border-l-4 border-orange-400">
            <Statistic
              title="Total Properties"
              value={services.length}
              prefix={<HomeOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="border-l-4 border-green-400">
            <Statistic
              title="Average Price"
              value={averagePrice}
              prefix={<DollarOutlined />}
              valueStyle={{ color: 'var(--brand-success)' }}
              precision={2}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="border-l-4 border-blue-400">
            <Statistic
              title="Total Capacity"
              value={totalCapacity}
              prefix={<UserOutlined />}
              valueStyle={{ color: 'var(--brand-primary)' }}
              suffix="guests"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="border-l-4 border-purple-400">
            <Statistic
              title="Average Rating"
              value={4.2}
              prefix={<StarOutlined />}
              valueStyle={{ color: '#722ed1' }}
              precision={1}
              suffix="/ 5"
            />
          </Card>
        </Col>
      </Row>

      {/* Filters + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 hidden lg:block">
          <FiltersPanel value={filters} onChange={setFilters} />
        </div>
        <div className="lg:col-span-3 space-y-4">
          <Card className="shadow-sm border-0 rounded-xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-gray-700 text-sm">
                <span className="font-medium">{filteredServices.length}</span> properties {query?.dates ? `· ${query.dates[0]?.format('MMM D')} - ${query.dates[1]?.format('MMM D')}` : ''}
              </div>
              <div className="flex items-center gap-2">
                <div className="lg:hidden">
                  <Button onClick={() => setMobileFiltersOpen(true)}>Filters</Button>
                </div>
                <Select
                  size="middle"
                  value={sortMode}
                  onChange={setSortMode}
                  options={[
                    { value: 'recommended', label: 'Recommended' },
                    { value: 'price-asc', label: 'Price: Low to High' },
                    { value: 'price-desc', label: 'Price: High to Low' },
                    { value: 'rating-desc', label: 'Rating: High to Low' },
                  ]}
                  style={{ width: 200 }}
                />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...filteredServices]
              .sort((a, b) => {
                if (sortMode === 'price-asc') return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0);
                if (sortMode === 'price-desc') return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
                if (sortMode === 'rating-desc') return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
                return 0;
              })
              .map((service) => {
              const nightly = parseFloat(service.price) || 0;
              const total = nights > 0 ? nightly * nights : undefined;
              return (
                <PropertyCard
                  key={service.id}
                  property={{
                    id: service.id,
                    name: service.name,
                    images: service.images || [],
                    rating: service.rating || 4,
                    fromPrice: nightly,
                    location: service.location || service.city || '',
                    badges: service.features || undefined,
                    nights,
                    total,
                  }}
                  onView={() => {
                    setSelectedProperty({
                      id: service.id,
                      name: service.name,
                      images: service.images || [],
                      rating: service.rating || 4,
                      fromPrice: nightly,
                      location: service.location || service.city || '',
                      badges: service.features || undefined,
                      features: service.features || undefined,
                    });
                  }}
                />
              );
            })}
            {filteredServices.length === 0 && !loading && (
              <Card className="text-center py-16">No properties match your filters.</Card>
            )}
          </div>
        </div>
      </div>

      <FiltersPanel mobile open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} value={filters} onChange={setFilters} />

      <PropertyDetailModal
        open={!!selectedProperty}
        property={selectedProperty}
        onClose={() => setSelectedProperty(null)}
        onSelectRooms={() => {
          setRoomsOpen(true);
        }}
      />
      <RoomRateSelectorDrawer
        open={roomsOpen}
        onClose={() => setRoomsOpen(false)}
        property={selectedProperty}
        dates={query?.dates}
      />

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

      {/* Accommodation Features */}
      <Card title="Accommodation Features" className="shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <HomeOutlined className="text-2xl text-orange-500 mb-2" />
            <p className="text-sm font-medium">Beachfront Properties</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <CalendarOutlined className="text-2xl text-blue-500 mb-2" />
            <p className="text-sm font-medium">Flexible Booking</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <StarOutlined className="text-2xl text-green-500 mb-2" />
            <p className="text-sm font-medium">Premium Amenities</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <UserOutlined className="text-2xl text-purple-500 mb-2" />
            <p className="text-sm font-medium">Group Packages</p>
          </div>
        </div>
      </Card>

  {/* Keep legacy grid as fallback via admin CTA above; primary results shown above */}

      {/* Service Form Drawer */}
      <Drawer
        title={editMode ? "Edit Accommodation" : "Add New Accommodation"}
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
          service={editMode ? selectedService : null}
          defaultCategory="accommodation"
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

export default AccommodationServices;
