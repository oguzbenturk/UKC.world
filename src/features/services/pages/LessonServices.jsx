import { useState, useEffect } from 'react';
import { 
  App,
  Button, 
  Input, 
  Empty, 
  Alert,
  Skeleton,
  Tag,
  Modal,
  Table,
  Tooltip
} from 'antd';
import { 
  PlusOutlined, 
  SearchOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  UserOutlined,
  UsergroupAddOutlined
} from '@ant-design/icons';
import { useAuth } from "@/shared/hooks/useAuth";
import { serviceApi } from '@/shared/services/serviceApi';
import ServiceDetailModal from '../components/ServiceDetailModal';
import StepLessonServiceModal from '../components/StepLessonServiceModal';

import { useCurrency } from '@/shared/contexts/CurrencyContext';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import MultiCurrencyPriceDisplay from '@/shared/components/ui/MultiCurrencyPriceDisplay';

const DISCIPLINE_MAP = {
  kite: { label: '🪁 Kite', color: 'blue' },
  wing: { label: '🦅 Wing', color: 'purple' },
  kite_foil: { label: '🏄 Kite Foil', color: 'cyan' },
  efoil: { label: '⚡ E-Foil', color: 'green' },
  premium: { label: '💎 Premium', color: 'gold' },
};

const CATEGORY_MAP = {
  private: { label: 'Private', color: 'purple' },
  'semi-private': { label: 'Semi-Private', color: 'orange' },
  group: { label: 'Group', color: 'blue' },
  supervision: { label: 'Supervision', color: 'red' },
};

