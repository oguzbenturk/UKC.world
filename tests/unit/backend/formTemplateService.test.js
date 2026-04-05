import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

let formTemplateService;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
    },
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    },
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../backend/services/formTemplateService.js');
    formTemplateService = mod;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// Mock client for transaction-based tests
function createMockClient(responses = []) {
  let callIndex = 0;
  return {
    async query(sql, params) {
      const response = responses[callIndex] || { rows: [] };
      callIndex++;
      return response;
    },
    async connect() {
      return this;
    },
    release() {},
  };
}

describe('formTemplateService.getFormTemplates', () => {
  test('retrieves all form templates with pagination', async () => {
    const { pool } = await import('../../../backend/db.js');

    const templates = [
      { id: 1, name: 'Contact Form', category: 'contact' },
      { id: 2, name: 'Registration', category: 'registration' },
    ];

    pool.query.mockResolvedValueOnce({ rows: [{ total: 2 }] }); // count
    pool.query.mockResolvedValueOnce({ rows: templates }); // data

    const result = await formTemplateService.getFormTemplates({}, 'user-1', 1, 20);

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  test('filters templates by category', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ total: 1 }] });
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Contact', category: 'contact' }],
    });

    const result = await formTemplateService.getFormTemplates(
      { category: 'contact' },
      'user-1'
    );

    expect(result.data[0].category).toBe('contact');
  });

  test('filters templates by is_active', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ total: 1 }] });
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, is_active: true }],
    });

    await formTemplateService.getFormTemplates(
      { is_active: true },
      'user-1'
    );

    const countCall = pool.query.mock.calls[0];
    expect(countCall[1]).toContain(true);
  });

  test('searches templates by name and description', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ total: 1 }] });
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Contact Form' }] });

    await formTemplateService.getFormTemplates(
      { search: 'contact' },
      'user-1'
    );

    const countCall = pool.query.mock.calls[0];
    expect(countCall[1]).toContain('%contact%');
  });

  test('calculates total pages correctly', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ total: 50 }] });
    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await formTemplateService.getFormTemplates({}, 'user-1', 1, 20);

    expect(result.totalPages).toBe(3);
  });
});

describe('formTemplateService.getFormTemplateById', () => {
  test('retrieves form template with steps and fields', async () => {
    const { pool } = await import('../../../backend/db.js');

    const template = { id: 1, name: 'Contact Form' };
    const steps = [{ id: 10, form_template_id: 1, title: 'Step 1' }];
    const fields = [
      { id: 100, form_step_id: 10, field_name: 'name', field_type: 'text' },
    ];

    pool.query.mockResolvedValueOnce({ rows: [template] }); // template
    pool.query.mockResolvedValueOnce({ rows: steps }); // steps
    pool.query.mockResolvedValueOnce({ rows: fields }); // fields for step 1

    const result = await formTemplateService.getFormTemplateById(1);

    expect(result.id).toBe(1);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].fields).toHaveLength(1);
  });

  test('returns null for non-existent template', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await formTemplateService.getFormTemplateById(999);

    expect(result).toBeNull();
  });
});

describe('formTemplateService.createFormTemplate', () => {
  test('creates new form template with default settings', async () => {
    const { pool } = await import('../../../backend/db.js');

    const created = {
      id: 1,
      name: 'New Form',
      category: 'registration',
      is_active: true,
      settings: {
        allow_save_progress: true,
        show_progress_bar: true,
        require_captcha: false,
      },
    };

    pool.query.mockResolvedValueOnce({ rows: [created] });

    const result = await formTemplateService.createFormTemplate(
      { name: 'New Form' },
      'user-1'
    );

    expect(result.id).toBe(1);
    expect(result.name).toBe('New Form');
    expect(result.is_active).toBe(true);
  });

  test('creates form with custom settings', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 2,
          settings: {
            allow_save_progress: false,
            require_captcha: true,
            redirect_url: 'https://example.com',
          },
        },
      ],
    });

    const result = await formTemplateService.createFormTemplate(
      {
        name: 'Custom Form',
        settings: { require_captcha: true },
      },
      'user-1'
    );

    expect(result.id).toBe(2);
  });
});

