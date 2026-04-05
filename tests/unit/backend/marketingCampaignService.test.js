import { jest, describe, test, expect, beforeAll, afterEach } from '@jest/globals';

let marketingCampaignService;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    },
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    },
  }));

  await jest.isolateModulesAsync(async () => {
    const mod = await import('../../../backend/services/marketingCampaignService.js');
    marketingCampaignService = mod;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('marketingCampaignService.getAllCampaigns', () => {
  test('retrieves all campaigns without filters', async () => {
    const { pool } = await import('../../../backend/db.js');

    const campaigns = [
      {
        id: 1,
        name: 'Summer Promo',
        type: 'email',
        status: 'draft',
        created_by_name: 'John Admin',
      },
      {
        id: 2,
        name: 'Flash Sale',
        type: 'sms',
        status: 'published',
        created_by_name: 'Jane Manager',
      },
    ];

    pool.query.mockResolvedValueOnce({ rows: campaigns });

    const result = await marketingCampaignService.getAllCampaigns();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Summer Promo');
    expect(result[1].name).toBe('Flash Sale');
  });

  test('filters campaigns by type', async () => {
    const { pool } = await import('../../../backend/db.js');

    const campaigns = [
      { id: 1, name: 'Email Campaign', type: 'email', status: 'draft' },
    ];

    pool.query.mockResolvedValueOnce({ rows: campaigns });

    const result = await marketingCampaignService.getAllCampaigns({ type: 'email' });

    expect(result[0].type).toBe('email');
    expect(pool.query.mock.calls[0][1][0]).toBe('email');
  });

  test('filters campaigns by status', async () => {
    const { pool } = await import('../../../backend/db.js');

    const campaigns = [
      { id: 1, name: 'Active Campaign', type: 'email', status: 'published' },
    ];

    pool.query.mockResolvedValueOnce({ rows: campaigns });

    const result = await marketingCampaignService.getAllCampaigns({
      status: 'published',
    });

    expect(result[0].status).toBe('published');
  });

  test('returns campaigns ordered by creation date descending', async () => {
    const { pool } = await import('../../../backend/db.js');

    const campaigns = [
      {
        id: 2,
        name: 'Newer Campaign',
        created_at: new Date('2026-02-01'),
      },
      { id: 1, name: 'Older Campaign', created_at: new Date('2026-01-01') },
    ];

    pool.query.mockResolvedValueOnce({ rows: campaigns });

    const result = await marketingCampaignService.getAllCampaigns();

    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
  });
});

describe('marketingCampaignService.getCampaignById', () => {
  test('retrieves campaign by ID', async () => {
    const { pool } = await import('../../../backend/db.js');

    const campaign = {
      id: 1,
      name: 'Spring Campaign',
      type: 'email',
      status: 'draft',
    };

    pool.query.mockResolvedValueOnce({ rows: [campaign] });

    const result = await marketingCampaignService.getCampaignById(1);

    expect(result.id).toBe(1);
    expect(result.name).toBe('Spring Campaign');
  });

  test('throws error when campaign not found', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      marketingCampaignService.getCampaignById(999)
    ).rejects.toThrow('Campaign not found');
  });
});

