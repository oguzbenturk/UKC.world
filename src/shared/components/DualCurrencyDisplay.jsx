import PropTypes from 'prop-types';
import { Typography, Tooltip } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Text } = Typography;

/**
 * DualCurrencyDisplay - Shows amount in both the original currency and user's preferred currency
 * 
 * When the original currency differs from user's preferred currency,
 * displays: "€100 / ₺3,500" or "€100 (₺3,500)" based on format prop
 * 
 * Props:
 * - amount: Number - the monetary value
 * - currency: String - the original currency code (e.g., 'EUR', 'TRY')
 * - showBoth: Boolean - force showing both currencies even if same (default: auto-detect)
 * - format: 'slash' | 'parentheses' | 'stacked' - display format (default: 'slash')
 * - size: 'small' | 'default' | 'large' - text size
 * - primaryBold: Boolean - make primary amount bold (default: true)
 * - className: String - additional CSS classes
 */
function DualCurrencyDisplay({ 
  amount, 
  currency, 
  showBoth = 'auto',
  format = 'slash',
  size = 'default',
  primaryBold = true,
  className = ''
}) {
  const { formatCurrency, convertCurrency, userCurrency, businessCurrency } = useCurrency();
  
  const numAmount = parseFloat(amount) || 0;
  const originalCurrency = currency || businessCurrency || 'EUR';
  const targetCurrency = userCurrency || 'EUR';
  
  // Determine if we should show both currencies
  const shouldShowBoth = showBoth === true || 
    (showBoth === 'auto' && originalCurrency !== targetCurrency);
  
  // Format the original amount
  const originalFormatted = formatCurrency(numAmount, originalCurrency);
  
  // If currencies are the same or we don't need both, show single amount
  if (!shouldShowBoth || originalCurrency === targetCurrency) {
    return (
      <span className={className} style={getSizeStyle(size, primaryBold)}>
        {originalFormatted}
      </span>
    );
  }
  
  // Convert to user's currency
  const convertedAmount = convertCurrency(numAmount, originalCurrency, targetCurrency);
  const convertedFormatted = formatCurrency(convertedAmount, targetCurrency);
  
  // Render based on format
  if (format === 'stacked') {
    return (
      <div className={`flex flex-col ${className}`}>
        <span style={getSizeStyle(size, primaryBold)}>
          {originalFormatted}
        </span>
        <Text type="secondary" style={getSizeStyle('small', false)}>
          ≈ {convertedFormatted}
        </Text>
      </div>
    );
  }
  
  if (format === 'parentheses') {
    return (
      <span className={className}>
        <span style={getSizeStyle(size, primaryBold)}>
          {originalFormatted}
        </span>
        <Text type="secondary" style={{ marginLeft: 4, ...getSizeStyle('small', false) }}>
          ({convertedFormatted})
        </Text>
      </span>
    );
  }
  
  // Default: slash format
  return (
    <Tooltip title={`Original: ${originalFormatted} → Converted: ${convertedFormatted}`}>
      <span className={className}>
        <span style={getSizeStyle(size, primaryBold)}>
          {originalFormatted}
        </span>
        <Text type="secondary" style={{ margin: '0 4px' }}>/</Text>
        <span style={getSizeStyle(size, false)}>
          {convertedFormatted}
        </span>
      </span>
    </Tooltip>
  );
}

function getSizeStyle(size, bold) {
  const sizes = {
    small: { fontSize: '12px' },
    default: { fontSize: '14px' },
    large: { fontSize: '18px' }
  };
  return {
    ...sizes[size] || sizes.default,
    fontWeight: bold ? 600 : 400
  };
}

DualCurrencyDisplay.propTypes = {
  amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  currency: PropTypes.string,
  showBoth: PropTypes.oneOf([true, false, 'auto']),
  format: PropTypes.oneOf(['slash', 'parentheses', 'stacked']),
  size: PropTypes.oneOf(['small', 'default', 'large']),
  primaryBold: PropTypes.bool,
  className: PropTypes.string
};

export default DualCurrencyDisplay;

/**
 * Hook version for cases where you need the formatted strings without the component
 */
export function useDualCurrency() {
  const { formatCurrency, convertCurrency, userCurrency, businessCurrency } = useCurrency();
  
  /**
   * Format an amount with both currencies
   * @param {number} amount - The monetary value
   * @param {string} currency - Original currency code
   * @param {object} options - Formatting options
   * @returns {object} { original, converted, both, shouldShowBoth }
   */
  const formatDual = (amount, currency, options = {}) => {
    const { format = 'slash' } = options;
    const numAmount = parseFloat(amount) || 0;
    const originalCurrency = currency || businessCurrency || 'EUR';
    const targetCurrency = userCurrency || 'EUR';
    
    const original = formatCurrency(numAmount, originalCurrency);
    const shouldShowBoth = originalCurrency !== targetCurrency;
    
    if (!shouldShowBoth) {
      return { original, converted: original, both: original, shouldShowBoth: false };
    }
    
    const convertedAmount = convertCurrency(numAmount, originalCurrency, targetCurrency);
    const converted = formatCurrency(convertedAmount, targetCurrency);
    
    let both;
    if (format === 'parentheses') {
      both = `${original} (${converted})`;
    } else if (format === 'stacked') {
      both = `${original}\n≈ ${converted}`;
    } else {
      both = `${original} / ${converted}`;
    }
    
    return { original, converted, both, shouldShowBoth: true };
  };
  
  return { formatDual, userCurrency, businessCurrency };
}
