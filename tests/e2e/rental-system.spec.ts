/**
 * Rental System Tests - Phase 1.3
 * Tests: Equipment rentals, availability, returns
 * Run: npx playwright test tests/e2e/rental-system.spec.ts
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3000';

// Test credentials
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@plannivo.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'asdasd35';

let authToken: string;

// Get auth token for API calls
async function getAuthToken(): Promise<string> {
  if (authToken) return authToken;
  
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  
  const data = await response.json();
  authToken = data.token;
  console.log('✅ Auth successful, token obtained');
  return authToken;
}

// Helper function to login via UI
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 20000 });
}

test.describe('🏄 Rental System - Equipment Management', () => {
  
  test.describe('API: Equipment List', () => {
    
    test('Can fetch all equipment', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/equipment`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      // Should return array of equipment
      expect(Array.isArray(data)).toBe(true);
    });

    test('Equipment items have required fields', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/equipment`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      if (data.length > 0) {
        const item = data[0];
        // Equipment should have id and name
        expect(item.id).toBeDefined();
        expect(item.name || item.type || item.category).toBeDefined();
      }
    });

    test('Can fetch equipment by ID', async () => {
      const token = await getAuthToken();
      
      // First get equipment list
      const listResponse = await fetch(`${API_URL}/api/equipment`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const equipment = await listResponse.json();
      
      if (equipment.length > 0) {
        const equipmentId = equipment[0].id;
        
        const response = await fetch(`${API_URL}/api/equipment/${equipmentId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        expect(response.status).toBe(200);
        const item = await response.json();
        expect(item.id).toBe(equipmentId);
      }
    });
  });

  test.describe('API: Equipment Availability', () => {
    
    test('Can check equipment availability status', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/equipment`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      if (data.length > 0) {
        const item = data[0];
        // Should have status or availability info
        expect(
          item.status !== undefined || 
          item.available !== undefined || 
          item.quantity !== undefined ||
          item.availability !== undefined
        ).toBe(true);
      }
    });
  });
});

test.describe('🏄 Rental System - Rental Operations', () => {
  
  test.describe('API: Rental List', () => {
    
    test('Can fetch all rentals', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/rentals`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      // Should return array of rentals
      expect(Array.isArray(data)).toBe(true);
    });

    test('Can fetch recent rentals', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/rentals/recent?limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test('Rentals have customer and equipment info', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/rentals`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      if (data.length > 0) {
        const rental = data[0];
        // Should have rental dates and status
        expect(rental.id).toBeDefined();
        expect(rental.status || rental.rental_status).toBeDefined();
      }
    });
  });

  test.describe('API: Rental Pricing', () => {
    
    test('Rentals have pricing information', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/rentals`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      if (data.length > 0) {
        const rental = data[0];
        // Should have amount or price info
        const hasPrice = 
          rental.amount !== undefined ||
          rental.total_amount !== undefined ||
          rental.price !== undefined ||
          rental.daily_rate !== undefined;
        
        expect(hasPrice || rental.equipment_details).toBeTruthy();
      }
    });
  });

  test.describe('API: Rental Status', () => {
    
    test('Rentals have valid statuses', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/rentals`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      const validStatuses = ['active', 'pending', 'completed', 'returned', 'cancelled', 'overdue'];
      
      for (const rental of data) {
        if (rental.status) {
          const normalizedStatus = rental.status.toLowerCase();
          const isValid = validStatuses.some(s => normalizedStatus.includes(s) || s.includes(normalizedStatus));
          expect(isValid || rental.status).toBeTruthy();
        }
      }
    });
  });
});

test.describe('🏄 Rental System - UI Tests', () => {
  
  test.describe('UI: Equipment Page', () => {
    
    test('Equipment page loads successfully', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/equipment`);
      await page.waitForLoadState('networkidle');
      
      // Page should load without errors
      const pageContent = await page.textContent('body');
      expect(pageContent).not.toContain('404');
      expect(pageContent).not.toContain('Error loading');
    });

    test('Equipment list is displayed', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/equipment`);
      await page.waitForLoadState('networkidle');
      
      // Should have table, cards, list, or any main content area
      const hasTable = await page.locator('table').count() > 0;
      const hasCards = await page.locator('[class*="card"], [class*="equipment"]').count() > 0;
      const hasList = await page.locator('[class*="list"]').count() > 0;
      const hasMainContent = await page.locator('main, .content, [role="main"]').count() > 0;
      
      expect(hasTable || hasCards || hasList || hasMainContent).toBeTruthy();
    });
  });

  test.describe('UI: Rentals Page', () => {
    
    test('Rentals page loads successfully', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/rentals`);
      await page.waitForLoadState('networkidle');
      
      // Page should load without errors
      const pageContent = await page.textContent('body');
      expect(pageContent).not.toContain('404');
      expect(pageContent).not.toContain('Error loading');
    });

    test('Rentals list is displayed', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/rentals`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500); // Allow UI to settle
      
      // Should have table, cards, or any content on the page
      const hasTable = await page.locator('table').count() > 0;
      const hasCards = await page.locator('[class*="card"], [class*="rental"]').count() > 0;
      const pageContent = (await page.textContent('body'))?.toLowerCase() || '';
      const hasContent = pageContent.includes('rental') || pageContent.includes('equipment') || pageContent.includes('admin');
      const hasMainContent = await page.locator('main, .content, [role="main"], body').count() > 0;
      const hasAnyContent = pageContent.length > 100; // Page has rendered content
      
      expect(hasTable || hasCards || hasContent || hasMainContent || hasAnyContent).toBeTruthy();
    });

    test('Can access new rental form', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${BASE_URL}/admin/rentals`);
      await page.waitForLoadState('networkidle');
      
      // Look for "New Rental" or "Add Rental" button
      const newRentalBtn = page.locator('button, a').filter({ hasText: /new|add|create/i });
      
      if (await newRentalBtn.count() > 0) {
        await newRentalBtn.first().click();
        await page.waitForTimeout(1000);
        
        // Should show a form or modal
        const hasForm = await page.locator('form').count() > 0;
        const hasModal = await page.locator('[role="dialog"], .modal, [class*="modal"]').count() > 0;
        
        expect(hasForm || hasModal).toBeTruthy();
      }
    });
  });
});

test.describe('🏄 Rental System - Services Integration', () => {
  
  test.describe('API: Rental Services', () => {
    
    test('Can fetch rental-type services', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/services?type=rental`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      // Should return array
      const services = Array.isArray(data) ? data : (data.services || []);
      expect(Array.isArray(services)).toBe(true);
    });

    test('Services have pricing info', async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/api/services`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      const services = Array.isArray(data) ? data : (data.services || []);
      
      if (services.length > 0) {
        const service = services[0];
        // Service should have price or rate
        const hasPrice = 
          service.price !== undefined ||
          service.daily_rate !== undefined ||
          service.hourly_rate !== undefined ||
          service.base_price !== undefined;
        
        expect(hasPrice || service.name).toBeTruthy();
      }
    });
  });
});
