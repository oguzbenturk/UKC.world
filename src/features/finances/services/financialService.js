import apiClient from '@/shared/services/apiClient';

const normalizeCascadePackageEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return undefined;
  }

  const normalized = new Map();

  entries.filter(Boolean).forEach((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      const key = String(entry);
      if (!normalized.has(key)) {
        normalized.set(key, key);
      }
      return;
    }

    if (entry && typeof entry === 'object') {
      const packageId = entry.id || entry.packageId || entry.package_id;
      if (!packageId) {
        return;
      }

      const payload = { id: packageId };
      if (entry.strategy && typeof entry.strategy === 'string') {
        payload.strategy = entry.strategy;
      }
      if (typeof entry.allowNegative === 'boolean') {
        payload.allowNegative = entry.allowNegative;
      }

      normalized.set(packageId, payload);
    }
  });

  if (normalized.size === 0) {
    return undefined;
  }

  return Array.from(normalized.values());
};
import { Transaction, UserBalance } from '@/shared/models/FinancialTracking';

/**
 * SIMPLIFIED FINANCIAL SERVICE
 * 
 * Clean, simple service that works with the new unified financial API
 * No complex calculations - just fetch data from the single source of truth
 */
class FinancialService {
  
  /**
   * Get user balance and account information
   * @param {string} userId - User ID
   * @param {boolean} forceRefresh - Force refresh (ignored, always fresh)
   * @returns {Promise<UserBalance>} - User balance object
   */
  static async getUserBalance(userId, _forceRefresh = false) {
    try {
      // Get account data from unified endpoint
      const response = await apiClient.get(`/finances/accounts/${userId}?t=${Date.now()}`);
      const account = response.data;
      
      // Create UserBalance object with the clean data
      // Note: The API returns balance already in the user's preferred_currency
      return new UserBalance({
        id: account.id,
        userId: account.id,
        currentBalance: parseFloat(account.balance || 0),
        availableCredits: parseFloat(account.balance || 0), // Simple: balance = available credits
        lifetimeValue: parseFloat(account.lifetime_value || account.total_spent || 0),
        lastPaymentDate: account.last_payment_date,
        updatedAt: account.updated_at,
        // Pass the currency that the balance is stored in (customer's preferred currency)
        currency: account.preferred_currency || account.wallet?.currency || 'EUR'
      });
      
    } catch (error) {
      // If user not found, return empty balance
      if (error.response?.status === 404) {
        return new UserBalance({ userId });
      }
      
      throw new Error(`Failed to fetch user balance: ${error.message}`);
    }
  }
    /**
   * Get user transactions
   * @param {string} userId - User ID
   * @param {Object} options - Filter options (limit, offset, type, etc.)
   * @returns {Promise<Array<Transaction>>} - Array of transactions
   */
  static async getUserTransactions(userId, options = {}) {
    try {
      const params = {
        user_id: userId,
        limit: options.limit || 50,
        offset: options.offset || 0,
        ...options
      };
      
      const response = await apiClient.get('/finances/transactions', { params });
      
      // Convert to Transaction objects
      return response.data.map(txnData => new Transaction({
        id: txnData.id,
        userId: txnData.user_id,
        amount: parseFloat(txnData.amount || 0),
        type: txnData.type,
        description: txnData.description || '',
        paymentMethod: txnData.payment_method,
        relatedEntityId: txnData.booking_id,
        relatedEntityType: txnData.entity_type,
        status: txnData.status || 'completed',
        receiptNumber: txnData.reference_number,
        createdAt: txnData.transaction_date || txnData.created_at,
        updatedAt: txnData.updated_at,
        createdBy: txnData.created_by
      }));
      
    } catch (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }
  }
  
  /**
   * Add funds to user account
   * @param {string} userId - User ID
   * @param {number} amount - Amount to add
   * @param {string} description - Description
   * @param {string} paymentMethod - Payment method
   * @param {string} referenceNumber - Reference number
   * @returns {Promise<Object>} - Transaction result
   */
  static async addFunds(userId, amount, description = 'Funds added', paymentMethod = null, referenceNumber = null) {
    try {
      const response = await apiClient.post(`/finances/accounts/${userId}/add-funds`, {
        amount,
        description,
        payment_method: paymentMethod,
        reference_number: referenceNumber
      });
      
      return response.data;
      
    } catch (error) {
      throw new Error(`Failed to add funds: ${error.message}`);
    }
  }
  
