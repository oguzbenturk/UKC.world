// Unit tests for authorization middleware
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeRoles } from '../authorize.js';

describe('Authorization Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: null,
      headers: {}
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    next = vi.fn();
  });

  describe('authorizeRoles', () => {
    it('should allow super_admin to access admin routes', () => {
      req.user = { id: 'user-1', role: 'super_admin' };
      const middleware = authorizeRoles(['admin']);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow admin to access admin routes', () => {
      req.user = { id: 'user-1', role: 'admin' };
      const middleware = authorizeRoles(['admin']);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should block student from admin routes', () => {
      req.user = { id: 'user-1', role: 'student' };
      const middleware = authorizeRoles(['admin']);

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('should allow owner to access elevated routes', () => {
      req.user = { id: 'user-1', role: 'owner' };
      const middleware = authorizeRoles(['admin', 'manager']);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow multiple authorized roles', () => {
      req.user = { id: 'user-1', role: 'instructor' };
      const middleware = authorizeRoles(['instructor', 'manager']);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should handle missing user', () => {
      req.user = null;
      const middleware = authorizeRoles(['admin']);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