describe('formTemplateService.updateFormTemplate', () => {
  test('updates form template fields', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Updated' }] }); // update
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Updated' }] }); // fetch full
    pool.query.mockResolvedValueOnce({ rows: [] }); // steps
    pool.query.mockResolvedValueOnce({ rows: [] }); // fields

    const result = await formTemplateService.updateFormTemplate(1, {
      name: 'Updated',
      is_active: false,
    });

    expect(result.id).toBe(1);
  });

  test('returns null when template not found', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] }); // update returns empty

    const result = await formTemplateService.updateFormTemplate(999, {
      name: 'Test',
    });

    expect(result).toBeNull();
  });
});

describe('formTemplateService.deleteFormTemplate', () => {
  test('prevents deletion of template in use by active quick links', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ count: '1' }] }); // usage check

    await expect(
      formTemplateService.deleteFormTemplate(1)
    ).rejects.toThrow('Cannot delete form template that is in use by active quick links');
  });

  test('soft deletes template when not in use', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] }); // usage check
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // delete

    const result = await formTemplateService.deleteFormTemplate(1);

    expect(result).toBe(true);
  });

  test('returns false when template not found', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] }); // usage check
    pool.query.mockResolvedValueOnce({ rows: [] }); // delete returns empty

    const result = await formTemplateService.deleteFormTemplate(999);

    expect(result).toBe(false);
  });
});

describe('formTemplateService.duplicateFormTemplate', () => {
  test('duplicates form template with steps and fields', async () => {
    const { pool } = await import('../../../backend/db.js');

    // Setup mock client
    const mockClient = {
      async query(sql) {
        if (sql?.includes('BEGIN')) return { rows: [] };
        if (sql?.includes('COMMIT')) return { rows: [] };
        if (sql?.includes('SELECT') && !sql.includes('form_steps')) {
          return {
            rows: [
              {
                id: 1,
                name: 'Original',
                steps: [
                  {
                    id: 10,
                    title: 'Step 1',
                    fields: [
                      { id: 100, field_name: 'name', field_type: 'text' },
                    ],
                  },
                ],
              },
            ],
          };
        }
        return { rows: [{ id: 2 }, { id: 20 }, { id: 200 }] };
      },
      release() {},
    };

    pool.connect.mockResolvedValueOnce(mockClient);

    // Mock getFormTemplateById
    const originalMod = await import('../../../backend/services/formTemplateService.js');
    jest.spyOn(originalMod, 'getFormTemplateById').mockResolvedValueOnce({
      id: 1,
      name: 'Original',
      steps: [],
    });

    jest.spyOn(originalMod, 'getFormTemplateById').mockResolvedValueOnce({
      id: 2,
      name: 'Original (Copy)',
      steps: [],
    });

    const result = await formTemplateService.duplicateFormTemplate(
      1,
      'Original (Copy)',
      'user-1'
    );

    expect(result.id).toBe(2);
  });
});

describe('formTemplateService.createFormStep', () => {
  test('creates new form step', async () => {
    const { pool } = await import('../../../backend/db.js');

    const step = { id: 10, form_template_id: 1, title: 'Step 1', order_index: 0 };

    pool.query.mockResolvedValueOnce({ rows: [{ next_order: 0 }] }); // max order
    pool.query.mockResolvedValueOnce({ rows: [step] }); // insert
    pool.query.mockResolvedValueOnce({ rows: [] }); // update template

    const result = await formTemplateService.createFormStep(1, {
      title: 'Step 1',
    });

    expect(result.id).toBe(10);
    expect(result.title).toBe('Step 1');
  });

  test('auto-calculates next order index', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ next_order: 2 }] }); // max order + 1
    pool.query.mockResolvedValueOnce({ rows: [{ id: 11, order_index: 2 }] }); // insert

    await formTemplateService.createFormStep(1, { title: 'Step 3' });

    const insertCall = pool.query.mock.calls.find(call =>
      call[0]?.includes('INSERT INTO form_steps')
    );
    expect(insertCall[1][3]).toBe(2); // order_index param
  });
});

