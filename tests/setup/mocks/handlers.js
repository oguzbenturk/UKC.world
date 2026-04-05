// MSW API mock handlers
import { http, HttpResponse } from 'msw';

const API_URL = 'http://localhost:4000/api';

export const handlers = [
  // Auth endpoints
  http.post(`${API_URL}/auth/login`, () => {
    return HttpResponse.json({
      token: 'mock-jwt-token',
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'admin'
      }
    });
  }),

  http.get(`${API_URL}/auth/me`, () => {
    return HttpResponse.json({
      id: 'test-user-id',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'admin'
    });
  }),

  // Wallet endpoints
  http.get(`${API_URL}/wallet/summary`, () => {
    return HttpResponse.json({
      available: 1000,
      pending: 50,
      nonWithdrawable: 200
    });
  }),

  http.get(`${API_URL}/wallet/transactions`, () => {
    return HttpResponse.json({
      transactions: [],
      pagination: { total: 0, page: 1, limit: 10 }
    });
  }),

  // Bookings endpoints
  http.get(`${API_URL}/bookings`, () => {
    return HttpResponse.json([
      {
        id: 'booking-1',
        date: '2026-02-15',
        time: '10:00',
        duration: 2,
        status: 'confirmed',
        service_name: 'Wing Foil Lesson',
        student_name: 'Test Student'
      }
    ]);
  }),

  // Notifications endpoints
  http.get(`${API_URL}/notifications/user`, () => {
    return HttpResponse.json({
      notifications: [
        {
          id: 'notif-1',
          title: 'Test Notification',
          message: 'This is a test',
          read: false,
          created_at: '2026-02-01T10:00:00Z'
        }
      ],
      unreadCount: 1
    });
  }),
];
