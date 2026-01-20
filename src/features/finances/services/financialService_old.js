// src/services/financialService.js
import { UserBalance, Transaction } from '@/shared/models/FinancialTracking';
import InstructorEarning from '@/shared/models/InstructorEarning';
import apiClient from '@/shared/services/apiClient';

/**
 * Service for managing financial data
 */
class FinancialService {  /**
   * Get user balance by user ID
   * @param {string} userId - User ID
   * @returns {Promise<UserBalance>} - User balance
   */
  static async getUserBalance(userId) {
    try {
      // Try new unified endpoint first
      let response;
      let packageResponse;
      
      // Add cache busting timestamp
      const timestamp = Date.now();
      
      try {
        response = await apiClient.get(`/finances/accounts/${userId}?t=${timestamp}`);
        
        // Also fetch package data to include in balance
        packageResponse = await apiClient.get(`/services/customer-packages/${userId}?t=${timestamp}`);
      } catch (error) {
        // Fallback to legacy endpoint for backward compatibility
        if (error.response?.status === 404) {
          response = await apiClient.get(`/finances/student-accounts/${userId}?t=${timestamp}`);
        } else {
          throw error;
        }
      }
      
      let packageValue = 0;
      let packageCredits = 0;
      let packageDebt = 0;
      
      // Calculate value from packages
      if (packageResponse && packageResponse.data && Array.isArray(packageResponse.data)) {
        // Sum up the purchase price of all packages for lifetime value
        packageValue = packageResponse.data.reduce((total, pkg) => {
          return total + (parseFloat(pkg.price) || 0);
        }, 0);
        
        // Calculate package debt - packages that haven't been paid for
        packageDebt = packageResponse.data
          .filter(pkg => pkg.status === 'active')
          .reduce((total, pkg) => {
            const usedHours = parseFloat(pkg.usedHours) || 0;
            const totalHours = parseFloat(pkg.totalHours) || 0;
            const price = parseFloat(pkg.price) || 0;
            
            // Calculate how much of the package has been consumed but not paid for
            if (totalHours > 0 && usedHours > 0) {
              return total + ((usedHours / totalHours) * price);
            }
            return total;
          }, 0);
        
        // Calculate remaining value from active packages (for available credits)
        packageCredits = packageResponse.data
          .filter(pkg => pkg.status === 'active')
          .reduce((total, pkg) => {
            const remainingHours = parseFloat(pkg.remainingHours) || 0;
            const totalHours = parseFloat(pkg.totalHours) || 0;
            const price = parseFloat(pkg.price) || 0;
            
            // Calculate remaining value based on proportion of hours left
            if (totalHours > 0) {
              return total + ((remainingHours / totalHours) * price);
            }
            return total;
          }, 0);
      }
      
      if (response.data && response.data.account) {
        const account = response.data.account;
        // Use the balance calculated by the backend (includes unpaid bookings)
        const actualBalance = parseFloat(account.balance || 0);
        
        // Debug logging for Pierre
        if (userId === '03a06b6d-27a7-463d-bd2d-4a9c9422d608') {
          console.log('=== PIERRE FINANCIAL DEBUG ===');
          console.log('Backend account data:', account);
          console.log('Backend balance:', account.balance);
          console.log('Backend total_spent:', account.total_spent);
          console.log('Backend lifetime_value:', account.lifetime_value);
          console.log('Package response data:', packageResponse?.data);
          console.log('Calculated packageValue:', packageValue);
          console.log('Final calculations:');
          console.log('- actualBalance:', actualBalance);
          console.log('- lifetimeValue (total_spent + packageValue):', parseFloat(account.total_spent || 0) + packageValue);
          console.log('================================');
        }
        
        return new UserBalance({
          id: account.id || account.user_id,
          userId: account.id || account.user_id,
          currentBalance: actualBalance, // Backend now includes unpaid bookings
          // Available credits includes both cash balance and package credits
          availableCredits: actualBalance + packageCredits,
          // Lifetime value should only be from actual money transactions
          lifetimeValue: parseFloat(account.lifetime_value || account.total_spent || 0),
          lastPaymentDate: account.last_payment_date,
          updatedAt: account.updated_at
        });
      }
      
      // If no balance exists, return a new balance with just package data
      return new UserBalance({ 
        userId,
        currentBalance: 0, // No account, no debt
        availableCredits: packageCredits,
        lifetimeValue: packageValue
      });
    } catch (error) {
      console.error(`Error getting balance for user ${userId}:`, error);
      
      // If it's a 404, gracefully return empty balance instead of throwing
      if (error.response?.status === 404) {
        return new UserBalance({ userId });
      }
      
      throw new Error(`Failed to fetch user balance: ${error.message}`);
    }
  }
  
