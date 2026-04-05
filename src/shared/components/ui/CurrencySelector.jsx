// src/shared/components/ui/CurrencySelector.jsx
import React from 'react';
import { Select } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;

const CurrencySelector = ({ 
  value, 
  onChange, 
  placeholder = "Select currency",
  size = "default",
  style = {},
  disabled = false,
  showSymbol = true
}) => {
  const { getSupportedCurrencies, loading } = useCurrency();
  const currencies = getSupportedCurrencies();

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      size={size}
      style={style}
      disabled={disabled || loading}
      loading={loading}
      showSearch
      optionFilterProp="children"
      filterOption={(input, option) =>
        option.children.toLowerCase().includes(input.toLowerCase())
      }
    >
      {currencies.map(currency => (
        <Option key={currency.value} value={currency.value}>
          {showSymbol ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{currency.name}</span>
              <span style={{ fontWeight: 'bold', color: 'var(--brand-primary)' }}>{currency.symbol}</span>
            </div>
          ) : (
            currency.name
          )}
        </Option>
      ))}
    </Select>
  );
};

export default CurrencySelector;
