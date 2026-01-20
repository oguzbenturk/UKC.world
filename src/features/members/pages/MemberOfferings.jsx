import { useState } from 'react';
import { Button, Spin, Alert, message, Modal, Space } from 'antd';
import { 
  CrownOutlined, 
  TrophyOutlined, 
  StarOutlined, 
  CheckCircleFilled,
  WalletOutlined,
  ShopOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';

const fetchMemberOfferings = async () => {
  const { data } = await apiClient.get('/member-offerings');
  return data;
};

const fetchMyPurchases = async () => {
  const { data } = await apiClient.get('/member-offerings/my-purchases');
  return data;
};

const purchaseMembership = async ({ offeringId, paymentMethod }) => {
  const { data } = await apiClient.post(`/member-offerings/${offeringId}/purchase`, { paymentMethod });
  return data;
};

const getOfferingIcon = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('platinum') || n.includes('bundle')) return <TrophyOutlined />;
  if (n.includes('vip') || n.includes('beach')) return <CrownOutlined />;
  return <StarOutlined />;
};

const parseFeatures = (features) => {
  if (!features) return [];
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') {
    try {
      return JSON.parse(features);
    } catch {
      return features.split('\n').filter(Boolean);
    }
  }
  return [];
};

// Sub-component for image-based card
const ImageCard = ({ offering, displayPrice, formatCurrency, onPurchase, isOwned }) => {
  const imgSrc = offering.image_url;

  return (
    <div 
      className="offering-card"
      style={{
        borderRadius: '20px',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        opacity: isOwned ? 0.85 : 1,
      }}
    >
      {/* Owned Badge */}
      {isOwned && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
        }}>
          <CheckCircleFilled /> Owned
        </div>
      )}
      <div style={{
        position: 'relative',
        width: '100%',
        minHeight: '400px',
        backgroundImage: `url(${imgSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          marginTop: 'auto',
          padding: '24px',
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}>
            <div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: '800', 
                color: '#fff',
                lineHeight: '1',
                textShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }}>
                {formatCurrency(displayPrice)}
              </div>
              <div style={{ 
                fontSize: '13px', 
                color: 'rgba(255,255,255,0.8)', 
                marginTop: '4px',
              }}>
                per {offering.period || 'month'}
              </div>
            </div>
            <Button
              type="primary"
              size="large"
              onClick={() => onPurchase(offering)}
              disabled={isOwned}
              style={{ 
                height: '48px', 
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: '600',
                background: isOwned ? '#9ca3af' : '#fff',
                color: isOwned ? '#fff' : '#1a1a1a',
                border: 'none',
                boxShadow: isOwned ? 'none' : '0 4px 14px rgba(0, 0, 0, 0.2)',
                paddingLeft: '24px',
                paddingRight: '24px',
                cursor: isOwned ? 'not-allowed' : 'pointer',
              }}
            >
              {isOwned ? 'Already Owned' : 'Get Started'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Feature list sub-component
const FeatureList = ({ features, isPopular }) => (
  <div style={{ flex: 1, marginBottom: '24px' }}>
    {features.map((feature) => (
      <div 
        key={feature}
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '12px',
          color: '#374151',
          fontSize: '14px',
        }}
      >
        <CheckCircleFilled style={{ 
          color: isPopular ? '#1890ff' : '#10b981',
          marginRight: '10px',
          fontSize: '16px',
        }} />
        <span>{feature}</span>
      </div>
    ))}
  </div>
);

// Popular badge component
const PopularBadge = () => (
  <div style={{
    background: '#1890ff',
    color: '#fff',
    textAlign: 'center',
    padding: '10px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  }}>
    <ThunderboltOutlined style={{ marginRight: '6px' }} />
    Most Popular
  </div>
);

// Card header with icon and title
const CardHeader = ({ name, description, isPopular }) => (
  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
    <div style={{ 
      width: '56px',
      height: '56px',
      borderRadius: '14px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '24px', 
      color: isPopular ? '#1890ff' : '#1890ff',
      background: isPopular ? '#e6f4ff' : '#e6f4ff',
      marginBottom: '16px',
    }}>
      {getOfferingIcon(name)}
    </div>
    
    <h3 style={{ 
      fontSize: '22px', 
      fontWeight: '700', 
      margin: '0 0 6px 0',
      color: '#1a1a1a' 
    }}>
      {name}
    </h3>
    
    {description && (
      <p style={{ 
        color: '#6b7280', 
        fontSize: '14px', 
        margin: 0,
        lineHeight: '1.5' 
      }}>
        {description}
      </p>
    )}
  </div>
);

// Price display component
const PriceDisplay = ({ price, period, formatCurrency }) => (
  <div style={{ textAlign: 'center', marginBottom: '28px' }}>
    <div style={{ 
      fontSize: '42px', 
      fontWeight: '800', 
      color: '#1a1a1a',
      lineHeight: '1',
      letterSpacing: '-1px',
    }}>
      {formatCurrency(price)}
    </div>
    <div style={{ 
      fontSize: '14px', 
      color: '#9ca3af', 
      marginTop: '6px',
      fontWeight: '500',
    }}>
      per {period || 'month'}
    </div>
  </div>
);

// Sub-component for default card without image
const DefaultCard = ({ offering, displayPrice, formatCurrency, parsedFeatures, onPurchase, isPopular, isOwned }) => {
  const imgSrc = offering.image_url || null;

  return (
    <div 
      className="offering-card"
      style={{
        background: isPopular 
          ? '#1890ff'
          : '#ffffff',
        borderRadius: '20px',
        padding: isPopular ? '3px' : '0',
        height: '100%',
        position: 'relative',
        boxShadow: isPopular 
          ? '0 20px 40px rgba(24, 144, 255, 0.3)'
          : '0 4px 24px rgba(0, 0, 0, 0.06)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        opacity: isOwned ? 0.9 : 1,
      }}
    >
      {/* Owned Badge */}
      {isOwned && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
        }}>
          <CheckCircleFilled /> Owned
        </div>
      )}
      <div style={{
        background: '#ffffff',
        borderRadius: isPopular ? '18px' : '20px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {isPopular && <PopularBadge />}

        <div style={{ padding: '32px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Show image inline when use_image_background is false */}
          {imgSrc && (
            <div style={{ 
              marginBottom: '20px',
              borderRadius: '12px',
              overflow: 'hidden',
              maxHeight: '180px',
            }}>
              <img 
                src={imgSrc}
                alt={offering.name}
                style={{
                  width: '100%',
                  height: 'auto',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
          )}
          
          <CardHeader name={offering.name} description={offering.description} isPopular={isPopular} />
          <PriceDisplay price={displayPrice} period={offering.period} formatCurrency={formatCurrency} />
          <FeatureList features={parsedFeatures} isPopular={isPopular} />

          <Button
            type={isPopular ? 'primary' : 'default'}
            size="large"
            block
            onClick={() => onPurchase(offering)}
            disabled={isOwned}
            style={{ 
              height: '52px', 
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              background: isOwned 
                ? '#9ca3af' 
                : isPopular 
                  ? '#1890ff' 
                  : undefined,
              border: isOwned ? 'none' : isPopular ? 'none' : '2px solid #e5e7eb',
              color: isOwned ? '#fff' : isPopular ? '#fff' : '#374151',
              boxShadow: isOwned ? 'none' : isPopular ? '0 4px 14px rgba(24, 144, 255, 0.4)' : 'none',
              cursor: isOwned ? 'not-allowed' : 'pointer',
            }}
          >
            {isOwned ? 'Already Owned' : isPopular ? 'Get Started Now' : 'Choose Plan'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Main card component
const OfferingCard = ({ offering, onPurchase, formatCurrency, convertCurrency, displayCurrency, businessCurrency, isPopular, isOwned }) => {
  const price = offering.price || 0;
  const displayPrice = convertCurrency(price, businessCurrency, displayCurrency);
  const parsedFeatures = parseFeatures(offering.features);

  // Use image as background if image exists AND use_image_background is true
  if (offering.image_url && offering.use_image_background !== false) {
    return (
      <ImageCard 
        offering={offering}
        displayPrice={displayPrice}
        formatCurrency={formatCurrency}
        onPurchase={onPurchase}
        isOwned={isOwned}
      />
    );
  }

  // Use default card (with inline image if image_url exists)
  return (
    <DefaultCard
      offering={offering}
      displayPrice={displayPrice}
      formatCurrency={formatCurrency}
      parsedFeatures={parsedFeatures}
      onPurchase={onPurchase}
      isPopular={isPopular}
      isOwned={isOwned}
    />
  );
};

const MemberOfferings = () => {
  const queryClient = useQueryClient();
  const { formatCurrency, convertCurrency, displayCurrency, businessCurrency } = useCurrency();
  const [purchaseModal, setPurchaseModal] = useState({ visible: false, offering: null });

  const { data: offerings = [], isLoading, error } = useQuery({
    queryKey: ['member-offerings'],
    queryFn: fetchMemberOfferings,
  });

  // Fetch user's purchases to determine owned offerings
  const { data: myPurchases = [] } = useQuery({
    queryKey: ['my-member-purchases'],
    queryFn: fetchMyPurchases,
  });

  // Create a set of owned offering IDs (active purchases only)
  const ownedOfferingIds = new Set(
    myPurchases
      .filter(p => p.status === 'active' && (!p.expires_at || new Date(p.expires_at) > new Date()))
      .map(p => p.offering_id)
  );

  const purchaseMutation = useMutation({
    mutationFn: purchaseMembership,
    onSuccess: () => {
      message.success('🎉 Membership activated! Welcome aboard.');
      setPurchaseModal({ visible: false, offering: null });
      queryClient.invalidateQueries(['member-offerings']);
      queryClient.invalidateQueries(['my-member-purchases']);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.response?.data?.message || 'Purchase failed. Please try again.');
    },
  });

  const handlePurchase = (offering) => {
    setPurchaseModal({ visible: true, offering });
  };

  const confirmPurchase = (paymentMethod) => {
    if (!purchaseModal.offering) return;
    purchaseMutation.mutate({
      offeringId: purchaseModal.offering.id,
      paymentMethod: paymentMethod,
    });
  };

  const getIsPopular = (offering) => {
    const n = offering.name?.toLowerCase() || '';
    return n.includes('vip') || n.includes('beach');
  };

  return (
    <div style={{ 
      padding: '48px 24px', 
      maxWidth: '1100px', 
      margin: '0 auto',
      minHeight: 'calc(100vh - 120px)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '56px' }}>
        <h1 style={{ 
          fontSize: '40px', 
          fontWeight: '800', 
          margin: '0 0 16px 0',
          color: '#1a1a1a',
          letterSpacing: '-1px',
        }}>
          Unlock Premium Benefits
        </h1>
        <p style={{ 
          color: '#6b7280', 
          fontSize: '18px', 
          margin: 0,
          maxWidth: '500px',
          marginLeft: 'auto',
          marginRight: 'auto',
          lineHeight: '1.6',
        }}>
          Join our membership program and enjoy exclusive perks, discounts, and priority access
        </p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <Spin size="large" />
        </div>
      ) : error ? (
        <Alert 
          message="Unable to load memberships" 
          description={error.message}
          type="error" 
          showIcon 
          style={{ maxWidth: '500px', margin: '0 auto', borderRadius: '12px' }}
        />
      ) : offerings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <StarOutlined style={{ fontSize: '48px', color: '#d1d5db', marginBottom: '16px' }} />
          <p style={{ color: '#9ca3af', fontSize: '16px' }}>No membership plans available yet.</p>
        </div>
      ) : (
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(offerings.length, 3)}, 1fr)`,
          gap: '28px',
          alignItems: 'stretch',
          maxWidth: offerings.length === 2 ? '700px' : offerings.length === 1 ? '380px' : '100%',
          margin: '0 auto',
        }}>
          {offerings.map((offering) => (
            <OfferingCard
              key={offering.id}
              offering={offering}
              onPurchase={handlePurchase}
              formatCurrency={formatCurrency}
              convertCurrency={convertCurrency}
              displayCurrency={displayCurrency}
              businessCurrency={businessCurrency}
              isPopular={getIsPopular(offering)}
              isOwned={ownedOfferingIds.has(offering.id)}
            />
          ))}
        </div>
      )}

      <div style={{ 
        textAlign: 'center', 
        marginTop: '48px',
        color: '#9ca3af',
        fontSize: '13px',
      }}>
        <span style={{ marginRight: '24px' }}>✓ Cancel anytime</span>
        <span style={{ marginRight: '24px' }}>✓ Instant activation</span>
        <span>✓ Secure payment</span>
      </div>

      <style>{`
        .offering-card:hover {
          transform: translateY(-4px);
        }
        @media (max-width: 768px) {
          .offering-card {
            max-width: 400px;
            margin: 0 auto;
          }
        }
      `}</style>

      <Modal
        open={purchaseModal.visible}
        onCancel={() => setPurchaseModal({ visible: false, offering: null })}
        footer={null}
        width={420}
        centered
        title={null}
        styles={{
          body: { padding: '0' },
          content: { borderRadius: '20px', overflow: 'hidden' },
        }}
      >
        {purchaseModal.offering && (
          <>
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '32px 24px',
              textAlign: 'center',
              color: '#fff',
            }}>
              <div style={{ 
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px', 
                background: 'rgba(255,255,255,0.2)',
                marginBottom: '16px',
              }}>
                {getOfferingIcon(purchaseModal.offering.name)}
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 4px 0' }}>
                {purchaseModal.offering.name}
              </h3>
              <p style={{ margin: 0, opacity: 0.9, fontSize: '14px' }}>
                Complete your purchase
              </p>
            </div>

            <div style={{ padding: '28px 24px' }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Button
                  block
                  size="large"
                  type="primary"
                  icon={<WalletOutlined />}
                  onClick={() => confirmPurchase('wallet')}
                  loading={purchaseMutation.isPending}
                  style={{ 
                    height: '56px', 
                    borderRadius: '12px',
                    fontSize: '15px',
                    fontWeight: '600',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                  }}
                >
                  Pay with Wallet
                </Button>

                <Button
                  block
                  size="large"
                  icon={<ShopOutlined />}
                  onClick={() => confirmPurchase('cash')}
                  loading={purchaseMutation.isPending}
                  style={{ 
                    height: '56px', 
                    borderRadius: '12px',
                    fontSize: '15px',
                    fontWeight: '600',
                    border: '2px solid #e5e7eb',
                    color: '#374151',
                  }}
                >
                  Pay at Reception
                </Button>
              </Space>

              <p style={{ 
                fontSize: '12px', 
                color: '#9ca3af', 
                marginTop: '20px',
                textAlign: 'center',
                lineHeight: '1.5',
              }}>
                By continuing you agree to our terms of service.
              </p>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default MemberOfferings;
