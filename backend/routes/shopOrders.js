// backend/routes/shopOrders.js
// API routes for shop order management

import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from '../utils/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';
import socketService from '../services/socketService.js';
import { getBalance, recordTransaction } from '../services/walletService.js';

const router = express.Router();

// Helper to emit socket events safely
const emitSocketEvent = (event, data) => {
  try {
    socketService.emitToChannel('general', event, data);
  } catch (err) {
    logger.warn(`Failed to emit socket event ${event}:`, err.message);
  }
};

// Helper to get order with items
async function getOrderWithItems(orderId, client = pool) {
  const orderResult = await client.query(`
    SELECT 
      o.*,
      u.first_name,
      u.last_name,
      u.email,
      u.phone
    FROM shop_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.id = $1
  `, [orderId]);

  if (orderResult.rows.length === 0) {
    return null;
  }

  const itemsResult = await client.query(`
    SELECT * FROM shop_order_items WHERE order_id = $1 ORDER BY id
  `, [orderId]);

  return {
    ...orderResult.rows[0],
    items: itemsResult.rows
  };
}

// Create a new order (customer checkout)
router.post('/', authenticateJWT, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.id;
    const { 
      items, 
      payment_method, 
      notes, 
      shipping_address,
      use_wallet = true 
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    if (!payment_method || !['wallet', 'credit_card', 'cash'].includes(payment_method)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    await client.query('BEGIN');

    // Calculate order totals and validate stock
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      // Get product with current price and stock
      const productResult = await client.query(`
        SELECT id, name, price, stock_quantity, image_url, brand, status
        FROM products 
        WHERE id = $1 AND status = 'active'
      `, [item.product_id]);

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Product ${item.product_name || item.product_id} is no longer available` 
        });
      }

      const product = productResult.rows[0];

      // Check stock
      if (product.stock_quantity < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}` 
        });
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        product_image: product.image_url,
        brand: product.brand,
        quantity: item.quantity,
        unit_price: product.price,
        total_price: itemTotal,
        selected_size: item.selected_size || null,
        selected_color: item.selected_color || null,
        selected_variant: item.selected_variant ? JSON.stringify(item.selected_variant) : null
      });
    }

    const totalAmount = subtotal; // Can add tax/shipping logic here

    // Check wallet balance if paying by wallet
    if (payment_method === 'wallet' && use_wallet) {
      const walletBalance = await getBalance(userId, 'EUR');
      const balance = walletBalance.available || 0;
      
      if (balance < totalAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Insufficient wallet balance. Required: €${totalAmount.toFixed(2)}, Available: €${balance.toFixed(2)}` 
        });
      }
    }

    // Create the order
    const orderResult = await client.query(`
      INSERT INTO shop_orders (
        user_id, status, payment_method, payment_status, 
        subtotal, total_amount, notes, shipping_address
      )
      VALUES ($1, 'pending', $2, 'pending', $3, $4, $5, $6)
      RETURNING *
    `, [userId, payment_method, subtotal, totalAmount, notes || null, shipping_address || null]);

    const order = orderResult.rows[0];

    // Insert order items
    for (const item of validatedItems) {
      await client.query(`
        INSERT INTO shop_order_items (
          order_id, product_id, product_name, product_image, brand,
          quantity, unit_price, total_price, selected_size, selected_color, selected_variant
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        order.id,
        item.product_id,
        item.product_name,
        item.product_image,
        item.brand,
        item.quantity,
        item.unit_price,
        item.total_price,
        item.selected_size,
        item.selected_color,
        item.selected_variant
      ]);

      // Decrease stock
      await client.query(`
        UPDATE products 
        SET stock_quantity = stock_quantity - $1, updated_at = NOW()
        WHERE id = $2
      `, [item.quantity, item.product_id]);
    }

    // Process wallet payment
    if (payment_method === 'wallet' && use_wallet) {
      // Deduct from wallet using walletService
      await recordTransaction({
        client,
        userId,
        amount: totalAmount,
        currency: 'EUR',
        transactionType: 'payment',
        direction: 'debit',
        availableDelta: -totalAmount,
        description: `Shop Order #${order.order_number}`,
        relatedEntityType: 'shop_order',
        // Note: order.id is INTEGER, not UUID, so we store it in metadata instead
        metadata: { orderId: order.id, orderNumber: order.order_number }
      });

      // Update order payment status
      await client.query(`
        UPDATE shop_orders 
        SET payment_status = 'completed', status = 'confirmed', confirmed_at = NOW()
        WHERE id = $1
      `, [order.id]);

      // Log status change
      await client.query(`
        INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
        VALUES ($1, 'pending', 'confirmed', $2, 'Payment completed via wallet')
      `, [order.id, userId]);
    }

    await client.query('COMMIT');

    // Get complete order with items
    const completeOrder = await getOrderWithItems(order.id);

    // Emit socket event to notify admins
    emitSocketEvent('shop:newOrder', {
      orderId: order.id,
      orderNumber: order.order_number,
      totalAmount,
      itemCount: validatedItems.length
    });

    // Check for low stock and emit alerts
    for (const item of validatedItems) {
      const stockCheck = await pool.query(`
        SELECT id, name, stock_quantity, low_stock_threshold
        FROM products
        WHERE id = $1 AND stock_quantity <= COALESCE(low_stock_threshold, 5)
      `, [item.product_id]);

      if (stockCheck.rows.length > 0) {
        const product = stockCheck.rows[0];
        emitSocketEvent('shop:lowStock', {
          productId: product.id,
          productName: product.name,
          currentStock: product.stock_quantity,
          threshold: product.low_stock_threshold || 5
        });
      }
    }

    logger.info(`Shop order created: ${order.order_number} by user ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: completeOrder
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating shop order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

// Get current user's orders
router.get('/my-orders', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE o.user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      whereClause += ` AND o.status = $${paramIndex++}`;
      params.push(status);
    }

    // Get orders with item count
    const ordersResult = await pool.query(`
      SELECT 
        o.*,
        (SELECT COUNT(*) FROM shop_order_items WHERE order_id = o.id) as item_count,
        (SELECT json_agg(json_build_object(
          'id', oi.id,
          'product_name', oi.product_name,
          'product_image', oi.product_image,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'selected_size', oi.selected_size,
          'selected_color', oi.selected_color
        )) FROM shop_order_items oi WHERE oi.order_id = o.id) as items
      FROM shop_orders o
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM shop_orders o ${whereClause}
    `, params);

    res.json({
      orders: ordersResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    });

  } catch (error) {
    logger.error('Error fetching user orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order details
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const order = await getOrderWithItems(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check authorization - user can only see their own orders unless admin/manager
    if (order.user_id !== userId && !['admin', 'manager'].includes(userRole)) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }

    // Get status history
    const historyResult = await pool.query(`
      SELECT 
        h.*,
        u.first_name,
        u.last_name
      FROM shop_order_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.order_id = $1
      ORDER BY h.created_at DESC
    `, [orderId]);

    res.json({
      ...order,
      status_history: historyResult.rows
    });

  } catch (error) {
    logger.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Admin: Get all orders
router.get('/admin/all', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      payment_status,
      search,
      date_from,
      date_to,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;
    
    const offset = (page - 1) * limit;
    const params = [];
    let paramIndex = 1;
    let whereConditions = [];

    if (status && status !== 'all') {
      whereConditions.push(`o.status = $${paramIndex++}`);
      params.push(status);
    }

    if (payment_status && payment_status !== 'all') {
      whereConditions.push(`o.payment_status = $${paramIndex++}`);
      params.push(payment_status);
    }

    if (search) {
      whereConditions.push(`(
        o.order_number ILIKE $${paramIndex} OR
        u.first_name ILIKE $${paramIndex} OR
        u.last_name ILIKE $${paramIndex} OR
        u.email ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (date_from) {
      whereConditions.push(`o.created_at >= $${paramIndex++}`);
      params.push(date_from);
    }

    if (date_to) {
      whereConditions.push(`o.created_at <= $${paramIndex++}`);
      params.push(date_to);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';

    // Validate sort column
    const validSortColumns = ['created_at', 'total_amount', 'status', 'order_number'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const ordersResult = await pool.query(`
      SELECT 
        o.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        (SELECT COUNT(*) FROM shop_order_items WHERE order_id = o.id) as item_count,
        (SELECT json_agg(json_build_object(
          'id', oi.id,
          'product_name', oi.product_name,
          'product_image', oi.product_image,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'selected_size', oi.selected_size,
          'selected_color', oi.selected_color
        )) FROM shop_order_items oi WHERE oi.order_id = o.id) as items
      FROM shop_orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${whereClause}
      ORDER BY o.${sortColumn} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) 
      FROM shop_orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${whereClause}
    `, params);

    // Get summary stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped_count,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'completed'), 0) as total_revenue
      FROM shop_orders
    `);

    res.json({
      orders: ordersResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
      stats: statsResult.rows[0]
    });

  } catch (error) {
    logger.error('Error fetching all orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Admin: Update order status
router.patch('/:id/status', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();

  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const { status, admin_notes } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await client.query('BEGIN');

    // Get current order
    const currentOrder = await client.query(`
      SELECT * FROM shop_orders WHERE id = $1
    `, [orderId]);

    if (currentOrder.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const previousStatus = currentOrder.rows[0].status;

    // Update status with appropriate timestamps
    let updateFields = ['status = $1', 'updated_at = NOW()'];
    const updateParams = [status];
    let paramIndex = 2;

    if (admin_notes) {
      updateFields.push(`admin_notes = $${paramIndex++}`);
      updateParams.push(admin_notes);
    }

    // Add timestamp based on status
    if (status === 'confirmed') {
      updateFields.push('confirmed_at = NOW()');
    } else if (status === 'shipped') {
      updateFields.push('shipped_at = NOW()');
    } else if (status === 'delivered') {
      updateFields.push('delivered_at = NOW()');
    } else if (status === 'cancelled') {
      updateFields.push('cancelled_at = NOW()');
    }

    // Handle cancellation - restore stock
    if (status === 'cancelled' && previousStatus !== 'cancelled') {
      const orderItems = await client.query(`
        SELECT product_id, quantity FROM shop_order_items WHERE order_id = $1
      `, [orderId]);

      for (const item of orderItems.rows) {
        await client.query(`
          UPDATE products 
          SET stock_quantity = stock_quantity + $1, updated_at = NOW()
          WHERE id = $2
        `, [item.quantity, item.product_id]);
      }
    }

    // Handle refund - if payment was completed, refund to wallet
    if (status === 'refunded' && currentOrder.rows[0].payment_status === 'completed') {
      const order = currentOrder.rows[0];
      
      // Refund to wallet using walletService
      await recordTransaction({
        client,
        userId: order.user_id,
        amount: parseFloat(order.total_amount),
        currency: 'EUR',
        transactionType: 'refund',
        direction: 'credit',
        availableDelta: parseFloat(order.total_amount),
        description: `Refund for Order #${order.order_number}`,
        relatedEntityType: 'shop_order_refund',
        // Note: orderId is INTEGER, not UUID, so we store it in metadata instead
        metadata: { orderId, orderNumber: order.order_number }
      });

      updateFields.push(`payment_status = 'refunded'`);
    }

    updateParams.push(orderId);
    
    await client.query(`
      UPDATE shop_orders 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `, updateParams);

    // Log status change
    await client.query(`
      INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, $2, $3, $4, $5)
    `, [orderId, previousStatus, status, userId, admin_notes || null]);

    await client.query('COMMIT');

    const updatedOrder = await getOrderWithItems(orderId);

    // Emit socket event for order update
    emitSocketEvent('shop:orderStatusChanged', {
      orderId,
      orderNumber: updatedOrder.order_number,
      previousStatus,
      newStatus: status,
      customerId: updatedOrder.user_id
    });

    logger.info(`Order ${orderId} status changed from ${previousStatus} to ${status} by ${userId}`);

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: updatedOrder
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  } finally {
    client.release();
  }
});

