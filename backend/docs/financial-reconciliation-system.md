# Financial Data Reconciliation System

## Overview

This comprehensive financial reconciliation system ensures data integrity across the application by automatically detecting and fixing discrepancies between stored financial values and transaction-based calculations.

## Components

### 1. Migration Script (`migrate-student-accounts.js`)

**Purpose**: One-time migration to populate missing `student_accounts` records with correct calculated values.

**Usage**:
```powershell
# Dry run to see what would be changed
node scripts/migrate-student-accounts.js --dry-run

# Migrate specific number of users for testing
node scripts/migrate-student-accounts.js --limit=5

# Migrate specific user
node scripts/migrate-student-accounts.js --user-id=abc123

# Full migration
node scripts/migrate-student-accounts.js
```

**Features**:
- Transaction-based balance calculation
- Safe rollback on errors
- Comprehensive logging
- Dry-run mode for testing

### 2. Testing System (`test-financial-reconciliation.js`)

**Purpose**: Comprehensive validation of financial data integrity across all users.

**Usage**:
```powershell
# Run full reconciliation test
node scripts/test-financial-reconciliation.js
```

**Features**:
- Tests all users with transactions
- Compares stored vs calculated values
- Validates student portal service
- Detects orphaned transactions
- Comprehensive reporting

### 3. Automated Reconciliation Service (`financialReconciliationService.js`)

**Purpose**: Ongoing automated monitoring and fixing of financial discrepancies.

**Features**:
- **Periodic Reconciliation**: Runs every 60 minutes (configurable)
- **Transaction-Triggered**: Auto-fixes on financial operations
- **Manual Triggers**: Admin API endpoints
- **Comprehensive Logging**: All operations logged
- **Statistics Tracking**: Performance metrics

**Configuration**:
```bash
# Environment variables
RECONCILIATION_ENABLED=true              # Enable/disable service
RECONCILIATION_INTERVAL_MINUTES=60       # How often to run (default: 60 min)
```

### 4. Middleware (`financialReconciliation.js`)

**Purpose**: Automatic reconciliation triggers for financial operations.

**Features**:
- Monitors transaction-related API calls
- Triggers reconciliation on successful responses
- Non-blocking (doesn't slow down API responses)
- Smart endpoint detection

### 5. Admin API Routes (`admin-reconciliation.js`)

**Purpose**: Administrative control over the reconciliation system.

**Endpoints**:
```http
# Get reconciliation statistics
GET /api/admin/financial-reconciliation/stats

# Manually trigger reconciliation
POST /api/admin/financial-reconciliation/run
{
  "limit": 10  // Optional: limit number of users
}

# Run comprehensive test
GET /api/admin/financial-reconciliation/test
```

## Installation & Setup

### 1. Initial Migration

```powershell
# Test the migration first
cd backend
node scripts/migrate-student-accounts.js --dry-run --limit=3

# Run full migration
node scripts/migrate-student-accounts.js
```

### 2. Verify Success

```powershell
# Run reconciliation test to verify fix
node scripts/test-financial-reconciliation.js
```

You should see **100% success rate** and **0 discrepancies**.

### 3. Server Integration

The reconciliation system is automatically initialized when the server starts (if enabled).

## How It Works

### Data Flow

1. **Transaction Created/Updated** → API endpoint called
2. **Middleware Detects** → Financial operation detected
3. **Reconciliation Triggered** → Service checks affected user
4. **Discrepancy Found** → Auto-fix applied to `student_accounts`
5. **System Consistent** → Stored values match transaction ledger

### Calculation Logic

The system uses the same financial calculation logic as `studentPortalService.js`:

```javascript
// Balance = sum of all transaction amounts
balance += transactionAmount;

// Total spent tracks positive transactions (payments, credits)
switch (transactionType) {
  case 'payment':
  case 'credit':
    totalSpent += Math.abs(amount);
    break;
  // ... other cases
}
```

### Reconciliation Process

1. **Fetch Users**: Get users with transactions
2. **Calculate Expected**: Use transaction ledger as source of truth
3. **Compare**: Check stored vs calculated values
4. **Fix Discrepancies**: Update/create `student_accounts` records
5. **Log Results**: Track all operations for monitoring

## Monitoring & Maintenance

### Health Checks

```http
# Check reconciliation stats
GET /api/admin/financial-reconciliation/stats

# Response
{
  "success": true,
  "stats": {
    "totalChecks": 450,
    "discrepanciesFound": 12,
    "discrepanciesFixed": 12,
    "errors": 0,
    "isRunning": false,
    "lastRun": "2025-09-29T00:05:05.911Z"
  }
}
```

### Manual Testing

```powershell
# Run comprehensive test anytime
node scripts/test-financial-reconciliation.js

# Expected output for healthy system:
# Success rate: 100.00%
# Perfect matches: 10
# Balance discrepancies: 0
# Total spent discrepancies: 0
```

### Logs

The system logs all operations:

```javascript
// Discrepancy detected
logger.info('Financial discrepancy detected', {
  userId,
  email,
  storedBalance,
  calculatedBalance,
  balanceDiff
});

// Auto-fix applied
logger.info('Financial discrepancy auto-fixed', {
  userId,
  email,
  action: 'updated',
  newBalance,
  newTotalSpent
});
```

## Troubleshooting

### Common Issues

1. **Migration Fails**
   - Check database connectivity
   - Verify `student_accounts` table exists
   - Check user permissions

2. **Reconciliation Not Running**
   - Check `RECONCILIATION_ENABLED=true`
   - Verify server startup logs
   - Check interval configuration

3. **Persistent Discrepancies**
   - Run manual reconciliation
   - Check transaction data integrity
   - Verify calculation logic matches

### Debugging Commands

```powershell
# Test specific user
node scripts/migrate-student-accounts.js --user-id=USER_ID --dry-run

# Limited reconciliation test
node scripts/test-financial-reconciliation.js

# Manual reconciliation via API
curl -X POST http://localhost:4000/api/admin/financial-reconciliation/run \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

## Performance Impact

- **Minimal**: Reconciliation runs in background
- **Non-blocking**: API responses not affected
- **Efficient**: Only processes users with transactions
- **Configurable**: Adjust interval based on needs

## Security

- **Admin Only**: Reconciliation APIs require admin role
- **Audit Trail**: All operations logged
- **Safe Operations**: Uses database transactions
- **Rollback**: Automatic rollback on errors

## Success Metrics

After implementing this system, you should see:

- ✅ **100% financial data accuracy**
- ✅ **0 discrepancies** in reconciliation tests
- ✅ **Automatic problem resolution**
- ✅ **Complete audit trail**
- ✅ **Proactive monitoring**

The system transforms your financial data from unreliable (0% success rate) to completely accurate (100% success rate) with ongoing automated maintenance.