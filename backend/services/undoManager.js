// Simple in-memory undo manager for short-lived undo tokens (10s default)
// WARNING: This is process-local and volatile. Suitable for brief UI undo.

import crypto from 'crypto';

class UndoManager {
  constructor() {
    this.tokens = new Map(); // token -> { data, expiresAt }
    // periodic cleanup
    setInterval(() => this.cleanup(), 30 * 1000).unref?.();
  }

  createToken(data, ttlMs = 10_000) {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + ttlMs;
    this.tokens.set(token, { data, expiresAt });
    return { token, expiresAt };
  }

  get(token) {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    return entry.data;
  }

  redeem(token) {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    this.tokens.delete(token);
    return entry.data;
  }

  cleanup() {
    const now = Date.now();
    for (const [token, entry] of this.tokens.entries()) {
      if (now > entry.expiresAt) this.tokens.delete(token);
    }
  }
}

export const undoManager = new UndoManager();
