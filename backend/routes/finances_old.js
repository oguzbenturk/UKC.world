import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from '../routes/auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { validateAndCorrectFinancialData } from '../utils/financialValidation.js';

const router = express.Router();

/**
 * @route GET /api/finances/accounts/:id
 * @desc Get user balance and financial data
 * @access Private
 */
router.get('/accounts/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate and correct financial data before returning (production safeguard)
    try {
      await validateAndCorrectFinancialData(pool, id);
    } catch (validationError) {
      console.warn('Financial validation failed, proceeding with existing data:', validationError.message);
    }
    
    // Get user account information including financial data
    const accountResult = await pool.query(
      `SELECT 
        u.id, u.name, u.email, u.role_id, r.name as role_name,
        u.balance, u.total_spent, u.last_payment_date, u.account_status,
        u.package_hours, u.remaining_hours,
        u.created_at, u.updated_at
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: 'User account not found' });
    }
    
    // Get customer packages to include in balance calculation
    const packagesResult = await pool.query(
      `SELECT 
        id, package_name, total_hours, used_hours, remaining_hours, 
        purchase_price, currency, purchase_date, expiry_date, status
       FROM customer_packages
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    
    // Get all active bookings for this customer (excluding cancelled ones)
    const bookingsResult = await pool.query(
      `SELECT b.*, u.name as instructor_name, s.price as service_price
       FROM bookings b
       LEFT JOIN users u ON b.instructor_user_id = u.id
       LEFT JOIN services s ON b.service_id = s.id
       WHERE b.student_user_id = $1 
       AND (b.status IS NULL OR b.status != 'cancelled')
       ORDER BY b.date ASC, b.start_hour ASC`,
      [id]
    );
    
    // Get financial events for deleted bookings to include in balance calculation
    const deletedBookingsResult = await pool.query(
      `SELECT * FROM financial_events 
       WHERE user_id = $1 
       AND event_type = 'booking_deleted' 
       AND entity_type = 'booking'
       ORDER BY created_at ASC`,
      [id]
    );
    
    const account = accountResult.rows[0];
    const cashBalance = parseFloat(account.balance) || 0;
    
    // STEP 1: Calculate package hour usage and individual lesson charges
    let totalPackageHoursAvailable = 0;
    let totalPackageValue = 0;
    let activePackageValue = 0;
    let packageHoursUsed = 0;
    
    // Calculate total package hours available and values
    packagesResult.rows.forEach(pkg => {
      const price = parseFloat(pkg.purchase_price) || 0;
      totalPackageValue += price;
      
      if (pkg.status === 'active') {
        const remainingHours = parseFloat(pkg.remaining_hours) || 0;
        totalPackageHoursAvailable += remainingHours;
        
        const totalHours = parseFloat(pkg.total_hours) || 0;
        if (totalHours > 0) {
          activePackageValue += (remainingHours / totalHours) * price;
        }
      }
    });
    
    // STEP 2: Process bookings chronologically to determine package vs individual charges
    let unpaidIndividualBookings = 0;
    let remainingPackageHours = totalPackageHoursAvailable;
    
    // Combine existing bookings with deleted bookings for complete calculation
    const allBookingEvents = [
      ...bookingsResult.rows.map(booking => ({
        type: 'existing_booking',
        data: booking,
        date: booking.date,
        start_hour: booking.start_hour,
        duration: parseFloat(booking.duration) || 1,
        amount: parseFloat(booking.final_amount || booking.amount) || 0,
        status: booking.status
      })),
      ...deletedBookingsResult.rows.map(event => {
        const bookingData = event.metadata?.deleted_booking || {};
        return {
          type: 'deleted_booking',
          data: event,
          date: bookingData.date,
          start_hour: bookingData.start_hour,
          duration: parseFloat(bookingData.duration) || 1,
          amount: parseFloat(event.amount) || 0,
          status: 'deleted'
        };
      })
    ].sort((a, b) => {
      // Sort by date, then by start_hour
      if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
      return parseFloat(a.start_hour) - parseFloat(b.start_hour);
    });
    
    for (const bookingEvent of allBookingEvents) {
      const bookingHours = bookingEvent.duration;
      const bookingAmount = bookingEvent.amount;
      
      // Skip cancelled bookings from balance calculation (they don't contribute to debt)
      if (bookingEvent.status === 'cancelled') {
        continue;
      }
      
      // Process all other bookings (confirmed, completed, pending, deleted) for debt calculation
      
      if (remainingPackageHours >= bookingHours) {
        // Booking can be covered by package hours
        remainingPackageHours -= bookingHours;
        packageHoursUsed += bookingHours;
        // This booking is paid through the package, so don't add to unpaid individual bookings
      } else if (remainingPackageHours > 0) {
        // Partial package coverage
        const packageCoveredHours = remainingPackageHours;
        const individualHours = bookingHours - packageCoveredHours;
        
        packageHoursUsed += packageCoveredHours;
        remainingPackageHours = 0;
        
        // Calculate individual charge for uncovered hours
        const pricePerHour = bookingAmount / bookingHours;
        const individualCharge = individualHours * pricePerHour;
        unpaidIndividualBookings += individualCharge;
      } else {
        // No package hours available, entire booking is individual
        unpaidIndividualBookings += bookingAmount;
      }
    }
    
    // STEP 3: Calculate unpaid packages (packages are assigned on credit, creating debt)
    const unpaidPackages = packagesResult.rows.reduce((total, pkg) => {
      return total + (parseFloat(pkg.purchase_price) || 0);
    }, 0);
    
    // STEP 4: Get unpaid rentals to subtract from balance
    const unpaidRentalsResult = await pool.query(
      `SELECT SUM(total_price::decimal) as unpaid_amount
       FROM rentals 
       WHERE user_id = $1`,
      [id]
    );
    
    const unpaidRentals = parseFloat(unpaidRentalsResult.rows[0]?.unpaid_amount) || 0;
    
    // STEP 5: Calculate balance = cash - (unpaid packages + unpaid individual lessons + unpaid rentals)
    const totalUnpaidAmount = unpaidIndividualBookings + unpaidPackages + unpaidRentals;
    const actualCurrentBalance = cashBalance - totalUnpaidAmount;
    
    // STEP 6: Update package remaining hours based on actual usage
    const updatedPackages = packagesResult.rows.map(pkg => {
      if (pkg.status === 'active') {
        const originalRemaining = parseFloat(pkg.remaining_hours) || 0;
        const totalHours = parseFloat(pkg.total_hours) || 0;
        const usedHours = Math.max(0, totalHours - originalRemaining + packageHoursUsed);
        const newRemaining = Math.max(0, totalHours - usedHours);
        
        return {
          ...pkg,
          used_hours: usedHours,
          remaining_hours: newRemaining
        };
      }
      return pkg;
    });
    
    // Enhanced account object with correct calculations
    const enhancedAccount = {
      ...account,
      balance: actualCurrentBalance,
      cash_balance: cashBalance,
      unpaid_bookings: unpaidIndividualBookings,
      unpaid_packages: unpaidPackages,
      unpaid_rentals: unpaidRentals,
      package_value: activePackageValue,
      total_package_purchases: totalPackageValue,
      available_credits: actualCurrentBalance + activePackageValue,
      lifetime_value: parseFloat(account.total_spent) || 0,  // Only money actually paid
      package_hours_used: packageHoursUsed,
      package_hours_remaining: remainingPackageHours
    };
    
    // Get transactions for this user
    const transactionsResult = await pool.query(
      `SELECT * FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [id]
    );
    
    return res.status(200).json({
      account: enhancedAccount,
      packages: updatedPackages,
      transactions: transactionsResult.rows,
      bookings: bookingsResult.rows,
      deletedBookings: deletedBookingsResult.rows,
      financialSummary: {
        totalBookingEvents: allBookingEvents.length,
        existingBookings: bookingsResult.rows.length,
        deletedBookings: deletedBookingsResult.rows.length,
        packageHoursUsed: packageHoursUsed,
        unpaidIndividualAmount: unpaidIndividualBookings,
        unpaidPackageAmount: unpaidPackages,
        unpaidRentalAmount: unpaidRentals
      }
    });
  } catch (error) {
    console.error('Error fetching user account:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route GET /api/finances/student-accounts/:id (Legacy compatibility)
 * @desc Redirect to new accounts endpoint for backward compatibility
 * @access Private
 */
router.get('/student-accounts/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user account information including financial data
    const accountResult = await pool.query(
      `SELECT 
        u.id, u.name, u.email, u.role_id, r.name as role_name,
        u.balance, u.total_spent, u.last_payment_date, u.account_status,
        u.package_hours, u.remaining_hours,
        u.created_at, u.updated_at
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: 'User account not found' });
    }
    
    // Get transactions for this user
    const transactionsResult = await pool.query(
      `SELECT * FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [id]
    );
    
    // Get bookings for this user to show lesson history
    const bookingsResult = await pool.query(
      `SELECT b.*, u.name as instructor_name
       FROM bookings b
       LEFT JOIN users u ON b.instructor_user_id = u.id
       WHERE b.student_user_id = $1
       ORDER BY b.date DESC`,
      [id]
    );
    
    return res.status(200).json({
      account: accountResult.rows[0],
      transactions: transactionsResult.rows,
      bookings: bookingsResult.rows
    });
  } catch (error) {
    console.error('Error fetching user account (legacy):', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route POST /api/finances/accounts/:id/add-funds
 * @desc Add funds to user account
 * @access Private (Admin/Manager)
 */
router.post('/accounts/:id/add-funds', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { amount, description, paymentMethod, referenceNumber } = req.body;
    const userId = req.user.id; // From JWT auth middleware
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    await client.query('BEGIN');
    
    // Check if user exists
    const userResult = await client.query(
      `SELECT id, balance FROM users WHERE id = $1`,
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update user balance
    await client.query(
      `UPDATE users
       SET balance = COALESCE(balance, 0) + $1,
           total_spent = COALESCE(total_spent, 0) + $1,
           last_payment_date = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [amount, id]
    );
    
    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO transactions
         (user_id, amount, type, description, payment_method, 
          reference_number, created_by)
       VALUES ($1, $2, 'payment', $3, $4, $5, $6)
       RETURNING *`,
      [id, amount, description || 'Account deposit', paymentMethod, referenceNumber, userId]
    );
    
    await client.query('COMMIT');
    
    // Emit real-time event for transaction creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'transaction:created', transactionResult.rows[0]);
        req.socketService.emitToChannel('general', 'financial:summary_updated', { type: 'payment', action: 'created' });
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'financial', action: 'payment_added' });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    return res.status(201).json({
      message: 'Funds added successfully',
      transaction: transactionResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding funds:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/finances/student-accounts/:id/add-funds (Legacy compatibility)
 * @desc Redirect to new accounts endpoint for backward compatibility
 * @access Private
 */
router.post('/student-accounts/:id/add-funds', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  // Forward to the new accounts endpoint
  req.url = req.url.replace('/student-accounts/', '/accounts/');
  return router.handle(req, res);
});

/**
 * @route POST /api/finances/accounts/:id/process-refund
 * @desc Process a refund to a user's account
 * @access Private (Admin/Manager)
 */
router.post('/accounts/:id/process-refund', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { amount, description, bookingId, entityType } = req.body;
    const userId = req.user.id; // From JWT auth middleware
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    await client.query('BEGIN');
    
    // Update user balance
    await client.query(
      `UPDATE users
       SET balance = COALESCE(balance, 0) + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [amount, id]
    );
    
    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO transactions
         (user_id, amount, type, description, booking_id, entity_type, created_by)
       VALUES ($1, $2, 'refund', $3, $4, $5, $6)
       RETURNING *`,
      [id, amount, description || 'Refund', bookingId, entityType, userId]
    );
    
    await client.query('COMMIT');
    
    return res.status(201).json({
      message: 'Refund processed successfully',
      transaction: transactionResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing refund:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/finances/student-accounts/:id/process-refund (Legacy compatibility)
 * @desc Redirect to new accounts endpoint for backward compatibility
 * @access Private
 */
router.post('/student-accounts/:id/process-refund', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  // Forward to the new accounts endpoint
  req.url = req.url.replace('/student-accounts/', '/accounts/');
  return router.handle(req, res);
});

/**
 * @route POST /api/finances/accounts/:id/process-payment
 * @desc Process a payment from a user's account
 * @access Private (Admin/Manager)
 */
router.post('/accounts/:id/process-payment', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { amount, type, description, bookingId, entityType } = req.body;
    const userId = req.user.id; // From JWT auth middleware
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    await client.query('BEGIN');
    
    // Check current balance
    const userResult = await client.query(
      `SELECT balance FROM users WHERE id = $1`,
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentBalance = userResult.rows[0].balance || 0;
    
    if (currentBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    // Update user balance
    await client.query(
      `UPDATE users
       SET balance = COALESCE(balance, 0) - $1,
           updated_at = NOW()
       WHERE id = $2`,
      [amount, id]
    );
    
    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO transactions
         (user_id, amount, type, description, booking_id, entity_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, -amount, type || 'payment', description || 'Account payment', bookingId, entityType, userId]
    );
    
    await client.query('COMMIT');
    
    return res.status(201).json({
      message: 'Payment processed successfully',
      transaction: transactionResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing payment:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/finances/student-accounts/:id/process-payment (Legacy compatibility)
 * @desc Redirect to new accounts endpoint for backward compatibility
 * @access Private
 */
router.post('/student-accounts/:id/process-payment', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  // Forward to the new accounts endpoint
  req.url = req.url.replace('/student-accounts/', '/accounts/');
  return router.handle(req, res);
});

/**
 * @route GET /api/finances/instructor-earnings/:id
 * @desc Get instructor earnings data
 * @access Private
 */
router.get('/instructor-earnings/:id', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    // If user is an instructor, they should only be able to see their own earnings
    if (req.user.role === 'instructor' && req.user.id !== id) {
      return res.status(403).json({ error: 'Forbidden: You can only access your own earnings' });
    }
    
    let dateFilter = '';
    const queryParams = [id];
    
    if (startDate && endDate) {
      dateFilter = 'AND b.date BETWEEN $2 AND $3';
      queryParams.push(startDate, endDate);
    }
      // Get completed lessons and earnings
    const earningsResult = await pool.query(
      `SELECT 
         ie.*, 
         b.date as lesson_date, 
         b.duration as lesson_duration,
         b.final_amount as lesson_amount,
         b.amount as booking_amount,
         s.name as student_name,
         srv.name as service_name,
         b.status as booking_status
       FROM instructor_earnings ie
       JOIN bookings b ON ie.booking_id = b.id
       LEFT JOIN users s ON s.id = b.student_user_id
       LEFT JOIN services srv ON srv.id = b.service_id
       WHERE ie.instructor_id = $1 
       ${dateFilter}
       ORDER BY b.date DESC`,
      queryParams
    );

    // Also get lessons without commission records (for display purposes)
    const lessonsWithoutEarningsResult = await pool.query(
      `SELECT 
         b.id as booking_id,
         b.date as lesson_date, 
         b.duration as lesson_duration,
         b.final_amount as lesson_amount,
         b.amount as booking_amount,
         s.name as student_name,
         srv.name as service_name,
         b.status as booking_status,
         0 as commission_amount,
         0 as commission_rate,
         'missing' as commission_type
       FROM bookings b
       LEFT JOIN instructor_earnings ie ON ie.booking_id = b.id
       LEFT JOIN users s ON s.id = b.student_user_id
       LEFT JOIN services srv ON srv.id = b.service_id
       WHERE b.instructor_user_id = $1 
       AND b.status = 'completed'
       AND ie.id IS NULL
       ${dateFilter}
       ORDER BY b.date DESC`,
      queryParams
    );

    // Combine both results
    const allEarnings = [
      ...earningsResult.rows,
      ...lessonsWithoutEarningsResult.rows
    ].sort((a, b) => new Date(b.lesson_date) - new Date(a.lesson_date));
    
    // Get payroll info with proper column mapping for frontend
    const payrollResult = await pool.query(
      `SELECT 
         id,
         instructor_id,
         base_salary as amount,
         payment_date,
         payment_method,
         reference_number as reference,
         notes,
         status,
         created_at,
         updated_at
       FROM instructor_payroll
       WHERE instructor_id = $1
       ORDER BY payment_date DESC`,
      [id]
    );
    
    // Get instructor details including commission rate
    const instructorResult = await pool.query(
      `SELECT * FROM users WHERE id = $1 AND role_id IN 
       (SELECT id FROM roles WHERE name = 'instructor' OR name = 'freelancer')`,
      [id]
    );
    
    if (instructorResult.rows.length === 0) {
      return res.status(404).json({ message: 'Instructor not found' });
    }
    
    const payrolls = payrollResult.rows;
    const currentPayroll = payrolls.find(p => p.status === 'pending') || null;
    const payrollHistory = payrolls.filter(p => p.status !== 'pending');    return res.status(200).json({
      earnings: allEarnings,
      currentPayroll,
      payrollHistory,
      instructor: instructorResult.rows[0],
      missingSommissions: lessonsWithoutEarningsResult.rows.length
    });
  } catch (error) {
    console.error('Error fetching instructor earnings:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route POST /api/finances/instructor-payroll
 * @desc Generate instructor payroll for a period
 * @access Private (Admin/Manager)
 */
router.post('/instructor-payroll', authenticateJWT, authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { instructorId, periodStartDate, periodEndDate, baseSalary = 0, bonus = 0 } = req.body;
    
    // If user is an instructor, they should only be able to generate their own payroll
    // and shouldn't be able to set base salary or bonus
    if (req.user.role === 'instructor') {
      if (req.user.id !== instructorId) {
        return res.status(403).json({ error: 'Forbidden: You can only generate your own payroll' });
      }
      // Instructors can't set their own salary or bonus
      if (parseFloat(baseSalary) > 0 || parseFloat(bonus) > 0) {
        return res.status(403).json({ error: 'Forbidden: Instructors cannot set their own salary or bonus' });
      }
    }
    
    if (!instructorId || !periodStartDate || !periodEndDate) {
      return res.status(400).json({ 
        message: 'Instructor ID, start date and end date are required' 
      });
    }
    
    await client.query('BEGIN');
    
    // Check if payroll already exists for this period
    const existingPayroll = await client.query(
      `SELECT * FROM instructor_payroll
       WHERE instructor_id = $1
       AND period_start_date = $2
       AND period_end_date = $3`,
      [instructorId, periodStartDate, periodEndDate]
    );
    
    if (existingPayroll.rows.length > 0) {
      return res.status(400).json({ 
        message: 'Payroll for this period already exists',
        payroll: existingPayroll.rows[0]
      });
    }
    
    // Get all earnings for this period that aren't assigned to a payroll yet
    const earningsResult = await client.query(
      `SELECT ie.* 
       FROM instructor_earnings ie
       JOIN bookings b ON ie.booking_id = b.id
       WHERE ie.instructor_id = $1
       AND ie.payroll_id IS NULL
       AND b.date BETWEEN $2 AND $3
       AND b.status = 'completed'`,
      [instructorId, periodStartDate, periodEndDate]
    );
    
    // Calculate total commission from earnings
    const commission = earningsResult.rows.reduce(
      (sum, earning) => sum + parseFloat(earning.total_earnings), 
      0
    );
    
    // Calculate total amount including base salary and bonus
    const totalAmount = parseFloat(baseSalary) + parseFloat(commission) + parseFloat(bonus);
    
    // Create payroll record
    const payrollResult = await client.query(
      `INSERT INTO instructor_payroll
         (instructor_id, period_start_date, period_end_date, 
          base_salary, commission, bonus, deductions, total_amount, 
          payment_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'pending', $8)
       RETURNING *`,
      [
        instructorId, 
        periodStartDate, 
        periodEndDate, 
        baseSalary, 
        commission, 
        bonus, 
        totalAmount, 
        `Payroll for period ${periodStartDate} to ${periodEndDate}`
      ]
    );
    
    const payrollId = payrollResult.rows[0].id;
    
    // Assign payroll id to all included earnings
    if (earningsResult.rows.length > 0) {
      await client.query(
        `UPDATE instructor_earnings
         SET payroll_id = $1
         WHERE id = ANY($2)`,
        [
          payrollId,
          earningsResult.rows.map(e => e.id)
        ]
      );
    }
      await client.query('COMMIT');
    
    // Emit real-time event for payroll generation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'payroll:generated', payrollResult.rows[0]);
        req.socketService.emitToChannel('general', 'instructor:updated', { id: instructorId });
        req.socketService.emitToChannel('general', 'dashboard:refresh', { type: 'payroll', action: 'generated' });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    return res.status(201).json({
      message: 'Payroll generated successfully',
      payroll: payrollResult.rows[0],
      includedEarnings: earningsResult.rows.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generating instructor payroll:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/finances/instructor-payroll/:id/process
 * @desc Process (mark as paid) an instructor payroll
 * @access Private (Admin/Manager)
 */
router.post('/instructor-payroll/:id/process', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { paymentDate, paymentMethod, referenceNumber } = req.body;
    const userId = req.user.id; // From JWT auth middleware
    
    await client.query('BEGIN');
    
    // Get payroll record
    const payrollResult = await client.query(
      `SELECT * FROM instructor_payroll WHERE id = $1`,
      [id]
    );
    
    if (payrollResult.rows.length === 0) {
      return res.status(404).json({ message: 'Payroll record not found' });
    }
    
    const payroll = payrollResult.rows[0];
    
    if (payroll.status === 'paid') {
      return res.status(400).json({ message: 'Payroll has already been paid' });
    }
    
    // Update payroll status
    await client.query(
      `UPDATE instructor_payroll
       SET status = 'paid',
           payment_date = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [paymentDate || new Date(), id]
    );
    
    // Create transaction record for the payment
    await client.query(
      `INSERT INTO transactions
         (user_id, amount, type, description, payment_method, 
          reference_number, created_by, entity_type, entity_id)
       VALUES ($1, $2, 'expense', $3, $4, $5, $6, 'payroll', $7)
       RETURNING *`,
      [
        payroll.instructor_id, 
        payroll.total_amount, 
        `Payroll payment for period ${new Date(payroll.period_start_date).toLocaleDateString()} to ${new Date(payroll.period_end_date).toLocaleDateString()}`,
        paymentMethod,
        referenceNumber,
        userId,
        id
      ]
    );
    
    await client.query('COMMIT');
    
    res.status(200).json({ message: 'Payroll processed successfully' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing instructor payroll:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/finances/instructor-earnings/:id/backfill
 * @desc Backfill missing commission earnings for completed lessons
 * @access Private (Admin/Manager)
 */
router.post('/instructor-earnings/:id/backfill', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');
    
    // Get all completed bookings for this instructor that don't have earnings records
    const missingSResult = await client.query(
      `SELECT b.*
       FROM bookings b
       LEFT JOIN instructor_earnings ie ON ie.booking_id = b.id
       WHERE b.instructor_user_id = $1 
       AND b.status = 'completed'
       AND ie.id IS NULL
       AND b.final_amount > 0`,
      [id]
    );
    
    console.log(`Found ${missingSResult.rows.length} completed bookings without commission records for instructor ${id}`);
    
    let processedCount = 0;
    
    for (const booking of missingSResult.rows) {
      try {
        // Get commission rate (custom > service > default)
        let commissionType = 'percentage';
        let commissionValue = 30; // Default 30%
        
        // 1. Check for custom commission
        const customCommission = await client.query(
          'SELECT commission_type, commission_value FROM booking_custom_commissions WHERE booking_id = $1',
          [booking.id]
        );
        
        if (customCommission.rows.length > 0) {
          commissionType = customCommission.rows[0].commission_type;
          commissionValue = parseFloat(customCommission.rows[0].commission_value);
        } else {
          // 2. Check for service-specific commission
          const serviceCommission = await client.query(
            'SELECT commission_type, commission_value FROM instructor_service_commissions WHERE instructor_id = $1 AND service_id = $2',
            [booking.instructor_user_id, booking.service_id]
          );
          
          if (serviceCommission.rows.length > 0) {
            commissionType = serviceCommission.rows[0].commission_type;
            commissionValue = parseFloat(serviceCommission.rows[0].commission_value);
          } else {
            // 3. Fallback to default commission
            const defaultCommission = await client.query(
              'SELECT commission_type, commission_value FROM instructor_default_commissions WHERE instructor_id = $1',
              [booking.instructor_user_id]
            );
            
            if (defaultCommission.rows.length > 0) {
              commissionType = defaultCommission.rows[0].commission_type;
              commissionValue = parseFloat(defaultCommission.rows[0].commission_value);
            }
          }
        }
        
        // Calculate commission amount
        let commissionAmount = 0;
        const bookingAmount = parseFloat(booking.final_amount || booking.amount || 0);
        
        if (commissionType === 'percentage') {
          commissionAmount = (bookingAmount * commissionValue) / 100;
        } else if (commissionType === 'fixed_per_lesson') {
          commissionAmount = commissionValue;
        } else if (commissionType === 'fixed_per_hour') {
          commissionAmount = commissionValue * parseFloat(booking.duration || 1);
        }
          // Insert commission record
        if (commissionAmount > 0) {
          await client.query(
            `INSERT INTO instructor_earnings 
              (instructor_id, booking_id, service_id, commission_rate, total_earnings, lesson_amount, lesson_date, lesson_duration, base_rate)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              booking.instructor_user_id,
              booking.id,
              booking.service_id,
              commissionValue / 100, // Store as decimal
              commissionAmount,
              bookingAmount,
              booking.date,
              booking.duration || 2,
              0 // base_rate - not used but required
            ]
          );
          processedCount++;
        }
      } catch (bookingError) {
        console.error(`Error processing booking ${booking.id}:`, bookingError);
        // Continue with other bookings
      }
    }
    
    await client.query('COMMIT');
    
    res.status(200).json({
      message: `Successfully processed ${processedCount} missing commission records`,
      processedCount,
      totalFound: missingSResult.rows.length
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error backfilling instructor earnings:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * @route GET /api/finances/statistics
 * @desc Get financial statistics for the system or a specific user
 * @access Private
 */
router.get('/statistics', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { userId } = req.query;
    console.log('📊 Statistics request received for userId:', userId);
    
    if (userId) {
      // Get statistics for a specific user
      console.log('🔍 Fetching user statistics for:', userId);
      const userStats = await pool.query(
        `SELECT 
          COALESCE(sa.balance, 0) as balance,
          'active' as payment_status,
          COUNT(b.id) as total_bookings,
          COALESCE(SUM(b.amount), 0) as total_spent,
          MAX(b.date) as last_booking_date,
          (
            SELECT srv.name 
            FROM bookings b2 
            LEFT JOIN services srv ON b2.service_id = srv.id 
            WHERE b2.student_user_id = $1 
            ORDER BY b2.date DESC 
            LIMIT 1
          ) as last_used_service
        FROM users u
        LEFT JOIN student_accounts sa ON u.id = sa.user_id
        LEFT JOIN bookings b ON u.id = b.student_user_id
        WHERE u.id = $1
        GROUP BY u.id, sa.balance`,
        [userId]
      );
      
      console.log('📊 Query results:', userStats.rows);
      
      if (userStats.rows.length === 0) {
        console.log('❌ User not found:', userId);
        return res.status(404).json({ message: 'User not found' });
      }
      
      const result = userStats.rows[0];
      const response = {
        balance: parseFloat(result.balance) || 0,
        payment_status: result.payment_status || 'no_account',
        total_bookings: parseInt(result.total_bookings) || 0,
        total_spent: parseFloat(result.total_spent) || 0,
        last_booking_date: result.last_booking_date,
        last_used_service: result.last_used_service || 'N/A'
      };
      
      console.log('✅ Sending response:', response);
      return res.status(200).json(response);
    } else {
      // Get overall system statistics
      const systemStats = await pool.query(
        `SELECT 
          COUNT(DISTINCT sa.user_id) as total_customers,
          SUM(sa.balance) as total_balance,
          COUNT(DISTINCT b.id) as total_bookings,
          SUM(b.amount) as total_revenue
        FROM student_accounts sa
        LEFT JOIN bookings b ON sa.user_id = b.student_user_id`
      );
      
      return res.status(200).json(systemStats.rows[0]);
    }
  } catch (error) {
    console.error('❌ Error fetching financial statistics:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route POST /api/finances/bulk-statistics
 * @desc Get financial statistics for multiple users at once (BLAZING FAST bulk operation)
 * @access Private
 */
router.post('/bulk-statistics', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const startTime = performance.now();
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    if (userIds.length > 1000) { // Increased limit for better bulk performance
      return res.status(400).json({ error: 'Maximum 1000 users per bulk request' });
    }
    
    // Create placeholders for the IN clause
    const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
    
    // OPTIMIZED QUERY with correct column names
    const query = `
      SELECT 
        u.id as user_id,
        u.name,
        u.email,
        COALESCE(sa.balance, 0) as balance,
        COUNT(DISTINCT b.id) as total_bookings,
        COALESCE(SUM(CASE WHEN b.status = 'completed' THEN COALESCE(b.final_amount, b.amount, 0) ELSE 0 END), 0) as total_spent,
        COALESCE(MAX(b.date), null) as last_booking_date,
        COALESCE(
          (SELECT s.name 
           FROM bookings b2 
           JOIN services s ON b2.service_id = s.id 
           WHERE b2.student_user_id = u.id 
           ORDER BY b2.date DESC, b2.created_at DESC
           LIMIT 1), 
          'N/A'
        ) as last_used_service
      FROM users u
      LEFT JOIN student_accounts sa ON u.id = sa.user_id
      LEFT JOIN bookings b ON u.id = b.student_user_id
      WHERE u.id IN (${placeholders})
      GROUP BY u.id, u.name, u.email, sa.balance
      ORDER BY u.name`;
    
    const result = await pool.query(query, userIds);
    const queryTime = performance.now() - startTime;
    
    // ULTRA-FAST response formatting
    const statisticsMap = {};
    result.rows.forEach(row => {
      statisticsMap[row.user_id] = {
        balance: parseFloat(row.balance) || 0,
        totalBookings: parseInt(row.total_bookings) || 0,
        totalSpent: parseFloat(row.total_spent) || 0,
        lastBookingDate: row.last_booking_date,
        last_used_service: row.last_used_service
      };
    });
    
    // Ensure all requested users have an entry, even if no data found
    userIds.forEach(userId => {
      if (!statisticsMap[userId]) {
        statisticsMap[userId] = {
          balance: 0,
          totalBookings: 0,
          totalSpent: 0,
          lastBookingDate: null,
          last_used_service: 'N/A'
        };
      }
    });
    
    const totalTime = performance.now() - startTime;
    
    res.json({
      success: true,
      data: statisticsMap,
      count: userIds.length,
      processingTime: `${totalTime.toFixed(2)}ms`
    });
  } catch (error) {
    console.error('❌ Error fetching bulk financial statistics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch bulk financial statistics',
      details: error.message 
    });
  }
});

/**
 * @route POST /api/finances/bulk-bookings
 * @desc Get bookings for multiple users at once (BLAZING FAST bulk operation)
 * @access Private
 */
router.post('/bulk-bookings', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const startTime = performance.now();
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    
    if (userIds.length > 1000) { // Increased limit for better bulk performance
      return res.status(400).json({ error: 'Maximum 1000 users per bulk request' });
    }
    
    // Create placeholders for the IN clause
    const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
    
    // OPTIMIZED QUERY with correct column names
    const query = `
      SELECT 
        b.id,
        b.student_user_id,
        b.instructor_user_id,
        b.service_id,
        b.date,
        b.start_hour,
        b.duration,
        b.status,
        b.payment_status,
        b.amount,
        b.final_amount,
        b.created_at,
        b.updated_at,
        COALESCE(s.name, 'Unknown Service') as service_name,
        COALESCE(u.name, 'Unknown Instructor') as instructor_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN users u ON b.instructor_user_id = u.id
      WHERE b.student_user_id IN (${placeholders})
      ORDER BY b.student_user_id, b.date DESC, b.start_hour DESC`;
    
    const result = await pool.query(query, userIds);
    const queryTime = performance.now() - startTime;
    
    // ULTRA-FAST grouping by user ID
    const bookingsMap = {};
    userIds.forEach(userId => {
      bookingsMap[userId] = [];
    });
    
    result.rows.forEach(booking => {
      const userId = booking.student_user_id;
      if (bookingsMap[userId]) {
        bookingsMap[userId].push(booking);
      }
    });
    
    const totalTime = performance.now() - startTime;
    
    res.json({
      success: true,
      data: bookingsMap,
      count: userIds.length,
      totalBookings: result.rows.length,
      processingTime: `${totalTime.toFixed(2)}ms`
    });
  } catch (error) {
    console.error('❌ Error fetching bulk bookings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch bulk bookings',
      details: error.message 
    });
  }
});

/**
 * @route DELETE /api/finances/cleanup-unused-users
 * @desc Permanently delete users who have never made any bookings/lessons
 * @access Private (Admin only)
 */
router.delete('/cleanup-unused-users', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // First, find all users who have NO bookings (as students)
    const usersWithoutBookingsResult = await client.query(`
      SELECT u.id, u.name, u.email, u.created_at
      FROM users u
      LEFT JOIN bookings b ON u.id = b.student_user_id
      WHERE b.id IS NULL
      AND u.role_id IN (SELECT id FROM roles WHERE name IN ('student', 'customer'))
      ORDER BY u.created_at DESC
    `);
    
    const usersToDelete = usersWithoutBookingsResult.rows;
    
    if (usersToDelete.length === 0) {
      await client.query('ROLLBACK');
      return res.status(200).json({
        message: 'No unused users found to delete',
        deletedCount: 0,
        deletedUsers: []
      });
    }
    
    // Get the user IDs to delete
    const userIdsToDelete = usersToDelete.map(user => user.id);
    
    // Delete related records first (to avoid foreign key constraints)
    
    // 1. Delete accommodation bookings (if any)
    await client.query(`
      DELETE FROM accommodation_bookings 
      WHERE guest_id = ANY($1)
    `, [userIdsToDelete]);
    
    // 2. Delete student accounts (if any)
    await client.query(`
      DELETE FROM student_accounts 
      WHERE user_id = ANY($1)
    `, [userIdsToDelete]);
    
    // 3. Delete transactions (if any)
    await client.query(`
      DELETE FROM transactions 
      WHERE user_id = ANY($1)
    `, [userIdsToDelete]);
    
    // 4. Delete any instructor earnings (if any)
    await client.query(`
      DELETE FROM instructor_earnings 
      WHERE instructor_id = ANY($1)
    `, [userIdsToDelete]);
    
    // 5. Delete any instructor payroll records (if any)
    await client.query(`
      DELETE FROM instructor_payroll 
      WHERE instructor_id = ANY($1)
    `, [userIdsToDelete]);
    
    // 6. Delete any other user-related records
    // Add more DELETE statements here for other tables that reference users
    
    // Finally, delete the users themselves
    const deleteResult = await client.query(`
      DELETE FROM users 
      WHERE id = ANY($1)
      RETURNING id, name, email
    `, [userIdsToDelete]);
    
    await client.query('COMMIT');
    
    // Emit real-time event for user cleanup
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'users:cleanup', { 
          deletedCount: deleteResult.rows.length,
          action: 'cleanup_unused_users'
        });
        req.socketService.emitToChannel('general', 'dashboard:refresh', { 
          type: 'users', 
          action: 'cleanup' 
        });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.status(200).json({
      message: `Successfully deleted ${deleteResult.rows.length} unused users`,
      deletedCount: deleteResult.rows.length,
      deletedUsers: deleteResult.rows
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cleaning up unused users:', error);
    res.status(500).json({ 
      message: 'Server error during user cleanup',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

/**
 * @route GET /api/finances/transactions
 * @desc Get user transactions
 * @access Private
 */
router.get('/transactions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { userId, limit = 50, offset = 0 } = req.query;
    
    let query = `SELECT * FROM transactions`;
    let params = [];
    
    if (userId) {
      query += ` WHERE user_id = $1`;
      params.push(userId);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route POST /api/finances/transactions
 * @desc Create a new transaction
 * @access Private
 */
router.post('/transactions', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { userId, amount, type, description, bookingId, entityType } = req.body;
    
    // Validate required fields
    if (!userId || !amount || !type) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Missing required fields: userId, amount, type' });
    }
    
    // Validate amount
    if (amount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Amount must be greater than zero' });
    }
    
    // Validate payment type
    const validTypes = ['service_payment', 'rental_payment', 'charge', 'payment', 'refund', 'credit', 'booking_deleted_refund'];
    if (!validTypes.includes(type)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid transaction type' });
    }
    
    // Check if user exists
    const userCheck = await client.query('SELECT id, balance FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentBalance = parseFloat(userCheck.rows[0].balance) || 0;
    
    // Create the transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions (
        id, user_id, amount, type, description, booking_id, entity_type,
        transaction_date, currency, exchange_rate, status,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), 'EUR', 1.0, 'completed', NOW(), NOW()
      ) RETURNING *`,
      [userId, amount, type, description, bookingId, entityType]
    );
    
    // Update user balance based on transaction type
    let newBalance = currentBalance;
    
    if (type === 'charge' || type === 'service_payment' || type === 'rental_payment') {
      // Deduct from balance (charge)
      newBalance = currentBalance - parseFloat(amount);
    } else if (type === 'payment' || type === 'refund' || type === 'credit' || type === 'booking_deleted_refund') {
      // Add to balance (payment/refund/credit)
      newBalance = currentBalance + parseFloat(amount);
    }
    
    // Update user balance and total_spent
    const updateFields = ['balance = $1'];
    const updateValues = [newBalance];
    
    if (type === 'payment' || type === 'credit') {
      updateFields.push('total_spent = total_spent + $2', 'last_payment_date = NOW()');
      updateValues.push(amount);
    }
    
    const updateQuery = `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${updateValues.length + 1} RETURNING balance, total_spent`;
    updateValues.push(userId);
    
    const userUpdateResult = await client.query(updateQuery, updateValues);
    
    await client.query('COMMIT');
    
    const response = {
      transaction: transactionResult.rows[0],
      user: {
        id: userId,
        balance: userUpdateResult.rows[0].balance,
        total_spent: userUpdateResult.rows[0].total_spent
      }
    };
    
    console.log(`Transaction created successfully:`, response.transaction.id);
    return res.status(201).json(response);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating transaction:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * @route GET /api/finances/transactions/:id
 * @desc Get a specific transaction by ID
 * @access Private
 */
router.get('/transactions/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('SELECT * FROM transactions WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route PUT /api/finances/transactions/:id
 * @desc Update a specific transaction
 * @access Private
 */
router.put('/transactions/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { description, status, payment_method } = req.body;
    
    // Check if transaction exists
    const transactionCheck = await client.query('SELECT * FROM transactions WHERE id = $1', [id]);
    if (transactionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    const currentTransaction = transactionCheck.rows[0];
    
    // Prepare update fields
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    if (description !== undefined) {
      updateFields.push(`description = $${paramCount}`);
      updateValues.push(description);
      paramCount++;
    }
    
    if (status !== undefined) {
      const validStatuses = ['pending', 'completed', 'failed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid status' });
      }
      updateFields.push(`status = $${paramCount}`);
      updateValues.push(status);
      paramCount++;
    }
    
    if (payment_method !== undefined) {
      updateFields.push(`payment_method = $${paramCount}`);
      updateValues.push(payment_method);
      paramCount++;
    }
    
    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    
    // Add updated_at field
    updateFields.push(`updated_at = NOW()`);
    
    // Add transaction ID as last parameter
    updateValues.push(id);
    
    const updateQuery = `UPDATE transactions SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await client.query(updateQuery, updateValues);
    
    await client.query('COMMIT');
    
    console.log(`Transaction updated successfully: ${id}`);
    return res.status(200).json(result.rows[0]);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating transaction:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * @route DELETE /api/finances/transactions/:id
 * @desc Delete a specific transaction
 * @access Private
 */
router.delete('/transactions/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if transaction exists
    const transactionCheck = await client.query('SELECT * FROM transactions WHERE id = $1', [id]);
    if (transactionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    const transaction = transactionCheck.rows[0];
    const userId = transaction.user_id;
    const amount = parseFloat(transaction.amount);
    const type = transaction.type;
    
    // Get current user balance
    const userCheck = await pool.query('SELECT balance, total_spent FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentBalance = parseFloat(userCheck.rows[0].balance) || 0;
    const currentTotalSpent = parseFloat(userCheck.rows[0].total_spent) || 0;
    
    // Calculate balance adjustment (reverse the original transaction effect)
    let balanceAdjustment = 0;
    let totalSpentAdjustment = 0;
    
    if (type === 'payment' || type === 'credit' || type === 'refund' || type === 'booking_deleted_refund') {
      // These types added money, so removing them should subtract
      balanceAdjustment = -amount;
      if (type === 'refund' || type === 'booking_deleted_refund') {
        totalSpentAdjustment = amount; // Refund removal increases total spent back
      }
    } else {
      // These types (charge, service_payment, etc.) removed money, so removing them should add back
      balanceAdjustment = amount;
      totalSpentAdjustment = -amount; // Charge removal decreases total spent
    }
    
    const newBalance = currentBalance + balanceAdjustment;
    const newTotalSpent = Math.max(0, currentTotalSpent + totalSpentAdjustment);
    
    // Delete the transaction
    const deleteResult = await client.query('DELETE FROM transactions WHERE id = $1', [id]);
    
    // Update user balance
    await client.query(
      'UPDATE users SET balance = $1, total_spent = $2, updated_at = NOW() WHERE id = $3',
      [newBalance, newTotalSpent, userId]
    );
    
    await client.query('COMMIT');
    
    console.log(`Transaction deleted successfully: ${id}`);
    return res.status(200).json({ 
      message: 'Transaction deleted successfully',
      deletedTransaction: transaction,
      balanceAdjustment: balanceAdjustment,
      newBalance: newBalance,
      newTotalSpent: newTotalSpent
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting transaction:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

/**
 * @route PUT /api/finances/instructor-earnings/:instructorId/:bookingId/commission
 * @desc Update commission rate for a specific booking
 * @access Private - Admin and Manager only
 */
router.put('/instructor-earnings/:instructorId/:bookingId/commission', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructorId, bookingId } = req.params;
  const { commissionRate } = req.body;
  
  if (!commissionRate || isNaN(parseFloat(commissionRate))) {
    return res.status(400).json({ error: true, message: 'Valid commission rate is required' });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // First check if the earning record exists
    const checkResult = await client.query(
      `SELECT id, lesson_amount FROM instructor_earnings 
       WHERE instructor_id = $1 AND booking_id = $2`,
      [instructorId, bookingId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, message: 'Earning record not found' });
    }
    
    const earningId = checkResult.rows[0].id;
    const lessonAmount = checkResult.rows[0].lesson_amount;
    
    // Calculate new total earnings based on the new commission rate
    const newCommissionRate = parseFloat(commissionRate) / 100; // Convert percentage to decimal
    const newTotalEarnings = lessonAmount * newCommissionRate;
    
    // Update the earning record with the new commission rate and total earnings
    const updateResult = await client.query(
      `UPDATE instructor_earnings
       SET commission_rate = $1, 
           total_earnings = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newCommissionRate, newTotalEarnings, earningId]
    );
    
    await client.query('COMMIT');
    
    // Emit real-time event for earning update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'instructor:earning:updated', { instructorId, bookingId });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.json({
      message: 'Commission rate updated successfully',
      data: updateResult.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating commission rate:', err);
    res.status(500).json({ error: true, message: 'Failed to update commission rate' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/finances/instructor-payments
 * @desc Create a new instructor payment or deduction
 * @access Private - Admin and Manager only
 */
router.post('/instructor-payments', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { instructor_id, amount, payment_date, payment_method, reference, notes } = req.body;
  
  if (!instructor_id || !amount || !payment_date) {
    return res.status(400).json({ error: true, message: 'Instructor ID, amount, and payment date are required' });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if instructor exists
    const instructorCheck = await client.query(
      'SELECT id FROM users WHERE id = $1 AND role_id IN (SELECT id FROM roles WHERE name = $2)',
      [instructor_id, 'instructor']
    );
    
    if (instructorCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, message: 'Instructor not found' });
    }
    
    // Create a payment record using the instructor_payroll table
    // For individual payments, we'll use period_start_date and period_end_date as the same date
    const paymentResult = await client.query(
      `INSERT INTO instructor_payroll 
       (instructor_id, period_start_date, period_end_date, base_salary, payment_date, payment_method, reference_number, notes, status, created_at, updated_at)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [instructor_id, payment_date, amount, payment_date, payment_method || 'bank_transfer', reference || '', notes || '', 'completed']
    );
    
    await client.query('COMMIT');
    
    // Emit real-time event for payment creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'instructor:payment:created', { instructorId: instructor_id });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.status(201).json({
      message: 'Payment recorded successfully',
      data: paymentResult.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating instructor payment:', err);
    res.status(500).json({ error: true, message: 'Failed to record payment' });
  } finally {
    client.release();
  }
});

/**
 * @route PUT /api/finances/instructor-payments/:id
 * @desc Update an existing instructor payment
 * @access Private - Admin and Manager only
 */
router.put('/instructor-payments/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  const { amount, payment_date, payment_method, reference, notes } = req.body;
  
  if (!amount || !payment_date) {
    return res.status(400).json({ error: true, message: 'Amount and payment date are required' });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if payment exists
    const checkResult = await client.query(
      'SELECT id FROM instructor_payroll WHERE id = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, message: 'Payment record not found' });
    }
    
    // Update the payment record
    const updateResult = await client.query(
      `UPDATE instructor_payroll
       SET base_salary = $1, 
           payment_date = $2,
           payment_method = $3,
           reference_number = $4,
           notes = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [amount, payment_date, payment_method || 'bank_transfer', reference || '', notes || '', id]
    );
    
    await client.query('COMMIT');
    
    // Emit real-time event for payment update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'instructor:payment:updated', { paymentId: id });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.json({
      message: 'Payment updated successfully',
      data: updateResult.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating instructor payment:', err);
    res.status(500).json({ error: true, message: 'Failed to update payment' });
  } finally {
    client.release();
  }
});

/**
 * @route DELETE /api/finances/instructor-payments/:id
 * @desc Delete an instructor payment
 * @access Private - Admin and Manager only
 */
router.delete('/instructor-payments/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if payment exists and get instructor_id for event emission
    const checkResult = await client.query(
      'SELECT instructor_id FROM instructor_payroll WHERE id = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: true, message: 'Payment record not found' });
    }
    
    const instructorId = checkResult.rows[0].instructor_id;
    
    // Delete the payment record
    await client.query(
      'DELETE FROM instructor_payroll WHERE id = $1',
      [id]
    );
    
    await client.query('COMMIT');
    
    // Emit real-time event for payment deletion
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'instructor:payment:deleted', { instructorId, paymentId: id });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting instructor payment:', err);
    res.status(500).json({ error: true, message: 'Failed to delete payment' });
  } finally {
    client.release();
  }
});

/**
 * @route GET /api/finances/debug/instructor-earnings/:id
 * @desc Debug instructor earnings data for troubleshooting
 * @access Private (Admin/Manager)
 */
router.get('/debug/instructor-earnings/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get detailed earnings data for debugging
    const debugQuery = `
      SELECT 
          ie.id,
          ie.instructor_id,
          ie.booking_id,
          ie.lesson_amount as stored_lesson_amount,
          ie.total_earnings as stored_commission,
          ie.commission_rate,
          ie.lesson_duration as stored_duration,
          b.final_amount as booking_final_amount,
          b.amount as booking_amount,
          b.duration as booking_duration,
          (b.duration * 80) as expected_lesson_amount,
          (b.duration * 80 * ie.commission_rate) as expected_commission,
          b.date,
          s.name as student_name
      FROM instructor_earnings ie
      JOIN bookings b ON ie.booking_id = b.id
      LEFT JOIN users s ON s.id = b.student_user_id
      WHERE ie.instructor_id = $1
      ORDER BY b.date DESC`;
    
    const result = await pool.query(debugQuery, [id]);
    
    res.json({
      message: 'Debug data retrieved',
      data: result.rows,
      summary: {
        totalRecords: result.rows.length,
        issues: result.rows.filter(row => 
          Math.abs(parseFloat(row.stored_lesson_amount) - parseFloat(row.expected_lesson_amount)) > 0.01 ||
          Math.abs(parseFloat(row.stored_commission) - parseFloat(row.expected_commission)) > 0.01
        )
      }
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: 'Failed to retrieve debug data' });
  }
});