// Admin: Get low stock products
router.get('/admin/low-stock', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, brand, stock_quantity, low_stock_threshold, image_url, category
      FROM products
      WHERE stock_quantity <= COALESCE(low_stock_threshold, 5)
        AND status = 'active'
      ORDER BY stock_quantity ASC
    `);

    res.json({
      products: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    logger.error('Error fetching low stock products:', error);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

// Admin: Get order statistics
router.get('/admin/stats', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let dateFilter = '';
    if (period === '7d') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
    } else if (period === '30d') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
    } else if (period === '90d') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
    }

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_orders,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_orders,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped_orders,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'completed'), 0) as total_revenue,
        COALESCE(AVG(total_amount) FILTER (WHERE payment_status = 'completed'), 0) as avg_order_value
      FROM shop_orders
      WHERE 1=1 ${dateFilter}
    `);

    // Get daily orders for the period
    const dailyStats = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'completed'), 0) as revenue
      FROM shop_orders
      WHERE 1=1 ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    res.json({
      summary: stats.rows[0],
      daily: dailyStats.rows
    });

  } catch (error) {
    logger.error('Error fetching order stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Cancel order (customer can cancel pending orders)
router.post('/:id/cancel', authenticateJWT, async (req, res) => {
  const client = await pool.connect();

  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const { reason } = req.body;

    await client.query('BEGIN');

    const orderResult = await client.query(`
      SELECT * FROM shop_orders WHERE id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Check if user owns the order
    if (order.user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to cancel this order' });
    }

    // Only allow cancellation of pending or confirmed orders
    if (!['pending', 'confirmed'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot cancel order with status "${order.status}". Contact support for assistance.` 
      });
    }

    // Restore stock
    const orderItems = await client.query(`
      SELECT product_id, quantity FROM shop_order_items WHERE order_id = $1
    `, [orderId]);

    for (const item of orderItems.rows) {
      await client.query(`
        UPDATE products 
        SET stock_quantity = stock_quantity + $1, updated_at = NOW()
        WHERE id = $2
      `, [item.quantity, item.product_id]);
    }

    // Refund if payment was made
    if (order.payment_status === 'completed') {
      // Refund to wallet using walletService
      await recordTransaction({
        client,
        userId,
        amount: parseFloat(order.total_amount),
        currency: 'EUR',
        transactionType: 'refund',
        direction: 'credit',
        availableDelta: parseFloat(order.total_amount),
        description: `Refund for cancelled Order #${order.order_number}`,
        relatedEntityType: 'shop_order_refund',
        // Note: orderId is INTEGER, not UUID, so we store it in metadata instead
        metadata: { orderId, orderNumber: order.order_number }
      });
    }

    // Update order status
    await client.query(`
      UPDATE shop_orders 
      SET status = 'cancelled', 
          payment_status = CASE WHEN payment_status = 'completed' THEN 'refunded' ELSE payment_status END,
          cancelled_at = NOW(),
          admin_notes = COALESCE(admin_notes || E'\n', '') || 'Cancelled by customer: ' || $1
      WHERE id = $2
    `, [reason || 'No reason provided', orderId]);

    // Log status change
    await client.query(`
      INSERT INTO shop_order_status_history (order_id, previous_status, new_status, changed_by, notes)
      VALUES ($1, $2, 'cancelled', $3, $4)
    `, [orderId, order.status, userId, `Cancelled by customer: ${reason || 'No reason provided'}`]);

    await client.query('COMMIT');

    const updatedOrder = await getOrderWithItems(orderId);

    logger.info(`Order ${orderId} cancelled by customer ${userId}`);

    res.json({
      success: true,
      message: 'Order cancelled successfully' + (order.payment_status === 'completed' ? '. Refund processed to your wallet.' : ''),
      order: updatedOrder
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

export default router;
