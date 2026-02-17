/**
 * PromoCodeInput Component
 * 
 * A reusable component for entering and validating promo/voucher codes.
 * Shows validation status and discount information.
 */

import { useState } from 'react';
import { Alert, Button, Input, Space, Tag, Typography } from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  GiftOutlined, 
  LoadingOutlined,
  PercentageOutlined,
  TagOutlined,
  WalletOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Text } = Typography;

// Voucher type icons
const TYPE_ICONS = {
  percentage: <PercentageOutlined />,
  fixed_amount: <TagOutlined />,
  wallet_credit: <WalletOutlined />,
  free_service: <GiftOutlined />,
  package_upgrade: <GiftOutlined />
};

/**
 * PromoCodeInput
 * 
 * @param {Object} props
 * @param {string} props.context - Application context: 'lessons', 'rentals', 'accommodation', 'packages', 'wallet'
 * @param {number} props.amount - Current purchase amount
 * @param {string} props.currency - Currency code (default EUR)
 * @param {string} [props.serviceId] - Optional service ID for targeted vouchers
 * @param {function} props.onValidCode - Callback when a valid code is applied: (voucherData) => void
 * @param {function} props.onClear - Callback when code is cleared
 * @param {boolean} [props.disabled] - Disable the input
 * @param {Object} [props.appliedVoucher] - Currently applied voucher (for controlled mode)
 */
const PromoCodeInput = ({
  context,
  amount = 0,
  currency = 'EUR',
  serviceId,
  onValidCode,
  onClear,
  disabled = false,
  appliedVoucher = null
}) => {
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);
  const [validationResult, setValidationResult] = useState(null);

  const handleValidate = async () => {
    if (!code.trim()) {
      setError('Please enter a promo code');
      return;
    }

    setValidating(true);
    setError(null);
    setValidationResult(null);

    try {
      const response = await apiClient.post('/vouchers/validate', {
        code: code.trim(),
        context,
        amount,
        currency,
        serviceId
      });

      if (response.data.success) {
        setValidationResult(response.data);
        onValidCode?.({
          ...response.data.voucher,
          discount: response.data.discount
        });
      }
    } catch (err) {
      const errorData = err.response?.data;
      setError(errorData?.message || 'Failed to validate code');
      setValidationResult(null);
    } finally {
      setValidating(false);
    }
  };

  const handleClear = () => {
    setCode('');
    setError(null);
    setValidationResult(null);
    onClear?.();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !validating && !disabled) {
      handleValidate();
    }
  };

  // If there's an applied voucher (controlled mode), show that
  if (appliedVoucher) {
    return (
      <div className="border border-green-300 bg-green-50 rounded-lg p-3">
        <Space direction="vertical" size={4} className="w-full">
          <Space className="w-full justify-between">
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text strong>Promo Code Applied</Text>
            </Space>
            {!disabled && (
              <Button type="link" size="small" danger onClick={handleClear}>
                Remove
              </Button>
            )}
          </Space>
          <Space>
            <Tag color="blue" style={{ fontFamily: 'monospace' }}>
              {appliedVoucher.code}
            </Tag>
            <Text type="secondary">{appliedVoucher.name}</Text>
          </Space>
          <Text type="success" strong>
            {appliedVoucher.discount?.displayText}
          </Text>
        </Space>
      </div>
    );
  }

  // If validation was successful, show success state
  if (validationResult) {
    const { voucher, discount } = validationResult;
    return (
      <div className="border border-green-300 bg-green-50 rounded-lg p-3">
        <Space direction="vertical" size={4} className="w-full">
          <Space className="w-full justify-between">
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text strong>Promo Code Applied</Text>
            </Space>
            {!disabled && (
              <Button type="link" size="small" danger onClick={handleClear}>
                Remove
              </Button>
            )}
          </Space>
          <Space>
            <Tag color="blue" style={{ fontFamily: 'monospace' }}>
              {voucher.code}
            </Tag>
            <Text type="secondary">{voucher.name}</Text>
          </Space>
          <Text type="success" strong>
            {discount.displayText}
            {discount.discountAmount > 0 && (
              <> — You save {discount.discountAmount.toFixed(2)} {currency}</>
            )}
          </Text>
          {discount.walletCredit > 0 && (
            <Alert
              type="info"
              showIcon
              icon={<WalletOutlined />}
              message={`${discount.walletCredit} ${currency} will be added to your wallet`}
              style={{ marginTop: 8 }}
            />
          )}
        </Space>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Space.Compact className="w-full">
        <Input
          placeholder="Enter promo code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyPress={handleKeyPress}
          disabled={disabled || validating}
          prefix={<GiftOutlined style={{ color: '#999' }} />}
          style={{ textTransform: 'uppercase' }}
          status={error ? 'error' : undefined}
        />
        <Button
          type="primary"
          onClick={handleValidate}
          loading={validating}
          disabled={disabled || !code.trim()}
        >
          Apply
        </Button>
      </Space.Compact>
      
      {error && (
        <Alert
          type="error"
          showIcon
          icon={<CloseCircleOutlined />}
          message={error}
          style={{ padding: '4px 12px' }}
        />
      )}
    </div>
  );
};

export default PromoCodeInput;
