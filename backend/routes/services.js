// backend/routes/services.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles as authorize } from '../middlewares/authorize.js';
import { resolveActorId, appendCreatedBy } from '../utils/auditUtils.js';
// import CurrencyService from '../services/currencyService.js';
import { logger } from '../middlewares/errorHandler.js';
import { getWalletAccountSummary, recordLegacyTransaction } from '../services/walletService.js';
import { forceDeleteCustomerPackage, mapWalletTransactionForResponse } from '../services/customerPackageService.js';
import { upgradeOutsiderToStudent, isOutsiderRole } from '../services/roleUpgradeService.js';
import { setPackagePrices, getPackagePrices, setServicePrices, getServicePrices, getPackagePriceInCurrency, getServicePriceInCurrency } from '../services/multiCurrencyPriceService.js';
import voucherService from '../services/voucherService.js';
const router = express.Router();

// Minimal currency defaults to prevent FK errors when currency_settings isn't seeded
const CURRENCY_DEFAULTS = {
  EUR: { name: 'Euro', symbol: '€', rate: 1.0 },
  USD: { name: 'US Dollar', symbol: '$', rate: 1.1 },
  GBP: { name: 'British Pound', symbol: '£', rate: 0.85 },
  TRY: { name: 'Turkish Lira', symbol: '₺', rate: 32.5 },
  CAD: { name: 'Canadian Dollar', symbol: 'C$', rate: 1.45 },
  AUD: { name: 'Australian Dollar', symbol: 'A$', rate: 1.65 },
};

async function ensureCurrencyExists(client, code) {
  if (!code) return;
  const currencyCode = String(code).toUpperCase();
  const exists = await client.query('SELECT 1 FROM currency_settings WHERE currency_code = $1', [currencyCode]);
  if (exists.rowCount > 0) return;
  const def = CURRENCY_DEFAULTS[currencyCode] || { name: currencyCode, symbol: currencyCode, rate: 1.0 };
  await client.query(
    `INSERT INTO currency_settings (currency_code, currency_name, symbol, is_active, exchange_rate, base_currency, decimal_places)
     VALUES ($1, $2, $3, true, $4, false, 2)
     ON CONFLICT (currency_code) DO NOTHING`,
    [currencyCode, def.name, def.symbol, def.rate]
  );
}

// Get all services
router.get('/', async (req, res) => {
  try {
    const { category, level, isPackage } = req.query;
    
    let query = `
      SELECT s.*, 
            p.name as package_name, 
            p.price as package_price, 
            p.sessions_count,
            cs.symbol as currency_symbol
      FROM services s
      LEFT JOIN service_packages p ON s.package_id = p.id
      LEFT JOIN currency_settings cs ON s.currency = cs.currency_code
      WHERE 1=1
    `;
    
    const queryParams = [];
    
    // Apply filters if provided
    if (category) {
      query += ` AND s.category = $${queryParams.length + 1}`;
      queryParams.push(category);
    }
    
    if (level) {
      query += ` AND s.level = $${queryParams.length + 1}`;
      queryParams.push(level);
    }
    
    if (isPackage === 'true') {
      query += ` AND s.package_id IS NOT NULL`;
    } else if (isPackage === 'false') {
      query += ` AND s.package_id IS NULL`;
    }
    
    query += ` ORDER BY s.name ASC`;
    
    const { rows } = await pool.query(query, queryParams);
    
    // Fetch prices for all services in parallel
    const servicesWithPrices = await Promise.all(rows.map(async row => {
      const isPackageResult = row.package_id !== null;
      const prices = await getServicePrices(row.id);
      
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        level: row.level,
        serviceType: row.service_type,
        duration: row.duration,
        price: row.price,
        currency: row.currency,
        currencySymbol: row.currency_symbol,
        prices: prices.length > 0 ? prices : [{ currencyCode: row.currency || 'EUR', price: parseFloat(row.price) || 0 }],
        maxParticipants: row.max_participants,
        startTime: row.start_time,
        endTime: row.end_time,
        includes: row.includes,
        imageUrl: row.image_url,
        disciplineTag: row.discipline_tag || null,
        lessonCategoryTag: row.lesson_category_tag || null,
        levelTag: row.level_tag || null,
        isPackage: isPackageResult,
        ...(isPackageResult && {
          packageName: row.package_name,
          packagePrice: row.package_price,
          sessionsCount: row.sessions_count
        })
      };
    }));
    
    res.json(servicesWithPrices);
  } catch (error) {
  logger.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Get service categories
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM service_categories ORDER BY name');
    res.json(rows);
  } catch (error) {
  logger.error('Error fetching service categories:', error);
    res.status(500).json({ error: 'Failed to fetch service categories' });
  }
});

// ============ PACKAGE ROUTES ============
// Note: These must be defined BEFORE the /:id route to avoid conflicts