  /**
   * Create a new user balance
   * @param {string} userId - User ID
   * @returns {Promise<UserBalance>} - Created balance
   */
  static async createUserBalance(userId) {
    try {
      // With the unified approach, balances are automatically created with users
      // So we just return a fresh balance object
      return new UserBalance({ userId });
    } catch (error) {
      console.error(`Error creating balance for user ${userId}:`, error);
      throw new Error(`Failed to create user balance: ${error.message}`);
    }
  }

  /**
   * Get financial summary for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Object with balance, payment_status, and last_used_service
   */
  static async getFinancialSummary(userId) {
    try {
      const balanceData = await this.getUserBalance(userId);
      const transactions = await this.getUserTransactions(userId, { limit: 5, sortBy: 'createdAt', order: 'desc' });
      const bookings = await apiClient.get(`/bookings?userId=${userId}&status=confirmed`);

      let balance = balanceData.currentBalance || 0;
      let last_used_service = 'N/A';
      let payment_status = 'paid';

      // Determine last service from transactions or bookings
      if (transactions && transactions.length > 0) {
        last_used_service = transactions[0].description || 'N/A';
      } else if (bookings.data && bookings.data.length > 0) {
        // Find the most recent booking to use as the last service
        const lastBooking = bookings.data.sort((a, b) => new Date(b.start_time) - new Date(a.start_time))[0];
        last_used_service = lastBooking.title || 'Kite Lesson'; // Fallback title
      }

      // Recalculate balance based on unpaid bookings
      if (bookings.data && bookings.data.length > 0) {
        const unpaidBookings = bookings.data.filter(b => b.payment_status !== 'paid');
        const debt = unpaidBookings.reduce((acc, booking) => acc + (booking.price || 0), 0);
        balance -= debt;
      }

      if (balance < 0) {
        payment_status = 'unpaid';
      } else if (balance === 0 && (!transactions || transactions.length === 0) && (!bookings.data || bookings.data.length === 0)) {
        payment_status = 'pending';
      }

      return {
        balance,
        payment_status,
        last_used_service,
      };
    } catch (error) {
      console.error(`Error getting financial summary for user ${userId}:`, error);
      return {
        balance: 0,
        payment_status: 'unknown',
        last_used_service: 'N/A',
      };
    }
  }

    /**
   * Get all balance transactions for a user (with student role)
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array<BalanceTransaction>>} - Array of transactions
   */
  static async getUserTransactions(userId, options = {}) {
    try {
      const params = new URLSearchParams();
      params.append('userId', userId);

      if (options.limit) params.append('limit', options.limit);
      if (options.sortBy) params.append('sortBy', options.sortBy);
      if (options.order) params.append('order', options.order);
      if (options.type) params.append('type', options.type);
      if (options.dateRange) {
        params.append('startDate', options.dateRange.start);
        params.append('endDate', options.dateRange.end);
      }

      const response = await apiClient.get(`/finances/transactions?${params.toString()}`);
      
      // Map the transactions from the API response to the Transaction model
      return response.data.map(transaction => new Transaction({
        id: transaction.id,
        userId: transaction.user_id,
        amount: parseFloat(transaction.amount),
        type: transaction.type, // Keep original type, don't convert
        description: transaction.description,
        paymentMethod: transaction.payment_method,
        status: transaction.status || 'completed',
        createdAt: transaction.created_at,
        updatedAt: transaction.updated_at,
        relatedEntityId: transaction.booking_id,
        relatedEntityType: transaction.booking_id ? 'booking' : null
      }));
    } catch (error) {
      console.error(`Error getting transactions for user ${userId}:`, error);
      return []; // Return empty array on error
    }
  }
  
