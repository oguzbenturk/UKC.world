import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
// IMPORTANT: Set these to your actual local admin credentials
const EMAIL = process.env.DEMO_EMAIL || 'admin@plannivo.com'; 
const PASSWORD = process.env.DEMO_PASSWORD || 'asdasd35';

const BASE_URL = process.env.VITE_FRONTEND_URL || 'http://localhost:3000';

// KEY FIX: viewport: null allows the maximized window to determine the size
const VIEWPORT = null; 

// We force the recording to 1080p, but the window will be maximized on your screen
const VIDEO_SIZE = { width: 1920, height: 1080 };
const RECORD_DIR = 'demo-recordings';

// UPDATED TIMINGS (Slower)
const SCROLL_SPEED_MS = 25; // Slower scroll
const PAGE_LOAD_WAIT_MS = 6000; // More time on pages
const MODAL_OPEN_WAIT_MS = 4000; // More time on modals

// Resolve directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, '..', RECORD_DIR);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// --- HELPERS ---
const smoothScroll = async (page) => {
    // Scroll down
    await page.evaluate(async (speed) => {
        const totalHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        let currentPosition = 0;
        
        // Scroll down
        while (currentPosition + viewportHeight < totalHeight) {
            currentPosition += 5;
            window.scrollTo(0, currentPosition);
            await new Promise(resolve => setTimeout(resolve, speed));
        }
        
        // Ensure we hit the absolute bottom
        window.scrollTo(0, totalHeight);
    }, SCROLL_SPEED_MS);
    
    await page.waitForTimeout(2000);

    // Scroll up
    await page.evaluate(async (speed) => {
        let currentPosition = window.scrollY;
        
        // Scroll up
        while (currentPosition > 0) {
            currentPosition -= 8; 
            window.scrollTo(0, currentPosition);
            await new Promise(resolve => setTimeout(resolve, speed));
        }
        window.scrollTo(0, 0);
    }, SCROLL_SPEED_MS);
};