// Get all packages
router.get('/packages', authorize(['admin', 'manager']), async (req, res) => {
  try {
    const { packageType } = req.query;
    
    let query = `
      SELECT p.*
      FROM service_packages p
      WHERE 1=1
    `;
    const queryParams = [];
    
    // Filter by package_type if provided
    if (packageType) {
      queryParams.push(packageType);
      query += ` AND p.package_type = $${queryParams.length}`;
    }
    
    query += ` ORDER BY p.created_at DESC`;
    
    const { rows } = await pool.query(query, queryParams);
    
    // Fetch prices for all packages in parallel
    const packagesWithPrices = await Promise.all(rows.map(async row => {
      const prices = await getPackagePrices(row.id);
      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        price: parseFloat(row.price),
        currency: row.currency || 'EUR',
        currencySymbol: row.currency === 'USD' ? '$' : '€',
        prices: prices.length > 0 ? prices : [{ currencyCode: row.currency || 'EUR', price: parseFloat(row.price) }],
        sessionsCount: row.sessions_count,
        totalHours: parseFloat(row.total_hours) || 0,
        lessonServiceName: row.lesson_service_name || 'Unknown Service',
        disciplineTag: row.discipline_tag || null,
        lessonCategoryTag: row.lesson_category_tag || null,
        levelTag: row.level_tag || null,
        // New unified package type fields
        packageType: row.package_type || 'lesson',
        includesAccommodation: row.includes_accommodation || false,
        includesRental: row.includes_rental || false,
        includesLessons: row.includes_lessons !== false, // default true for backwards compatibility
        accommodationNights: row.accommodation_nights || 0,
        rentalDays: row.rental_days || 0,
        imageUrl: row.image_url || null,
        // Service reference fields
        lessonServiceId: row.lesson_service_id || null,
        equipmentId: row.equipment_id || null,
        accommodationUnitId: row.accommodation_unit_id || null,
        rentalServiceId: row.rental_service_id || null,
        equipmentName: row.equipment_name || null,
        accommodationUnitName: row.accommodation_unit_name || null,
        rentalServiceName: row.rental_service_name || null,
        pricePerHour: row.total_hours ? Math.round(parseFloat(row.price) / parseFloat(row.total_hours)) : 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        status: 'active'
      };
    }));
    
    res.json(packagesWithPrices);
  } catch (error) {
  logger.error('Error fetching packages:', error);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// Create new package
router.post('/packages', authorize(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  try {
    const { 
      name, price, currency, prices, sessionsCount, totalHours, lessonServiceName, 
      disciplineTag, lessonCategoryTag, levelTag, description,
      // New unified package type fields
      packageType, includesAccommodation, includesRental, includesLessons,
      accommodationNights, rentalDays, imageUrl,
      // Service reference fields
      lessonServiceId, equipmentId, accommodationUnitId, rentalServiceId,
      equipmentName, accommodationUnitName, rentalServiceName
    } = req.body;
    const actorId = resolveActorId(req);
    const now = new Date();
    
    // Validate based on package type
    const pType = packageType || 'lesson';
    const needsLessonService = pType === 'lesson' || includesLessons === true;
    const hasLessonService = lessonServiceId || (lessonServiceName && lessonServiceName !== 'Unknown Service');
    
    if (needsLessonService && !hasLessonService) {
      return res.status(400).json({ 
        error: 'Lesson service is required for lesson packages. Please select a lesson type/service for this package.' 
      });
    }
    
    // Start transaction
    await client.query('BEGIN');
    
    // Determine primary price/currency (for backwards compatibility)
    // If prices array provided, use first entry as primary; otherwise use price/currency
    let primaryPrice = price;
    let primaryCurrency = currency || 'EUR';
    if (Array.isArray(prices) && prices.length > 0) {
      primaryPrice = prices[0].price;
      primaryCurrency = prices[0].currencyCode || prices[0].currency || 'EUR';
    }
    
    const packageId = uuidv4();
    const packageColumns = [
      'id',
      'name',
      'description',
      'price',
      'sessions_count',
      'currency',
      'total_hours',
      'lesson_service_name',
      'discipline_tag',
      'lesson_category_tag',
      'level_tag',
      'package_type',
      'includes_accommodation',
      'includes_rental',
      'includes_lessons',
      'accommodation_nights',
      'rental_days',
      'image_url',
      'lesson_service_id',
      'equipment_id',
      'accommodation_unit_id',
      'rental_service_id',
      'equipment_name',
      'accommodation_unit_name',
      'rental_service_name',
      'created_at',
      'updated_at'
    ];
    const packageValues = [
      packageId,
      name,
      description || null,
      parseFloat(primaryPrice),
      parseInt(sessionsCount) || 0,
      primaryCurrency.toUpperCase(),
      parseFloat(totalHours) || 0,
      lessonServiceName || null,
      disciplineTag || null,
      lessonCategoryTag || null,
      levelTag || null,
      pType,
      includesAccommodation || false,
      includesRental || false,
      includesLessons !== false, // default true for backwards compatibility
      parseInt(accommodationNights) || 0,
      parseInt(rentalDays) || 0,
      imageUrl || null,
      lessonServiceId || null,
      equipmentId || null,
      accommodationUnitId || null,
      rentalServiceId || null,
      equipmentName || null,
      accommodationUnitName || null,
      rentalServiceName || null,
      now,
      now
    ];
      const { columns: packageInsertColumns, values: packageInsertValues } = appendCreatedBy(
        packageColumns,
        packageValues,
        actorId
      );
    const packagePlaceholders = packageInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');

    const { rows } = await client.query(
      `INSERT INTO service_packages (${packageInsertColumns.join(', ')}) VALUES (${packagePlaceholders}) RETURNING *`,
      packageInsertValues
    );
    
    // Handle multi-currency prices
    let allPrices = [];
    if (Array.isArray(prices) && prices.length > 0) {
      // Normalize prices array format
      const normalizedPrices = prices.map(p => ({
        currencyCode: (p.currencyCode || p.currency || 'EUR').toUpperCase(),
        price: parseFloat(p.price)
      }));
      await setPackagePrices(client, packageId, normalizedPrices);
      allPrices = normalizedPrices;
    } else if (primaryPrice != null) {
      // Single price provided - store in prices table too
      await setPackagePrices(client, packageId, [{ currencyCode: primaryCurrency.toUpperCase(), price: parseFloat(primaryPrice) }]);
      allPrices = [{ currencyCode: primaryCurrency.toUpperCase(), price: parseFloat(primaryPrice) }];
    }
    
    await client.query('COMMIT');
    
    const newPackage = {
      id: rows[0].id,
      name: rows[0].name,
      description: rows[0].description || '',
      price: parseFloat(rows[0].price),
      currency: rows[0].currency,
      currencySymbol: rows[0].currency === 'USD' ? '$' : '€',
      prices: allPrices,
      sessionsCount: rows[0].sessions_count,
      totalHours: parseFloat(rows[0].total_hours) || 0,
      lessonServiceName: rows[0].lesson_service_name,
      pricePerHour: rows[0].total_hours ? Math.round(parseFloat(rows[0].price) / parseFloat(rows[0].total_hours)) : 0,
      disciplineTag: rows[0].discipline_tag || null,
      lessonCategoryTag: rows[0].lesson_category_tag || null,
      levelTag: rows[0].level_tag || null,
      packageType: rows[0].package_type || 'lesson',
      includesAccommodation: rows[0].includes_accommodation || false,
      includesRental: rows[0].includes_rental || false,
      includesLessons: rows[0].includes_lessons !== false,
      accommodationNights: rows[0].accommodation_nights || 0,
      rentalDays: rows[0].rental_days || 0,
      imageUrl: rows[0].image_url || null,
      // Service reference fields
      lessonServiceId: rows[0].lesson_service_id || null,
      equipmentId: rows[0].equipment_id || null,
      accommodationUnitId: rows[0].accommodation_unit_id || null,
      rentalServiceId: rows[0].rental_service_id || null,
      equipmentName: rows[0].equipment_name || null,
      accommodationUnitName: rows[0].accommodation_unit_name || null,
      rentalServiceName: rows[0].rental_service_name || null,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
      status: 'active'
    };
    
    res.status(201).json(newPackage);
  } catch (error) {
    await client.query('ROLLBACK');
  logger.error('Error creating package:', error);
    res.status(500).json({ error: 'Failed to create package' });
  } finally {
    client.release();
  }
});

// Get available packages for purchase (public endpoint for students/outsiders)
// This endpoint returns packages based on their package_type field
// Package types: lesson, rental, accommodation, lesson_rental, accommodation_lesson, accommodation_rental, all_inclusive
router.get('/packages/available', authenticateJWT, authorize(['admin', 'manager', 'student', 'outsider']), async (req, res) => {
  try {
    const { category, packageType: reqPackageType } = req.query;
    
    // Base query - get all packages
    let query = `
      SELECT p.*
      FROM service_packages p
      WHERE 1=1
    `;
    
    const queryParams = [];
    
    // Filter by packageType (preferred new method) or legacy category
    if (reqPackageType) {
      // New package_type based filtering
      queryParams.push(reqPackageType);
      query += ` AND p.package_type = $${queryParams.length}`;
    } else if (category) {
      // Legacy category-based filtering (for backwards compatibility)
      // Uses both package_type field AND legacy tags
      if (category === 'lesson') {
        query += ` AND (
          p.package_type = 'lesson'
          OR (p.package_type IS NULL AND p.includes_lessons = true AND p.includes_rental = false AND p.includes_accommodation = false)
        )`;
      } else if (category === 'rental') {
        query += ` AND (
          p.package_type = 'rental'
          OR (p.includes_rental = true AND p.includes_lessons = false AND p.includes_accommodation = false)
        )`;
      } else if (category === 'accommodation') {
        query += ` AND (
          p.package_type = 'accommodation'
          OR (p.includes_accommodation = true AND p.includes_lessons = false AND p.includes_rental = false)
        )`;
      } else if (category === 'lesson_rental') {
        query += ` AND (
          p.package_type = 'lesson_rental'
          OR (p.includes_lessons = true AND p.includes_rental = true AND p.includes_accommodation = false)
        )`;
      } else if (category === 'accommodation_rental') {
        query += ` AND (
          p.package_type = 'accommodation_rental'
          OR (p.includes_accommodation = true AND p.includes_rental = true AND p.includes_lessons = false)
        )`;
      } else if (category === 'accommodation_lesson') {
        query += ` AND (
          p.package_type = 'accommodation_lesson'
          OR (p.includes_accommodation = true AND p.includes_lessons = true AND p.includes_rental = false)
        )`;
      } else if (category === 'all_inclusive') {
        query += ` AND (
          p.package_type = 'all_inclusive'
          OR (p.includes_accommodation = true AND p.includes_rental = true AND p.includes_lessons = true)
        )`;
      }
    }
    
    query += ` ORDER BY p.price ASC`;
    
    const { rows } = await pool.query(query, queryParams);
    
    // Fetch prices for all packages in parallel
    const packagesWithPrices = await Promise.all(rows.map(async (row) => {
      // Use the stored package_type, or determine from legacy tags
      let packageType = row.package_type || 'lesson';
      if (!row.package_type) {
        const lcTag = (row.lesson_category_tag || '').toLowerCase();
        const discTag = (row.discipline_tag || '').toLowerCase();
        
        if (lcTag === 'rental' || discTag === 'rental') {
          packageType = 'rental';
        } else if (lcTag === 'accommodation' || discTag === 'accommodation') {
          packageType = 'accommodation';
        }
      }
      
      // Fetch multi-currency prices
      let prices = [];
      try {
        prices = await getPackagePrices(row.id);
      } catch (e) {
        // If package_prices table doesn't exist or other error, use default price
        logger.warn(`Could not fetch package prices for ${row.id}: ${e.message}`);
      }
      
      // If no prices in package_prices table, add the default price
      if (prices.length === 0 && row.price) {
        prices = [{ currencyCode: row.currency || 'EUR', price: parseFloat(row.price) }];
      }
      
      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        price: parseFloat(row.price),
        currency: row.currency || 'EUR',
        prices, // Include multi-currency prices array
        currencySymbol: row.currency === 'USD' ? '$' : '€',
        sessionsCount: row.sessions_count,
        totalHours: parseFloat(row.total_hours) || 0,
        lessonServiceName: row.lesson_service_name || 'Unknown Service',
        disciplineTag: row.discipline_tag || null,
        lessonCategoryTag: row.lesson_category_tag || null,
        levelTag: row.level_tag || null,
        packageType,
        includesAccommodation: row.includes_accommodation || false,
        includesRental: row.includes_rental || false,
        includesLessons: row.includes_lessons !== false,
        accommodationNights: row.accommodation_nights || 0,
        rentalDays: row.rental_days || 0,
        imageUrl: row.image_url || null,
        pricePerHour: row.total_hours ? Math.round(parseFloat(row.price) / parseFloat(row.total_hours)) : 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        status: 'active'
      };
    }));
    
    res.json(packagesWithPrices);
  } catch (error) {
    logger.error('Error fetching available packages:', error);
    res.status(500).json({ error: 'Failed to fetch available packages' });
  }
});

// Get user's purchased packages (for students/outsiders)
router.get('/packages/my-packages', authenticateJWT, authorize(['admin', 'manager', 'student', 'outsider']), async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const query = `
      SELECT 
        cp.id,
        cp.package_name,
        cp.lesson_service_name,
        cp.total_hours,
        cp.remaining_hours,
        COALESCE(cp.hours_used, 0) as hours_used,
        cp.purchase_price as total_price,
        cp.currency,
        cp.purchase_date,
        cp.expiry_date,
        cp.status,
        cp.notes as description,
        sp.description as package_description
      FROM customer_packages cp
      LEFT JOIN service_packages sp ON cp.service_package_id = sp.id
      WHERE cp.customer_id = $1
      ORDER BY cp.purchase_date DESC
    `;

    const { rows } = await pool.query(query, [userId]);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    logger.error('Error fetching user packages:', error);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// Purchase a package (for students/outsiders)
// Supports: wallet, external processors (stripe, paytr, binance_pay, etc.), pay_later
router.post('/packages/purchase', authenticateJWT, authorize(['admin', 'manager', 'student', 'outsider']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { 
      packageId, 
      paymentMethod,
      externalPaymentProcessor,
      externalPaymentReference,
      externalPaymentNote,
      checkInDate,
      checkOutDate,
      voucherId  // Voucher/promo code to apply
    } = req.body;
    const userId = req.user?.id;
    const actorId = resolveActorId(req);
    
    if (!packageId) {
      return res.status(400).json({ error: 'Package ID is required' });
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate payment method
    const validPaymentMethods = ['wallet', 'external', 'pay_later'];
    const normalizedPaymentMethod = paymentMethod || 'wallet';
    
    if (!validPaymentMethods.includes(normalizedPaymentMethod)) {
      return res.status(400).json({ error: `Invalid payment method. Supported: ${validPaymentMethods.join(', ')}` });
    }

    // Pay at center (pay_later) is now available for all authenticated customers
    // This allows students to choose cash payment at reception, similar to member offerings

    // For external payments, require processor and reference
    if (normalizedPaymentMethod === 'external') {
      if (!externalPaymentProcessor) {
        return res.status(400).json({ error: 'External payment processor is required' });
      }
      if (!externalPaymentReference) {
        return res.status(400).json({ error: 'External payment reference is required' });
      }
    }
    
    await client.query('BEGIN');
    
    // Get the package details
    const packageResult = await client.query(
      'SELECT * FROM service_packages WHERE id = $1',
      [packageId]
    );
    
    if (packageResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Package not found' });
    }
    
    const pkg = packageResult.rows[0];
    const defaultPackagePrice = parseFloat(pkg.price);
    const defaultPackageCurrency = pkg.currency || 'EUR';
    
    // Check if package includes accommodation and validate availability
    const includesAccommodation = pkg.includes_accommodation || 
      pkg.package_type === 'accommodation' || 
      pkg.package_type === 'accommodation_rental' ||
      pkg.package_type === 'accommodation_lesson' ||
      pkg.package_type === 'all_inclusive';

    let accommodationBookingId = null;
    let accommodationUnitData = null;

    if (includesAccommodation) {
      // Require check-in and check-out dates for accommodation packages
      if (!checkInDate || !checkOutDate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Check-in and check-out dates are required for accommodation packages',
          code: 'DATES_REQUIRED'
        });
      }

      // Validate dates
      const checkIn = new Date(checkInDate);
      const checkOut = new Date(checkOutDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (checkIn < today) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Check-in date cannot be in the past' });
      }

      if (checkOut <= checkIn) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Check-out date must be after check-in date' });
      }

      // Check if package has an accommodation unit assigned
      if (!pkg.accommodation_unit_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'This package does not have an accommodation unit assigned. Please contact support.',
          code: 'NO_UNIT_ASSIGNED'
        });
      }

      // Get the accommodation unit details
      const unitResult = await client.query(
        'SELECT * FROM accommodation_units WHERE id = $1',
        [pkg.accommodation_unit_id]
      );

      if (unitResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Accommodation unit not found',
          code: 'UNIT_NOT_FOUND'
        });
      }

      accommodationUnitData = unitResult.rows[0];

      if (accommodationUnitData.status !== 'Available') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Accommodation unit is not available',
          code: 'UNIT_UNAVAILABLE'
        });
      }

      // Check for overlapping bookings
      const overlapResult = await client.query(
        `SELECT id FROM accommodation_bookings 
         WHERE unit_id = $1 
         AND status NOT IN ('cancelled')
         AND (check_in_date, check_out_date) OVERLAPS ($2::date, $3::date)`,
        [pkg.accommodation_unit_id, checkInDate, checkOutDate]
      );

      if (overlapResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Accommodation is not available for the selected dates. Please choose different dates.',
          code: 'DATES_UNAVAILABLE',
          conflictingDates: { checkIn: checkInDate, checkOut: checkOutDate }
        });
      }

      logger.info('Accommodation availability confirmed for package purchase', {
        packageId,
        unitId: pkg.accommodation_unit_id,
        checkInDate,
        checkOutDate,
        userId
      });
    }
    
    // Get user's preferred currency to check wallet balance
    let userCurrency = defaultPackageCurrency;
    try {
      const userCurrencyResult = await client.query(
        'SELECT preferred_currency FROM users WHERE id = $1',
        [userId]
      );
      if (userCurrencyResult.rows.length > 0 && userCurrencyResult.rows[0].preferred_currency) {
        userCurrency = userCurrencyResult.rows[0].preferred_currency;
      }
    } catch (err) {
      logger.warn('Could not fetch user preferred currency, using package currency', { userId, error: err.message });
    }
    
    // Get the package price in user's currency from multi-currency price table
    let packagePrice = defaultPackagePrice;
    let priceCurrency = defaultPackageCurrency;
    
    try {
      const currencyPrice = await getPackagePriceInCurrency(packageId, userCurrency);
      if (currencyPrice && currencyPrice.price > 0) {
        packagePrice = currencyPrice.price;
        priceCurrency = currencyPrice.currencyCode;
        logger.info('Using multi-currency price for package purchase', {
          packageId,
          userCurrency,
          price: packagePrice,
          priceCurrency
        });
      } else {
        logger.warn('No price found for user currency, using default package price', {
          packageId,
          userCurrency,
          defaultPrice: defaultPackagePrice,
          defaultCurrency: defaultPackageCurrency
        });
      }
    } catch (priceErr) {
      logger.warn('Failed to fetch multi-currency price, using default', {
        packageId,
        userCurrency,
        error: priceErr.message
      });
    }
    
    // Voucher/promo code handling
    let voucherDiscount = 0;
    let appliedVoucher = null;
    let originalPrice = packagePrice;
    
    if (voucherId) {
      try {
        // Validate the voucher
        const voucherValidation = await voucherService.validateVoucher(voucherId, userId, 'packages', packagePrice, priceCurrency, packageId);
        
        if (!voucherValidation.valid) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            error: voucherValidation.error || 'Invalid voucher code',
            code: 'VOUCHER_INVALID'
          });
        }
        
        appliedVoucher = voucherValidation.voucher;
        
        // Handle wallet_credit type vouchers - don't apply as discount, add to wallet later
        if (appliedVoucher.voucher_type === 'wallet_credit') {
          logger.info('Wallet credit voucher will be applied after purchase', {
            voucherId: appliedVoucher.id,
            creditAmount: appliedVoucher.discount_value,
            userId
          });
        } else {
          // Calculate discount for percentage/fixed amount
          const discountResult = voucherService.calculateDiscount(appliedVoucher, packagePrice, priceCurrency);
          voucherDiscount = discountResult.discountAmount;
          packagePrice = discountResult.finalPrice;
          
          logger.info('Voucher discount applied to package purchase', {
            voucherId: appliedVoucher.id,
            voucherCode: appliedVoucher.code,
            originalPrice,
            discountAmount: voucherDiscount,
            finalPrice: packagePrice,
            voucherType: appliedVoucher.voucher_type,
            userId
          });
        }
      } catch (voucherErr) {
        logger.error('Error validating voucher', {
          voucherId,
          userId,
          error: voucherErr.message
        });
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Failed to validate voucher',
          code: 'VOUCHER_ERROR'
        });
      }
    }
    
    let walletDeducted = false;
    let availableBalance = 0;
    let newBalance = 0;

    // Handle wallet payment
    if (normalizedPaymentMethod === 'wallet') {
      // Check user's wallet balance in the price currency
      const balanceResult = await client.query(
        `SELECT available_amount FROM wallet_balances 
         WHERE user_id = $1 AND currency = $2`,
        [userId, priceCurrency]
      );
      
      availableBalance = balanceResult.rows.length > 0 
        ? parseFloat(balanceResult.rows[0].available_amount) 
        : 0;
      
      // If no balance found in price currency, check for any non-zero balance
      if (availableBalance === 0) {
        const anyBalanceResult = await client.query(
          `SELECT available_amount, currency FROM wallet_balances 
           WHERE user_id = $1 AND available_amount > 0
           ORDER BY updated_at DESC LIMIT 1`,
          [userId]
        );
        
        if (anyBalanceResult.rows.length > 0) {
          availableBalance = parseFloat(anyBalanceResult.rows[0].available_amount);
          const walletCurrency = anyBalanceResult.rows[0].currency;
          
          // Try to get price in wallet currency
          const walletCurrencyPrice = await getPackagePriceInCurrency(packageId, walletCurrency);
          if (walletCurrencyPrice && walletCurrencyPrice.price > 0) {
            packagePrice = walletCurrencyPrice.price;
            priceCurrency = walletCurrencyPrice.currencyCode;
          }
        }
      }
      
      if (availableBalance < packagePrice) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Insufficient wallet balance',
          required: packagePrice,
          available: availableBalance,
          currency: priceCurrency
        });
      }
      walletDeducted = true;
    }
    
    // Create the customer package record
    const customerPackageId = uuidv4();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 year expiry

    // Determine payment status based on method
    const paymentStatus = normalizedPaymentMethod === 'pay_later' ? 'pending' : 'paid';
    
    const customerPackageQuery = `
      INSERT INTO customer_packages (
        id, customer_id, service_package_id, package_name, lesson_service_name,
        total_hours, remaining_hours, purchase_price, currency, expiry_date, status, purchase_date, notes,
        check_in_date, check_out_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, 'active', NOW(), $10, $11, $12)
      RETURNING *
    `;

    // Build notes for payment tracking
    let purchaseNotes = null;
    if (normalizedPaymentMethod === 'external') {
      purchaseNotes = `Payment: ${externalPaymentProcessor} | Ref: ${externalPaymentReference}${externalPaymentNote ? ' | ' + externalPaymentNote : ''}`;
    } else if (normalizedPaymentMethod === 'pay_later') {
      purchaseNotes = 'Payment pending - Pay Later';
    }
    
    const { rows: customerPackageRows } = await client.query(customerPackageQuery, [
      customerPackageId,
      userId,
      packageId,
      pkg.name,
      pkg.lesson_service_name || pkg.name,
      parseFloat(pkg.total_hours) || 0,
      packagePrice,
      priceCurrency,
      expiryDate,
      purchaseNotes,
      checkInDate || null,
      checkOutDate || null
    ]);

    // Create accommodation booking if package includes accommodation
    if (includesAccommodation && pkg.accommodation_unit_id && checkInDate && checkOutDate) {
      try {
        accommodationBookingId = uuidv4();
        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
        
        // Price is already included in package, so accommodation booking is pre-paid
        await client.query(
          `INSERT INTO accommodation_bookings 
           (id, unit_id, guest_id, check_in_date, check_out_date, guests_count, total_price, status, notes, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, $3, NOW(), NOW())`,
          [
            accommodationBookingId,
            pkg.accommodation_unit_id,
            userId,
            checkInDate,
            checkOutDate,
            1, // Default 1 guest, can be updated later
            0, // Price included in package
            `Package booking: ${pkg.name} (Customer Package ID: ${customerPackageId})`
          ]
        );

        logger.info('Accommodation booking created for package purchase', {
          accommodationBookingId,
          customerPackageId,
          unitId: pkg.accommodation_unit_id,
          checkInDate,
          checkOutDate,
          nights,
          userId
        });
      } catch (accBookingErr) {
        logger.error('Failed to create accommodation booking for package', {
          customerPackageId,
          error: accBookingErr.message
        });
        // Don't fail the whole transaction, but log the error
        // The accommodation dates are still saved in customer_packages
      }
    }
    
    // Record wallet transaction if paying by wallet
    if (walletDeducted) {
      try {
        await recordLegacyTransaction({
          client,
          userId,
          amount: -Math.abs(packagePrice),
          transactionType: 'package_purchase',
          status: 'completed',
          direction: 'debit',
          description: `Package Purchase: ${pkg.name}`,
          currency: priceCurrency,
          paymentMethod: 'wallet',
          referenceNumber: customerPackageId,
          metadata: {
            packageId: customerPackageId,
            servicePackageId: packageId,
            totalHours: parseFloat(pkg.total_hours) || 0,
            purchasePrice: packagePrice,
            priceCurrency: priceCurrency,
            source: 'services:packages:self-purchase'
          },
          entityType: 'customer_package',
          relatedEntityType: 'customer_package',
          relatedEntityId: customerPackageId,
          createdBy: actorId || userId,
          allowNegative: false
        });
      } catch (walletError) {
        logger.error('Failed to record package purchase in wallet ledger', {
          userId,
          packageId: customerPackageId,
          error: walletError?.message
        });
        throw walletError;
      }

      // Get updated wallet balance
      const updatedBalanceResult = await client.query(
        `SELECT available_amount FROM wallet_balances 
         WHERE user_id = $1 AND currency = $2`,
        [userId, priceCurrency]
      );
      
      newBalance = updatedBalanceResult.rows.length > 0 
        ? parseFloat(updatedBalanceResult.rows[0].available_amount) 
        : 0;
    }

    // For external payments, record a transaction for audit trail
    if (normalizedPaymentMethod === 'external') {
      try {
        await recordLegacyTransaction({
          client,
          userId,
          amount: packagePrice,
          transactionType: 'package_purchase',
          status: 'completed',
          direction: 'credit',
          description: `Package Purchase (${externalPaymentProcessor}): ${pkg.name}`,
          currency: priceCurrency,
          paymentMethod: externalPaymentProcessor,
          referenceNumber: externalPaymentReference,
          metadata: {
            packageId: customerPackageId,
            servicePackageId: packageId,
            totalHours: parseFloat(pkg.total_hours) || 0,
            purchasePrice: packagePrice,
            priceCurrency: priceCurrency,
            processor: externalPaymentProcessor,
            reference: externalPaymentReference,
            note: externalPaymentNote,
            source: 'services:packages:external-purchase'
          },
          entityType: 'customer_package',
          relatedEntityType: 'customer_package',
          relatedEntityId: customerPackageId,
          createdBy: actorId || userId,
          allowNegative: true
        });
      } catch (txError) {
        logger.warn('Failed to record external payment transaction', {
          userId,
          packageId: customerPackageId,
          error: txError?.message
        });
        // Don't throw - the package was still created
      }
    }
    
    await client.query('COMMIT');
    
    // Redeem voucher if one was applied
    let voucherRedemptionInfo = null;
    if (appliedVoucher) {
      try {
        const redemptionResult = await voucherService.redeemVoucher(
          appliedVoucher.id,
          userId,
          'package_purchase',
          customerPackageId,
          originalPrice,
          voucherDiscount,
          priceCurrency
        );
        
        voucherRedemptionInfo = {
          voucherId: appliedVoucher.id,
          code: appliedVoucher.code,
          type: appliedVoucher.voucher_type,
          discountApplied: voucherDiscount,
          originalPrice,
          finalPrice: packagePrice
        };
        
        // If it's a wallet_credit voucher, apply the credit now
        if (appliedVoucher.voucher_type === 'wallet_credit') {
          try {
            const creditResult = await voucherService.applyWalletCredit(
              appliedVoucher,
              userId,
              redemptionResult.redemptionId
            );
            voucherRedemptionInfo.walletCreditApplied = creditResult.creditAmount;
            voucherRedemptionInfo.walletCurrency = creditResult.currency;
            
            logger.info('Wallet credit voucher applied', {
              voucherId: appliedVoucher.id,
              userId,
              creditAmount: creditResult.creditAmount,
              currency: creditResult.currency
            });
          } catch (creditErr) {
            logger.error('Failed to apply wallet credit from voucher', {
              voucherId: appliedVoucher.id,
              userId,
              error: creditErr.message
            });
            // Don't fail the purchase, just log the error
          }
        }
        
        logger.info('Voucher redeemed for package purchase', {
          voucherId: appliedVoucher.id,
          customerPackageId,
          userId,
          discountApplied: voucherDiscount
        });
      } catch (redeemErr) {
        logger.error('Failed to redeem voucher (purchase still succeeded)', {
          voucherId: appliedVoucher.id,
          userId,
          error: redeemErr.message
        });
        // Don't fail the purchase, voucher can be tracked manually
      }
    }
    
    // Check if user should be upgraded from outsider to student after first package purchase
    let roleUpgradeInfo = null;
    if (req.user?.role === 'outsider') {
      const upgradeResult = await upgradeOutsiderToStudent(userId);
      
      if (upgradeResult.success && upgradeResult.newRole === 'student') {
        roleUpgradeInfo = {
          upgraded: true,
          newRole: 'student',
          message: 'Your account has been upgraded to Student! You now have access to the Student Dashboard.'
        };
      }
    }
    
    const response = {
      success: true,
      message: 'Package purchased successfully',
      paymentMethod: normalizedPaymentMethod,
      paymentStatus,
      customerPackage: {
        id: customerPackageRows[0].id,
        packageName: pkg.name,
        totalHours: parseFloat(pkg.total_hours) || 0,
        remainingHours: parseFloat(pkg.total_hours) || 0,
        purchasePrice: packagePrice,
        currency: priceCurrency,
        expiryDate,
        status: 'active',
        checkInDate: checkInDate || null,
        checkOutDate: checkOutDate || null
      }
    };

    // Add voucher info if one was applied
    if (voucherRedemptionInfo) {
      response.voucher = voucherRedemptionInfo;
    }

    // Add accommodation booking info if created
    if (accommodationBookingId && accommodationUnitData) {
      const checkIn = new Date(checkInDate);
      const checkOut = new Date(checkOutDate);
      const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
      
      response.accommodationBooking = {
        id: accommodationBookingId,
        unitId: pkg.accommodation_unit_id,
        unitName: accommodationUnitData.name,
        unitType: accommodationUnitData.type,
        checkInDate,
        checkOutDate,
        nights,
        status: 'confirmed'
      };
    }

    // Add role upgrade info if applicable
    if (roleUpgradeInfo) {
      response.roleUpgrade = roleUpgradeInfo;
    }

    // Add wallet info if wallet payment
    if (walletDeducted) {
      response.wallet = {
        previousBalance: availableBalance,
        deducted: packagePrice,
        newBalance,
        currency: priceCurrency
      };
    }

    // Add external payment info
    if (normalizedPaymentMethod === 'external') {
      response.externalPayment = {
        processor: externalPaymentProcessor,
        reference: externalPaymentReference,
        note: externalPaymentNote
      };
    }

    res.status(201).json(response);
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error purchasing package:', error);
    res.status(500).json({ error: error.message || 'Failed to purchase package' });
  } finally {
    client.release();
  }
});

