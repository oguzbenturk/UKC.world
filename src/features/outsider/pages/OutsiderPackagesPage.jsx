import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Empty, Spin, Tag, Progress, Statistic, Row, Col, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, GiftOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Title, Text } = Typography;

const OutsiderPackagesPage = () => {
  const { getCurrencySymbol } = useCurrency();
  const { data: packages, isLoading } = useQuery({
    queryKey: ['outsider-packages'],
    queryFn: async () => {
      const response = await apiClient.get('/services/packages/my-packages');
      return response.data.data || [];
    },
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Loading your packages..." />
      </div>
    );
  }

  if (!packages || packages.length === 0) {
    return (
      <div style={{ padding: '40px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <Title level={2}>My Packages</Title>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="You haven't purchased any packages yet"
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '40px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={2}>My Packages</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: '24px' }}>
        View and manage your purchased lesson packages
      </Text>

      <Row gutter={[16, 16]}>
        {packages.map((pkg) => {
          const hoursUsed = pkg.hours_used || 0;
          const totalHours = pkg.total_hours || 0;
          const hoursRemaining = totalHours - hoursUsed;
          const usagePercent = totalHours > 0 ? (hoursUsed / totalHours) * 100 : 0;
          
          const isExpired = pkg.expiry_date && new Date(pkg.expiry_date) < new Date();
          const isActive = !isExpired && hoursRemaining > 0;

          return (
            <Col xs={24} sm={24} md={12} lg={8} key={pkg.id}>
              <Card
                hoverable
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <GiftOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                    <span>{pkg.package_name}</span>
                  </div>
                }
                extra={
                  isActive ? (
                    <Tag color="green" icon={<CheckCircleOutlined />}>Active</Tag>
                  ) : isExpired ? (
                    <Tag color="red" icon={<ClockCircleOutlined />}>Expired</Tag>
                  ) : (
                    <Tag color="orange">Used Up</Tag>
                  )
                }
              >
                <Row gutter={16} style={{ marginBottom: '16px' }}>
                  <Col span={12}>
                    <Statistic
                      title="Hours Remaining"
                      value={hoursRemaining}
                      suffix={`/ ${totalHours}`}
                      valueStyle={{ color: hoursRemaining > 0 ? '#3f8600' : '#cf1322' }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Total Value"
                      value={pkg.total_price}
                      precision={2}
                      prefix={getCurrencySymbol(pkg.currency)}
                    />
                  </Col>
                </Row>

                <div style={{ marginBottom: '16px' }}>
                  <Text type="secondary" style={{ fontSize: '12px' }}>Usage Progress</Text>
                  <Progress
                    percent={Math.round(usagePercent)}
                    status={hoursRemaining === 0 ? 'exception' : usagePercent > 80 ? 'normal' : 'active'}
                    strokeColor={hoursRemaining === 0 ? '#ff4d4f' : usagePercent > 80 ? '#faad14' : '#52c41a'}
                  />
                </div>

                <div style={{ fontSize: '13px', color: 'rgba(0,0,0,0.65)' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Purchased:</strong> {new Date(pkg.purchase_date).toLocaleDateString()}
                  </div>
                  {pkg.expiry_date && (
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Expires:</strong> {new Date(pkg.expiry_date).toLocaleDateString()}
                      {isExpired && <Text type="danger"> (Expired)</Text>}
                    </div>
                  )}
                  {pkg.description && (
                    <div style={{ marginTop: '12px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                      <Text type="secondary" style={{ fontSize: '12px' }}>{pkg.description}</Text>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

export default OutsiderPackagesPage;
