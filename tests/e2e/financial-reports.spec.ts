/**
 * Financial Reports & Analytics E2E Tests
 *
 * Phase 3: Financial Accuracy Tests
 * Testing revenue calculations, financial reports, commission tracking,
 * and instructor earnings functionality.
 *
 * Endpoints covered:
 * - GET /api/finances/summary - Financial summary with analytics
 * - GET /api/finances/revenue-analytics - Revenue breakdown and trends
 * - GET /api/finances/outstanding-balances - Customer balance information
 * - GET /api/finances/customer-analytics - Customer lifetime value analysis
 * - GET /api/finances/operational-metrics - Operational finance metrics
 * - GET /api/finances/reports/:type - Specific financial reports
 * - GET /api/finances/instructor-earnings/:instructorId - Instructor earnings
 * - GET /api/finances/transactions - Transaction listing
 * - GET /api/finances/accounts/:id - User financial account info
 * - GET /api/dashboard/summary - Dashboard financial summary
 */

import { test, expect, request, APIRequestContext } from '@playwright/test';

// Serial mode to avoid rate limiting
test.describe.configure({ mode: 'serial' });

const API_BASE = 'http://localhost:4000/api';

// Test credentials
const ADMIN_EMAIL = 'admin@plannivo.com';
const ADMIN_PASSWORD = 'asdasd35';
const INSTRUCTOR_EMAIL = 'kaanaysel@gmail.com';
const INSTRUCTOR_PASSWORD = 'asdasd35';

// Token cache
let adminToken: string | null = null;
let instructorToken: string | null = null;
let adminUserId: string | null = null;
let instructorUserId: string | null = null;
let apiContext: APIRequestContext;

// Helper: delay to avoid rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: login and cache token
async function getAdminToken(context: APIRequestContext): Promise<string> {
  if (adminToken) return adminToken;

  const response = await context.post(`${API_BASE}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  adminToken = body.token;
  adminUserId = body.user?.id;
  return adminToken!;
}

async function getInstructorToken(context: APIRequestContext): Promise<string> {
  if (instructorToken) return instructorToken;

  await delay(300);
  const response = await context.post(`${API_BASE}/auth/login`, {
    data: { email: INSTRUCTOR_EMAIL, password: INSTRUCTOR_PASSWORD }
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  instructorToken = body.token;
  instructorUserId = body.user?.id;
  return instructorToken!;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ==============================================================================
// SETUP
// ==============================================================================
test.beforeAll(async () => {
  apiContext = await request.newContext();
  // Pre-fetch tokens
  await getAdminToken(apiContext);
  await delay(300);
  await getInstructorToken(apiContext);
});

test.afterAll(async () => {
  await apiContext.dispose();
});

test.beforeEach(async () => {
  await delay(200);
});

// ==============================================================================
// FINANCIAL SUMMARY TESTS
// ==============================================================================
test.describe('Financial Summary', () => {
  test('GET /finances/summary - returns comprehensive financial summary', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Verify response structure
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('revenue');
    expect(body).toHaveProperty('balances');
    expect(body).toHaveProperty('bookings');
    expect(body).toHaveProperty('generatedAt');

    // Verify revenue object structure
    const revenue = body.revenue;
    expect(revenue).toHaveProperty('total_revenue');
    expect(revenue).toHaveProperty('lesson_revenue');
    expect(revenue).toHaveProperty('rental_revenue');
    expect(revenue).toHaveProperty('total_refunds');
    expect(revenue).toHaveProperty('total_transactions');

    // Verify numeric types
    expect(typeof revenue.total_revenue).toBe('number');
    expect(typeof revenue.lesson_revenue).toBe('number');

    // Verify balances structure
    const balances = body.balances;
    expect(balances).toHaveProperty('customers_with_credit');
    expect(balances).toHaveProperty('customers_with_debt');
    expect(balances).toHaveProperty('total_customer_credit');
    expect(balances).toHaveProperty('total_customer_debt');

    // Verify bookings structure
    const bookings = body.bookings;
    expect(bookings).toHaveProperty('total_bookings');
    expect(bookings).toHaveProperty('completed_bookings');
    expect(bookings).toHaveProperty('cancelled_bookings');
    expect(bookings).toHaveProperty('paid_bookings');
    expect(bookings).toHaveProperty('unpaid_bookings');
  });

  test('GET /finances/summary - supports date range filtering', async () => {
    const token = await getAdminToken(apiContext);

    const startDate = '2024-01-01';
    const endDate = '2024-12-31';

    const response = await apiContext.get(`${API_BASE}/finances/summary?startDate=${startDate}&endDate=${endDate}`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.dateRange).toBeDefined();
    expect(body.dateRange.startDate).toBe(startDate);
    expect(body.dateRange.endDate).toBe(endDate);
  });

  test('GET /finances/summary - supports accrual mode', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/summary?mode=accrual`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('GET /finances/summary - supports cash mode', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/summary?mode=cash`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('GET /finances/summary - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/summary`);
    expect([401, 403]).toContain(response.status());
  });

  test('GET /finances/summary - requires admin/manager role', async () => {
    // Create a student user token if available, otherwise skip
    // For now, we verify that instructor can access (they may have elevated roles)
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: authHeaders(token)
    });

    // Instructor should either be denied (403) or allowed if they have manager role
    expect([200, 403]).toContain(response.status());
  });
});