// --- MAIN SCRIPTS ---
(async () => {
    console.log('🎥 Starting UKC.World Full App Tour...');
    console.log(`🔗 Target: ${BASE_URL}`);

    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized'] // Maximizes the browser window
    });

    const context = await browser.newContext({
        viewport: VIEWPORT, // Respects the maximized window size
        recordVideo: {
            dir: outputDir,
            size: VIDEO_SIZE 
        }
    });

    const page = await context.newPage();
    const step = (msg) => console.log(`\n📍 STEP: ${msg}`);

    try {
        // 1. LOGIN
        step('Login');
        await page.goto(`${BASE_URL}/login`);
        await page.fill('input[type="email"]', EMAIL); 
        await page.fill('input[type="password"]', PASSWORD);
        
        if (await page.isVisible('button[type="submit"]')) {
            await page.click('button[type="submit"]');
        } else {
            await page.keyboard.press('Enter');
        }
        await page.waitForURL('**/dashboard', { timeout: 15000 });
        console.log('✅ Logged in successfully.');
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);

        // 2. DASHBOARD
        step('Dashboard Tour');
        await smoothScroll(page); 

        // 3. CUSTOMERS
        step('Customers Page & Profile');
        await page.goto(`${BASE_URL}/customers`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        await smoothScroll(page);
        
        // Selector FIX: Use filtered table rows to avoid hidden rows
        const firstCustomerRow = page.locator('tr.ant-table-row:visible').first();
        if (await firstCustomerRow.isVisible()) {
            await firstCustomerRow.click();
            console.log('   Opened customer profile drawer/page');
            await page.waitForTimeout(MODAL_OPEN_WAIT_MS);
            
            // Close drawer/modal
            await page.keyboard.press('Escape');
            await page.waitForTimeout(2000); // Wait for animation
        }

        // 4. INSTRUCTORS
        step('Instructors Page & Details');
        await page.goto(`${BASE_URL}/instructors`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        await smoothScroll(page);
        
        // Selector FIX: Try cards first, then specific table rows (ignoring measure rows)
        // Check for card-based layout OR table layout
        const instructorCard = page.locator('div[class*="InstructorCard"]').first();
        const instructorRow = page.locator('tr.ant-table-row:not(.ant-table-measure-row)').first();

        if (await instructorCard.isVisible()) {
            await instructorCard.click();
            console.log('   Opened instructor details (Card View)');
        } else if (await instructorRow.isVisible()) {
            await instructorRow.click();
            console.log('   Opened instructor details (Table View)');
        } else {
            console.log('⚠️ No visible instructors found to click.');
        }

        await page.waitForTimeout(MODAL_OPEN_WAIT_MS);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(2000);

        // 5. CALENDARS
        step('Calendars');
        await page.goto(`${BASE_URL}/calendars`); 
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        
        // 6. SHOP
        step('Shop');
        await page.goto(`${BASE_URL}/shop`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        await smoothScroll(page);

        // 7. ACADEMY / BOOKING WIZARD
        step('Academy / Booking Wizard');
        await page.goto(`${BASE_URL}/bookings`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        
        const newBookingBtn = page.getByRole('button', { name: /new booking|add booking/i }).first();
        if (await newBookingBtn.isVisible()) {
            await newBookingBtn.click();
            console.log('   Clicked New Booking button');
            await page.waitForTimeout(MODAL_OPEN_WAIT_MS); 

            console.log('   Attempting to select customer...');
            const customerSelect = page.locator('input[id*="customer"], [class*="select"] input').first();
            if (await customerSelect.isVisible()) {
                await customerSelect.click();
                await page.waitForTimeout(1000);
                // navigate bit in dropdown
                await page.keyboard.press('ArrowDown');
                await page.keyboard.press('Enter');
            }

            await page.waitForTimeout(4000); 
            
            // Cancel booking wizard
            const cancelBtn = page.getByRole('button', { name: /cancel|close/i }).first();
            if (await cancelBtn.isVisible()) await cancelBtn.click();
        } else {
            console.log('⚠️ Could not find New Booking button, skipping wizard step.');
        }

        // 8. RENTAL
        step('Rental & Add Rental');
        await page.goto(`${BASE_URL}/calendars/rentals`); 
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        
        const addRentalBtn = page.getByRole('button', { name: /new rental|add rental/i }).first();
        if (await addRentalBtn.isVisible()) {
            await addRentalBtn.click();
            console.log('   Opened Add Rental modal');
            await page.waitForTimeout(MODAL_OPEN_WAIT_MS);
            await page.keyboard.press('Escape');
        }

        // 9. MEMBERS
        step('Members');
        await page.goto(`${BASE_URL}/members/offerings`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        await smoothScroll(page);

        // 10. CARE (Repairs)
        step('Care / Repairs');
        await page.goto(`${BASE_URL}/repairs`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        await smoothScroll(page);

        // 11. STAY
        step('Stay');
        await page.goto(`${BASE_URL}/calendars/stay`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        
        await page.goto(`${BASE_URL}/stay/book-accommodation`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        await smoothScroll(page);

        // 12. COMMUNITY & CHAT
        step('Community / Chat');
        await page.goto(`${BASE_URL}/chat`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS); 
        
        const firstChat = page.locator('li[class*="ConversationItem"]').first();
        if (await firstChat.isVisible()) await firstChat.click();
        await page.waitForTimeout(4000);

        // 13. SERVICES / SETTINGS / FINANCE
        step('Services Parameters');
        await page.goto(`${BASE_URL}/services`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        await smoothScroll(page);

        step('Finance');
        await page.goto(`${BASE_URL}/finance`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);
        await smoothScroll(page);
        
        await page.goto(`${BASE_URL}/finance/payment-history`);
        await page.waitForTimeout(PAGE_LOAD_WAIT_MS);

        console.log('🏁 Full Application Tour Completed!');

    } catch (error) {
        console.error('❌ Error during recording:', error);
        await page.screenshot({ path: path.join(outputDir, 'error-screenshot.png') });
    } finally {
        await context.close();
        await browser.close();
        
        // Rename video to have a nice timestamp
        try {
            const files = fs.readdirSync(outputDir);
            // find the latest webm file
            const videoFile = files
                .filter(f => f.endsWith('.webm'))
                .map(f => ({ name: f, time: fs.statSync(path.join(outputDir, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time)[0];
            
            if (videoFile) {
                const newName = `ukc-full-tour-${Date.now()}.webm`;
                fs.renameSync(path.join(outputDir, videoFile.name), path.join(outputDir, newName));
                console.log(`📹 Video saved: ${path.join(outputDir, newName)}`);
            }
        } catch (e) {
            console.log('Warning: Could not rename video file.', e.message);
        }
    }
})();
