// src/features/products/components/ProductCard.jsx
// Card component for displaying product information (Admin view)

import { Card, Tag, Typography, Space, Button, Dropdown, Tooltip, Avatar, Checkbox } from 'antd';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { 
  EditOutlined, 
  DeleteOutlined, 
  EyeOutlined, 
  MoreOutlined,
  ShoppingCartOutlined,
  StarFilled,
  BgColorsOutlined,
  AppstoreOutlined,
  WarningOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;

const ProductCard = ({ 
  product, 
  onEdit, 
  onDelete, 
  onView,
  showActions = true,
  selected = false,
  onSelect
}) => {
  const { convertCurrency, userCurrency, formatCurrency } = useCurrency();

  const {
    name,
    sku,
    category,
    brand,
    price,
    currency,
    stock_quantity,
    image_url,
    images,
    status,
    is_featured,
    is_low_stock
  } = product;

  // Parse JSON fields
  const parseJSON = (field) => {
    if (!field) return null;
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch {
        return null;
      }
    }
    return field;
  };

  const variants = parseJSON(product.variants);
  const colors = parseJSON(product.colors);
  const sizes = parseJSON(product.sizes);

  const getStockStatus = (quantity) => {
    if (quantity === 0) return { label: 'Out of Stock', color: '#ff4d4f' };
    if (quantity <= 5) return { label: 'Low Stock', color: '#faad14' };
    if (quantity <= 10) return { label: 'Limited', color: '#faad14' };
    return { label: 'In Stock', color: '#52c41a' };
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active': return { color: '#52c41a', label: 'Active' };
      case 'inactive': return { color: '#faad14', label: 'Inactive' };
      case 'discontinued': return { color: '#ff4d4f', label: 'Discontinued' };
      default: return { color: '#d9d9d9', label: status };
    }
  };

  const stock = getStockStatus(stock_quantity || 0);
  const statusBadge = getStatusBadge(status);

  const menuItems = [
    {
      key: 'view',
      label: 'View Details',
      icon: <EyeOutlined />,
      onClick: () => onView?.(product)
    },
    {
      key: 'edit',
      label: 'Edit Product',
      icon: <EditOutlined />,
      onClick: () => onEdit?.(product)
    },
    {
      type: 'divider'
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => onDelete?.(product)
    }
  ];

  // Get display image
  const getDisplayImage = () => {
    if (image_url) return image_url;
    const parsedImages = parseJSON(images);
    if (parsedImages && parsedImages.length > 0) {
      return parsedImages[0];
    }
    return null;
  };

  const displayImage = getDisplayImage();

  return (
    <Card
      hoverable
      className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg"
      style={{ 
        borderRadius: 12, 
        height: '100%',
        border: selected ? '2px solid #1890ff' : is_low_stock ? '2px solid #faad14' : '1px solid #e5e7eb',
        boxShadow: selected ? '0 0 0 2px rgba(24,144,255,0.2)' : '0 1px 2px rgba(0,0,0,0.04)' 
      }}
      styles={{ body: { padding: 0 } }}
    >
      {/* Selection Checkbox */}
      {onSelect && (
        <div 
          className="absolute left-2 top-2 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className="bg-white/80 rounded p-0.5"
          />
        </div>
      )}
      
      {/* Image Container */}
      <div className="relative aspect-square overflow-hidden bg-gray-100" style={{ borderRadius: '10px 10px 0 0' }}>
        {displayImage ? (
          <img
            src={displayImage}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
            <ShoppingCartOutlined className="text-4xl text-gray-300" />
          </div>
        )}
        
        {/* Status Badge */}
        <div className={`absolute ${onSelect ? 'left-10' : 'left-3'} top-3 flex gap-2`}>
          <Tag
            color={statusBadge.color}
            style={{ 
              borderRadius: 4, 
              border: 0, 
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 500
            }}
          >
            {statusBadge.label}
          </Tag>
          {is_featured && (
            <Tag
              color="#faad14"
              icon={<StarFilled />}
              style={{ 
                borderRadius: 4, 
                border: 0, 
                padding: '2px 6px',
                fontSize: 11
              }}
            >
              Featured
            </Tag>
          )}
        </div>

        {/* Stock Badge - Right side */}
        <div className="absolute right-3 top-3">
          <Tag
            color={stock.color}
            style={{ 
              borderRadius: 4, 
              border: 0, 
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 500
            }}
          >
            {stock_quantity || 0} in stock
          </Tag>
        </div>

        {/* Low stock warning overlay */}
        {is_low_stock && (
          <div className="absolute bottom-0 left-0 right-0 bg-orange-500/90 px-3 py-1.5 flex items-center gap-2">
            <WarningOutlined className="text-white text-xs" />
            <span className="text-white text-xs font-medium">Low Stock - Reorder Soon</span>
          </div>
        )}

        {/* Actions Menu */}
        {showActions && (
          <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
              <Button 
                type="primary" 
                shape="circle" 
                icon={<MoreOutlined />} 
                size="small"
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Category & SKU row */}
        <div className="flex items-center justify-between mb-2">
          {category && (
            <Tag 
              style={{ 
                fontSize: 10, 
                padding: '1px 6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              {category}
            </Tag>
          )}
          {sku && (
            <Text className="text-[10px] text-gray-400 font-mono">
              {sku}
            </Text>
          )}
        </div>

        {/* Brand */}
        {brand && (
          <Text className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            {brand}
          </Text>
        )}
        
        {/* Name */}
        <Title 
          level={5} 
          className="mb-2 line-clamp-2 transition-colors group-hover:text-blue-600" 
          style={{ 
            margin: '4px 0 8px', 
            fontSize: 14, 
            fontWeight: 600, 
            lineHeight: 1.4,
            minHeight: 40
          }}
        >
          {name}
        </Title>
        
        {/* Price */}
        <div className="flex items-baseline gap-2 mb-2">
          <Text strong style={{ fontSize: 16, color: '#1890ff' }}>
            {formatCurrency(
              convertCurrency 
                ? convertCurrency(price, currency || 'EUR', userCurrency) 
                : price, 
              userCurrency
            )}
          </Text>
          {product.cost_price && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Cost: {formatCurrency(product.cost_price, currency || 'EUR')}
            </Text>
          )}
        </div>

        {/* Quick Info Tags */}
        {(colors?.length > 0 || sizes?.length > 0 || variants?.length > 0) && (
          <Space size={4} wrap style={{ marginTop: 4 }}>
            {colors?.length > 0 && (
              <Tag 
                icon={<BgColorsOutlined />} 
                style={{ 
                  fontSize: 10, 
                  padding: '1px 6px',
                  border: '1px solid #e8e8e8',
                  background: '#fafafa'
                }}
              >
                {colors.length} Colors
              </Tag>
            )}
            {sizes?.length > 0 && (
              <Tag 
                style={{ 
                  fontSize: 10, 
                  padding: '1px 6px',
                  border: '1px solid #e8e8e8',
                  background: '#fafafa'
                }}
              >
                {sizes.length} Sizes
              </Tag>
            )}
            {variants?.length > 0 && (
              <Tag 
                icon={<AppstoreOutlined />}
                style={{ 
                  fontSize: 10, 
                  padding: '1px 6px',
                  border: '1px solid #e8e8e8',
                  background: '#fafafa'
                }}
              >
                {variants.length} Variants
              </Tag>
            )}
          </Space>
        )}

        {/* Quick Actions */}
        {showActions && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            <Button 
              size="small" 
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); onEdit?.(product); }}
              className="flex-1"
            >
              Edit
            </Button>
            <Button 
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => { e.stopPropagation(); onView?.(product); }}
            >
              View
            </Button>
            <Tooltip title="Delete">
              <Button 
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => { e.stopPropagation(); onDelete?.(product); }}
              />
            </Tooltip>
          </div>
        )}

        {/* Audit info */}
        {product.createdByLabel && (
          <div className="flex items-center justify-between text-[10px] text-gray-400 mt-3 pt-2 border-t border-gray-100">
            <span className="flex items-center gap-1">
              <Avatar size={16} className="bg-gray-200 text-gray-500" style={{ fontSize: 9 }}>
                {product.createdByLabel.charAt(0).toUpperCase()}
              </Avatar>
              <span className="truncate max-w-[100px]">{product.createdByLabel}</span>
            </span>
            {product.createdAtFormatted && (
              <span>{product.createdAtFormatted}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default ProductCard;
