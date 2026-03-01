// src/features/products/components/CreatableSelect.jsx
// Ant Design Select with "Add new" capability — combo-box pattern
// Allows selecting from existing options OR creating a new entry inline
// Supports nested subcategory creation (parent selection) and deletion

import { useState, useRef, useMemo } from 'react';
import { Select, Input, Divider, Space, Button, Typography, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

/**
 * CreatableSelect — a Select dropdown that also allows free-form creation.
 *
 * Props:
 *  - options: Array of { value, label, children?, style? } (supports hierarchy)
 *  - value / onChange: controlled value
 *  - onCreateNew: async (newValue, newLabel, parentValue?) => void — called when user creates a new entry
 *  - onDelete: async (value) => void — called when user deletes an entry
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
  onDelete,
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
  const [selectedParent, setSelectedParent] = useState('__none__');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const inputRef = useRef(null);

  // Collect top-level options for parent selector
  const parentOptions = useMemo(() => {
    if (!hierarchical) return [];
    return options.filter(o => o.value).map(o => ({ value: o.value, label: o.label }));
  }, [options, hierarchical]);

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

    const parentValue = selectedParent === '__none__' ? null : selectedParent;

    setCreating(true);
    try {
      if (onCreateNew) {
        await onCreateNew(slug, trimmed, parentValue);
      }
      // Select the newly created value
      onChange?.(slug);
      setNewItemName('');
      setSelectedParent('__none__');
    } catch {
      // Failed to create — caller handles the error
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, itemValue) => {
    e?.stopPropagation?.();
    if (!onDelete) return;
    setDeleting(itemValue);
    try {
      await onDelete(itemValue);
      // If the deleted item was selected, clear the selection
      if (value === itemValue) {
        onChange?.(undefined);
      }
    } catch {
      // caller handles error
    } finally {
      setDeleting(null);
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
        <div className="flex items-center justify-between w-full">
          <span>{opt.label}</span>
          {onDelete && (
            <Popconfirm
              title="Delete this subcategory?"
              description="Products using it will keep the value but it won't appear in the list."
              onConfirm={(e) => handleDelete(e, opt.value)}
              onCancel={(e) => e?.stopPropagation?.()}
              okText="Delete"
              okButtonProps={{ danger: true }}
              placement="left"
            >
              <DeleteOutlined
                className="text-gray-400 hover:text-red-500 text-xs ml-2"
                style={{ opacity: deleting === opt.value ? 0.5 : 1 }}
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          )}
        </div>
      </Option>
    ));

  // Render hierarchical options (parent → children, indented) with delete buttons
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
            <div className="flex items-center justify-between w-full">
              <span>{depth > 0 ? `↳ ${item.label}` : item.label}</span>
              {onDelete && (
                <Popconfirm
                  title={`Delete "${item.label}"?`}
                  description="Products using it keep the value but it won't appear in the list."
                  onConfirm={(e) => handleDelete(e, item.value)}
                  onCancel={(e) => e?.stopPropagation?.()}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  placement="left"
                >
                  <DeleteOutlined
                    className="text-gray-400 hover:text-red-500 text-xs ml-2"
                    style={{ opacity: deleting === item.value ? 0.5 : 1 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              )}
            </div>
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

  // Custom dropdown footer with "Add new" input + optional parent selector
  const dropdownRender = (menu) => (
    <>
      {menu}
      {onCreateNew && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div
            style={{ padding: '4px 12px 8px' }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Text type="secondary" style={{ fontSize: 11, marginBottom: 4, display: 'block' }}>
              {createLabel}
            </Text>
            {/* Parent selector — uses native <select> to avoid Ant portal stealing focus from outer Select */}
            {hierarchical && parentOptions.length > 0 && (
              <select
                value={selectedParent}
                onChange={(e) => setSelectedParent(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  marginBottom: 6,
                  padding: '4px 8px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid #d9d9d9',
                  outline: 'none',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                }}
              >
                <option value="__none__">Top level (no parent)</option>
                {parentOptions.map(p => (
                  <option key={p.value} value={p.value}>Under: {p.label}</option>
                ))}
              </select>
            )}
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
        // Search through the option's children text content
        const getTextContent = (children) => {
          if (typeof children === 'string') return children;
          if (children?.props?.children) {
            const inner = children.props.children;
            if (Array.isArray(inner)) {
              return inner.map(c => typeof c === 'string' ? c : getTextContent(c)).join('');
            }
            return getTextContent(inner);
          }
          return '';
        };
        const label = getTextContent(option?.children);
        return label.toLowerCase().includes(input.toLowerCase());
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