  /**   * Add funds to user balance
   * @param {string} userId - User ID
   * @param {number} amount - Amount to add
   * @param {string} description - Transaction description
   * @param {string} paymentMethod - Payment method
   * @param {string} referenceNumber - Reference number
   * @returns {Promise<Object>} - Updated balance and transaction
   */
  static async addUserFunds(userId, amount, description, paymentMethod = null, referenceNumber = null) {
    try {
      if (amount <= 0) {
        throw new Error('Amount must be greater than zero');
      }
        const response = await apiClient.post(`/finances/transactions`, {
        userId: userId,
        amount,
        type: 'payment',
        description,
        paymentMethod,
        referenceNumber
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error adding funds for user ${userId}:`, error);
      throw new Error(`Failed to add funds: ${error.message}`);
    }
  }
  
  /**   * Process payment for a service or rental
   * @param {string} userId - User ID
   * @param {number} amount - Payment amount
   * @param {string} type - Transaction type (service_payment, rental_payment)
   * @param {string} relatedEntityId - ID of the related entity
   * @param {string} relatedEntityType - Type of the related entity
   * @param {string} description - Transaction description
   * @returns {Promise<Object>} - Updated balance and transaction
   */
  static async processPayment(userId, amount, type, relatedEntityId, relatedEntityType, description) {
    try {
      if (amount <= 0) {
        throw new Error('Amount must be greater than zero');
      }
        if (!['service_payment', 'rental_payment', 'charge', 'payment', 'credit'].includes(type)) {
        throw new Error('Invalid payment type');
      }
      
      const response = await apiClient.post(`/finances/transactions`, {
        userId: userId,
        amount,
        type,
        description,
        bookingId: relatedEntityId,
        entityType: relatedEntityType
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error processing payment for user ${userId}:`, error);
      throw new Error(`Failed to process payment: ${error.message}`);
    }
  }
    /**
   * Process refund to user balance
   * @param {string} userId - User ID
   * @param {number} amount - Refund amount
   * @param {string} relatedEntityId - ID of the related entity
   * @param {string} relatedEntityType - Type of the related entity
   * @param {string} description - Transaction description
   * @returns {Promise<Object>} - Updated balance and transaction
   */
  static async processRefund(userId, amount, relatedEntityId, relatedEntityType, description) {
    try {
      if (amount <= 0) {
        throw new Error('Amount must be greater than zero');
      }
        const response = await apiClient.post(`/finances/transactions`, {
        userId: userId,
        amount,
        type: 'refund',
        description,
        bookingId: relatedEntityId,
        entityType: relatedEntityType
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error processing refund for user ${userId}:`, error);
      throw new Error(`Failed to process refund: ${error.message}`);
    }
  }
  
  /**
   * Get instructor earnings for a period
   * @param {string} instructorId - Instructor ID
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<Object>} - Instructor earnings data
   */
  static async getInstructorEarnings(instructorId, startDate, endDate) {
    try {
      const response = await apiClient.get(`/finances/instructor-earnings/${instructorId}?startDate=${startDate}&endDate=${endDate}`);
      
      return {
        instructor: instructorId,
        earnings: response.data.map(earning => new InstructorEarning({
          id: earning.id,
          instructorId: earning.instructor_id,
          bookingId: earning.booking_id,
          baseRate: parseFloat(earning.base_rate),
          commissionRate: parseFloat(earning.commission_rate),
          bonus: parseFloat(earning.bonus),
          totalEarnings: parseFloat(earning.total_earnings),
          lessonDate: earning.lesson_date,
          lessonDuration: earning.lesson_duration,
          lessonAmount: parseFloat(earning.lesson_amount),
          payrollId: earning.payroll_id,
          createdAt: earning.created_at
        })),
        currentPayroll: null // Placeholder for current payroll logic
      };
    } catch (error) {
      console.error(`Error getting earnings for instructor ${instructorId}:`, error);
      throw new Error(`Failed to fetch instructor earnings: ${error.message}`);
    }
  }
  
  /**
   * Generate payroll for instructor
   * @param {string} instructorId - Instructor ID 
   * @param {string} startDate - Start date of period
   * @param {string} endDate - End date of period
   * @param {number} baseSalary - Base salary amount
   * @param {number} bonus - Bonus amount
   * @returns {Promise<Object>} - Generated payroll
   */
  static async generateInstructorPayroll(instructorId, startDate, endDate, baseSalary = 0, bonus = 0) {
    try {
      const response = await apiClient.post(`/finances/instructor-payroll`, {
        instructorId,
        periodStartDate: startDate,
        periodEndDate: endDate,
        baseSalary,
        bonus
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error generating payroll for instructor ${instructorId}:`, error);
      throw new Error(`Failed to generate payroll: ${error.message}`);
    }
  }
  
  /**
   * Process (mark as paid) an instructor payroll
   * @param {string} payrollId - Payroll ID
   * @param {string} paymentDate - Payment date
   * @param {string} paymentMethod - Payment method
   * @param {string} referenceNumber - Reference number
   * @returns {Promise<Object>} - Updated payroll
   */
  static async processInstructorPayroll(payrollId, paymentDate, paymentMethod, referenceNumber) {
    try {
      const response = await apiClient.put(`/finances/instructor-payroll/${payrollId}`, {
        paymentDate,
        paymentMethod,
        referenceNumber
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error processing payroll ${payrollId}:`, error);
      throw new Error(`Failed to process payroll: ${error.message}`);
    }
  }
  
  /**
   * Get financial summary report
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<Object>} - Financial summary
   */
  static async getFinancialSummary(startDate, endDate) {
    try {
      const response = await apiClient.get(`/finances/summary?startDate=${startDate}&endDate=${endDate}`);
      
      return response.data;
    } catch (error) {
      console.error('Error generating financial summary:', error);
      throw new Error(`Failed to generate financial summary: ${error.message}`);
    }
  }
  /**
   * Get financial statistics for a user or overall system
   * @param {string} [id] - Optional user ID for user-specific statistics
   * @returns {Promise<Object>} - Financial statistics
   */
  static async getStatistics(id = null) {
    try {
      const endpoint = id 
        ? `/finances/statistics?userId=${id}` 
        : '/finances/statistics';
      
      const response = await apiClient.get(endpoint);
      return response.data;
    } catch (error) {
      console.error('Error fetching financial statistics:', error);
      throw new Error(`Failed to fetch financial statistics: ${error.message}`);
    }
  }

  /**
   * Get financial statistics for multiple users at once (bulk operation)
   * Automatically handles chunking for large user lists
   * @param {string[]} userIds - Array of user IDs
   * @returns {Promise<Object>} - Map of user ID to financial statistics
   */
  static async getBulkStatistics(userIds) {
    try {
      if (!userIds || userIds.length === 0) {
        return {};
      }
      
      const CHUNK_SIZE = 1000; // Backend limit
      
      // If userIds is small enough, send in one request
      if (userIds.length <= CHUNK_SIZE) {
        const response = await apiClient.post('/finances/bulk-statistics', {
          userIds: userIds
        });
        return response.data.data || {};
      }
      
      // For large lists, chunk into smaller requests
      const chunks = [];
      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        chunks.push(userIds.slice(i, i + CHUNK_SIZE));
      }
      
      // Send all chunks in parallel for maximum speed
      const chunkPromises = chunks.map(chunk =>
        apiClient.post('/finances/bulk-statistics', { userIds: chunk })
      );
      
      const responses = await Promise.all(chunkPromises);
      
      // Merge all results into a single object
      const mergedResults = {};
      responses.forEach(response => {
        Object.assign(mergedResults, response.data.data || {});
      });
      return mergedResults;
    } catch (error) {
      console.error('Error getting bulk financial statistics:', error);
      throw new Error(`Failed to fetch bulk financial statistics: ${error.message}`);
    }
  }

  /**
   * Get bookings for multiple users at once (bulk operation)
   * Automatically handles chunking for large user lists
   * @param {string[]} userIds - Array of user IDs
   * @returns {Promise<Object>} - Map of user ID to bookings array
   */
  static async getBulkBookings(userIds) {
    try {
      if (!userIds || userIds.length === 0) {
        return {};
      }
      
      const CHUNK_SIZE = 1000; // Backend limit
      
      // If userIds is small enough, send in one request
      if (userIds.length <= CHUNK_SIZE) {
        const response = await apiClient.post('/finances/bulk-bookings', {
          userIds: userIds
        });
        return response.data.data || {};
      }
      
      // For large lists, chunk into smaller requests
      const chunks = [];
      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        chunks.push(userIds.slice(i, i + CHUNK_SIZE));
      }
      
      // Send all chunks in parallel for maximum speed
      const chunkPromises = chunks.map(chunk =>
        apiClient.post('/finances/bulk-bookings', { userIds: chunk })
      );
      
      const responses = await Promise.all(chunkPromises);
      
      // Merge all results into a single object
      const mergedResults = {};
      responses.forEach(response => {
        Object.assign(mergedResults, response.data.data || {});
      });
      return mergedResults;
    } catch (error) {
      console.error('Error getting bulk bookings:', error);
      throw new Error(`Failed to fetch bulk bookings: ${error.message}`);
    }
  }
}

export default FinancialService;