function LessonServices() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { businessCurrency } = useCurrency();
  
  const canDeleteServices = user?.role === 'admin' || user?.role === 'manager';
  const [services, setServices] = useState([]);
  const [lessonCategories, setLessonCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState(null);
  
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState(null);


  useEffect(() => { loadServices(); }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      const [servicesData, categoriesData] = await Promise.all([
        serviceApi.getServices(),
        serviceApi.getFullServiceCategories()
      ]);
      
      const lessonCats = categoriesData.filter(cat => 
        cat.status === 'active' && (
          cat.type === 'lessons' || 
          cat.name.toLowerCase().includes('lesson')
        )
      );
      setLessonCategories(lessonCats);
      
      const lessonCategoryNames = lessonCats.map(cat => cat.name.toLowerCase());
      const lessonServices = servicesData.filter(service => {
        const category = service.category?.toLowerCase();
        const serviceType = (service.serviceType || service.service_type || '').toLowerCase();
        const matchesLesson =
          lessonCategoryNames.includes(category) ||
          category === 'lesson' || category === 'lessons' ||
          category === 'kitesurfing' || category === 'wingfoil';
        const matchesType = ['lesson', 'private', 'group', 'semi-private', 'supervision'].includes(serviceType);
        const isRental = category === 'rental' || category === 'rentals' || serviceType === 'rental';
        return (matchesLesson || matchesType) && !isRental;
      });
      
      setServices(lessonServices);
      setError(null);
    } catch {
      setError('Failed to load lesson services. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Derive discipline for a service
  const getDiscipline = (service) => {
    const v = String(service.disciplineTag || '').toLowerCase().trim();
    if (v && v !== 'premium') return v === 'foil' ? 'kite_foil' : v;
    const text = `${service.name || ''} ${service.description || ''}`.toLowerCase();
    if (text.includes('e-foil') || text.includes('efoil')) return 'efoil';
    if (text.includes('wing')) return 'wing';
    if (text.includes('kite foil') || text.includes('foil')) return 'kite_foil';
    if (text.includes('kite')) return 'kite';
    return v || '';
  };

  // Derive lesson category for a service
  const getLessonCategory = (service) => {
    const tag = service.lessonCategoryTag || service.lesson_category_tag || '';
    if (tag) return tag;
    const capacity = service.max_participants || service.maxParticipants || 1;
    return capacity === 1 ? 'private' : capacity <= 3 ? 'semi-private' : 'group';
  };

  // Filtered data
  const filteredServices = searchText
    ? services.filter(s =>
        s.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchText.toLowerCase())
      )
    : services;

  // Build unique filter options from actual data
  const disciplineFilters = [...new Set(services.map(getDiscipline))].filter(Boolean).map(d => ({
    text: DISCIPLINE_MAP[d]?.label || d,
    value: d,
  }));

  const categoryFilters = [...new Set(services.map(getLessonCategory))].filter(Boolean).map(c => ({
    text: CATEGORY_MAP[c]?.label || c,
    value: c,
  }));

  const handleServiceCreated = (newService) => {
    setServices(prev => [...prev, newService]);
    setLessonModalOpen(false);
    setSelectedService(null);
    message.success('Service created successfully!');
  };

  const handleServiceUpdated = (updatedService) => {
    setServices(prev => prev.map(s => s.id === updatedService.id ? updatedService : s));
    setLessonModalOpen(false);
    setSelectedService(null);
    message.success('Service updated successfully!');
  };

  const handleEdit = (service) => { setSelectedService(service); setLessonModalOpen(true); };
  const handleView = (service) => { setSelectedService(service); setDetailModalVisible(true); };
  const handleDelete = (service) => {
    Modal.confirm({
      title: 'Delete Service',
      content: `Are you sure you want to delete "${service.name}"?`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await serviceApi.deleteService(service.id);
          setServices(prev => prev.filter(s => s.id !== service.id));
          message.success('Service deleted!');
        } catch (err) {
          message.error(err.response?.status === 403
            ? 'No permission to delete services.'
            : 'Failed to delete service.');
        }
      }
    });
  };

  const columns = [
    {
      title: 'Service Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text) => <span className="font-medium">{text}</span>,
    },
    {
      title: 'Discipline',
      key: 'discipline',
      width: 130,
      render: (_, record) => {
        const d = getDiscipline(record);
        const info = DISCIPLINE_MAP[d];
        return info
          ? <Tag color={info.color}>{info.label}</Tag>
          : <span className="text-gray-400">—</span>;
      },
    },
    {
      title: 'Category',
      key: 'lessonCategory',
      width: 140,
      render: (_, record) => {
        const cat = getLessonCategory(record);
        const info = CATEGORY_MAP[cat];
        return info
          ? <Tag color={info.color}>{info.label}</Tag>
          : <Tag>{cat || '—'}</Tag>;
      },
    },
    {
      title: 'Duration',
      key: 'duration',
      width: 100,
      sorter: (a, b) => (a.duration || 0) - (b.duration || 0),
      render: (_, record) => {
        const d = record.duration;
        return d ? `${d}h` : '—';
      },
    },
    {
      title: 'Capacity',
      key: 'capacity',
      width: 100,
      sorter: (a, b) => (a.max_participants || 1) - (b.max_participants || 1),
      render: (_, record) => {
        const cap = record.max_participants || record.maxParticipants || 1;
        return (
          <Tooltip title={cap === 1 ? 'Private (1-on-1)' : `Up to ${cap} participants`}>
            <Tag icon={cap === 1 ? <UserOutlined /> : <UsergroupAddOutlined />} color={cap === 1 ? 'default' : 'geekblue'}>
              {cap}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Price',
      key: 'price',
      width: 130,
      sorter: (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0),
      render: (_, record) => (
        <MultiCurrencyPriceDisplay 
          prices={record.prices}
          price={record.price}
          currency={record.currency || businessCurrency || 'EUR'}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <div className="flex gap-1">
          <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)} /></Tooltip>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} /></Tooltip>
          {canDeleteServices && (
            <Tooltip title="Delete"><Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record)} /></Tooltip>
          )}
        </div>
      ),
    },
  ];

  if (loading) {
    return <div className="p-6"><Skeleton active /></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <Input
          placeholder="Search services..."
          prefix={<SearchOutlined className="text-gray-400" />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          className="sm:max-w-xs"
          size="large"
        />
        <div className="flex items-center gap-2">
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => { setSelectedService(null); setLessonModalOpen(true); }}
          >
            New Service
          </Button>
        </div>
      </div>

      {error && (
        <Alert message={error} type="error" showIcon closable onClose={() => setError(null)} className="mb-4" />
      )}

      {/* Table */}
      <UnifiedTable density="comfortable">
        <Table
          rowKey="id"
          dataSource={filteredServices}
          columns={columns}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} services` }}
          scroll={{ x: 800 }}
          size="middle"
          locale={{
            emptyText: (
              <Empty description="No lesson services found" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSelectedService(null); setLessonModalOpen(true); }}>
                  New Service
                </Button>
              </Empty>
            )
          }}
        />
      </UnifiedTable>

      {/* Step-based Lesson Creator / Editor */}
      <StepLessonServiceModal
        open={lessonModalOpen}
        onClose={() => { setLessonModalOpen(false); setSelectedService(null); }}
        service={selectedService}
        onCreated={handleServiceCreated}
        onUpdated={handleServiceUpdated}
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
        onDelete={() => {
          setServices(prev => prev.filter(s => s.id !== selectedService?.id));
          setDetailModalVisible(false);
          setSelectedService(null);
        }}
        onServiceUpdate={loadServices}
      />


    </div>
  );
}

export default LessonServices;
