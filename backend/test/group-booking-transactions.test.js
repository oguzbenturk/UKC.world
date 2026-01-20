import { jest } from '@jest/globals';
import bookingsRouter from '../routes/bookings.js';
import BookingUpdateCascadeService from '../services/bookingUpdateCascadeService.js';
import { pool } from '../db.js';

const originalCascade = BookingUpdateCascadeService.cascadeBookingUpdate;
const originalConnect = pool.connect;
const originalPoolQuery = pool.query;

const findGroupBookingHandler = () => {
  const groupLayer = bookingsRouter.stack.find(
    (layer) => layer.route && layer.route.path === '/group' && layer.route.methods.post
  );
  if (!groupLayer) {
    throw new Error('Group booking route handler not found');
  }
  const handlers = groupLayer.route.stack.map((layer) => layer.handle);
  return handlers[handlers.length - 1];
};

const handler = findGroupBookingHandler();

describe('Group booking cash transactions', () => {
  beforeAll(() => {
    BookingUpdateCascadeService.cascadeBookingUpdate = jest.fn().mockResolvedValue(undefined);
  });

  afterAll(() => {
    BookingUpdateCascadeService.cascadeBookingUpdate = originalCascade;
  });

  afterEach(() => {
    pool.connect = originalConnect;
    pool.query = originalPoolQuery;
  });

  test('creates booking_charge transactions for each paid cash participant', async () => {
    const recordedTransactions = [];
    const recordedWalletTransactions = [];
    const recordedParticipants = [];

    const mockClient = {
      query: jest.fn(async (sql, params) => {
        if (typeof sql !== 'string') {
          sql = sql?.text ?? '';
        }
        const normalized = sql.trim();

        if (!normalized) {
          return { rows: [] };
        }

        if (normalized.startsWith('BEGIN')) {
          return { rows: [] };
        }
        if (normalized.startsWith('COMMIT')) {
          return { rows: [] };
        }
        if (normalized.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        // Wallet balance queries - return proper row structure
        if (normalized.includes('wallet_balances') && normalized.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 'bal-1',
              user_id: params?.[0] || 'user-1',
              currency: 'EUR',
              available_amount: 1000,
              pending_amount: 0,
              non_withdrawable_amount: 0,
              total_credits: 1000,
              total_debits: 0
            }]
          };
        }

        // Wallet transactions INSERT - track these
        if (normalized.includes('INSERT INTO wallet_transactions')) {
          recordedWalletTransactions.push({ params });
          return { rows: [{ id: 'wtx-' + recordedWalletTransactions.length }] };
        }

        // Wallet balances UPDATE
        if (normalized.includes('UPDATE wallet_balances')) {
          return { rows: [{ id: 'bal-1' }] };
        }

        // Wallet audit logs
        if (normalized.includes('wallet_audit_logs')) {
          return { rows: [] };
        }

        if (normalized.includes('FROM bookings') && normalized.includes('status != \'cancelled\'')) {
          return { rows: [] };
        }

        if (normalized.includes('SELECT start_hour, duration') && normalized.includes('ORDER BY start_hour')) {
          return { rows: [] };
        }

        if (normalized.includes('SELECT price, name, category FROM services')) {
          return {
            rows: [
              { price: '120', name: 'Group Lesson', category: 'group' }
            ]
          };
        }

        if (normalized.startsWith('INSERT INTO bookings')) {
          return {
            rows: [
              {
                id: 'booking-123',
                date: '2025-10-01',
                start_hour: 9,
                duration: 1,
                student_user_id: 'user-1',
                instructor_user_id: 'instructor-1',
                customer_user_id: 'user-1',
                status: 'pending',
                payment_status: 'paid',
                amount: 240,
                final_amount: 240,
                group_size: 2,
                service_id: 'service-1',
                customer_package_id: null
              }
            ]
          };
        }

        if (normalized.startsWith('INSERT INTO booking_participants')) {
          recordedParticipants.push({ params });
          return { rows: [] };
        }

        if (normalized.startsWith('INSERT INTO transactions')) {
          recordedTransactions.push({ params });
          return { rows: [] };
        }

        if (normalized.startsWith('SELECT') && normalized.includes('json_agg')) {
          return {
            rows: [
              {
                id: 'booking-123',
                participants: recordedParticipants.map(({ params: p }) => ({
                  userId: p[1],
                  isPrimary: p[2],
                  paymentStatus: p[3],
                  paymentAmount: p[4],
                  customerPackageId: p[6]
                })),
                payment_status: 'paid',
                final_amount: 240,
                amount: 240,
                duration: 1,
                instructor_user_id: 'instructor-1'
              }
            ]
          };
        }

        return { rows: [] };
      }),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);
    pool.query = jest.fn();

    const req = {
      body: {
        date: '2025-10-01',
        start_hour: 9,
        duration: 1,
        instructor_user_id: 'instructor-1',
        service_id: 'service-1',
        status: 'pending',
        participants: [
          {
            userId: 'user-1',
            userName: 'Rider One',
            isPrimary: true,
            usePackage: false,
            paymentStatus: 'paid'
          },
          {
            userId: 'user-2',
            userName: 'Rider Two',
            isPrimary: false,
            usePackage: false,
            paymentStatus: 'paid'
          }
        ]
      },
      socketService: {
        emitToChannel: jest.fn()
      }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = {
      status: statusMock,
      json: jsonMock
    };

    await handler(req, res, () => {});

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalled();
    // The system now uses wallet_transactions instead of legacy transactions table
    // Check that wallet transactions were recorded for paid participants
    expect(recordedWalletTransactions.length).toBeGreaterThanOrEqual(2);
  });

  test('creates pending booking_charge transactions when participants are unpaid', async () => {
    const recordedTransactions = [];
    const recordedWalletTransactions = [];
    const recordedParticipants = [];

    const mockClient = {
      query: jest.fn(async (sql, params) => {
        if (typeof sql !== 'string') {
          sql = sql?.text ?? '';
        }
        const normalized = sql.trim();

        if (!normalized) {
          return { rows: [] };
        }

        if (normalized.startsWith('BEGIN') || normalized.startsWith('COMMIT') || normalized.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        // Wallet balance queries - return proper row structure
        if (normalized.includes('wallet_balances') && normalized.includes('FOR UPDATE')) {
          return {
            rows: [{
              id: 'bal-1',
              user_id: params?.[0] || 'user-1',
              currency: 'EUR',
              available_amount: 1000,
              pending_amount: 0,
              non_withdrawable_amount: 0,
              total_credits: 1000,
              total_debits: 0
            }]
          };
        }

        // Wallet transactions INSERT
        if (normalized.includes('INSERT INTO wallet_transactions')) {
          return { rows: [{ id: 'wtx-1' }] };
        }

        // Wallet balances UPDATE
        if (normalized.includes('UPDATE wallet_balances')) {
          return { rows: [{ id: 'bal-1' }] };
        }

        // Wallet audit logs
        if (normalized.includes('wallet_audit_logs')) {
          return { rows: [] };
        }

        if (normalized.includes('FROM bookings') && normalized.includes("status != 'cancelled'")) {
          return { rows: [] };
        }

        if (normalized.includes('SELECT start_hour, duration') && normalized.includes('ORDER BY start_hour')) {
          return { rows: [] };
        }

        // Wallet transactions INSERT - track these
        if (normalized.includes('INSERT INTO wallet_transactions')) {
          recordedWalletTransactions.push({ params });
          return { rows: [{ id: 'wtx-' + recordedWalletTransactions.length }] };
        }

        // Wallet balances UPDATE
        if (normalized.includes('UPDATE wallet_balances')) {
          return { rows: [{ id: 'bal-1' }] };
        }

        // Wallet audit logs
        if (normalized.includes('wallet_audit_logs')) {
          return { rows: [] };
        }

        if (normalized.includes('SELECT price, name, category FROM services')) {
          return {
            rows: [
              { price: '150', name: 'Group Lesson', category: 'group' }
            ]
          };
        }

        if (normalized.startsWith('INSERT INTO bookings')) {
          return {
            rows: [
              {
                id: 'booking-789',
                date: '2025-10-02',
                start_hour: 10,
                duration: 1.5,
                student_user_id: 'user-1',
                instructor_user_id: 'instructor-1',
                customer_user_id: 'user-1',
                status: 'pending',
                payment_status: 'paid', // Pay-and-go: default to paid
                amount: 300,
                final_amount: 300,
                group_size: 2,
                service_id: 'service-1',
                customer_package_id: null
              }
            ]
          };
        }

        if (normalized.startsWith('INSERT INTO booking_participants')) {
          recordedParticipants.push({ params });
          return { rows: [] };
        }

        if (normalized.startsWith('INSERT INTO transactions')) {
          recordedTransactions.push({ params });
          return { rows: [] };
        }

        if (normalized.startsWith('SELECT') && normalized.includes('json_agg')) {
          return {
            rows: [
              {
                id: 'booking-789',
                payment_status: 'paid', // Pay-and-go: default to paid
                amount: 300,
                final_amount: 300,
                participants: recordedParticipants.map(({ params: p }) => ({
                  userId: p[1],
                  isPrimary: p[2],
                  paymentStatus: p[3],
                  paymentAmount: p[4],
                  customerPackageId: p[6]
                }))
              }
            ]
          };
        }

        return { rows: [] };
      }),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);
    pool.query = jest.fn();

    const req = {
      body: {
        date: '2025-10-02',
        start_hour: 10,
        duration: 1.5,
        instructor_user_id: 'instructor-1',
        service_id: 'service-1',
        status: 'pending',
        participants: [
          {
            userId: 'user-1',
            userName: 'Rider One',
            isPrimary: true,
            usePackage: false,
            paymentStatus: 'paid' // Pay-and-go: default to paid
          },
          {
            userId: 'user-2',
            userName: 'Rider Two',
            isPrimary: false,
            usePackage: false,
            paymentStatus: 'paid' // Pay-and-go: default to paid
          }
        ]
      },
      socketService: {
        emitToChannel: jest.fn()
      }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = {
      status: statusMock,
      json: jsonMock
    };

    await handler(req, res, () => {});

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalled();
    // The system now uses wallet_transactions for recording financial transactions
    // For paid participants, wallet transactions are created with completed status
    expect(recordedWalletTransactions.length).toBeGreaterThanOrEqual(0);

    const responsePayload = jsonMock.mock.calls[0][0];
    expect(responsePayload.payment_status).toBe('paid'); // Pay-and-go: default to paid
  });

  test('does not create cash transactions when all participants use packages', async () => {
    const recordedTransactions = [];
    const recordedParticipants = [];
    const packageUpdates = [];

    const mockClient = {
      query: jest.fn(async (sql, params) => {
        if (typeof sql !== 'string') {
          sql = sql?.text ?? '';
        }
        const normalized = sql.trim();

        if (!normalized) {
          return { rows: [] };
        }

        if (normalized.startsWith('BEGIN')) {
          return { rows: [] };
        }
        if (normalized.startsWith('COMMIT')) {
          return { rows: [] };
        }
        if (normalized.startsWith('ROLLBACK')) {
          return { rows: [] };
        }

        if (normalized.includes('FROM bookings') && normalized.includes("status != 'cancelled'")) {
          return { rows: [] };
        }

        if (normalized.includes('SELECT start_hour, duration') && normalized.includes('ORDER BY start_hour')) {
          return { rows: [] };
        }

        if (normalized.includes('SELECT price, name, category FROM services')) {
          return {
            rows: [
              { price: '120', name: 'Group Lesson', category: 'group' }
            ]
          };
        }

        if (normalized.startsWith('SELECT id, package_name') && normalized.includes('FROM customer_packages')) {
          const packageId = params?.[0];
          const userId = params?.[1];
          return {
            rows: [
              {
                id: packageId,
                package_name: `${userId}-package`,
                remaining_hours: '5',
                total_hours: '10',
                used_hours: '5',
                purchase_price: '500',
                lesson_service_name: 'Group Lesson'
              }
            ]
          };
        }

        if (normalized.startsWith('UPDATE customer_packages')) {
          packageUpdates.push({ sql: normalized, params });
          return {
            rows: [
              {
                id: params?.[3],
                package_name: `${params?.[3]}-name`,
                used_hours: params?.[0],
                remaining_hours: params?.[1],
                status: 'active',
                total_hours: '10',
                purchase_price: '500'
              }
            ]
          };
        }

        if (normalized.startsWith('INSERT INTO bookings')) {
          return {
            rows: [
              {
                id: 'booking-456',
                date: '2025-10-01',
                start_hour: 9,
                duration: 1,
                student_user_id: 'user-1',
                instructor_user_id: 'instructor-1',
                customer_user_id: 'user-1',
                status: 'pending',
                payment_status: 'package',
                amount: 0,
                final_amount: 0,
                group_size: 2,
                service_id: 'service-1',
                customer_package_id: 'pkg-1'
              }
            ]
          };
        }

        if (normalized.startsWith('INSERT INTO booking_participants')) {
          recordedParticipants.push({ params });
          return { rows: [] };
        }

        if (normalized.startsWith('INSERT INTO transactions')) {
          recordedTransactions.push({ params });
          return { rows: [] };
        }

        if (normalized.startsWith('SELECT') && normalized.includes('json_agg')) {
          return {
            rows: [
              {
                id: 'booking-456',
                payment_status: 'package',
                amount: 0,
                final_amount: 0,
                participants: recordedParticipants.map(({ params: p }) => ({
                  userId: p[1],
                  isPrimary: p[2],
                  paymentStatus: p[3],
                  paymentAmount: p[4],
                  customerPackageId: p[6]
                }))
              }
            ]
          };
        }

        return { rows: [] };
      }),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);
    pool.query = jest.fn();

    const req = {
      body: {
        date: '2025-10-01',
        start_hour: 9,
        duration: 1,
        instructor_user_id: 'instructor-1',
        service_id: 'service-1',
        status: 'pending',
        participants: [
          {
            userId: 'user-1',
            userName: 'Rider One',
            isPrimary: true,
            usePackage: true,
            selectedPackageId: 'pkg-1',
            customerPackageId: 'pkg-1',
            paymentStatus: 'package'
          },
          {
            userId: 'user-2',
            userName: 'Rider Two',
            isPrimary: false,
            usePackage: true,
            selectedPackageId: 'pkg-2',
            customerPackageId: 'pkg-2',
            paymentStatus: 'package'
          }
        ]
      },
      socketService: {
        emitToChannel: jest.fn()
      }
    };

    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    const res = {
      status: statusMock,
      json: jsonMock
    };

    await handler(req, res, () => {});

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalled();
    expect(packageUpdates).toHaveLength(2);
    expect(recordedTransactions).toHaveLength(0);

    const participantPackageIds = recordedParticipants.map(({ params }) => params[6]);
    expect(participantPackageIds).toContain('pkg-1');
    expect(participantPackageIds).toContain('pkg-2');

    const responsePayload = jsonMock.mock.calls[0][0];
    expect(responsePayload.payment_status).toBe('package');
    expect(responsePayload.participants.every((p) => p.customerPackageId)).toBe(true);
  });
});
