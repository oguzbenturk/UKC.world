/**
 * Phase 2: User Management & Auth E2E Tests
 * 
 * Comprehensive authentication and authorization tests covering:
 * - Login flow (success, failure, validation)
 * - JWT token management
 * - Account security
 * 
 * NOTE: Tests run in serial mode to avoid rate limiting
 */

import { test, expect, APIRequestContext } from '@playwright/test';

// API base URL
const API_BASE = 'http://localhost:4000/api';

// Test credentials
const ADMIN_CREDENTIALS = {
  email: 'admin@plannivo.com',
  password: 'asdasd35'
};

const INSTRUCTOR_CREDENTIALS = {
  email: 'oguz@gmail.com',
  password: 'asdasd35'
};

// Generate unique email for test users
function generateTestEmail(): string {
  return `test_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
}

// Add delay between requests to avoid rate limiting
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// AUTH API TESTS
// ==========================================

test.describe('Authentication API', () => {
  
  // Run tests in serial mode to minimize rate limiting
  test.describe.configure({ mode: 'serial' });
  
  // Store token for reuse across tests in this describe block
  let authToken: string;
  
  test.beforeAll(async ({ request }) => {
    // Login once and reuse token
    await delay(1000);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN_CREDENTIALS
    });
    const data = await response.json();
    authToken = data.token;
  });
  
  test.describe('Login Flow', () => {
    
    test('should login successfully with valid admin credentials', async ({ request }) => {
      await delay(500);
      const response = await request.post(`${API_BASE}/auth/login`, {
        data: ADMIN_CREDENTIALS
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('token');
      expect(data).toHaveProperty('user');
      expect(data.user.email).toBe(ADMIN_CREDENTIALS.email);
      expect(data.user).toHaveProperty('role');
      expect(data.message).toBe('Login successful');
    });

    test('should login successfully with instructor credentials', async ({ request }) => {
      await delay(500);
      const response = await request.post(`${API_BASE}/auth/login`, {
        data: INSTRUCTOR_CREDENTIALS
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('token');
      expect(data.user.email).toBe(INSTRUCTOR_CREDENTIALS.email);
    });

    test('should fail login with invalid email', async ({ request }) => {
      await delay(500);
      const response = await request.post(`${API_BASE}/auth/login`, {
        data: {
          email: 'nonexistent@example.com',
          password: 'somepassword'
        }
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Invalid email or password');
    });

    test('should fail login with invalid password', async ({ request }) => {
      await delay(500);
      const response = await request.post(`${API_BASE}/auth/login`, {
        data: {
          email: ADMIN_CREDENTIALS.email,
          password: 'wrongpassword123'
        }
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Invalid email or password');
    });

    test('should fail login with missing email', async ({ request }) => {
      await delay(200);
      const response = await request.post(`${API_BASE}/auth/login`, {
        data: {
          password: 'somepassword'
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Email and password are required');
    });

    test('should fail login with missing password', async ({ request }) => {
      await delay(200);
      const response = await request.post(`${API_BASE}/auth/login`, {
        data: {
          email: ADMIN_CREDENTIALS.email
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Email and password are required');
    });

    test('should fail login with empty credentials', async ({ request }) => {
      await delay(200);
      const response = await request.post(`${API_BASE}/auth/login`, {
        data: {}
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Email and password are required');
    });

    test('should return user consent status on successful login', async ({ request }) => {
      await delay(500);
      const response = await request.post(`${API_BASE}/auth/login`, {
        data: ADMIN_CREDENTIALS
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      
      // Consent may or may not be present, but if present should have structure
      if (data.consent) {
        expect(data.consent).toHaveProperty('latestTermsVersion');
      }
    });
  });

  test.describe('JWT Token Management', () => {
    
    test('should return valid JWT token on login', async ({ request }) => {
      await delay(500);
      const response = await request.post(`${API_BASE}/auth/login`, {
        data: ADMIN_CREDENTIALS
      });

      const data = await response.json();
      expect(data.token).toBeDefined();
      
      // JWT format: header.payload.signature
      const parts = data.token.split('.');
      expect(parts).toHaveLength(3);
    });

    test('should access protected endpoint with valid token', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.email).toBe(ADMIN_CREDENTIALS.email);
    });

    test('should reject request without token', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/auth/me`);

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toContain('Access denied');
    });

    test('should reject request with invalid token', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': 'Bearer invalid.token.here'
        }
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toContain('Invalid token');
    });

    test('should reject request with malformed Authorization header', async ({ request }) => {
      await delay(200);
      const response = await request.get(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': 'NotBearer sometoken'
        }
      });

      expect(response.status()).toBe(401);
    });

    test('should return user info from /auth/me endpoint', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('role');
      expect(data.email).toBe(ADMIN_CREDENTIALS.email);
    });
  });

  test.describe('Logout', () => {
    
    test('should logout successfully', async ({ request }) => {
      await delay(300);
      const response = await request.post(`${API_BASE}/auth/logout`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Logout successful');
    });

    test('should reject logout without token', async ({ request }) => {
      await delay(200);
      const response = await request.post(`${API_BASE}/auth/logout`);
      expect(response.status()).toBe(401);
    });
  });
});

