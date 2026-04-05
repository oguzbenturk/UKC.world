import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

let supportTicketService;
let mockPool;

beforeAll(async () => {
  mockPool = {
    query: jest.fn()
  };

  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: mockPool
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }
  }));

  const mod = await import('../../../backend/services/supportTicketService.js');
  supportTicketService = mod;
});

beforeEach(() => {
  mockPool.query.mockReset();
});

describe('supportTicketService.getAllSupportTickets', () => {
  test('returns all tickets with no filters', async () => {
    const mockTickets = [
      {
        id: 'ticket-1',
        student_id: 'user-1',
        subject: 'Connection issue',
        message: 'Cannot connect to app',
        channel: 'email',
        priority: 'high',
        status: 'open',
        created_at: '2026-04-01T10:00:00Z',
        student_name: 'John Doe',
        student_email: 'john@example.com'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockTickets });

    const result = await supportTicketService.getAllSupportTickets();

    expect(result).toEqual(mockTickets);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), []);
  });

  test('filters tickets by status', async () => {
    const mockTickets = [
      {
        id: 'ticket-1',
        status: 'resolved',
        priority: 'normal'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockTickets });

    const result = await supportTicketService.getAllSupportTickets({ status: 'resolved' });

    expect(result).toEqual(mockTickets);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ssr.status = $1'),
      ['resolved']
    );
  });

  test('filters tickets by priority', async () => {
    const mockTickets = [
      {
        id: 'ticket-1',
        priority: 'urgent'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockTickets });

    const result = await supportTicketService.getAllSupportTickets({ priority: 'urgent' });

    expect(result).toEqual(mockTickets);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ssr.priority = $'),
      ['urgent']
    );
  });

  test('filters tickets by studentId', async () => {
    const mockTickets = [
      {
        id: 'ticket-1',
        student_id: 'student-123'
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockTickets });

    const result = await supportTicketService.getAllSupportTickets({ studentId: 'student-123' });

    expect(result).toEqual(mockTickets);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ssr.student_id = $'),
      ['student-123']
    );
  });

  test('combines multiple filters', async () => {
    const mockTickets = [];
    mockPool.query.mockResolvedValueOnce({ rows: mockTickets });

    await supportTicketService.getAllSupportTickets({
      status: 'open',
      priority: 'high',
      studentId: 'student-123'
    });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('AND'),
      ['open', 'high', 'student-123']
    );
  });

  test('orders by priority and creation date', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await supportTicketService.getAllSupportTickets();

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('CASE ssr.priority');
    expect(query).toContain('ssr.created_at DESC');
  });
});

describe('supportTicketService.updateSupportTicketStatus', () => {
  test('updates ticket status to in_progress', async () => {
    const updatedTicket = {
      id: 'ticket-1',
      status: 'in_progress',
      updated_at: '2026-04-04T10:00:00Z'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [updatedTicket] });

    const result = await supportTicketService.updateSupportTicketStatus('ticket-1', 'in_progress');

    expect(result).toEqual(updatedTicket);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE student_support_requests'),
      ['in_progress', 'ticket-1', 'in_progress']
    );
  });

  test('sets resolved_at when status is resolved', async () => {
    const updatedTicket = {
      id: 'ticket-1',
      status: 'resolved',
      resolved_at: '2026-04-04T10:00:00Z'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [updatedTicket] });

    await supportTicketService.updateSupportTicketStatus('ticket-1', 'resolved');

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('resolved_at');
  });

  test('sets resolved_at when status is closed', async () => {
    const updatedTicket = {
      id: 'ticket-1',
      status: 'closed',
      resolved_at: '2026-04-04T10:00:00Z'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [updatedTicket] });

    await supportTicketService.updateSupportTicketStatus('ticket-1', 'closed');

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('resolved_at');
  });

  test('throws error for invalid status', async () => {
    await expect(
      supportTicketService.updateSupportTicketStatus('ticket-1', 'invalid_status')
    ).rejects.toThrow('Invalid status');
  });

  test('throws error when ticket not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      supportTicketService.updateSupportTicketStatus('ticket-1', 'open')
    ).rejects.toThrow('Support ticket not found');
  });

  test('validates against allowed statuses', async () => {
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];

    for (const status of validStatuses) {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ticket-1', status }]
      });

      await expect(
        supportTicketService.updateSupportTicketStatus('ticket-1', status)
      ).resolves.toBeDefined();
    }
  });
});

