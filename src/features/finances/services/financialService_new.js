import apiClient from '@/shared/services/apiClient';
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
  static async getUserBalance(userId, forceRefresh = false) {
    try {
      console.log(`🔍 Fetching fresh financial data for user: ${userId}`);
      
      // Get account data from unified endpoint
      const response = await apiClient.get(`/finances/accounts/${userId}?t=${Date.now()}`);
      const account = response.data;
      
      console.log('✅ Account data received:', account);
      
      // Create UserBalance object with the clean data
      return new UserBalance({
        id: account.id,
        userId: account.id,
        currentBalance: parseFloat(account.balance || 0),
        availableCredits: parseFloat(account.balance || 0), // Simple: balance = available credits
        lifetimeValue: parseFloat(account.lifetime_value || account.total_spent || 0),
        lastPaymentDate: account.last_payment_date,
        updatedAt: account.updated_at
      });
      
    } catch (error) {
      console.error(`❌ Error getting balance for user ${userId}:`, error);
      
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
      console.log(`🔍 Fetching transactions for user: ${userId}`);
      
      const params = {
        user_id: userId,
        limit: options.limit || 50,
        offset: options.offset || 0,
        ...options
      };
      
      const response = await apiClient.get('/finances/transactions', { params });
      
      console.log(`✅ Loaded ${response.data.length} transactions`);
      
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
      console.error(`❌ Error fetching transactions for user ${userId}:`, error);
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
      console.log(`💰 Adding ${amount} funds to user ${userId}`);
      
      const response = await apiClient.post(`/finances/accounts/${userId}/add-funds`, {
        amount,
        description,
        payment_method: paymentMethod,
        reference_number: referenceNumber
      });
      
      console.log('✅ Funds added successfully');
      return response.data;
      
    } catch (error) {
      console.error('❌ Error adding funds:', error);
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
      console.log(`💸 Processing ${amount} refund for user ${userId}`);
      
      const response = await apiClient.post(`/finances/accounts/${userId}/process-refund`, {
        amount,
        description,
        booking_id: bookingId,
        entity_type: entityType
      });
      
      console.log('✅ Refund processed successfully');
      return response.data;
      
    } catch (error) {
      console.error('❌ Error processing refund:', error);
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
      console.log(`💳 Processing ${amount} charge for user ${userId}`);
      
      const response = await apiClient.post(`/finances/accounts/${userId}/process-charge`, {
        amount,
        description,
        booking_id: bookingId,
        entity_type: entityType
      });
      
      console.log('✅ Charge processed successfully');
      return response.data;
      
    } catch (error) {
      console.error('❌ Error processing charge:', error);
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
      console.log(`🔄 Syncing balance for user ${userId}`);
      
      const response = await apiClient.get(`/finances/balance-sync/${userId}`);
      
      console.log('✅ Balance synced successfully');
      return response.data;
      
    } catch (error) {
      console.error('❌ Error syncing balance:', error);
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
      console.log('📝 Creating custom transaction:', transactionData);
      
      const response = await apiClient.post('/finances/transactions', transactionData);
      
      console.log('✅ Transaction created successfully');
      return response.data;
      
    } catch (error) {
      console.error('❌ Error creating transaction:', error);
      throw new Error(`Failed to create transaction: ${error.message}`);
    }
  }
  
  /**
   * Delete transaction
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} - Delete result
   */
  static async deleteTransaction(transactionId) {
    try {
      console.log(`🗑️ Deleting transaction ${transactionId}`);
      
      const response = await apiClient.delete(`/finances/transactions/${transactionId}`);
      
      console.log('✅ Transaction deleted successfully');
      return response.data;
      
    } catch (error) {
      console.error('❌ Error deleting transaction:', error);
      throw new Error(`Failed to delete transaction: ${error.message}`);
    }
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
}

export default FinancialService;
