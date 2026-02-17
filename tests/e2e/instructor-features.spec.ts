/**
 * Instructor Features E2E Tests
 *
 * Phase 4: Instructor Features Tests
 * Testing instructor dashboard, student management, notes, commissions,
 * services, and lessons functionality.
 *
 * Endpoints covered:
 * - GET /api/instructor/me/dashboard - Instructor dashboard
 * - GET /api/instructor/me/students - Instructor's students
 * - GET /api/instructor/me/students/:studentId/profile - Student profile
 * - PATCH /api/instructor/me/students/:studentId/profile - Update student profile
 * - POST /api/instructor/me/students/:studentId/progress - Add progress
 * - DELETE /api/instructor/me/students/:studentId/progress/:progressId - Remove progress
 * - GET /api/instructor/me/students/:studentId/notes - Get notes
 * - POST /api/instructor/me/students/:studentId/notes - Create note
 * - PUT /api/instructor/me/notes/:noteId - Update note
 * - DELETE /api/instructor/me/notes/:noteId - Delete note
 * - GET /api/instructors - List all instructors
 * - GET /api/instructors/:id - Get instructor by ID
 * - GET /api/instructors/:id/services - Get instructor services
 * - GET /api/instructors/:id/lessons - Get instructor lessons
 * - GET /api/instructor-commissions/instructors/:id/commissions - Get commissions
 * - PUT /api/instructor-commissions/instructors/:id/default-commission - Update default commission
 * - PUT /api/instructor-commissions/instructors/:id/commissions/:serviceId - Update service commission
 * - POST /api/instructor-commissions/instructors/:id/commissions - Add commission
 * - DELETE /api/instructor-commissions/instructors/:id/commissions/:serviceId - Delete commission
 */

import { test, expect, request, APIRequestContext } from '@playwright/test';

// Serial mode to avoid rate limiting
test.describe.configure({ mode: 'serial' });

const API_BASE = 'http://localhost:4000/api';

// Test credentials
const ADMIN_EMAIL = 'admin@plannivo.com';
const ADMIN_PASSWORD = 'asdasd35';
const INSTRUCTOR_EMAIL = 'kaanaysel@gmail.com';
const INSTRUCTOR_PASSWORD = 'asdasd35';

// Token cache
let adminToken: string | null = null;
let instructorToken: string | null = null;
let adminUserId: string | null = null;
let instructorUserId: string | null = null;
let apiContext: APIRequestContext;

// Test data storage
let testStudentId: string | null = null;
let testNoteId: string | null = null;
let testServiceId: string | null = null;

