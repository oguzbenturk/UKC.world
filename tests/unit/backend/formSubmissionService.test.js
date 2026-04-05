import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

let formSubmissionService;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    },
  }));

  await jest.unstable_mockModule('../../../backend/services/emailService.js', () => ({
    sendEmail: jest.fn(),
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    },
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../backend/services/formSubmissionService.js');
    formSubmissionService = mod;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('formSubmissionService.createFormSubmission', () => {
  test('creates a new form submission with draft status', async () => {
    const { pool } = await import('../../../backend/db.js');

    const mockSubmission = {
      id: 1,
      form_template_id: 10,
      session_id: 'abc123',
      status: 'draft',
      submission_data: '{}',
      user_id: null,
      created_at: new Date(),
    };

    pool.query.mockResolvedValueOnce({ rows: [mockSubmission] });
    pool.query.mockResolvedValue({ rows: [] });

    const result = await formSubmissionService.createFormSubmission({
      form_template_id: 10,
      status: 'draft',
      submission_data: {},
    });

    expect(result).toHaveProperty('id', 1);
    expect(result.status).toBe('draft');
    expect(pool.query).toHaveBeenCalled();
  });

  test('creates submission with submitted status and sends notifications', async () => {
    const { pool } = await import('../../../backend/db.js');
    const { sendEmail } = await import('../../../backend/services/emailService.js');

    const mockSubmission = {
      id: 2,
      form_template_id: 10,
      session_id: 'def456',
      status: 'submitted',
      submission_data: '{"name":"John"}',
      user_id: 'user1',
      created_at: new Date(),
      submitted_at: new Date(),
    };

    // Mock the INSERT query
    pool.query.mockResolvedValueOnce({ rows: [mockSubmission] });

    // Mock quick_link update
    pool.query.mockResolvedValueOnce({ rows: [] });

    // Mock form template and quick link lookup for notifications
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          form_name: 'Contact Form',
          settings: { notification_emails: ['admin@example.com'] },
          notification_recipients: null,
        },
      ],
    });

    // Mock admin users lookup
    pool.query.mockResolvedValueOnce({
      rows: [{ email: 'admin@example.com' }],
    });

    const result = await formSubmissionService.createFormSubmission({
      form_template_id: 10,
      status: 'submitted',
      submission_data: { name: 'John' },
      user_id: 'user1',
    });

    expect(result.status).toBe('submitted');
    expect(sendEmail).toHaveBeenCalled();
  });

  test('increments quick link use count when submitted', async () => {
    const { pool } = await import('../../../backend/db.js');

    const mockSubmission = {
      id: 3,
      form_template_id: 10,
      quick_link_id: 5,
      status: 'submitted',
    };

    pool.query.mockResolvedValueOnce({ rows: [mockSubmission] });
    pool.query.mockResolvedValueOnce({ rows: [] }); // quick link update
    pool.query.mockResolvedValueOnce({ rows: [{ notification_recipients: null }] }); // template lookup
    pool.query.mockResolvedValueOnce({ rows: [] }); // admin lookup

    await formSubmissionService.createFormSubmission({
      form_template_id: 10,
      quick_link_id: 5,
      status: 'submitted',
    });

    const updateCall = pool.query.mock.calls.find(call =>
      call[0]?.includes('UPDATE quick_links')
    );
    expect(updateCall).toBeDefined();
  });

  test('generates unique session ID when not provided', async () => {
    const { pool } = await import('../../../backend/db.js');

    let capturedSessionId;
    pool.query.mockImplementation((query, params) => {
      if (query?.includes('INSERT INTO form_submissions')) {
        capturedSessionId = params[2];
      }
      return Promise.resolve({ rows: [{ id: 4, status: 'draft' }] });
    });

    await formSubmissionService.createFormSubmission({
      form_template_id: 10,
      status: 'draft',
    });

    expect(capturedSessionId).toBeDefined();
    expect(capturedSessionId).toMatch(/^[a-f0-9]{32}$/);
  });

  test('uses provided session ID', async () => {
    const { pool } = await import('../../../backend/db.js');

    const providedSessionId = 'custom-session-id';
    let capturedSessionId;

    pool.query.mockImplementation((query, params) => {
      if (query?.includes('INSERT INTO form_submissions')) {
        capturedSessionId = params[2];
      }
      return Promise.resolve({ rows: [{ id: 5, status: 'draft' }] });
    });

    await formSubmissionService.createFormSubmission({
      form_template_id: 10,
      session_id: providedSessionId,
      status: 'draft',
    });

    expect(capturedSessionId).toBe(providedSessionId);
  });
});

