// src/features/members/pages/AdminMembersPage.jsx
// Admin page to view all member purchases and assign memberships

import { useState } from 'react';
import { 
  Card, Table, Tag, Button, Space, Typography, 
  Modal, Input, Select, DatePicker, Spin,
  Statistic, Row, Col, Avatar, Descriptions,
  message, Empty, Grid
} from 'antd';
import {
  CrownOutlined,
  StarOutlined,
  TrophyOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  PlusOutlined,
  UserOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';
import QuickMembershipModal from '@/features/dashboard/components/QuickMembershipModal';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const statusConfig = {
  active: { color: 'green', icon: <CheckCircleOutlined />, label: 'Active' },
  pending: { color: 'gold', icon: <ClockCircleOutlined />, label: 'Pending' },
  expired: { color: 'default', icon: <CloseCircleOutlined />, label: 'Expired' },
  cancelled: { color: 'red', icon: <CloseCircleOutlined />, label: 'Cancelled' }
};

const getMemberIcon = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('platinum') || n.includes('bundle')) return <TrophyOutlined style={{ color: '#a855f7' }} />;
  if (n.includes('vip') || n.includes('beach')) return <CrownOutlined style={{ color: '#f59e0b' }} />;
  return <StarOutlined style={{ color: '#10b981' }} />;
};

