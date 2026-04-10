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
      low_stock = false,
      brand,
      min_price,
      max_price,
      in_stock = false
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

    if (params.is_featured) {
      queryParams.append('is_featured', 'true');
    }

    if (brand && brand !== 'all') {
      queryParams.append('brand', brand);
    }

    if (min_price !== undefined && min_price > 0) {
      queryParams.append('min_price', min_price.toString());
    }

    if (max_price !== undefined && max_price < 10000) {
      queryParams.append('max_price', max_price.toString());
    }

    if (in_stock) {
      queryParams.append('in_stock', 'true');
    }

  const response = await apiClient.get(`/products?${queryParams}`);
  return normalizeAuditPayload(response.data);
  },

  // Get products grouped by category (for shop homepage)
  // Pass category to fetch only that category's products (faster, no limit needed)
  getProductsByCategory: async (limitPerCategory = 10, category = null) => {
    let url = `/products/shop/by-category?limit_per_category=${limitPerCategory}`;
    if (category && category !== 'all' && category !== 'featured') {
      url += `&category=${encodeURIComponent(category)}`;
    }
    const response = await apiClient.get(url);
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

  // Create a new subcategory (admin)
  createSubcategory: async ({ category, subcategory, display_name, parent_subcategory = null }) => {
    const response = await apiClient.post('/products/subcategories', {
      category,
      subcategory,
      display_name,
      parent_subcategory
    });
    return response.data;
  },

  // Deactivate a subcategory (admin)
  deleteSubcategory: async (category, subcategory) => {
    const response = await apiClient.delete(`/products/subcategories/${category}/${subcategory}`);
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

};

export default productApi;
