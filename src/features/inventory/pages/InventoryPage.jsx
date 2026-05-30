import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Row,
  Col,
  Statistic,
  Modal,
  Form,
  DatePicker,
  Drawer,
  Descriptions,
  Typography,
  Empty,
  Spin,
  Segmented,
  Tooltip,
  Popconfirm,
  Upload,
  Collapse,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  UploadOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { useData } from '@/shared/hooks/useData';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const equipmentTypes = [
  { value: 'kite', label: 'Kite' },
  { value: 'board', label: 'Board' },
  { value: 'harness', label: 'Harness' },
  { value: 'control bar', label: 'Control Bar' },
  { value: 'wetsuit', label: 'Wetsuit' },
  { value: 'safety gear', label: 'Safety Gear' },
  { value: 'other', label: 'Other' },
];

const brandOptions = [
  { value: 'Core', label: 'Core' },
  { value: 'Duotone', label: 'Duotone' },
  { value: 'Naish', label: 'Naish' },
  { value: 'Cabrinha', label: 'Cabrinha' },
  { value: 'Slingshot', label: 'Slingshot' },
  { value: 'North', label: 'North' },
  { value: 'F-One', label: 'F-One' },
  { value: 'Ozone', label: 'Ozone' },
  { value: 'Ocean Rodeo', label: 'Ocean Rodeo' },
  { value: 'Eleveight', label: 'Eleveight' },
  { value: 'Airush', label: 'Airush' },
  { value: 'Best', label: 'Best' },
  { value: 'Mystic', label: 'Mystic' },
  { value: 'ION', label: 'ION' },
  { value: 'Manera', label: 'Manera' },
  { value: 'Other', label: 'Other' },
];