// Update package
// eslint-disable-next-line complexity
router.put('/packages/:id', authorize(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const actorId = resolveActorId(req);
    const { 
      name, price, currency, prices, sessionsCount, totalHours, lessonServiceName, 
      disciplineTag, lessonCategoryTag, levelTag, description,
      // New unified package type fields
      packageType, includesAccommodation, includesRental, includesLessons,
      accommodationNights, rentalDays, imageUrl,
      // Service reference fields
      lessonServiceId, equipmentId, accommodationUnitId, rentalServiceId,
      equipmentName, accommodationUnitName, rentalServiceName
    } = req.body;
    
    // Validate based on package type
    const pType = packageType || 'lesson';
    const needsLessonService = pType === 'lesson' || includesLessons === true;
    const hasLessonService = lessonServiceId || (lessonServiceName && lessonServiceName !== 'Unknown Service');
    
    if (needsLessonService && !hasLessonService) {
      return res.status(400).json({ 
        error: 'Lesson service is required for lesson packages. Please select a lesson type/service for this package.' 
      });
    }
    
    await client.query('BEGIN');
    
    // Determine primary price/currency (for backwards compatibility)
    let primaryPrice = price;
    let primaryCurrency = currency || 'EUR';
    if (Array.isArray(prices) && prices.length > 0) {
      primaryPrice = prices[0].price;
      primaryCurrency = prices[0].currencyCode || prices[0].currency || 'EUR';
    }
    
    const query = `
      UPDATE service_packages 
      SET name = $1, description = $2, price = $3, currency = $4, sessions_count = $5, total_hours = $6, 
          lesson_service_name = $7, discipline_tag = $8, lesson_category_tag = $9, level_tag = $10, 
          package_type = $11, includes_accommodation = $12, includes_rental = $13, includes_lessons = $14,
          accommodation_nights = $15, rental_days = $16, image_url = $17,
          lesson_service_id = $18, equipment_id = $19, accommodation_unit_id = $20, rental_service_id = $21,
          equipment_name = $22, accommodation_unit_name = $23, rental_service_name = $24, updated_at = NOW()
      WHERE id = $25
      RETURNING *
    `;
    
    const { rows } = await client.query(query, [
      name,
      description || null,
      parseFloat(primaryPrice),
      (primaryCurrency || 'EUR').toUpperCase(),
      parseInt(sessionsCount) || 0,
      parseFloat(totalHours) || 0,
      lessonServiceName || null,
      disciplineTag || null,
      lessonCategoryTag || null,
      levelTag || null,
      pType,
      includesAccommodation || false,
      includesRental || false,
      includesLessons !== false,
      parseInt(accommodationNights) || 0,
      parseInt(rentalDays) || 0,
      imageUrl || null,
      lessonServiceId || null,
      equipmentId || null,
      accommodationUnitId || null,
      rentalServiceId || null,
      equipmentName || null,
      accommodationUnitName || null,
      rentalServiceName || null,
      id
    ]);
    
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Package not found' });
    }
    
    // Handle multi-currency prices
    let allPrices = [];
    if (Array.isArray(prices) && prices.length > 0) {
      const normalizedPrices = prices.map(p => ({
        currencyCode: (p.currencyCode || p.currency || 'EUR').toUpperCase(),
        price: parseFloat(p.price)
      }));
      await setPackagePrices(client, id, normalizedPrices);
      allPrices = normalizedPrices;
    } else if (primaryPrice != null) {
      // Single price provided - sync to prices table
      await setPackagePrices(client, id, [{ currencyCode: (primaryCurrency || 'EUR').toUpperCase(), price: parseFloat(primaryPrice) }]);
      allPrices = [{ currencyCode: (primaryCurrency || 'EUR').toUpperCase(), price: parseFloat(primaryPrice) }];
    }
    
    await client.query('COMMIT');
    
    const updatedPackage = {
      id: rows[0].id,
      name: rows[0].name,
      description: rows[0].description || '',
      price: parseFloat(rows[0].price),
      currency: rows[0].currency,
      currencySymbol: rows[0].currency === 'USD' ? '$' : '€',
      prices: allPrices,
      sessionsCount: rows[0].sessions_count,
      totalHours: parseFloat(rows[0].total_hours) || 0,
      lessonServiceName: rows[0].lesson_service_name,
      pricePerHour: rows[0].total_hours ? Math.round(parseFloat(rows[0].price) / parseFloat(rows[0].total_hours)) : 0,
      disciplineTag: rows[0].discipline_tag || null,
      lessonCategoryTag: rows[0].lesson_category_tag || null,
      levelTag: rows[0].level_tag || null,
      packageType: rows[0].package_type || 'lesson',
      includesAccommodation: rows[0].includes_accommodation || false,
      includesRental: rows[0].includes_rental || false,
      includesLessons: rows[0].includes_lessons !== false,
      accommodationNights: rows[0].accommodation_nights || 0,
      rentalDays: rows[0].rental_days || 0,
      imageUrl: rows[0].image_url || null,
      // Service reference fields
      lessonServiceId: rows[0].lesson_service_id || null,
      equipmentId: rows[0].equipment_id || null,
      accommodationUnitId: rows[0].accommodation_unit_id || null,
      rentalServiceId: rows[0].rental_service_id || null,
      equipmentName: rows[0].equipment_name || null,
      accommodationUnitName: rows[0].accommodation_unit_name || null,
      rentalServiceName: rows[0].rental_service_name || null,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
      status: 'active'
    };
    
    res.json(updatedPackage);
  } catch (error) {
    await client.query('ROLLBACK');
  logger.error('Error updating package:', error);
    res.status(500).json({ error: 'Failed to update package' });
  } finally {
    client.release();
  }
});

