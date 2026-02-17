import { useState, useEffect } from 'react';
import { 
  Form, 
  InputNumber, 
  Select, 
  Button, 
  Space, 
  Card, 
  Row, 
  Col, 
  Typography,
  Tooltip 
} from 'antd';
import { PlusOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Text } = Typography;

/**
 * MultiCurrencyPriceInput - A form component for managing prices in multiple currencies
 * 
 * Props:
 * - name: Form field name (default: 'prices')
 * - label: Form label (default: 'Prices')
 * - primaryCurrencyName: Field name for primary currency (for backwards compat)
 * - primaryPriceName: Field name for primary price (for backwards compat)
 * - required: Whether at least one price is required (default: true)
 * - onChange: Callback when prices change
 * - initialPrices: Initial prices array [{currencyCode, price}]
 * - compact: Use compact layout (default: false)
 */
function MultiCurrencyPriceInput({ 
  name = 'prices',
  label = 'Prices',
  primaryCurrencyName = 'currency',
  primaryPriceName = 'price',
  required = true,
  onChange,
  initialPrices,
  compact = false,
  form
}) {
  const { getSupportedCurrencies, getCurrencySymbol, businessCurrency } = useCurrency();
  const supportedCurrencies = getSupportedCurrencies();
  
  // Track which currencies are currently in use
  const [prices, setPrices] = useState(initialPrices || []);
  
  // Initialize with business currency if no initial prices
  useEffect(() => {
    if ((!prices || prices.length === 0) && businessCurrency) {
      const defaultPrice = { currencyCode: businessCurrency, price: null };
      setPrices([defaultPrice]);
      if (form) {
        form.setFieldValue(name, [defaultPrice]);
        form.setFieldValue(primaryCurrencyName, businessCurrency);
      }
    }
  }, [businessCurrency, form, name, prices, primaryCurrencyName]);

  // Sync initialPrices when they change (e.g., when editing)
  useEffect(() => {
    if (initialPrices && initialPrices.length > 0) {
      setPrices(initialPrices);
      if (form) {
        form.setFieldValue(name, initialPrices);
        // Set primary price/currency to first item
        form.setFieldValue(primaryCurrencyName, initialPrices[0]?.currencyCode);
        form.setFieldValue(primaryPriceName, initialPrices[0]?.price);
      }
    }
  }, [initialPrices, form, name, primaryCurrencyName, primaryPriceName]);

  const handleAddCurrency = () => {
    // Find a currency that's not already in use
    const usedCurrencies = prices.map(p => p.currencyCode);
    const availableCurrency = supportedCurrencies.find(c => !usedCurrencies.includes(c.value));
    
    if (availableCurrency) {
      const newPrices = [...prices, { currencyCode: availableCurrency.value, price: null }];
      setPrices(newPrices);
      if (form) {
        form.setFieldValue(name, newPrices);
      }
      if (onChange) {
        onChange(newPrices);
      }
    }
  };

  const handleRemoveCurrency = (index) => {
    const newPrices = prices.filter((_, i) => i !== index);
    setPrices(newPrices);
    
    if (form) {
      form.setFieldValue(name, newPrices);
      // Update primary price/currency to first remaining item
      if (newPrices.length > 0) {
        form.setFieldValue(primaryCurrencyName, newPrices[0]?.currencyCode);
        form.setFieldValue(primaryPriceName, newPrices[0]?.price);
      }
    }
    
    if (onChange) {
      onChange(newPrices);
    }
  };

  const handleCurrencyChange = (index, newCurrencyCode) => {
    const newPrices = prices.map((p, i) => 
      i === index ? { ...p, currencyCode: newCurrencyCode } : p
    );
    setPrices(newPrices);
    
    if (form) {
      form.setFieldValue(name, newPrices);
      // Update primary currency if first item changed
      if (index === 0) {
        form.setFieldValue(primaryCurrencyName, newCurrencyCode);
      }
    }
    
    if (onChange) {
      onChange(newPrices);
    }
  };

  const handlePriceChange = (index, newPrice) => {
    const newPrices = prices.map((p, i) => 
      i === index ? { ...p, price: newPrice } : p
    );
    setPrices(newPrices);
    
    if (form) {
      form.setFieldValue(name, newPrices);
      // Update primary price if first item changed
      if (index === 0) {
        form.setFieldValue(primaryPriceName, newPrice);
      }
    }
    
    if (onChange) {
      onChange(newPrices);
    }
  };

  // Get currencies not yet used
  const getAvailableCurrencies = (currentIndex) => {
    const usedCurrencies = prices
      .filter((_, i) => i !== currentIndex)
      .map(p => p.currencyCode);
    return supportedCurrencies.filter(c => !usedCurrencies.includes(c.value));
  };

  const canAddMore = supportedCurrencies.length > prices.length;

  if (compact) {
    return (
      <Form.Item 
        label={
          <Space>
            {label}
            <Tooltip title="Set prices in different currencies for international customers">
              <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          </Space>
        }
        required={required}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {prices.map((priceItem, index) => (
            <Space key={index} style={{ width: '100%' }}>
              <Select
                value={priceItem.currencyCode || 'EUR'}
                onChange={(value) => handleCurrencyChange(index, value)}
                style={{ width: 100 }}
                options={getAvailableCurrencies(index)}
              />
              <InputNumber
                value={priceItem.price ?? 0}
                onChange={(value) => handlePriceChange(index, value)}
                min={0}
                step={0.01}
                precision={2}
                style={{ width: 120 }}
                placeholder="0.00"
                addonBefore={getCurrencySymbol(priceItem.currencyCode || 'EUR')}
              />
              {prices.length > 1 && (
                <Button 
                  type="text" 
                  danger 
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveCurrency(index)}
                />
              )}
            </Space>
          ))}
          {canAddMore && (
            <Button 
              type="dashed" 
              onClick={handleAddCurrency} 
              icon={<PlusOutlined />}
              size="small"
            >
              Add Currency
            </Button>
          )}
        </Space>
        
        {/* Hidden fields for backward compatibility */}
        <Form.Item name={name} hidden>
          <input type="hidden" />
        </Form.Item>
        <Form.Item name={primaryCurrencyName} hidden>
          <input type="hidden" />
        </Form.Item>
        <Form.Item name={primaryPriceName} hidden>
          <input type="hidden" />
        </Form.Item>
      </Form.Item>
    );
  }

  return (
    <Card 
      size="small" 
      title={
        <Space>
          {label}
          <Tooltip title="Set prices in different currencies. The first currency will be used as the primary/default price.">
            <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
          </Tooltip>
        </Space>
      }
      extra={
        canAddMore && (
          <Button 
            type="primary" 
            size="small" 
            onClick={handleAddCurrency} 
            icon={<PlusOutlined />}
          >
            Add Currency
          </Button>
        )
      }
      style={{ marginBottom: 16 }}
    >
      {prices.length === 0 ? (
        <Text type="secondary">No prices configured. Click "Add Currency" to set prices.</Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          {prices.map((priceItem, index) => (
            <Row key={index} gutter={8} align="middle">
              <Col span={8}>
                <Select
                  value={priceItem.currencyCode || 'EUR'}
                  onChange={(value) => handleCurrencyChange(index, value)}
                  style={{ width: '100%' }}
                  options={getAvailableCurrencies(index)}
                  placeholder="Select currency"
                />
              </Col>
              <Col span={12}>
                <InputNumber
                  value={priceItem.price ?? 0}
                  onChange={(value) => handlePriceChange(index, value)}
                  min={0}
                  step={0.01}
                  precision={2}
                  style={{ width: '100%' }}
                  placeholder="Enter price"
                  addonBefore={getCurrencySymbol(priceItem.currencyCode || 'EUR')}
                />
              </Col>
              <Col span={4}>
                {prices.length > 1 ? (
                  <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveCurrency(index)}
                  />
                ) : (
                  <Tooltip title="At least one price is required">
                    <Text type="secondary" style={{ fontSize: 12 }}>Primary</Text>
                  </Tooltip>
                )}
              </Col>
            </Row>
          ))}
        </Space>
      )}

      {/* Hidden fields for backward compatibility with legacy single-price API */}
      <Form.Item name={name} hidden noStyle>
        <input type="hidden" />
      </Form.Item>
      <Form.Item name={primaryCurrencyName} hidden noStyle>
        <input type="hidden" />
      </Form.Item>
      <Form.Item name={primaryPriceName} hidden noStyle>
        <input type="hidden" />
      </Form.Item>
    </Card>
  );
}

export default MultiCurrencyPriceInput;
