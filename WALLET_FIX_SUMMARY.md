# Wallet Balance System Issue - Analysis & Fix

## Root Cause Analysis

The issue where users "have balances but can't checkout" is caused by one or more of these:

### 1. **Missing Balance Records**
- When `processCheckoutPayment` → `recordTransaction` → `ensureBalance` is called
- If no `wallet_balances` record exists for the user/currency pair, it creates one with 0 balance
- But if a user has had deposits, they may show a balance in the wallet display (cached frontend state or from deposits table)
- Yet their `wallet_balances.available_amount` is 0

### 2. **Balance Not Created on First Deposit**
- When a deposit is completed, the system doesn't automatically create/update a `wallet_balances` record
- The balance only gets created when checkout attempts the transaction
- By then it's too late - the checkout fails because balance is 0

### 3. **Insufficient Balance Validation**
- The backend throws "Insufficient wallet balance" error
- But this error was being caught and returned as a generic 500 error
- Users saw a cryptic error instead of clear messaging

## Implementation Details

### Frontend Checkout Flow
1. User calls `/wallet/summary` → gets balance snapshot (e.g., `{available: 100}`)
2. User selects wallet payment method
3. Frontend checks `insufficientWallet = amount > availableBalance`
4. If sufficient, frontend calls POST /bookings with `walletCheckout` payload

### Backend Checkout Flow
1. Backend receives POST /bookings with `walletCheckout` selection
2. Calculates `walletCheckoutBreakdown` using `calculateCheckoutBreakdown(amount, paymentMix)`
3. Calls `processBookingCheckoutPayment` with `amount: breakdown.baseAmount`
4. Which calls `recordTransaction` with wallet debit
5. `recordTransaction` calls `ensureBalance(userId, currency)` which:
   - Fetches balance with `FOR UPDATE` lock
   - If not exists, creates with 0 balance
   - Returns balance row
6. Calculates `nextAvailable = currentAvailable - walletCharge`
7. If `nextAvailable < -0.0001` and `allowNegative=false`, throws **"Insufficient wallet balance"**

## The Fix

### Part 1: Better Error Handling ✅ DONE
File: `backend/routes/bookings.js` (line 1177)

Changed generic 500 error to specific error messages:
```javascript
if (err?.message?.includes('Insufficient wallet balance')) {
  return res.status(400).json({ 
    error: 'Insufficient wallet balance',
    message: 'Your wallet does not have enough funds for this booking. Please add funds or use a different payment method.'
  });
}
```

**Impact:** Users now see clear error instead of generic 500

### Part 2: Wallet Balance Integrity Script ✅ DONE
File: `backend/scripts/fix-wallet-balances.js` (NEW)

This script:
1. **Diagnoses** wallet balance issues:
   - Users with transactions but no balance record
   - Users with deposits but no balance record
   - Null/invalid amounts in balance records
   - Discrepancies between transaction sum and balance
   
2. **Fixes** issues:
   - Creates missing balance records
   - Synchronizes balance amounts with completed deposits
   - Recalculates balances from transaction history

Usage:
```bash
node backend/scripts/fix-wallet-balances.js
```

### Part 3: Prevent Future Issues
The ideal long-term fix is to ensure balance records are created/updated whenever:
1. A deposit is completed
2. A withdrawal is approved
3. Any wallet transaction occurs

This is already implemented in `recordTransaction()` via `ensureBalance()`, but deposits need to be updated.

## Testing the Fix

### Step 1: Run the diagnostic script
```bash
node backend/scripts/fix-wallet-balances.js
```

This will:
- Report any existing balance issues
- Automatically fix them
- Show the fixed status

### Step 2: Verify users can checkout
1. Go to `/bookings/checkout` with a user who had balance issues
2. Try to book a lesson using wallet payment
3. Should see proper error message if insufficient, or success if sufficient

### Step 3: Monitor logs
Check backend logs for:
```
Error creating booking: { message: 'Insufficient wallet balance', ... }
```

