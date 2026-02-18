import { loadStripe } from '@stripe/stripe-js';
import { logger } from '@/shared/utils/logger';

class PaymentService {
  constructor() {
    this.stripePromise = null;
    this.initialized = false;
  }

  /**
   * Initialize Stripe
   */
  async init() {
    if (this.initialized) return;

    try {
      const publishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        logger.warn('Stripe publishable key not found in environment variables');
        return false;
      }

      this.stripePromise = loadStripe(publishableKey);
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize Stripe', { error });
      return false;
    }
  }

  /**
   * Create payment intent for a booking
   * @param {Object} booking - Booking details
   * @param {Object} options - Payment options
   */
  async createPaymentIntent(booking, options = {}) {
    try {
      const globalCurrency = (typeof window !== 'undefined' && window.__APP_CURRENCY__ && (window.__APP_CURRENCY__.business || window.__APP_CURRENCY__.user));
      const selectedCurrency = (booking.currency || options.currency || globalCurrency || 'eur').toLowerCase();
      const response = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          booking_id: booking.id,
          amount: Math.round(booking.total_price * 100), // Convert to cents
          currency: selectedCurrency,
          customer_email: booking.student_email,
          metadata: {
            booking_id: booking.id,
            student_id: booking.student_id,
            instructor_id: booking.instructor_id,
            service_type: booking.service_type,
            currency: selectedCurrency
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      return await response.json();
    } catch (error) {
      logger.error('Error creating payment intent', { error });
      throw error;
    }
  }

  /**
   * Process payment using Stripe Elements
   * @param {Object} elements - Stripe Elements instance
   * @param {string} clientSecret - Payment intent client secret
   * @param {Object} billingDetails - Customer billing details
   */
  async processPayment(elements, clientSecret, billingDetails) {
    try {
      const stripe = await this.stripePromise;
      if (!stripe) {
        throw new Error('Stripe not initialized');
      }

      const cardElement = elements.getElement('card');
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: billingDetails
        }
      });

      if (error) {
        throw error;
      }

      return {
        success: true,
        paymentIntent,
        status: paymentIntent.status
      };
    } catch (error) {
      logger.error('Payment processing error', { error });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create setup intent for saving payment method
   * @param {string} customerId - Stripe customer ID
   */
  async createSetupIntent(customerId) {
    try {
      const response = await fetch('/api/payments/create-setup-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          customer_id: customerId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create setup intent');
      }

      return await response.json();
    } catch (error) {
      logger.error('Error creating setup intent', { error });
      throw error;
    }
  }

  /**
   * Get customer's saved payment methods
   * @param {string} customerId - Stripe customer ID
   */
  async getPaymentMethods(customerId) {
    try {
      const response = await fetch(`/api/payments/payment-methods/${customerId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch payment methods');
      }

      return await response.json();
    } catch (error) {
      logger.error('Error fetching payment methods', { error });
      return { payment_methods: [] };
    }
  }

  /**
   * Process refund for a booking
   * @param {string} paymentIntentId - Stripe payment intent ID
   * @param {number} amount - Refund amount in cents
   * @param {string} reason - Refund reason
   */
  async processRefund(paymentIntentId, amount, reason = 'requested_by_customer') {
    try {
      const response = await fetch('/api/payments/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          amount,
          reason
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process refund');
      }

      return await response.json();
    } catch (error) {
      logger.error('Error processing refund', { error });
      throw error;
    }
  }

  /**
   * Get payment history for a customer
   * @param {string} customerId - Customer ID
   * @param {Object} options - Query options
   */
  async getPaymentHistory(customerId, options = {}) {
    try {
      const params = new URLSearchParams({
        customer_id: customerId,
        limit: options.limit || 10,
        ...options
      });

      const response = await fetch(`/api/payments/history?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch payment history');
      }

      return await response.json();
    } catch (error) {
      logger.error('Error fetching payment history', { error });
      return { payments: [], total: 0 };
    }
  }

  /**
   * Calculate booking price with taxes and fees
   * @param {Object} booking - Booking details
   * @param {Object} options - Pricing options
   */
  calculateTotalPrice(booking, options = {}) {
    const basePrice = parseFloat(booking.base_price || 0);
    const equipmentFee = parseFloat(booking.equipment_fee || 0);
    const taxRate = options.taxRate || 0.24; // 24% VAT for Turkey
    const processingFeeRate = options.processingFeeRate || 0.029; // 2.9% for Stripe

    const subtotal = basePrice + equipmentFee;
    const tax = subtotal * taxRate;
    const processingFee = (subtotal + tax) * processingFeeRate;
    const total = subtotal + tax + processingFee;

    return {
      basePrice,
      equipmentFee,
      subtotal,
      tax,
      processingFee,
      total: Math.round(total * 100) / 100, // Round to 2 decimal places
      breakdown: {
        'Base Price': basePrice,
        'Equipment Fee': equipmentFee,
        'Tax (24%)': tax,
        'Processing Fee': processingFee
      }
    };
  }

  /**
   * Format currency for display with multi-currency support
   * @param {number} amount - Amount in smallest currency unit
   * @param {string} currency - Currency code
   */
  formatCurrency(amount, currency = null) {
    const code = (currency
      || (typeof window !== 'undefined' && window.__APP_CURRENCY__ && (window.__APP_CURRENCY__.business || window.__APP_CURRENCY__.user))
      || 'EUR');
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format((amount || 0) / 100);
    } catch {
      const val = ((amount || 0) / 100).toFixed(2);
      return `${code}${val}`;
    }
  }

  /**
   * Validate payment amount
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code
   */
  validateAmount(amount, currency = null) {
    const code = (currency
      || (typeof window !== 'undefined' && window.__APP_CURRENCY__ && (window.__APP_CURRENCY__.business || window.__APP_CURRENCY__.user))
      || 'EUR');
    const minAmounts = {
      EUR: 50, // 50 cents minimum
      USD: 50,
      TRY: 300 // 3 TL minimum
    };

    const maxAmounts = {
      EUR: 500000, // 5000 EUR maximum
      USD: 500000,
      TRY: 5000000 // 50000 TL maximum
    };

  const upper = String(code).toUpperCase();
  const min = minAmounts[upper] || 50;
  const max = maxAmounts[upper] || 500000;

    if (amount < min) {
      return {
        valid: false,
  error: `Minimum amount is ${this.formatCurrency(min, code)}`
      };
    }

    if (amount > max) {
      return {
        valid: false,
  error: `Maximum amount is ${this.formatCurrency(max, code)}`
      };
    }

    return { valid: true };
  }

  /**
   * Handle webhook events from Stripe
   * @param {Object} event - Stripe webhook event
   */
  async handleWebhookEvent(event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object);
          break;
        case 'charge.dispute.created':
          await this.handleDispute(event.data.object);
          break;
        default:
          logger.info('Unhandled Stripe event type', { type: event.type });
      }
    } catch (error) {
      logger.error('Webhook handling error', { error });
      throw error;
    }
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSuccess(paymentIntent) {
    try {
      // Update booking status
      await fetch('/api/bookings/payment-success', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntent.id,
          booking_id: paymentIntent.metadata.booking_id
        })
      });

      // Send confirmation email/notification
      // This would be handled by your notification service
    } catch (error) {
      logger.error('Error handling payment success', { error });
    }
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailure(paymentIntent) {
    try {
      // Update booking status
      await fetch('/api/bookings/payment-failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntent.id,
          booking_id: paymentIntent.metadata.booking_id,
          error: paymentIntent.last_payment_error
        })
      });
    } catch (error) {
      logger.error('Error handling payment failure', { error });
    }
  }

  /**
   * Handle payment dispute
   */
  async handleDispute(charge) {
    try {
      // Notify admin about dispute
      // This would integrate with your notification system
      logger.warn('Payment dispute created', { chargeId: charge.id });
    } catch (error) {
      logger.error('Error handling dispute', { error });
    }
  }

  /**
   * Get supported payment methods by country
   * @param {string} country - Country code
   */
  getSupportedPaymentMethods(country = 'TR') {
    const methods = {
      TR: ['card', 'ideal', 'sofort'],
      DE: ['card', 'ideal', 'sofort', 'giropay'],
      FR: ['card', 'ideal', 'sofort'],
      GB: ['card', 'ideal'],
      US: ['card'],
      default: ['card']
    };

    return methods[country] || methods.default;
  }
}

export const paymentService = new PaymentService();
export default paymentService;
