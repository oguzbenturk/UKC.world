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
 * @param {'dark'|'light'} [props.variant] - Input chrome: dark (default) for dark panels, light for white/slate surfaces
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Backend `error` field when POST /vouchers/validate returns 400 */
const VOUCHER_VALIDATE_ERROR_TEXT = {
  INVALID_CODE: 'This promo code does not exist.',
  INACTIVE: 'This promo code is no longer active.',
  NOT_YET_VALID: 'This promo code is not active yet.',
  EXPIRED: 'This promo code has expired.',
  FULLY_REDEEMED: 'This promo code has reached its maximum number of uses.',
  ALREADY_USED: 'This promo code has already been used.',
  ALREADY_USED_BY_USER: 'You have already used this promo code.',
  USER_LIMIT_REACHED: 'You have used this promo code as many times as allowed for your account.',
  NOT_AUTHORIZED: 'This promo code is not available for your account.',
  ROLE_NOT_ALLOWED: 'This promo code is not available for your account type.',
  NOT_FIRST_PURCHASE: 'This promo code is only valid for first-time purchases.',
  WRONG_CONTEXT: 'This promo code cannot be used for this type of purchase.',
  NOT_APPLICABLE: 'This promo code cannot be applied to this item.',
  EXCLUDED_ITEM: 'This promo code cannot be applied to this item.',
  MINIMUM_NOT_MET: 'Your order does not meet the minimum amount for this promo code.',
  CURRENCY_MISMATCH: 'This promo code is not valid for this currency.',
  SYSTEM_ERROR: 'Unable to validate this promo code. Please try again.',
};

function getVoucherValidateErrorMessage(err) {
  if (err?.networkError && err.networkMessage) return err.networkMessage;
  const d = err?.response?.data;
  if (d && typeof d.message === 'string' && d.message.trim()) {
    return d.message.trim();
  }
  const code = d?.error;
  if (code && typeof code === 'string' && VOUCHER_VALIDATE_ERROR_TEXT[code]) {
    return VOUCHER_VALIDATE_ERROR_TEXT[code];
  }
  if (Array.isArray(d?.errors) && d.errors.length > 0) {
    const parts = d.errors
      .map((e) => (typeof e === 'string' ? e : e?.message || e?.msg))
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  if (typeof d?.error === 'string' && d.error.trim() && !/^[A-Z][A-Z0-9_]*$/.test(d.error.trim())) {
    return d.error.trim();
  }
  return err?.message || 'Failed to validate code';
}

const PromoCodeInput = ({
  context,
  amount = 0,
  currency = 'EUR',
  serviceId,
  onValidCode,
  onClear,
  disabled = false,
  appliedVoucher = null,
  variant = 'dark',
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
      const payload = {
        code: code.trim(),
        context,
        amount,
        currency,
      };
      if (serviceId != null && String(serviceId).trim() !== '' && UUID_RE.test(String(serviceId))) {
        payload.serviceId = String(serviceId);
      }

      const response = await apiClient.post('/vouchers/validate', payload);
      const data = response?.data;

      if (
        data?.success === true
        && data.voucher
        && data.discount != null
        && (data.voucher.id || data.voucher.code)
      ) {
        setValidationResult(data);
        onValidCode?.({
          ...data.voucher,
          discount: data.discount,
        });
        return;
      }

      setError(
        (typeof data?.message === 'string' && data.message.trim())
          ? data.message.trim()
          : (data?.error && VOUCHER_VALIDATE_ERROR_TEXT[data.error])
            ? VOUCHER_VALIDATE_ERROR_TEXT[data.error]
            : 'This promo code could not be applied.'
      );
      setValidationResult(null);
    } catch (err) {
      setError(getVoucherValidateErrorMessage(err));
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

  const inputClass =
    variant === 'light'
      ? '!bg-white !border-slate-200 !text-slate-900 [&_input]:!text-slate-900 [&_input::placeholder]:!text-slate-400 hover:!border-duotone-blue/40 focus-within:!border-duotone-blue transition-colors'
      : '!bg-white/5 !border-white/10 !text-white [&_input]:!text-white [&_input::placeholder]:!text-white/50 [&::placeholder]:!text-white/50 hover:!border-[#00a8c4]/50 focus-within:!border-[#00a8c4] transition-colors';

  const prefixClass = variant === 'light' ? 'text-slate-400' : 'text-white/40';

  const applyBtnClass =
    variant === 'light'
      ? 'font-duotone-bold !bg-duotone-blue !text-white !border-none hover:!opacity-90 disabled:!bg-slate-100 disabled:!text-slate-400 disabled:!border-slate-200 transition-all'
      : 'font-duotone-bold !bg-[#00a8c4] !text-white !border-none hover:!opacity-90 disabled:!bg-white/10 disabled:!text-white/30 transition-all';

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
          prefix={<GiftOutlined className={prefixClass} />}
          style={{ textTransform: 'uppercase' }}
          status={error ? 'error' : undefined}
          className={inputClass}
        />
        <Button
          type="primary"
          onClick={handleValidate}
          loading={validating}
          disabled={disabled || !code.trim()}
          className={applyBtnClass}
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
          role="alert"
          className={variant === 'light' ? '!border-red-200 !bg-red-50 [&_.ant-alert-message]:!text-red-900' : ''}
          style={{ padding: '8px 12px' }}
        />
      )}
    </div>
  );
};

export default PromoCodeInput;
