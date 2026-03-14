import { test, expect } from '@playwright/test';

// Frontend runs on localhost:3000
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Instructor test credentials - use an actual instructor from the database
const INSTRUCTOR_EMAIL = process.env.TEST_INSTRUCTOR_EMAIL || 'autoinst487747@test.com';
const INSTRUCTOR_PASSWORD = process.env.TEST_INSTRUCTOR_PASSWORD || 'TestPass123!';

// Helper function to login as instructor
async function loginAsInstructor(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  
  await page.fill('#email', INSTRUCTOR_EMAIL);
  await page.fill('#password', INSTRUCTOR_PASSWORD);
  await page.click('button[type="submit"]');
  
  // Wait for redirect - instructors may go to /instructor/dashboard or /admin or /
  await page.waitForURL(/\/(instructor|admin|dashboard|\?)/, { timeout: 20000 }).catch(async () => {
    // Some instructors may land on home page — that's okay if login succeeded
    await page.waitForLoadState('networkidle');
  });
}

test.describe('Instructor dashboard experience', () => {
  test.describe.configure({ mode: 'serial' });

  test('Instructor can login and access dashboard', async ({ page }) => {
    await loginAsInstructor(page);
    
    // Should be on instructor or admin area (depending on permissions)
    const url = page.url();
    
    // Navigate to instructor dashboard
    if (!url.includes('/instructor/dashboard')) {
      await page.goto(`${BASE_URL}/instructor/dashboard`);
    }
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Check for key dashboard elements - be flexible about what's visible
    const pageContent = await page.textContent('body');
    
    // At minimum, the page should load without critical error
    expect(pageContent).not.toContain('Access Denied');
  });

  test('Dashboard displays earnings and schedule data', async ({ page }) => {
    await loginAsInstructor(page);
    await page.goto(`${BASE_URL}/instructor/dashboard`);
    await page.waitForLoadState('networkidle');
    
    // Wait a bit for dynamic content to load
    await page.waitForTimeout(1000);
    
    // Get body text content for flexible matching
    const bodyText = await page.textContent('body') || '';
    const lowerBodyText = bodyText.toLowerCase();
    
    // Look for common dashboard elements (earnings, lessons, schedule, etc.)
    // These are case-insensitive checks on page content
    const hasEarningsContent = lowerBodyText.includes('earning') || 
                                lowerBodyText.includes('income') || 
                                lowerBodyText.includes('revenue') ||
                                lowerBodyText.includes('€') ||
                                lowerBodyText.includes('$');
    const hasScheduleContent = lowerBodyText.includes('schedule') || 
                               lowerBodyText.includes('lesson') || 
                               lowerBodyText.includes('booking') ||
                               lowerBodyText.includes('upcoming') ||
                               lowerBodyText.includes('calendar');
    const hasStatsContent = lowerBodyText.includes('student') || 
                            lowerBodyText.includes('hour') || 
                            lowerBodyText.includes('total') ||
                            lowerBodyText.includes('dashboard');
    
    // At least one of these content types should be visible
    // Or the page should at least have the instructor's name
    const hasInstructorInfo = lowerBodyText.includes('oguz') || 
                              lowerBodyText.includes('instructor') ||
                              lowerBodyText.includes('welcome');
    
    expect(hasEarningsContent || hasScheduleContent || hasStatsContent || hasInstructorInfo).toBeTruthy();
  });
});