describe('formTemplateService.deleteFormStep', () => {
  test('deletes form step and reorders remaining', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({
      rows: [{ form_template_id: 1 }],
    }); // fetch template id
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10 }] }); // delete
    pool.query.mockResolvedValueOnce({ rows: [] }); // reorder
    pool.query.mockResolvedValueOnce({ rows: [] }); // update template

    const result = await formTemplateService.deleteFormStep(10);

    expect(result).toBe(true);
  });
});

describe('formTemplateService.createFormField', () => {
  test('creates new form field', async () => {
    const { pool } = await import('../../../backend/db.js');

    const field = {
      id: 100,
      form_step_id: 10,
      field_name: 'name',
      field_type: 'text',
    };

    pool.query.mockResolvedValueOnce({ rows: [{ next_order: 0 }] }); // max order
    pool.query.mockResolvedValueOnce({ rows: [field] }); // insert
    pool.query.mockResolvedValueOnce({ rows: [{ form_template_id: 1 }] }); // step lookup
    pool.query.mockResolvedValueOnce({ rows: [] }); // update template

    const result = await formTemplateService.createFormField(10, {
      field_type: 'text',
      field_name: 'name',
      field_label: 'Name',
    });

    expect(result.id).toBe(100);
    expect(result.field_type).toBe('text');
  });

  test('validates required field properties', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ next_order: 0 }] });
    pool.query.mockResolvedValueOnce({ rows: [{ id: 101 }] });
    pool.query.mockResolvedValueOnce({ rows: [{ form_template_id: 1 }] });
    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await formTemplateService.createFormField(10, {
      field_type: 'text',
      field_name: 'email',
      field_label: 'Email',
      is_required: true,
    });

    expect(pool.query).toHaveBeenCalled();
  });
});

describe('formTemplateService.deleteFormField', () => {
  test('deletes form field and reorders remaining', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({
      rows: [{ form_step_id: 10, form_template_id: 1 }],
    }); // fetch info
    pool.query.mockResolvedValueOnce({ rows: [{ id: 100 }] }); // delete
    pool.query.mockResolvedValueOnce({ rows: [] }); // reorder
    pool.query.mockResolvedValueOnce({ rows: [] }); // update template

    const result = await formTemplateService.deleteFormField(100);

    expect(result).toBe(true);
  });
});

describe('formTemplateService.generateFieldName', () => {
  test('converts label to snake_case field name', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] }); // uniqueness check

    const result = await formTemplateService.generateFieldName('First Name', 10);

    expect(result).toBe('first_name');
  });

  test('ensures field name uniqueness', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // exists
    pool.query.mockResolvedValueOnce({ rows: [] }); // doesn't exist with _1

    const result = await formTemplateService.generateFieldName('name', 10);

    expect(result).toBe('name_1');
  });
});

describe('formTemplateService.createFormTemplateVersion', () => {
  test('creates version snapshot with all template data', async () => {
    const { pool } = await import('../../../backend/db.js');

    const mockClient = {
      async query(sql) {
        if (sql?.includes('BEGIN')) return { rows: [] };
        if (sql?.includes('COMMIT')) return { rows: [] };
        if (sql?.includes('COALESCE(MAX(version_number))')) {
          return { rows: [{ next_version: 1 }] };
        }
        return { rows: [{ id: 1, version_number: 1 }] };
      },
      release() {},
    };

    pool.connect.mockResolvedValueOnce(mockClient);

    // Mock the getFormTemplateById to return template data
    jest.spyOn(formTemplateService, 'getFormTemplateById').mockResolvedValueOnce(
      {
        id: 1,
        name: 'Test',
        steps: [],
      }
    );

    const result = await formTemplateService.createFormTemplateVersion(
      1,
      { version_label: 'v1.0' },
      'user-1'
    );

    expect(result.version_number).toBe(1);
  });
});