describe('marketingCampaignService.createCampaign', () => {
  test('creates email campaign with subject and content', async () => {
    const { pool } = await import('../../../backend/db.js');

    const created = {
      id: 1,
      name: 'Welcome Email',
      type: 'email',
      email_subject: 'Welcome to Plannivo!',
      email_content: 'Hi there...',
      status: 'draft',
      created_by: 'user-1',
    };

    pool.query.mockResolvedValueOnce({ rows: [created] });

    const result = await marketingCampaignService.createCampaign(
      {
        name: 'Welcome Email',
        type: 'email',
        emailSubject: 'Welcome to Plannivo!',
        emailContent: 'Hi there...',
        audience: 'all_users',
      },
      'user-1'
    );

    expect(result.id).toBe(1);
    expect(result.email_subject).toBe('Welcome to Plannivo!');
    expect(result.status).toBe('draft');
  });

  test('creates SMS campaign', async () => {
    const { pool } = await import('../../../backend/db.js');

    const created = {
      id: 2,
      name: 'SMS Reminder',
      type: 'sms',
      sms_content: 'Reminder: Book your next lesson!',
      status: 'draft',
    };

    pool.query.mockResolvedValueOnce({ rows: [created] });

    const result = await marketingCampaignService.createCampaign(
      {
        name: 'SMS Reminder',
        type: 'sms',
        smsContent: 'Reminder: Book your next lesson!',
        audience: 'students',
      },
      'user-1'
    );

    expect(result.type).toBe('sms');
    expect(result.sms_content).toBe('Reminder: Book your next lesson!');
  });

  test('creates popup campaign with styling', async () => {
    const { pool } = await import('../../../backend/db.js');

    const popupStyle = { background: '#fff', border: '1px solid #ccc' };

    const created = {
      id: 3,
      name: 'Popup Offer',
      type: 'popup',
      popup_title: 'Special Offer',
      popup_message: '20% off packages!',
      popup_style: JSON.stringify(popupStyle),
      status: 'draft',
    };

    pool.query.mockResolvedValueOnce({ rows: [created] });

    const result = await marketingCampaignService.createCampaign(
      {
        name: 'Popup Offer',
        type: 'popup',
        popupTitle: 'Special Offer',
        popupMessage: '20% off packages!',
        popupStyle,
        audience: 'visitors',
      },
      'user-1'
    );

    expect(result.type).toBe('popup');
    expect(result.popup_title).toBe('Special Offer');
  });

  test('creates survey/question campaign', async () => {
    const { pool } = await import('../../../backend/db.js');

    const answers = [
      { value: 'very_satisfied', label: 'Very Satisfied' },
      { value: 'satisfied', label: 'Satisfied' },
      { value: 'dissatisfied', label: 'Dissatisfied' },
    ];

    const created = {
      id: 4,
      name: 'Satisfaction Survey',
      type: 'question',
      question_text: 'How satisfied are you?',
      question_answers: JSON.stringify(answers),
      status: 'draft',
    };

    pool.query.mockResolvedValueOnce({ rows: [created] });

    const result = await marketingCampaignService.createCampaign(
      {
        name: 'Satisfaction Survey',
        type: 'question',
        questionText: 'How satisfied are you?',
        questionAnswers: answers,
        audience: 'all_users',
      },
      'user-1'
    );

    expect(result.type).toBe('question');
    expect(result.question_text).toBe('How satisfied are you?');
  });

  test('sets default status as draft', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({
      rows: [{ id: 5, name: 'New Campaign', status: 'draft' }],
    });

    const result = await marketingCampaignService.createCampaign(
      {
        name: 'New Campaign',
        type: 'email',
        audience: 'all',
      },
      'user-1'
    );

    expect(result.status).toBe('draft');
  });

  test('logs campaign creation', async () => {
    const { pool } = await import('../../../backend/db.js');
    const { logger } = await import('../../../backend/middlewares/errorHandler.js');

    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Test', type: 'email' }],
    });

    await marketingCampaignService.createCampaign(
      {
        name: 'Test',
        type: 'email',
        audience: 'all',
      },
      'user-1'
    );

    expect(logger.info).toHaveBeenCalledWith(
      'Marketing campaign created',
      expect.objectContaining({ campaignId: 1, type: 'email', name: 'Test' })
    );
  });
});

describe('marketingCampaignService.updateCampaign', () => {
  test('updates campaign fields', async () => {
    const { pool } = await import('../../../backend/db.js');

    const updated = {
      id: 1,
      name: 'Updated Campaign',
      status: 'published',
      email_subject: 'New Subject',
    };

    pool.query.mockResolvedValueOnce({ rows: [updated] });

    const result = await marketingCampaignService.updateCampaign(1, {
      name: 'Updated Campaign',
      status: 'published',
      email_subject: 'New Subject',
    });

    expect(result.name).toBe('Updated Campaign');
    expect(result.status).toBe('published');
  });

  test('updates JSON fields correctly', async () => {
    const { pool } = await import('../../../backend/db.js');

    const popupStyle = { color: 'red', fontSize: '16px' };

    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, popup_style: JSON.stringify(popupStyle) }],
    });

    await marketingCampaignService.updateCampaign(1, {
      popup_style: popupStyle,
    });

    const updateCall = pool.query.mock.calls[0];
    expect(updateCall[1][0]).toBe(JSON.stringify(popupStyle));
  });

  test('throws error when campaign not found', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      marketingCampaignService.updateCampaign(999, { name: 'Test' })
    ).rejects.toThrow('Campaign not found');
  });

  test('throws error when no valid fields provided', async () => {
    const { pool } = await import('../../../backend/db.js');

    await expect(
      marketingCampaignService.updateCampaign(1, { invalid_field: 'test' })
    ).rejects.toThrow('No valid fields to update');
  });

  test('logs campaign update', async () => {
    const { pool } = await import('../../../backend/db.js');
    const { logger } = await import('../../../backend/middlewares/errorHandler.js');

    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await marketingCampaignService.updateCampaign(1, { name: 'Updated' });

    expect(logger.info).toHaveBeenCalledWith('Campaign updated', {
      campaignId: 1,
    });
  });
});

