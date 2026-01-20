import { useState, useEffect } from 'react';
import { useFeatures } from '@/shared/contexts/FeaturesContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { 
  CreditCardIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const PaymentForm = ({ booking, amount, onSuccess, onError }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { createPaymentIntent, payments } = useFeatures();
  const [processing, setProcessing] = useState(false);
  const { formatCurrency, businessCurrency } = useCurrency();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);

    try {
      // Create payment intent
      const currencyCode = (booking?.currency || businessCurrency || 'EUR').toLowerCase();
      const paymentIntent = await createPaymentIntent(
        amount * 100, // Convert to cents
        currencyCode,
        booking?.id,
        `Payment for ${booking?.lesson_type || 'Kitesurfing Service'}`
      );

      // Confirm payment
      const result = await stripe.confirmCardPayment(paymentIntent.clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement),
        }
      });

      if (result.error) {
        onError(result.error.message);
      } else {
        onSuccess(result.paymentIntent);
      }
    } catch (error) {
      onError(error.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-slate-50 p-4 rounded-lg">
        <h3 className="font-semibold text-slate-900 mb-2">Payment Details</h3>
        <div className="space-y-2 text-sm text-slate-600">
          {booking && (
            <>
              <p><strong>Service:</strong> {booking.lesson_type}</p>
              <p><strong>Date:</strong> {new Date(booking.lesson_date).toLocaleDateString()}</p>
              <p><strong>Instructor:</strong> {booking.instructor_name}</p>
            </>
          )}
          <p><strong>Amount:</strong> {formatCurrency(amount, booking?.currency || businessCurrency || 'EUR')}</p>
        </div>
      </div>

      <div className="bg-white p-4 border border-slate-200 rounded-lg">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Card Information
        </label>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
      </div>

      <button
        type="submit"
        disabled={!stripe || processing || payments.processing}
        className="w-full bg-sky-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {processing || payments.processing ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Processing...
          </>
        ) : (
          <>
            <CreditCardIcon className="h-5 w-5 mr-2" />
            Pay {formatCurrency(amount, booking?.currency || businessCurrency || 'EUR')}
          </>
        )}
      </button>
    </form>
  );
};

const PaymentHistory = () => {
  const { payments, loadPaymentHistory } = useFeatures();
  const { formatCurrency, businessCurrency } = useCurrency();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadPaymentHistory();
  }, [loadPaymentHistory]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <ExclamationTriangleIcon className="h-5 w-5 text-slate-500" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'succeeded':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'processing':
        return 'Processing';
      case 'requires_payment_method':
        return 'Requires Payment Method';
      default:
        return status;
    }
  };

  const filteredPayments = payments.history.filter(payment => {
    if (filter === 'all') return true;
    return payment.status === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900">Payment History</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm"
        >
          <option value="all">All Payments</option>
          <option value="succeeded">Completed</option>
          <option value="failed">Failed</option>
          <option value="processing">Processing</option>
        </select>
      </div>

      <div className="space-y-4">
        {filteredPayments.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <CreditCardIcon className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p>No payments found</p>
          </div>
        ) : (
          filteredPayments.map((payment) => (
            <div key={payment.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {getStatusIcon(payment.status)}
                  <div className="ml-3">
                    <p className="text-sm font-medium text-slate-900">
                      {formatCurrency(payment.amount / 100, payment.currency?.toUpperCase() || businessCurrency || 'EUR')}
                    </p>
                    <p className="text-xs text-slate-500">{payment.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">
                    {getStatusText(payment.status)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {payment.lesson_date && (
                <div className="mt-2 text-xs text-slate-500">
                  Service Date: {new Date(payment.lesson_date).toLocaleDateString()}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const PaymentsPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('history');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  // Mock booking for demonstration - in real app, this would come from props or URL params
  const mockBooking = {
    id: 1,
    lesson_type: 'Business Service Package',
    lesson_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    instructor_name: 'John Doe'
  };

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
    setPaymentError(null);
    setActiveTab('history');
    // Refresh payment history
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  const handlePaymentError = (error) => {
    setPaymentError(error);
    setPaymentSuccess(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Payments</h1>
        <p className="text-slate-600 mt-2">
          Manage your payments and view transaction history
        </p>
      </div>

      {paymentSuccess && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
            <p className="text-green-800">Payment processed successfully!</p>
          </div>
        </div>
      )}

      {paymentError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <XCircleIcon className="h-5 w-5 text-red-500 mr-2" />
            <p className="text-red-800">{paymentError}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="border-b border-slate-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Payment History
            </button>
            {user?.role === 'student' && (
              <button
                onClick={() => setActiveTab('new')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'new'
                    ? 'border-sky-500 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Make Payment
              </button>
            )}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'history' && <PaymentHistory />}
          {activeTab === 'new' && (
            <Elements stripe={stripePromise}>
              <div className="max-w-md">
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Make a Payment</h2>
                <PaymentForm
                  booking={mockBooking}
                  amount={150}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </div>
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentsPage;
