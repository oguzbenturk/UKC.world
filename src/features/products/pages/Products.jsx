// src/features/products/pages/Products.jsx
// Main products management page for retail/sales items

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Card,
  Row,
  Col,
  Input,
  Select,
  Drawer,
  Modal,
  Empty,
  Spin,
  Pagination,
  Tag,
  Badge,
  Segmented,
  Tooltip,
  Checkbox,
  Avatar,
  Image
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  SearchOutlined,
  WarningOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  InboxOutlined,
  FilterOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  StarFilled,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  StopOutlined
} from '@ant-design/icons';
import { productApi } from '@/shared/services/productApi';
import ProductForm from '../components/ProductForm';
import ProductCard from '../components/ProductCard';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import dayjs from 'dayjs';
import { useData } from '@/shared/hooks/useData';
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';

const { Option } = Select;
const { Search } = Input;

const PRODUCT_CATEGORIES = [
  { value: 'all', label: 'All Categories', icon: '📦' },
  { value: 'kites', label: 'Kites', icon: '🪁' },
  { value: 'boards', label: 'Boards', icon: '🏄' },
  { value: 'bars', label: 'Bars', icon: '🎛️' },
  { value: 'bags', label: 'Bags', icon: '🎒' },
  { value: 'harnesses', label: 'Harnesses', icon: '🦺' },
  { value: 'wetsuits', label: 'Wetsuits', icon: '🩱' },
  { value: 'equipment', label: 'Equipment', icon: '⚙️' },
  { value: 'accessories', label: 'Accessories', icon: '🔧' },
  { value: 'apparel', label: 'Apparel', icon: '👕' },
  { value: 'safety', label: 'Safety Gear', icon: '🛡️' },
  { value: 'other', label: 'Other', icon: '📋' }
];

// Simple stat card component
const StatCard = ({ title, value, icon, iconBg, suffix = '' }) => (
  <Card className="rounded-xl border-slate-200">
    <div className="flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-2xl font-semibold text-slate-800">
          {typeof value === 'number' ? value.toLocaleString() : value}{suffix}
        </p>
      </div>
    </div>
  </Card>
);

// eslint-disable-next-line complexity
const normalizePagination = (prevPagination, responsePagination, filteredLength, fallbackLimit = 12, fallbackPage = 1) => {
  const source = responsePagination ?? prevPagination ?? {};
  const limit = source.limit ?? fallbackLimit ?? 12;
  const page = source.page ?? fallbackPage ?? 1;
  const total = filteredLength;
  const pages = source.pages ?? Math.max(1, Math.ceil(filteredLength / (limit || 1)));

  if (!prevPagination) {
    return { page, limit, total, pages };
  }

  if (
    prevPagination.page === page &&
    prevPagination.limit === limit &&
    prevPagination.total === total &&
    prevPagination.pages === pages
  ) {
    return prevPagination;
  }

  return { page, limit, total, pages };
};

