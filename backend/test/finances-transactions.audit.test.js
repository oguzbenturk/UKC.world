import { jest, describe, beforeAll, afterEach, test, expect } from '@jest/globals';

let poolQueryMock;
let clientQueryMock;
let transactionsHandler;

const actorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeAll(async () => {
  poolQueryMock = jest.fn(async (sql, _params = []) => {
    const text = typeof sql === 'string' ? sql : sql?.text ?? '';

    if (text.includes('SELECT id FROM users WHERE id')) {
      return { rows: [{ id: userId }] };
    }

    if (text.includes('SELECT type, amount FROM transactions')) {
      return { rows: [] };
    }

    if (text.includes('UPDATE users \n     SET balance')) {
      return { rows: [] };
    }

    return { rows: [] };
  });

  clientQueryMock = jest.fn(async (sql, params = []) => {
    const text = typeof sql === 'string' ? sql : sql?.text ?? '';

    if (text.startsWith('BEGIN') || text.startsWith('COMMIT') || text.startsWith('ROLLBACK')) {
      return { rows: [] };
    }

    if (text.includes('SELECT id FROM users WHERE id')) {
      return { rows: [{ id: userId }] };
    }

    // Wallet balance queries from walletService - with correct column names
    if (text.includes('wallet_balances') && text.includes('SELECT')) {
      return { rows: [{ 
        id: 'bal-1', 
        user_id: userId, 
        currency: 'EUR', 
        available_amount: 1000, 
        pending_amount: 0, 
        non_withdrawable_amount: 0,
        total_credits: 1000,
        total_debits: 0
      }] };
    }
    
    // Wallet balance UPDATE
    if (text.includes('wallet_balances') && text.includes('UPDATE')) {
      return { rows: [{ id: 'bal-1' }] };
    }

    // Wallet transactions INSERT - track for assertions
    if (text.includes('wallet_transactions') && text.includes('INSERT')) {
      clientQueryMock.lastWalletInsert = { text, params };
      return { rows: [{ 
        id: 'wtx-1', 
        wallet_balance_id: 'bal-1',
        user_id: userId,
        amount: params[2] || 100,
        currency: 'EUR'
      }] };
    }
    
    // Wallet transactions SELECT
    if (text.includes('wallet_transactions')) {
      return { rows: [] };
    }

    // Wallet audit logs
    if (text.includes('wallet_audit_logs')) {
      return { rows: [] };
    }

    if (text.startsWith('INSERT INTO transactions')) {
      clientQueryMock.lastInsert = { text, params };
      return { rows: [{ id: 'txn-1' }] };
    }

    // Return empty result for any other queries to avoid throwing
    return { rows: [] };
  });

  await jest.unstable_mockModule('../db.js', () => ({
    pool: {
      query: poolQueryMock,
      connect: jest.fn(async () => ({
        query: clientQueryMock,
        release: jest.fn()
      }))
    }
  }));

  await jest.unstable_mockModule('../utils/auth.js', () => ({
    authenticateJWT: jest.fn(() => (req, _res, next) => {
      req.user = { id: actorId };
      next();
    })
  }));

  await jest.unstable_mockModule('../middlewares/authorize.js', () => ({
    authorizeRoles: jest.fn(() => (_req, _res, next) => next())
  }));

  await jest.isolateModulesAsync(async () => {
    const financesRouter = (await import('../routes/finances.js')).default;

    const routeLayer = financesRouter.stack.find(
      (layer) => layer.route?.path === '/transactions' && layer.route.methods.post
    );

    if (!routeLayer) {
      throw new Error('Transactions POST handler not found');
    }

    const handlers = routeLayer.route.stack.map((layer) => layer.handle);
    transactionsHandler = handlers[handlers.length - 1];
  });
});

afterEach(() => {
  jest.clearAllMocks();
  if (clientQueryMock) {
    delete clientQueryMock.lastInsert;
    delete clientQueryMock.lastWalletInsert;
  }
});

describe('Finances transactions audit trail', () => {
  test('POST /transactions stamps created_by', async () => {
    const json = jest.fn();
    const res = {
      status: jest.fn(() => ({ json })),
    };

    await transactionsHandler(
      {
        body: {
          user_id: userId,
          amount: 120,
          type: 'payment'
        },
        user: { id: actorId }
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalled();

    // Now uses wallet_transactions instead of legacy transactions table
    const walletInsert = clientQueryMock.lastWalletInsert;
    expect(walletInsert).toBeDefined();
    expect(walletInsert.text).toContain('created_by');
    expect(walletInsert.params).toContain(actorId);
  });
});