// Delete package
router.delete('/packages/:id', authorize(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, check if any services are linked to this package
    const linkedServices = await pool.query(
      'SELECT id, name FROM services WHERE package_id = $1', 
      [id]
    );
    
    if (linkedServices.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete package because it has linked services',
        details: `${linkedServices.rows.length} service(s) are linked to this package`,
        linkedServices: linkedServices.rows.map(s => ({ id: s.id, name: s.name })),
        suggestion: 'Remove the package association from all linked services first, or use force delete.'
      });
    }
    
    const { rows } = await pool.query('DELETE FROM service_packages WHERE id = $1 RETURNING *', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    res.json({ message: 'Package deleted successfully' });
  } catch (error) {
  logger.error('Error deleting package:', error);
    
    // Check if it's a foreign key constraint error
    if (error.code === '23503') {
      return res.status(400).json({ 
        error: 'Cannot delete package due to existing references',
        details: 'This package is referenced by other records in the database'
      });
    }
    
    res.status(500).json({ error: 'Failed to delete package' });
  }
});

// Force delete package (removes package association from linked services)
router.delete('/packages/:id/force', authorize(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    
    const { id } = req.params;
    
    // First, update all linked services to remove package association
    const unlinkResult = await client.query(
  'UPDATE services SET package_id = NULL, updated_at = NOW() WHERE package_id = $1 RETURNING id, name',
      [id, actorId || null]
    );
    
    // Then delete the package
    const deleteResult = await client.query(
      'DELETE FROM service_packages WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (deleteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Package not found' });
    }
    
    await client.query('COMMIT');
    
    res.json({ 
      message: 'Package deleted successfully',
      unlinkedServices: unlinkResult.rows.length,
      details: unlinkResult.rows.length > 0 
        ? `Unlinked ${unlinkResult.rows.length} service(s) from the package`
        : 'No services were linked to this package'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
  logger.error('Error force deleting package:', error);
    res.status(500).json({ error: 'Failed to force delete package' });
  } finally {
    client.release();
  }
});

