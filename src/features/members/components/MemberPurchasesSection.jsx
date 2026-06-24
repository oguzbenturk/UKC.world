// src/features/members/components/MemberPurchasesSection.jsx
import { Card, Typography, Tag, Space, Empty, Spin, Button, Tooltip, App } from 'antd';
import { CrownOutlined, StarOutlined, TrophyOutlined, ThunderboltOutlined, GiftOutlined, CheckCircleOutlined, ClockCircleOutlined, HistoryOutlined, PercentageOutlined, DeleteOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import { message } from '@/shared/utils/antdStatic';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';

// Roles allowed to delete a membership — kept in sync with the backend cancel endpoint
// (authorizeRoles(['admin','manager','developer','owner'])). Some callers hardcode
// isAdminView={true} (e.g. CustomerProfilePage), so gate the destructive action on the
// viewer's real role too, not just the prop.
const MEMBERSHIP_MANAGE_ROLES = ['admin', 'manager', 'developer', 'owner'];

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
 * @param {Map} props.discountsByEntity - Discount lookup map keyed by `${entityType}:${entityId}` (provided by EnhancedCustomerDetailModal)
 * @param {Function} props.onApplyDiscount - Callback fired when staff clicks Discount on a row; opens the ApplyDiscountModal in the parent
 * @param {boolean} props.readOnly - Hide write actions like Discount
 * @param {Function} props.onChanged - Optional callback fired after a membership is deleted (lets the parent refresh balances/financials)
 */
const MemberPurchasesSection = ({
  userId,
  isAdminView = false,
  compact = false,
  discountsByEntity = null,
  onApplyDiscount = null,
  readOnly = false,
  onChanged = null,
}) => {
  const { formatCurrency } = useCurrency();
  const { modal } = App.useApp();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const targetUserId = userId;

  // Fetch purchases - use admin endpoint if viewing another user's purchases
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['member-purchases', targetUserId, isAdminView],
    queryFn: async () => {
      if (!targetUserId) return [];

      // Admin viewing a customer's purchases
      if (isAdminView && userId) {
        const response = await apiClient.get(`/member-offerings/user/${userId}/purchases`);
        return Array.isArray(response.data) ? response.data : [];
      }

      // User viewing their own purchases
      const response = await apiClient.get('/member-offerings/my-purchases');
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!targetUserId,
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

  const fmt = (amount, currency) => {
    const num = Number(amount) || 0;
    if (formatCurrency) return formatCurrency(num, currency || undefined);
    return `${currency || '€'}${num.toFixed(2)}`;
  };

  // Returns { discount, original, final } for a purchase row.
  const lookupDiscount = (purchase) => {
    const original = Number(purchase.offering_price) || 0;
    if (!discountsByEntity || typeof discountsByEntity.get !== 'function') {
      return { discount: null, original, final: original };
    }
    const d = discountsByEntity.get(`member_purchase:${purchase.id}`) || null;
    if (!d) return { discount: null, original, final: original };
    const amt = Number(d.amount) || 0;
    return { discount: d, original, final: Math.max(0, original - amt) };
  };

  const renderPriceCell = (purchase) => {
    const { discount, original, final } = lookupDiscount(purchase);
    const currency = purchase.offering_currency || purchase.currency || undefined;
    if (!discount) {
      return <Text className="tabular-nums">{fmt(original, currency)}</Text>;
    }
    return (
      <Space size={4} wrap>
        <span className="tabular-nums line-through text-slate-400 text-xs">{fmt(original, currency)}</span>
        <span className="tabular-nums font-semibold text-emerald-600">{fmt(final, currency)}</span>
        <Tag color="orange" className="!m-0">−{Number(discount.percent)}%</Tag>
      </Space>
    );
  };

  const handleApplyDiscount = (purchase) => {
    if (!onApplyDiscount) return;
    onApplyDiscount({
      entityType: 'member_purchase',
      entityId: purchase.id,
      originalPrice: Number(purchase.offering_price) || 0,
      currency: purchase.offering_currency || purchase.currency || undefined,
      description: `${purchase.offering_name || 'Membership'} · ${formatDate(purchase.purchased_at)}`,
    });
  };

  const canDiscount = isAdminView && !readOnly && typeof onApplyDiscount === 'function';
  // Only managers/admins (matching the backend cancel endpoint) can delete a membership —
  // and only in an admin/staff view, never a customer's own read-only view.
  const canManageMemberships = MEMBERSHIP_MANAGE_ROLES.includes((currentUser?.role || '').toLowerCase());
  const canActions = isAdminView && !readOnly && canManageMemberships;

  // Soft cancel — keeps a "cancelled" record visible in Purchase History.
  const handleCancel = (purchase) => {
    const name = purchase.offering_name || 'membership';
    modal.confirm({
      title: 'Cancel membership',
      content: `Cancel "${name}"? Any wallet payment is refunded to the customer and the storage box is released. The membership is kept as "cancelled" in the purchase history for the record.`,
      okText: 'Cancel membership',
      okType: 'danger',
      cancelText: 'Keep',
      onOk: async () => {
        try {
          const { data } = await apiClient.post(`/member-offerings/admin/purchases/${purchase.id}/cancel`, { reason: 'admin_cancelled' });
          if (data?.refunded) {
            message.success(`Membership cancelled · ${fmt(data.refundAmount, data.refundCurrency)} refunded to wallet`);
          } else {
            message.warning('Membership cancelled. No wallet charge was found to refund — adjust the balance manually if needed.');
          }
          queryClient.invalidateQueries({ queryKey: ['member-purchases', targetUserId, isAdminView] });
          if (typeof onChanged === 'function') onChanged();
        } catch (err) {
          message.error(err?.response?.data?.error || 'Failed to cancel membership');
        }
      },
    });
  };

  // Hard delete — refunds + releases box like cancel, then physically removes the
  // membership so it disappears from every surface (active list, history, analytics).
  const handleDelete = (purchase) => {
    const name = purchase.offering_name || 'membership';
    modal.confirm({
      title: 'Delete membership permanently',
      content: `Permanently delete "${name}"? Any wallet payment is refunded and the storage box is released, then the membership is removed completely — it will no longer appear anywhere, including the purchase history. This cannot be undone.`,
      okText: 'Delete permanently',
      okType: 'danger',
      cancelText: 'Keep',
      onOk: async () => {
        try {
          const { data } = await apiClient.delete(`/member-offerings/admin/purchases/${purchase.id}`, { data: { reason: 'admin_deleted' } });
          if (data?.refunded) {
            message.success(`Membership deleted · ${fmt(data.refundAmount, data.refundCurrency)} refunded to wallet`);
          } else {
            message.success('Membership deleted permanently.');
          }
          queryClient.invalidateQueries({ queryKey: ['member-purchases', targetUserId, isAdminView] });
          if (typeof onChanged === 'function') onChanged();
        } catch (err) {
          message.error(err?.response?.data?.error || 'Failed to delete membership');
        }
      },
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
                        {canDiscount && (
                          <Button
                            type="link"
                            size="small"
                            icon={<PercentageOutlined />}
                            className="ml-auto !px-1"
                            onClick={() => handleApplyDiscount(purchase)}
                          >
                            Discount
                          </Button>
                        )}
                        {canActions && (
                          <span className={canDiscount ? 'flex items-center' : 'ml-auto flex items-center'}>
                            <Tooltip title="Cancel membership (keeps a cancelled record)">
                              <Button
                                type="text"
                                danger
                                size="small"
                                icon={<StopOutlined />}
                                className="!px-1"
                                onClick={() => handleCancel(purchase)}
                              />
                            </Tooltip>
                            <Tooltip title="Delete permanently (removes everywhere)">
                              <Button
                                type="text"
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                className="!px-1"
                                onClick={() => handleDelete(purchase)}
                              />
                            </Tooltip>
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 text-sm mt-1 flex items-center gap-1 flex-wrap">
                        {renderPriceCell(purchase)}
                        <span className="text-slate-400">• Purchased {formatDate(purchase.purchased_at)}</span>
                      </div>
                      {purchase.storage_unit != null && (
                        <div className="mt-1.5">
                          <Tag color="blue" className="text-xs">Storage Box #{purchase.storage_unit}</Tag>
                        </div>
                      )}
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
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    {iconMap[purchase.icon] || iconMap.star}
                    <div>
                      <Text className="text-slate-700">{purchase.offering_name}</Text>
                      <div className="text-xs text-slate-400">
                        {formatDate(purchase.purchased_at)}
                      </div>
                    </div>
                  </div>
                  <Space wrap size="small">
                    {purchase.storage_unit != null && (
                      <Tag color="blue">Box #{purchase.storage_unit}</Tag>
                    )}
                    <Tag color={getStatusColor(purchase.status)}>
                      {purchase.status?.toUpperCase()}
                    </Tag>
                    {isAdminView && (
                      <Tag color={getPaymentStatusColor(purchase.payment_status)}>
                        {purchase.payment_status?.toUpperCase()}
                      </Tag>
                    )}
                    {renderPriceCell(purchase)}
                    {canDiscount && (
                      <Button
                        type="link"
                        size="small"
                        icon={<PercentageOutlined />}
                        onClick={() => handleApplyDiscount(purchase)}
                      >
                        Discount
                      </Button>
                    )}
                    {canActions && purchase.status !== 'cancelled' && (
                      <Tooltip title="Cancel membership (keeps a cancelled record)">
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<StopOutlined />}
                          onClick={() => handleCancel(purchase)}
                        />
                      </Tooltip>
                    )}
                    {canActions && (
                      <Tooltip title="Delete permanently (removes everywhere)">
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleDelete(purchase)}
                        />
                      </Tooltip>
                    )}
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
