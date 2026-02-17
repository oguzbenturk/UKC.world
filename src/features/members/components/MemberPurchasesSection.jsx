// src/features/members/components/MemberPurchasesSection.jsx
import { Card, Typography, Tag, Space, Empty, Spin, Button, Tooltip } from 'antd';
import { CrownOutlined, StarOutlined, TrophyOutlined, ThunderboltOutlined, GiftOutlined, CheckCircleOutlined, ClockCircleOutlined, HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useData } from '@/shared/hooks/useData';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Text, Title } = Typography;

// Icon mapping for offerings
const iconMap = {
  crown: <CrownOutlined className="text-xl text-sky-500" />,
  star: <StarOutlined className="text-xl text-sky-500" />,
  trophy: <TrophyOutlined className="text-xl text-sky-500" />,
  thunder: <ThunderboltOutlined className="text-xl text-sky-500" />,
  gift: <GiftOutlined className="text-xl text-sky-500" />,
};

const getStatusColor = (status) => {
  switch (status) {
    case 'active': return 'green';
    case 'expired': return 'red';
    case 'cancelled': return 'default';
    case 'pending': return 'orange';
    default: return 'blue';
  }
};

const getPaymentStatusColor = (status) => {
  switch (status) {
    case 'completed': return 'green';
    case 'pending': return 'orange';
    case 'failed': return 'red';
    case 'refunded': return 'purple';
    default: return 'blue';
  }
};

/**
 * MemberPurchasesSection - Displays member purchases/subscriptions
 * Can be used in customer profile or standalone
 * 
 * @param {Object} props
 * @param {number} props.userId - User ID to fetch purchases for (optional, defaults to current user)
 * @param {boolean} props.isAdminView - Whether this is an admin viewing a customer profile
 * @param {boolean} props.compact - Show compact version
 */
const MemberPurchasesSection = ({ userId, isAdminView = false, compact = false }) => {
  const { apiClient, user } = useData();
  const { formatCurrency } = useCurrency();
  const targetUserId = userId || user?.id;

  // Fetch purchases - use admin endpoint if viewing another user's purchases
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['member-purchases', targetUserId, isAdminView],
    queryFn: async () => {
      if (!apiClient || !targetUserId) return [];
      
      // Admin viewing a customer's purchases
      if (isAdminView && userId) {
        const response = await apiClient.get(`/member-offerings/user/${userId}/purchases`);
        return Array.isArray(response.data) ? response.data : [];
      }
      
      // User viewing their own purchases
      const response = await apiClient.get('/member-offerings/my-purchases');
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!apiClient && !!targetUserId,
  });

  // Separate active and past purchases
  const activePurchases = purchases.filter(p => p.status === 'active' && (!p.expires_at || new Date(p.expires_at) > new Date()));
  const pastPurchases = purchases.filter(p => p.status !== 'active' || (p.expires_at && new Date(p.expires_at) <= new Date()));

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDaysRemaining = (expiresAt) => {
    if (!expiresAt) return null;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spin size="large" />
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <Card className="rounded-xl shadow-sm">
        <Empty
          image={<CrownOutlined className="text-5xl text-slate-300" />}
          description={
            <div className="space-y-2">
              <Text className="text-slate-500">No memberships found</Text>
              <p className="text-xs text-slate-400">
                {isAdminView 
                  ? 'This customer has no active or past memberships.'
                  : 'Explore our VIP membership options for exclusive benefits!'}
              </p>
            </div>
          }
        >
          {!isAdminView && (
            <Button type="primary" href="/members/offerings">
              View Membership Options
            </Button>
          )}
        </Empty>
      </Card>
    );
  }

  if (compact) {
    // Compact view - just show active memberships as badges
    return (
      <div className="space-y-2">
        {activePurchases.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activePurchases.map((purchase) => (
              <Tooltip 
                key={purchase.id}
                title={
                  <div>
                    <div>{purchase.offering_name}</div>
                    {purchase.expires_at && (
                      <div className="text-xs">Expires: {formatDate(purchase.expires_at)}</div>
                    )}
                  </div>
                }
              >
                <Tag 
                  icon={iconMap[purchase.icon] || <CrownOutlined />} 
                  color="blue"
                  className="flex items-center gap-1"
                >
                  {purchase.offering_name}
                </Tag>
              </Tooltip>
            ))}
          </div>
        ) : (
          <Text type="secondary" className="text-sm">No active memberships</Text>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Memberships */}
      {activePurchases.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircleOutlined className="text-green-500" />
            <Title level={5} className="!mb-0">Active Memberships</Title>
            <Tag color="green">{activePurchases.length}</Tag>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePurchases.map((purchase) => {
              const daysRemaining = getDaysRemaining(purchase.expires_at);
              return (
                <Card 
                  key={purchase.id} 
                  size="small" 
                  className="rounded-xl border-l-4 border-l-green-500"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-sky-50 rounded-lg">
                      {iconMap[purchase.icon] || iconMap.star}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Text strong>{purchase.offering_name}</Text>
                        <Tag color="green" className="text-xs">Active</Tag>
                      </div>
                      <div className="text-slate-500 text-sm mt-1">
                        {formatCurrency ? formatCurrency(purchase.offering_price) : `€${purchase.offering_price}`}
                        {' • '}
                        Purchased {formatDate(purchase.purchased_at)}
                      </div>
                      {daysRemaining !== null && (
                        <div className="flex items-center gap-1 mt-2">
                          <ClockCircleOutlined className={daysRemaining < 30 ? 'text-orange-500' : 'text-slate-400'} />
                          <Text 
                            type={daysRemaining < 30 ? 'warning' : 'secondary'} 
                            className="text-xs"
                          >
                            {daysRemaining > 0 
                              ? `${daysRemaining} days remaining`
                              : 'Expires today'}
                          </Text>
                        </div>
                      )}
                      {!purchase.expires_at && (
                        <div className="text-xs text-slate-400 mt-2">No expiration</div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Purchase History */}
      {pastPurchases.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <HistoryOutlined className="text-slate-400" />
            <Title level={5} className="!mb-0 text-slate-600">Purchase History</Title>
            <Tag>{pastPurchases.length}</Tag>
          </div>
          <div className="space-y-2">
            {pastPurchases.map((purchase) => (
              <Card key={purchase.id} size="small" className="rounded-lg bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {iconMap[purchase.icon] || iconMap.star}
                    <div>
                      <Text className="text-slate-700">{purchase.offering_name}</Text>
                      <div className="text-xs text-slate-400">
                        {formatDate(purchase.purchased_at)}
                      </div>
                    </div>
                  </div>
                  <Space>
                    <Tag color={getStatusColor(purchase.status)}>
                      {purchase.status?.toUpperCase()}
                    </Tag>
                    {isAdminView && (
                      <Tag color={getPaymentStatusColor(purchase.payment_status)}>
                        {purchase.payment_status?.toUpperCase()}
                      </Tag>
                    )}
                    <Text type="secondary">
                      {formatCurrency ? formatCurrency(purchase.offering_price) : `€${purchase.offering_price}`}
                    </Text>
                  </Space>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberPurchasesSection;