  /**
   * Process refund for user
   * @param {string} userId - User ID
   * @param {number} amount - Refund amount
   * @param {string} description - Description
   * @param {string} bookingId - Related booking ID
   * @param {string} entityType - Entity type
   * @returns {Promise<Object>} - Transaction result
   */
  static async processRefund(userId, amount, description = 'Refund processed', bookingId = null, entityType = null) {
    try {
      const response = await apiClient.post(`/finances/accounts/${userId}/process-refund`, {
        amount,
        description,
        booking_id: bookingId,
        entity_type: entityType
      });
      
      return response.data;
      
    } catch (error) {
      throw new Error(`Failed to process refund: ${error.message}`);
    }
  }
  
  /**
   * Charge user account
   * @param {string} userId - User ID
   * @param {number} amount - Charge amount
   * @param {string} description - Description
   * @param {string} bookingId - Related booking ID
   * @param {string} entityType - Entity type
   * @returns {Promise<Object>} - Transaction result
   */
  static async processCharge(userId, amount, description = 'Account charged', bookingId = null, entityType = null) {
    try {
      const response = await apiClient.post(`/finances/accounts/${userId}/process-charge`, {
        amount,
        description,
        booking_id: bookingId,
        entity_type: entityType
      });
      
      return response.data;
      
    } catch (error) {
      throw new Error(`Failed to process charge: ${error.message}`);
    }
  }
  
  /**
   * Manually sync user balance (admin function)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Sync result
   */
  static async syncBalance(userId) {
    try {
      const response = await apiClient.get(`/finances/balance-sync/${userId}`);
      
      return response.data;
      
    } catch (error) {
      throw new Error(`Failed to sync balance: ${error.message}`);
    }
  }
  
  /**
   * Create custom transaction
   * @param {Object} transactionData - Transaction data
   * @returns {Promise<Object>} - Transaction result
   */
  static async createTransaction(transactionData) {
    try {
      const response = await apiClient.post('/finances/transactions', transactionData);
      
      return response.data;
      
    } catch (error) {
      throw new Error(`Failed to create transaction: ${error.message}`);
    }
  }
  
  /**
   * Delete transaction
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} - Delete result
   */
  static async deleteTransaction(transactionId, options = {}) {
    try {
      const params = {};
      const data = {};

      if (options.force) {
        params.force = true;
      }

      if (options.reason) {
        data.reason = options.reason;
      }

      if (options.cascade && typeof options.cascade === 'object') {
        const cascadePayload = {};
        const normalizedPackages = normalizeCascadePackageEntries(options.cascade.packages);
        if (normalizedPackages) {
          cascadePayload.packages = normalizedPackages;
        }
        if (Array.isArray(options.cascade.rentals)) {
          cascadePayload.rentals = [...new Set(options.cascade.rentals.filter(Boolean))];
        }

        if (Array.isArray(options.cascade.bookings)) {
          cascadePayload.bookings = [...new Set(options.cascade.bookings.filter(Boolean))];
        }

        if (Object.keys(cascadePayload).length > 0) {
          data.cascade = cascadePayload;
        }
      }

      const response = await apiClient.delete(`/finances/transactions/${transactionId}`, {
        params,
        data: Object.keys(data).length ? data : undefined
      });

      return response.data;

    } catch (error) {
      throw error;
    }
  }

  static async getTransactionDependencies(transactionId) {
    const response = await apiClient.get(`/finances/transactions/${transactionId}/dependencies`);
    return response.data;
  }
  
  // ===========================================================================================
  // LEGACY COMPATIBILITY METHODS (for existing code)
  // ===========================================================================================
  
  /**
   * Legacy method - create user balance (now just returns balance)
   */
  static async createUserBalance(userId) {
    return this.getUserBalance(userId);
  }
  
  /**
   * Legacy method - get financial summary
   */
  static async getFinancialSummary(userId) {
    const balance = await this.getUserBalance(userId);
    return {
      balance: balance.currentBalance,
      payment_status: balance.currentBalance >= 0 ? 'current' : 'overdue',
      last_used_service: null // This would need to come from bookings if needed
    };
  }
  
  /**
   * Get bulk financial statistics for multiple users
   * @param {Array<string>} userIds - Array of user IDs
   * @returns {Promise<Object>} - Map of userId to statistics
   */
  static async getBulkStatistics(userIds) {
    try {
      const response = await apiClient.post('/finances/bulk-statistics', { userIds });
      return response.data.data || {};
    } catch (error) {
      throw new Error(`Failed to fetch bulk statistics: ${error.message}`);
    }
  }
  
  /**
   * Get bulk bookings for multiple users
   * @param {Array<string>} userIds - Array of user IDs
   * @returns {Promise<Object>} - Map of userId to bookings array
   */
  static async getBulkBookings(userIds) {
    try {
      const response = await apiClient.post('/finances/bulk-bookings', { userIds });
      return response.data.data || {};
    } catch (error) {
      throw new Error(`Failed to fetch bulk bookings: ${error.message}`);
    }
  }
}

export default FinancialService;
