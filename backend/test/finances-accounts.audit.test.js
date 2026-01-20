import { jest, describe, beforeAll, afterEach, test, expect } from '@jest/globals';

let poolQueryMock;
let clientQueryMock;
let addFundsHandler;
let processRefundHandler;
let processChargeHandler;

const actorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeAll(async () => {
  poolQueryMock = jest.fn(async (sql) => {
    const text = typeof sql === 'string' ? sql : sql?.text ?? '';

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

    // Legacy transactions - track these
    if (text.startsWith('INSERT INTO transactions')) {
      clientQueryMock.lastInsert = { text, params };
      return { rows: [{ id: 'txn-123' }] };
    }

    if (text.startsWith('UPDATE users SET last_payment_date')) {
      return { rows: [] };
    }

    // Wallet balance queries - must return proper row structure with correct columns
    if (text.includes('wallet_balances') && text.includes('FOR UPDATE')) {
      return {
        rows: [{
          id: 'bal-1',
          user_id: params?.[0] || userId,
          currency: 'EUR',
          available_amount: 1000,
          pending_amount: 0,
          non_withdrawable_amount: 0,
          total_credits: 1000,
          total_debits: 0
        }]
      };
    }

    // Wallet transactions INSERT - track these with created_by
    if (text.includes('INSERT INTO wallet_transactions')) {
      clientQueryMock.lastWalletInsert = { text, params };
      return { rows: [{ id: 'wtx-1' }] };
    }

    // Wallet balances UPDATE
    if (text.includes('UPDATE wallet_balances')) {
      return { rows: [{ id: 'bal-1' }] };
    }

    // Wallet audit logs
    if (text.includes('wallet_audit_logs')) {
      return { rows: [] };
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

    const findHandler = (path) => {
      const layer = financesRouter.stack.find(
        (routeLayer) => routeLayer.route?.path === path && routeLayer.route.methods.post
      );

      if (!layer) {
        throw new Error(`${path} handler not found`);
      }

      const handlers = layer.route.stack.map((stackLayer) => stackLayer.handle);
      return handlers[handlers.length - 1];
    };

    addFundsHandler = findHandler('/accounts/:id/add-funds');
    processRefundHandler = findHandler('/accounts/:id/process-refund');
    processChargeHandler = findHandler('/accounts/:id/process-charge');
  });
});

afterEach(() => {
  jest.clearAllMocks();
  if (clientQueryMock) {
    delete clientQueryMock.lastInsert;
    delete clientQueryMock.lastWalletInsert;
  }
});

describe('Finances account adjustments audit trail', () => {
  test('POST /accounts/:id/add-funds stamps created_by', async () => {
    const json = jest.fn();
    const res = {
      status: jest.fn(() => ({ json }))
    };

    await addFundsHandler(
      {
        params: { id: userId },
        body: { amount: 75 },
        user: { id: actorId }
      },
      res
    );

  expect(res.status).toHaveBeenCalledWith(200);
  expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Funds added successfully' }));

    // Now uses wallet_transactions instead of legacy transactions table
    const walletInsert = clientQueryMock.lastWalletInsert;
    expect(walletInsert).toBeDefined();
    expect(walletInsert.text).toContain('created_by');
    expect(walletInsert.params).toContain(actorId);
  });

  test('POST /accounts/:id/process-refund stamps created_by', async () => {
    const json = jest.fn();
    const res = {
      status: jest.fn(() => ({ json }))
    };

    await processRefundHandler(
      {
        params: { id: userId },
        body: { amount: 55 },
        user: { id: actorId }
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Refund processed successfully' }));

    // Now uses wallet_transactions instead of legacy transactions table
    const walletInsert = clientQueryMock.lastWalletInsert;
    expect(walletInsert).toBeDefined();
    expect(walletInsert.text).toContain('created_by');
    expect(walletInsert.params).toContain(actorId);
  });

  test('POST /accounts/:id/process-charge stamps created_by', async () => {
    const json = jest.fn();
    const res = {
      status: jest.fn(() => ({ json }))
    };

    await processChargeHandler(
      {
        params: { id: userId },
        body: { amount: 35 },
        user: { id: actorId }
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Charge processed successfully' }));

    // Now uses wallet_transactions instead of legacy transactions table
    const walletInsert = clientQueryMock.lastWalletInsert;
    expect(walletInsert).toBeDefined();
    expect(walletInsert.text).toContain('created_by');
    expect(walletInsert.params).toContain(actorId);
  });
});
