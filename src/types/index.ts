// ─── User & Auth ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'instructor' | 'student' | 'outsider' | 'trusted_customer' | 'developer' | string;

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  profilePhoto?: string;
  twoFactorEnabled?: boolean;
  permissions?: Record<string, boolean>;
}

export interface AuthResponse {
  token: string;
  user: User;
  requires2FA?: boolean;
  consentRequired?: boolean;
}

export interface ConsentStatus {
  requiresTermsAcceptance: boolean;
  latestTermsVersion: string;
  communicationPreferences: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  };
}

// ─── Bookings ────────────────────────────────────────────────────────────────

export type BookingStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled' | 'no_show';

export interface Booking {
  id: number;
  serviceId: number;
  serviceName: string;
  serviceType: string;
  instructorId?: number;
  instructorName?: string;
  date: string;
  startTime: string;
  endTime?: string;
  status: BookingStatus;
  paymentMethod?: string;
  paymentStatus?: string;
  totalAmount?: number;
  currency: string;
  notes?: string;
  createdAt: string;
}

// ─── Services ────────────────────────────────────────────────────────────────

export interface Service {
  id: number;
  name: string;
  type: string;
  category: string;
  description?: string;
  duration: number;
  price: number;
  currency: string;
  maxParticipants?: number;
}

// ─── Rentals ─────────────────────────────────────────────────────────────────

export type RentalStatus = 'pending' | 'upcoming' | 'active' | 'completed' | 'cancelled';

export interface Rental {
  id: number;
  equipmentId: number;
  equipmentName: string;
  category: string;
  startTime: string;
  endTime?: string;
  status: RentalStatus;
  totalAmount?: number;
  currency: string;
}

// ─── Wallet ──────────────────────────────────────────────────────────────────

export type Currency = 'EUR' | 'TRY' | 'USD' | 'GBP';

export interface WalletBalance {
  currency: Currency;
  balance: string;
}

export type TransactionType = 'credit' | 'debit' | 'deposit' | 'payment' | 'refund' | 'voucher';

export interface WalletTransaction {
  id: number;
  type: TransactionType;
  amount: string;
  currency: Currency;
  description: string;
  reference?: string;
  createdAt: string;
}

// ─── Products / Shop ─────────────────────────────────────────────────────────

export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  originalPrice?: number;
  currency: string;
  category: string;
  images?: string[];
  blurhash?: string;
  stock?: number;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: number;
  size?: string;
  color?: string;
  gender?: string;
  stock: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  variantId?: number;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'booking_confirmed' | 'booking_reminder' | 'booking_cancelled'
  | 'payment_success' | 'chat_message' | 'rental_reminder'
  | 'reschedule_request' | 'group_invite' | 'general';

export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: NotificationType;
  status: 'sent' | 'read';
  data?: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'image' | 'file' | 'voice';

export interface ChatMessage {
  id: number;
  roomId: number;
  senderId: number;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: MessageType;
  fileUrl?: string;
  readAt?: string;
  createdAt: string;
}

export interface ChatConversation {
  id: number;
  participants: User[];
  lastMessage?: ChatMessage;
  unreadCount: number;
  updatedAt: string;
}

// ─── Customer Package ─────────────────────────────────────────────────────────

export interface CustomerPackage {
  id: number;
  name: string;
  hoursTotal: number;
  hoursUsed: number;
  hoursRemaining: number;
  status: 'active' | 'completed' | 'expired' | 'pending_payment';
  currency: string;
  expiresAt?: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
