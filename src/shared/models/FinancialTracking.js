// src/models/FinancialTracking.js
/**
 * FinancialTracking module containing models for financial transactions and student account balances
 */

/**
 * Transaction model representing a financial transaction
 */
class Transaction {
  /**
   * Create a new Transaction instance
   * @param {Object} data - The transaction data
   */  constructor(data = {}) {
    this.id = data.id || null;
    this.userId = data.userId || data.studentId || '';
    this.amount = data.amount !== undefined ? data.amount : 0;
    this.type = data.type || 'payment'; // payment, refund, credit, charge
    this.description = data.description || '';
    this.relatedEntityType = data.relatedEntityType || null; // rental, lesson, service_package, etc.
    this.relatedEntityId = data.relatedEntityId || null;
    this.paymentMethod = data.paymentMethod || null;
    this.status = data.status || 'completed'; // pending, completed, failed, cancelled
    this.receiptNumber = data.receiptNumber || '';
    this.notes = data.notes || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.createdBy = data.createdBy || null;
    this.metadata = data.metadata || {};
  }

  /**
   * Validate the transaction data
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];    if (!this.userId) {
      errors.push('User ID is required');
    }

    if (typeof this.amount !== 'number') {
      errors.push('Amount must be a number');
    }

    const validTypes = ['payment', 'refund', 'credit', 'charge', 'booking_deleted_refund'];
    if (!validTypes.includes(this.type)) {
      errors.push('Invalid transaction type');
    }

    const validStatus = ['pending', 'completed', 'failed', 'cancelled'];
    if (!validStatus.includes(this.status)) {
      errors.push('Invalid transaction status');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if transaction is a credit to student account
   * @returns {boolean} Is credit
   */
  isCredit() {
    return this.type === 'payment' || this.type === 'credit' || this.type === 'refund' || this.type === 'booking_deleted_refund';
  }

  /**
   * Check if transaction is a debit from student account
   * @returns {boolean} Is debit
   */
  isDebit() {
    return this.type === 'charge' || this.type === 'debit';
  }

  /**
   * Get formatted amount with sign based on transaction type
   * @returns {string} Formatted amount
   */
  getFormattedAmount() {
    const sign = this.isCredit() ? '+' : '-';
    const amt = Math.abs(this.amount || 0);
    try {
      // Prefer app formatter if available
      if (typeof window !== 'undefined' && window.__APP_CURRENCY__) {
        const code = window.__APP_CURRENCY__.business || 'EUR';
        // lazy import avoidance: simple global dispatch via custom event bus is overkill; format inline if context not mounted
        const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amt);
        return `${sign}${formatted}`;
      }
    } catch {}
    // Fallback simple EUR format
    return `${sign}€${amt.toFixed(2)}`;
  }

  /**
   * Get formatted date
   * @returns {string} Formatted date
   */
  getFormattedDate() {
    const date = new Date(this.createdAt);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  /**
   * Convert to a plain object for storage
   * @returns {Object} Plain object
   */  toJSON() {
    return {
      userId: this.userId,
      amount: this.amount,
      type: this.type,
      description: this.description,
      relatedEntityType: this.relatedEntityType,
      relatedEntityId: this.relatedEntityId,
      paymentMethod: this.paymentMethod,
      status: this.status,
      receiptNumber: this.receiptNumber,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy,
      metadata: this.metadata,
    };
  }
}

/**
 * UserBalance model representing a user's financial account (for users with student role)
 */
class UserBalance {
  /**
   * Create a new UserBalance instance
   * @param {Object} data - The user balance data
   */
  constructor(data = {}) {
    this.id = data.id || null;
    this.userId = data.userId || '';
    this.currentBalance = data.currentBalance !== undefined ? data.currentBalance : 0;
    this.availableCredits = data.availableCredits !== undefined ? data.availableCredits : 0;
    this.pendingPayments = data.pendingPayments !== undefined ? data.pendingPayments : 0;
    this.lifetimeValue = data.lifetimeValue !== undefined ? data.lifetimeValue : 0;
    this.lastPaymentDate = data.lastPaymentDate || null;
    this.lastPaymentAmount = data.lastPaymentAmount !== undefined ? data.lastPaymentAmount : 0;
    this.paymentMethods = data.paymentMethods || [];
    this.preferredPaymentMethod = data.preferredPaymentMethod || null;
    this.autoPayEnabled = data.autoPayEnabled !== undefined ? data.autoPayEnabled : false;
    this.autoPayThreshold = data.autoPayThreshold !== undefined ? data.autoPayThreshold : 0;
    this.updatedAt = data.updatedAt || new Date().toISOString();
    // Currency the balance is stored/displayed in (customer's preferred currency)
    this.currency = data.currency || 'EUR';
  }
  /**
   * Validate the user balance data
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];

    if (!this.userId) {
      errors.push('User ID is required');
    }

    if (typeof this.currentBalance !== 'number') {
      errors.push('Current balance must be a number');
    }

    if (typeof this.availableCredits !== 'number') {
      errors.push('Available credits must be a number');
    }

    if (this.autoPayEnabled && typeof this.autoPayThreshold !== 'number') {
      errors.push('Auto-pay threshold must be a number when auto-pay is enabled');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get account status based on balance
   * @returns {string} Account status
   */
  getAccountStatus() {
    if (this.currentBalance > 0) {
      return 'credit';
    } else if (this.currentBalance < -100) {
      return 'overdue';
    } else if (this.currentBalance < 0) {
      return 'due';
    } else {
      return 'current';
    }
  }
  /**
   * Check if user has sufficient credits for a purchase
   * @param {number} amount Amount to check
   * @returns {boolean} Has sufficient credits
   */
  hasSufficientCredits(amount) {
    return this.availableCredits >= amount;
  }

  /**
   * Get formatted current balance
   * @returns {string} Formatted balance
   */
  getFormattedBalance() {
    const amt = Math.abs(this.currentBalance || 0);
    let prefix;
    try {
      if (typeof window !== 'undefined' && window.__APP_CURRENCY__) {
        const code = window.__APP_CURRENCY__.business || 'EUR';
        prefix = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amt);
      }
    } catch {}
    const formatted = prefix || `€${amt.toFixed(2)}`;
    if (this.currentBalance > 0) return `${formatted} CR`;
    if (this.currentBalance < 0) return `${formatted} DR`;
    return prefix || '€0.00';
  }
  /**
   * Convert to a plain object for storage
   * @returns {Object} Plain object
   */
  toJSON() {
    return {
      userId: this.userId,
      currentBalance: this.currentBalance,
      availableCredits: this.availableCredits,
      pendingPayments: this.pendingPayments,
      lifetimeValue: this.lifetimeValue,
      lastPaymentDate: this.lastPaymentDate,
      lastPaymentAmount: this.lastPaymentAmount,
      paymentMethods: this.paymentMethods,
      preferredPaymentMethod: this.preferredPaymentMethod,
      autoPayEnabled: this.autoPayEnabled,
      autoPayThreshold: this.autoPayThreshold,
      updatedAt: this.updatedAt,
    };
  }
}

export { Transaction, UserBalance };
export default { Transaction, UserBalance };