const conditionOptions = [
  { value: 'new', label: 'New' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];

const STATUS_KEYS = {
  available: 'statusAvailable',
  'in-use': 'statusInUse',
  maintenance: 'statusMaintenance',
  retired: 'statusRetired',
};

const STATUS_COLORS = {
  available: 'success',
  'in-use': 'processing',
  maintenance: 'warning',
  retired: 'default',
};

const getSizeOptions = (type) => {
  switch (type) {
    case 'kite':
      return ['5m', '6m', '7m', '8m', '9m', '10m', '11m', '12m', '13m', '14m', '15m'];
    case 'board':
      return ['132x39', '135x40', '138x41', '141x42', '144x43'];
    case 'harness':
    case 'wetsuit':
      return ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    default:
      return [];
  }
};

const InventoryPage = () => {
  const { t } = useTranslation(['common']);
  const { user } = useAuth();
  const { equipment, loading, error, refreshData } = useData();
  const [viewMode, setViewMode] = useState('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [form] = Form.useForm();

  const getStatusConfig = (status) => ({
    color: STATUS_COLORS[status] || 'default',
    icon: status === 'available' ? <CheckCircleOutlined />
      : status === 'in-use' ? <ClockCircleOutlined />
      : status === 'maintenance' ? <ToolOutlined />
      : <StopOutlined />,
    label: t(`common:inventory.${STATUS_KEYS[status] || 'statusAvailable'}`),
  });

  const canManageEquipment =
    user?.role === 'admin' ||
    user?.role === 'manager' ||
    user?.role === 'owner' ||
    user?.role === 'receptionist' ||
    user?.role === 'front_desk' ||
    user?.permissions?.['equipment:write'] === true;
  const watchType = Form.useWatch('type', form);

  // Filter equipment
  const filteredEquipment = useMemo(() => {
    if (!equipment) return [];
    return equipment.filter(item => {
      const matchesSearch = !searchTerm || 
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.serialNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = !filterType || item.type === filterType;
      const matchesStatus = !filterStatus || item.status === filterStatus;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [equipment, searchTerm, filterType, filterStatus]);

  // Statistics
  const stats = useMemo(() => {
    if (!equipment) return { total: 0, available: 0, inUse: 0, maintenance: 0 };
    return {
      total: equipment.length,
      available: equipment.filter(e => e.status === 'available').length,
      inUse: equipment.filter(e => e.status === 'in-use').length,
      maintenance: equipment.filter(e => e.status === 'maintenance').length,
    };
  }, [equipment]);

  // Group equipment by model (type + brand + name). Sizes are aggregated into a size
  // breakdown so 6 Mystic Marshalls across sizes M/L/XL collapse into a single row.
  // Items missing brand or name remain ungrouped (isSolo).
  const groupedEquipment = useMemo(() => {
    const groups = new Map();
    for (const u of filteredEquipment) {
      const b = u.brand?.trim().toLowerCase();
      const n = u.name?.trim().toLowerCase();
      const ty = u.type?.trim().toLowerCase();
      const isSolo = !b || !n;
      const key = isSolo ? `__solo__:${u.id}` : `${ty}|${b}|${n}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          isSolo,
          brand: u.brand,
          name: u.name,
          type: u.type,
          image_url: u.image_url || u.imageUrl,
          units: [],
          count: 0,
          sizes: {},
          available_count: 0,
          in_use_count: 0,
          maintenance_count: 0,
          retired_count: 0,
        };
        groups.set(key, g);
      }
      g.units.push(u);
      g.count++;
      const sz = (u.size && String(u.size).trim()) || '—';
      g.sizes[sz] = (g.sizes[sz] || 0) + 1;
      if (u.status === 'available') g.available_count++;
      else if (u.status === 'in-use') g.in_use_count++;
      else if (u.status === 'maintenance') g.maintenance_count++;
      else if (u.status === 'retired') g.retired_count++;
    }
    return Array.from(groups.values());
  }, [filteredEquipment]);

  // Section the grouped models by equipment type, preserving the order of equipmentTypes.
  const sectionedEquipment = useMemo(() => {
    const byType = new Map();
    for (const g of groupedEquipment) {
      const ty = (g.type || '').toLowerCase().trim() || 'other';
      if (!byType.has(ty)) byType.set(ty, []);
      byType.get(ty).push(g);
    }
    const ordered = [];
    for (const tDef of equipmentTypes) {
      if (byType.has(tDef.value)) {
        const groups = byType.get(tDef.value);
        ordered.push({
          key: tDef.value,
          label: tDef.label,
          groups,
          unitCount: groups.reduce((acc, g) => acc + g.count, 0),
        });
        byType.delete(tDef.value);
      }
    }
    // Trailing unknown types
    for (const [key, groups] of byType) {
      ordered.push({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        groups,
        unitCount: groups.reduce((acc, g) => acc + g.count, 0),
      });
    }
    return ordered;
  }, [groupedEquipment]);

  const StatusBreakdown = ({ group }) => {
    const items = [];
    if (group.available_count > 0) items.push({ color: 'success', count: group.available_count, label: t('common:inventory.availShort') });
    if (group.in_use_count > 0) items.push({ color: 'processing', count: group.in_use_count, label: t('common:inventory.inUseShort') });
    if (group.maintenance_count > 0) items.push({ color: 'warning', count: group.maintenance_count, label: t('common:inventory.maintShort') });
    if (group.retired_count > 0) items.push({ color: 'default', count: group.retired_count, label: t('common:inventory.retiredShort') });
    return (
      <Space size={4} wrap>
        {items.map((it, i) => (
          <Tag key={i} color={it.color}>{it.count} {it.label}</Tag>
        ))}
      </Space>
    );
  };

  const SizeBreakdown = ({ sizes }) => {
    const entries = Object.entries(sizes || {});
    entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length === 0) return <Text type="secondary">—</Text>;
    return (
      <Space size={4} wrap>
        {entries.map(([sz, cnt]) => (
          <Tag key={sz} color="blue">{sz}: {cnt}</Tag>
        ))}
      </Space>
    );
  };

  const handleViewDetails = (record) => {
    setSelectedItem(record);
    setSelectedGroup(null);
    setDetailDrawerOpen(true);
  };

  const handleViewGroup = (group) => {
    setSelectedItem(null);
    setSelectedGroup(group);
    setDetailDrawerOpen(true);
  };

  const handleAddUnit = (group) => {
    setIsEditing(false);
    setSelectedItem(null);
    setImageUrl(null);
    form.resetFields();
    form.setFieldsValue({
      status: 'available',
      type: group.type,
      name: group.name,
      brand: group.brand,
    });
    setFormModalOpen(true);
  };

  const handleAddNew = () => {
    setIsEditing(false);
    setSelectedItem(null);
    setImageUrl(null);
    form.resetFields();
    form.setFieldsValue({ status: 'available', type: 'kite' });
    setFormModalOpen(true);
  };

  const handleEdit = (record) => {
    setIsEditing(true);
    setSelectedItem(record);
    setImageUrl(record.image_url || record.imageUrl || null);
    form.setFieldsValue({
      ...record,
      purchaseDate: record.purchaseDate ? dayjs(record.purchaseDate) : null,
    });
    setFormModalOpen(true);
  };

  const handleFormSubmit = async (values) => {
    setSaving(true);
    try {
      // Map frontend field names to backend field names
      const payload = {
        name: values.name,
        brand: values.brand,
        type: values.type,
        size: values.size,
        condition: values.condition,
        availability: values.status, // Map status -> availability
        purchase_date: values.registerDate ? values.registerDate.format('YYYY-MM-DD') : null,
        notes: values.notes,
        // Optional fields that might be in the form
        model: values.model,
        serial_number: values.serial_number,
        location: values.location,
        image_url: imageUrl,
      };

      if (isEditing && selectedItem) {
        await apiClient.put(`/equipment/${selectedItem.id}`, payload);
        message.success(t('common:inventory.equipmentUpdated'));
      } else {
        await apiClient.post('/equipment', payload);
        message.success(t('common:inventory.equipmentAdded'));
      }

      setFormModalOpen(false);
      form.resetFields();
      setImageUrl(null);
      refreshData();
    } catch (err) {
      message.error(err.response?.data?.error || err.response?.data?.message || t('common:inventory.failSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/equipment/${id}`);
      message.success(t('common:inventory.equipmentDeleted'));
      refreshData();
    } catch {
      message.error(t('common:inventory.failDelete'));
    }
  };

  const renderConditionTag = (condition) => {
    const colors = {
      new: 'green',
      excellent: 'cyan',
      good: 'blue',
      fair: 'orange',
      poor: 'red',
    };
    return condition ? (
      <Tag color={colors[condition] || 'default'}>
        {condition.charAt(0).toUpperCase() + condition.slice(1)}
      </Tag>
    ) : null;
  };

  const renderUnitActions = (u) => (
    <Space size="small">
      <Tooltip title={t('common:inventory.viewDetails')}>
        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetails(u)} />
      </Tooltip>
      {canManageEquipment && (
        <>
          <Tooltip title={t('common:inventory.editTooltip')}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(u)} />
          </Tooltip>
          <Popconfirm
            title={t('common:inventory.deleteConfirmTitle')}
            description={t('common:inventory.deleteConfirmDesc')}
            onConfirm={() => handleDelete(u.id)}
            okText={t('common:buttons.delete')}
            cancelText={t('common:buttons.cancel')}
            okButtonProps={{ danger: true }}
          >
            <Tooltip title={t('common:inventory.deleteTooltip')}>
              <Button type="text" size="small" icon={<DeleteOutlined />} danger />
            </Tooltip>
          </Popconfirm>
        </>
      )}
    </Space>
  );

  const unitSubColumns = [
    {
      title: t('common:inventory.serialNumber'),
      key: 'serial',
      render: (_, u) => u.serialNumber || u.serial_number || <Text type="secondary">—</Text>,
    },
    {
      title: t('common:inventory.size'),
      dataIndex: 'size',
      key: 'size',
      render: (sz) => (sz ? <Tag color="blue">{sz}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: t('common:inventory.condition'),
      dataIndex: 'condition',
      key: 'condition',
      render: renderConditionTag,
    },
    {
      title: t('common:inventory.statusField'),
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const config = getStatusConfig(status);
        return <Tag color={config.color} icon={config.icon}>{config.label}</Tag>;
      },
    },
    {
      title: t('common:inventory.location'),
      dataIndex: 'location',
      key: 'location',
      render: (loc) => loc || <Text type="secondary">—</Text>,
    },
    {
      title: t('common:table.actions'),
      key: 'actions',
      width: 140,
      render: (_, u) => renderUnitActions(u),
    },
  ];

  const groupColumns = [
    {
      title: t('common:inventory.title'),
      key: 'equipment',
      render: (_, group) => (
        <div className="flex items-center gap-3">
          {group.image_url ? (
            <div className="w-10 h-10 rounded-lg overflow-hidden">
              <img
                src={group.image_url}
                alt={group.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">
              {group.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
          <div>
            <Text strong>{group.name}</Text>
            <div>
              <Text type="secondary" className="text-xs">{group.brand}</Text>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: t('common:inventory.sizesLabel'),
      key: 'sizes',
      render: (_, group) => <SizeBreakdown sizes={group.sizes} />,
    },
    {
      title: t('common:inventory.unitsLabel'),
      key: 'units',
      render: (_, group) => (
        <Tag color="purple">
          {group.count} {group.count === 1 ? t('common:inventory.unitLabel') : t('common:inventory.unitsLabel')}
        </Tag>
      ),
    },
    {
      title: t('common:inventory.statusField'),
      key: 'status',
      render: (_, group) => {
        if (group.isSolo) {
          const u = group.units[0];
          const config = getStatusConfig(u.status);
          return <Tag color={config.color} icon={config.icon}>{config.label}</Tag>;
        }
        return <StatusBreakdown group={group} />;
      },
    },
    {
      title: t('common:table.actions'),
      key: 'actions',
      width: 160,
      render: (_, group) => {
        if (group.isSolo) {
          return renderUnitActions(group.units[0]);
        }
        return (
          <Space size="small">
            <Tooltip title={t('common:inventory.viewUnits')}>
              <Button type="text" icon={<EyeOutlined />} onClick={() => handleViewGroup(group)} />
            </Tooltip>
            {canManageEquipment && (
              <Tooltip title={t('common:inventory.addUnit')}>
                <Button type="text" icon={<PlusOutlined />} onClick={() => handleAddUnit(group)} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const renderGroupCard = (group) => {
    const onCardClick = group.isSolo
      ? () => handleViewDetails(group.units[0])
      : () => handleViewGroup(group);
    const soloConfig = group.isSolo ? getStatusConfig(group.units[0].status) : null;
    return (
      <Col xs={24} sm={12} md={8} lg={6} key={group.key}>
        <Card hoverable onClick={onCardClick} className="h-full cursor-pointer">
          <div className="text-center mb-4">
            {group.image_url ? (
              <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden">
                <img
                  src={group.image_url}
                  alt={group.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold">
                {group.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="text-center">
            <Text strong className="text-lg block">{group.name}</Text>
            <Text type="secondary" className="block">{group.brand}</Text>
            <div className="mt-2 flex justify-center">
              <SizeBreakdown sizes={group.sizes} />
            </div>
            <div className="mt-2 flex justify-center">
              <Tag color="purple">
                {group.count} {group.count === 1 ? t('common:inventory.unitLabel') : t('common:inventory.unitsLabel')}
              </Tag>
            </div>
            <div className="mt-3 flex justify-center">
              {group.isSolo ? (
                <Tag color={soloConfig.color} icon={soloConfig.icon}>{soloConfig.label}</Tag>
              ) : (
                <StatusBreakdown group={group} />
              )}
            </div>
          </div>
        </Card>
      </Col>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Hero Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <AppstoreOutlined /> {t('common:inventory.badge')}
            </div>
            <h1 className="text-3xl font-semibold">{t('common:inventory.title')}</h1>
            <p className="text-sm text-white/75">
              {t('common:inventory.subtitle')}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              icon={<ReloadOutlined />}
              onClick={refreshData}
              loading={loading}
              className="h-11 rounded-2xl bg-white/20 text-white border-white/30 hover:bg-white/30"
            >
              {t('common:inventory.refresh')}
            </Button>
            {canManageEquipment && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddNew}
                className="h-11 rounded-2xl bg-white text-emerald-600 border-0 shadow-lg hover:bg-slate-100"
              >
                {t('common:inventory.addEquipment')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={t('common:inventory.totalItems')}
              value={stats.total}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={t('common:inventory.available')}
              value={stats.available}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={t('common:inventory.inUse')}
              value={stats.inUse}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={t('common:inventory.maintenance')}
              value={stats.maintenance}
              valueStyle={{ color: '#faad14' }}
              prefix={<ToolOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters and View Toggle */}
      <Card className="rounded-2xl">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={24} md={8} lg={6}>
            <Input
              placeholder={t('common:inventory.searchPlaceholder')}
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Select
              placeholder={t('common:inventory.filterType')}
              allowClear
              style={{ width: '100%' }}
              value={filterType}
              onChange={setFilterType}
              options={equipmentTypes}
            />
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Select
              placeholder={t('common:inventory.filterStatus')}
              allowClear
              style={{ width: '100%' }}
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'available', label: t('common:inventory.statusAvailable') },
                { value: 'in-use', label: t('common:inventory.statusInUse') },
                { value: 'maintenance', label: t('common:inventory.statusMaintenance') },
                { value: 'retired', label: t('common:inventory.statusRetired') },
              ]}
            />
          </Col>
          <Col xs={24} sm={8} md={4} lg={4} className="ml-auto">
            <Segmented
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'table', icon: <UnorderedListOutlined /> },
                { value: 'cards', icon: <AppstoreOutlined /> },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* Content */}
      <Card className="rounded-2xl">
        {loading ? (
          <div className="text-center py-12">
            <Spin size="large" />
            <p className="mt-4 text-gray-500">{t('common:inventory.loading')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <ExclamationCircleOutlined className="text-4xl text-red-500" />
            <p className="mt-4 text-red-500">{error}</p>
            <Button onClick={refreshData} className="mt-4">{t('common:inventory.tryAgain')}</Button>
          </div>
        ) : sectionedEquipment.length === 0 ? (
          <Empty description={t('common:inventory.noEquipment')} />
        ) : (
          <Collapse
            defaultActiveKey={sectionedEquipment.map((s) => s.key)}
            items={sectionedEquipment.map((section) => ({
              key: section.key,
              label: (
                <Space>
                  <Text strong>{section.label}</Text>
                  <Tag color="purple">
                    {section.unitCount} {section.unitCount === 1 ? t('common:inventory.unitLabel') : t('common:inventory.unitsLabel')}
                  </Tag>
                </Space>
              ),
              children:
                viewMode === 'table' ? (
                  <Table
                    columns={groupColumns}
                    dataSource={section.groups}
                    rowKey="key"
                    pagination={false}
                    scroll={{ x: 800 }}
                    expandable={{
                      rowExpandable: (g) => !g.isSolo,
                      expandedRowRender: (g) => (
                        <Table
                          size="small"
                          columns={unitSubColumns}
                          dataSource={g.units}
                          rowKey="id"
                          pagination={false}
                        />
                      ),
                    }}
                  />
                ) : (
                  <Row gutter={[16, 16]}>{section.groups.map(renderGroupCard)}</Row>
                ),
            }))}
          />
        )}
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={t('common:inventory.details')}
        placement="right"
        width={selectedGroup ? 640 : 450}
        onClose={() => {
          setDetailDrawerOpen(false);
          setSelectedGroup(null);
          setSelectedItem(null);
        }}
        open={detailDrawerOpen}
        extra={
          canManageEquipment && (
            selectedGroup ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                setDetailDrawerOpen(false);
                handleAddUnit(selectedGroup);
              }}>
                {t('common:inventory.addUnit')}
              </Button>
            ) : selectedItem ? (
              <Button type="primary" icon={<EditOutlined />} onClick={() => {
                setDetailDrawerOpen(false);
                handleEdit(selectedItem);
              }}>
                {t('common:inventory.edit')}
              </Button>
            ) : null
          )
        }
      >
        {selectedGroup && (
          <div className="space-y-6">
            <div className="text-center">
              {selectedGroup.image_url ? (
                <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden">
                  <img
                    src={selectedGroup.image_url}
                    alt={selectedGroup.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-3xl font-bold">
                  {selectedGroup.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <Title level={4} className="mt-4 mb-0">{selectedGroup.name}</Title>
              <Text type="secondary">{selectedGroup.brand}</Text>
            </div>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('common:inventory.equipmentType')}>
                {selectedGroup.type?.charAt(0).toUpperCase() + selectedGroup.type?.slice(1)}
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.sizesLabel')}>
                <SizeBreakdown sizes={selectedGroup.sizes} />
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.statusField')}>
                <StatusBreakdown group={selectedGroup} />
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Text strong>
                {selectedGroup.count} {selectedGroup.count === 1 ? t('common:inventory.unitLabel') : t('common:inventory.unitsLabel')}
              </Text>
              <Table
                size="small"
                columns={unitSubColumns}
                dataSource={selectedGroup.units}
                rowKey="id"
                pagination={false}
                className="mt-2"
              />
            </div>
          </div>
        )}
        {!selectedGroup && selectedItem && (
          <div className="space-y-6">
            <div className="text-center">
              {selectedItem.image_url || selectedItem.imageUrl ? (
                <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden">
                  <img
                    src={selectedItem.image_url || selectedItem.imageUrl}
                    alt={selectedItem.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-3xl font-bold">
                  {selectedItem.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <Title level={4} className="mt-4 mb-0">{selectedItem.name}</Title>
              <Text type="secondary">{selectedItem.brand}</Text>
            </div>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('common:inventory.equipmentType')}>
                {selectedItem.type?.charAt(0).toUpperCase() + selectedItem.type?.slice(1)}
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.size')}>{selectedItem.size || 'N/A'}</Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.condition')}>
                {selectedItem.condition
                  ? selectedItem.condition.charAt(0).toUpperCase() + selectedItem.condition.slice(1)
                  : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.statusField')}>
                <Tag color={getStatusConfig(selectedItem.status).color}>
                  {getStatusConfig(selectedItem.status).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.registerDate')}>
                {selectedItem.registerDate
                  ? dayjs(selectedItem.registerDate).format('MMM DD, YYYY')
                  : selectedItem.purchaseDate
                    ? dayjs(selectedItem.purchaseDate).format('MMM DD, YYYY')
                    : 'N/A'}
              </Descriptions.Item>
            </Descriptions>

            {selectedItem.specifications && (
              <div>
                <Text strong>{t('common:inventory.specifications')}</Text>
                <Paragraph className="mt-2 p-3 bg-gray-50 rounded-lg">
                  {selectedItem.specifications}
                </Paragraph>
              </div>
            )}

            {selectedItem.notes && (
              <div>
                <Text strong>{t('common:inventory.notes')}</Text>
                <Paragraph className="mt-2 p-3 bg-gray-50 rounded-lg">
                  {selectedItem.notes}
                </Paragraph>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Add/Edit Form Modal */}
      <Modal
        title={isEditing ? t('common:inventory.editEquipment') : t('common:inventory.addNewEquipment')}
        open={formModalOpen}
        onCancel={() => {
          setFormModalOpen(false);
          form.resetFields();
          setImageUrl(null);
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
          className="mt-4"
        >
          {/* Equipment Image */}
          <div className="text-center mb-6">
            <Upload
              name="image"
              listType="picture-card"
              className="avatar-uploader"
              showUploadList={false}
              beforeUpload={(file) => {
                const isImage = file.type.startsWith('image/');
                if (!isImage) {
                  message.error(t('common:inventory.imageTypeError'));
                  return false;
                }
                const isLt5M = file.size / 1024 / 1024 < 5;
                if (!isLt5M) {
                  message.error(t('common:inventory.imageSizeError'));
                  return false;
                }
                return true;
              }}
              customRequest={async ({ file, onSuccess, onError, onProgress }) => {
                setImageLoading(true);
                try {
                  const formData = new FormData();
                  formData.append('image', file);
                  const response = await apiClient.post('/upload/equipment-image', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: ({ total, loaded }) => {
                      if (total) {
                        onProgress?.({ percent: Math.round((loaded / total) * 100) });
                      }
                    }
                  });
                  const newUrl = response.data?.url;
                  if (newUrl) {
                    setImageUrl(newUrl);
                  }
                  onSuccess?.(response.data);
                  message.success(t('common:inventory.imageUploaded'));
                } catch (err) {
                  onError?.(err);
                  message.error(t('common:inventory.imageUploadFailed'));
                } finally {
                  setImageLoading(false);
                }
              }}
            >
              {imageUrl ? (
                <div style={{ width: 104, height: 104, overflow: 'hidden', borderRadius: 8 }}>
                  <img 
                    src={imageUrl} 
                    alt="equipment" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                </div>
              ) : (
                <div>
                  {imageLoading ? <LoadingOutlined /> : <UploadOutlined />}
                  <div style={{ marginTop: 8 }}>{t('common:inventory.uploadPhoto')}</div>
                </div>
              )}
            </Upload>
            <Text type="secondary" className="text-xs">{t('common:inventory.uploadHint')}</Text>
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label={t('common:inventory.equipmentName')}
                rules={[{ required: true, message: t('common:inventory.nameRequired') }]}
              >
                <Input placeholder={t('common:inventory.namePlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="brand"
                label={t('common:inventory.brand')}
                rules={[{ required: true, message: t('common:inventory.brandRequired') }]}
              >
                <Select options={brandOptions} placeholder={t('common:inventory.selectBrand')} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="type"
                label={t('common:inventory.equipmentType')}
                rules={[{ required: true, message: t('common:inventory.typeRequired') }]}
              >
                <Select options={equipmentTypes} placeholder={t('common:inventory.selectType')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="size"
                label={t('common:inventory.size')}
              >
                {getSizeOptions(watchType).length > 0 ? (
                  <Select
                    options={getSizeOptions(watchType).map(s => ({ value: s, label: s }))}
                    placeholder={t('common:inventory.selectSize')}
                  />
                ) : (
                  <Input placeholder={t('common:inventory.enterSize')} />
                )}
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="condition"
                label={t('common:inventory.condition')}
              >
                <Select options={conditionOptions} placeholder={t('common:inventory.selectCondition')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label={t('common:inventory.statusField')}
                rules={[{ required: true, message: t('common:inventory.statusRequired') }]}
              >
                <Select
                  options={[
                    { value: 'available', label: t('common:inventory.statusAvailable') },
                    { value: 'in-use', label: t('common:inventory.statusInUse') },
                    { value: 'maintenance', label: t('common:inventory.statusMaintenance') },
                    { value: 'retired', label: t('common:inventory.statusRetired') },
                  ]}
                  placeholder={t('common:inventory.selectStatus')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="registerDate" label={t('common:inventory.registerDate')}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="specifications" label={t('common:inventory.specifications')}>
                <Input placeholder={t('common:inventory.specsPlaceholder')} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label={t('common:inventory.notes')}>
            <TextArea rows={3} placeholder={t('common:inventory.notesPlaceholder')} />
          </Form.Item>

          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={() => setFormModalOpen(false)}>{t('common:buttons.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              {isEditing ? t('common:inventory.editEquipment') : t('common:inventory.addEquipment')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default InventoryPage;
