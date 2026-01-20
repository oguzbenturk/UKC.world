// src/shared/services/productApi.js
// API service for product management

import apiClient from './apiClient';
import { normalizeAuditPayload, withAuditFields } from '../utils/auditTransforms';

export const productApi = {
  // Get all products with filtering and pagination
  getProducts: async (params = {}) => {
    const {
      page = 1,
      limit = 20,
      category,
      subcategory,
      status = 'active',
      search,
      sort_by = 'created_at',
      sort_order = 'DESC',
      low_stock = false
    } = params;

    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sort_by,
      sort_order
    });

    if (category && category !== 'all') {
      queryParams.append('category', category);
    }
    
    if (subcategory && subcategory !== 'all') {
      queryParams.append('subcategory', subcategory);
    }
    
    if (status && status !== 'all') {
      queryParams.append('status', status);
    }
    
    if (search) {
      queryParams.append('search', search);
    }
    
    if (low_stock) {
      queryParams.append('low_stock', 'true');
    }

  const response = await apiClient.get(`/products?${queryParams}`);
  return normalizeAuditPayload(response.data);
  },

  // Get products grouped by category (for shop homepage)
  getProductsByCategory: async (limitPerCategory = 10) => {
    const response = await apiClient.get(`/products/shop/by-category?limit_per_category=${limitPerCategory}`);
    return response.data;
  },

  // Get available subcategories
  getSubcategories: async (category = null) => {
    const endpoint = category && category !== 'all' 
      ? `/products/subcategories?category=${category}`
      : '/products/subcategories';
    const response = await apiClient.get(endpoint);
    return response.data;
  },

  // Get product by ID
  getProduct: async (id) => {
  const response = await apiClient.get(`/products/${id}`);
  return withAuditFields(response.data);
  },

  // Create new product
  createProduct: async (productData) => {
  const response = await apiClient.post('/products', productData);
  return withAuditFields(response.data);
  },

  // Update product
  updateProduct: async (id, productData) => {
  const response = await apiClient.put(`/products/${id}`, productData);
  return withAuditFields(response.data);
  },

  // Delete product
  deleteProduct: async (id) => {
    const response = await apiClient.delete(`/products/${id}`);
    return response.data;
  },

  // Update stock quantity
  updateStock: async (id, stockData) => {
  const response = await apiClient.patch(`/products/${id}/stock`, stockData);
  return withAuditFields(response.data);
  },

  // Get product categories
  getCategories: async () => {
  const response = await apiClient.get('/products/categories/list');
  return response.data;
  },

  // Get low stock products
  getLowStockProducts: async () => {
  const response = await apiClient.get('/products/inventory/low-stock');
  return normalizeAuditPayload(response.data);
  }
};

export default productApi;