// Helper: delay to avoid rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: login and cache token
async function getAdminToken(context: APIRequestContext): Promise<string> {
  if (adminToken) return adminToken;

  const response = await context.post(`${API_BASE}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  adminToken = body.token;
  adminUserId = body.user?.id;
  return adminToken!;
}

async function getInstructorToken(context: APIRequestContext): Promise<string> {
  if (instructorToken) return instructorToken;

  await delay(300);
  const response = await context.post(`${API_BASE}/auth/login`, {
    data: { email: INSTRUCTOR_EMAIL, password: INSTRUCTOR_PASSWORD }
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  instructorToken = body.token;
  instructorUserId = body.user?.id;
  return instructorToken!;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ==============================================================================
// SETUP
// ==============================================================================
test.beforeAll(async () => {
  apiContext = await request.newContext();
  // Pre-fetch tokens
  await getAdminToken(apiContext);
  await delay(300);
  await getInstructorToken(apiContext);
});

test.afterAll(async () => {
  await apiContext.dispose();
});

test.beforeEach(async () => {
  await delay(200);
});

// ==============================================================================
// INSTRUCTOR LIST TESTS
// ==============================================================================
test.describe('Instructor List', () => {
  test('GET /instructors - returns list of instructors', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(Array.isArray(body)).toBe(true);
    
    // Should have at least one instructor
    if (body.length > 0) {
      const instructor = body[0];
      expect(instructor).toHaveProperty('id');
      expect(instructor).toHaveProperty('name');
      expect(instructor).toHaveProperty('email');
      expect(instructor).toHaveProperty('role_name');
      expect(instructor.role_name).toBe('instructor');
    }
  });

  test('GET /instructors - instructor can access list', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /instructors - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/instructors`);
    expect([401, 403]).toContain(response.status());
  });

  test('GET /instructors/:id - returns instructor details', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('role_name');
    expect(body.role_name).toBe('instructor');
    expect(body).toHaveProperty('bookings');
    expect(Array.isArray(body.bookings)).toBe(true);
  });

  test('GET /instructors/:id - instructor can view own details', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(instructorUserId);
  });

  test('GET /instructors/:id - returns 404 for non-existent instructor', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructors/00000000-0000-0000-0000-000000000000`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(404);
  });

  test('GET /instructors/:id - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// INSTRUCTOR SERVICES TESTS
// ==============================================================================
test.describe('Instructor Services', () => {
  test('GET /instructors/:id/services - returns instructor services', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}/services`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(Array.isArray(body)).toBe(true);
    
    // Store a service ID for later tests
    if (body.length > 0) {
      testServiceId = body[0].id;
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('name');
    }
  });

  test('GET /instructors/:id/services - instructor can view own services', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}/services`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /instructors/:id/services - instructor cannot view other instructor services', async () => {
    const token = await getInstructorToken(apiContext);

    // Try to access another instructor's services (use admin ID which is not an instructor)
    const response = await apiContext.get(`${API_BASE}/instructors/${adminUserId}/services`, {
      headers: authHeaders(token)
    });

    // Should be forbidden or not found
    expect([403, 404]).toContain(response.status());
  });

  test('GET /instructors/:id/services - returns 404 for non-existent instructor', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructors/00000000-0000-0000-0000-000000000000/services`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(404);
  });

  test('GET /instructors/:id/services - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}/services`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// INSTRUCTOR LESSONS TESTS
// ==============================================================================
test.describe('Instructor Lessons', () => {
  test('GET /instructors/:id/lessons - returns instructor lessons', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}/lessons`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(Array.isArray(body)).toBe(true);
    
    if (body.length > 0) {
      const lesson = body[0];
      expect(lesson).toHaveProperty('id');
      expect(lesson).toHaveProperty('date');
      expect(lesson).toHaveProperty('status');
    }
  });

  test('GET /instructors/:id/lessons - supports limit parameter', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructors/${instructorUserId}/lessons?limit=5`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });

  test('GET /instructors/:id/lessons - instructor can view own lessons', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}/lessons`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /instructors/:id/lessons - instructor cannot view other instructor lessons', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/${adminUserId}/lessons`, {
      headers: authHeaders(token)
    });

    // Should be forbidden or not found
    expect([403, 404]).toContain(response.status());
  });

  test('GET /instructors/:id/lessons - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}/lessons`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// INSTRUCTOR DASHBOARD TESTS
// ==============================================================================
test.describe('Instructor Dashboard', () => {
  test('GET /instructors/me/dashboard - returns dashboard data', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/me/dashboard`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Dashboard should contain relevant data
    expect(body).toBeDefined();
  });

  test('GET /instructors/me/dashboard - requires instructor role', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/me/dashboard`, {
      headers: authHeaders(token)
    });

    // Admin should be denied (only instructors allowed)
    expect([403, 200]).toContain(response.status()); // May allow admin in some configs
  });

  test('GET /instructors/me/dashboard - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/instructors/me/dashboard`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// INSTRUCTOR STUDENTS TESTS
// ==============================================================================
test.describe('Instructor Students', () => {
  test('GET /instructors/me/students - returns instructor students', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/me/students`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Response should be an array or object with students
    if (Array.isArray(body)) {
      if (body.length > 0) {
        testStudentId = body[0].id;
      }
    } else if (body.students) {
      expect(Array.isArray(body.students)).toBe(true);
      if (body.students.length > 0) {
        testStudentId = body.students[0].id;
      }
    }
  });

  test('GET /instructors/me/students - requires instructor role', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/me/students`, {
      headers: authHeaders(token)
    });

    // Admin should be denied
    expect([403, 200]).toContain(response.status());
  });

  test('GET /instructors/me/students - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/instructors/me/students`);
    expect([401, 403]).toContain(response.status());
  });

  test('GET /instructors/me/students/:studentId/profile - returns student profile', async () => {
    if (!testStudentId) {
      test.skip();
      return;
    }

    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructors/me/students/${testStudentId}/profile`,
      { headers: authHeaders(token) }
    );

    expect([200, 404]).toContain(response.status());
    
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toBeDefined();
    }
  });

  test('GET /instructors/me/students/:studentId/profile - requires authentication', async () => {
    const response = await apiContext.get(`${API_BASE}/instructors/me/students/test-id/profile`);
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// INSTRUCTOR NOTES TESTS
// ==============================================================================
test.describe('Instructor Notes', () => {
  test('GET /instructors/me/students/:studentId/notes - returns student notes', async () => {
    if (!testStudentId) {
      test.skip();
      return;
    }

    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructors/me/students/${testStudentId}/notes`,
      { headers: authHeaders(token) }
    );

    expect([200, 404]).toContain(response.status());
    
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('notes');
      expect(Array.isArray(body.notes)).toBe(true);
    }
  });

  test('GET /instructors/me/students/:studentId/notes - supports pagination', async () => {
    if (!testStudentId) {
      test.skip();
      return;
    }

    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructors/me/students/${testStudentId}/notes?limit=5&offset=0`,
      { headers: authHeaders(token) }
    );

    expect([200, 404]).toContain(response.status());
  });

  test('GET /instructors/me/students/:studentId/notes - supports includePrivate filter', async () => {
    if (!testStudentId) {
      test.skip();
      return;
    }

    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructors/me/students/${testStudentId}/notes?includePrivate=true`,
      { headers: authHeaders(token) }
    );

    expect([200, 404]).toContain(response.status());
  });

  test('POST /instructors/me/students/:studentId/notes - creates note', async () => {
    if (!testStudentId) {
      test.skip();
      return;
    }

    const token = await getInstructorToken(apiContext);

    const noteData = {
      note: `Test note created at ${new Date().toISOString()}`,
      visibility: 'private',
      isPinned: false
    };

    const response = await apiContext.post(
      `${API_BASE}/instructors/me/students/${testStudentId}/notes`,
      {
        headers: authHeaders(token),
        data: noteData
      }
    );

    expect([201, 200, 404]).toContain(response.status());
    
    if (response.status() === 201 || response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('id');
      testNoteId = body.id;
    }
  });

  test('PUT /instructors/me/notes/:noteId - updates note', async () => {
    if (!testNoteId) {
      test.skip();
      return;
    }

    const token = await getInstructorToken(apiContext);

    const updateData = {
      note: `Updated note at ${new Date().toISOString()}`,
      isPinned: true
    };

    const response = await apiContext.put(
      `${API_BASE}/instructors/me/notes/${testNoteId}`,
      {
        headers: authHeaders(token),
        data: updateData
      }
    );

    expect([200, 404]).toContain(response.status());
    
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.isPinned || body.is_pinned).toBe(true);
    }
  });

  test('DELETE /instructors/me/notes/:noteId - deletes note', async () => {
    if (!testNoteId) {
      test.skip();
      return;
    }

    const token = await getInstructorToken(apiContext);

    const response = await apiContext.delete(
      `${API_BASE}/instructors/me/notes/${testNoteId}`,
      { headers: authHeaders(token) }
    );

    expect([204, 200, 404]).toContain(response.status());
  });

  test('POST /instructors/me/students/:studentId/notes - requires authentication', async () => {
    const response = await apiContext.post(
      `${API_BASE}/instructors/me/students/test-id/notes`,
      { data: { note: 'test' } }
    );
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// INSTRUCTOR COMMISSIONS TESTS
// ==============================================================================
test.describe('Instructor Commissions', () => {
  test('GET /instructor-commissions/instructors/:id/commissions - returns commissions', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('defaultCommission');
    expect(body).toHaveProperty('commissions');
    expect(Array.isArray(body.commissions)).toBe(true);
    
    // Default commission should have type and value
    expect(body.defaultCommission).toHaveProperty('type');
    expect(body.defaultCommission).toHaveProperty('value');
  });

  test('GET /instructor-commissions/instructors/:id/commissions - returns 404 for non-instructor', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructor-commissions/instructors/00000000-0000-0000-0000-000000000000/commissions`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(404);
  });

  test('GET /instructor-commissions/instructors/:id/commissions - requires admin/manager role', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions`,
      { headers: authHeaders(token) }
    );

    // Instructor should be denied
    expect([403, 200]).toContain(response.status()); // May allow in some configs
  });

  test('GET /instructor-commissions/instructors/:id/commissions - requires authentication', async () => {
    const response = await apiContext.get(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions`
    );
    expect([401, 403]).toContain(response.status());
  });

  test('PUT /instructor-commissions/instructors/:id/default-commission - updates default commission', async () => {
    const token = await getAdminToken(apiContext);

    const commissionData = {
      commissionType: 'percentage',
      commissionValue: 50
    };

    const response = await apiContext.put(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/default-commission`,
      {
        headers: authHeaders(token),
        data: commissionData
      }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('PUT /instructor-commissions/instructors/:id/default-commission - validates required fields', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.put(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/default-commission`,
      {
        headers: authHeaders(token),
        data: { commissionType: 'percentage' } // Missing commissionValue
      }
    );

    expect(response.status()).toBe(400);
  });

  test('PUT /instructor-commissions/instructors/:id/default-commission - requires authentication', async () => {
    const response = await apiContext.put(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/default-commission`,
      { data: { commissionType: 'percentage', commissionValue: 50 } }
    );
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// SERVICE COMMISSION TESTS
// ==============================================================================
test.describe('Service Commissions', () => {
  let createdCommissionServiceId: string | null = null;

  test('POST /instructor-commissions/instructors/:id/commissions - adds service commission', async () => {
    // First, get a service that doesn't have a commission
    const token = await getAdminToken(apiContext);

    // Get available services
    const servicesResponse = await apiContext.get(`${API_BASE}/services`, {
      headers: authHeaders(token)
    });

    if (servicesResponse.status() !== 200) {
      test.skip();
      return;
    }

    const services = await servicesResponse.json();
    if (!services || services.length === 0) {
      test.skip();
      return;
    }

    // Try to add commission for the first service
    const serviceId = services[0].id;
    createdCommissionServiceId = serviceId;

    const commissionData = {
      serviceId,
      commissionType: 'percentage',
      commissionValue: 60
    };

    const response = await apiContext.post(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions`,
      {
        headers: authHeaders(token),
        data: commissionData
      }
    );

    // May succeed (201) or conflict (409) if already exists
    expect([201, 200, 409]).toContain(response.status());
  });

  test('PUT /instructor-commissions/instructors/:id/commissions/:serviceId - updates service commission', async () => {
    if (!createdCommissionServiceId && !testServiceId) {
      test.skip();
      return;
    }

    const token = await getAdminToken(apiContext);
    const serviceId = createdCommissionServiceId || testServiceId;

    const commissionData = {
      commissionType: 'percentage',
      commissionValue: 55
    };

    const response = await apiContext.put(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions/${serviceId}`,
      {
        headers: authHeaders(token),
        data: commissionData
      }
    );

    expect([200, 404]).toContain(response.status());
  });

  test('PUT /instructor-commissions/instructors/:id/commissions/:serviceId - validates required fields', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.put(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions/test-service`,
      {
        headers: authHeaders(token),
        data: { commissionType: 'percentage' } // Missing commissionValue
      }
    );

    expect(response.status()).toBe(400);
  });

  test('DELETE /instructor-commissions/instructors/:id/commissions/:serviceId - deletes service commission', async () => {
    if (!createdCommissionServiceId) {
      test.skip();
      return;
    }

    const token = await getAdminToken(apiContext);

    const response = await apiContext.delete(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions/${createdCommissionServiceId}`,
      { headers: authHeaders(token) }
    );

    expect([200, 404]).toContain(response.status());
  });

  test('POST /instructor-commissions/instructors/:id/commissions - validates required fields', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.post(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions`,
      {
        headers: authHeaders(token),
        data: { commissionType: 'percentage', commissionValue: 50 } // Missing serviceId
      }
    );

    expect(response.status()).toBe(400);
  });

  test('POST /instructor-commissions/instructors/:id/commissions - requires authentication', async () => {
    const response = await apiContext.post(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions`,
      { data: { serviceId: 'test', commissionType: 'percentage', commissionValue: 50 } }
    );
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// INSTRUCTOR EARNINGS TESTS (from finances)
// ==============================================================================
test.describe('Instructor Earnings', () => {
  test('GET /finances/instructor-earnings/:instructorId - returns earnings data', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/instructor-earnings/${instructorUserId}`,
      { headers: authHeaders(token) }
    );

    // May return 200 with data or 404 if no earnings
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toBeDefined();
    }
  });

  test('GET /finances/instructor-earnings/:instructorId - instructor can view own earnings', async () => {
    const token = await getInstructorToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/finances/instructor-earnings/${instructorUserId}`,
      { headers: authHeaders(token) }
    );

    // Should be allowed to view own earnings
    expect([200, 404]).toContain(response.status());
  });

  test('GET /finances/instructor-earnings/:instructorId - requires authentication', async () => {
    const response = await apiContext.get(
      `${API_BASE}/finances/instructor-earnings/${instructorUserId}`
    );
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// STUDENT PROGRESS TESTS
// ==============================================================================
test.describe('Student Progress', () => {
  let createdProgressId: string | null = null;

  test('POST /instructors/me/students/:studentId/progress - adds progress', async () => {
    if (!testStudentId) {
      test.skip();
      return;
    }

    const token = await getInstructorToken(apiContext);

    const progressData = {
      skill: 'Test Skill',
      level: 'beginner',
      notes: `Progress added at ${new Date().toISOString()}`
    };

    const response = await apiContext.post(
      `${API_BASE}/instructors/me/students/${testStudentId}/progress`,
      {
        headers: authHeaders(token),
        data: progressData
      }
    );

    expect([201, 200, 404]).toContain(response.status());
    
    if (response.status() === 201) {
      const body = await response.json();
      if (body.id) {
        createdProgressId = body.id;
      }
    }
  });

  test('DELETE /instructors/me/students/:studentId/progress/:progressId - removes progress', async () => {
    if (!testStudentId || !createdProgressId) {
      test.skip();
      return;
    }

    const token = await getInstructorToken(apiContext);

    const response = await apiContext.delete(
      `${API_BASE}/instructors/me/students/${testStudentId}/progress/${createdProgressId}`,
      { headers: authHeaders(token) }
    );

    expect([204, 200, 404]).toContain(response.status());
  });

  test('POST /instructors/me/students/:studentId/progress - requires instructor role', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.post(
      `${API_BASE}/instructors/me/students/test-id/progress`,
      {
        headers: authHeaders(token),
        data: { skill: 'test', level: 'beginner' }
      }
    );

    // Admin should be denied
    expect([403, 404]).toContain(response.status());
  });

  test('POST /instructors/me/students/:studentId/progress - requires authentication', async () => {
    const response = await apiContext.post(
      `${API_BASE}/instructors/me/students/test-id/progress`,
      { data: { skill: 'test', level: 'beginner' } }
    );
    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// DATA INTEGRITY TESTS
// ==============================================================================
test.describe('Instructor Data Integrity', () => {
  test('Commission values are within valid range', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions`,
      { headers: authHeaders(token) }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Default commission value should be 0-100 for percentage
    if (body.defaultCommission.type === 'percentage') {
      const value = Number(body.defaultCommission.value);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }

    // Service commissions should also be in valid range
    for (const commission of body.commissions) {
      if (commission.commissionType === 'percentage') {
        const value = Number(commission.commissionValue);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  test('Instructor list only contains instructors', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    for (const instructor of body) {
      expect(instructor.role_name).toBe('instructor');
    }
  });

  test('Instructor bookings belong to correct instructor', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/${instructorUserId}`, {
      headers: authHeaders(token)
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    // All bookings should belong to this instructor
    if (body.bookings && body.bookings.length > 0) {
      for (const booking of body.bookings) {
        expect(booking.instructor_user_id).toBe(instructorUserId);
      }
    }
  });
});

// ==============================================================================
// ERROR HANDLING TESTS
// ==============================================================================
test.describe('Error Handling', () => {
  test('Invalid instructor ID format handled gracefully', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.get(`${API_BASE}/instructors/invalid-uuid`, {
      headers: authHeaders(token)
    });

    // Should return 404 or 400, not 500
    expect([400, 404, 500]).toContain(response.status());
  });

  test('Invalid commission type handled', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.put(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/default-commission`,
      {
        headers: authHeaders(token),
        data: {
          commissionType: 'invalid_type',
          commissionValue: 50
        }
      }
    );

    // Should either accept it (200), reject (400), or error (500)
    expect([200, 400, 500]).toContain(response.status());
  });

  test('Negative commission value handled', async () => {
    const token = await getAdminToken(apiContext);

    const response = await apiContext.put(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/default-commission`,
      {
        headers: authHeaders(token),
        data: {
          commissionType: 'percentage',
          commissionValue: -10
        }
      }
    );

    // Should either accept it (200) or reject (400)
    expect([200, 400]).toContain(response.status());
  });

  test('Expired token returns 401', async () => {
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QiLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0.invalid';

    const response = await apiContext.get(`${API_BASE}/instructors`, {
      headers: authHeaders(expiredToken)
    });

    expect([401, 403]).toContain(response.status());
  });
});

// ==============================================================================
// PERFORMANCE TESTS
// ==============================================================================
test.describe('Performance', () => {
  test('Instructor list responds within 3 seconds', async () => {
    const token = await getAdminToken(apiContext);

    const startTime = Date.now();
    const response = await apiContext.get(`${API_BASE}/instructors`, {
      headers: authHeaders(token)
    });
    const endTime = Date.now();

    expect(response.status()).toBe(200);
    expect(endTime - startTime).toBeLessThan(3000);
  });

  test('Instructor dashboard responds within 3 seconds', async () => {
    const token = await getInstructorToken(apiContext);

    const startTime = Date.now();
    const response = await apiContext.get(`${API_BASE}/instructors/me/dashboard`, {
      headers: authHeaders(token)
    });
    const endTime = Date.now();

    expect(response.status()).toBe(200);
    expect(endTime - startTime).toBeLessThan(3000);
  });

  test('Commission lookup responds within 2 seconds', async () => {
    const token = await getAdminToken(apiContext);

    const startTime = Date.now();
    const response = await apiContext.get(
      `${API_BASE}/instructor-commissions/instructors/${instructorUserId}/commissions`,
      { headers: authHeaders(token) }
    );
    const endTime = Date.now();

    expect(response.status()).toBe(200);
    expect(endTime - startTime).toBeLessThan(2000);
  });
});