// ============ END PACKAGE ROUTES ============

// Get a single service by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT s.*, 
            p.name as package_name, 
            p.price as package_price, 
            p.sessions_count,
            cs.symbol as currency_symbol
      FROM services s
      LEFT JOIN service_packages p ON s.package_id = p.id
      LEFT JOIN currency_settings cs ON s.currency = cs.currency_code
      WHERE s.id = $1
    `;
    
    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    const row = rows[0];
    const isPackage = row.package_id !== null;
    
    // Fetch multi-currency prices
    const prices = await getServicePrices(row.id);
    
    const service = {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      level: row.level,
  disciplineTag: row.discipline_tag || null,
  lessonCategoryTag: row.lesson_category_tag || null,
  levelTag: row.level_tag || null,
      serviceType: row.service_type,
      duration: row.duration,
      price: row.price,
      currency: row.currency,
      currencySymbol: row.currency_symbol,
      prices: prices.length > 0 ? prices : [{ currencyCode: row.currency || 'EUR', price: parseFloat(row.price) || 0 }],
      maxParticipants: row.max_participants,
      startTime: row.start_time,
      endTime: row.end_time,
      includes: row.includes,
      imageUrl: row.image_url,
      isPackage,
      ...(isPackage && {
        packageName: row.package_name,
        packagePrice: row.package_price,
        sessionsCount: row.sessions_count
      })
    };
    
    res.json(service);
  } catch (error) {
  logger.error(`Error fetching service with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// Create a new service