/**
 * @route POST /api/finances/fix/instructor-earnings/:id
 * @desc Fix instructor earnings data by recalculating lesson amounts and commissions
 * @access Private (Admin only)
 */
router.post('/fix/instructor-earnings/:id', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    
    // Get all earnings records for this instructor
    const earningsResult = await client.query(`
      SELECT 
        ie.id as earning_id,
        ie.booking_id,
        ie.lesson_amount as current_lesson_amount,
        ie.total_earnings as current_total_earnings,
        ie.commission_rate,
        b.duration,
        b.final_amount as booking_final_amount,
        b.amount as booking_amount
      FROM instructor_earnings ie
      JOIN bookings b ON ie.booking_id = b.id
      WHERE ie.instructor_id = $1
    `, [id]);
    
    const fixedRecords = [];
    const standardHourlyRate = 80; // €80/hour
    
    for (const record of earningsResult.rows) {
      const duration = parseFloat(record.duration || 2);
      const commissionRate = parseFloat(record.commission_rate || 0.5);
      
      // Calculate correct lesson amount based on duration * hourly rate
      const correctLessonAmount = duration * standardHourlyRate;
      
      // Calculate correct commission based on correct lesson amount
      const correctCommission = correctLessonAmount * commissionRate;
      
      // Update if values are different
      if (Math.abs(record.current_lesson_amount - correctLessonAmount) > 0.01 ||
          Math.abs(record.current_total_earnings - correctCommission) > 0.01) {
        
        await client.query(`
          UPDATE instructor_earnings 
          SET 
            lesson_amount = $1,
            total_earnings = $2,
            lesson_duration = $3,
            updated_at = NOW()
          WHERE id = $4
        `, [correctLessonAmount, correctCommission, duration, record.earning_id]);
        
        // Also update the booking final_amount if needed
        if (Math.abs(record.booking_final_amount - correctLessonAmount) > 0.01) {
          await client.query(`
            UPDATE bookings 
            SET final_amount = $1, updated_at = NOW()
            WHERE id = $2
          `, [correctLessonAmount, record.booking_id]);
        }
        
        fixedRecords.push({
          booking_id: record.booking_id,
          old_lesson_amount: record.current_lesson_amount,
          new_lesson_amount: correctLessonAmount,
          old_commission: record.current_total_earnings,
          new_commission: correctCommission,
          commission_rate: commissionRate
        });
      }
    }
    
    await client.query('COMMIT');
    
    // Emit real-time event for data update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'instructor:earnings:fixed', { instructorId: id });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.json({
      message: `Fixed ${fixedRecords.length} instructor earnings records`,
      fixedRecords,
      totalProcessed: earningsResult.rows.length
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error fixing instructor earnings:', error);
    res.status(500).json({ error: 'Failed to fix instructor earnings data' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/finances/fix/all-instructor-earnings
 * @desc Fix ALL instructor earnings data by recalculating lesson amounts and commissions
 * @access Private (Admin only)
 */
router.post('/fix/all-instructor-earnings', authenticateJWT, authorizeRoles(['admin']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get all earnings records that need fixing
    const earningsResult = await client.query(`
      SELECT 
        ie.id as earning_id,
        ie.instructor_id,
        ie.booking_id,
        ie.lesson_amount as current_lesson_amount,
        ie.total_earnings as current_total_earnings,
        ie.commission_rate,
        b.duration,
        b.final_amount as booking_final_amount,
        u.name as instructor_name
      FROM instructor_earnings ie
      JOIN bookings b ON ie.booking_id = b.id
      JOIN users u ON u.id = ie.instructor_id
      WHERE 
        ie.lesson_amount != (b.duration * 80)
        OR 
        ABS(ie.total_earnings - (b.duration * 80 * ie.commission_rate)) > 0.01
    `);
    
    const fixedRecords = [];
    const fixedInstructors = new Set();
    const standardHourlyRate = 80; // €80/hour
    
    for (const record of earningsResult.rows) {
      const duration = parseFloat(record.duration || 2);
      const commissionRate = parseFloat(record.commission_rate || 0.5);
      
      // Calculate correct lesson amount based on duration * hourly rate
      const correctLessonAmount = duration * standardHourlyRate;
      
      // Calculate correct commission based on correct lesson amount
      const correctCommission = correctLessonAmount * commissionRate;
      
      // Update instructor earnings record
      await client.query(`
        UPDATE instructor_earnings 
        SET 
          lesson_amount = $1,
          total_earnings = $2,
          lesson_duration = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [correctLessonAmount, correctCommission, duration, record.earning_id]);
      
      // Also update the booking final_amount if needed
      if (Math.abs(record.booking_final_amount - correctLessonAmount) > 0.01) {
        await client.query(`
          UPDATE bookings 
          SET final_amount = $1, updated_at = NOW()
          WHERE id = $2
        `, [correctLessonAmount, record.booking_id]);
      }
      
      fixedRecords.push({
        instructor_name: record.instructor_name,
        instructor_id: record.instructor_id,
        booking_id: record.booking_id,
        old_lesson_amount: record.current_lesson_amount,
        new_lesson_amount: correctLessonAmount,
        old_commission: record.current_total_earnings,
        new_commission: correctCommission,
        commission_rate: commissionRate
      });
      
      fixedInstructors.add(record.instructor_id);
    }
    
    await client.query('COMMIT');
    
    // Emit real-time event for data update
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'instructor:earnings:global-fix', { 
          affectedInstructors: Array.from(fixedInstructors),
          recordsFixed: fixedRecords.length
        });
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError);
      }
    }
    
    res.json({
      message: `Global fix completed: Fixed ${fixedRecords.length} earnings records for ${fixedInstructors.size} instructors`,
      fixedRecords,
      affectedInstructors: Array.from(fixedInstructors),
      totalRecordsFixed: fixedRecords.length,
      totalInstructorsAffected: fixedInstructors.size
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error fixing all instructor earnings:', error);
    res.status(500).json({ error: 'Failed to fix instructor earnings data globally' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/finances/instructor-hourly-rate
 * @desc Update instructor hourly rate
 * @access Admin/Manager
 */
router.post('/instructor-hourly-rate', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { instructorId, newRate, reason } = req.body;
    const changedBy = req.user.id;

    if (!instructorId || !newRate || newRate <= 0) {
      return res.status(400).json({ 
        error: true, 
        message: 'Instructor ID and valid hourly rate are required' 
      });
    }

    // Update the hourly rate using the stored function
    const result = await pool.query(`
      SELECT update_instructor_hourly_rate($1, $2, NOW(), $3, $4)
    `, [instructorId, newRate, changedBy, reason]);

    if (result.rows[0].update_instructor_hourly_rate) {
      // Recalculate earnings for this instructor
      const recalcResult = await pool.query(`
        SELECT * FROM recalculate_instructor_earnings(
          $1, NULL, NULL, NULL, $2, 
          'Hourly rate change'
        )
      `, [instructorId, changedBy]);

      res.json({
        success: true,
        message: 'Hourly rate updated successfully',
        recalculation: recalcResult.rows[0]
      });
    } else {
      res.status(500).json({ 
        error: true, 
        message: 'Failed to update hourly rate' 
      });
    }
  } catch (error) {
    console.error('Error updating instructor hourly rate:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Internal server error' 
    });
  }
});

/**
 * @route POST /api/finances/instructor-commission-rate
 * @desc Update instructor commission rate
 * @access Admin/Manager
 */
router.post('/instructor-commission-rate', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { instructorId, newCommissionRate, reason, endDate } = req.body;
    const changedBy = req.user.id;

    if (!instructorId || !newCommissionRate || newCommissionRate <= 0 || newCommissionRate > 1) {
      return res.status(400).json({ 
        error: true, 
        message: 'Instructor ID and valid commission rate (0-1) are required' 
      });
    }

    // Update the commission rate using the stored function
    const result = await pool.query(`
      SELECT update_instructor_commission_rate($1, $2, NOW(), $3, $4, $5)
    `, [instructorId, newCommissionRate, endDate, changedBy, reason]);

    if (result.rows[0].update_instructor_commission_rate) {
      // Recalculate earnings for this instructor
      const recalcResult = await pool.query(`
        SELECT * FROM recalculate_instructor_earnings(
          $1, NULL, NULL, NULL, $2, 
          'Commission rate change'
        )
      `, [instructorId, changedBy]);

      res.json({
        success: true,
        message: 'Commission rate updated successfully',
        recalculation: recalcResult.rows[0]
      });
    } else {
      res.status(500).json({ 
        error: true, 
        message: 'Failed to update commission rate' 
      });
    }
  } catch (error) {
    console.error('Error updating instructor commission rate:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Internal server error' 
    });
  }
});

/**
 * @route POST /api/finances/recalculate-earnings
 * @desc Recalculate instructor earnings
 * @access Admin/Manager
 */
router.post('/recalculate-earnings', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { instructorId, bookingId, fromDate, toDate, reason } = req.body;
    const changedBy = req.user.id;

    // Recalculate earnings using the stored function
    const result = await pool.query(`
      SELECT * FROM recalculate_instructor_earnings(
        $1, $2, $3, $4, $5, $6
      )
    `, [instructorId, bookingId, fromDate, toDate, changedBy, reason || 'Manual recalculation']);

    res.json({
      success: true,
      message: 'Earnings recalculated successfully',
      results: result.rows
    });
  } catch (error) {
    console.error('Error recalculating earnings:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Internal server error' 
    });
  }
});

/**
 * @route GET /api/finances/validate-earnings
 * @desc Validate instructor earnings system
 * @access Admin/Manager
 */
router.get('/validate-earnings', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM validate_instructor_earnings()');
    
    res.json({
      success: true,
      message: result.rows.length === 0 ? 'All earnings are valid' : 'Validation issues found',
      validationIssues: result.rows
    });
  } catch (error) {
    console.error('Error validating earnings:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Internal server error' 
    });
  }
});

/**
 * @route GET /api/finances/earnings-audit/:instructorId
 * @route GET /api/finances/earnings-audit
 * @desc Get earnings audit log
 * @access Admin/Manager
 */
router.get('/earnings-audit/:instructorId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { instructorId } = req.params;
    const { limit = 50 } = req.query;

    const query = 'SELECT * FROM earnings_audit_log WHERE instructor_id = $1 ORDER BY created_at DESC LIMIT $2';
    const params = [instructorId, limit];

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      auditLog: result.rows
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Internal server error' 
    });
  }
});

router.get('/earnings-audit', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const query = 'SELECT * FROM earnings_audit_log ORDER BY created_at DESC LIMIT $1';
    const params = [limit];

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      auditLog: result.rows
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Internal server error' 
    });
  }
});

/**
 * @route GET /api/finances/earnings-summary
 * @desc Get instructor earnings summary
 * @access Admin/Manager
 */
router.get('/earnings-summary', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM instructor_earnings_summary');
    
    res.json({
      success: true,
      summary: result.rows
    });
  } catch (error) {
    console.error('Error fetching earnings summary:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Internal server error' 
    });
  }
});

/**
 * @route GET /api/finances/instructor-rates/:instructorId
 * @desc Get instructor's current and historical rates
 * @access Admin/Manager
 */
router.get('/instructor-rates/:instructorId', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { instructorId } = req.params;

    // Get current rates
    const currentRates = await pool.query(`
      SELECT 
        u.hourly_rate,
        get_instructor_commission_rate(u.id) as current_commission_rate
      FROM users u
      WHERE u.id = $1
    `, [instructorId]);

    // Get hourly rate history
    const hourlyRateHistory = await pool.query(`
      SELECT * FROM instructor_rate_history 
      WHERE instructor_id = $1 
      ORDER BY effective_date DESC
    `, [instructorId]);

    // Get commission rate history
    const commissionRateHistory = await pool.query(`
      SELECT * FROM instructor_commission_history 
      WHERE instructor_id = $1 
      ORDER BY effective_date DESC
    `, [instructorId]);

    res.json({
      success: true,
      currentRates: currentRates.rows[0],
      hourlyRateHistory: hourlyRateHistory.rows,
      commissionRateHistory: commissionRateHistory.rows
    });
  } catch (error) {
    console.error('Error fetching instructor rates:', error);
    res.status(500).json({ 
      error: true, 
      message: 'Internal server error' 
    });
  }
});

/**
 * @route GET /api/finances/debug/:id
 * @desc Get detailed financial debug information for a user
 * @access Private (Admin/Manager only)
 */
router.get('/debug/:id', authenticateJWT, authorizeRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔍 Financial debug requested for user ${id}`);
    
    // Get basic user info
    const userResult = await pool.query(
      `SELECT id, name, email, balance, total_spent, created_at, updated_at FROM users WHERE id = $1`,
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get all transactions
    const transactionsResult = await pool.query(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    
    // Get customer packages
    const packagesResult = await pool.query(
      `SELECT * FROM customer_packages WHERE customer_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    
    // Get bookings
    const bookingsResult = await pool.query(
      `SELECT id, date, start_hour, duration, amount, final_amount, status, package_id, payment_status 
       FROM bookings WHERE student_user_id = $1 ORDER BY date ASC, start_hour ASC`,
      [id]
    );
    
    // Get rentals
    const rentalsResult = await pool.query(
      `SELECT * FROM rentals WHERE user_id = $1 ORDER BY rental_date ASC`,
      [id]
    );
    
    // Calculate expected balance
    let transactionBalance = 0;
    transactionsResult.rows.forEach(txn => {
      const amount = parseFloat(txn.amount) || 0;
      switch (txn.type) {
        case 'payment':
        case 'credit':
          transactionBalance += amount;
          break;
        case 'charge':
        case 'debit':
          transactionBalance -= amount;
          break;
        case 'refund':
        case 'booking_deleted_refund':
          transactionBalance += amount;
          break;
      }
    });
    
    const packageDebt = packagesResult.rows.reduce((total, pkg) => {
      return total + (parseFloat(pkg.purchase_price) || 0);
    }, 0);
    
    const individualBookingDebt = bookingsResult.rows
      .filter(b => b.status !== 'cancelled' && !b.package_id)
      .reduce((total, booking) => {
        return total + (parseFloat(booking.final_amount || booking.amount) || 0);
      }, 0);
    
    const rentalDebt = rentalsResult.rows.reduce((total, rental) => {
      return total + (parseFloat(rental.total_price) || 0);
    }, 0);
    
    const expectedBalance = transactionBalance - (packageDebt + individualBookingDebt + rentalDebt);
    const currentBalance = parseFloat(userResult.rows[0].balance) || 0;
    
    const debugInfo = {
      user: userResult.rows[0],
      calculations: {
        transactionBalance,
        packageDebt,
        individualBookingDebt,
        rentalDebt,
        expectedBalance,
        currentBalance,
        discrepancy: currentBalance - expectedBalance
      },
      rawData: {
        transactions: transactionsResult.rows,
        packages: packagesResult.rows,
        bookings: bookingsResult.rows,
        rentals: rentalsResult.rows
      },
      summary: {
        transactionCount: transactionsResult.rows.length,
        packageCount: packagesResult.rows.length,
        bookingCount: bookingsResult.rows.length,
        rentalCount: rentalsResult.rows.length,
        hasDiscrepancy: Math.abs(currentBalance - expectedBalance) > 0.01
      }
    };
    
    console.log(`✅ Debug info compiled for user ${id}`);
    res.json(debugInfo);
    
  } catch (error) {
    console.error('Error generating debug info:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
