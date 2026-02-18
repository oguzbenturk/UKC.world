/**
 * OutsiderBookingPage
 * 
 * Booking page for outsiders (newly registered users).
 * Uses the same StudentBookingWizard component for a consistent UX.
 * After successful booking, the user will be automatically upgraded to student role.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App, Button, Card, Typography, Alert, Spin, Tag, Empty, Modal, Radio, Input, Form, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { CalendarOutlined, CheckCircleOutlined, RocketOutlined, ShoppingOutlined, WalletOutlined, CreditCardOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';
import { usePageSEO } from '@/shared/utils/seo';
import PromoCodeInput from '@/shared/components/PromoCodeInput';

const { Title, Paragraph, Text } = Typography;

// Payment processor options (same as booking wizard)
const PROCESSOR_OPTIONS = [
  { value: 'stripe', label: 'Stripe (Credit Card)' },
  { value: 'paytr', label: 'PayTR' },
  { value: 'binance_pay', label: 'Binance Pay' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'paypal', label: 'PayPal' }
];

// Stable empty object reference to prevent re-renders
const EMPTY_BOOKING_DATA = {};

// Helper to get package price in specific currency from prices array
// Now accepts convertCurrency function for runtime conversion
const getPackagePriceInCurrency = (pkg, targetCurrency, convertCurrencyFn) => {
  if (!pkg) return { price: 0, currency: 'EUR' };
  
  // Try to find price in target currency from the prices array
  if (targetCurrency && pkg.prices && Array.isArray(pkg.prices)) {
    const currencyPrice = pkg.prices.find(
      p => p.currencyCode === targetCurrency || p.currency_code === targetCurrency
    );
    if (currencyPrice && currencyPrice.price > 0) {
      return { price: currencyPrice.price, currency: targetCurrency };
    }
  }
  
  // If no exact match found, convert from base price using live exchange rates
  const baseCurrency = pkg.currency || 'EUR';
  const basePrice = pkg.price || 0;
  
  if (convertCurrencyFn && targetCurrency && targetCurrency !== baseCurrency) {
    const convertedPrice = convertCurrencyFn(basePrice, baseCurrency, targetCurrency);
    return { price: convertedPrice, currency: targetCurrency };
  }
  
  // Fallback to default package price/currency
  return { price: basePrice, currency: baseCurrency };
};

const OutsiderBookingPage = () => {
  const { user, refreshToken, isAuthenticated, isGuest } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();
  const location = useLocation();
  const { userCurrency, formatCurrency, convertCurrency, businessCurrency } = useCurrency();
  const { notification, message } = App.useApp();
  const queryClient = useQueryClient();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});
  const [showPackages, setShowPackages] = useState(false);
  const [selectedPackageCategory, setSelectedPackageCategory] = useState(null);
  const [purchasingPackageId, setPurchasingPackageId] = useState(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [selectedPackageForPurchase, setSelectedPackageForPurchase] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('wallet');
  const [selectedProcessor, setSelectedProcessor] = useState(null);
  const [processorForm] = Form.useForm();
  const [accommodationDates, setAccommodationDates] = useState({ checkIn: null, checkOut: null });
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  
  // Storage currency is always EUR (base currency)
  const storageCurrency = businessCurrency || 'EUR';
  // Query wallet in storage currency (EUR) 
  const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({ currency: storageCurrency });

  // Handle payment success from Iyzico callback redirect
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const paymentStatus = searchParams.get('payment');
    const amount = searchParams.get('amount');
    const currency = searchParams.get('currency');

    if (paymentStatus === 'success' && amount) {
      notification.success({
        message: '💰 Wallet Deposit Successful!',
        description: `${amount} ${currency} has been added to your wallet. You can now book lessons and packages.`,
        duration: 6,
      });
      
      // Refresh wallet balance
      refetchWallet();
      
      // Clean up URL
      navigate(location.pathname, { replace: true });
    } else if (paymentStatus === 'failed') {
      const reason = searchParams.get('reason') || 'Payment processing failed';
      notification.error({
        message: 'Payment Failed',
        description: decodeURIComponent(reason),
        duration: 5,
      });
      
      // Clean up URL
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate, notification, refetchWallet]);

  // Package categories
  const PACKAGE_CATEGORIES = [
    { key: 'lesson', label: 'Lessons', icon: '🎓', description: 'Kitesurfing & water sports lesson packages' },
    { key: 'rental', label: 'Rental Equipment', icon: '🏄', description: 'Rent boards, kites, wetsuits & gear' },
    { key: 'accommodation', label: 'Accommodation', icon: '🏨', description: 'Stay at our beachfront facilities' },
    { key: 'lesson_rental', label: 'Lessons + Rental', icon: '🎯', description: 'Learn with equipment included' },
    { key: 'accommodation_rental', label: 'Accommodation + Rental', icon: '🏖️', description: 'Combined stay and equipment rental' },
    { key: 'accommodation_lesson', label: 'Accommodation + Lessons', icon: '🏄‍♂️', description: 'Stay and learn packages' },
    { key: 'all_inclusive', label: 'All Inclusive', icon: '⭐', description: 'Complete package: Stay, lessons & equipment' },
  ];

  // Fetch available packages
  const { data: availablePackages, isLoading: packagesLoading } = useQuery({
    queryKey: ['available-packages', selectedPackageCategory],
    queryFn: async () => {
      const params = selectedPackageCategory ? `?category=${selectedPackageCategory}` : '';
      const response = await apiClient.get(`/services/packages/available${params}`);
      return response.data;
    },
    enabled: showPackages && !!selectedPackageCategory,
  });

  // Package purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async ({ packageId, paymentMethod, externalPaymentProcessor, externalPaymentReference, externalPaymentNote, checkInDate, checkOutDate, voucherId }) => {
      const response = await apiClient.post('/services/packages/purchase', {
        packageId,
        paymentMethod,
        externalPaymentProcessor,
        externalPaymentReference,
        externalPaymentNote,
        checkInDate,
        checkOutDate,
        voucherId
      });
      return response.data;
    },
    onSuccess: async (data) => {
      let description = `You have successfully purchased "${data.customerPackage.packageName}".`;
      
      // Add voucher discount info if applied
      if (data.voucher) {
        description += ` Promo code "${data.voucher.code}" saved you ${data.voucher.discountApplied.toFixed(2)}!`;
        if (data.voucher.walletCreditApplied) {
          description += ` Plus ${data.voucher.walletCreditApplied.toFixed(2)} ${data.voucher.walletCurrency} added to your wallet!`;
        }
      }
      
      // Add accommodation booking info if present
      if (data.accommodationBooking) {
        description += ` Accommodation confirmed at ${data.accommodationBooking.unitName} for ${data.accommodationBooking.nights} night(s).`;
      }
      
      if (data.wallet) {
        description += ` Your new wallet balance is ${formatCurrency(data.wallet.newBalance, data.wallet.currency)}.`;
      } else if (data.externalPayment) {
        description += ` Payment via ${data.externalPayment.processor} recorded.`;
      } else if (data.paymentMethod === 'pay_later') {
        description += ' Payment is pending.';
      }

      // Check if user was upgraded to student role
      const roleUpgraded = data.roleUpgrade?.upgraded;
      
      if (roleUpgraded) {
        description += ' 🎉 Your account has been upgraded to Student! You now have access to the Student Dashboard.';
        // Refresh token to get new role
        await refreshToken();
      }

      notification.success({
        message: 'Package Purchased!',
        description,
        duration: roleUpgraded ? 8 : 5,
      });
      
      // Refresh wallet balance
      refetchWallet();
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['customer-packages'] });
      // Reset state
      setPurchasingPackageId(null);
      setPurchaseModalOpen(false);
      setSelectedPackageForPurchase(null);
      setSelectedPaymentMethod('wallet');
      setSelectedProcessor(null);
      processorForm.resetFields();
      
      // Redirect to student dashboard if upgraded
      if (roleUpgraded) {
        setTimeout(() => {
          navigate('/student/dashboard');
        }, 2000);
      }
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to purchase package';
      const errorData = error.response?.data;
      const errorCode = errorData?.code;
      
      if (errorData?.required && errorData?.available !== undefined) {
        notification.error({
          message: 'Insufficient Balance',
          description: `You need ${formatCurrency(errorData.required, errorData.currency)} but only have ${formatCurrency(errorData.available, errorData.currency)} available. Please add funds to your wallet or choose another payment method.`,
          duration: 6,
        });
      } else if (errorCode === 'DATES_UNAVAILABLE') {
        notification.error({
          message: 'Accommodation Not Available',
          description: 'The accommodation is not available for your selected dates. Please choose different dates.',
          duration: 6,
        });
      } else if (errorCode === 'DATES_REQUIRED') {
        notification.error({
          message: 'Dates Required',
          description: 'Please select check-in and check-out dates for this accommodation package.',
          duration: 5,
        });
      } else if (errorCode === 'NO_UNIT_ASSIGNED') {
        notification.error({
          message: 'Configuration Error',
          description: 'This package does not have an accommodation unit assigned. Please contact support.',
          duration: 6,
        });
      } else {
        notification.error({
          message: 'Purchase Failed',
          description: errorMessage,
          duration: 5,
        });
      }
      setPurchasingPackageId(null);
    }
  });

  const handleOpenPurchaseModal = (pkg) => {
    setSelectedPackageForPurchase(pkg);
    setSelectedPaymentMethod('wallet');
    setSelectedProcessor(null);
    processorForm.resetFields();
    setAccommodationDates({ checkIn: null, checkOut: null });
    setPurchaseModalOpen(true);
  };

  const handleConfirmPurchase = async () => {
    const pkg = selectedPackageForPurchase;
    if (!pkg) return;

    // Check if package includes accommodation - require dates
    const includesAccommodation = pkg.includesAccommodation || 
      pkg.packageType === 'accommodation' || 
      pkg.packageType === 'accommodation_rental' || 
      pkg.packageType === 'accommodation_lesson' || 
      pkg.packageType === 'all_inclusive';

    if (includesAccommodation) {
      if (!accommodationDates.checkIn || !accommodationDates.checkOut) {
        notification.error({
          message: 'Select Dates',
          description: 'Please select check-in and check-out dates for your accommodation.',
        });
        return;
      }
      
      // Validate check-out is after check-in
      if (accommodationDates.checkOut.isBefore(accommodationDates.checkIn) || 
          accommodationDates.checkOut.isSame(accommodationDates.checkIn, 'day')) {
        notification.error({
          message: 'Invalid Dates',
          description: 'Check-out date must be after check-in date.',
        });
        return;
      }
    }

    // Wallet balance is in storage currency (EUR)
    const rawWalletBalance = typeof walletSummary?.available === 'number' ? walletSummary.available : 0;
    
    // Get price in storage currency (EUR) for comparison
    // Use package base price which is in EUR
    const pkgPriceInEUR = pkg.price || 0;
    
    // Get price for display in user's currency
    const { price: displayPrice, currency: displayCurrency } = getPackagePriceInCurrency(pkg, userCurrency, convertCurrency);
    
    // Convert wallet to display currency for user-facing messages
    const displayWalletBalance = convertCurrency 
      ? convertCurrency(rawWalletBalance, storageCurrency, displayCurrency)
      : rawWalletBalance;

    // Compare in storage currency (EUR) for accurate validation
    if (selectedPaymentMethod === 'wallet' && rawWalletBalance < pkgPriceInEUR) {
      notification.error({
        message: 'Insufficient Balance',
        description: `You need ${formatCurrency(displayPrice, displayCurrency)} but only have ${formatCurrency(displayWalletBalance, displayCurrency)} available.`,
      });
      return;
    }

    // Validate external payment
    let externalPaymentReference = null;
    let externalPaymentNote = null;

    if (selectedPaymentMethod === 'external') {
      if (!selectedProcessor) {
        notification.error({
          message: 'Select Payment Processor',
          description: 'Please select a payment processor.',
        });
        return;
      }

      try {
        const values = await processorForm.validateFields();
        externalPaymentReference = values.reference;
        externalPaymentNote = values.note;
      } catch {
        return; // Form validation failed
      }
    }

    setPurchasingPackageId(pkg.id);

    await purchaseMutation.mutateAsync({
      packageId: pkg.id,
      paymentMethod: selectedPaymentMethod,
      externalPaymentProcessor: selectedProcessor,
      externalPaymentReference,
      externalPaymentNote,
      // Send accommodation dates if applicable
      checkInDate: includesAccommodation && accommodationDates.checkIn ? accommodationDates.checkIn.format('YYYY-MM-DD') : null,
      checkOutDate: includesAccommodation && accommodationDates.checkOut ? accommodationDates.checkOut.format('YYYY-MM-DD') : null,
      // Send voucher/promo code if applied
      voucherId: appliedVoucher?.id || null
    });
  };

  const renderPaymentMethodSelector = () => {
    const pkg = selectedPackageForPurchase;
    if (!pkg) return null;

    // Check if package includes accommodation
    const includesAccommodation = pkg.includesAccommodation || 
      pkg.packageType === 'accommodation' || 
      pkg.packageType === 'accommodation_rental' || 
      pkg.packageType === 'accommodation_lesson' || 
      pkg.packageType === 'all_inclusive';

    // Wallet balance is in storage currency (EUR)
    const rawWalletBalance = typeof walletSummary?.available === 'number' ? walletSummary.available : 0;
    
    // Get price in storage currency (EUR) for comparison
    const pkgPriceInEUR = pkg.price || 0;
    
    // Get price for display in user's currency
    const { price: displayPrice, currency: displayCurrency } = getPackagePriceInCurrency(pkg, userCurrency, convertCurrency);
    
    // Convert wallet to display currency
    const displayWalletBalance = convertCurrency 
      ? convertCurrency(rawWalletBalance, storageCurrency, displayCurrency)
      : rawWalletBalance;
      
    // Compare in storage currency (EUR)
    const canPayWithWallet = rawWalletBalance >= pkgPriceInEUR;

    // Calculate nights if dates selected
    const nightsSelected = accommodationDates.checkIn && accommodationDates.checkOut 
      ? accommodationDates.checkOut.diff(accommodationDates.checkIn, 'day')
      : 0;

    return (
      <div className="space-y-4">
        {/* Package Info */}
        <div className="bg-slate-50 p-3 rounded-lg">
          <Title level={5} className="!mb-1">{pkg.name}</Title>
          <Text type="secondary">{pkg.lessonServiceName}</Text>
          <div className="mt-2">
            <Text strong className="text-xl text-sky-600">{formatCurrency(displayPrice, displayCurrency)}</Text>
          </div>
        </div>

        {/* Accommodation Date Selection */}
        {includesAccommodation && (
          <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
            <Text strong className="block mb-2">
              <CalendarOutlined className="mr-2" />
              Select Stay Dates
            </Text>
            <Text type="secondary" className="block mb-3 text-xs">
              {pkg.accommodationNights > 0 
                ? `This package includes ${pkg.accommodationNights} nights of accommodation`
                : 'Select your check-in and check-out dates'}
            </Text>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Text className="text-xs text-gray-500 block mb-1">Check-in</Text>
                <DatePicker
                  value={accommodationDates.checkIn}
                  onChange={(date) => setAccommodationDates(prev => ({ ...prev, checkIn: date }))}
                  placeholder="Check-in date"
                  className="w-full"
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                  format="DD MMM YYYY"
                />
              </div>
              <div>
                <Text className="text-xs text-gray-500 block mb-1">Check-out</Text>
                <DatePicker
                  value={accommodationDates.checkOut}
                  onChange={(date) => setAccommodationDates(prev => ({ ...prev, checkOut: date }))}
                  placeholder="Check-out date"
                  className="w-full"
                  disabledDate={(current) => {
                    if (!accommodationDates.checkIn) return current && current < dayjs().startOf('day');
                    return current && current <= accommodationDates.checkIn;
                  }}
                  format="DD MMM YYYY"
                />
              </div>
            </div>
            {nightsSelected > 0 && (
              <div className="mt-2 text-center">
                <Tag color="orange">{nightsSelected} night{nightsSelected > 1 ? 's' : ''}</Tag>
              </div>
            )}
          </div>
        )}

        {/* Payment Method Selection */}
        <div>
          <Text strong className="block mb-2">Select Payment Method</Text>
          <Radio.Group
            value={selectedPaymentMethod}
            onChange={(e) => {
              setSelectedPaymentMethod(e.target.value);
              if (e.target.value !== 'external') {
                setSelectedProcessor(null);
                processorForm.resetFields();
              }
            }}
            className="w-full"
          >
            <div className="space-y-2">
              {/* Wallet Payment */}
              <Radio 
                value="wallet" 
                className="w-full p-3 border rounded-lg hover:bg-slate-50"
                disabled={!canPayWithWallet}
              >
                <div className="flex items-center gap-2">
                  <WalletOutlined className="text-green-600" />
                  <span>Pay with Wallet</span>
                  <Tag color={canPayWithWallet ? 'green' : 'red'} className="ml-2">
                    {formatCurrency(walletBalance, pkg.currency)}
                  </Tag>
                </div>
                {!canPayWithWallet && (
                  <Text type="danger" className="text-xs block mt-1">
                    Insufficient balance
                  </Text>
                )}
              </Radio>

              {/* Credit Card / External Payment */}
              <Radio 
                value="external" 
                className="w-full p-3 border rounded-lg hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <CreditCardOutlined className="text-blue-600" />
                  <span>Credit Card / External Payment</span>
                </div>
              </Radio>

              {/* Pay Later - REMOVED for outsiders to prevent refund issues
                 Outsiders must pay upfront (wallet or external payment only) */}
            </div>
          </Radio.Group>
        </div>

        {/* External Payment Form - Always render Form but conditionally show to avoid useForm warning */}
        <div style={{ display: selectedPaymentMethod === 'external' ? 'block' : 'none' }}>
          <div className="border-l-4 border-blue-400 pl-4 py-2 bg-blue-50 rounded-r-lg">
            <Text strong className="block mb-3">External Payment Details</Text>
            
            {/* Processor Selection */}
            <div className="mb-3">
              <Text className="block mb-1">Payment Processor</Text>
              <Radio.Group
                value={selectedProcessor}
                onChange={(e) => setSelectedProcessor(e.target.value)}
                buttonStyle="solid"
                size="small"
              >
                {PROCESSOR_OPTIONS.map((opt) => (
                  <Radio.Button key={opt.value} value={opt.value}>
                    {opt.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </div>

            {/* Reference Number */}
            <Form form={processorForm} layout="vertical" size="small">
              <Form.Item
                name="reference"
                label="Payment Reference / Transaction ID"
                rules={[{ required: true, message: 'Please enter the payment reference' }]}
              >
                <Input placeholder="Enter payment reference or transaction ID" />
              </Form.Item>
              <Form.Item
                name="note"
                label="Note (Optional)"
              >
                <Input placeholder="Any additional notes" />
              </Form.Item>
            </Form>
          </div>
        </div>

        {/* Promo Code Input */}
        <div className="pt-2 border-t">
          <Text strong className="block mb-2">Have a Promo Code?</Text>
          <PromoCodeInput
            context="packages"
            amount={displayPrice}
            currency={displayCurrency}
            serviceId={pkg.id}
            appliedVoucher={appliedVoucher}
            onValidCode={(voucherData) => setAppliedVoucher(voucherData)}
            onClear={() => setAppliedVoucher(null)}
            disabled={purchaseMutation.isPending}
          />
        </div>
      </div>
    );
  };

  usePageSEO({
    title: 'Book Your First Lesson | Plannivo',
    description: 'Book your first kitesurfing lesson and start your water sports journey with Plannivo.'
  });



  // Handle incoming navigation state from lesson info pages
  useEffect(() => {
    if (location.state?.serviceCategory || location.state?.discipline) {
      // Build initial data for the booking wizard
      const initialData = {};
      
      if (location.state.serviceCategory) {
        initialData.serviceCategory = location.state.serviceCategory;
      }
      if (location.state.discipline) {
        initialData.discipline = location.state.discipline;
      }
      
      setBookingInitialData(initialData);
      setBookingOpen(true);
      
      // Clear the navigation state to prevent re-triggering
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);



  const handleBookingOpen = () => {
    // Check if user is a guest (not authenticated)
    if (isGuest || !isAuthenticated) {
      openAuthModal({
        title: 'Sign In to Book Your First Lesson',
        message: 'Create a free account or sign in to book your lesson with us',
        returnUrl: '/book'
      });
      return;
    }
    setBookingInitialData(EMPTY_BOOKING_DATA);
    setBookingOpen(true);
  };

  const handleBookingClose = async () => {
    setBookingOpen(false);
    setBookingInitialData(EMPTY_BOOKING_DATA);
    
    // After booking is complete, refresh user data to get updated role
    try {
      if (refreshUser) {
        const updatedUser = await refreshUser();
        
        // If user was upgraded to student, redirect to student dashboard
        if (updatedUser?.role?.toLowerCase() === 'student') {
          notification.success({
            message: 'Welcome to Plannivo!',
            description: 'Your first booking is confirmed! You now have full access to the student portal.',
            duration: 5,
          });
          
          // Small delay to show the success message
          setTimeout(() => {
            navigate('/student/dashboard');
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Failed to refresh user after booking:', error);
    }
  };

  const currency = {
    code: userCurrency || 'EUR',
    symbol: userCurrency === 'TRY' ? '₺' : '€'
  };

  const walletBalance = typeof walletSummary?.available === 'number' 
    ? Number(walletSummary.available) 
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50 dark:from-slate-900 dark:to-slate-800">
      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Welcome Card */}
        <Card className="mb-8 rounded-2xl shadow-lg border-0">
          <div className="text-center py-4">
            <div className="w-20 h-20 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CalendarOutlined className="text-4xl text-sky-600" />
            </div>
            <Title level={3} className="!mb-2">
              {isGuest ? 'Welcome to UKC Academy!' : `Welcome, ${user?.first_name || 'New Member'}!`}
            </Title>
            <Paragraph className="text-slate-600 max-w-lg mx-auto mb-6">
              {isGuest 
                ? 'Discover the world of kite surfing with expert instructors. Sign in to book your first lesson and start your adventure!'
                : "You're just one step away from booking your first lesson. Click the button below to choose your preferred time and instructor."
              }
            </Paragraph>
            
            <Button 
              type="primary" 
              size="large"
              icon={<CalendarOutlined />}
              onClick={handleBookingOpen}
              className="h-12 px-8 text-lg rounded-xl"
            >
              Book Your First Lesson
            </Button>

            {/* Buy Package Button */}
            <Button 
              size="large"
              icon={<ShoppingOutlined />}
              onClick={() => {
                // Check if user is a guest
                if (isGuest || !isAuthenticated) {
                  openAuthModal({
                    title: 'Sign In to Purchase Packages',
                    message: 'Create an account to purchase lesson packages and save money',
                    returnUrl: '/book'
                  });
                  return;
                }
                setShowPackages(true);
                setSelectedPackageCategory(null);
              }}
              className="h-12 px-8 text-lg rounded-xl mt-4"
            >
              Buy a Package
            </Button>
          </div>
        </Card>

        {/* Package Selection UI */}
        {showPackages && (
          <Card className="mb-8 rounded-2xl shadow-lg border-0">
            <div className="mb-4 flex items-center justify-between">
              <Title level={4} className="!mb-0">
                <ShoppingOutlined className="mr-2" />
                Purchase a Package
              </Title>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1 bg-sky-50 rounded-full">
                  <WalletOutlined className="text-sky-600" />
                  <Text strong className="text-sky-600">
                    {formatCurrency(typeof walletSummary?.available === 'number' ? walletSummary.available : 0, userCurrency)}
                  </Text>
                </div>
                <Button size="small" onClick={() => {
                  setShowPackages(false);
                  setSelectedPackageCategory(null);
                }}>
                  Close
                </Button>
              </div>
            </div>

            {!selectedPackageCategory ? (
              <>
                <Paragraph className="text-slate-600 mb-4">
                  Choose a package category to see available options and save money on your activities.
                </Paragraph>
                <div className="grid grid-cols-1 gap-3">
                  {PACKAGE_CATEGORIES.map((cat) => (
                    <div
                      key={cat.key}
                      onClick={() => setSelectedPackageCategory(cat.key)}
                      className="p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md hover:border-sky-400 border-gray-200 bg-white hover:bg-sky-50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-3xl">{cat.icon}</div>
                        <div className="flex-1">
                          <Title level={5} className="mb-0 text-base">{cat.label}</Title>
                          <Text type="secondary" className="text-xs">{cat.description}</Text>
                        </div>
                        <div className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-sky-500 hover:text-white transition-colors">
                          View Packages
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <Button
                    type="text"
                    size="small"
                    icon={<span className="text-lg">←</span>}
                    onClick={() => setSelectedPackageCategory(null)}
                  />
                  <div>
                    <Title level={5} className="!mb-0">
                      {PACKAGE_CATEGORIES.find(c => c.key === selectedPackageCategory)?.icon}{' '}
                      {PACKAGE_CATEGORIES.find(c => c.key === selectedPackageCategory)?.label}
                    </Title>
                    <Text type="secondary" className="text-xs">
                      Available packages for this category
                    </Text>
                  </div>
                </div>

                {packagesLoading ? (
                  <Spin />
                ) : !availablePackages || availablePackages.length === 0 ? (
                  <Empty
                    description="No packages available in this category"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  >
                    <Button type="link" size="small" onClick={() => setSelectedPackageCategory(null)}>
                      ← Back to categories
                    </Button>
                  </Empty>
                ) : (
                  <div className="space-y-3">
                    {availablePackages.map((pkg) => {
                      // Get package type icon
                      const typeIcon = pkg.packageType === 'rental' ? '🏄' 
                        : pkg.packageType === 'accommodation' ? '🏨' 
                        : '🎓';
                      // Get price in user's currency (with live conversion)
                      const { price: pkgPrice, currency: pkgCurrency } = getPackagePriceInCurrency(pkg, userCurrency, convertCurrency);
                      const pkgPricePerHour = pkg.totalHours > 0 ? pkgPrice / pkg.totalHours : 0;
                      
                      return (
                        <div
                          key={pkg.id}
                          className="p-4 border-2 rounded-xl border-gray-200 hover:border-sky-400 hover:shadow-md transition-all duration-200"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span>{typeIcon}</span>
                                <Title level={5} className="!mb-0">{pkg.name}</Title>
                              </div>
                              <Paragraph className="text-sm text-slate-600 mb-2">
                                {pkg.lessonServiceName}
                              </Paragraph>
                              <div className="flex flex-wrap gap-2 mb-3">
                                <Tag color="blue">{pkg.sessionsCount} sessions</Tag>
                                {pkg.totalHours > 0 && <Tag color="cyan">{pkg.totalHours} hours</Tag>}
                                {pkg.disciplineTag && <Tag>{pkg.disciplineTag}</Tag>}
                                {pkg.levelTag && <Tag color="green">{pkg.levelTag}</Tag>}
                              </div>
                              <div className="flex items-center gap-4">
                                <div>
                                  <Text strong className="text-2xl text-sky-600">
                                    {formatCurrency(pkgPrice, pkgCurrency)}
                                  </Text>
                                  {pkgPricePerHour > 0 && (
                                    <Text type="secondary" className="text-xs ml-2">
                                      ({formatCurrency(pkgPricePerHour, pkgCurrency)}/hour)
                                    </Text>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Button 
                              type="primary" 
                              size="large"
                              icon={<ShoppingOutlined />}
                              loading={purchasingPackageId === pkg.id}
                              onClick={() => handleOpenPurchaseModal(pkg)}
                            >
                              Buy Now
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="rounded-xl border-slate-200">
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircleOutlined className="text-xl text-green-600" />
              </div>
              <Text strong className="block mb-1">Expert Instructors</Text>
              <Text type="secondary" className="text-sm">
                Certified professionals with years of experience
              </Text>
            </div>
          </Card>
          
          <Card className="rounded-xl border-slate-200">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CalendarOutlined className="text-xl text-blue-600" />
              </div>
              <Text strong className="block mb-1">Flexible Scheduling</Text>
              <Text type="secondary" className="text-sm">
                Choose times that work for your schedule
              </Text>
            </div>
          </Card>
          
          <Card className="rounded-xl border-slate-200">
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <RocketOutlined className="text-xl text-purple-600" />
              </div>
              <Text strong className="block mb-1">All Levels Welcome</Text>
              <Text type="secondary" className="text-sm">
                From beginners to advanced riders
              </Text>
            </div>
          </Card>
        </div>

        {/* Important Notice */}
        <Alert
          type="info"
          showIcon
          message="After Your First Booking"
          description="Once you complete your first booking, you'll gain access to the full student portal with schedule tracking, payment history, and more features."
          className="mt-8 rounded-xl"
        />
      </div>

      {/* Booking Wizard Modal */}
      <StudentBookingWizard
        open={bookingOpen}
        onClose={handleBookingClose}
        studentId={user?.id}
        walletBalance={walletBalance}
        currency={currency}
        initialData={bookingInitialData}
      />

      {/* Package Purchase Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <ShoppingOutlined className="text-sky-600" />
            <span>Purchase Package</span>
          </div>
        }
        open={purchaseModalOpen}
        destroyOnHidden
        onCancel={() => {
          setPurchaseModalOpen(false);
          setSelectedPackageForPurchase(null);
          setSelectedPaymentMethod('wallet');
          setSelectedProcessor(null);
          setAppliedVoucher(null);
          processorForm.resetFields();
        }}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              setPurchaseModalOpen(false);
              setSelectedPackageForPurchase(null);
            }}
          >
            Cancel
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={purchaseMutation.isPending}
            onClick={handleConfirmPurchase}
            disabled={
              (selectedPaymentMethod === 'external' && !selectedProcessor)
            }
          >
            Confirm Purchase
          </Button>
        ]}
        width={500}
        destroyOnHidden
      >
        {renderPaymentMethodSelector()}
      </Modal>
    </div>
  );
};

export default OutsiderBookingPage;