// eslint-disable-next-line complexity
router.post('/', authorize(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    const now = new Date();
    // Temporary debug log to diagnose missing fields from frontend
    try {
      logger.info('POST /api/services incoming body snapshot', {
        bodyKeys: Object.keys(req.body || {}),
        name: req.body?.name,
        duration: req.body?.duration,
        category: req.body?.category,
        serviceType: req.body?.serviceType,
        price: req.body?.price,
        currency: req.body?.currency,
      });
    } catch {}

    const {
      name,
      description,
      category,
      level,
      serviceType,
      duration,
      price,
      maxParticipants,
      startTime,
      endTime,
      includes,
      imageUrl,
      isPackage,
      packageName,
      packagePrice,
      sessionsCount,
      currency,
      disciplineTag,
      lessonCategoryTag,
      levelTag,
    } = req.body || {};

    // Resolve and validate critical fields
    const resolvedName = (typeof name === 'string' && name.trim())
      ? name.trim()
      : (typeof req.body?.serviceName === 'string' && req.body.serviceName.trim() ? req.body.serviceName.trim() : null);
    const resolvedCategory = (typeof category === 'string' && category.trim()) ? category.trim() : 'lesson';
    const resolvedLevel = (typeof level === 'string' && level.trim()) ? level.trim() : 'all-levels';
    const resolvedMaxParticipants = (maxParticipants != null)
      ? parseInt(maxParticipants)
      : null;
    const resolvedServiceType = (typeof serviceType === 'string' && serviceType.trim())
      ? serviceType.trim()
      : (resolvedMaxParticipants && resolvedMaxParticipants > 1 ? 'group' : 'private');
    const resolvedDuration = duration != null ? parseFloat(duration) : null;
    const resolvedPrice = price != null ? parseFloat(price) : null;
    const resolvedCurrency = (typeof currency === 'string' && currency.trim()) ? currency.trim() : 'EUR';

    // Fail fast on required fields
    if (!resolvedName) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Validation error: name is required',
        receivedKeys: Object.keys(req.body || {}),
        hint: 'Send { name: string, duration: number, price: number, category: string, serviceType: string }',
      });
    }
    if (resolvedDuration == null || Number.isNaN(resolvedDuration)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Validation error: duration is required and must be a number' });
    }
    if (resolvedPrice == null || Number.isNaN(resolvedPrice)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Validation error: price is required and must be a number' });
    }

    try {
      logger.info('POST /api/services resolved fields', {
        resolvedName,
        resolvedCategory,
        resolvedLevel,
        resolvedServiceType,
        resolvedDuration,
        resolvedPrice,
        resolvedMaxParticipants,
        resolvedCurrency,
      });
    } catch {}

    // Ensure currency exists to satisfy FK when migrations/seeds didn't run
    await ensureCurrencyExists(client, resolvedCurrency);
    
    let packageId = null;
    
    // If it's a package, create or update the package first
    if (isPackage) {
      const packageColumns = [
        'name',
        'price',
        'sessions_count',
        'lesson_service_name',
        'total_hours',
        'created_at',
        'updated_at'
      ];
      const packageValues = [
        packageName,
        packagePrice,
        sessionsCount,
        resolvedName, // Set lesson_service_name to match the service name
        resolvedDuration * sessionsCount, // Calculate total hours
        now,
        now
      ];
      const { columns: packageInsertColumns, values: packageInsertValues } = appendCreatedBy(
        packageColumns,
        packageValues,
        actorId
      );
      const packagePlaceholders = packageInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');

      const packageResult = await client.query(
        `INSERT INTO service_packages (${packageInsertColumns.join(', ')}) VALUES (${packagePlaceholders}) RETURNING id`,
        packageInsertValues
      );
      packageId = packageResult.rows[0].id;
    }
    
    // Create the service
    const serviceId = uuidv4();
    const serviceColumns = [
      'id',
      'name',
      'description',
      'category',
      'level',
      'service_type',
      'duration',
      'price',
      'max_participants',
      'start_time',
      'end_time',
      'includes',
      'image_url',
      'package_id',
      'currency',
      'discipline_tag',
      'lesson_category_tag',
      'level_tag',
      'created_at',
      'updated_at'
    ];
    const serviceValues = [
      serviceId,
      resolvedName,
      description || null,
      resolvedCategory,
      resolvedLevel,
      resolvedServiceType,
      resolvedDuration,
      resolvedPrice,
      resolvedMaxParticipants || null,
      startTime || null,
      endTime || null,
      includes || null,
      imageUrl || null,
      packageId,
      resolvedCurrency,
      disciplineTag || null,
      lessonCategoryTag || null,
      levelTag || null,
      now,
      now
    ];
    const { columns: serviceInsertColumns, values: serviceInsertValues } = appendCreatedBy(
      serviceColumns,
      serviceValues,
      actorId
    );
    const servicePlaceholders = serviceInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');

    await client.query(
      `INSERT INTO services (${serviceInsertColumns.join(', ')}) VALUES (${servicePlaceholders})`,
      serviceInsertValues
    );
    
    // Handle multi-currency prices for the service
    const { prices } = req.body || {};
    let allPrices = [];
    if (Array.isArray(prices) && prices.length > 0) {
      const normalizedPrices = prices.map(p => ({
        currencyCode: (p.currencyCode || p.currency || 'EUR').toUpperCase(),
        price: parseFloat(p.price)
      }));
      await setServicePrices(client, serviceId, normalizedPrices);
      allPrices = normalizedPrices;
    } else if (resolvedPrice != null) {
      // Single price provided - sync to prices table
      await setServicePrices(client, serviceId, [{ currencyCode: resolvedCurrency.toUpperCase(), price: resolvedPrice }]);
      allPrices = [{ currencyCode: resolvedCurrency.toUpperCase(), price: resolvedPrice }];
    }
    
    await client.query('COMMIT');
    
    // Fetch the complete created service with currency symbol
    const fetchCreatedQuery = `
      SELECT s.*, 
            p.name as package_name, 
            p.price as package_price, 
            p.sessions_count,
            cs.symbol as currency_symbol
      FROM services s
      LEFT JOIN service_packages p ON s.package_id = p.id
      LEFT JOIN currency_settings cs ON s.currency = cs.currency_code
      WHERE s.id = $1
    `;
    
    const createdResult = await client.query(fetchCreatedQuery, [serviceId]);
    
    if (createdResult.rows.length === 0) {
      return res.status(404).json({ error: 'Created service not found' });
    }
    
    const row = createdResult.rows[0];
    const isPackageResult = row.package_id !== null;
    
    const createdService = {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      level: row.level,
      serviceType: row.service_type,
      duration: row.duration,
      price: row.price,
      currency: row.currency,
      currencySymbol: row.currency_symbol,
      prices: allPrices,
      maxParticipants: row.max_participants,
      startTime: row.start_time,
      endTime: row.end_time,
      includes: row.includes,
      imageUrl: row.image_url,
      disciplineTag: row.discipline_tag || null,
      lessonCategoryTag: row.lesson_category_tag || null,
      levelTag: row.level_tag || null,
      isPackage: isPackageResult,
      ...(isPackageResult && {
        packageName: row.package_name,
        packagePrice: row.package_price,
        sessionsCount: row.sessions_count
      })
    };
    
    // Broadcast real-time event for service creation
    if (req.socketService) {
      try {
        req.socketService.emitToChannel('general', 'service:created', createdService);
      } catch (socketError) {
  logger.error('Error broadcasting service creation:', socketError);
      }
    }
    
    res.status(201).json(createdService);
  } catch (error) {
    await client.query('ROLLBACK');
  logger.error('Error creating service:', error);
    res.status(500).json({ error: 'Failed to create service' });
  } finally {
    client.release();
  }
});