describe('marketingCampaignService.deleteCampaign', () => {
  test('deletes campaign', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await marketingCampaignService.deleteCampaign(1);

    expect(pool.query).toHaveBeenCalledWith(
      'DELETE FROM marketing_campaigns WHERE id = $1',
      [1]
    );
  });

  test('logs campaign deletion', async () => {
    const { pool } = await import('../../../backend/db.js');
    const { logger } = await import('../../../backend/middlewares/errorHandler.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    await marketingCampaignService.deleteCampaign(1);

    expect(logger.info).toHaveBeenCalledWith('Campaign deleted', {
      campaignId: 1,
    });
  });
});

describe('marketingCampaignService.updateCampaignAnalytics', () => {
  test('increments sent count', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    await marketingCampaignService.updateCampaignAnalytics(1, { sent: 100 });

    const updateCall = pool.query.mock.calls[0];
    expect(updateCall[0]).toContain('sent_count = sent_count +');
    expect(updateCall[1][0]).toBe(100);
  });

  test('increments opened count', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    await marketingCampaignService.updateCampaignAnalytics(1, { opened: 50 });

    const updateCall = pool.query.mock.calls[0];
    expect(updateCall[0]).toContain('opened_count = opened_count +');
  });

  test('increments clicked count', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    await marketingCampaignService.updateCampaignAnalytics(1, { clicked: 25 });

    const updateCall = pool.query.mock.calls[0];
    expect(updateCall[0]).toContain('clicked_count = clicked_count +');
  });

  test('increments converted count', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    await marketingCampaignService.updateCampaignAnalytics(1, { converted: 10 });

    const updateCall = pool.query.mock.calls[0];
    expect(updateCall[0]).toContain('converted_count = converted_count +');
  });

  test('updates multiple analytics fields at once', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    await marketingCampaignService.updateCampaignAnalytics(1, {
      sent: 100,
      opened: 50,
      clicked: 25,
      converted: 10,
    });

    const updateCall = pool.query.mock.calls[0];
    const query = updateCall[0];

    expect(query).toContain('sent_count = sent_count +');
    expect(query).toContain('opened_count = opened_count +');
    expect(query).toContain('clicked_count = clicked_count +');
    expect(query).toContain('converted_count = converted_count +');
  });

  test('handles partial analytics updates', async () => {
    const { pool } = await import('../../../backend/db.js');

    pool.query.mockResolvedValueOnce({ rows: [] });

    await marketingCampaignService.updateCampaignAnalytics(1, {
      sent: 100,
      converted: 5,
    });

    const updateCall = pool.query.mock.calls[0];
    const query = updateCall[0];
    const params = updateCall[1];

    // Should only have SET clauses for sent and converted
    expect(query.split(',').length).toBe(2); // 2 SET clauses
    expect(params).toContain(100);
    expect(params).toContain(5);
  });
});

describe('marketingCampaignService integration', () => {
  test('campaign lifecycle: create -> update -> analyze -> delete', async () => {
    const { pool } = await import('../../../backend/db.js');

    // Create
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'draft' }] });
    const created = await marketingCampaignService.createCampaign(
      {
        name: 'Test Campaign',
        type: 'email',
        audience: 'all',
      },
      'user-1'
    );

    // Update
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'published' }],
    });
    const updated = await marketingCampaignService.updateCampaign(1, {
      status: 'published',
    });

    // Update analytics
    pool.query.mockResolvedValueOnce({ rows: [] });
    await marketingCampaignService.updateCampaignAnalytics(1, {
      sent: 1000,
      opened: 300,
      clicked: 100,
      converted: 20,
    });

    // Delete
    pool.query.mockResolvedValueOnce({ rows: [] });
    await marketingCampaignService.deleteCampaign(1);

    expect(created).toBeDefined();
    expect(updated.status).toBe('published');
    expect(pool.query).toHaveBeenCalledTimes(4);
  });

  test('campaign type flexibility - email, SMS, popup, question', async () => {
    const { pool } = await import('../../../backend/db.js');

    const types = ['email', 'sms', 'popup', 'question'];

    for (const type of types) {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, type, status: 'draft' }],
      });

      const campaign = await marketingCampaignService.createCampaign(
        {
          name: `Campaign ${type}`,
          type,
          audience: 'all',
        },
        'user-1'
      );

      expect(campaign.type).toBe(type);
    }
  });
});