const AdminMembersPage = () => {
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    dateRange: null
  });
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);

  // Fetch all member purchases
  const { data: purchases = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-member-purchases', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.dateRange?.[0]) params.append('from', filters.dateRange[0].toISOString());
      if (filters.dateRange?.[1]) params.append('to', filters.dateRange[1].toISOString());
      
      const { data } = await apiClient.get(`/member-offerings/admin/purchases?${params}`);
      return data;
    }
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['admin-member-stats'],
    queryFn: async () => {
      const allPurchases = await apiClient.get('/member-offerings/admin/purchases');
      const data = allPurchases.data || [];
      return {
        total: data.length,
        active: data.filter(p => p.status === 'active').length,
        pending: data.filter(p => p.status === 'pending').length,
        expired: data.filter(p => p.status === 'expired').length
      };
    }
  });

  // Filter purchases by search term
  const filteredPurchases = purchases.filter(p => {
    if (!filters.search) return true;
    const search = filters.search.toLowerCase();
    return (
      p.user_name?.toLowerCase().includes(search) ||
      p.user_email?.toLowerCase().includes(search) ||
      p.offering_name?.toLowerCase().includes(search) ||
      p.current_offering_name?.toLowerCase().includes(search)
    );
  });

  const handleViewDetails = (purchase) => {
    setSelectedPurchase(purchase);
    setDetailModalVisible(true);
  };

  const handleAssignSuccess = () => {
    setAssignModalVisible(false);
    refetch();
    queryClient.invalidateQueries(['admin-member-stats']);
    message.success('Membership assigned successfully!');
  };

  const columns = [
    {
      title: 'Member',
      key: 'member',
      width: 250,
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
          <div>
            <Text strong>{record.user_name || 'Unknown'}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{record.user_email}</Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Membership Type',
      key: 'type',
      width: 200,
      render: (_, record) => (
        <Space>
          {getMemberIcon(record.offering_name || record.current_offering_name)}
          <Text>{record.offering_name || record.current_offering_name || 'Unknown'}</Text>
        </Space>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const config = statusConfig[status] || statusConfig.pending;
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      }
    },
    {
      title: 'Purchase Date',
      dataIndex: 'purchased_at',
      key: 'purchased_at',
      width: 150,
      render: (date) => date ? dayjs(date).format('MMM D, YYYY') : '-',
      sorter: (a, b) => new Date(a.purchased_at) - new Date(b.purchased_at)
    },
    {
      title: 'Expires',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 150,
      render: (date, _record) => {
        if (!date) return <Text type="secondary">Never</Text>;
        const expiry = dayjs(date);
        const isExpired = expiry.isBefore(dayjs());
        const isExpiringSoon = expiry.isBefore(dayjs().add(7, 'days'));
        return (
          <Text type={isExpired ? 'danger' : isExpiringSoon ? 'warning' : undefined}>
            {expiry.format('MMM D, YYYY')}
          </Text>
        );
      }
    },
    {
      title: 'Amount',
      dataIndex: 'offering_price',
      key: 'offering_price',
      width: 120,
      render: (amount) => formatCurrency(amount || 0),
      sorter: (a, b) => (a.offering_price || 0) - (b.offering_price || 0)
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetails(record)}
        >
          View
        </Button>
      )
    }
  ];

  // Mobile card component for member display
  const MemberCard = ({ record }) => {
    const config = statusConfig[record.status] || statusConfig.pending;
    const expiry = record.expires_at ? dayjs(record.expires_at) : null;
    const isExpired = expiry?.isBefore(dayjs());
    
    return (
      <Card 
        className="rounded-2xl border border-slate-200 shadow-sm mb-3"
        bodyStyle={{ padding: 16 }}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
            <div>
              <Text strong className="block">{record.user_name || 'Unknown'}</Text>
              <Text type="secondary" className="text-xs">{record.user_email}</Text>
            </div>
          </div>
          <Tag color={config.color} icon={config.icon} className="m-0">
            {config.label}
          </Tag>
        </div>
        
        <div className="flex items-center gap-2 mb-2">
          {getMemberIcon(record.offering_name || record.current_offering_name)}
          <Text className="text-sm">{record.offering_name || record.current_offering_name || 'Unknown'}</Text>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-3">
          <div>
            <span className="text-slate-400">Purchased:</span>
            <br />
            {record.purchased_at ? dayjs(record.purchased_at).format('MMM D, YYYY') : '-'}
          </div>
          <div>
            <span className="text-slate-400">Expires:</span>
            <br />
            <span className={isExpired ? 'text-red-500' : ''}>
              {expiry ? expiry.format('MMM D, YYYY') : 'Never'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <Text strong className="text-green-600">{formatCurrency(record.offering_price || 0)}</Text>
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetails(record)}
          >
            View
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <Title level={isMobile ? 4 : 3} className="m-0 flex items-center gap-2">
            <CrownOutlined className="text-amber-500" />
            Member Management
          </Title>
          <Space size="small" wrap>
            <Button icon={<ReloadOutlined />} size={isMobile ? 'small' : 'middle'} onClick={() => refetch()}>
              {!isMobile && 'Refresh'}
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              size={isMobile ? 'small' : 'middle'}
              onClick={() => setAssignModalVisible(true)}
            >
              {isMobile ? 'Assign' : 'Assign Membership'}
            </Button>
          </Space>
        </div>
      </div>

      {/* Stats */}
      <Row gutter={[12, 12]} className="mb-4 md:mb-6">
        <Col xs={12} sm={6}>
          <Card className="rounded-xl border border-slate-200 shadow-sm" bodyStyle={{ padding: isMobile ? 12 : 20 }}>
            <Statistic
              title={<span className="text-xs md:text-sm">Total Members</span>}
              value={stats?.total || 0}
              prefix={<UserOutlined />}
              valueStyle={{ fontSize: isMobile ? 20 : 24 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-xl border border-slate-200 shadow-sm" bodyStyle={{ padding: isMobile ? 12 : 20 }}>
            <Statistic
              title={<span className="text-xs md:text-sm">Active</span>}
              value={stats?.active || 0}
              valueStyle={{ color: '#52c41a', fontSize: isMobile ? 20 : 24 }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-xl border border-slate-200 shadow-sm" bodyStyle={{ padding: isMobile ? 12 : 20 }}>
            <Statistic
              title={<span className="text-xs md:text-sm">Pending</span>}
              value={stats?.pending || 0}
              valueStyle={{ color: '#faad14', fontSize: isMobile ? 20 : 24 }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-xl border border-slate-200 shadow-sm" bodyStyle={{ padding: isMobile ? 12 : 20 }}>
            <Statistic
              title={<span className="text-xs md:text-sm">Expired</span>}
              value={stats?.expired || 0}
              valueStyle={{ color: '#8c8c8c', fontSize: isMobile ? 20 : 24 }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card className="rounded-xl border border-slate-200 shadow-sm mb-4" bodyStyle={{ padding: isMobile ? 12 : 16 }}>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search name or email..."
            prefix={<SearchOutlined />}
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="flex-1"
            size={isMobile ? 'middle' : 'large'}
            allowClear
          />
          <div className="flex gap-2 flex-wrap">
            <Select
              value={filters.status}
              onChange={(value) => setFilters(f => ({ ...f, status: value }))}
              style={{ minWidth: 120 }}
              size={isMobile ? 'middle' : 'large'}
            >
              <Select.Option value="all">All Status</Select.Option>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="pending">Pending</Select.Option>
              <Select.Option value="expired">Expired</Select.Option>
              <Select.Option value="cancelled">Cancelled</Select.Option>
            </Select>
            {!isMobile && (
              <RangePicker
                value={filters.dateRange}
                onChange={(dates) => setFilters(f => ({ ...f, dateRange: dates }))}
                placeholder={['From', 'To']}
                size="large"
              />
            )}
            {(filters.search || filters.status !== 'all' || filters.dateRange) && (
              <Button 
                onClick={() => setFilters({ status: 'all', search: '', dateRange: null })}
                size={isMobile ? 'middle' : 'large'}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Content - Table on desktop, Cards on mobile */}
      {isMobile ? (
        <div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spin size="large" />
            </div>
          ) : filteredPurchases.length === 0 ? (
            <Card className="rounded-xl">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No members found"
              >
                <Button type="primary" onClick={() => setAssignModalVisible(true)}>
                  Assign First Member
                </Button>
              </Empty>
            </Card>
          ) : (
            <>
              <div className="text-xs text-slate-500 mb-2 px-1">
                {filteredPurchases.length} member{filteredPurchases.length !== 1 ? 's' : ''}
              </div>
              {filteredPurchases.map(purchase => (
                <MemberCard key={purchase.id} record={purchase} />
              ))}
            </>
          )}
        </div>
      ) : (
        <Card className="rounded-xl border border-slate-200 shadow-sm">
          <Table
            columns={columns}
            dataSource={filteredPurchases}
            rowKey="id"
            loading={isLoading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} members`
            }}
            scroll={{ x: 1000 }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No members found"
                >
                  <Button type="primary" onClick={() => setAssignModalVisible(true)}>
                    Assign First Member
                  </Button>
                </Empty>
              )
            }}
          />
        </Card>
      )}

      {/* Detail Modal */}
      <Modal
        title={
          <Space>
            {getMemberIcon(selectedPurchase?.offering_name)}
            <span>Member Details</span>
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Close
          </Button>
        ]}
        width={600}
      >
        {selectedPurchase && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Member Name">
              <Space>
                <Avatar icon={<UserOutlined />} size="small" />
                {selectedPurchase.user_name}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Email">
              {selectedPurchase.user_email}
            </Descriptions.Item>
            <Descriptions.Item label="Membership Type">
              <Space>
                {getMemberIcon(selectedPurchase.offering_name)}
                {selectedPurchase.offering_name || selectedPurchase.current_offering_name}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={statusConfig[selectedPurchase.status]?.color || 'default'}>
                {statusConfig[selectedPurchase.status]?.label || selectedPurchase.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Purchase Date">
              {selectedPurchase.purchased_at 
                ? dayjs(selectedPurchase.purchased_at).format('MMMM D, YYYY h:mm A')
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Expiry Date">
              {selectedPurchase.expires_at 
                ? dayjs(selectedPurchase.expires_at).format('MMMM D, YYYY')
                : 'Never expires'}
            </Descriptions.Item>
            <Descriptions.Item label="Amount Paid">
              {formatCurrency(selectedPurchase.offering_price || 0)}
            </Descriptions.Item>
            <Descriptions.Item label="Payment Method">
              {selectedPurchase.payment_method || '-'}
            </Descriptions.Item>
            {selectedPurchase.notes && (
              <Descriptions.Item label="Notes">
                {selectedPurchase.notes}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* Assign Membership Modal */}
      <QuickMembershipModal
        visible={assignModalVisible}
        onClose={() => setAssignModalVisible(false)}
        onSuccess={handleAssignSuccess}
      />
    </div>
  );
};

export default AdminMembersPage;