// ==========================================
// 2FA TESTS (API Level)
// ==========================================

test.describe('Two-Factor Authentication API', () => {
  
  test.describe.configure({ mode: 'serial' });
  
  let authToken: string;
  
  test.beforeAll(async ({ request }) => {
    await delay(1000);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN_CREDENTIALS
    });
    const data = await response.json();
    authToken = data.token;
  });
  
  test('should setup 2FA and get secret/QR code', async ({ request }) => {
    await delay(300);
    const response = await request.post(`${API_BASE}/2fa/setup-2fa`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    // May be 200 (success) or 400 (already enabled)
    expect([200, 400]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('secret');
      expect(data).toHaveProperty('qrCodeUrl');
      expect(data.message).toContain('Scan the QR code');
    }
  });

  test('should reject 2FA setup without authentication', async ({ request }) => {
    await delay(200);
    const response = await request.post(`${API_BASE}/2fa/setup-2fa`);
    expect(response.status()).toBe(401);
  });

  test('should reject 2FA enable with invalid code', async ({ request }) => {
    await delay(300);
    const response = await request.post(`${API_BASE}/2fa/enable-2fa`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      data: {
        token: '000000' // Invalid code
      }
    });

    // May fail with various errors depending on state
    expect([400, 500]).toContain(response.status());
  });

  test('should reject 2FA enable with invalid code format', async ({ request }) => {
    await delay(300);
    const response = await request.post(`${API_BASE}/2fa/enable-2fa`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      data: {
        token: 'abc' // Non-numeric, wrong length
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('6-digit');
  });

  test('should require password to disable 2FA', async ({ request }) => {
    await delay(300);
    const response = await request.post(`${API_BASE}/2fa/disable-2fa`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      data: {} // No password
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Password is required');
  });
});

// ==========================================
// USER MANAGEMENT TESTS
// ==========================================

test.describe('User Management API', () => {
  
  test.describe.configure({ mode: 'serial' });
  
  let authToken: string;
  
  test.beforeAll(async ({ request }) => {
    await delay(1000);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN_CREDENTIALS
    });
    const data = await response.json();
    authToken = data.token;
  });
  
  test('should list all users (admin only)', async ({ request }) => {
    await delay(300);
    const response = await request.get(`${API_BASE}/users`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('should filter users by role', async ({ request }) => {
    await delay(300);
    const response = await request.get(`${API_BASE}/users?role=student`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('should get students list via dedicated endpoint', async ({ request }) => {
    await delay(300);
    const response = await request.get(`${API_BASE}/users/students`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('should create new user with valid data', async ({ request }) => {
    await delay(300);
    
    // Get student role ID first
    const rolesResponse = await request.get(`${API_BASE}/roles`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    expect(rolesResponse.status()).toBe(200);
    const roles = await rolesResponse.json();
    
    if (!Array.isArray(roles)) {
      test.skip();
      return;
    }
    
    const studentRole = roles.find((r: any) => r.name === 'student');
    
    if (!studentRole) {
      test.skip();
      return;
    }
    
    const testEmail = generateTestEmail();
    const response = await request.post(`${API_BASE}/users`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      data: {
        email: testEmail,
        password: 'TestPassword123!',
        first_name: 'Test',
        last_name: 'User',
        role_id: studentRole.id
      }
    });

    expect(response.status()).toBe(201);
    const data = await response.json();
    expect(data.email).toBe(testEmail);
    expect(data.first_name).toBe('Test');
    expect(data.last_name).toBe('User');
    expect(data).not.toHaveProperty('password_hash');
  });

  test('should reject user creation without password', async ({ request }) => {
    await delay(300);
    const response = await request.post(`${API_BASE}/users`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      data: {
        email: generateTestEmail(),
        first_name: 'Test',
        last_name: 'User'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Password and role_id are required');
  });

  test('should reject duplicate email on user creation', async ({ request }) => {
    await delay(300);
    
    const rolesResponse = await request.get(`${API_BASE}/roles`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const roles = await rolesResponse.json();
    
    if (!Array.isArray(roles)) {
      test.skip();
      return;
    }
    
    const studentRole = roles.find((r: any) => r.name === 'student');
    
    if (!studentRole) {
      test.skip();
      return;
    }
    
    const response = await request.post(`${API_BASE}/users`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      data: {
        email: ADMIN_CREDENTIALS.email, // Already exists
        password: 'TestPassword123!',
        first_name: 'Test',
        last_name: 'User',
        role_id: studentRole.id
      }
    });

    expect(response.status()).toBe(409);
    const data = await response.json();
    expect(data.error).toContain('Email already exists');
  });
});

// ==========================================
// ROLES API TESTS
// ==========================================

test.describe('Roles API', () => {
  
  test.describe.configure({ mode: 'serial' });
  
  let authToken: string;
  
  test.beforeAll(async ({ request }) => {
    await delay(1000);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN_CREDENTIALS
    });
    const data = await response.json();
    authToken = data.token;
  });
  
  test('should list all roles', async ({ request }) => {
    await delay(300);
    const response = await request.get(`${API_BASE}/roles`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    
    // Should have standard roles
    const roleNames = data.map((r: any) => r.name);
    expect(roleNames).toContain('admin');
    expect(roleNames).toContain('student');
    expect(roleNames).toContain('instructor');
  });

  test('should get role by ID', async ({ request }) => {
    await delay(300);
    
    // First get roles list
    const listResponse = await request.get(`${API_BASE}/roles`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const roles = await listResponse.json();
    
    if (!Array.isArray(roles)) {
      test.skip();
      return;
    }
    
    const adminRole = roles.find((r: any) => r.name === 'admin');
    
    if (!adminRole) {
      test.skip();
      return;
    }
    
    const response = await request.get(`${API_BASE}/roles/${adminRole.id}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('admin');
    expect(data.id).toBe(adminRole.id);
  });

  test('should create new custom role', async ({ request }) => {
    await delay(300);
    const roleName = `test_role_${Date.now()}`;
    
    const response = await request.post(`${API_BASE}/roles`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      data: {
        name: roleName,
        description: 'Test role for E2E testing',
        permissions: { canViewReports: true }
      }
    });

    expect(response.status()).toBe(201);
    const data = await response.json();
    expect(data.name).toBe(roleName);
    expect(data.description).toBe('Test role for E2E testing');
    
    // Cleanup: delete the test role
    await request.delete(`${API_BASE}/roles/${data.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
  });

  test('should reject duplicate role name', async ({ request }) => {
    await delay(300);
    const response = await request.post(`${API_BASE}/roles`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      data: {
        name: 'admin', // Already exists
        description: 'Duplicate test'
      }
    });

    expect(response.status()).toBe(409);
    const data = await response.json();
    expect(data.error).toContain('already exists');
  });

  test('should not delete protected roles', async ({ request }) => {
    await delay(300);
    
    // Get admin role
    const listResponse = await request.get(`${API_BASE}/roles`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const roles = await listResponse.json();
    
    if (!Array.isArray(roles)) {
      test.skip();
      return;
    }
    
    const adminRole = roles.find((r: any) => r.name === 'admin');
    
    if (!adminRole) {
      test.skip();
      return;
    }
    
    const response = await request.delete(`${API_BASE}/roles/${adminRole.id}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Protected role');
  });

  test('should require authentication to access roles', async ({ request }) => {
    await delay(200);
    const response = await request.get(`${API_BASE}/roles`);
    expect(response.status()).toBe(401);
  });
});

// ==========================================
// SECURITY TESTS
// ==========================================

test.describe('Security Features', () => {
  
  test.describe.configure({ mode: 'serial' });
  
  let authToken: string;
  
  test.beforeAll(async ({ request }) => {
    await delay(1000);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN_CREDENTIALS
    });
    const data = await response.json();
    authToken = data.token;
  });
  
  test('should not expose password hash in /auth/me response', async ({ request }) => {
    await delay(300);
    
    const response = await request.get(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    expect(response.status()).toBe(200);
    const data = await response.json();
    
    // The /auth/me endpoint should not expose password
    expect(data).not.toHaveProperty('password');
    expect(data).not.toHaveProperty('password_hash');
    expect(data).not.toHaveProperty('two_factor_secret');
  });

  test('should not expose 2FA secret in user data', async ({ request }) => {
    await delay(300);
    const response = await request.get(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const user = await response.json();
    expect(user).not.toHaveProperty('two_factor_secret');
    expect(user).not.toHaveProperty('two_factor_backup_codes');
  });

  test('should include proper content-type in responses', async ({ request }) => {
    await delay(500);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN_CREDENTIALS
    });

    const headers = response.headers();
    expect(headers['content-type']).toContain('application/json');
  });

  test('should handle SQL injection attempts safely', async ({ request }) => {
    await delay(500);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: "admin@test.com'; DROP TABLE users; --",
        password: 'test'
      }
    });

    // Should return 401 (not 500 or success)
    expect([401, 429]).toContain(response.status());
  });

  test('should handle XSS attempts in login input', async ({ request }) => {
    await delay(500);
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: '<script>alert("xss")</script>@test.com',
        password: '<script>alert("xss")</script>'
      }
    });

    // Should return 401 (not crash or execute script)
    expect([401, 429]).toContain(response.status());
  });
});

// ==========================================
// UI AUTHENTICATION TESTS (Skipped - Too Flaky)
// Note: These tests are better handled by manual testing
// or dedicated UI test suite with proper setup/teardown
// ==========================================

test.describe.skip('Authentication UI', () => {
  
  test('should display login page', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