// Update an existing service
// eslint-disable-next-line complexity
router.put('/:id', authorize(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const actorId = resolveActorId(req);
    
    const { id } = req.params;
    const {
      name,
      description,
      category,
      level,
      serviceType,
      duration,
      price,
      maxParticipants,
      startTime,
      endTime,
      includes,
      imageUrl,
      isPackage,
      packageName,
      packagePrice,
      sessionsCount,
      currency
    } = req.body;
    
    // Check if service exists
    const checkQuery = 'SELECT package_id FROM services WHERE id = $1';
    const checkResult = await client.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    const existingPackageId = checkResult.rows[0].package_id;
    let packageId = existingPackageId;
    
    // Handle package changes
    if (isPackage) {
      if (existingPackageId) {
        // Update existing package
        const updatePackageQuery = `
          UPDATE service_packages
          SET name = $1, price = $2, sessions_count = $3,
              lesson_service_name = $4, total_hours = $5,
              updated_at = NOW()
          WHERE id = $6
        `;
        await client.query(updatePackageQuery, [
          packageName,
          packagePrice,
          sessionsCount,
          name, // Set lesson_service_name to match the service name
          duration * sessionsCount, // Calculate total hours
          existingPackageId
        ]);
      } else {
        // Create new package
        const packageColumns = [
          'name',
          'price',
          'sessions_count',
          'lesson_service_name',
          'total_hours',
          'created_at',
          'updated_at'
        ];
        const packageValues = [
          packageName,
          packagePrice,
          sessionsCount,
          name, // Set lesson_service_name to match the service name
          duration * sessionsCount, // Calculate total hours
          new Date(),
          new Date()
        ];
        const { columns: packageInsertColumns, values: packageInsertValues } = appendCreatedBy(
          packageColumns,
          packageValues,
          actorId
        );
        const packagePlaceholders = packageInsertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
        const packageResult = await client.query(
          `INSERT INTO service_packages (${packageInsertColumns.join(', ')}) VALUES (${packagePlaceholders}) RETURNING id`,
          packageInsertValues
        );
        packageId = packageResult.rows[0].id;
      }
    } else {
      // Remove package association if it was previously a package
      packageId = null;
    }
    
  // Ensure currency exists before update to avoid FK violation
  await ensureCurrencyExists(client, currency);

  // Update the service
  const updateServiceQuery = `
      UPDATE services
      SET name = $1, description = $2, category = $3, level = $4,
          service_type = $5, duration = $6, price = $7, max_participants = $8,
          start_time = $9, end_time = $10, includes = $11, image_url = $12,
      package_id = $13, currency = $14,
      discipline_tag = $15, lesson_category_tag = $16, level_tag = $17,
      updated_at = NOW()
    WHERE id = $18
    `;
    
    await client.query(updateServiceQuery, [
      name,
      description,
      category,
      level,
      serviceType,
      duration,
      price,
      maxParticipants || null,
      startTime || null,
      endTime || null,
      includes || null,
      imageUrl || null,
      packageId,
      currency,
      req.body?.disciplineTag || null,
      req.body?.lessonCategoryTag || null,
      req.body?.levelTag || null,
      id
    ]);
    
    // Handle multi-currency prices for the service
    const { prices } = req.body || {};
    let allPrices = [];
    if (Array.isArray(prices) && prices.length > 0) {
      const normalizedPrices = prices.map(p => ({
        currencyCode: (p.currencyCode || p.currency || 'EUR').toUpperCase(),
        price: parseFloat(p.price)
      }));
      await setServicePrices(client, id, normalizedPrices);
      allPrices = normalizedPrices;
    } else if (price != null && currency) {
      // Single price provided - sync to prices table
      await setServicePrices(client, id, [{ currencyCode: (currency || 'EUR').toUpperCase(), price: parseFloat(price) }]);
      allPrices = [{ currencyCode: (currency || 'EUR').toUpperCase(), price: parseFloat(price) }];
    }
    
    await client.query('COMMIT');
    
    // Fetch the complete updated service with currency symbol
    const fetchUpdatedQuery = `
      SELECT s.*, 
            p.name as package_name, 
            p.price as package_price, 
            p.sessions_count,
            cs.symbol as currency_symbol
      FROM services s
      LEFT JOIN service_packages p ON s.package_id = p.id
      LEFT JOIN currency_settings cs ON s.currency = cs.currency_code
      WHERE s.id = $1
    `;
    
    const updatedResult = await client.query(fetchUpdatedQuery, [id]);
    
    if (updatedResult.rows.length === 0) {
      return res.status(404).json({ error: 'Updated service not found' });
    }
    
    const row = updatedResult.rows[0];
    const isPackageResult = row.package_id !== null;
    
    const updatedService = {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      level: row.level,
      serviceType: row.service_type,
      duration: row.duration,
      price: row.price,
      currency: row.currency,
      currencySymbol: row.currency_symbol,
      prices: allPrices,
      maxParticipants: row.max_participants,
      startTime: row.start_time,
      endTime: row.end_time,
      includes: row.includes,
      imageUrl: row.image_url,
      disciplineTag: row.discipline_tag || null,
      lessonCategoryTag: row.lesson_category_tag || null,
      levelTag: row.level_tag || null,
      isPackage: isPackageResult,
      ...(isPackageResult && {
        packageName: row.package_name,
        packagePrice: row.package_price,
        sessionsCount: row.sessions_count
      })
    };
    
    res.json(updatedService);
  } catch (error) {
    await client.query('ROLLBACK');
  logger.error(`Error updating service with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update service' });
  } finally {
    client.release();
  }
});

// Delete a service
router.delete('/:id', authorize(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if service exists and get its package_id if any
    const checkQuery = 'SELECT package_id FROM services WHERE id = $1';
    const checkResult = await client.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    const packageId = checkResult.rows[0].package_id;
    
    // Delete the service
    await client.query('DELETE FROM services WHERE id = $1', [id]);
    
    // If it was part of a package and no other services use it, delete the package too
    if (packageId) {
      const checkPackageUsageQuery = 'SELECT COUNT(*) FROM services WHERE package_id = $1';
      const packageUsageResult = await client.query(checkPackageUsageQuery, [packageId]);
      
      if (parseInt(packageUsageResult.rows[0].count) === 0) {
        await client.query('DELETE FROM service_packages WHERE id = $1', [packageId]);
      }
    }
    
    await client.query('COMMIT');
    
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
  logger.error(`Error deleting service with ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to delete service' });
  } finally {
    client.release();
  }
});

// Get service categories
router.get('/categories/list', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT category FROM services ORDER BY category';
    const { rows } = await pool.query(query);
    
    const categories = rows.map(row => row.category);
    res.json(categories);
  } catch (error) {
  logger.error('Error fetching service categories:', error);
    res.status(500).json({ error: 'Failed to fetch service categories' });  }
});

// ===== PACKAGE MANAGEMENT ENDPOINTS =====

// ============ CUSTOMER PACKAGE ROUTES ============
// Routes for managing customer-purchased packages

