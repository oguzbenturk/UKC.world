import { jest } from '@jest/globals';
import bookingsRouter from '../../../../backend/routes/bookings.js';
import { pool } from '../../../../backend/db.js';

const originalConnect = pool.connect;
const originalPoolQuery = pool.query;

// ---------------------------------------------------------------------------
// Helpers: find specific route handlers from the Express router stack
// ---------------------------------------------------------------------------

const findRouteLayer = (method, path) => {
  return bookingsRouter.stack.find(
    (layer) => layer.route && layer.route.path === path && layer.route.methods[method]
  );
};

const findHandler = (method, path) => {
  const layer = findRouteLayer(method, path);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  const handlers = layer.route.stack.map((l) => l.handle);
  return handlers[handlers.length - 1];
};

// ---------------------------------------------------------------------------
// Test 1: Route ordering — /pending-transfers before /:id
// ---------------------------------------------------------------------------

describe('Bank transfer flow - route ordering', () => {
  test('/pending-transfers GET is defined before /:id GET', () => {
    const pendingTransfersIndex = bookingsRouter.stack.findIndex(
      (layer) =>
        layer.route &&
        layer.route.path === '/pending-transfers' &&
        layer.route.methods.get
    );

    const singleIdIndex = bookingsRouter.stack.findIndex(
      (layer) =>
        layer.route &&
        layer.route.path === '/:id' &&
        layer.route.methods.get
    );

    expect(pendingTransfersIndex).toBeGreaterThan(-1);
    expect(singleIdIndex).toBeGreaterThan(-1);
    expect(pendingTransfersIndex).toBeLessThan(singleIdIndex);
  });

  test('/pending-transfers/:id/action PATCH is defined before /:id GET', () => {
    const patchIndex = bookingsRouter.stack.findIndex(
      (layer) =>
        layer.route &&
        layer.route.path === '/pending-transfers/:id/action' &&
        layer.route.methods.patch
    );

    const singleIdIndex = bookingsRouter.stack.findIndex(
      (layer) =>
        layer.route &&
        layer.route.path === '/:id' &&
        layer.route.methods.get
    );

    expect(patchIndex).toBeGreaterThan(-1);
    expect(patchIndex).toBeLessThan(singleIdIndex);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Booking creation — pending_payment for waiting_payment package
//   (validates the const→let fix on finalStatus)
// ---------------------------------------------------------------------------

describe('Bank transfer flow - booking creation with pending_payment package', () => {
  afterEach(() => {
    pool.connect = originalConnect;
    pool.query = originalPoolQuery;
  });

  test('creates booking with pending_payment status when package is waiting_payment', async () => {
    const handler = findHandler('post', '/');
    const capturedInserts = [];

    const mockClient = {
      query: jest.fn(async (sql, params) => {
        if (typeof sql !== 'string') sql = sql?.text ?? '';
        const n = sql.trim();

        if (n.startsWith('BEGIN') || n.startsWith('COMMIT') || n.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        // preferred_currency lookup
        if (n.includes('preferred_currency') || n.includes('preferred_wallet_currency')) {
          return { rows: [{ preferred_currency: 'EUR', preferred_wallet_currency: 'EUR' }] };
        }

        // Service lookup
        if (n.includes('FROM services') && n.includes('WHERE')) {
          return {
            rows: [{
              id: 'svc-1', name: 'Kitesurf Lesson', price: '100', currency: 'EUR',
              category: 'lesson', lesson_category_tag: null, discipline_tag: null,
              level_tag: null, max_participants: null, duration: 1
            }]
          };
        }

        // Instructor skill check
        if (n.includes('instructor_skills') || n.includes('instructor_disciplines')) {
          return { rows: [] };
        }

        // Capacity check
        if (n.includes('COUNT(*)') && n.includes('booking_count')) {
          return { rows: [{ booking_count: '0' }] };
        }

        // Package lookup — returns a waiting_payment package
        if (n.includes('FROM customer_packages') && n.includes('WHERE')) {
          return {
            rows: [{
              id: 'pkg-1',
              package_name: '6h Kitesurf Package',
              remaining_hours: '6',
              total_hours: '6',
              used_hours: '0',
              purchase_price: '300',
              lesson_service_name: 'Kitesurf Lesson',
              pkg_status: 'waiting_payment'
            }]
          };
        }

        // Package update
        if (n.startsWith('UPDATE customer_packages')) {
          return {
            rows: [{
              id: 'pkg-1', package_name: '6h Kitesurf Package',
              used_hours: '1', remaining_hours: '5', status: 'waiting_payment',
              total_hours: '6', purchase_price: '300'
            }]
          };
        }

        // Overlap checks — no conflicts
        if (n.includes('FROM bookings') && (n.includes('status NOT IN') || n.includes("status != 'cancelled'"))) {
          return { rows: [] };
        }

        // Booking INSERT — capture values to assert pending_payment
        if (n.startsWith('INSERT INTO bookings')) {
          capturedInserts.push({ sql: n, params });
          return {
            rows: [{
              id: 'bk-new-1', date: '2026-03-31', start_hour: 16.5,
              duration: 1, student_user_id: 'student-1',
              instructor_user_id: 'instr-1', customer_user_id: 'student-1',
              status: params?.[6] || 'pending_payment',
              payment_status: params?.[7] || 'pending_payment',
              amount: 0, final_amount: 0, group_size: 1,
              service_id: 'svc-1', customer_package_id: 'pkg-1'
            }]
          };
        }

        // Re-fetch booking for response
        if (n.startsWith('SELECT') && n.includes('json_agg')) {
          return {
            rows: [{
              id: 'bk-new-1', status: 'pending_payment', payment_status: 'pending_payment',
              amount: 0, final_amount: 0, participants: []
            }]
          };
        }

        // Wallet balance / transactions
        if (n.includes('wallet_balances') && n.includes('FOR UPDATE')) {
          return { rows: [{ id: 'bal-1', available_amount: 0, pending_amount: 0, non_withdrawable_amount: 0, total_credits: 0, total_debits: 0, currency: 'EUR' }] };
        }
        if (n.includes('INSERT INTO wallet_transactions')) {
          return { rows: [{ id: 'wtx-1' }] };
        }
        if (n.includes('UPDATE wallet_balances')) {
          return { rows: [{ id: 'bal-1' }] };
        }
        if (n.includes('wallet_audit_logs')) {
          return { rows: [] };
        }

        return { rows: [] };
      }),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);
    pool.query = jest.fn().mockResolvedValue({ rows: [] });

    const req = {
      user: { id: 'admin-1', role: 'admin', email: 'admin@test.com' },
      query: {},
      body: {
        date: '2026-03-31',
        start_hour: 16.5,
        duration: 1,
        student_user_id: 'student-1',
        instructor_user_id: 'instr-1',
        service_id: 'svc-1',
        status: 'confirmed',
        use_package: true,
        customer_package_id: 'pkg-1',
      },
      socketService: { emitToChannel: jest.fn() }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res, () => {});

    expect(statusMock).toHaveBeenCalledWith(201);

    // The INSERT should use pending_payment for both status and payment_status
    expect(capturedInserts.length).toBeGreaterThanOrEqual(1);
    const insertParams = capturedInserts[0].params;
    // status is at index 6, payment_status at index 7 in bookingValues
    const statusIdx = insertParams.indexOf('pending_payment');
    expect(statusIdx).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Availability — pending_payment bookings excluded from slot checks
// ---------------------------------------------------------------------------

describe('Bank transfer flow - availability exclusion', () => {
  afterEach(() => {
    pool.connect = originalConnect;
    pool.query = originalPoolQuery;
  });

  test('available-slots query excludes pending_payment via SQL', async () => {
    const handler = findHandler('get', '/available-slots');
    const capturedQueries = [];

    pool.query = jest.fn(async (sql, params) => {
      if (typeof sql !== 'string') sql = sql?.text ?? '';
      capturedQueries.push(sql);

      // Instructor lookup by role
      if (sql.includes('FROM users') && sql.includes('instructor')) {
        return { rows: [{ id: 'instr-1', name: 'Test Instructor', email: 'i@t.com' }] };
      }

      // Instructor availability schedule
      if (sql.includes('instructor_availability') || sql.includes('instructor_schedules') || sql.includes('schedule_templates')) {
        return { rows: [] };
      }

      // The bookings query for slot checking
      if (sql.includes('FROM bookings') && sql.includes('date')) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    const req = {
      user: { id: 'admin-1', role: 'admin' },
      query: {
        startDate: '2026-04-01',
        endDate: '2026-04-01',
        instructorIds: 'instr-1'
      }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res, () => {});

    const bookingsQuery = capturedQueries.find(
      (q) => q.includes('FROM bookings') && q.includes('status NOT IN')
    );
    expect(bookingsQuery).toBeDefined();
    expect(bookingsQuery).toContain("status NOT IN ('cancelled', 'pending_payment')");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Calendar / listing — pending_payment excluded
// ---------------------------------------------------------------------------

describe('Bank transfer flow - calendar/listing exclusion', () => {
  afterEach(() => {
    pool.connect = originalConnect;
    pool.query = originalPoolQuery;
  });

  test('GET / listing query contains pending_payment exclusion', async () => {
    const handler = findHandler('get', '/');
    const capturedQueries = [];

    pool.query = jest.fn(async (sql, params) => {
      if (typeof sql !== 'string') sql = sql?.text ?? '';
      capturedQueries.push(sql);
      return { rows: [] };
    });

    const req = {
      user: { id: 'admin-1', role: 'admin' },
      query: {}
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res, () => {});

    const mainQuery = capturedQueries.find(
      (q) => q.includes('FROM bookings') && q.includes("b.status != 'pending_payment'")
    );
    expect(mainQuery).toBeDefined();
  });

  test('GET /calendar query contains pending_payment exclusion', async () => {
    const handler = findHandler('get', '/calendar');
    const capturedQueries = [];

    pool.query = jest.fn(async (sql, params) => {
      if (typeof sql !== 'string') sql = sql?.text ?? '';
      capturedQueries.push(sql);
      return { rows: [] };
    });

    const req = {
      user: { id: 'admin-1', role: 'admin' },
      query: {}
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res, () => {});

    const calendarQuery = capturedQueries.find(
      (q) => q.includes('FROM bookings') && q.includes("b.status != 'pending_payment'")
    );
    expect(calendarQuery).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 5: Approval — confirms bookings + creates wallet entries
// ---------------------------------------------------------------------------

describe('Bank transfer flow - approval', () => {
  afterEach(() => {
    pool.connect = originalConnect;
    pool.query = originalPoolQuery;
  });

  test('approve action on package receipt: activates package, confirms bookings, records wallet txns', async () => {
    const handler = findHandler('patch', '/pending-transfers/:id/action');
    const executedSQLs = [];
    const walletTxCalls = [];

    const mockClient = {
      query: jest.fn(async (sql, params) => {
        if (typeof sql !== 'string') sql = sql?.text ?? '';
        const n = sql.trim();
        executedSQLs.push({ sql: n, params });

        if (n.startsWith('BEGIN') || n.startsWith('COMMIT') || n.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        // Receipt lookup
        if (n.includes('FROM bank_transfer_receipts') && n.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 'receipt-1', status: 'pending', user_id: 'user-1',
              booking_id: null, customer_package_id: 'pkg-1',
              amount: '300', currency: 'EUR'
            }]
          };
        }

        // Update receipt status
        if (n.includes('UPDATE bank_transfer_receipts')) {
          return { rows: [] };
        }

        // Activate package
        if (n.includes('UPDATE customer_packages') && n.includes("status = 'active'")) {
          return { rows: [{ id: 'pkg-1', status: 'active' }] };
        }

        // Confirm bookings under this package
        if (n.includes('UPDATE bookings') && n.includes("status = 'confirmed'") && n.includes('customer_package_id')) {
          expect(n).toContain("status = 'pending_payment'");
          expect(n).toContain("payment_status IN ('pending_payment', 'waiting_payment')");
          return { rows: [{ id: 'bk-1' }, { id: 'bk-2' }] };
        }

        // Fetch package name for ledger
        if (n.includes('SELECT package_name') && n.includes('FROM customer_packages')) {
          return { rows: [{ package_name: '6h Kitesurf Package' }] };
        }

        // Wallet balance queries
        if (n.includes('wallet_balances') && n.includes('FOR UPDATE')) {
          return { rows: [{ id: 'bal-1', user_id: 'user-1', currency: 'EUR', available_amount: 0, pending_amount: 0, non_withdrawable_amount: 0, total_credits: 0, total_debits: 0 }] };
        }

        // Wallet transactions INSERT — track these
        if (n.includes('INSERT INTO wallet_transactions')) {
          walletTxCalls.push({ sql: n, params });
          return { rows: [{ id: 'wtx-' + walletTxCalls.length }] };
        }

        if (n.includes('UPDATE wallet_balances')) {
          return { rows: [{ id: 'bal-1' }] };
        }

        if (n.includes('wallet_audit_logs')) {
          return { rows: [] };
        }

        return { rows: [] };
      }),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);

    const req = {
      user: { id: 'admin-1', role: 'admin' },
      params: { id: 'receipt-1' },
      body: { action: 'approve', reviewerNotes: 'Verified' },
      socketService: { emitToChannel: jest.fn() }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res, () => {});

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );

    // Package should be activated
    const activateSQL = executedSQLs.find(
      (e) => e.sql.includes('UPDATE customer_packages') && e.sql.includes("status = 'active'")
    );
    expect(activateSQL).toBeDefined();

    // Bookings should be confirmed
    const confirmSQL = executedSQLs.find(
      (e) => e.sql.includes('UPDATE bookings') && e.sql.includes("status = 'confirmed'")
    );
    expect(confirmSQL).toBeDefined();

    // Wallet transactions: at least 2 (credit + debit) with availableDelta: 0
    expect(walletTxCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Rejection — cancels booking / expires package
// ---------------------------------------------------------------------------

describe('Bank transfer flow - rejection', () => {
  afterEach(() => {
    pool.connect = originalConnect;
    pool.query = originalPoolQuery;
  });

  test('reject action on package receipt: expires package and cancels bookings', async () => {
    const handler = findHandler('patch', '/pending-transfers/:id/action');
    const executedSQLs = [];

    const mockClient = {
      query: jest.fn(async (sql, params) => {
        if (typeof sql !== 'string') sql = sql?.text ?? '';
        const n = sql.trim();
        executedSQLs.push({ sql: n, params });

        if (n.startsWith('BEGIN') || n.startsWith('COMMIT') || n.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        if (n.includes('FROM bank_transfer_receipts') && n.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 'receipt-2', status: 'pending', user_id: 'user-2',
              booking_id: null, customer_package_id: 'pkg-2',
              amount: '300', currency: 'EUR'
            }]
          };
        }

        if (n.includes('UPDATE bank_transfer_receipts')) {
          return { rows: [] };
        }

        return { rows: [] };
      }),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);

    const req = {
      user: { id: 'admin-1', role: 'admin' },
      params: { id: 'receipt-2' },
      body: { action: 'reject', reviewerNotes: 'Invalid receipt' },
      socketService: { emitToChannel: jest.fn() }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res, () => {});

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );

    // Package should be expired
    const expireSQL = executedSQLs.find(
      (e) => e.sql.includes('UPDATE customer_packages') && e.sql.includes("status = 'expired'")
    );
    expect(expireSQL).toBeDefined();

    // Bookings under package should be cancelled
    const cancelSQL = executedSQLs.find(
      (e) => e.sql.includes('UPDATE bookings') && e.sql.includes("status = 'cancelled'") && e.sql.includes('customer_package_id')
    );
    expect(cancelSQL).toBeDefined();

    // Socket notification about rejection
    expect(req.socketService.emitToChannel).toHaveBeenCalledWith(
      expect.stringContaining('user:'),
      'notification:new',
      expect.objectContaining({
        notification: expect.objectContaining({ title: 'Bank Transfer Rejected' })
      })
    );
  });

  test('reject action on standalone booking: cancels the booking', async () => {
    const handler = findHandler('patch', '/pending-transfers/:id/action');
    const executedSQLs = [];

    const mockClient = {
      query: jest.fn(async (sql, params) => {
        if (typeof sql !== 'string') sql = sql?.text ?? '';
        const n = sql.trim();
        executedSQLs.push({ sql: n, params });

        if (n.startsWith('BEGIN') || n.startsWith('COMMIT') || n.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        if (n.includes('FROM bank_transfer_receipts') && n.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 'receipt-3', status: 'pending', user_id: 'user-3',
              booking_id: 'bk-solo', customer_package_id: null,
              amount: '80', currency: 'EUR'
            }]
          };
        }

        if (n.includes('UPDATE bank_transfer_receipts')) {
          return { rows: [] };
        }

        return { rows: [] };
      }),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);

    const req = {
      user: { id: 'admin-1', role: 'admin' },
      params: { id: 'receipt-3' },
      body: { action: 'reject' },
      socketService: { emitToChannel: jest.fn() }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res, () => {});

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );

    // Booking should be cancelled with failed payment
    const cancelBooking = executedSQLs.find(
      (e) => e.sql.includes('UPDATE bookings') && e.sql.includes("payment_status = 'failed'") && e.sql.includes("status = 'cancelled'")
    );
    expect(cancelBooking).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 7: Socket emission on bank transfer receipt creation
// ---------------------------------------------------------------------------

describe('Bank transfer flow - socket events', () => {
  afterEach(() => {
    pool.connect = originalConnect;
    pool.query = originalPoolQuery;
  });

  test('emits pending-transfer:new when bank_transfer booking is created with receipt', async () => {
    const handler = findHandler('post', '/');

    const mockClient = {
      query: jest.fn(async (sql, params) => {
        if (typeof sql !== 'string') sql = sql?.text ?? '';
        const n = sql.trim();

        if (n.startsWith('BEGIN') || n.startsWith('COMMIT') || n.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        if (n.includes('preferred_currency') || n.includes('preferred_wallet_currency')) {
          return { rows: [{ preferred_currency: 'EUR', preferred_wallet_currency: 'EUR' }] };
        }

        if (n.includes('FROM services') && n.includes('WHERE')) {
          return {
            rows: [{
              id: 'svc-1', name: 'Kitesurf Lesson', price: '80', currency: 'EUR',
              category: 'lesson', lesson_category_tag: null, discipline_tag: null,
              level_tag: null, max_participants: null, duration: 1
            }]
          };
        }

        if (n.includes('instructor_skills') || n.includes('instructor_disciplines')) {
          return { rows: [] };
        }

        if (n.includes('COUNT(*)') && n.includes('booking_count')) {
          return { rows: [{ booking_count: '0' }] };
        }

        if (n.includes('FROM bookings') && (n.includes('status NOT IN') || n.includes("status != 'cancelled'"))) {
          return { rows: [] };
        }

        if (n.includes('wallet_balances') && n.includes('FOR UPDATE')) {
          return { rows: [{ id: 'bal-1', available_amount: 0, pending_amount: 0, non_withdrawable_amount: 0, total_credits: 0, total_debits: 0, currency: 'EUR' }] };
        }

        if (n.startsWith('INSERT INTO bookings')) {
          return {
            rows: [{
              id: 'bk-bt-1', date: '2026-04-01', start_hour: 10, duration: 1,
              student_user_id: 'student-1', instructor_user_id: 'instr-1',
              customer_user_id: 'student-1', status: 'confirmed',
              payment_status: 'waiting_payment', amount: 80, final_amount: 80,
              group_size: 1, service_id: 'svc-1', customer_package_id: null
            }]
          };
        }

        if (n.includes('INSERT INTO bank_transfer_receipts')) {
          return { rows: [] };
        }

        if (n.includes('INSERT INTO wallet_transactions')) {
          return { rows: [{ id: 'wtx-1' }] };
        }
        if (n.includes('UPDATE wallet_balances')) {
          return { rows: [{ id: 'bal-1' }] };
        }
        if (n.includes('wallet_audit_logs')) {
          return { rows: [] };
        }

        if (n.startsWith('SELECT') && n.includes('json_agg')) {
          return {
            rows: [{
              id: 'bk-bt-1', status: 'confirmed', payment_status: 'waiting_payment',
              amount: 80, final_amount: 80, participants: []
            }]
          };
        }

        return { rows: [] };
      }),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);
    pool.query = jest.fn().mockResolvedValue({ rows: [] });

    const emitMock = jest.fn();
    const req = {
      user: { id: 'student-1', role: 'student', email: 'student@test.com' },
      query: {},
      body: {
        date: '2026-04-01',
        start_hour: 10,
        duration: 1,
        student_user_id: 'student-1',
        instructor_user_id: 'instr-1',
        service_id: 'svc-1',
        status: 'pending',
        payment_method: 'bank_transfer',
        bank_account_id: 'ba-1',
        receiptUrl: 'https://example.com/receipt.jpg',
        currency: 'EUR'
      },
      socketService: { emitToChannel: emitMock }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = { status: statusMock, json: jsonMock };

    await handler(req, res, () => {});

    expect(statusMock).toHaveBeenCalledWith(201);

    // Verify the pending-transfer:new socket event was emitted
    const pendingTransferCall = emitMock.mock.calls.find(
      (call) => call[0] === 'dashboard' && call[1] === 'pending-transfer:new'
    );
    expect(pendingTransferCall).toBeDefined();
    expect(pendingTransferCall[2]).toEqual(
      expect.objectContaining({ type: 'booking' })
    );
  });
});