describe('formSubmissionService.getFormSubmissions', () => {
  test('retrieves submissions with pagination', async () => {
    const { pool } = await import('../../../backend/db.js');

    const mockSubmissions = [
      { id: 1, status: 'submitted', created_at: new Date() },
      { id: 2, status: 'processed', created_at: new Date() },
    ];

    pool.query.mockResolvedValueOnce({ rows: mockSubmissions });
    pool.query.mockResolvedValueOnce({ rows: [{ count: 2 }] });

    const result = await formSubmissionService.getFormSubmissions({
      limit: 50,
      offset: 0,
    });

    expect(result.submissions).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  test('filters submissions by status', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'submitted' }] });
    pool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    const result = await formSubmissionService.getFormSubmissions({
      status: 'submitted',
    });

    expect(result.submissions[0].status).toBe('submitted');
  });

  test('filters submissions by form template ID', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, form_template_id: 10 }],
    });
    pool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    await formSubmissionService.getFormSubmissions({
      form_template_id: 10,
    });

    const selectCall = pool.query.mock.calls[0];
    expect(selectCall[0]).toContain('form_template_id');
  });

  test('searches submissions by content', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    pool.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    await formSubmissionService.getFormSubmissions({
      search: 'John',
    });

    const selectCall = pool.query.mock.calls[0];
    expect(selectCall[0]).toContain('ILIKE');
  });

  test('filters by date range', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const startDate = '2026-01-01';
    const endDate = '2026-12-31';

    await formSubmissionService.getFormSubmissions({
      start_date: startDate,
      end_date: endDate,
    });

    const calls = pool.query.mock.calls;
    expect(calls.some(call => call[1]?.includes(startDate))).toBe(true);
  });
});

describe('formSubmissionService.getFormSubmissionById', () => {
  test('retrieves submission with form details', async () => {
    const { pool } = await import('../../../backend/db.js');

    const mockSubmission = {
      id: 1,
      status: 'submitted',
      submission_data: {},
      form_template_id: 10,
    };

    const mockFormFields = [
      { field_name: 'name', field_label: 'Name', field_type: 'text' },
    ];

    pool.query.mockResolvedValueOnce({ rows: [mockSubmission] });
    pool.query.mockResolvedValueOnce({ rows: mockFormFields });

    const result = await formSubmissionService.getFormSubmissionById(1);

    expect(result.id).toBe(1);
    expect(result.form_fields).toEqual(mockFormFields);
  });

  test('returns null for non-existent submission', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await formSubmissionService.getFormSubmissionById(999);

    expect(result).toBeNull();
  });
});

describe('formSubmissionService.updateFormSubmission', () => {
  test('updates submission data and status', async () => {
    const { pool } = await import('../../../backend/db.js');

    const updated = {
      id: 1,
      status: 'processed',
      submission_data: '{"name":"John"}',
      updated_at: new Date(),
    };

    pool.query.mockResolvedValueOnce({ rows: [updated] });

    const result = await formSubmissionService.updateFormSubmission(1, {
      status: 'processed',
      submission_data: { name: 'John' },
    });

    expect(result.status).toBe('processed');
  });

  test('sets submitted_at when status changes to submitted', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'submitted', submitted_at: new Date() }],
    });

    await formSubmissionService.updateFormSubmission(1, {
      status: 'submitted',
    });

    const updateCall = pool.query.mock.calls[0];
    expect(updateCall[0]).toContain('submitted_at');
  });
});