These should now map to user-friendly error messages.

## Data Integrity

When running `fix-wallet-balances.js`:

1. **Orphaned transactions** - transactions without balance records
   - Creates balance record for user/currency pair
   
2. **Deposits without balance** - completed deposits but zero balance
   - Creates balance record with total deposit amount
   
3. **Null amounts** - invalid data in balance records
   - Would be flagged (current fix doesn't auto-fix these - manual review needed)
   
4. **Transaction discrepancies** - sum of transactions ≠ current balance
   - Recalculates balance from transaction history

## Database Queries for Manual Verification

Check for affected users:
```sql
-- Users with completed deposits but zero balance
SELECT DISTINCT wd.user_id, wd.currency, 
       SUM(wd.amount) as total_deposits,
       COALESCE(wb.available_amount, 0) as current_balance
FROM wallet_deposit_requests wd
LEFT JOIN wallet_balances wb ON wd.user_id = wb.user_id AND wd.currency = wb.currency
WHERE wd.status = 'completed'
GROUP BY wd.user_id, wd.currency, wb.available_amount
HAVING COALESCE(wb.available_amount, 0) < SUM(wd.amount);
```

## Next Steps

1. **Run diagnostic**: `node backend/scripts/fix-wallet-balances.js`
2. **Test checkout**: Verify a user with balance can now checkout
3. **Monitor**: Watch for wallet-related errors in logs
4. **Long-term**: Consider adding webhook validation after deposits complete

## Files Modified

- `backend/routes/bookings.js` - Added better error handling for wallet insufficient balance errors
- `backend/scripts/fix-wallet-balances.js` - New diagnostic/fix script

---

## 🆕 ADDITIONAL FIXES (Current Session - Oct 19, 2025)

### Fix #3: Missing Balance Sync in POST /calendar ✅
**File**: `backend/routes/bookings.js` (lines 2429-2450)

**Problem**: Admin/manager bookings weren't syncing `users.balance` after transaction creation.

**Solution**: Added balance recalculation and sync after booking:
```javascript
const balanceResult = await client.query(
  `SELECT COALESCE(SUM(amount), 0) as balance FROM transactions WHERE user_id = $1`,
  [userId]
);
const calculatedBalance = parseFloat(balanceResult.rows[0]?.balance || 0);
await client.query(
  `UPDATE users SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
  [calculatedBalance, userId]
);
```

**Impact**: Customer balances now update immediately after admin creates booking ✅

### Fix #4: Auto-Deduct Wallet for Admin Bookings ✅
**File**: `backend/routes/bookings.js` (lines 2305-2341)

**Problem**: When admin creates booking without explicit wallet selection, system wasn't auto-deducting from wallet.

**Solution**: Added auto-wallet deduction logic for admin/manager bookings:
```javascript
else if (isAdminOrManager && use_package === false && finalFinalAmount > 0 && !resolvedWalletCheckout) {
  walletCheckoutSettings = await getWalletSettings({...});
  if (walletCheckoutSettings?.autoUseWalletFirst) {
    walletCheckoutBreakdown = calculateCheckoutBreakdown({
      amount: finalFinalAmount,
      paymentMix: { walletPercent: 100, cardPercent: 0 }
    });
    finalPaymentStatus = 'paid';
  }
}
```

**Impact**: Admin bookings now automatically use wallet when customer has `autoUseWalletFirst` enabled ✅

## Complete Fix Summary

| Issue | Root Cause | Solution | Status |
|-------|-----------|----------|--------|
| #1 Generic errors | No specific wallet error messages | Better error handling in bookings.js | ✅ |
| #2 Balance mismatches | Orphaned records, inconsistent syncing | Diagnostic/fix script | ✅ |
| #3 **Balance not synced** | **POST /calendar missing sync logic** | **Added balance recalc + sync** | ✅ NEW |
| #4 **No auto-deduction** | **Admin path skipped wallet logic** | **Added auto-deduction check** | ✅ NEW |

All code changes validated and pass linting ✅
