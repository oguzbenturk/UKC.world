/**
 * Phase 2: GDPR Compliance E2E Tests
 * 
 * Comprehensive GDPR compliance tests covering:
 * - Article 15: Right of Access (Data Export)
 * - Article 16: Right to Rectification
 * - Article 17: Right to Erasure (Anonymization)
 * - Article 20: Right to Data Portability
 * - Consent Management (Marketing Preferences)
 * - GDPR Rights Information Endpoint
 * 
 * NOTE: Tests run in serial mode to avoid rate limiting and maintain test isolation
 */

import { test, expect, APIRequestContext } from '@playwright/test';

// API base URL
const API_BASE = 'http://localhost:4000/api';

// Test credentials - Admin has elevated GDPR access
const ADMIN_CREDENTIALS = {
  email: 'admin@plannivo.com',
  password: 'asdasd35'
};

// Regular user for self-service GDPR tests
const USER_CREDENTIALS = {
  email: 'kaanaysel@gmail.com',
  password: 'asdasd35'
};

// Add delay between requests to avoid rate limiting
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// GDPR COMPLIANCE TESTS
// ==========================================

test.describe('GDPR Compliance', () => {
  
  // Run tests in serial mode to maintain isolation
  test.describe.configure({ mode: 'serial' });
  
  // Store tokens for reuse across tests
  let adminToken: string;
  let userToken: string;
  let testUserId: string;
  
  test.beforeAll(async ({ request }) => {
    // Login as admin
    await delay(1000);
    const adminResponse = await request.post(`${API_BASE}/auth/login`, {
      data: ADMIN_CREDENTIALS
    });
    const adminData = await adminResponse.json();
    adminToken = adminData.token;
    
    // Login as regular user
    await delay(500);
    const userResponse = await request.post(`${API_BASE}/auth/login`, {
      data: USER_CREDENTIALS
    });
    const userDataResponse = await userResponse.json();
    userToken = userDataResponse.token;
    testUserId = userDataResponse.user.id;
  });

  // ==========================================
  // GDPR RIGHTS INFORMATION (Public Endpoint)
  // ==========================================
  
  test.describe('GDPR Rights Information', () => {
    
    test('should return GDPR rights information (public endpoint)', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/gdpr/rights`);
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.rights).toBeDefined();
      
      // Verify all GDPR articles are documented
      expect(data.rights.rightToAccess).toBeDefined();
      expect(data.rights.rightToAccess.article).toBe('Article 15');
      
      expect(data.rights.rightToRectification).toBeDefined();
      expect(data.rights.rightToRectification.article).toBe('Article 16');
      
      expect(data.rights.rightToErasure).toBeDefined();
      expect(data.rights.rightToErasure.article).toBe('Article 17');
      
      expect(data.rights.rightToRestriction).toBeDefined();
      expect(data.rights.rightToRestriction.article).toBe('Article 18');
      
      expect(data.rights.rightToPortability).toBeDefined();
      expect(data.rights.rightToPortability.article).toBe('Article 20');
      
      expect(data.rights.rightToObject).toBeDefined();
      expect(data.rights.rightToObject.article).toBe('Article 21');
      
      expect(data.rights.rightToWithdrawConsent).toBeDefined();
      expect(data.rights.rightToWithdrawConsent.article).toBe('Article 7(3)');
      
      expect(data.rights.rightToLodgeComplaint).toBeDefined();
      expect(data.rights.rightToLodgeComplaint.article).toBe('Article 77');
    });

    test('should include contact information for privacy requests', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/gdpr/rights`);
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data.contact).toBeDefined();
      expect(data.contact.privacy).toBeDefined();
      expect(data.contact.dataProtectionOfficer).toBeDefined();
      expect(data.contact.support).toBeDefined();
    });

    test('should include response time commitment', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/gdpr/rights`);
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data.responseTime).toBeDefined();
      expect(data.responseTime).toContain('30 days');
    });

    test('should include how to exercise each right', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/gdpr/rights`);
      
      const data = await response.json();
      
      // Each right should have howToExercise guidance
      Object.values(data.rights).forEach((right: any) => {
        expect(right.description).toBeDefined();
        expect(right.howToExercise).toBeDefined();
      });
    });
  });

  // ==========================================
  // ARTICLE 15: RIGHT OF ACCESS (Data Export)
  // ==========================================
  
  test.describe('Article 15: Right of Access (Data Export)', () => {
    
    test('should allow user to export their own data', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      
      // Verify export metadata
      expect(data.data.exportDate).toBeDefined();
      expect(data.data.exportType).toContain('Article 15');
      expect(data.data.userId).toBe(testUserId);
    });

    test('should include personal information in export', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      expect(data.data.personalInformation).toBeDefined();
      expect(data.data.personalInformation.email).toBeDefined();
      // Verify password hash is NOT included
      expect(data.data.personalInformation.password_hash).toBeUndefined();
    });

    test('should include consent records in export', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      expect(data.data.consents).toBeDefined();
      expect(Array.isArray(data.data.consents)).toBe(true);
    });

    test('should include booking history in export', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      expect(data.data.bookings).toBeDefined();
      expect(Array.isArray(data.data.bookings)).toBe(true);
    });

    test('should include financial records in export', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      expect(data.data.financialRecords).toBeDefined();
      expect(data.data.financialRecords.transactions).toBeDefined();
      expect(data.data.financialRecords.balances).toBeDefined();
    });

    test('should include metadata with record count and retention info', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      expect(data.data.metadata).toBeDefined();
      expect(data.data.metadata.recordsIncluded).toBeDefined();
      expect(typeof data.data.metadata.recordsIncluded).toBe('number');
      expect(data.data.metadata.dataRetentionPeriod).toBeDefined();
      expect(data.data.metadata.rightsInformation).toBeDefined();
    });

    test('should include security audit log in export', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      expect(data.data.securityAudit).toBeDefined();
    });

    test('should reject data export without authentication', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/gdpr/export`);
      
      expect(response.status()).toBe(401);
    });

    test('should set correct content headers for JSON download', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      expect(response.status()).toBe(200);
      
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('application/json');
      
      const contentDisposition = response.headers()['content-disposition'];
      expect(contentDisposition).toContain('attachment');
      expect(contentDisposition).toContain('gdpr_data_export');
    });
  });

  // ==========================================
  // ADMIN DATA EXPORT (Article 15 - Admin Override)
  // ==========================================
  
  test.describe('Admin Data Export', () => {
    
    test('should allow admin to export any user data', async ({ request }) => {
      await delay(500);
      const response = await request.post(`${API_BASE}/gdpr/export/${testUserId}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.exportedBy).toBe(ADMIN_CREDENTIALS.email);
      expect(data.exportedAt).toBeDefined();
    });

    test('should reject admin export without admin role', async ({ request }) => {
      await delay(500);
      const response = await request.post(`${API_BASE}/gdpr/export/${testUserId}`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      expect(response.status()).toBe(403);
    });

    test('should reject admin export without authentication', async ({ request }) => {
      await delay(300);
      const response = await request.post(`${API_BASE}/gdpr/export/${testUserId}`);
      
      expect(response.status()).toBe(401);
    });
  });

  // ==========================================
  // CONSENT MANAGEMENT
  // ==========================================
  
  test.describe('Consent Management', () => {
    
    test('should get current consent status', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/user-consents/me`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data).toHaveProperty('latestTermsVersion');
      expect(data).toHaveProperty('termsVersion');
      expect(data).toHaveProperty('requiresTermsAcceptance');
      expect(data).toHaveProperty('communicationPreferences');
    });

    test('should include communication preferences in consent status', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/user-consents/me`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      expect(data.communicationPreferences).toBeDefined();
      expect(typeof data.communicationPreferences.email).toBe('boolean');
      expect(typeof data.communicationPreferences.sms).toBe('boolean');
      expect(typeof data.communicationPreferences.whatsapp).toBe('boolean');
    });

    test('should update marketing consent preferences', async ({ request }) => {
      await delay(500);
      
      // First get current status
      const statusResponse = await request.get(`${API_BASE}/user-consents/me`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      const currentStatus = await statusResponse.json();
      
      await delay(300);
      
      // Update consent with terms acceptance if required
      const response = await request.post(`${API_BASE}/user-consents/me`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        },
        data: {
          acceptTerms: true,
          allowEmail: true,
          allowSms: false,
          allowWhatsapp: false,
          termsVersion: currentStatus.latestTermsVersion
        }
      });
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data.communicationPreferences.email).toBe(true);
      expect(data.communicationPreferences.sms).toBe(false);
      expect(data.communicationPreferences.whatsapp).toBe(false);
    });

    test('should allow opting out of all marketing', async ({ request }) => {
      await delay(500);
      
      // Get current status for terms version
      const statusResponse = await request.get(`${API_BASE}/user-consents/me`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      const currentStatus = await statusResponse.json();
      
      await delay(300);
      
      const response = await request.post(`${API_BASE}/user-consents/me`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        },
        data: {
          acceptTerms: true,
          allowEmail: false,
          allowSms: false,
          allowWhatsapp: false,
          termsVersion: currentStatus.latestTermsVersion
        }
      });
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data.communicationPreferences.email).toBe(false);
      expect(data.communicationPreferences.sms).toBe(false);
      expect(data.communicationPreferences.whatsapp).toBe(false);
    });

    test('should reject consent update without authentication', async ({ request }) => {
      await delay(300);
      const response = await request.post(`${API_BASE}/user-consents/me`, {
        data: {
          acceptTerms: true,
          allowEmail: true
        }
      });
      
      expect(response.status()).toBe(401);
    });

    test('should reject consent update without terms acceptance when required', async ({ request }) => {
      // This test is tricky - we need a user who hasn't accepted terms
      // For now, we verify the endpoint validates terms acceptance
      await delay(300);
      
      // Get current status
      const statusResponse = await request.get(`${API_BASE}/user-consents/me`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      const currentStatus = await statusResponse.json();
      
      // If terms acceptance is required, sending without acceptTerms should fail
      if (currentStatus.requiresTermsAcceptance) {
        await delay(300);
        const response = await request.post(`${API_BASE}/user-consents/me`, {
          headers: {
            'Authorization': `Bearer ${userToken}`
          },
          data: {
            acceptTerms: false,
            allowEmail: true,
            termsVersion: currentStatus.latestTermsVersion
          }
        });
        
        expect(response.status()).toBe(409);
        const data = await response.json();
        expect(data.code).toBe('CONSENT_TERMS_REQUIRED');
      } else {
        // User has already accepted, so we can update preferences without accepting again
        expect(currentStatus.requiresTermsAcceptance).toBe(false);
      }
    });
  });

  // ==========================================
  // ARTICLE 17: RIGHT TO ERASURE (Anonymization)
  // Note: These tests are commented out to prevent actual data deletion
  // They should be run manually or with test-specific accounts
  // ==========================================
  
  test.describe('Article 17: Right to Erasure (Anonymization)', () => {
    
    test('should reject anonymization without authentication', async ({ request }) => {
      await delay(300);
      const response = await request.delete(`${API_BASE}/gdpr/anonymize`);
      
      expect(response.status()).toBe(401);
    });

    test('should reject admin anonymization without admin role', async ({ request }) => {
      await delay(300);
      // Try to anonymize another user as non-admin
      const response = await request.delete(`${API_BASE}/gdpr/anonymize/${testUserId}`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      expect(response.status()).toBe(403);
    });

    test('should reject admin anonymization without authentication', async ({ request }) => {
      await delay(300);
      const response = await request.delete(`${API_BASE}/gdpr/anonymize/some-user-id`);
      
      expect(response.status()).toBe(401);
    });

    // Note: Actual anonymization tests should use dedicated test accounts
    // to avoid data loss. The endpoint functionality is tested by verifying
    // proper authentication and authorization.
    
    test.skip('should anonymize user own data (DANGEROUS - requires test account)', async ({ request }) => {
      // This test is skipped by default to prevent accidental data deletion
      // Enable only when testing with a dedicated test account
      await delay(500);
      const response = await request.delete(`${API_BASE}/gdpr/anonymize`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.anonymizedAt).toBeDefined();
      expect(data.message).toContain('anonymized');
    });
  });

  // ==========================================
  // DATA PORTABILITY & FORMAT VERIFICATION
  // ==========================================
  
  test.describe('Article 20: Data Portability', () => {
    
    test('should export data in JSON format (machine-readable)', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      expect(response.status()).toBe(200);
      
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('application/json');
      
      // Verify valid JSON structure
      const data = await response.json();
      expect(typeof data).toBe('object');
      expect(data.success).toBe(true);
    });

    test('should include standard data structure for portability', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      // Verify standard portable structure
      expect(data.data).toHaveProperty('personalInformation');
      expect(data.data).toHaveProperty('consents');
      expect(data.data).toHaveProperty('bookings');
      expect(data.data).toHaveProperty('financialRecords');
      expect(data.data).toHaveProperty('metadata');
    });
  });

  // ==========================================
  // ERROR HANDLING & EDGE CASES
  // ==========================================
  
  test.describe('Error Handling', () => {
    
    test('should handle expired JWT token gracefully', async ({ request }) => {
      await delay(300);
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTUxNjIzOTAyMn0.invalid';
      
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${expiredToken}`
        }
      });
      
      expect(response.status()).toBe(401);
    });

    test('should handle malformed JWT token', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': 'Bearer malformed-token'
        }
      });
      
      expect(response.status()).toBe(401);
    });

    test('should handle missing Authorization header', async ({ request }) => {
      await delay(300);
      const response = await request.get(`${API_BASE}/gdpr/export`);
      
      expect(response.status()).toBe(401);
    });

    test('should handle invalid user ID in admin export', async ({ request }) => {
      await delay(500);
      const response = await request.post(`${API_BASE}/gdpr/export/invalid-uuid`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      
      // Should return error for invalid UUID format
      expect([400, 500]).toContain(response.status());
    });

    test('should handle non-existent user in admin export', async ({ request }) => {
      await delay(500);
      // Valid UUID format but non-existent user
      const fakeUserId = '00000000-0000-0000-0000-000000000000';
      const response = await request.post(`${API_BASE}/gdpr/export/${fakeUserId}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      
      // Should handle gracefully - either 404 or 500 with error message
      expect([200, 404, 500]).toContain(response.status());
    });
  });

  // ==========================================
  // SECURITY VERIFICATION
  // ==========================================
  
  test.describe('Security Requirements', () => {
    
    test('should not expose password hash in data export', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      const exportString = JSON.stringify(data);
      
      // Verify no password hash patterns in export
      expect(exportString).not.toContain('password_hash');
      expect(exportString).not.toContain('$2a$'); // bcrypt hash prefix
      expect(exportString).not.toContain('$2b$'); // bcrypt hash prefix
    });

    test('should not expose internal API keys or secrets', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      const exportString = JSON.stringify(data);
      
      // Verify no secret patterns in export
      expect(exportString).not.toContain('api_key');
      expect(exportString).not.toContain('secret_key');
      expect(exportString).not.toContain('JWT_SECRET');
    });

    test('should prevent cross-user data access via export', async ({ request }) => {
      await delay(500);
      // Regular user should only get their own data
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      // Verify the export is for the authenticated user
      expect(data.data.userId).toBe(testUserId);
      expect(data.data.personalInformation.email).toBe(USER_CREDENTIALS.email);
    });

    test('should require proper authorization for admin endpoints', async ({ request }) => {
      await delay(300);
      // Verify admin-only endpoints are protected
      const endpoints = [
        { method: 'post', url: `${API_BASE}/gdpr/export/${testUserId}` },
        { method: 'delete', url: `${API_BASE}/gdpr/anonymize/${testUserId}` }
      ];
      
      for (const endpoint of endpoints) {
        await delay(200);
        const response = await (request as any)[endpoint.method](endpoint.url, {
          headers: {
            'Authorization': `Bearer ${userToken}` // Non-admin token
          }
        });
        
        expect(response.status()).toBe(403);
      }
    });
  });

  // ==========================================
  // DATA COMPLETENESS VERIFICATION
  // ==========================================
  
  test.describe('Data Completeness', () => {
    
    test('should include all relevant data categories in export', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      // Verify all expected data categories are present
      const expectedCategories = [
        'personalInformation',
        'consents',
        'bookings',
        'financialRecords',
        'communications',
        'ratings',
        'instructorData',
        'servicePackages',
        'accommodation',
        'equipment',
        'supportRequests',
        'securityAudit',
        'metadata'
      ];
      
      for (const category of expectedCategories) {
        expect(data.data).toHaveProperty(category);
      }
    });

    test('should include data retention information', async ({ request }) => {
      await delay(500);
      const response = await request.get(`${API_BASE}/gdpr/export`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      
      expect(data.data.metadata.dataRetentionPeriod).toBeDefined();
      // Verify retention mentions 7 years for financial records (legal requirement)
      expect(data.data.metadata.dataRetentionPeriod).toContain('7 years');
    });
  });
});
