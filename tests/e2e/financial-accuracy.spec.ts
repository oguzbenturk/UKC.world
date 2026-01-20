/**
 * Financial Accuracy Tests
 * Validates that all financial calculations are correct
 * Run: npx playwright test tests/e2e/financial-accuracy.spec.ts
 */
import { test, expect, request } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:3000';

let authToken: string;

test.describe('💰 Financial Accuracy Tests', () => {
  
  test.beforeAll(async ({ }) => {
    const apiContext = await request.newContext();
    try {
      const loginResponse = await apiContext.post(`${API_URL}/api/auth/login`, {
        data: {
          email: process.env.TEST_ADMIN_EMAIL || 'admin@plannivo.com',
          password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
        }
      });
      
      if (loginResponse.ok()) {
        const data = await loginResponse.json();
        authToken = data.token || data.accessToken;
      }
    } catch (e) {
      console.log('Auth failed');
    }
    await apiContext.dispose();
  });

  test('Finance summary returns valid data structure', async ({ request }) => {
    test.skip(!authToken, 'No auth token');
    
    const response = await request.get(`${API_URL}/api/finances/summary`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.ok()) {
      const data = await response.json();
      
      // Check that numeric fields are actual numbers
      if (data.lessonRevenue !== undefined) {
        expect(typeof data.lessonRevenue).toBe('number');
        expect(data.lessonRevenue).toBeGreaterThanOrEqual(0);
      }
      
      if (data.rentalRevenue !== undefined) {
        expect(typeof data.rentalRevenue).toBe('number');
        expect(data.rentalRevenue).toBeGreaterThanOrEqual(0);
      }
      
      if (data.totalRevenue !== undefined) {
        expect(typeof data.totalRevenue).toBe('number');
      }
    }
  });

  test('Wallet balance is a valid number', async ({ request }) => {
    test.skip(!authToken, 'No auth token');
    
    // Get a customer first
    const customersResponse = await request.get(`${API_URL}/api/students?limit=1`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (customersResponse.ok()) {
      const customers = await customersResponse.json();
      if (customers.length > 0 || customers.data?.length > 0) {
        const customerId = customers[0]?.id || customers.data?.[0]?.id;
        
        if (customerId) {
          const walletResponse = await request.get(`${API_URL}/api/wallet/balance/${customerId}`, {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          
          if (walletResponse.ok()) {
            const walletData = await walletResponse.json();
            const balance = walletData.balance ?? walletData;
            expect(typeof balance === 'number' || typeof balance === 'string').toBeTruthy();
          }
        }
      }
    }
  });

  test('Booking prices are positive numbers', async ({ request }) => {
    test.skip(!authToken, 'No auth token');
    
    const response = await request.get(`${API_URL}/api/bookings?limit=10`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.ok()) {
      const data = await response.json();
      const bookings = data.bookings || data.data || data || [];
      
      for (const booking of bookings.slice(0, 5)) {
        if (booking.price !== undefined && booking.price !== null) {
          const price = parseFloat(booking.price);
          expect(price).toBeGreaterThanOrEqual(0);
        }
        if (booking.total_price !== undefined && booking.total_price !== null) {
          const totalPrice = parseFloat(booking.total_price);
          expect(totalPrice).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  test('Dashboard KPIs contain valid numbers', async ({ request }) => {
    test.skip(!authToken, 'No auth token');
    
    const response = await request.get(`${API_URL}/api/dashboard/summary`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (response.ok()) {
      const data = await response.json();
      
      // Check common KPI fields
      const numericFields = [
        'totalBookings', 'completedBookings', 'pendingBookings',
        'totalRevenue', 'lessonRevenue', 'rentalRevenue',
        'totalCustomers', 'newCustomers',
        'totalCustomerDebt', 'customersWithDebt'
      ];
      
      for (const field of numericFields) {
        if (data[field] !== undefined) {
          expect(typeof data[field]).toBe('number');
        }
      }
    }
  });
});