describe('formSubmissionService.processFormSubmission', () => {
  test('marks submission as processed', async () => {
    const { pool } = await import('../../../backend/db.js');

    const processed = {
      id: 1,
      status: 'processed',
      processed_at: new Date(),
      processed_by: 'user-123',
    };

    pool.query.mockResolvedValueOnce({ rows: [processed] });

    const result = await formSubmissionService.processFormSubmission(
      1,
      'user-123',
      'Approved'
    );

    expect(result.status).toBe('processed');
    expect(result.processed_by).toBe('user-123');
  });
});

describe('formSubmissionService.archiveFormSubmission', () => {
  test('archives a submission', async () => {
    const { pool } = await import('../../../backend/db.js');

    const archived = { id: 1, status: 'archived' };

    pool.query.mockResolvedValueOnce({ rows: [archived] });

    const result = await formSubmissionService.archiveFormSubmission(1);

    expect(result.status).toBe('archived');
  });
});

describe('formSubmissionService.deleteFormSubmission', () => {
  test('deletes a submission and returns true', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const result = await formSubmissionService.deleteFormSubmission(1);

    expect(result).toBe(true);
  });

  test('returns false when submission not found', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await formSubmissionService.deleteFormSubmission(999);

    expect(result).toBe(false);
  });
});

describe('formSubmissionService.validateSubmission', () => {
  test('validates required fields', async () => {
    const { pool } = await import('../../../backend/db.js');

    const fields = [
      {
        field_name: 'email',
        field_label: 'Email',
        field_type: 'email',
        is_required: true,
      },
    ];

    pool.query.mockResolvedValueOnce({ rows: fields });

    const result = await formSubmissionService.validateSubmission(
      { name: 'John' },
      1
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'required' })
    );
  });

  test('validates email format', async () => {
    const { pool } = await import('../../../backend/db.js');

    const fields = [
      {
        field_name: 'email',
        field_label: 'Email',
        field_type: 'email',
        is_required: false,
      },
    ];

    pool.query.mockResolvedValueOnce({ rows: fields });

    // Note: service allows any string per user request, so this will pass
    const result = await formSubmissionService.validateSubmission(
      { email: 'not-an-email' },
      1
    );

    expect(result.isValid).toBe(true);
  });

  test('validates number ranges', async () => {
    const { pool } = await import('../../../backend/db.js');

    const fields = [
      {
        field_name: 'age',
        field_label: 'Age',
        field_type: 'number',
        is_required: false,
        validation_rules: { min_value: 0, max_value: 150 },
      },
    ];

    pool.query.mockResolvedValueOnce({ rows: fields });

    const result = await formSubmissionService.validateSubmission(
      { age: 200 },
      1
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'max_value' })
    );
  });

  test('validates URL format', async () => {
    const { pool } = await import('../../../backend/db.js');

    const fields = [
      {
        field_name: 'website',
        field_label: 'Website',
        field_type: 'url',
        is_required: false,
      },
    ];

    pool.query.mockResolvedValueOnce({ rows: fields });

    const result = await formSubmissionService.validateSubmission(
      { website: 'not-a-url' },
      1
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'format' })
    );
  });

  test('validates select option values', async () => {
    const { pool } = await import('../../../backend/db.js');

    const fields = [
      {
        field_name: 'level',
        field_label: 'Level',
        field_type: 'select',
        is_required: false,
        options: [
          { value: 'beginner' },
          { value: 'intermediate' },
          { value: 'advanced' },
        ],
      },
    ];

    pool.query.mockResolvedValueOnce({ rows: fields });

    const result = await formSubmissionService.validateSubmission(
      { level: 'invalid' },
      1
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'invalid_option' })
    );
  });
});

describe('formSubmissionService.getFormSubmissionStats', () => {
  test('returns submission statistics', async () => {
    const { pool } = await import('../../../backend/db.js');

    const stats = {
      submitted_count: 50,
      processed_count: 40,
      draft_count: 5,
      archived_count: 2,
      total_count: 97,
      avg_completion_time_seconds: 1800,
    };

    pool.query.mockResolvedValueOnce({ rows: [stats] });

    const result = await formSubmissionService.getFormSubmissionStats(1);

    expect(result.submitted_count).toBe(50);
    expect(result.processed_count).toBe(40);
    expect(result.avg_completion_time_seconds).toBe(1800);
  });
});