describe('supportTicketService.addTicketNote', () => {
  test('adds a note to ticket metadata', async () => {
    const updatedTicket = {
      id: 'ticket-1',
      metadata: {
        notes: [
          {
            timestamp: '2026-04-04T10:00:00Z',
            admin_id: 'admin-1',
            note: 'Customer contacted again'
          }
        ]
      },
      updated_at: '2026-04-04T10:00:00Z'
    };

    mockPool.query.mockResolvedValueOnce({ rows: [updatedTicket] });

    const result = await supportTicketService.addTicketNote(
      'ticket-1',
      'Customer contacted again',
      'admin-1'
    );

    expect(result).toEqual(updatedTicket);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('jsonb_set'),
      ['ticket-1', 'admin-1', 'Customer contacted again']
    );
  });

  test('throws error when ticket not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      supportTicketService.addTicketNote('ticket-1', 'Some note', 'admin-1')
    ).rejects.toThrow('Support ticket not found');
  });

  test('appends note to existing notes array', async () => {
    const updatedTicket = {
      id: 'ticket-1',
      metadata: {
        notes: [
          { note: 'First note' },
          { note: 'Second note' }
        ]
      }
    };

    mockPool.query.mockResolvedValueOnce({ rows: [updatedTicket] });

    const result = await supportTicketService.addTicketNote(
      'ticket-1',
      'Second note',
      'admin-1'
    );

    expect(result.metadata.notes.length).toBe(2);
  });

  test('initializes metadata if null', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'ticket-1', metadata: null }]
    });

    await supportTicketService.addTicketNote(
      'ticket-1',
      'Test note',
      'admin-1'
    );

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('COALESCE(metadata, ');
  });
});

describe('supportTicketService.getTicketStatistics', () => {
  test('returns statistics grouped by status and priority', async () => {
    const mockStats = [
      { status: 'open', priority: 'high', count: 5 },
      { status: 'open', priority: 'normal', count: 3 },
      { status: 'resolved', priority: 'high', count: 2 }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockStats });

    const result = await supportTicketService.getTicketStatistics();

    expect(result.byStatus.open).toBe(8);
    expect(result.byStatus.resolved).toBe(2);
    expect(result.byPriority.high).toBe(7);
    expect(result.byPriority.normal).toBe(3);
    expect(result.total).toBe(10);
  });

  test('handles empty statistics', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await supportTicketService.getTicketStatistics();

    expect(result.total).toBe(0);
    expect(result.byStatus).toEqual({});
    expect(result.byPriority).toEqual({});
  });

  test('accumulates counts for same status/priority combination', async () => {
    const mockStats = [
      { status: 'open', priority: 'high', count: 5 },
      { status: 'open', priority: 'high', count: 3 }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockStats });

    const result = await supportTicketService.getTicketStatistics();

    expect(result.byStatus.open).toBe(8);
    expect(result.byPriority.high).toBe(8);
  });

  test('groups all statuses separately', async () => {
    const mockStats = [
      { status: 'open', priority: 'normal', count: 2 },
      { status: 'in_progress', priority: 'normal', count: 1 },
      { status: 'resolved', priority: 'normal', count: 4 },
      { status: 'closed', priority: 'normal', count: 1 }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockStats });

    const result = await supportTicketService.getTicketStatistics();

    expect(result.byStatus.open).toBe(2);
    expect(result.byStatus.in_progress).toBe(1);
    expect(result.byStatus.resolved).toBe(4);
    expect(result.byStatus.closed).toBe(1);
    expect(result.total).toBe(8);
  });

  test('returns counts as integers', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ status: 'open', priority: 'high', count: 5 }]
    });

    const result = await supportTicketService.getTicketStatistics();

    expect(typeof result.total).toBe('number');
    expect(Number.isInteger(result.byStatus.open)).toBe(true);
  });
});
