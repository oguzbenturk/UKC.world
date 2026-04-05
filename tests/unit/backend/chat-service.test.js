import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

let ChatService;
let mockPool;
let mockLogger;

beforeAll(async () => {
  mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() })
  };

  mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: mockPool
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: mockLogger
  }));

  await jest.unstable_mockModule('../../../backend/shared/utils/roleUtils.js', () => ({
    ROLES: { ADMIN: 'admin', MANAGER: 'manager', STUDENT: 'student' }
  }));

  const mod = await import('../../../backend/services/chatService.js');
  ChatService = mod.default;
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.connect.mockReset();
  mockLogger.info.mockReset();
  mockLogger.error.mockReset();
});

describe('ChatService.getOrCreateDirectConversation', () => {
  test('returns existing direct conversation', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    const existingConv = {
      id: 'conv-1',
      type: 'direct',
      created_at: '2026-04-01T10:00:00Z'
    };

    client.query
      .mockResolvedValueOnce({ rows: [existingConv] }) // check existing
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await ChatService.getOrCreateDirectConversation('user-1', 'user-2');

    expect(result.id).toBe('conv-1');
    expect(client.release).toHaveBeenCalled();
  });

  test('creates new direct conversation when none exists', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    const newConv = {
      id: 'conv-new',
      type: 'direct',
      created_at: '2026-04-04T10:00:00Z'
    };

    client.query
      .mockResolvedValueOnce({ rows: [] }) // no existing
      .mockResolvedValueOnce({ rows: [newConv] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // INSERT participants
      .mockResolvedValueOnce({
        rows: [{ name: 'John Doe' }]
      }) // get other user name
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await ChatService.getOrCreateDirectConversation('user-1', 'user-2');

    expect(result.id).toBe('conv-new');
    expect(result.type).toBe('direct');
    expect(client.release).toHaveBeenCalled();
  });

  test('sets conversation name from other participant', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    const newConv = { id: 'conv-1', type: 'direct' };

    client.query
      .mockResolvedValueOnce({ rows: [] }) // no existing
      .mockResolvedValueOnce({ rows: [newConv] }) // INSERT conversation
      .mockResolvedValueOnce({ rows: [] }) // INSERT participants
      .mockResolvedValueOnce({
        rows: [{ name: 'Alice Smith' }]
      }) // get other user name
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await ChatService.getOrCreateDirectConversation('user-1', 'user-2');

    expect(result.name).toBe('Alice Smith');
    expect(client.release).toHaveBeenCalled();
  });

  test('releases connection on error', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      ChatService.getOrCreateDirectConversation('user-1', 'user-2')
    ).rejects.toThrow();

    expect(client.release).toHaveBeenCalled();
  });

  test('sets participant_count to 2', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    const newConv = { id: 'conv-1', type: 'direct' };

    client.query
      .mockResolvedValueOnce({ rows: [] }) // no existing
      .mockResolvedValueOnce({ rows: [newConv] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // INSERT participants
      .mockResolvedValueOnce({
        rows: [{ name: 'User' }]
      }) // get other user name
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await ChatService.getOrCreateDirectConversation('user-1', 'user-2');

    expect(result.participant_count).toBe(2);
    expect(client.release).toHaveBeenCalled();
  });
});