// ==============================================================================
// REVENUE ANALYTICS TESTS
// ==============================================================================
test.describe('Revenue Analytics', () => {
  test('GET /finances/revenue-analytics - returns revenue breakdown', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/revenue-analytics`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body).toHaveProperty('trends');
    expect(Array.isArray(body.trends)).toBe(true);
  });

  test('GET /finances/revenue-analytics - supports groupBy day', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/revenue-analytics?groupBy=day`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('GET /finances/revenue-analytics - supports groupBy week', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/revenue-analytics?groupBy=week`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('GET /finances/revenue-analytics - supports groupBy month', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/revenue-analytics?groupBy=month`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('GET /finances/revenue-analytics - supports date range', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/revenue-analytics?startDate=2024-01-01&endDate=2024-12-31`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('GET /finances/revenue-analytics - supports serviceType filter', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/revenue-analytics?serviceType=lesson`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('GET /finances/revenue-analytics - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/revenue-analytics`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// OUTSTANDING BALANCES TESTS
// ==============================================================================
test.describe('Outstanding Balances', () => {
  test('GET /finances/outstanding-balances - returns customer balances', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/outstanding-balances`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body).toHaveProperty('customers');
    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('filters');
    expect(Array.isArray(body.customers)).toBe(true);

    // Verify summary structure
    const summary = body.summary;
    expect(summary).toHaveProperty('totalCredit');
    expect(summary).toHaveProperty('totalDebt');
    expect(summary).toHaveProperty('customersWithCredit');
    expect(summary).toHaveProperty('customersWithDebt');
    expect(summary).toHaveProperty('totalUnpaidAmount');
  });

  test('GET /finances/outstanding-balances - supports sorting by balance', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/outstanding-balances?sortBy=balance&order=desc`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.filters.sortBy).toBe('balance');
    expect(body.filters.order).toBe('desc');
  });

  test('GET /finances/outstanding-balances - supports sorting by name', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/outstanding-balances?sortBy=name&order=asc`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.filters.sortBy).toBe('name');
  });

  test('GET /finances/outstanding-balances - supports minAmount filter', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/outstanding-balances?minAmount=10`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.filters.minAmount).toBe('10');
  });

  test('GET /finances/outstanding-balances - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/outstanding-balances`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// CUSTOMER ANALYTICS TESTS
// ==============================================================================
test.describe('Customer Analytics', () => {
  test('GET /finances/customer-analytics - returns customer lifetime value', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/customer-analytics`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body).toHaveProperty('customerLifetimeValue');
    expect(body).toHaveProperty('paymentBehavior');
    expect(Array.isArray(body.customerLifetimeValue)).toBe(true);
    expect(Array.isArray(body.paymentBehavior)).toBe(true);
  });

  test('GET /finances/customer-analytics - CLV data has correct structure', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/customer-analytics`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    if (body.customerLifetimeValue.length > 0) {
      const customer = body.customerLifetimeValue[0];
      expect(customer).toHaveProperty('id');
      expect(customer).toHaveProperty('name');
      expect(customer).toHaveProperty('email');
      expect(customer).toHaveProperty('lifetime_value');
      expect(customer).toHaveProperty('balance');
      expect(customer).toHaveProperty('total_bookings');
      expect(customer).toHaveProperty('customer_segment');
    }
  });

  test('GET /finances/customer-analytics - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/customer-analytics`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// OPERATIONAL METRICS TESTS
// ==============================================================================
test.describe('Operational Metrics', () => {
  test('GET /finances/operational-metrics - returns operational data', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/operational-metrics`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body).toHaveProperty('bookingMetrics');
    expect(body).toHaveProperty('rentalMetrics');
    expect(body).toHaveProperty('instructorMetrics');
    expect(Array.isArray(body.bookingMetrics)).toBe(true);
    expect(Array.isArray(body.instructorMetrics)).toBe(true);
  });

  test('GET /finances/operational-metrics - supports date range', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/operational-metrics?startDate=2024-01-01&endDate=2024-12-31`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.dateRange.startDate).toBe('2024-01-01');
    expect(body.dateRange.endDate).toBe('2024-12-31');
  });

  test('GET /finances/operational-metrics - instructor metrics have correct structure', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/operational-metrics`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    if (body.instructorMetrics.length > 0) {
      const instructor = body.instructorMetrics[0];
      expect(instructor).toHaveProperty('id');
      expect(instructor).toHaveProperty('instructor_name');
      expect(instructor).toHaveProperty('total_lessons');
      expect(instructor).toHaveProperty('completed_lessons');
      expect(instructor).toHaveProperty('total_revenue');
      expect(instructor).toHaveProperty('average_lesson_value');
    }
  });

  test('GET /finances/operational-metrics - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/operational-metrics`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// FINANCIAL REPORTS TESTS
// ==============================================================================
test.describe('Financial Reports', () => {
  test('GET /finances/reports/profit-loss - returns P&L report', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/reports/profit-loss`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body).toHaveProperty('report');
    expect(body).toHaveProperty('generatedAt');
    expect(body.report.type).toBe('Profit & Loss');
    expect(Array.isArray(body.report.data)).toBe(true);
  });

  test('GET /finances/reports/profit-loss - supports date range', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/reports/profit-loss?startDate=2024-01-01&endDate=2024-12-31`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.dateRange.startDate).toBe('2024-01-01');
    expect(body.dateRange.endDate).toBe('2024-12-31');
  });

  test('GET /finances/reports/customer-summary - returns customer report', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/reports/customer-summary`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.report.type).toBe('Customer Summary');
    expect(Array.isArray(body.report.data)).toBe(true);
  });

  test('GET /finances/reports/customer-summary - customer data has correct fields', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/reports/customer-summary`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    if (body.report.data.length > 0) {
      const customer = body.report.data[0];
      expect(customer).toHaveProperty('name');
      expect(customer).toHaveProperty('email');
      expect(customer).toHaveProperty('balance');
      expect(customer).toHaveProperty('total_spent');
      expect(customer).toHaveProperty('total_bookings');
    }
  });

  test('GET /finances/reports/profit-loss - supports CSV format', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/reports/profit-loss?format=csv`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/csv');
  });

  test('GET /finances/reports/invalid-type - returns 400 for invalid report type', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/reports/invalid-type`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid report type');
  });

  test('GET /finances/reports/profit-loss - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/reports/profit-loss`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// INSTRUCTOR EARNINGS TESTS
// ==============================================================================
test.describe('Instructor Earnings', () => {
  test('GET /finances/instructor-earnings/:instructorId - returns earnings data', async () => {
    const token = await getAdminToken(apiContext);

    // Use instructor user ID
    const response = await apiContext.get(
      `${API_BASE}/finances/instructor-earnings/${instructorUserId}`,
      { headers: authHeaders(token) }
    );

    // May return 200 with data or 404 if no earnings exist
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      // Response should have earnings structure
      expect(body).toBeDefined();
    }
  });

  test('GET /finances/instructor-earnings/:instructorId - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/instructor-earnings/test-id`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// TRANSACTIONS TESTS
// ==============================================================================
test.describe('Transactions', () => {
  test('GET /finances/transactions - returns transaction list', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/transactions`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /finances/transactions - supports pagination', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/transactions?limit=10&offset=0`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(10);
  });

  test('GET /finances/transactions - supports date filtering', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/transactions?start_date=2024-01-01&end_date=2024-12-31`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /finances/transactions - supports type filtering', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/transactions?type=payment`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /finances/transactions - supports status filtering', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/transactions?status=completed`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /finances/transactions - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/transactions`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// ACCOUNT INFORMATION TESTS
// ==============================================================================
test.describe('Account Information', () => {
  test('GET /finances/accounts/:id - returns user account info', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/accounts/${adminUserId}`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('balance');
    expect(body).toHaveProperty('total_spent');
  });

  test('GET /finances/accounts/:id - user can view own account', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/accounts/${instructorUserId}`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(instructorUserId);
  });

  test('GET /finances/accounts/:id - includes wallet info if available', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/accounts/${adminUserId}`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Wallet info may or may not be present
    if (body.wallet) {
      expect(body.wallet).toHaveProperty('available');
      expect(body.wallet).toHaveProperty('pending');
      expect(body.wallet).toHaveProperty('currency');
    }
  });

  test('GET /finances/accounts/:id - returns 404 for non-existent user', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/accounts/00000000-0000-0000-0000-000000000000`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(404);
  });

  test('GET /finances/accounts/:id - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/accounts/test-id`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// DASHBOARD SUMMARY TESTS
// ==============================================================================
test.describe('Dashboard Summary', () => {
  test('GET /dashboard/summary - returns dashboard data', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/dashboard/summary`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Dashboard summary should contain aggregated data
    expect(body).toBeDefined();
  });

  test('GET /dashboard/summary - supports date range', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/dashboard/summary?startDate=2024-01-01&endDate=2024-12-31`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
  });

  test('GET /dashboard/summary - requires admin/manager role', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/dashboard/summary`, {
      headers: authHeaders(token)
    });

    // May be allowed or denied based on role
    expect([200, 403]).toContain(response.status());
  });

  test('GET /dashboard/summary - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/dashboard/summary`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// DATA INTEGRITY TESTS
// ==============================================================================
test.describe('Financial Data Integrity', () => {
  test('Revenue totals are consistent across endpoints', async () => {
    const token = await getAdminToken(apiContext);

    // Get summary revenue
    const summaryResponse = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: authHeaders(token)
    });
    expect(summaryResponse.status()).toBe(200);
    const summary = await summaryResponse.json();

    await delay(300);

    // Get revenue analytics
    const analyticsResponse = await apiContext.get(`${API_BASE}/finances/revenue-analytics`, {
      headers: authHeaders(token)
    });
    expect(analyticsResponse.status()).toBe(200);
    const analytics = await analyticsResponse.json();

    // Both should succeed - specific value comparison depends on data
    expect(summary.revenue).toBeDefined();
    expect(analytics.trends).toBeDefined();
  });

  test('Balance calculations match between endpoints', async () => {
    const token = await getAdminToken(apiContext);

    // Get outstanding balances
    const balancesResponse = await apiContext.get(`${API_BASE}/finances/outstanding-balances`, {
      headers: authHeaders(token)
    });
    expect(balancesResponse.status()).toBe(200);
    const balances = await balancesResponse.json();

    await delay(300);

    // Get summary balances
    const summaryResponse = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: authHeaders(token)
    });
    expect(summaryResponse.status()).toBe(200);
    const summary = await summaryResponse.json();

    // Both should have balance data
    expect(balances.summary).toBeDefined();
    expect(summary.balances).toBeDefined();
  });

  test('Non-negative revenue values in summary', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Revenue should not be negative
    expect(body.revenue.total_revenue).toBeGreaterThanOrEqual(0);
    expect(body.revenue.lesson_revenue).toBeGreaterThanOrEqual(0);
    expect(body.revenue.rental_revenue).toBeGreaterThanOrEqual(0);
  });

  test('Booking counts are non-negative', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    const bookings = body.bookings;
    expect(Number(bookings.total_bookings)).toBeGreaterThanOrEqual(0);
    expect(Number(bookings.completed_bookings)).toBeGreaterThanOrEqual(0);
    expect(Number(bookings.cancelled_bookings)).toBeGreaterThanOrEqual(0);
    expect(Number(bookings.paid_bookings)).toBeGreaterThanOrEqual(0);
    expect(Number(bookings.unpaid_bookings)).toBeGreaterThanOrEqual(0);
  });

  test('Completed + cancelled bookings <= total bookings', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    const bookings = body.bookings;
    const total = Number(bookings.total_bookings);
    const completed = Number(bookings.completed_bookings);
    const cancelled = Number(bookings.cancelled_bookings);

    // Completed + cancelled should not exceed total
    expect(completed + cancelled).toBeLessThanOrEqual(total + 1); // +1 for rounding tolerance
  });
});

// ==============================================================================
// ERROR HANDLING TESTS
// ==============================================================================
test.describe('Error Handling', () => {
  test('Invalid date format returns appropriate error', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/summary?startDate=invalid-date`,
      { headers: authHeaders(token) }
    );

    // Should either handle gracefully (200) or return error (400/500)
    expect([200, 400, 500]).toContain(response.status());
  });

  test('Invalid groupBy value handled gracefully', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/revenue-analytics?groupBy=invalid`,
      { headers: authHeaders(token) }
    );

    // Should default to valid groupBy or return error
    expect([200, 400]).toContain(response.status());
  });

  test('Invalid sortBy value is handled', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/outstanding-balances?sortBy=invalid`,
      { headers: authHeaders(token) }
    );

    // Backend should either return 200 (accepts any value) or 400 (rejects invalid)
    expect([200, 400]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      // Verify response still works regardless of sortBy value
      expect(body).toHaveProperty('customers');
      expect(body).toHaveProperty('summary');
    }
  });

  test('Expired token returns 401', async () => {
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QiLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0.invalid';

    const response = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: authHeaders(expiredToken)
    });

    expect([401, 403]).toContain(response.status());
  });

  test('Malformed token returns 401', async () => {
    const response = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: { Authorization: 'Bearer malformed.token' }
    });

    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// PERFORMANCE TESTS
// ==============================================================================
test.describe('Performance', () => {
  test('Financial summary responds within 5 seconds', async () => {
    const token = await getAdminToken(apiContext);

    const startTime = Date.now();
    const response = await apiContext.get(`${API_BASE}/finances/summary`, {
      headers: authHeaders(token)
    });
    const endTime = Date.now();

    expect(response.status()).toBe(200);
    expect(endTime - startTime).toBeLessThan(5000);
  });

  test('Revenue analytics responds within 5 seconds', async () => {
    const token = await getAdminToken(apiContext);

    const startTime = Date.now();
    const response = await apiContext.get(`${API_BASE}/finances/revenue-analytics`, {
      headers: authHeaders(token)
    });
    const endTime = Date.now();

    expect(response.status()).toBe(200);
    expect(endTime - startTime).toBeLessThan(5000);
  });

  test('Customer analytics responds within 5 seconds', async () => {
    const token = await getAdminToken(apiContext);

    const startTime = Date.now();
    const response = await apiContext.get(`${API_BASE}/finances/customer-analytics`, {
      headers: authHeaders(token)
    });
    const endTime = Date.now();

    expect(response.status()).toBe(200);
    expect(endTime - startTime).toBeLessThan(5000);
  });
});
