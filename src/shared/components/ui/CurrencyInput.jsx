// src/shared/components/ui/CurrencyInput.jsx
import React from 'react';
import { Input, InputNumber, Select, Row, Col, Space } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;

const CurrencyInput = ({
  value,
  currency,
  onValueChange,
  onCurrencyChange,
  placeholder = "Enter amount",
  size = "default",
  disabled = false,
  showCurrencySelector = true,
  min = 0,
  step = 0.01,
  precision = 2,
  style = {}
}) => {
  const { getSupportedCurrencies, getCurrencySymbol } = useCurrency();
  const currencies = getSupportedCurrencies();

  if (!showCurrencySelector) {
    // Just show input with currency symbol
    const symbol = getCurrencySymbol(currency);
    return (
      <InputNumber
        value={value}
        onChange={onValueChange}
        placeholder={placeholder}
        size={size}
        disabled={disabled}
        min={min}
        step={step}
        precision={precision}
        style={style}
        addonBefore={symbol}
      />
    );
  }

  return (
    <Space.Compact style={style}>
      <Select
        value={currency}
        onChange={onCurrencyChange}
        size={size}
        disabled={disabled}
        style={{ width: '30%' }}
      >
        {currencies.map(curr => (
          <Option key={curr.value} value={curr.value}>
            {curr.symbol}
          </Option>
        ))}
      </Select>
      <InputNumber
        value={value}
        onChange={onValueChange}
        placeholder={placeholder}
        size={size}
        disabled={disabled}
        min={min}
        step={step}
        precision={precision}
        style={{ width: '70%' }}
      />
    </Space.Compact>
  );
};

export default CurrencyInput;
