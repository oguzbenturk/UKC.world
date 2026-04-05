import { io, Socket } from 'socket.io-client';
import { getAuthToken } from './secureStorage';

type EventHandler = (...args: unknown[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();

  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    const token = await getAuthToken();
    if (!token) return;

    const url = process.env.EXPO_PUBLIC_API_URL ?? '';
    const baseUrl = url.replace('/api', '');

    this.socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    // Re-attach any handlers registered before connection
    this.handlers.forEach((fns, event) => {
      fns.forEach((fn) => this.socket?.on(event, fn));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: EventHandler): void {
    if (handler) {
      const fns = this.handlers.get(event) ?? [];
      this.handlers.set(event, fns.filter((f) => f !== handler));
      this.socket?.off(event, handler);
    } else {
      this.handlers.delete(event);
      this.socket?.off(event);
    }
  }

  emit(event: string, ...args: unknown[]): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot emit — not connected');
      return;
    }
    this.socket.emit(event, ...args);
  }

  joinRoom(roomId: string): void {
    this.emit('join_room', roomId);
  }

  leaveRoom(roomId: string): void {
    this.emit('leave_room', roomId);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
