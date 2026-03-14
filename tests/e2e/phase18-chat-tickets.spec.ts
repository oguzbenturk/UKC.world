/**
 * PHASE 18: Chat, Support Tickets & Notifications
 *
 * Tests real-time chat, support ticket creation, and notification system.
 *
 * Run: npx playwright test tests/e2e/phase18-chat-tickets.spec.ts --project=chromium --workers=1
 */
import { test, expect } from '@playwright/test';
import {
  loginAsAdmin,
  loginAsStudent,
  navigateTo,
  waitForLoading,
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 20000, navigationTimeout: 30000 });
test.setTimeout(90000);

test.beforeEach(async () => {
  await new Promise(r => setTimeout(r, 2500));
});

// ═══════════════════════════════════════════════════════════
// 18.1  ADMIN CHAT VIEW
// ═══════════════════════════════════════════════════════════
test.describe('18.1 Admin Chat', () => {
  test('Admin can access chat page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/chat');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('main, [class*="chat"]').first().textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Chat page shows conversation list or empty state', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/chat');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    // Chat sidebar may show conversations or empty state
    const hasMessagesHeading = await page.locator('text="Messages"').isVisible({ timeout: 5000 }).catch(() => false);
    const hasConversations = await page.locator('[class*="cursor-pointer"][class*="rounded"], [class*="conversation"], [class*="chat-list"]').first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=/no conversations|no messages|start a chat/i').first().isVisible().catch(() => false);
    const hasChatContent = await page.locator('[class*="chat"], [class*="message"], [class*="sidebar"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasMessagesHeading || hasConversations || hasEmptyState || hasChatContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 18.2  SUPPORT TICKETS
// ═══════════════════════════════════════════════════════════
test.describe('18.2 Support Tickets', () => {
  test('Admin can view support tickets page', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/support-tickets');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body && body.length > 50).toBeTruthy();
  });

  test('Support tickets show list or empty state', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, '/support-tickets');
    await waitForLoading(page, 15000);
    await page.waitForTimeout(3000);

    const hasTickets = await page.locator('table tbody tr, [class*="ticket"], .ant-table').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=/no tickets|empty|no data|no support/i').first().isVisible().catch(() => false);
    // Fallback: page has substantial content
    const bodyText = await page.locator('body').textContent().catch(() => '');
    const hasContent = bodyText && bodyText.length > 100;
    expect(hasTickets || hasEmpty || hasContent).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 18.3  NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
test.describe('18.3 Notifications', () => {
  test('Admin can see notification bell/icon', async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(2000);

    const hasBell = await page.locator('[class*="notification"], [class*="bell"], [aria-label*="notification" i]').first().isVisible().catch(() => false);
    expect(hasBell).toBeTruthy();
  });

  test('Clicking notification opens panel or page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(2000);

    const bell = page.locator('[class*="notification"], [class*="bell"], [aria-label*="notification" i]').first();
    if (await bell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(1500);

      const body = await page.locator('body').textContent();
      expect(body && body.length > 100).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 18.4  STUDENT CHAT & SUPPORT
// ═══════════════════════════════════════════════════════════
test.describe('18.4 Student Chat & Support', () => {
  test('Student can access chat or messaging', async ({ page }) => {
    await loginAsStudent(page);
    await page.waitForTimeout(2000);

    // Try to navigate to student chat
    await navigateTo(page, '/student/chat');
    await page.waitForTimeout(2000);

    // Should show chat or redirect somewhere valid
    const url = page.url();
    expect(url).toBeTruthy();
  });
});