describe('ChatService.createGroupOrChannel', () => {
  test('creates group when creator is admin', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    const newGroup = {
      id: 'group-1',
      type: 'group',
      name: 'Team A'
    };

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [newGroup] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // add creator
      .mockResolvedValueOnce({ rows: [] }) // add participants
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({
        rows: [{ total: 3 }]
      }); // count participants

    const result = await ChatService.createGroupOrChannel(
      'admin-1',
      'admin',
      'group',
      'Team A',
      ['user-1', 'user-2']
    );

    expect(result.type).toBe('group');
    expect(result.name).toBe('Team A');
    expect(client.release).toHaveBeenCalled();
  });

  test('creates channel when creator is manager', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    const newChannel = {
      id: 'chan-1',
      type: 'channel',
      name: 'announcements',
      created_by: 'manager-1'
    };

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [newChannel] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // add creator
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }]
      }) // get all users
      .mockResolvedValueOnce({ rows: [] }) // add users to channel
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({
        rows: [{ total: '3' }]  // manager + 2 users
      }); // count participants

    const result = await ChatService.createGroupOrChannel(
      'manager-1',
      'manager',
      'channel',
      'announcements'
    );

    expect(result.type).toBe('channel');
    expect(client.release).toHaveBeenCalled();
  });

  test('rejects non-admin/manager creation', async () => {
    await expect(
      ChatService.createGroupOrChannel('student-1', 'student', 'group', 'Team')
    ).rejects.toThrow('Only admins and managers');
  });

  test('rejects invalid type', async () => {
    await expect(
      ChatService.createGroupOrChannel('admin-1', 'admin', 'invalid', 'Team')
    ).rejects.toThrow('Type must be');
  });

  test('rejects empty name', async () => {
    await expect(
      ChatService.createGroupOrChannel('admin-1', 'admin', 'group', '   ')
    ).rejects.toThrow('Name is required');
  });

  test('auto-adds all users to channel', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'chan-1', type: 'channel' }]
      }) // CREATE conversation
      .mockResolvedValueOnce({ rows: [] }) // add creator
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }]
      }) // GET all users
      .mockResolvedValueOnce({ rows: [] }) // INSERT participants
      .mockResolvedValueOnce({ rows: [] }) // INSERT welcome message (if provided)
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({
        rows: [{ total: 4 }]  // 1 creator + 3 users
      }); // count participants

    await ChatService.createGroupOrChannel(
      'admin-1',
      'admin',
      'channel',
      'general'
    );

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO conversation_participants'),
      expect.any(Array)
    );
  });

  test('adds welcome message if provided', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'group-1', type: 'group' }]
      }) // INSERT conversation
      .mockResolvedValueOnce({ rows: [] }) // add creator
      .mockResolvedValueOnce({ rows: [] }) // add participants
      .mockResolvedValueOnce({ rows: [] }) // INSERT welcome message
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({
        rows: [{ total: 2 }]
      }); // count participants

    await ChatService.createGroupOrChannel(
      'admin-1',
      'admin',
      'group',
      'Team',
      ['user-1'],
      'Welcome to the team!'
    );

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO messages'),
      expect.arrayContaining(['Welcome to the team!'])
    );
    expect(client.release).toHaveBeenCalled();
  });

  test('releases client on error', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      ChatService.createGroupOrChannel('admin-1', 'admin', 'group', 'Team')
    ).rejects.toThrow();

    expect(client.release).toHaveBeenCalled();
  });
});

describe('ChatService.deleteConversation', () => {
  test('deletes group conversation for creator', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'group-1', type: 'group', created_by: 'user-1' }]
      })
      .mockResolvedValueOnce({ rows: [] }) // DELETE messages
      .mockResolvedValueOnce({ rows: [] }) // DELETE participants
      .mockResolvedValueOnce({ rows: [] }) // DELETE conversation
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await ChatService.deleteConversation('group-1', 'user-1', 'student');

    expect(client.release).toHaveBeenCalled();
  });

  test('prevents deletion of direct conversations', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'conv-1', type: 'direct', created_by: 'user-1' }]
      });

    await expect(
      ChatService.deleteConversation('conv-1', 'user-1', 'student')
    ).rejects.toThrow('Direct conversations cannot be deleted');
  });

  test('allows admin to delete any conversation', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'group-1', type: 'group', created_by: 'other-user' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await ChatService.deleteConversation('group-1', 'admin-1', 'admin');

    expect(client.release).toHaveBeenCalled();
  });

  test('denies deletion for unauthorized user', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'group-1', type: 'group', created_by: 'other-user' }]
      });

    await expect(
      ChatService.deleteConversation('group-1', 'user-1', 'student')
    ).rejects.toThrow('Only admins, managers, or the conversation creator');
  });
});

describe('ChatService.getUserConversations', () => {
  test('returns user conversations with unread count', async () => {
    const mockConversations = [
      {
        id: 'conv-1',
        type: 'direct',
        name: 'Alice',
        unread_count: 3,
        participants: [{ user_id: 'user-1', name: 'Me' }],
        last_message: null,
        participant_count: 2
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockConversations });

    const result = await ChatService.getUserConversations('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].unread_count).toBe(3);
  });

  test('derives name for direct conversations from participant', async () => {
    const mockConversations = [
      {
        id: 'conv-1',
        type: 'direct',
        name: null,
        participants: [
          { user_id: 'user-1', name: 'Me' },
          { user_id: 'user-2', name: 'Alice' }
        ],
        unread_count: 0,
        last_message: null
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockConversations });

    const result = await ChatService.getUserConversations('user-1');

    expect(result[0].name).toBe('Alice');
  });

  test('supports pagination with limit and offset', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await ChatService.getUserConversations('user-1', 20, 40);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT'),
      ['user-1', 20, 40]
    );
  });

  test('counts participants correctly', async () => {
    const mockConversations = [
      {
        id: 'conv-1',
        type: 'group',
        name: 'Team',
        participants: [
          { user_id: 'user-1' },
          { user_id: 'user-2' },
          { user_id: 'user-3' }
        ],
        unread_count: 0,
        last_message: null
      }
    ];

    mockPool.query.mockResolvedValueOnce({ rows: mockConversations });

    const result = await ChatService.getUserConversations('user-1');

    expect(result[0].participant_count).toBe(3);
  });
});

