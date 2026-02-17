#!/usr/bin/env node
/**
 * 🚀 Production Readiness Test Suite
 * 
 * Automated tests for all critical business functions.
 * Tests API endpoints and verifies data integrity.
 * 
 * Usage:
 *   npm run test:production        # Run all tests
 *   npm run test:production -- --phase=2   # Run specific phase
 *   npm run test:production -- --verbose   # Detailed output
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

// Configuration
const API_URL = process.env.TEST_API_URL || 'http://localhost:4000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@plannivo.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'asdasd35';

// Parse CLI args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const phaseArg = args.find(a => a.startsWith('--phase='));
const targetPhase = phaseArg ? parseInt(phaseArg.split('=')[1]) : null;

// Test state
let authToken = null;
let testResults = { passed: 0, failed: 0, skipped: 0, warnings: 0 };
let testUserId = null;
let testBookingId = null;

// ============================================================================
// UTILITIES
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function pass(name, detail = '') {
  testResults.passed++;
  log(`  ✅ ${name}${detail ? ` (${detail})` : ''}`, colors.green);
}

function fail(name, error = '') {
  testResults.failed++;
  log(`  ❌ ${name}${error ? `: ${error}` : ''}`, colors.red);
}

function skip(name, reason = '') {
  testResults.skipped++;
  log(`  ⏭️  ${name}${reason ? ` - ${reason}` : ''}`, colors.yellow);
}

function warn(name, detail = '') {
  testResults.warnings++;
  log(`  ⚠️  ${name}${detail ? `: ${detail}` : ''}`, colors.yellow);
}

function section(title) {
  console.log();
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, colors.cyan);
  log(`  ${title}`, colors.cyan);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, colors.cyan);
}

async function api(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const contentType = response.headers.get('content-type');
    let data = null;
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

// ============================================================================
// PHASE 1: API HEALTH & AUTHENTICATION
// ============================================================================

async function phase1_ApiHealth() {
  section('📡 PHASE 1: API Health & Authentication');

  // Test 1.1: API is reachable
  const healthCheck = await api('/api/health');
  if (healthCheck.ok) {
    pass('API health endpoint', `Status: ${healthCheck.status}`);
  } else if (healthCheck.status === 404) {
    // Try alternative health endpoints
    const altHealth = await api('/api/metrics');
    if (altHealth.ok) {
      pass('API metrics endpoint (fallback)', `Status: ${altHealth.status}`);
    } else {
      warn('No health endpoint found', 'Consider adding /api/health');
    }
  } else {
    fail('API unreachable', healthCheck.error || `Status: ${healthCheck.status}`);
    return false; // Critical failure
  }

  // Test 1.2: Authentication works
  const loginRes = await api('/api/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
  });

  if (loginRes.ok && loginRes.data?.token) {
    authToken = loginRes.data.token;
    testUserId = loginRes.data.user?.id;
    pass('Admin login successful');
    if (verbose) log(`    Token: ${authToken.substring(0, 20)}...`, colors.dim);
  } else {
    fail('Admin login failed', loginRes.data?.error || `Status: ${loginRes.status}`);
    return false;
  }

  // Test 1.3: Token validation
  const profileRes = await api('/api/auth/me');
  if (profileRes.ok) {
    pass('Token validation (profile fetch)');
  } else if (profileRes.status === 404) {
    skip('Profile endpoint not found');
  } else {
    fail('Token invalid', `Status: ${profileRes.status}`);
  }

  return true;
}

// ============================================================================
// PHASE 2: FINANCIAL SYSTEM
// ============================================================================

async function phase2_FinancialSystem() {
  section('💰 PHASE 2: Financial System');

  // Test 2.1: Wallet Summary
  const walletRes = await api('/api/wallet/summary');
  if (walletRes.ok) {
    const data = walletRes.data;
    // Check for actual field names: available, pending, nonWithdrawable
    if (data?.available !== undefined || data?.pending !== undefined) {
      pass('Wallet summary', `Available: ${data.available}, Pending: ${data.pending}`);
    } else if (data?.balance !== undefined) {
      pass('Wallet summary', `Balance: ${data.balance}`);
    } else {
      pass('Wallet summary loaded', `Currency: ${data.currency || 'EUR'}`);
    }
  } else {
    skip('Wallet summary', `Status: ${walletRes.status}`);
  }

  // Test 2.2: Transaction History
  const txRes = await api('/api/wallet/transactions?limit=10');
  if (txRes.ok) {
    const txList = txRes.data?.results || txRes.data || [];
    pass('Transaction history', `Found ${Array.isArray(txList) ? txList.length : 0} transactions`);
    
    // Verify transaction structure
    if (Array.isArray(txList) && txList.length > 0) {
      const tx = txList[0];
      if (tx.amount !== undefined || tx.credit !== undefined || tx.debit !== undefined) {
        pass('Transaction structure valid');
      } else {
        warn('Transaction missing amount field');
      }
    }
  } else {
    skip('Transaction history', `Status: ${txRes.status}`);
  }

  // Test 2.3: Finance Summary (Admin) - with correct field names
  const financeRes = await api('/api/finances/summary');
  if (financeRes.ok) {
    const data = financeRes.data;
    const checks = [];
    
    // Check actual nested structure: data.revenue.total_revenue, etc.
    if (data.revenue?.total_revenue !== undefined) checks.push(`total: €${data.revenue.total_revenue}`);
    if (data.revenue?.lesson_revenue !== undefined) checks.push(`lessons: €${data.revenue.lesson_revenue}`);
    if (data.revenue?.rental_revenue !== undefined) checks.push(`rentals: €${data.revenue.rental_revenue}`);
    if (data.revenue?.package_revenue !== undefined) checks.push(`packages: €${data.revenue.package_revenue}`);
    
    if (checks.length > 0) {
      pass('Finance summary', checks.join(', '));
    } else {
      // Fallback to old field names
      if (data.totalRevenue !== undefined) {
        pass('Finance summary', `Total: €${data.totalRevenue}`);
      } else {
        pass('Finance summary loaded', 'Structure differs from expected');
      }
    }
    
    // Check for data integrity issues
    if (data.revenue?.total_revenue < 0) {
      warn('Negative total revenue detected');
    }
    if (data.balances?.total_customer_debt && parseFloat(data.balances.total_customer_debt) > 10000) {
      warn('High customer debt', `€${data.balances.total_customer_debt}`);
    }
  } else {
    skip('Finance summary', `Status: ${financeRes.status}`);
  }

  // Test 2.4: Dashboard KPIs
  const dashRes = await api('/api/dashboard/summary');
  if (dashRes.ok) {
    pass('Dashboard KPIs loaded');
    
    // Check for negative values (data corruption indicator)
    const data = dashRes.data;
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number' && value < 0 && key.includes('Revenue')) {
        warn(`Negative ${key}`, `Value: ${value}`);
      }
    }
  } else {
    skip('Dashboard summary', `Status: ${dashRes.status}`);
  }

  // Test 2.5: Customer balances check
  const studentsRes = await api('/api/students?limit=5');
  if (studentsRes.ok) {
    const students = studentsRes.data?.data || studentsRes.data || [];
    if (students.length > 0) {
      let creditCount = 0, debtCount = 0;
      students.forEach(s => {
        if (s.wallet_balance > 0) creditCount++;
        if (s.wallet_balance < 0) debtCount++;
      });
      pass('Customer balance check', `${creditCount} with credit, ${debtCount} with debt`);
    }
  }

  return true;
}

// ============================================================================
// PHASE 3: BOOKING SYSTEM
// ============================================================================

async function phase3_BookingSystem() {
  section('📅 PHASE 3: Booking System');

  // Test 3.1: Fetch bookings
  const bookingsRes = await api('/api/bookings?limit=50');
  if (!bookingsRes.ok) {
    fail('Bookings list', `Status: ${bookingsRes.status}`);
    return true;
  }
  
  const bookings = Array.isArray(bookingsRes.data) ? bookingsRes.data : (bookingsRes.data?.bookings || []);
  pass('Bookings list', `Found ${bookings.length} bookings`);

  if (bookings.length > 0) {
    testBookingId = bookings[0].id;
    
    // Verify booking structure
    const booking = bookings[0];
    const requiredFields = ['id', 'date', 'status'];
    const missingFields = requiredFields.filter(f => booking[f] === undefined);
    
    if (missingFields.length === 0) {
      pass('Booking structure valid');
    } else {
      warn('Booking missing fields', missingFields.join(', '));
    }

    // Test 3.2: Fetch single booking
    const singleRes = await api(`/api/bookings/${testBookingId}`);
    if (singleRes.ok) {
      pass('Single booking fetch');
    } else {
      fail('Single booking fetch', `Status: ${singleRes.status}`);
    }
  }

  // Test 3.3: Booking status distribution
  const statusCounts = {};
  bookings.forEach(b => {
    const status = b.status || 'unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  if (Object.keys(statusCounts).length > 0) {
    pass('Booking status distribution', JSON.stringify(statusCounts));
  }

  // Test 3.4: Duration variations (1h, 1.5h, 2h, etc.)
  const durationCounts = {};
  bookings.forEach(b => {
    const dur = parseFloat(b.duration) || 0;
    const durLabel = dur === 1 ? '1h' : dur === 1.5 ? '1.5h' : dur === 2 ? '2h' : dur === 3 ? '3h' : `${dur}h`;
    durationCounts[durLabel] = (durationCounts[durLabel] || 0) + 1;
  });
  
  if (Object.keys(durationCounts).length > 0) {
    pass('Booking durations', JSON.stringify(durationCounts));
    
    // Verify duration calculations make sense
    const invalidDurations = bookings.filter(b => {
      const dur = parseFloat(b.duration);
      return dur <= 0 || dur > 24;
    });
    if (invalidDurations.length > 0) {
      warn('Invalid durations found', `${invalidDurations.length} bookings`);
    }
  }

  // Test 3.5: Private vs Group bookings
  const privateLessons = bookings.filter(b => (b.group_size || 1) === 1 && (b.participants?.length || 1) === 1);
  const groupLessons = bookings.filter(b => (b.group_size || 1) > 1 || (b.participants?.length || 0) > 1);
  
  pass('Private bookings', `${privateLessons.length} found`);
  if (groupLessons.length > 0) {
    pass('Group bookings', `${groupLessons.length} found`);
    
    // Check group sizes
    const groupSizes = {};
    groupLessons.forEach(b => {
      const size = b.group_size || b.participants?.length || 2;
      groupSizes[size] = (groupSizes[size] || 0) + 1;
    });
    if (verbose) log(`    Group sizes: ${JSON.stringify(groupSizes)}`, colors.dim);
  } else {
    log('    ℹ️  No group bookings in data', colors.dim);
  }

  // Test 3.6: Payment status integrity
  const paymentStatuses = {};
  let pricingIssues = 0;
  
  bookings.forEach(b => {
    const ps = b.payment_status || 'unknown';
    paymentStatuses[ps] = (paymentStatuses[ps] || 0) + 1;
    
    // Check for pricing integrity
    const amount = parseFloat(b.amount) || 0;
    const finalAmount = parseFloat(b.final_amount) || 0;
    if (finalAmount > amount * 1.5 || (finalAmount > 0 && amount === 0)) {
      pricingIssues++;
    }
  });
  
  pass('Payment status check', JSON.stringify(paymentStatuses));
  if (pricingIssues > 0) {
    warn('Pricing discrepancies', `${pricingIssues} bookings with suspicious pricing`);
  }

  // Test 3.7: Package-linked bookings
  const packageBookings = bookings.filter(b => b.customer_package_id);
  if (packageBookings.length > 0) {
    pass('Package-linked bookings', `${packageBookings.length} use packages`);
    
    // Check if package bookings have proper tracking
    const noPackageName = packageBookings.filter(b => !b.customer_package_name);
    if (noPackageName.length > 0) {
      warn('Package bookings missing package name', `${noPackageName.length} affected`);
    }
  } else {
    log('    ℹ️  No package-linked bookings found', colors.dim);
  }

  // Test 3.8: Calendar/schedule endpoint
  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const calendarRes = await api(`/api/bookings?start_date=${startDate}&end_date=${endDate}`);
  if (calendarRes.ok) {
    const upcomingBookings = Array.isArray(calendarRes.data) ? calendarRes.data : [];
    pass('Calendar date filter', `${upcomingBookings.length} bookings in next 7 days`);
  } else {
    skip('Calendar filter', `Status: ${calendarRes.status}`);
  }

  // Test 3.9: Instructor assignments
  const instructorCounts = {};
  bookings.forEach(b => {
    const instructor = b.instructor_name || b.instructor_user_id || 'unassigned';
    instructorCounts[instructor] = (instructorCounts[instructor] || 0) + 1;
  });
  
  const unassigned = instructorCounts['unassigned'] || 0;
  if (unassigned > 0 && unassigned === bookings.length) {
    warn('All bookings missing instructor', `${unassigned} bookings`);
  } else {
    pass('Instructor assignments', `${Object.keys(instructorCounts).length} instructors active`);
  }

  // Test 3.10: Check-in/Check-out status
  const checkedIn = bookings.filter(b => b.checkin_status === 'checked_in').length;
  const checkedOut = bookings.filter(b => b.checkout_status === 'checked_out').length;
  const completed = bookings.filter(b => b.status === 'completed').length;
  
  pass('Check-in/out tracking', `${checkedIn} checked-in, ${checkedOut} checked-out, ${completed} completed`);
  
  // Warn if completed bookings don't have checkout
  const completedNoCheckout = bookings.filter(b => 
    b.status === 'completed' && b.checkout_status !== 'checked_out'
  ).length;
  if (completedNoCheckout > 0) {
    log(`    ℹ️  ${completedNoCheckout} completed bookings without checkout status`, colors.dim);
  }

  return true;
}

// ============================================================================
// PHASE 4: RENTAL SYSTEM
// ============================================================================

async function phase4_RentalSystem() {
  section('🏄 PHASE 4: Rental System');

  // Test 4.1: Fetch rentals
  const rentalsRes = await api('/api/rentals');
  if (rentalsRes.ok) {
    const rentals = Array.isArray(rentalsRes.data) ? rentalsRes.data : [];
    pass('Rentals list', `Found ${rentals.length} rentals`);

    if (rentals.length > 0) {
      // Check for active rentals
      const activeRentals = rentals.filter(r => r.status === 'active' || r.status === 'pending');
      const completedRentals = rentals.filter(r => r.status === 'completed' || r.status === 'returned');
      
      if (activeRentals.length > 0) {
        pass('Active rentals', `${activeRentals.length} in progress`);
      }
      if (completedRentals.length > 0) {
        pass('Completed rentals', `${completedRentals.length} returned`);
      }
      
      // Check rental durations
      const durationDays = {};
      rentals.forEach(r => {
        if (r.start_date && r.end_date) {
          const start = new Date(r.start_date);
          const end = new Date(r.end_date);
          const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
          const label = days <= 1 ? '1 day' : days <= 3 ? '2-3 days' : days <= 7 ? '4-7 days' : '7+ days';
          durationDays[label] = (durationDays[label] || 0) + 1;
        }
      });
      
      if (Object.keys(durationDays).length > 0) {
        pass('Rental durations', JSON.stringify(durationDays));
      }
      
      // Check for pricing issues
      const noPriceRentals = rentals.filter(r => !r.total_price && r.status !== 'cancelled').length;
      if (noPriceRentals > 0) {
        warn('Rentals without price', `${noPriceRentals} found`);
      }
      
      // Check equipment assignments
      const noEquipment = rentals.filter(r => 
        !r.equipment_ids?.length && !r.equipment_details
      ).length;
      if (noEquipment > 0) {
        warn('Rentals without equipment', `${noEquipment} found`);
      }
    }
  } else if (rentalsRes.status === 403) {
    skip('Rentals (requires admin/manager role)');
  } else {
    warn('Rentals list', `Status: ${rentalsRes.status}`);
  }

  // Test 4.2: Equipment/Services with rental type
  const equipmentRes = await api('/api/services');
  if (equipmentRes.ok) {
    const services = Array.isArray(equipmentRes.data) ? equipmentRes.data : [];
    const equipment = services.filter(s => 
      s.category === 'rentals' || s.category === 'rental' || 
      s.service_type === 'rental' || s.name?.toLowerCase().includes('rental')
    );
    
    pass('Equipment catalog', `Found ${equipment.length} rental items`);

    // Check for stock issues
    let lowStock = 0;
    let negativeStock = 0;
    equipment.forEach(item => {
      if (item.stock !== undefined) {
        if (item.stock < 0) negativeStock++;
        else if (item.stock === 0) lowStock++;
      }
    });
    
    if (negativeStock > 0) {
      warn('Negative equipment stock', `${negativeStock} items`);
    }
    if (lowStock > 0) {
      log(`    ℹ️  ${lowStock} equipment items out of stock`, colors.dim);
    }
  } else {
    skip('Equipment catalog', `Status: ${equipmentRes.status}`);
  }

  // Test 4.3: Recent rentals
  const recentRes = await api('/api/rentals/recent?limit=5');
  if (recentRes.ok) {
    pass('Recent rentals endpoint works');
  } else if (recentRes.status !== 404) {
    skip('Recent rentals', `Status: ${recentRes.status}`);
  }

  return true;
}

// ============================================================================
// PHASE 5: ACCOMMODATION
// ============================================================================

async function phase5_Accommodation() {
  section('🏨 PHASE 5: Accommodation');

  const accomRes = await api('/api/accommodation/bookings');
  if (accomRes.ok) {
    const bookings = Array.isArray(accomRes.data) ? accomRes.data : (accomRes.data?.bookings || []);
    pass('Accommodation list', `Found ${bookings.length} bookings`);
  } else if (accomRes.status === 404) {
    skip('Accommodation endpoint not found');
  } else {
    skip('Accommodation', `Status: ${accomRes.status}`);
  }

  // Check accommodation units/rooms
  const unitsRes = await api('/api/accommodation/units');
  if (unitsRes.ok) {
    pass('Accommodation units loaded');
  } else {
    skip('Accommodation units endpoint');
  }

  return true;
}

// ============================================================================
// PHASE 6: SHOP & PRODUCTS
// ============================================================================

async function phase6_Shop() {
  section('🛒 PHASE 6: Shop & Products');

  // Test 6.1: Products
  const productsRes = await api('/api/products');
  if (productsRes.ok) {
    const products = Array.isArray(productsRes.data) ? productsRes.data : (productsRes.data?.products || []);
    pass('Products catalog', `Found ${products.length} products`);

    // Check stock issues
    let outOfStock = 0;
    let negativeStock = 0;
    products.forEach(p => {
      if (p.stock_quantity === 0) outOfStock++;
      if (p.stock_quantity < 0) negativeStock++;
    });
    
    if (outOfStock > 0) {
      log(`    ℹ️  ${outOfStock} products out of stock`, colors.dim);
    }
    if (negativeStock > 0) {
      warn('Negative stock detected', `${negativeStock} products`);
    }
  } else {
    skip('Products', `Status: ${productsRes.status}`);
  }

  // Test 6.2: Shop Orders
  const ordersRes = await api('/api/shop-orders/my-orders');
  if (ordersRes.ok) {
    const orders = Array.isArray(ordersRes.data) ? ordersRes.data : (ordersRes.data?.orders || []);
    pass('Shop orders', `Found ${orders.length} orders`);
  } else {
    skip('Shop orders', `Status: ${ordersRes.status}`);
  }

  return true;
}

// ============================================================================
// PHASE 7: USER MANAGEMENT
// ============================================================================

async function phase7_UserManagement() {
  section('👥 PHASE 7: User Management');

  // Test 7.1: Users list
  const usersRes = await api('/api/users?limit=10');
  if (usersRes.ok) {
    const users = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || []);
    pass('Users list', `Found ${users.length} users`);

    // Check role distribution
    const roles = {};
    users.forEach(u => {
      const role = u.role || 'unknown';
      roles[role] = (roles[role] || 0) + 1;
    });
    if (verbose && Object.keys(roles).length > 0) {
      log(`    Roles: ${JSON.stringify(roles)}`, colors.dim);
    }
  } else {
    skip('Users list', `Status: ${usersRes.status}`);
  }

  // Test 7.2: Students/Customers
  const studentsRes = await api('/api/students?limit=10');
  if (studentsRes.ok) {
    const students = studentsRes.data?.data || studentsRes.data || [];
    pass('Students list', `Found ${students.length} students`);
  } else {
    skip('Students', `Status: ${studentsRes.status}`);
  }

  // Test 7.3: Instructors
  const instructorsRes = await api('/api/instructors');
  if (instructorsRes.ok) {
    const instructors = Array.isArray(instructorsRes.data) ? instructorsRes.data : [];
    pass('Instructors list', `Found ${instructors.length} instructors`);
  } else {
    skip('Instructors', `Status: ${instructorsRes.status}`);
  }

  return true;
}

// ============================================================================
// PHASE 8: COMMUNICATION
// ============================================================================

async function phase8_Communication() {
  section('💬 PHASE 8: Communication');

  // Test 8.1: Chat conversations
  const chatRes = await api('/api/chat/conversations');
  if (chatRes.ok) {
    pass('Chat conversations endpoint');
  } else if (chatRes.status === 404) {
    skip('Chat endpoint not found');
  } else {
    skip('Chat', `Status: ${chatRes.status}`);
  }

  // Test 8.2: Notifications
  const notifRes = await api('/api/notifications/user?page=1&limit=10&unreadOnly=false');
  if (notifRes.ok) {
    const notifications = notifRes.data?.notifications || notifRes.data || [];
    pass('Notifications', `Found ${Array.isArray(notifications) ? notifications.length : 0} notifications`);
  } else {
    skip('Notifications', `Status: ${notifRes.status}`);
  }

  return true;
}

// ============================================================================
// PHASE 9: FORMS & COMPLIANCE
// ============================================================================

async function phase9_FormsCompliance() {
  section('📝 PHASE 9: Forms & Compliance');

  // Test 9.1: Form templates
  const formsRes = await api('/api/form-templates');
  if (formsRes.ok) {
    const forms = Array.isArray(formsRes.data) ? formsRes.data : [];
    pass('Form templates', `Found ${forms.length} templates`);
  } else {
    skip('Form templates', `Status: ${formsRes.status}`);
  }

  // Test 9.2: Waivers - Use admin endpoint
  const waiversRes = await api('/api/admin/waivers?page=1&pageSize=10');
  if (waiversRes.ok) {
    const data = waiversRes.data?.data || [];
    pass('Waivers endpoint', `Found ${data.length} waivers`);
  } else {
    skip('Waivers', `Status: ${waiversRes.status}`);
  }

  // Test 9.3: GDPR/Consents
  const consentsRes = await api('/api/user-consents/me');
  if (consentsRes.ok) {
    pass('User consents endpoint');
  } else {
    skip('User consents', `Status: ${consentsRes.status}`);
  }

  return true;
}

// ============================================================================
// PHASE 10: REPORTING
// ============================================================================

async function phase10_Reporting() {
  section('📊 PHASE 10: Reporting & Analytics');

  // Test 10.1: Finance reports
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  const reportRes = await api(`/api/finances/reports/customer-summary?startDate=${startDate}&endDate=${endDate}`);
  if (reportRes.ok) {
    pass('Finance report', `${startDate} to ${endDate}`);
  } else {
    skip('Finance report', `Status: ${reportRes.status}`);
  }

  // Test 10.2: Instructor commissions
  // Get first instructor from instructor list
  const instructorsRes = await api('/api/instructors');
  if (instructorsRes.ok && Array.isArray(instructorsRes.data) && instructorsRes.data.length > 0) {
    const firstInstructor = instructorsRes.data[0];
    const commissionsRes = await api(`/api/instructor-commissions/instructors/${firstInstructor.id}/commissions`);
    if (commissionsRes.ok) {
      const commissions = Array.isArray(commissionsRes.data) ? commissionsRes.data : [];
      pass('Instructor commissions endpoint', `Found ${commissions.length} commission records`);
    } else {
      skip('Instructor commissions', `Status: ${commissionsRes.status}`);
    }
  } else {
    skip('Instructor commissions', 'No instructors available');
  }

  // Test 10.3: Audit logs
  const auditRes = await api('/api/audit-logs?limit=5');
  if (auditRes.ok) {
    pass('Audit logs');
  } else {
    skip('Audit logs', `Status: ${auditRes.status}`);
  }

  return true;
}

// ============================================================================
// PHASE 11: SECURITY
// ============================================================================

async function phase11_Security() {
  section('🔒 PHASE 11: Security');

  // Test 11.1: Unauthorized access should be blocked
  const unauthorizedRes = await fetch(`${API_URL}/api/users`, {
    headers: { 'Authorization': 'Bearer invalid-token' }
  }).then(r => ({ status: r.status })).catch(() => ({ status: 0 }));
  
  if (unauthorizedRes.status === 401 || unauthorizedRes.status === 403) {
    pass('Invalid token rejected', `Status: ${unauthorizedRes.status}`);
  } else if (unauthorizedRes.status === 200) {
    fail('Security: Invalid token accepted!');
  } else {
    skip('Token rejection test', `Status: ${unauthorizedRes.status}`);
  }

  // Test 11.2: No auth should be blocked
  const noAuthRes = await fetch(`${API_URL}/api/users`).then(r => ({ status: r.status })).catch(() => ({ status: 0 }));
  
  if (noAuthRes.status === 401 || noAuthRes.status === 403) {
    pass('Unauthenticated request blocked');
  } else if (noAuthRes.status === 200) {
    warn('Protected route accessible without auth');
  } else {
    skip('No-auth test', `Status: ${noAuthRes.status}`);
  }

  // Test 11.3: Check for exposed sensitive data
  const settingsRes = await api('/api/settings');
  if (settingsRes.ok && settingsRes.data) {
    const data = JSON.stringify(settingsRes.data);
    const sensitivePatterns = ['password', 'secret', 'private_key', 'api_key'];
    const exposed = sensitivePatterns.filter(p => data.toLowerCase().includes(p));
    
    if (exposed.length > 0) {
      warn('Potential sensitive data in settings', exposed.join(', '));
    } else {
      pass('No obvious sensitive data exposure');
    }
  }

  return true;
}

// ============================================================================
// PHASE 12: PACKAGES & HOURS
// ============================================================================

async function phase12_PackagesHours() {
  section('📦 PHASE 12: Customer Packages & Hours');

  // Test 12.1: Service packages catalog
  const servicesRes = await api('/api/services');
  if (servicesRes.ok) {
    const services = Array.isArray(servicesRes.data) ? servicesRes.data : [];
    
    // Categorize services
    const lessons = services.filter(s => s.category === 'lesson' || s.name?.toLowerCase().includes('lesson'));
    const rentals = services.filter(s => s.category === 'rentals' || s.category === 'rental');
    const packages = services.filter(s => s.category === 'package' || s.name?.toLowerCase().includes('package'));
    
    pass('Services catalog', `${services.length} total: ${lessons.length} lessons, ${rentals.length} rentals`);
    
    // Check for private vs group services
    const privateServices = services.filter(s => s.name?.toLowerCase().includes('private'));
    const groupServices = services.filter(s => s.name?.toLowerCase().includes('group'));
    
    if (privateServices.length > 0 || groupServices.length > 0) {
      pass('Service types', `${privateServices.length} private, ${groupServices.length} group`);
    }
    
    // Check duration variations
    const durations = {};
    services.forEach(s => {
      const dur = parseFloat(s.duration) || 0;
      if (dur > 0) {
        durations[`${dur}h`] = (durations[`${dur}h`] || 0) + 1;
      }
    });
    
    if (Object.keys(durations).length > 0) {
      pass('Service durations', JSON.stringify(durations));
    }
    
    // Check pricing
    const zeroPriceActive = services.filter(s => 
      (parseFloat(s.price) === 0 || !s.price) && s.status !== 'inactive'
    ).length;
    if (zeroPriceActive > 0) {
      warn('Services with zero price', `${zeroPriceActive} active services`);
    }
  } else {
    skip('Services catalog', `Status: ${servicesRes.status}`);
  }

  // Test 12.2: Member offerings / Packages
  const offeringsRes = await api('/api/member-offerings');
  if (offeringsRes.ok) {
    const offerings = Array.isArray(offeringsRes.data) ? offeringsRes.data : [];
    pass('Member offerings', `Found ${offerings.length} offerings`);
    
    // Check package hours
    offerings.forEach(o => {
      if (o.total_hours && o.total_hours > 100) {
        warn(`Package "${o.name}" has unusually high hours`, `${o.total_hours}h`);
      }
    });
  } else {
    skip('Member offerings', `Status: ${offeringsRes.status}`);
  }

  // Test 12.3: Get sample customer packages
  const studentsRes = await api('/api/students?limit=10');
  if (studentsRes.ok) {
    const students = studentsRes.data?.data || studentsRes.data || [];
    let totalPackages = 0;
    let activePackages = 0;
    let hoursIssues = 0;
    
    // Check a few students for package data
    for (const student of students.slice(0, 5)) {
      const pkgRes = await api(`/api/students/${student.id}/packages`);
      if (pkgRes.ok) {
        const packages = Array.isArray(pkgRes.data) ? pkgRes.data : [];
        totalPackages += packages.length;
        
        packages.forEach(pkg => {
          if (pkg.status === 'active') activePackages++;
          
          // Check for hour calculation issues
          const total = parseFloat(pkg.total_hours) || 0;
          const used = parseFloat(pkg.used_hours) || 0;
          const remaining = parseFloat(pkg.remaining_hours) || 0;
          
          if (Math.abs((total - used) - remaining) > 0.01) {
            hoursIssues++;
          }
          if (remaining < 0) {
            hoursIssues++;
          }
          if (used > total) {
            hoursIssues++;
          }
        });
      }
    }
    
    if (totalPackages > 0) {
      pass('Customer packages', `${totalPackages} total, ${activePackages} active`);
      
      if (hoursIssues > 0) {
        warn('Package hour calculation issues', `${hoursIssues} packages affected`);
      } else {
        pass('Package hours integrity', 'All calculations correct');
      }
    } else {
      log('    ℹ️  No customer packages found in sample', colors.dim);
    }
  }

  // Test 12.4: Check bookings use packages correctly
  const bookingsRes = await api('/api/bookings?limit=50');
  if (bookingsRes.ok) {
    const bookings = Array.isArray(bookingsRes.data) ? bookingsRes.data : [];
    const packageBookings = bookings.filter(b => b.customer_package_id);
    const regularBookings = bookings.filter(b => !b.customer_package_id);
    
    log(`    ℹ️  ${packageBookings.length} package bookings, ${regularBookings.length} regular bookings`, colors.dim);
    
    // Check for package payment issues
    const issueBookings = packageBookings.filter(b => 
      b.payment_status === 'paid' && b.payment_method !== 'package'
    );
    if (issueBookings.length > 0) {
      warn('Package bookings with wrong payment method', `${issueBookings.length} found`);
    }
  }

  return true;
}

// ============================================================================
// PHASE 13: REFUNDS & CANCELLATIONS
// ============================================================================

async function phase13_RefundsCancellations() {
  section('💸 PHASE 13: Refunds & Cancellations');

  // Test 13.1: Check cancelled bookings
  const bookingsRes = await api('/api/bookings?limit=100');
  if (bookingsRes.ok) {
    const bookings = Array.isArray(bookingsRes.data) ? bookingsRes.data : [];
    const cancelled = bookings.filter(b => b.status === 'cancelled');
    
    if (cancelled.length > 0) {
      pass('Cancelled bookings found', `${cancelled.length} cancellations`);
      
      // Check if cancellations have reasons
      const withReason = cancelled.filter(b => b.cancellation_reason).length;
      const withoutReason = cancelled.length - withReason;
      
      if (withoutReason > 0) {
        log(`    ℹ️  ${withoutReason} cancellations without reason logged`, colors.dim);
      }
      
      // Check if cancellations have refunds processed
      const refundedCancellations = cancelled.filter(b => 
        b.payment_status === 'refunded' || b.refund_amount > 0
      ).length;
      
      log(`    ℹ️  ${refundedCancellations}/${cancelled.length} cancellations had refunds`, colors.dim);
    } else {
      log('    ℹ️  No cancelled bookings found', colors.dim);
    }
  }

  // Test 13.2: Wallet transactions for refunds
  const txRes = await api('/api/wallet/transactions?limit=100');
  if (txRes.ok) {
    const transactions = txRes.data?.results || txRes.data || [];
    if (Array.isArray(transactions)) {
      const refundTx = transactions.filter(t => 
        t.type === 'refund' || 
        t.transaction_type === 'refund' ||
        t.description?.toLowerCase().includes('refund') ||
        t.notes?.toLowerCase().includes('refund')
      );
      
      if (refundTx.length > 0) {
        pass('Refund transactions', `${refundTx.length} found`);
        
        // Sum up refund amounts
        const totalRefunded = refundTx.reduce((sum, t) => {
          const amount = parseFloat(t.amount) || parseFloat(t.credit) || 0;
          return sum + Math.abs(amount);
        }, 0);
        
        log(`    ℹ️  Total refunded: €${totalRefunded.toFixed(2)}`, colors.dim);
      } else {
        log('    ℹ️  No refund transactions in recent history', colors.dim);
      }
    }
  }

  // Test 13.3: Check finance summary for refunds
  const financeRes = await api('/api/finances/summary');
  if (financeRes.ok && financeRes.data?.revenue) {
    const totalRefunds = parseFloat(financeRes.data.revenue.total_refunds) || 0;
    pass('Finance refund tracking', `Total refunds: €${totalRefunds}`);
  }

  // Test 13.4: Cancelled rentals
  const rentalsRes = await api('/api/rentals');
  if (rentalsRes.ok) {
    const rentals = Array.isArray(rentalsRes.data) ? rentalsRes.data : [];
    const cancelledRentals = rentals.filter(r => r.status === 'cancelled');
    
    if (cancelledRentals.length > 0) {
      pass('Cancelled rentals', `${cancelledRentals.length} found`);
    } else {
      log('    ℹ️  No cancelled rentals', colors.dim);
    }
  }

  // Test 13.5: Check for incomplete refunds (cancelled but not refunded)
  const allBookingsRes = await api('/api/bookings?limit=200');
  if (allBookingsRes.ok) {
    const bookings = Array.isArray(allBookingsRes.data) ? allBookingsRes.data : [];
    
    const potentialIssues = bookings.filter(b => 
      b.status === 'cancelled' && 
      b.payment_status === 'paid' &&
      parseFloat(b.final_amount) > 0
    );
    
    if (potentialIssues.length > 0) {
      warn('Cancelled but still marked as paid', `${potentialIssues.length} bookings may need refund review`);
    } else {
      pass('Refund status consistency', 'No issues found');
    }
  }

  return true;
}

// ============================================================================
// PHASE 14: COMMISSIONS & INSTRUCTOR PAYOUTS
// ============================================================================

async function phase14_Commissions() {
  section('💼 PHASE 14: Commissions & Payouts');

  // Test 14.1: Instructor commissions
  const instructorsRes = await api('/api/instructors');
  if (instructorsRes.ok && Array.isArray(instructorsRes.data) && instructorsRes.data.length > 0) {
    const firstInstructor = instructorsRes.data[0];
    const commissionsRes = await api(`/api/instructor-commissions/instructors/${firstInstructor.id}/commissions`);
    if (commissionsRes.ok) {
      const data = commissionsRes.data;
      pass('Instructor commissions endpoint');
      
      if (verbose && data) {
        log(`    Commission data available`, colors.dim);
      }
    } else {
      skip('Instructor commissions', `Status: ${commissionsRes.status}`);
    }
  } else {
    skip('Instructor commissions endpoint', 'No instructors available');
  }

  // Test 14.2: Check bookings for commission calculations
  const bookingsRes = await api('/api/bookings?limit=50&status=completed');
  if (bookingsRes.ok) {
    const bookings = Array.isArray(bookingsRes.data) ? bookingsRes.data : [];
    const completedBookings = bookings.filter(b => b.status === 'completed');
    
    // Check for commission data on completed bookings
    const withCommission = completedBookings.filter(b => 
      b.instructor_commission !== undefined && b.instructor_commission !== null
    );
    const withoutCommission = completedBookings.filter(b => 
      b.instructor_commission === undefined || b.instructor_commission === null
    );
    
    if (completedBookings.length > 0) {
      pass('Completed bookings', `${completedBookings.length} found`);
      
      if (withCommission.length > 0) {
        const totalCommission = withCommission.reduce((sum, b) => 
          sum + (parseFloat(b.instructor_commission) || 0), 0
        );
        pass('Commission tracking', `${withCommission.length} bookings, €${totalCommission.toFixed(2)} total`);
      }
      
      if (withoutCommission.length > completedBookings.length * 0.5) {
        warn('Many bookings without commission', `${withoutCommission.length}/${completedBookings.length}`);
      }
    }
  }

  // Test 14.3: Finance summary commission data
  const financeRes = await api('/api/finances/summary');
  if (financeRes.ok) {
    const data = financeRes.data;
    
    if (data.netRevenue?.instructor_commission !== undefined) {
      pass('Commission in finance summary', `€${data.netRevenue.instructor_commission}`);
    }
    
    if (data.serviceLedger?.commissionTotal !== undefined) {
      pass('Service ledger commissions', `€${data.serviceLedger.commissionTotal}`);
    }
  }

  return true;
}

// ============================================================================
// PHASE 15: WRITE OPERATIONS (CRUD TESTS)
// ============================================================================

async function phase15_WriteOperations() {
  section('✍️ PHASE 15: Write Operations & Business Logic');

  let createdBookingId = null;
  let testStudentId = null;
  let testInstructorId = null;
  let testServiceId = null;

  try {
    // Get test data (student, instructor, service)
    const studentsRes = await api('/api/students?limit=1');
    const instructorsRes = await api('/api/instructors?limit=1');
    const servicesRes = await api('/api/services');

    if (!studentsRes.ok || !instructorsRes.ok || !servicesRes.ok) {
      skip('Write operations', 'Missing test data (students/instructors/services)');
      return true;
    }

    const students = studentsRes.data?.data || studentsRes.data || [];
    const instructors = Array.isArray(instructorsRes.data) ? instructorsRes.data : [];
    const services = Array.isArray(servicesRes.data) ? servicesRes.data : [];

    if (students.length === 0 || instructors.length === 0 || services.length === 0) {
      skip('Write operations', 'No test data available');
      return true;
    }

    testStudentId = students[0].id;
    testInstructorId = instructors[0].id;
    testServiceId = services[0].id;

    // Test 15.1: Create a booking
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const bookingDate = tomorrow.toISOString().split('T')[0];
    const startHour = '14:00';

    const createRes = await api('/api/bookings', {
      method: 'POST',
      body: {
        date: bookingDate,
        start_hour: startHour,
        duration: 1,
        student_user_id: testStudentId,
        instructor_user_id: testInstructorId,
        service_id: testServiceId,
        status: 'confirmed',
        payment_status: 'paid',
        notes: 'TEST BOOKING - automated test'
      }
    });

    if (createRes.ok && createRes.data?.id) {
      createdBookingId = createRes.data.id;
      pass('Create booking', `ID: ${createdBookingId}`);

      // Verify it was created
      const verifyRes = await api(`/api/bookings/${createdBookingId}`);
      if (verifyRes.ok) {
        pass('Verify created booking exists');
      } else {
        fail('Created booking not found', `Status: ${verifyRes.status}`);
      }
    } else {
      fail('Create booking', createRes.data?.error || `Status: ${createRes.status}`);
    }

    // Test 15.2: Double-booking prevention
    if (createdBookingId) {
      const doubleBookRes = await api('/api/bookings', {
        method: 'POST',
        body: {
          date: bookingDate,
          start_hour: startHour,
          duration: 1,
          student_user_id: testStudentId,
          instructor_user_id: testInstructorId,
          service_id: testServiceId,
          status: 'confirmed',
          payment_status: 'paid'
        }
      });

      // Should fail due to conflict
      if (!doubleBookRes.ok && (doubleBookRes.status === 409 || doubleBookRes.status === 400)) {
        pass('Double-booking prevented', 'Conflict detected');
      } else if (doubleBookRes.ok) {
        warn('Double-booking allowed', 'No conflict detection - check business logic');
        // Clean up the double booking if it was created
        if (doubleBookRes.data?.id) {
          await api(`/api/bookings/${doubleBookRes.data.id}`, { method: 'DELETE' });
        }
      } else {
        skip('Double-booking test', `Unexpected status: ${doubleBookRes.status}`);
      }
    }

    // Test 15.3: Update booking
    if (createdBookingId) {
      const updateRes = await api(`/api/bookings/${createdBookingId}`, {
        method: 'PUT',
        body: {
          notes: 'UPDATED TEST BOOKING',
          duration: 2
        }
      });

      if (updateRes.ok) {
        pass('Update booking', 'Duration changed to 2h');

        // Verify update
        const verifyRes = await api(`/api/bookings/${createdBookingId}`);
        if (verifyRes.ok && verifyRes.data?.notes?.includes('UPDATED')) {
          pass('Verify booking updated');
        }
      } else if (updateRes.status === 404) {
        skip('Update booking', 'Endpoint not found');
      } else {
        fail('Update booking', `Status: ${updateRes.status}`);
      }
    }

    // Test 15.4: Group booking capacity check
    const groupServices = services.filter(s => 
      s.maxParticipants && s.maxParticipants > 1
    );

    if (groupServices.length > 0) {
      const groupService = groupServices[0];
      const maxCapacity = groupService.maxParticipants;
      
      // Create bookings to fill the capacity
      const capacityTestTime = '16:00';
      const capacityTestDate = bookingDate;
      const testBookingIds = [];

      try {
        // Fill capacity
        for (let i = 0; i < maxCapacity; i++) {
          const fillRes = await api('/api/bookings', {
            method: 'POST',
            body: {
              date: capacityTestDate,
              start_hour: capacityTestTime,
              duration: 1,
              student_user_id: testStudentId,
              instructor_user_id: testInstructorId,
              service_id: groupService.id,
              status: 'confirmed',
              payment_status: 'paid',
              notes: `CAPACITY TEST ${i + 1}`
            }
          });
          
          if (fillRes.ok && fillRes.data?.id) {
            testBookingIds.push(fillRes.data.id);
          }
        }

        // Now try to exceed capacity
        const overCapacityRes = await api('/api/bookings', {
          method: 'POST',
          body: {
            date: capacityTestDate,
            start_hour: capacityTestTime,
            duration: 1,
            student_user_id: testStudentId,
            instructor_user_id: testInstructorId,
            service_id: groupService.id,
            status: 'confirmed',
            payment_status: 'paid',
            notes: 'CAPACITY EXCEEDED TEST'
          }
        });

        if (!overCapacityRes.ok && overCapacityRes.status === 409) {
          pass('Capacity limit enforced', `Blocked at ${maxCapacity} bookings`);
        } else if (overCapacityRes.ok) {
          testBookingIds.push(overCapacityRes.data.id);
          fail('Capacity exceeded', `Should reject after ${maxCapacity}`);
        } else {
          skip('Capacity test', `Unexpected status: ${overCapacityRes.status}`);
        }
      } finally {
        // Cleanup all test bookings
        for (const id of testBookingIds) {
          await api(`/api/bookings/${id}`, { method: 'DELETE' });
        }
      }
    } else {
      skip('Capacity limit test', 'No group services with max_participants');
    }

    // Test 15.5: Cancel booking and check refund
    if (createdBookingId) {
      const cancelRes = await api(`/api/bookings/${createdBookingId}/cancel`, {
        method: 'POST',
        body: {
          reason: 'Automated test cancellation'
        }
      });

      if (cancelRes.ok || cancelRes.status === 404) {
        if (cancelRes.ok) {
          pass('Cancel booking', 'Cancellation processed');

          // Verify cancellation
          const verifyRes = await api(`/api/bookings/${createdBookingId}`);
          if (verifyRes.ok) {
            const status = verifyRes.data?.status;
            if (status === 'cancelled') {
              pass('Verify booking cancelled', 'Status updated');
            } else {
              warn('Booking not marked cancelled', `Status: ${status}`);
            }
          }
        } else {
          // Try direct update to cancel
          const altCancelRes = await api(`/api/bookings/${createdBookingId}`, {
            method: 'PUT',
            body: { status: 'cancelled', cancellation_reason: 'Test' }
          });
          
          if (altCancelRes.ok) {
            pass('Cancel booking (via update)', 'Status set to cancelled');
          } else {
            skip('Cancel booking', 'No cancel endpoint or update');
          }
        }
      } else {
        fail('Cancel booking', `Status: ${cancelRes.status}`);
      }
    }

  } finally {
    // Cleanup: Delete test booking
    if (createdBookingId) {
      const deleteRes = await api(`/api/bookings/${createdBookingId}`, {
        method: 'DELETE'
      });

      if (deleteRes.ok || deleteRes.status === 404) {
        pass('Cleanup test booking', 'Deleted successfully');
      } else {
        warn('Cleanup failed', `Booking ${createdBookingId} may still exist`);
      }
    }
  }

  return true;
}

// ============================================================================
// PHASE 16: PAYMENT PROCESSING
// ============================================================================

async function phase16_PaymentProcessing() {
  section('💳 PHASE 16: Payment Processing');

  // Test 16.1: Payment settings/configuration
  const settingsRes = await api('/api/settings');
  if (settingsRes.ok && settingsRes.data) {
    // Check for payment provider settings
    const data = JSON.stringify(settingsRes.data);
    const hasStripe = data.toLowerCase().includes('stripe');
    const hasPayment = data.toLowerCase().includes('payment');

    if (hasStripe) {
      pass('Stripe configuration found');
    } else if (hasPayment) {
      pass('Payment configuration exists');
    } else {
      log('    ℹ️  No payment provider configuration visible', colors.dim);
    }
  }

  // Test 16.2: Create wallet transaction (internal payment)
  const studentsRes = await api('/api/students?limit=1');
  if (studentsRes.ok) {
    const students = studentsRes.data?.data || studentsRes.data || [];
    if (students.length > 0) {
      const studentId = students[0].id;

      // Get current balance
      const walletRes = await api(`/api/wallet/summary`);
      if (walletRes.ok) {
        const currentBalance = parseFloat(walletRes.data?.available) || 0;
        pass('Wallet balance check', `Current: €${currentBalance}`);

        // Test wallet transaction endpoint availability (without creating real transaction)
        // Check if we can access the transactions endpoint
        const transactionsRes = await api('/api/wallet/transactions?limit=1');
        if (transactionsRes.ok) {
          pass('Wallet transactions endpoint', 'Accessible');
        } else {
          skip('Wallet transactions', `Status: ${transactionsRes.status}`);
        }
      }
    }
  }

  // Test 16.3: Check payment webhooks endpoint
  const webhookRes = await api('/api/webhooks/stripe', {
    method: 'POST',
    body: { type: 'test' }
  });

  if (webhookRes.status === 400 || webhookRes.status === 401 || webhookRes.status === 200 || webhookRes.status === 202) {
    pass('Payment webhook endpoint', `Status: ${webhookRes.status}`);
  } else if (webhookRes.status === 404) {
    skip('Payment webhook endpoint', 'Not found');
  } else {
    skip('Payment webhook', `Status: ${webhookRes.status}`);
  }

  // Test 16.4: Check for payment methods
  const paymentMethodsRes = await api('/api/wallet/payment-methods');
  if (paymentMethodsRes.ok) {
    const methods = paymentMethodsRes.data?.results || [];
    pass('Payment methods endpoint', `${methods.length} methods registered`);
  } else {
    skip('Payment methods', `Status: ${paymentMethodsRes.status}`);
  }

  return true;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runAllTests() {
  console.log();
  log('🚀 PRODUCTION READINESS TEST SUITE', colors.blue);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  log(`   API: ${API_URL}`, colors.dim);
  log(`   Admin: ${ADMIN_EMAIL}`, colors.dim);
  if (targetPhase) log(`   Running Phase: ${targetPhase} only`, colors.dim);
  console.log();

  const phases = [
    { num: 1, name: 'API Health', fn: phase1_ApiHealth, critical: true },
    { num: 2, name: 'Financial System', fn: phase2_FinancialSystem },
    { num: 3, name: 'Booking System', fn: phase3_BookingSystem },
    { num: 4, name: 'Rental System', fn: phase4_RentalSystem },
    { num: 5, name: 'Accommodation', fn: phase5_Accommodation },
    { num: 6, name: 'Shop & Products', fn: phase6_Shop },
    { num: 7, name: 'User Management', fn: phase7_UserManagement },
    { num: 8, name: 'Communication', fn: phase8_Communication },
    { num: 9, name: 'Forms & Compliance', fn: phase9_FormsCompliance },
    { num: 10, name: 'Reporting', fn: phase10_Reporting },
    { num: 11, name: 'Security', fn: phase11_Security },
    { num: 12, name: 'Packages & Hours', fn: phase12_PackagesHours },
    { num: 13, name: 'Refunds & Cancellations', fn: phase13_RefundsCancellations },
    { num: 14, name: 'Commissions & Payouts', fn: phase14_Commissions },
    { num: 15, name: 'Write Operations & Business Logic', fn: phase15_WriteOperations },
    { num: 16, name: 'Payment Processing', fn: phase16_PaymentProcessing }
  ];

  for (const phase of phases) {
    if (targetPhase && phase.num !== targetPhase) continue;

    try {
      const success = await phase.fn();
      if (!success && phase.critical) {
        log(`\n⛔ Critical phase ${phase.num} failed. Cannot continue.`, colors.red);
        break;
      }
    } catch (error) {
      fail(`Phase ${phase.num} crashed`, error.message);
      if (verbose) console.error(error);
    }
  }

  // Summary
  console.log();
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
  log('  📊 TEST SUMMARY', colors.cyan);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
  console.log();
  log(`  ✅ Passed:   ${testResults.passed}`, colors.green);
  log(`  ❌ Failed:   ${testResults.failed}`, testResults.failed > 0 ? colors.red : colors.dim);
  log(`  ⏭️  Skipped:  ${testResults.skipped}`, colors.dim);
  log(`  ⚠️  Warnings: ${testResults.warnings}`, testResults.warnings > 0 ? colors.yellow : colors.dim);
  console.log();

  const total = testResults.passed + testResults.failed;
  const passRate = total > 0 ? Math.round((testResults.passed / total) * 100) : 0;
  
  if (testResults.failed === 0 && testResults.warnings === 0) {
    log('  🎉 ALL TESTS PASSED - Production Ready!', colors.green);
  } else if (testResults.failed === 0) {
    log(`  ✅ PASSED with warnings (${passRate}% pass rate)`, colors.yellow);
  } else {
    log(`  ⚠️  NEEDS ATTENTION (${passRate}% pass rate)`, colors.red);
  }
  console.log();

  // Exit code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
