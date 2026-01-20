#!/usr/bin/env node
/**
 * Plannivo Realistic Population Script
 * 
 * Simulates real user journeys through the app:
 * 1. User Registration (outsider role)
 * 2. Waiver Signing (required for activities)
 * 3. Wallet Top-up (various amounts)
 * 4. Package Purchases (lesson bundles)
 * 5. Individual Lesson Bookings
 * 6. Group Lesson Bookings
 * 7. Equipment Rentals
 * 
 * Creates realistic data with proper names, currencies (EUR/TRY only)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@plannivo.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MANIFEST_FILE = path.join(__dirname, 'population_manifest.json');

const TOTAL_USERS = 2000;
const BATCH_SIZE = 50;
const EMAIL_DOMAIN = 'plannivo.com';

// Realistic name pools (200+ names from 10+ nationalities)
const FIRST_NAMES = [
  // English
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
  'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth',
  'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Dorothy', 'Kimberly', 'Emily', 'Donna', 'Michelle',
  // Spanish
  'Carlos', 'Miguel', 'Jose', 'Luis', 'Juan', 'Pedro', 'Antonio', 'Francisco', 'Manuel', 'Fernando',
  'Maria', 'Carmen', 'Rosa', 'Ana', 'Elena', 'Isabel', 'Lucia', 'Paula', 'Sofia', 'Laura',
  // German
  'Hans', 'Klaus', 'Stefan', 'Wolfgang', 'Jurgen', 'Peter', 'Dieter', 'Helmut', 'Uwe', 'Ralf',
  'Anna', 'Sabine', 'Monika', 'Petra', 'Ursula', 'Brigitte', 'Ingrid', 'Helga', 'Renate', 'Heike',
  // French
  'Pierre', 'Jean', 'Michel', 'Philippe', 'Alain', 'Bernard', 'Jacques', 'Francois', 'Laurent', 'Olivier',
  'Marie', 'Nathalie', 'Isabelle', 'Sylvie', 'Catherine', 'Francoise', 'Monique', 'Nicole', 'Valerie', 'Sophie',
  // Italian
  'Marco', 'Giuseppe', 'Giovanni', 'Luca', 'Alessandro', 'Andrea', 'Matteo', 'Lorenzo', 'Davide', 'Simone',
  'Giulia', 'Francesca', 'Chiara', 'Sara', 'Valentina', 'Alessia', 'Martina', 'Elisa', 'Federica', 'Silvia',
  // Turkish
  'Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hasan', 'Huseyin', 'Emre', 'Burak', 'Can', 'Murat',
  'Ayse', 'Fatma', 'Zeynep', 'Elif', 'Esra', 'Merve', 'Ozlem', 'Derya', 'Seda', 'Ebru',
  // Portuguese
  'Joao', 'Tiago', 'Rui', 'Nuno', 'Bruno', 'Hugo', 'Ricardo', 'Goncalo', 'Diogo', 'Vasco',
  'Marta', 'Ines', 'Catarina', 'Beatriz', 'Mariana', 'Joana', 'Rita', 'Carolina', 'Daniela', 'Leonor',
  // Dutch
  'Jan', 'Pieter', 'Willem', 'Hendrik', 'Cornelis', 'Gerrit', 'Johannes', 'Dirk', 'Jacobus', 'Maarten',
  'Johanna', 'Cornelia', 'Wilhelmina', 'Hendrika', 'Geertruida', 'Adriana', 'Jacoba', 'Emma', 'Julia', 'Lotte',
  // Polish
  'Piotr', 'Krzysztof', 'Andrzej', 'Tomasz', 'Pawel', 'Michal', 'Marcin', 'Grzegorz', 'Jakub', 'Adam',
  'Katarzyna', 'Malgorzata', 'Agnieszka', 'Ewa', 'Krystyna', 'Elzbieta', 'Zofia', 'Aleksandra', 'Natalia', 'Karolina',
  // Scandinavian
  'Erik', 'Lars', 'Anders', 'Johan', 'Olof', 'Magnus', 'Nils', 'Henrik', 'Gustav', 'Oscar',
  'Astrid', 'Sigrid', 'Freya', 'Elsa', 'Maja', 'Linnea', 'Saga', 'Ebba', 'Wilma', 'Alma'
];

const LAST_NAMES = [
  // English/American
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White',
  'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott',
  // Spanish
  'Gonzalez', 'Hernandez', 'Lopez', 'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Flores', 'Rivera', 'Gomez',
  'Diaz', 'Reyes', 'Cruz', 'Morales', 'Ortiz', 'Gutierrez', 'Chavez', 'Ramos', 'Vargas', 'Castillo',
  // German
  'Muller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann',
  'Koch', 'Richter', 'Klein', 'Wolf', 'Schroder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Kruger',
  // French
  'Dubois', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Lefebvre', 'Bertrand',
  'Roux', 'Vincent', 'Fournier', 'Girard', 'Bonnet', 'Dupont', 'Lambert', 'Fontaine', 'Rousseau', 'Blanc',
  // Italian
  'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco',
  'Bruno', 'Gallo', 'Conti', 'DeLuca', 'Costa', 'Giordano', 'Mancini', 'Rizzo', 'Lombardi', 'Moretti',
  // Turkish
  'Yilmaz', 'Kaya', 'Demir', 'Celik', 'Sahin', 'Yildiz', 'Yildirim', 'Ozturk', 'Aydin', 'Ozdemir',
  'Arslan', 'Dogan', 'Kilic', 'Aslan', 'Cetin', 'Kara', 'Koc', 'Kurt', 'Ozkan', 'Simsek',
  // Portuguese
  'Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Rodrigues', 'Martins', 'Jesus', 'Sousa', 'Fernandes',
  'Goncalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira',
  // Dutch
  'DeJong', 'Jansen', 'DeVries', 'VanDenBerg', 'VanDijk', 'Bakker', 'Janssen', 'Visser', 'Smit', 'Meijer',
  'DeBoer', 'Mulder', 'DeGroot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'VanLeeuwen', 'Dekker', 'Brouwer',
  // Polish
  'Nowak', 'Kowalski', 'Wisniewski', 'Wojcik', 'Kowalczyk', 'Kaminski', 'Lewandowski', 'Zielinski', 'Szymanski', 'Wozniak',
  // Scandinavian
  'Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson'
];

// Statistics tracking
const stats = {
  usersCreated: 0,
  usersFailed: 0,
  waiversSigned: 0,
  waiversFailed: 0,
  depositsCreated: 0,
  depositsFailed: 0,
  packagesPurchased: 0,
  packagesFailed: 0,
  bookingsCreated: 0,
  bookingsFailed: 0,
  groupBookingsCreated: 0,
  groupBookingsFailed: 0,
  rentalsCreated: 0,
  rentalsFailed: 0,
};

// Manifest to track created resources for rollback
const manifest = {
  users: [],
  waivers: [],
  deposits: [],
  packages: [],
  bookings: [],
  rentals: [],
  createdAt: new Date().toISOString(),
};

// ============================================================================
// API HELPERS
// ============================================================================

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    if (!response.ok) {
      throw new Error(typeof data === 'object' ? JSON.stringify(data) : data);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
}

async function getAdminToken() {
  console.log('🔐 Authenticating as admin...');
  try {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }),
    });
    console.log('✅ Admin authentication successful');
    return result.token;
  } catch (error) {
    console.error('❌ Admin authentication failed:', error.message);
    throw error;
  }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchSystemData(token) {
  console.log('📋 Fetching system data...');
  const headers = { Authorization: `Bearer ${token}` };
  const data = {
    outsiderRoleId: null,
    services: [],
    instructors: [],
    packages: [],
    equipment: [],
    waiverVersion: null,
  };
  
  // Get roles
  try {
    const roles = await apiRequest('/roles', { headers });
    const roleList = Array.isArray(roles) ? roles : roles.roles || [];
    const outsiderRole = roleList.find(r => r.name === 'outsider');
    data.outsiderRoleId = outsiderRole?.id;
    console.log(`   ✅ Found outsider role: ${data.outsiderRoleId || 'default'}`);
  } catch (error) {
    console.log('   ⚠️  Could not fetch roles');
  }
  
  // Get services (for bookings)
  try {
    const result = await apiRequest('/services', { headers });
    data.services = Array.isArray(result) ? result : result.services || result.data || [];
    console.log(`   ✅ Found ${data.services.length} services`);
  } catch (error) {
    console.log('   ⚠️  Could not fetch services');
  }
  
  // Get instructors
  try {
    const result = await apiRequest('/users?role=instructor', { headers });
    data.instructors = Array.isArray(result) ? result : result.users || result.data || [];
    console.log(`   ✅ Found ${data.instructors.length} instructors`);
  } catch (error) {
    console.log('   ⚠️  Could not fetch instructors');
  }
  
  // Get packages (for purchases)
  try {
    const result = await apiRequest('/services/packages', { headers });
    data.packages = Array.isArray(result) ? result : result.packages || result.data || [];
    console.log(`   ✅ Found ${data.packages.length} packages available`);
  } catch (error) {
    console.log('   ⚠️  Could not fetch packages');
  }
  
  // Get equipment (for rentals)
  try {
    const result = await apiRequest('/equipment', { headers });
    data.equipment = Array.isArray(result) ? result : result.equipment || result.data || [];
    console.log(`   ✅ Found ${data.equipment.length} equipment items`);
  } catch (error) {
    console.log('   ⚠️  Could not fetch equipment');
  }
  
  // Get latest waiver version
  try {
    const result = await apiRequest('/waivers/template?language=en');
    data.waiverVersion = result.data || result;
    console.log(`   ✅ Found waiver version: ${data.waiverVersion?.version_number || '1.0'}`);
  } catch (error) {
    console.log('   ⚠️  Could not fetch waiver template');
  }
  
  return data;
}

// ============================================================================
// USER DATA GENERATION
// ============================================================================

function generateUserData(index) {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  
  // Professional email format
  const sanitizedFirst = firstName.toLowerCase();
  const sanitizedLast = lastName.toLowerCase();
  const suffix = Math.floor(Math.random() * 999) + 1;
  const email = `${sanitizedFirst}.${sanitizedLast}${suffix}@${EMAIL_DOMAIN}`;
  
  // European phone formats
  const countryCode = ['+49', '+33', '+34', '+39', '+90', '+31', '+48', '+46', '+45'][Math.floor(Math.random() * 9)];
  const phoneNumber = `${countryCode}${Math.floor(100000000 + Math.random() * 900000000)}`;
  
  // Only EUR and TRY (as they have service prices)
  const currency = Math.random() > 0.3 ? 'EUR' : 'TRY';
  
  return {
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phoneNumber,
    password: 'Welcome2024!',
    age: 18 + Math.floor(Math.random() * 52),
    weight: 50 + Math.floor(Math.random() * 60),
    preferred_currency: currency,
  };
}

// ============================================================================
// USER JOURNEY STEPS
// ============================================================================

// Step 1: Create User
async function createUser(adminToken, userData, roleId) {
  const payload = { ...userData };
  if (roleId) payload.role_id = roleId;
  
  try {
    const result = await apiRequest('/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(payload),
    });
    return result;
  } catch (error) {
    // Fallback to public registration
    const result = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    return result;
  }
}

// Step 2: Login as User
async function loginAsUser(email, password) {
  const result = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return result.token;
}

// Step 3: Sign Waiver
async function signWaiver(userToken, userId, waiverVersion) {
  // Minimal valid PNG signature
  const signatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  const result = await apiRequest('/waivers/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({
      user_id: userId,
      waiver_version: waiverVersion?.version_number || '1.0',
      language_code: 'en',
      signature_data: signatureData,
      agreed_to_terms: true,
      photo_consent: Math.random() > 0.2, // 80% consent to photos
    }),
  });
  return result;
}

// Step 4: Add Wallet Balance
async function addWalletBalance(adminToken, userId, amount, currency) {
  const result = await apiRequest('/wallet/manual-adjust', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      userId,
      amount,
      currency,
      transactionType: 'manual_credit',
      description: 'Account top-up',
      metadata: {},
    }),
  });
  return result;
}

// Step 5: Purchase Package
async function purchasePackage(adminToken, userId, packageId, currency) {
  const result = await apiRequest('/services/packages/purchase', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      user_id: userId,
      package_id: packageId,
      payment_method: 'wallet',
      currency,
    }),
  });
  return result;
}

// Step 6: Create Booking
async function createBooking(adminToken, userId, instructorId, serviceId, currency, usePackage = false) {
  // Future date 1-60 days from now
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 1 + Math.floor(Math.random() * 60));
  const dateStr = futureDate.toISOString().split('T')[0];
  
  // Business hours 9-18
  const startHour = 9 + Math.floor(Math.random() * 9);
  const durations = [0.5, 1, 1.5, 2];
  const duration = durations[Math.floor(Math.random() * durations.length)];
  
  const result = await apiRequest('/bookings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      date: dateStr,
      start_hour: startHour,
      duration,
      student_user_id: userId,
      instructor_user_id: instructorId,
      service_id: serviceId,
      status: 'confirmed',
      use_package: usePackage,
      amount: usePackage ? 0 : 80 * duration,
      wallet_currency: currency,
    }),
  });
  return result;
}

// Step 7: Create Group Booking
async function createGroupBooking(adminToken, participants, instructorId, serviceId) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 1 + Math.floor(Math.random() * 60));
  const dateStr = futureDate.toISOString().split('T')[0];
  
  const startHour = 9 + Math.floor(Math.random() * 9);
  
  const result = await apiRequest('/bookings/group', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      date: dateStr,
      start_hour: startHour,
      duration: 2,
      instructor_user_id: instructorId,
      service_id: serviceId,
      status: 'confirmed',
      participants: participants.map((p, idx) => ({
        userId: p.userId,
        isPrimary: idx === 0,
        paymentStatus: 'paid',
        usePackage: false,
        paymentAmount: 60, // Group discount
      })),
    }),
  });
  return result;
}

// Step 8: Create Rental
async function createRental(adminToken, userId, equipmentIds, currency) {
  // Rental for today or future
  const rentalDate = new Date();
  rentalDate.setDate(rentalDate.getDate() + Math.floor(Math.random() * 14));
  const dateStr = rentalDate.toISOString().split('T')[0];
  
  // Start and end times
  const startHour = 9 + Math.floor(Math.random() * 6);
  const durationHours = 2 + Math.floor(Math.random() * 6); // 2-8 hours
  
  const startDate = new Date(rentalDate);
  startDate.setHours(startHour, 0, 0, 0);
  
  const endDate = new Date(startDate);
  endDate.setHours(startHour + durationHours, 0, 0, 0);
  
  const result = await apiRequest('/rentals', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      user_id: userId,
      equipment_ids: equipmentIds,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      rental_date: dateStr,
      status: 'upcoming',
      payment_status: 'paid',
      total_price: equipmentIds.length * 25 * durationHours, // €25/hr per item
      currency,
    }),
  });
  return result;
}

// ============================================================================
// MANIFEST & UTILITIES
// ============================================================================

function saveManifest() {
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN POPULATION LOGIC
// ============================================================================

async function populate() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         PLANNIVO REALISTIC POPULATION - 2000 USERS             ║');
  console.log('║                                                                 ║');
  console.log('║  Simulating: Registration → Waiver → Balance → Shopping        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   API Base: ${API_BASE}`);
  console.log(`   Target Users: ${TOTAL_USERS}`);
  console.log('');
  
  // Get admin token
  const adminToken = await getAdminToken();
  
  // Fetch system data
  const systemData = await fetchSystemData(adminToken);
  
  // Validate we have required data
  if (systemData.instructors.length === 0) {
    console.log('\n⚠️  WARNING: No instructors found - bookings will be skipped');
  }
  if (systemData.services.length === 0) {
    console.log('\n⚠️  WARNING: No services found - bookings will be skipped');
  }
  if (systemData.equipment.length === 0) {
    console.log('\n⚠️  WARNING: No equipment found - rentals will be skipped');
  }
  
  console.log('');
  console.log('🚀 Starting population...');
  console.log('');
  console.log('   User Journey: Register → Sign Waiver → Add Balance → Shop');
  console.log('');
  
  const startTime = Date.now();
  const createdUsers = []; // Track for group bookings
  
  // Process in batches
  for (let batch = 0; batch < Math.ceil(TOTAL_USERS / BATCH_SIZE); batch++) {
    const batchStart = batch * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_USERS);
    
    console.log(`   📦 Batch ${batch + 1}/${Math.ceil(TOTAL_USERS / BATCH_SIZE)} (users ${batchStart + 1}-${batchEnd})`);
    
    for (let i = batchStart; i < batchEnd; i++) {
      const userData = generateUserData(i + 1);
      
      try {
        // ═══════════════════════════════════════════════════════════════
        // STEP 1: CREATE USER
        // ═══════════════════════════════════════════════════════════════
        const user = await createUser(adminToken, userData, systemData.outsiderRoleId);
        const userId = user.id || user.userId;
        
        if (!userId) {
          stats.usersFailed++;
          continue;
        }
        
        stats.usersCreated++;
        manifest.users.push(userId);
        createdUsers.push({ userId, currency: userData.preferred_currency });
        
        // ═══════════════════════════════════════════════════════════════
        // STEP 2: SIGN WAIVER (required before any activity)
        // ═══════════════════════════════════════════════════════════════
        if (systemData.waiverVersion) {
          try {
            const userToken = await loginAsUser(userData.email, userData.password);
            const waiver = await signWaiver(userToken, userId, systemData.waiverVersion);
            stats.waiversSigned++;
            if (waiver?.data?.id) manifest.waivers.push(waiver.data.id);
          } catch {
            stats.waiversFailed++;
          }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // STEP 3: ADD WALLET BALANCE
        // ═══════════════════════════════════════════════════════════════
        // Realistic amounts: 100-2000 EUR or 2000-40000 TRY
        const baseAmount = userData.preferred_currency === 'EUR' 
          ? 100 + Math.floor(Math.random() * 1900)
          : 2000 + Math.floor(Math.random() * 38000);
        
        try {
          const deposit = await addWalletBalance(adminToken, userId, baseAmount, userData.preferred_currency);
          stats.depositsCreated++;
          if (deposit?.transaction?.id) manifest.deposits.push(deposit.transaction.id);
        } catch {
          stats.depositsFailed++;
        }
        
        // ═══════════════════════════════════════════════════════════════
        // STEP 4: PURCHASE PACKAGE (40% of users buy packages)
        // ═══════════════════════════════════════════════════════════════
        let hasPackage = false;
        if (Math.random() < 0.4 && systemData.packages.length > 0) {
          try {
            const pkg = systemData.packages[Math.floor(Math.random() * systemData.packages.length)];
            const purchase = await purchasePackage(adminToken, userId, pkg.id, userData.preferred_currency);
            stats.packagesPurchased++;
            hasPackage = true;
            if (purchase?.customerPackageId) manifest.packages.push(purchase.customerPackageId);
          } catch {
            stats.packagesFailed++;
          }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // STEP 5: CREATE BOOKINGS (70% of users book lessons)
        // ═══════════════════════════════════════════════════════════════
        if (Math.random() < 0.7 && systemData.instructors.length > 0 && systemData.services.length > 0) {
          // 1-3 bookings per user
          const numBookings = 1 + Math.floor(Math.random() * 3);
          
          for (let b = 0; b < numBookings; b++) {
            try {
              const instructor = systemData.instructors[Math.floor(Math.random() * systemData.instructors.length)];
              const service = systemData.services[Math.floor(Math.random() * systemData.services.length)];
              // Use package 50% of the time if they have one
              const usePackage = hasPackage && Math.random() < 0.5;
              
              const booking = await createBooking(
                adminToken, userId, instructor.id, service.id, 
                userData.preferred_currency, usePackage
              );
              stats.bookingsCreated++;
              if (booking?.id) manifest.bookings.push(booking.id);
            } catch {
              stats.bookingsFailed++;
            }
          }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // STEP 6: CREATE RENTAL (30% of users rent equipment)
        // ═══════════════════════════════════════════════════════════════
        if (Math.random() < 0.3 && systemData.equipment.length > 0) {
          try {
            // Rent 1-3 items
            const numItems = Math.min(1 + Math.floor(Math.random() * 3), systemData.equipment.length);
            const shuffled = [...systemData.equipment].sort(() => Math.random() - 0.5);
            const equipmentIds = shuffled.slice(0, numItems).map(e => e.id);
            
            const rental = await createRental(adminToken, userId, equipmentIds, userData.preferred_currency);
            stats.rentalsCreated++;
            if (rental?.id) manifest.rentals.push(rental.id);
          } catch {
            stats.rentalsFailed++;
          }
        }
        
      } catch (error) {
        stats.usersFailed++;
      }
      
      // Small delay to avoid overwhelming the API
      await sleep(20);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // BATCH: CREATE GROUP BOOKINGS (5 per batch)
    // ═══════════════════════════════════════════════════════════════
    if (createdUsers.length >= 4 && systemData.instructors.length > 0 && systemData.services.length > 0) {
      for (let g = 0; g < 5; g++) {
        try {
          // Pick 2-4 random users for group
          const groupSize = 2 + Math.floor(Math.random() * 3);
          const shuffled = [...createdUsers].sort(() => Math.random() - 0.5);
          const participants = shuffled.slice(0, groupSize);
          
          const instructor = systemData.instructors[Math.floor(Math.random() * systemData.instructors.length)];
          const service = systemData.services[Math.floor(Math.random() * systemData.services.length)];
          
          const groupBooking = await createGroupBooking(adminToken, participants, instructor.id, service.id);
          stats.groupBookingsCreated++;
          if (groupBooking?.id) manifest.bookings.push(groupBooking.id);
        } catch {
          stats.groupBookingsFailed++;
        }
      }
    }
    
    // Save manifest after each batch
    saveManifest();
    
    // Progress report
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (stats.usersCreated / Math.max(1, parseFloat(elapsed))).toFixed(1);
    console.log(`      ✅ Complete - Users: ${stats.usersCreated}/${TOTAL_USERS} (${rate}/sec)`);
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                     POPULATION COMPLETE                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   ⏱️  Total Time: ${totalTime} seconds`);
  console.log('');
  console.log('   📊 Results:');
  console.log(`      👤 Users Created:      ${stats.usersCreated} ✅ / ${stats.usersFailed} ❌`);
  console.log(`      📝 Waivers Signed:     ${stats.waiversSigned} ✅ / ${stats.waiversFailed} ❌`);
  console.log(`      💰 Deposits Made:      ${stats.depositsCreated} ✅ / ${stats.depositsFailed} ❌`);
  console.log(`      📦 Packages Purchased: ${stats.packagesPurchased} ✅ / ${stats.packagesFailed} ❌`);
  console.log(`      📅 Bookings Created:   ${stats.bookingsCreated} ✅ / ${stats.bookingsFailed} ❌`);
  console.log(`      👥 Group Bookings:     ${stats.groupBookingsCreated} ✅ / ${stats.groupBookingsFailed} ❌`);
  console.log(`      🏄 Rentals Created:    ${stats.rentalsCreated} ✅ / ${stats.rentalsFailed} ❌`);
  console.log('');
  console.log(`   📄 Manifest saved to: ${MANIFEST_FILE}`);
  console.log('');
  console.log('   💡 To rollback: node rollback_population.mjs');
  console.log('');
}

// Run
populate().catch(error => {
  console.error('');
  console.error('❌ Population failed:', error.message);
  saveManifest();
  process.exit(1);
});