describe('ChatService.sendMessage', () => {
  test('sends text message to conversation', async () => {
    const mockMessage = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      message_type: 'text',
      content: 'Hello'
    };

    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'participant-1' }]
      }) // check sender is participant
      .mockResolvedValueOnce({
        rows: [mockMessage]
      }) // INSERT message
      .mockResolvedValueOnce({
        rows: [{ name: 'John', role: 'student' }]
      }); // get sender info

    const result = await ChatService.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      messageType: 'text',
      content: 'Hello'
    });

    expect(result.id).toBe('msg-1');
    expect(result.content).toBe('Hello');
  });

  test('prevents non-participants from sending messages', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [] // user not a participant
    });

    await expect(
      ChatService.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        messageType: 'text',
        content: 'Hello'
      })
    ).rejects.toThrow('User is not a participant');
  });

  test('supports message with attachments', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'participant-1' }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'msg-1',
          attachment_url: 'https://example.com/file.pdf',
          attachment_filename: 'file.pdf',
          attachment_size: 1024
        }]
      })
      .mockResolvedValueOnce({
        rows: [{ name: 'John', role: 'student' }]
      });

    const result = await ChatService.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      messageType: 'attachment',
      attachmentUrl: 'https://example.com/file.pdf',
      attachmentFilename: 'file.pdf',
      attachmentSize: 1024
    });

    expect(result.attachment_url).toBe('https://example.com/file.pdf');
  });
});

describe('ChatService.markAsRead', () => {
  test('updates last_read_at timestamp', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await ChatService.markAsRead('conv-1', 'user-1');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE conversation_participants'),
      ['conv-1', 'user-1']
    );
  });

  test('sets last_read_at to NOW', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await ChatService.markAsRead('conv-1', 'user-1');

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('NOW()');
  });
});

describe('ChatService.getMessages', () => {
  test('returns messages in chronological order', async () => {
    const mockMessages = [
      {
        id: 'msg-1',
        content: 'First message',
        created_at: new Date('2026-04-01T10:00:00Z')
      },
      {
        id: 'msg-2',
        content: 'Second message',
        created_at: new Date('2026-04-01T10:05:00Z')
      }
    ];

    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'participant-1' }]
      }) // check participant
      .mockResolvedValueOnce({
        rows: mockMessages.reverse() // DB returns DESC, service reverses
      });

    const result = await ChatService.getMessages('conv-1', 'user-1');

    expect(result[0].created_at.getTime()).toBeLessThanOrEqual(result[1].created_at.getTime());
  });

  test('prevents non-participants from viewing messages', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [] // not a participant
    });

    await expect(
      ChatService.getMessages('conv-1', 'user-1')
    ).rejects.toThrow('User is not a participant');
  });

  test('supports pagination with beforeMessageId', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'participant-1' }]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    await ChatService.getMessages('conv-1', 'user-1', 50, 'msg-100');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('created_at <'),
      expect.arrayContaining(['msg-100'])
    );
  });
});

describe('ChatService.leaveConversation', () => {
  test('soft-deletes user from conversation', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await ChatService.leaveConversation('conv-1', 'user-1');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('left_at'),
      ['conv-1', 'user-1']
    );
  });

  test('sets left_at to NOW', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await ChatService.leaveConversation('conv-1', 'user-1');

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('NOW()');
  });
});

describe('ChatService.syncAllUsersToChannels', () => {
  test('adds all users to all channels', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'chan-1' }, { id: 'chan-2' }]
      }) // get channels
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }]
      }) // get users
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await ChatService.syncAllUsersToChannels();

    expect(result.channelsProcessed).toBe(2);
    expect(result.usersAdded).toBeGreaterThan(0);
  });

  test('returns zero when no channels exist', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // no channels
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await ChatService.syncAllUsersToChannels();

    expect(result.usersAdded).toBe(0);
    expect(result.channelsProcessed).toBe(0);
  });
});
