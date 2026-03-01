// src/features/products/components/CreatableSelect.jsx
// Ant Design Select with "Add new" capability — combo-box pattern
// Allows selecting from existing options OR creating a new entry inline

import { useState, useRef } from 'react';
import { Select, Input, Divider, Space, Button, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

/**
 * CreatableSelect — a Select dropdown that also allows free-form creation.
 *
 * Props:
 *  - options: Array of { value, label, children?, style? } (supports hierarchy)
 *  - value / onChange: controlled value
 *  - onCreateNew: async (newValue, newLabel) => void — called when user creates a new entry
 *  - placeholder, disabled, size, allowClear — forwarded to Select
 *  - createLabel: string — label for the "Add new" section (default: "Add new")
 *  - createPlaceholder: string — placeholder for the creation input
 *  - hierarchical: boolean — if true, renders OptGroup/indented children
 */
const CreatableSelect = ({
  options = [],
  value,
  onChange,
  onCreateNew,
  placeholder = 'Select or create...',
  disabled = false,
  size = 'large',
  allowClear = true,
  createLabel = 'Add new',
  createPlaceholder = 'Type new value...',
  hierarchical = false,
  style,
  ...rest
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef(null);

  const handleAddNew = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const trimmed = newItemName.trim();
    if (!trimmed) return;

    // Generate a slug-friendly value
    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    setCreating(true);
    try {
      if (onCreateNew) {
        await onCreateNew(slug, trimmed);
      }
      // Select the newly created value
      onChange?.(slug);
      setNewItemName('');
    } catch {
      // Failed to create — caller handles the error
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleAddNew(e);
    }
  };

  // Render flat options
  const renderFlatOptions = () =>
    options.map((opt) => (
      <Option key={opt.value} value={opt.value} style={opt.style}>
        {opt.label}
      </Option>
    ));

  // Render hierarchical options (parent → children, indented)
  const renderHierarchicalOptions = () => {
    const result = [];
    const renderTree = (items, depth = 0) => {
      items.forEach((item) => {
        result.push(
          <Option
            key={item.value}
            value={item.value}
            style={{ 
              paddingLeft: 12 + depth * 16, 
              fontWeight: depth === 0 ? 600 : 400,
              ...(item.style || {})
            }}
          >
            {depth > 0 ? `↳ ${item.label}` : item.label}
          </Option>
        );
        if (item.children && item.children.length > 0) {
          renderTree(item.children, depth + 1);
        }
      });
    };
    renderTree(options);
    return result;
  };

  // Custom dropdown footer with "Add new" input
  const dropdownRender = (menu) => (
    <>
      {menu}
      {onCreateNew && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ padding: '4px 12px 8px' }}>
            <Text type="secondary" style={{ fontSize: 11, marginBottom: 4, display: 'block' }}>
              {createLabel}
            </Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                ref={inputRef}
                placeholder={createPlaceholder}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={handleKeyDown}
                size="small"
                style={{ flex: 1 }}
                disabled={creating}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddNew}
                size="small"
                loading={creating}
                disabled={!newItemName.trim()}
              >
                Add
              </Button>
            </Space.Compact>
          </div>
        </>
      )}
    </>
  );

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      size={size}
      allowClear={allowClear}
      showSearch
      filterOption={(input, option) => {
        const label = option?.children;
        if (typeof label === 'string') {
          return label.toLowerCase().includes(input.toLowerCase());
        }
        return false;
      }}
      dropdownRender={onCreateNew ? dropdownRender : undefined}
      style={style}
      {...rest}
    >
      {hierarchical ? renderHierarchicalOptions() : renderFlatOptions()}
    </Select>
  );
};

export default CreatableSelect;