const Products = () => {
  const [products, setProducts] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formDrawerVisible, setFormDrawerVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  
  // View mode: 'grid' or 'list'
  const [viewMode, setViewMode] = useState('grid');
  
  // Selected products for bulk actions
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  
  // Filters and pagination
  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    status: 'active',
    low_stock: false,
    createdBy: 'all'
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    pages: 0
  });

  // Stats
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStockProducts: 0,
    totalValue: 0,
    featuredProducts: 0
  });

  useCurrency();
  const { formatCurrency } = useCurrency();
  const { usersWithStudentRole = [], instructors = [] } = useData();

  // Clear selection when products change
  useEffect(() => {
    setSelectedProductIds([]);
  }, [products]);

  // Bulk selection handlers
  const handleSelectAll = useCallback((checked) => {
    if (checked) {
      setSelectedProductIds(products.map(p => p.id));
    } else {
      setSelectedProductIds([]);
    }
  }, [products]);

  const handleSelectProduct = useCallback((productId, checked) => {
    if (checked) {
      setSelectedProductIds(prev => [...prev, productId]);
    } else {
      setSelectedProductIds(prev => prev.filter(id => id !== productId));
    }
  }, []);

  const isAllSelected = useMemo(() => 
    products.length > 0 && selectedProductIds.length === products.length,
    [products.length, selectedProductIds.length]
  );

  const isPartiallySelected = useMemo(() => 
    selectedProductIds.length > 0 && selectedProductIds.length < products.length,
    [products.length, selectedProductIds.length]
  );

  const actorDirectory = React.useMemo(() => {
    const directory = {};

    const register = (candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      const id = candidate.id || candidate.user_id || candidate.userId;
      if (!id) return;

      const label =
        candidate.name ||
        candidate.full_name ||
        candidate.fullName ||
        [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() ||
        candidate.email ||
        candidate.username ||
        null;

      if (label) {
        directory[String(id)] = label;
      }
    };

    usersWithStudentRole.forEach(register);
    instructors.forEach(register);

    return directory;
  }, [usersWithStudentRole, instructors]);

  const resolveActorLabel = useCallback(
    (actorId, preferredLabel) => {
      if (preferredLabel && typeof preferredLabel === 'string' && preferredLabel.trim()) {
        return preferredLabel.trim();
      }

      if (!actorId) {
        return 'System automation';
      }

      const key = String(actorId);
      if (actorDirectory[key]) {
        return actorDirectory[key];
      }

      const normalized = key.toLowerCase();
      if (normalized === '00000000-0000-0000-0000-000000000000' || normalized === 'system') {
        return 'System automation';
      }

      return key.length > 16 ? `${key.slice(0, 8)}…${key.slice(-4)}` : key;
    },
    [actorDirectory]
  );

  const formatAuditTimestamp = useCallback((value) => {
    if (!value) return null;
    const parsed = dayjs(value);
    if (!parsed.isValid()) return null;
    return parsed.format('MMM DD, YYYY HH:mm');
  }, []);

  const decorateProduct = useCallback(
    (product) => {
      if (!product || typeof product !== 'object') {
        return product;
      }

      const createdBy = product.createdBy ?? product.created_by ?? null;
      const createdByName = product.createdByName ?? product.created_by_name ?? null;
      const createdAt = product.createdAt ?? product.created_at ?? null;

      return {
        ...product,
        createdBy,
        createdByName,
        createdAt,
        createdByLabel: resolveActorLabel(createdBy, createdByName),
        createdAtFormatted: formatAuditTimestamp(createdAt),
      };
    },
    [formatAuditTimestamp, resolveActorLabel]
  );

  // Load products
  const loadProducts = useCallback(async (newFilters = filters, newPagination = pagination) => {
    setLoading(true);
    try {
      const { createdBy, ...apiFilters } = newFilters;
      const params = {
        page: newPagination.page,
        limit: newPagination.limit,
        ...apiFilters
      };

      const response = await productApi.getProducts(params);
      const data = Array.isArray(response.data)
        ? response.data.map(decorateProduct)
        : [];

      setRawProducts(data);

      const filteredByCreator = createdBy && createdBy !== 'all'
        ? data.filter((product) => {
            const creatorId = product.createdBy ?? product.created_by ?? null;
            return creatorId && String(creatorId) === String(createdBy);
          })
        : data;

      const totalMatching = createdBy && createdBy !== 'all'
        ? filteredByCreator.length
        : response?.pagination?.total ?? filteredByCreator.length;

      setProducts(filteredByCreator);
      setPagination((prev) =>
        normalizePagination(prev, response.pagination, totalMatching, newPagination.limit, newPagination.page)
      );

      // Calculate stats
      const totalValue = filteredByCreator.reduce((sum, product) => 
        sum + (product.price * product.stock_quantity), 0
      );
      const lowStockCount = filteredByCreator.filter(product => product.is_low_stock).length;
      const featuredCount = filteredByCreator.filter(product => product.is_featured).length;

      setStats({
        totalProducts: totalMatching,
        lowStockProducts: lowStockCount,
        totalValue,
        featuredProducts: featuredCount
      });

    } catch {
      message.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [decorateProduct, filters, pagination]);

  // Load products on component mount and when filters or pagination change
  useEffect(() => {
    loadProducts(filters, pagination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pagination.page, pagination.limit]);

  // Bulk delete handler
  const handleBulkDelete = useCallback(() => {
    if (selectedProductIds.length === 0) return;
    
    Modal.confirm({
      title: 'Delete Selected Products',
      content: `Are you sure you want to delete ${selectedProductIds.length} product(s)? This action cannot be undone.`,
      okText: 'Delete All',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          // Delete products one by one (or use batch API if available)
          await Promise.all(selectedProductIds.map(id => productApi.deleteProduct(id)));
          message.success(`Successfully deleted ${selectedProductIds.length} product(s)`);
          setSelectedProductIds([]);
          loadProducts();
        } catch {
          message.error('Failed to delete some products');
        }
      }
    });
  }, [selectedProductIds, loadProducts]);

  // Bulk status update handler
  const handleBulkStatusUpdate = useCallback((status) => {
    if (selectedProductIds.length === 0) return;
    
    Modal.confirm({
      title: `${status === 'active' ? 'Activate' : 'Deactivate'} Selected Products`,
      content: `Are you sure you want to ${status === 'active' ? 'activate' : 'deactivate'} ${selectedProductIds.length} product(s)?`,
      okText: 'Confirm',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await Promise.all(selectedProductIds.map(id => 
            productApi.updateProduct(id, { status })
          ));
          message.success(`Successfully updated ${selectedProductIds.length} product(s)`);
          setSelectedProductIds([]);
          loadProducts();
        } catch {
          message.error('Failed to update some products');
        }
      }
    });
  }, [selectedProductIds, loadProducts]);

  const creatorOptions = React.useMemo(() => {
    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      return [];
    }

    const lookup = new Map();
    rawProducts.forEach((product) => {
      const creatorId = product.createdBy ?? product.created_by ?? null;
      if (!creatorId) {
        return;
      }
      const label = product.createdByLabel || String(creatorId);
      lookup.set(String(creatorId), label);
    });

    return Array.from(lookup.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawProducts]);

  useEffect(() => {
    if (
      filters.createdBy !== 'all' &&
      !creatorOptions.some((option) => option.value === filters.createdBy)
    ) {
      setFilters((prev) => ({ ...prev, createdBy: 'all' }));
    }
  }, [creatorOptions, filters.createdBy]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  };

  // Handle pagination
  const handlePaginationChange = (page, pageSize) => {
    const newPagination = { ...pagination, page, limit: pageSize };
    setPagination(newPagination);
  };

  // Handle product creation
  const handleProductCreate = async (productData) => {
    setFormLoading(true);
    try {
      await productApi.createProduct(productData);
      setFormDrawerVisible(false);
      loadProducts(); // Reload products
      message.success('Product created successfully!');
    } catch (error) {
      message.error('Failed to create product');
      throw error;
    } finally {
      setFormLoading(false);
    }
  };

  // Handle product update
  const handleProductUpdate = async (productData) => {
    setFormLoading(true);
    try {
      await productApi.updateProduct(selectedProduct.id, productData);
      setFormDrawerVisible(false);
      setEditMode(false);
      setSelectedProduct(null);
      loadProducts(); // Reload products
      message.success('Product updated successfully!');
    } catch (error) {
      message.error('Failed to update product');
      throw error;
    } finally {
      setFormLoading(false);
    }
  };

  // Handle product deletion
  const handleProductDelete = (product) => {
    Modal.confirm({
      title: 'Delete Product',
      content: `Are you sure you want to delete "${product.name}"?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await productApi.deleteProduct(product.id);
          loadProducts(); // Reload products
          message.success('Product deleted successfully!');
        } catch {
          message.error('Failed to delete product');
        }
      }
    });
  };

  // Handle product edit
  const handleProductEdit = (product) => {
    setSelectedProduct(product);
    setEditMode(true);
    setFormDrawerVisible(true);
  };

  // Handle product view (could open a detail modal in the future)
  const handleProductView = (product) => {
    // For now, just edit
    handleProductEdit(product);
  };

  // Close form drawer
  const handleFormCancel = () => {
    setFormDrawerVisible(false);
    setEditMode(false);
    setSelectedProduct(null);
  };

  const columns = [
    {
      title: 'Product',
      key: 'product',
      width: '35%',
      render: (_, product) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-slate-100">
             {product.image_url ? (
               <Image
                 src={product.image_url}
                 alt={product.name}
                 width={48}
                 height={48}
                 className="object-cover"
                 preview={false}
                 fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiNFMkU4RjAiLz48cGF0aCBkPSJNMjQgMjBMMjAgMjhIMjhMMjQgMjBaIiBmaWxsPSIjOTRBM0I4Ii8+PC9zdmc+"
               />
             ) : (
               <div className="w-full h-full flex items-center justify-center">
                 <InboxOutlined className="text-slate-400 text-xl" />
               </div>
             )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900 truncate">
                {product.name}
              </span>
              {product.is_featured && (
                <StarFilled className="text-amber-500 text-sm" />
              )}
            </div>
            {product.subcategory && (
              <span className="text-xs text-slate-500 capitalize">
                {product.subcategory.replace(/-/g, ' ')}
              </span>
            )}
          </div>
        </div>
      )
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      responsive: ['md'],
      render: (sku) => <span className="text-sm text-slate-600 font-mono">{sku || '—'}</span>
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      responsive: ['lg'],
      render: (cat) => <Tag color="blue" className="capitalize">{cat || 'Other'}</Tag>
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
      responsive: ['lg'],
      render: (brand) => <span className="text-sm text-slate-600">{brand || '—'}</span>
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      align: 'right',
      render: (price) => <span className="font-semibold text-slate-900">{formatCurrency(price)}</span>
    },
    {
      title: 'Stock',
      dataIndex: 'stock_quantity',
      key: 'stock',
      align: 'center',
      responsive: ['md'],
      render: (stock, product) => (
        <Badge 
          count={stock}
          showZero
          overflowCount={999}
          style={{ 
            backgroundColor: product.is_low_stock ? '#ff4d4f' : 
              product.stock_quantity === 0 ? '#d9d9d9' : '#52c41a'
          }}
        />
      )
    },
    {
       title: 'Status',
       dataIndex: 'status',
       key: 'status',
       align: 'center',
       render: (status) => (
         <Tag color={
            status === 'active' ? 'green' :
            status === 'inactive' ? 'orange' :
            status === 'discontinued' ? 'red' : 'default'
         }>
           {status?.charAt(0).toUpperCase() + status?.slice(1) || 'Active'}
         </Tag>
       )
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      render: (_, product) => (
        <div className="flex items-center justify-center gap-1">
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); handleProductEdit(product); }}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => { e.stopPropagation(); handleProductDelete(product); }}
            />
          </Tooltip>
        </div>
      )
    }
  ];

  const ProductMobileCard = ({ record, selected, onSelect }) => (
     <Card className={`mb-3 border-slate-200 ${selected ? 'border-blue-400 bg-blue-50' : ''}`} styles={{ body: { padding: 12 } }}>
         <div className="flex gap-3">
             <div className="pt-1" onClick={(e) => e.stopPropagation()}>
               <Checkbox 
                 checked={selected}
                 onChange={(e) => onSelect?.(record, e.target.checked)}
               />
             </div>
             <div className="flex-1 overflow-hidden" onClick={() => handleProductEdit(record)}>
                 <div className="flex justify-between items-start gap-2">
                     <div className="flex items-center gap-2 overflow-hidden">
                         <div className="w-10 h-10 rounded bg-slate-100 flex-shrink-0 overflow-hidden">
                             {record.image_url ? (
                               <img src={record.image_url} alt="" className="w-full h-full object-cover" />
                             ) : <InboxOutlined className="text-slate-400 m-auto h-full block text-center leading-10" />}
                         </div>
                         <div className="min-w-0">
                             <div className="font-medium truncate text-slate-900">{record.name}</div>
                             <div className="text-xs text-slate-500 font-mono">{record.sku}</div>
                         </div>
                     </div>
                     <div className="font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(record.price)}</div>
                 </div>
                 
                 <div className="mt-3 flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex gap-2">
                        <Tag className="m-0" color="blue">{record.category}</Tag>
                        <Tag className="m-0" color={
                             record.status === 'active' ? 'green' :
                             record.status === 'inactive' ? 'orange' : 'default'
                        }>{record.status}</Tag>
                    </div>
                    <Badge 
                      count={record.stock_quantity} 
                      showZero 
                      style={{ 
                         backgroundColor: record.is_low_stock ? '#ff4d4f' : record.stock_quantity === 0 ? '#d9d9d9' : '#52c41a' 
                      }} 
                    />
                 </div>
               </div>
         </div>
     </Card>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      {/* Header Section */}
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-slate-900">Product Management</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">Manage your shop inventory and product catalog</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'grid', icon: <AppstoreOutlined /> },
                { value: 'list', icon: <UnorderedListOutlined /> }
              ]}
              className="shrink-0"
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadProducts()}
              size="middle"
              className="shrink-0"
            >
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFormDrawerVisible(true)}
              size="middle"
              className="shrink-0"
            >
              <span className="hidden sm:inline">Add Product</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Products"
          value={stats.totalProducts}
          icon={<ShoppingCartOutlined className="text-lg text-purple-600" />}
          iconBg="bg-purple-100"
        />
        <StatCard
          title="Low Stock Items"
          value={stats.lowStockProducts}
          icon={<WarningOutlined className={`text-lg ${stats.lowStockProducts > 0 ? 'text-orange-600' : 'text-emerald-600'}`} />}
          iconBg={stats.lowStockProducts > 0 ? 'bg-orange-100' : 'bg-emerald-100'}
        />
        <StatCard
          title="Inventory Value"
          value={`€${stats.totalValue.toLocaleString()}`}
          icon={<DollarOutlined className="text-lg text-emerald-600" />}
          iconBg="bg-emerald-100"
        />
        <StatCard
          title="Featured Products"
          value={stats.featuredProducts}
          icon={<StarFilled className="text-lg text-amber-600" />}
          iconBg="bg-amber-100"
        />
      </div>

      {/* Filters Card */}
      <Card className="mb-6 rounded-lg">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <Input
              placeholder="Search by name, SKU, or brand..."
              prefix={<SearchOutlined className="text-slate-400" />}
              allowClear
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              value={filters.category}
              onChange={(value) => handleFilterChange('category', value)}
              style={{ width: '100%' }}
            >
              {PRODUCT_CATEGORIES.map(category => (
                <Option key={category.value} value={category.value}>
                  {category.icon} {category.label}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} md={4}>
            <Select
              value={filters.status}
              onChange={(value) => handleFilterChange('status', value)}
              style={{ width: '100%' }}
            >
              <Option value="all">All Status</Option>
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
              <Option value="discontinued">Discontinued</Option>
            </Select>
          </Col>
          <Col xs={12} md={4}>
            <Select
              value={filters.createdBy}
              onChange={(value) => handleFilterChange('createdBy', value)}
              placeholder="Created by"
              style={{ width: '100%' }}
            >
              <Option value="all">All Creators</Option>
              {creatorOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} md={4}>
            <Button
              type={filters.low_stock ? 'primary' : 'default'}
              danger={filters.low_stock}
              icon={<WarningOutlined />}
              onClick={() => handleFilterChange('low_stock', !filters.low_stock)}
              block
            >
              Low Stock Only
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Products Count and Bulk Actions */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-600">
          Showing {products.length} of {pagination.total} products
        </p>
        
        {/* Bulk Action Bar */}
        {selectedProductIds.length > 0 && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <span className="text-sm text-blue-700 font-medium">
              {selectedProductIds.length} selected
            </span>
            <div className="h-4 w-px bg-blue-300" />
            <Tooltip title="Activate Selected">
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined className="text-green-600" />}
                onClick={() => handleBulkStatusUpdate('active')}
              >
                Activate
              </Button>
            </Tooltip>
            <Tooltip title="Deactivate Selected">
              <Button
                type="text"
                size="small"
                icon={<StopOutlined className="text-orange-600" />}
                onClick={() => handleBulkStatusUpdate('inactive')}
              >
                Deactivate
              </Button>
            </Tooltip>
            <Tooltip title="Delete Selected">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleBulkDelete}
              >
                Delete
              </Button>
            </Tooltip>
            <Button
              type="text"
              size="small"
              onClick={() => setSelectedProductIds([])}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Products Grid/List */}
      <div style={{ minHeight: '400px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spin size="large" />
          </div>
        ) : products.length > 0 ? (
          <>
            {viewMode === 'grid' ? (
              <Row gutter={[16, 16]}>
                {products.map(product => (
                  <Col xs={24} sm={12} md={8} lg={6} key={product.id}>
                    <ProductCard
                      product={product}
                      onEdit={handleProductEdit}
                      onDelete={handleProductDelete}
                      onView={handleProductView}
                      selected={selectedProductIds.includes(product.id)}
                      onSelect={(checked) => handleSelectProduct(product.id, checked)}
                    />
                  </Col>
                ))}
              </Row>
            ) : (
              /* List/Table View */
              <UnifiedResponsiveTable
                columns={columns}
                dataSource={products}
                rowKey="id"
                loading={loading}
                pagination={false}
                rowSelection={{
                  selectedRowKeys: selectedProductIds,
                  onChange: (keys) => setSelectedProductIds(keys),
                  preserveSelectedRowKeys: true
                }}
                mobileCardRenderer={(props) => (
                  <ProductMobileCard 
                    {...props} 
                    selected={selectedProductIds.includes(props.record.id)}
                    onSelect={(record, checked) => handleSelectProduct(record.id, checked)}
                  />
                )}
              />
            )}
            
            {/* Pagination */}
            <div className="text-center mt-8">
              <Pagination
                current={pagination.page}
                pageSize={pagination.limit}
                total={pagination.total}
                showSizeChanger
                showQuickJumper
                showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} products`}
                onChange={handlePaginationChange}
                onShowSizeChange={handlePaginationChange}
              />
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span className="text-slate-500">
                  {filters.search || filters.category !== 'all' || filters.status !== 'active' 
                    ? 'No products match your filters'
                    : 'No products yet'
                  }
                </span>
              }
            >
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={() => setFormDrawerVisible(true)}
              >
                Add Product
              </Button>
            </Empty>
          </div>
        )}
      </div>

      {/* Product Form Drawer */}
      <Drawer
        title={editMode ? 'Edit Product' : 'Add New Product'}
        width={720}
        onClose={handleFormCancel}
        open={formDrawerVisible}
        styles={{ body: { paddingBottom: 80 } }}
      >
        <ProductForm
          product={editMode ? selectedProduct : null}
          onSubmit={editMode ? handleProductUpdate : handleProductCreate}
          onCancel={handleFormCancel}
          loading={formLoading}
        />
      </Drawer>
    </div>
  );
};

export default Products;