// Get customer packages for a specific customer
router.get('/customer-packages/:customerId', authenticateJWT, authorize(['admin', 'manager', 'student', 'outsider']), async (req, res) => {
  const runQuery = async () => {
    const { customerId } = req.params;
    const userRole = req.user?.role;
    const authenticatedUserId = req.user?.id;
    
    // Students and outsiders can only access their own packages
    if ((userRole === 'student' || userRole === 'outsider') && customerId !== authenticatedUserId) {
      return res.status(403).json({ error: 'You can only access your own packages' });
    }

    const query = `
      SELECT cp.*, sp.name as service_package_name, sp.lesson_service_name,
             sp.discipline_tag as sp_discipline_tag,
             sp.lesson_category_tag as sp_lesson_category_tag,
             sp.level_tag as sp_level_tag
      FROM customer_packages cp
      LEFT JOIN service_packages sp ON cp.service_package_id = sp.id
      WHERE cp.customer_id = $1
      ORDER BY cp.created_at DESC
    `;

    const { rows } = await pool.query(query, [customerId]);

    const customerPackages = rows.map(row => ({
      id: row.id,
      customerId: row.customer_id,
      servicePackageId: row.service_package_id,
      packageName: row.package_name,
      lessonType: row.lesson_service_name || row.package_name,
      totalHours: parseFloat(row.total_hours) || 0,
      usedHours: parseFloat(row.used_hours) || 0,
      remainingHours: parseFloat(row.remaining_hours) || 0,
      // Also include the original database field names for compatibility
      total_hours: parseFloat(row.total_hours) || 0,
      used_hours: parseFloat(row.used_hours) || 0,
      remaining_hours: parseFloat(row.remaining_hours) || 0,
      package_name: row.package_name,
      lesson_service_name: row.lesson_service_name || row.package_name,
  price: parseFloat(row.purchase_price),
  // structured tags from service_packages (if any)
  disciplineTag: row.sp_discipline_tag || null,
  lessonCategoryTag: row.sp_lesson_category_tag || null,
  levelTag: row.sp_level_tag || null,
      currency: row.currency || 'EUR',
      purchaseDate: row.purchase_date,
      expiryDate: row.expiry_date,
      lastUsedDate: row.last_used_date,
      status: row.status,
      notes: row.notes,
      packageType: row.total_hours > 0 ? 'lesson-only' : 'other', // Simplified logic
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    res.json(customerPackages);
  };

  try {
    await runQuery();
  } catch (error) {
    // Handle transient connection issues with one retry
    const message = String(error?.message || '').toLowerCase();
    const isTransient =
      message.includes('terminated unexpectedly') ||
      message.includes('connection reset') ||
      message.includes('socket hang up') ||
      message.includes('server closed the connection');

    if (isTransient) {
      try {
  logger.warn('Retrying customer-packages query after transient DB error...');
        await new Promise(r => setTimeout(r, 200));
        await runQuery();
        return;
      } catch (retryErr) {
  logger.error('Retry failed for customer packages:', retryErr);
      }
    }

  logger.error('Error fetching customer packages:', error);
    res.status(500).json({ error: 'Failed to fetch customer packages' });
  }
});

// Create/Purchase a package for a customer
// eslint-disable-next-line complexity
router.post('/customer-packages', authorize(['admin', 'manager']), async (req, res) => {
  try {
    const {
      customerId,
      servicePackageId,
      packageName,
      lessonServiceName,
      totalHours,
      purchasePrice,
      currency,
      expiryDate,
      notes
    } = req.body;
    
    // Validate required fields
    if (!customerId || !servicePackageId || !packageName || !purchasePrice) {
      return res.status(400).json({ 
        error: 'Missing required fields: customerId, servicePackageId, packageName, purchasePrice' 
      });
    }

  const actorId = resolveActorId(req);
  const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const packagePrice = parseFloat(purchasePrice);
      
      // Verify customer exists and get their preferred currency
      const userCheck = await client.query('SELECT id, balance, preferred_currency FROM users WHERE id = $1', [customerId]);
      if (userCheck.rows.length === 0) {
        throw new Error('Customer not found');
      }
      
      // Storage currency is always EUR (base currency)
      // We accept currency param for frontend display purposes but always store in EUR
      const storageCurrency = 'EUR';
      const inputCurrency = currency || userCheck.rows[0].preferred_currency || 'EUR';
      
      // Create the package record
      const customerPackageId = uuidv4();
      const packageQuery = `
        INSERT INTO customer_packages (
          id, customer_id, service_package_id, package_name, lesson_service_name,
          total_hours, remaining_hours, purchase_price, currency, expiry_date, notes, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, 'active')
        RETURNING *
      `;
      
      const { rows } = await client.query(packageQuery, [
        customerPackageId,
        customerId,
        servicePackageId,
        packageName,
        lessonServiceName || packageName,
        parseFloat(totalHours) || 0,
        packagePrice,
        storageCurrency, // Always store in EUR
        expiryDate || null,
        notes || null
      ]);

      // Create package purchase transaction (debit from customer balance)
      try {
        await recordLegacyTransaction({
          client,
          userId: customerId,
          amount: -Math.abs(packagePrice),
          transactionType: 'package_purchase',
          status: 'completed',
          direction: 'debit',
          description: `Package Purchase: ${packageName}`,
          currency: storageCurrency, // Always store in EUR
          paymentMethod: 'package_deal',
          referenceNumber: customerPackageId,
          metadata: {
            packageId: customerPackageId,
            servicePackageId,
            totalHours: parseFloat(totalHours) || 0,
            purchasePrice: packagePrice,
            source: 'services:customer-packages:create',
            inputCurrency // Track original input currency for audit
          },
          entityType: 'customer_package',
          relatedEntityType: 'customer_package',
          relatedEntityId: customerPackageId,
          createdBy: actorId || null,
          allowNegative: true
        });
      } catch (walletError) {
        logger.error('Failed to record package purchase in wallet ledger', {
          customerId,
          packageId: customerPackageId,
          error: walletError?.message
        });
        throw walletError;
      }
      
      await client.query('COMMIT');
      
      const newCustomerPackage = {
        id: rows[0].id,
        customerId: rows[0].customer_id,
        servicePackageId: rows[0].service_package_id,
        packageName: rows[0].package_name,
        lessonType: rows[0].lesson_service_name,
        totalHours: parseFloat(rows[0].total_hours) || 0,
        usedHours: parseFloat(rows[0].used_hours) || 0,
        remainingHours: parseFloat(rows[0].remaining_hours) || 0,
        price: parseFloat(rows[0].purchase_price),
        currency: rows[0].currency,
        purchaseDate: rows[0].purchase_date,
        expiryDate: rows[0].expiry_date,
        status: rows[0].status,
        notes: rows[0].notes,
        packageType: 'lesson-only',
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at
      };
      
      res.status(201).json({
        ...newCustomerPackage,
        message: `Package assigned successfully. €${packagePrice} deducted from customer balance.`
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('Error creating customer package:', error);
    res.status(500).json({ error: 'Failed to create customer package', details: error.message });
  }
});

// Use hours from a customer package
router.post('/customer-packages/:id/use-hours', authorize(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { hoursToUse, bookingDate, notes } = req.body;
    
    if (!hoursToUse || hoursToUse <= 0) {
      return res.status(400).json({ error: 'Invalid hours to use' });
    }
    
    // Get current package details
    const getCurrentQuery = 'SELECT * FROM customer_packages WHERE id = $1';
    const currentResult = await pool.query(getCurrentQuery, [id]);
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer package not found' });
    }
    
    const currentPackage = currentResult.rows[0];
    const remainingHours = parseFloat(currentPackage.remaining_hours) || 0;
    
    if (hoursToUse > remainingHours) {
      return res.status(400).json({ 
        error: `Insufficient hours. Only ${remainingHours} hours remaining.` 
      });
    }
    
    // Update package hours
    const newUsedHours = (parseFloat(currentPackage.used_hours) || 0) + parseFloat(hoursToUse);
    const newRemainingHours = remainingHours - parseFloat(hoursToUse);
    const newStatus = newRemainingHours <= 0 ? 'used_up' : currentPackage.status;
    
    const updateQuery = `
      UPDATE customer_packages 
      SET used_hours = $1, remaining_hours = $2, last_used_date = $3, status = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;
    
    const { rows } = await pool.query(updateQuery, [
      newUsedHours,
      newRemainingHours,
      bookingDate || new Date().toISOString().split('T')[0],
      newStatus,
      id
    ]);
    
    // Create a session/booking record (simplified)
    // In a real app, this would create a proper booking record
    const sessionRecord = {
      id: uuidv4(),
      customerPackageId: id,
      customerId: currentPackage.customer_id,
      hoursUsed: parseFloat(hoursToUse),
      bookingDate: bookingDate || new Date().toISOString().split('T')[0],
      notes: notes || `Used ${hoursToUse} hours from ${currentPackage.package_name}`,
      createdAt: new Date().toISOString()
    };
    
    const updatedPackage = {
      id: rows[0].id,
      customerId: rows[0].customer_id,
      servicePackageId: rows[0].service_package_id,
      packageName: rows[0].package_name,
      lessonType: rows[0].lesson_service_name,
      totalHours: parseFloat(rows[0].total_hours) || 0,
      usedHours: parseFloat(rows[0].used_hours) || 0,
      remainingHours: parseFloat(rows[0].remaining_hours) || 0,
      price: parseFloat(rows[0].purchase_price),
      currency: rows[0].currency,
      purchaseDate: rows[0].purchase_date,
      expiryDate: rows[0].expiry_date,
      lastUsedDate: rows[0].last_used_date,
      status: rows[0].status,
      notes: rows[0].notes,
      packageType: 'lesson-only',
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at
    };
    
    res.json({
      package: updatedPackage,
      session: sessionRecord,
      message: `Successfully used ${hoursToUse} hours. ${newRemainingHours} hours remaining.`
    });
    
  } catch (error) {
    logger.error('Error using package hours:', error);
    res.status(500).json({ error: 'Failed to use package hours' });
  }
});

// Delete a customer package and all dependent data
router.delete('/customer-packages/:id', authorize(['admin', 'manager']), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const actorId = resolveActorId(req);

    const deleteResult = await forceDeleteCustomerPackage({
      client,
      packageId: id,
      actorId,
      issueRefund: true
    });

    await client.query('COMMIT');

    logger.info('Customer package force-deleted with cleanup', {
      packageId: id,
      participantRefsCleared: deleteResult.cleanup.participantReferencesCleared,
      bookingRefsCleared: deleteResult.cleanup.bookingReferencesCleared,
      refundAmount: deleteResult.refundDetails.calculatedRefundAmount,
      remainingHours: deleteResult.refundDetails.remainingHours,
      totalHours: deleteResult.refundDetails.totalHours
    });

    const refundAmount = deleteResult.refundDetails.calculatedRefundAmount;
    const remainingHours = deleteResult.refundDetails.remainingHours;
    const totalHours = deleteResult.refundDetails.totalHours;

    const refundMessage = refundAmount > 0
      ? `€${refundAmount.toFixed(2)} partial refund for ${remainingHours} unused hours`
      : 'No refund (package fully used)';

    res.json({
      message: 'Customer package deleted successfully',
      refund: refundMessage,
      cleanup: deleteResult.cleanup,
      refundDetails: deleteResult.refundDetails,
      walletSummary: deleteResult.walletSummary,
      walletTransaction: mapWalletTransactionForResponse(deleteResult.walletTransaction)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Error force-deleting customer package:', error);
    res.status(500).json({ error: 'Failed to delete customer package' });
  } finally {
    client.release();
  }
});

// Archive a customer package (soft disable without refund) - REMOVED, using force-delete instead

// ============ END CUSTOMER PACKAGE ROUTES ============

// ============ CATEGORY ROUTES ============

// Create new category
router.post('/categories', authorize(['admin', 'manager']), async (req, res) => {
  try {
    const { name, type, description, status = 'active' } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO service_categories (name, type, description, status, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, NOW(), NOW()) 
       RETURNING *`,
      [name, type, description, status]
    );
    
    res.status(201).json(rows[0]);
  } catch (error) {
    logger.error('Error creating category:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Category name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create category' });
    }
  }
});

// Update category
router.put('/categories/:id', authorize(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, description, status } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const { rows } = await pool.query(
      `UPDATE service_categories 
       SET name = $1, type = $2, description = $3, status = $4, updated_at = NOW()
       WHERE id = $5 
       RETURNING *`,
      [name, type, description, status, id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    logger.error('Error updating category:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Category name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update category' });
    }
  }
});

// Delete category
router.delete('/categories/:id', authorize(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if category is in use
    const { rows: servicesUsingCategory } = await pool.query(
      'SELECT COUNT(*) as count FROM services WHERE category = (SELECT name FROM service_categories WHERE id = $1)',
      [id]
    );
    
    if (parseInt(servicesUsingCategory[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category that is in use by services' 
      });
    }
    
    const { rows } = await pool.query(
      'DELETE FROM service_categories WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    logger.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
