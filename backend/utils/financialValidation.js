// Production-ready financial validation utility

/**
 * Validates and corrects user financial data for production
 * This function ensures financial data integrity by recalculating
 * balance and total_spent based on actual transactions
 */
export async function validateAndCorrectFinancialData(pool, userId) {
  try {
    console.log(`Validating financial data for user: ${userId}`);
    
    // Get all transactions for this user
    const transactionsResult = await pool.query(
      `SELECT id, type, amount, description, created_at
       FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at ASC`,
      [userId]
    );
    
    // Calculate correct cash balance from transactions
    let correctCashBalance = 0;
    let correctTotalSpent = 0;
    
    for (const transaction of transactionsResult.rows) {
      const amount = parseFloat(transaction.amount) || 0;
      
      switch (transaction.type) {
        case 'payment':
        case 'credit':
          correctCashBalance += amount;
          correctTotalSpent += amount;
          break;
        case 'charge':
        case 'debit':
          correctCashBalance -= amount;
          break;
        case 'refund':
          correctCashBalance += amount;
          // Refunds don't count as spending
          break;
        default:
          console.warn(`Unknown transaction type: ${transaction.type}`);
      }
    }
    
    // Get current database values
    const currentUserResult = await pool.query(
      `SELECT balance, total_spent FROM users WHERE id = $1`,
      [userId]
    );
    
    if (currentUserResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const currentBalance = parseFloat(currentUserResult.rows[0].balance) || 0;
    const currentTotalSpent = parseFloat(currentUserResult.rows[0].total_spent) || 0;
    
    // Check for discrepancies
    const balanceDiscrepancy = Math.abs(currentBalance - correctCashBalance) > 0.01;
    const totalSpentDiscrepancy = Math.abs(currentTotalSpent - correctTotalSpent) > 0.01;
    
    if (balanceDiscrepancy || totalSpentDiscrepancy) {
      console.warn(`Financial discrepancy detected for user ${userId}:`);
      console.warn(`Current balance: ${currentBalance}, Correct: ${correctCashBalance}`);
      console.warn(`Current total_spent: ${currentTotalSpent}, Correct: ${correctTotalSpent}`);
      
      // Auto-correct the database
      await pool.query(
        `UPDATE users 
         SET balance = $1, total_spent = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [correctCashBalance, correctTotalSpent, userId]
      );
      
      console.log(`✅ Financial data corrected for user ${userId}`);
      return {
        corrected: true,
        oldBalance: currentBalance,
        newBalance: correctCashBalance,
        oldTotalSpent: currentTotalSpent,
        newTotalSpent: correctTotalSpent
      };
    }
    
    console.log(`✅ Financial data is correct for user ${userId}`);
    return {
      corrected: false,
      balance: correctCashBalance,
      totalSpent: correctTotalSpent
    };
    
  } catch (error) {
    console.error(`Error validating financial data for user ${userId}:`, error);
    throw error;
  }
}
