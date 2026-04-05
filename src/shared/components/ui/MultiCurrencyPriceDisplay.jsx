import PropTypes from 'prop-types';
import { Space, Typography, Tooltip } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

// Helper to ensure price is a number
const toNumber = (val) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
};

const { Text } = Typography;

/**
 * MultiCurrencyPriceDisplay - Shows prices in multiple currencies
 * 
 * Props:
 * - prices: Array of {currencyCode, price} - multi-currency prices
 * - price: Number - fallback single price
 * - currency: String - fallback currency code
 * - showAll: Boolean - show all prices or just primary (default: false)
 * - size: 'small' | 'default' | 'large' - text size
 * - direction: 'vertical' | 'horizontal' - layout direction
 */
function MultiCurrencyPriceDisplay({ 
  prices, 
  price, 
  currency, 
  showAll = false,
  size = 'default',
  direction = 'vertical'
}) {
  const { formatCurrency, userCurrency, convertCurrency } = useCurrency();
  
  // Normalize prices array, ensuring all prices are numbers
  const allPrices = prices && prices.length > 0 
    ? prices.map(p => ({ ...p, price: toNumber(p.price) }))
    : (price != null ? [{ currencyCode: currency || 'EUR', price: toNumber(price) }] : []);
  
  if (allPrices.length === 0) {
    return <Text type="secondary">No price</Text>;
  }
  
  // Find price in user's currency, or convert the primary price
  const userPrice = allPrices.find(p => p.currencyCode === userCurrency);
  const basePrimaryPrice = allPrices[0];
  
  // If user's currency is not in the prices array, convert from base price
  let primaryPrice;
  if (userPrice) {
    primaryPrice = userPrice;
  } else if (convertCurrency && basePrimaryPrice.currencyCode !== userCurrency) {
    // Convert to user's preferred currency for display
    const convertedPrice = convertCurrency(basePrimaryPrice.price, basePrimaryPrice.currencyCode, userCurrency);
    primaryPrice = { currencyCode: userCurrency, price: convertedPrice, isConverted: true };
  } else {
    primaryPrice = basePrimaryPrice;
  }
  
  const sizeStyles = {
    small: { fontSize: '12px' },
    default: { fontSize: '14px' },
    large: { fontSize: '18px', fontWeight: 600 }
  };
  
  // If only showing primary price
  if (!showAll || allPrices.length === 1) {
    const hasMultiple = allPrices.length > 1;
    const showOriginal = primaryPrice.isConverted && basePrimaryPrice;
    return (
      <span style={sizeStyles[size]}>
        {formatCurrency(primaryPrice.price, primaryPrice.currencyCode)}
        {showOriginal && (
          <Tooltip title={`Original: ${formatCurrency(basePrimaryPrice.price, basePrimaryPrice.currencyCode)}`}>
            <GlobalOutlined style={{ marginLeft: 4, color: '#52c41a', cursor: 'help', fontSize: '12px' }} />
          </Tooltip>
        )}
        {hasMultiple && !showOriginal && (
          <Tooltip 
            title={
              <div>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>Available in:</div>
                {allPrices.map((p, idx) => (
                  <div key={idx}>{formatCurrency(p.price, p.currencyCode)}</div>
                ))}
              </div>
            }
          >
            <GlobalOutlined style={{ marginLeft: 4, color: '#1890ff', cursor: 'help' }} />
          </Tooltip>
        )}
      </span>
    );
  }
  
  // Show all prices
  if (direction === 'horizontal') {
    return (
      <Space size="small" wrap>
        {allPrices.map((p, idx) => (
          <Text 
            key={idx} 
            style={{
              ...sizeStyles[size],
              fontWeight: idx === 0 ? 600 : 400,
              color: p.currencyCode === userCurrency ? '#1890ff' : undefined
            }}
          >
            {formatCurrency(p.price, p.currencyCode)}
          </Text>
        ))}
      </Space>
    );
  }
  
  // Vertical layout
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {allPrices.map((p, idx) => (
        <Text 
          key={idx} 
          style={{
            ...sizeStyles[idx === 0 ? size : 'small'],
            fontWeight: idx === 0 ? 600 : 400,
            color: p.currencyCode === userCurrency && idx !== 0 ? '#1890ff' : undefined,
            opacity: idx === 0 ? 1 : 0.7
          }}
        >
          {formatCurrency(p.price, p.currencyCode)}
        </Text>
      ))}
    </div>
  );
}

MultiCurrencyPriceDisplay.propTypes = {
  prices: PropTypes.arrayOf(PropTypes.shape({
    currencyCode: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
  })),
  price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  currency: PropTypes.string,
  showAll: PropTypes.bool,
  size: PropTypes.oneOf(['small', 'default', 'large']),
  direction: PropTypes.oneOf(['vertical', 'horizontal'])
};

export default MultiCurrencyPriceDisplay;
