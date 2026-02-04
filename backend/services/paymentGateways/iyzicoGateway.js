import Iyzipay from 'iyzipay';
import { pool } from '../../db.js';
import { logger } from '../../middlewares/errorHandler.js';
import { logPaymentEvent, sendPaymentAlert } from '../alertService.js';
import CurrencyService from '../currencyService.js';

const config = {
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
};

// Initialize only if keys exist
const iyzipay = (config.apiKey && config.secretKey) 
  ? new Iyzipay(config) 
  : null;

/**
 * Fetch user details for Iyzico
 */
async function getUserDetails(userId) {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, address, city, country FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  } catch (err) {
    logger.error('Failed to fetch user for Iyzico', err);
    return null;
  }
}

/**
 * Initiate a deposit using Iyzico Checkout Form
 */
export async function initiateDeposit({
  amount,
  currency,
  userId,
  user, // Allow direct injection for testing
  metadata = {},
  referenceCode,
  items = []  // New parameter
}) {
  return new Promise(async (resolve, reject) => {
    // Check credentials
    if (!iyzipay) {
        // Fallback or Error
        if (process.env.NODE_ENV === 'development') {
             logger.warn('Iyzico credentials missing. Returning MOCK response.');
             const token = referenceCode || `mock-${Date.now()}`;
             return resolve({
                 gateway: 'iyzico',
                 shouldAutoComplete: false,
                 status: 'requires_action',
                 gatewayTransactionId: token,
                 checkoutFormContent: '<div style="background:red;color:white;padding:20px;">IYZICO MOCK: CREDENTIALS MISSING. CHECK SERVER LOGS.</div>',
                 metadata: { provider: 'iyzico', mock: true }
             });
        }
        return reject(new Error('Iyzico Payment Gateway is not configured.'));
    }

    const userData = user || await getUserDetails(userId);
    // Encode userId in basketId so we can retrieve it in callback
    // Format: USR_{userId}_TRX_{timestamp}
    const safeUserId = userId || userData?.id || 'GUEST';
    const basketId = `USR_${safeUserId}_TRX_${Date.now()}`;
    const conversationId = referenceCode || basketId;
    const baseUrl = process.env.BACKEND_API_URL || 'http://localhost:4000';
    // Use a route in finances.js that will handle the POST and redirect to frontend
    const callbackUrl = metadata.callbackUrl || `${baseUrl}/api/finances/callback/iyzico`;

    // PAYMENT GATEWAY STRATEGY:
    // - Display to user: Their preferred currency (EUR, USD, GBP, etc.)
    // - Send to Iyzico: Always TRY (Turkish Lira) - required for Turkish merchant account
    // - Customer's card: Can be any currency - their bank will handle conversion
    // - You receive: Always TRY in your Turkish bank account
    //
    // Example flow:
    // User sees: "Pay €50.00"
    // We convert: €50 × 32.5 = ₺1,625
    // Iyzico charges: ₺1,625 (customer sees this on payment page)
    // Customer's bank: Converts ₺1,625 to their card currency (€, $, £, etc.)
    // Customer's statement: Shows charge in their card's currency
    // Your Turkish account: Receives ₺1,625
    
    const displayCurrency = (currency || 'EUR').toUpperCase();
    const displayAmount = parseFloat(amount);
    
    // Convert to TRY for gateway processing
    let gatewayAmount;
    let exchangeRate;
    
    try {
        const conversion = await CurrencyService.convertToTRY(displayAmount, displayCurrency);
        gatewayAmount = conversion.amount;
        exchangeRate = conversion.rate;
        
        logger.info('Currency conversion for Iyzico', {
            displayCurrency,
            displayAmount,
            gatewayAmount,
            exchangeRate,
            conversionFormula: `${displayAmount} ${displayCurrency} × ${exchangeRate} = ${gatewayAmount} TRY`
        });
    } catch (error) {
        logger.error('Failed to convert currency to TRY', { displayCurrency, displayAmount, error: error.message });
        throw new Error('Para birimi dönüşümü başarısız oldu. Lütfen daha sonra tekrar deneyin.');
    }
    
    // Always use TRY for Iyzico (Turkish merchant requirement)
    const iyzicoCurrency = Iyzipay.CURRENCY.TRY;
    const priceStr = gatewayAmount.toFixed(2);

    logger.info('Iyzico payment initialization', { 
        displayAmount: displayAmount.toFixed(2),
        displayCurrency,
        gatewayAmount: priceStr,
        gatewayCurrency: 'TRY',
        exchangeRate,
        userCountry: userData?.country,
        userEmail: userData?.email
    });

    
    // Create Buyer Object
    // Split name strictly for Iyzico (Name Surname)
    const fullName = (userData?.name || 'Guest User').trim();
    const lastSpaceIndex = fullName.lastIndexOf(' ');
    const firstName = lastSpaceIndex > 0 ? fullName.substring(0, lastSpaceIndex) : fullName;
    const lastName = lastSpaceIndex > 0 ? fullName.substring(lastSpaceIndex + 1) : 'User';

    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: conversationId,
      price: priceStr,
      paidPrice: priceStr,
      currency: iyzicoCurrency,
      basketId: basketId,  // Contains encoded userId for callback retrieval
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      callbackUrl: callbackUrl,
      enabledInstallments: [1],
      buyer: {
        id: safeUserId,
        name: firstName,
        surname: lastName,
        gsmNumber: userData?.phone || '+905555555555',
        email: userData?.email || 'email@email.com',
        identityNumber: userData?.identity_number || '11111111111',
        lastLoginDate: '2025-01-01 12:00:00',
        registrationDate: '2025-01-01 12:00:00',
        registrationAddress: userData?.address || 'N/A',
        ip: '85.34.78.112', // Should ideally be passed from req.ip
        city: userData?.city || 'Istanbul',
        country: userData?.country || 'Turkey',
        zipCode: userData?.zip_code || '34732'
      },
      shippingAddress: {
        contactName: fullName,
        city: userData?.city || 'Istanbul',
        country: userData?.country || 'Turkey',
        address: userData?.address || 'N/A',
        zipCode: userData?.zip_code || '34732'
      },
      billingAddress: {
        contactName: fullName,
        city: userData?.city || 'Istanbul',
        country: userData?.country || 'Turkey',
        address: userData?.address || 'N/A',
        zipCode: userData?.zip_code || '34732'
      },
      basketItems: items.length > 0 ? items : [
        {
          id: 'WALLET-TOPUP',
          name: displayCurrency !== 'TRY' 
            ? `Wallet Deposit (${displayAmount.toFixed(2)} ${displayCurrency})` 
            : 'Wallet Deposit',
          category1: 'General',
          category2: 'Finance',
          itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
          price: priceStr
        }
      ]
    };

    logger.info('Initiating Iyzico Checkout', { 
      conversationId, 
      gatewayPrice: priceStr,
      gatewayCurrency: 'TRY',
      displayPrice: displayAmount.toFixed(2),
      displayCurrency 
    });

    iyzipay.checkoutFormInitialize.create(request, (err, result) => {
      if (err) {
        logger.error('Iyzico Driver Error', err);
        return reject(err);
      }

      if (result.status !== 'success') {
        logger.error('Iyzico API Error', result);
        return reject(new Error(result.errorMessage || 'Iyzico initialization failed'));
      }

      // DEBUG: Log the full result to see if content is missing
      logger.info('Iyzico Init Result Full', { 
         token: result.token,
         hasContent: !!result.checkoutFormContent,
         hasUrl: !!result.paymentPageUrl,
         fullResult: JSON.stringify(result)
      });

      resolve({
        gateway: 'iyzico',
        shouldAutoComplete: false, 
        status: 'requires_action',
        gatewayTransactionId: result.token,
        checkoutFormContent: result.checkoutFormContent,
        paymentPageUrl: result.paymentPageUrl,
        session: {
            paymentPageUrl: result.paymentPageUrl,
            checkoutFormContent: result.checkoutFormContent
        },
        // Display currency - what user sees in their wallet
        displayAmount: displayAmount,
        displayCurrency: displayCurrency,
        // Gateway currency - what's sent to Iyzico
        gatewayAmount: gatewayAmount,
        gatewayCurrency: 'TRY',
        // Exchange rate for audit trail
        exchangeRate: exchangeRate,
        metadata: {
          token: result.token,
          pageUrl: result.paymentPageUrl,
          provider: 'iyzico',
          // Display info (for wallet crediting)
          displayAmount: displayAmount,
          displayCurrency: displayCurrency,
          // Gateway info (for reconciliation)
          gatewayAmount: gatewayAmount,
          gatewayCurrency: 'TRY',
          exchangeRate: exchangeRate,
          conversionNote: `${displayAmount} ${displayCurrency} × ${exchangeRate} = ${gatewayAmount} TRY`,
          customerNote: 'Ödeme TRY olarak işlenecektir. Kartınıza bankanızın kuru uygulanarak yansıyacaktır.'
        }
      });
    });
  });
}

/**
 * Verify payment using Iyzico token from callback
 */
export async function verifyPayment(token) {
    return new Promise((resolve, reject) => {
        if (!iyzipay) {
             // Mock verification for dev
             if (token && token.startsWith('mock-')) {
                 return resolve({
                     status: 'success',
                     paymentId: token,
                     paidPrice: 100, // Mock amount
                     currency: 'EUR'
                 });
             }
             return reject(new Error('Iyzico not configured'));
        }

        iyzipay.checkoutForm.retrieve({
            locale: Iyzipay.LOCALE.TR,
            token: token
        }, function (err, result) {
            // Log full response for debugging
            logger.info('Iyzico checkoutForm.retrieve response', {
                err: err ? err.message : null,
                status: result?.status,
                paymentStatus: result?.paymentStatus,
                errorCode: result?.errorCode,
                errorMessage: result?.errorMessage,
                paymentId: result?.paymentId,
                paidPrice: result?.paidPrice,
                currency: result?.currency
            });
            
            if (err || result.status !== 'success') {
                return reject(new Error(err?.message || result?.errorMessage || 'Verification failed'));
            }
            
            if (result.paymentStatus !== 'SUCCESS') {
                 return reject(new Error(`Payment not successful: ${result.paymentStatus}`));
            }

            resolve({
                status: 'success',
                paymentId: result.paymentId,
                paidPrice: result.paidPrice,
                currency: result.currency,
                raw: result
            });
        });
    });
}

/**
 * İade işlemi (Admin)
 * Iyzico checkout form ödemeleri için refund
 * 
 * ÖNEMLİ: Iyzico'da refund için paymentTransactionId gerekli.
 * Checkout form ödemelerinde bu ID, checkoutForm.retrieve ile token sorgulanarak alınır.
 * 
 * @param {string} paymentTransactionId - Iyzico payment transaction ID (varsa direkt kullan)
 * @param {string} paymentId - Iyzico payment ID
 * @param {string} token - Checkout form token (paymentTransactionId yoksa bununla sorgula)
 * @param {number} amount - İade tutarı
 * @param {string} currency - Para birimi
 */
export async function refundPayment({ paymentTransactionId, paymentId, token, amount, currency }) {
  if (!iyzipay) {
    throw new Error('Iyzico is not configured');
  }

  // Eğer paymentTransactionId yoksa, token ile checkout form'u sorgula
  let actualPaymentTransactionId = paymentTransactionId;
  
  if (!actualPaymentTransactionId && token) {
    // Token ile checkoutForm.retrieve yap
    const paymentDetails = await new Promise((resolve, reject) => {
      iyzipay.checkoutForm.retrieve({ token }, (err, result) => {
        if (err) {
          logger.error('Failed to retrieve checkout form for refund', { error: err.message, token });
          return reject(new Error('Ödeme detayları alınamadı'));
        }
        if (result.status !== 'success') {
          logger.error('Checkout form retrieve failed', { error: result.errorMessage, token });
          return reject(new Error(result.errorMessage || 'Ödeme detayları alınamadı'));
        }
        resolve(result);
      });
    });

    // itemTransactions'dan paymentTransactionId al
    if (paymentDetails.itemTransactions && paymentDetails.itemTransactions.length > 0) {
      actualPaymentTransactionId = paymentDetails.itemTransactions[0].paymentTransactionId;
      logger.info('Retrieved paymentTransactionId from checkout form', { 
        paymentTransactionId: actualPaymentTransactionId, 
        token 
      });
    } else {
      throw new Error('Payment transaction ID not found in checkout form details');
    }
  }

  if (!actualPaymentTransactionId) {
    throw new Error('Payment transaction ID is required for refund. Token or paymentTransactionId must be provided.');
  }

  // Iyzico requires TRY currency for refunds
  // Convert from source currency to TRY if needed
  let refundAmount = amount;
  let refundCurrency = currency || 'TRY';
  
  if (refundCurrency !== 'TRY') {
    try {
      refundAmount = await CurrencyService.convertCurrency(amount, refundCurrency, 'TRY');
      logger.info('Converted refund amount to TRY', {
        originalAmount: amount,
        originalCurrency: refundCurrency,
        convertedAmount: refundAmount,
        convertedCurrency: 'TRY'
      });
      refundCurrency = 'TRY';
    } catch (conversionError) {
      logger.error('Currency conversion failed for Iyzico refund', {
        error: conversionError.message,
        amount,
        fromCurrency: refundCurrency
      });
      throw new Error('Failed to convert currency for refund. Iyzico requires TRY.');
    }
  }

  return new Promise((resolve, reject) => {
    const request = {
      paymentTransactionId: actualPaymentTransactionId,
      price: refundAmount.toFixed(2),
      currency: Iyzipay.CURRENCY.TRY,  // Always use TRY
      ip: '127.0.0.1'
    };

    logger.info('Processing Iyzico refund', { 
      paymentTransactionId: actualPaymentTransactionId, 
      originalAmount: amount,
      originalCurrency: currency,
      refundAmount: refundAmount,
      refundCurrency: 'TRY'
    });

    iyzipay.refund.create(request, (err, result) => {
      if (err || result.status !== 'success') {
        logger.error('Iyzico refund error', { 
          error: err?.message || result?.errorMessage,
          errorCode: result?.errorCode,
          paymentTransactionId: actualPaymentTransactionId 
        });
        
        logPaymentEvent('refund_failed', {
          amount,
          currency: currency || 'TRY',
          status: 'failed',
          transactionId: actualPaymentTransactionId,
          error: result?.errorMessage || err?.message
        });
        
        return reject(new Error(result?.errorMessage || err?.message || 'İade işlemi başarısız'));
      }
      
      logPaymentEvent('refund_completed', {
        amount: parseFloat(result.price),
        currency: 'TRY',
        originalAmount: amount,
        originalCurrency: currency,
        status: 'success',
        transactionId: result.paymentId,
        originalTransactionId: actualPaymentTransactionId
      });
      
      sendPaymentAlert('refund_processed', {
        amount: parseFloat(result.price),
        currency: 'TRY',
        originalAmount: amount,
        originalCurrency: currency,
        transactionId: result.paymentId
      });
      
      resolve({
        refundId: result.paymentId,
        paymentTransactionId: actualPaymentTransactionId,
        amount: parseFloat(result.price),
        currency: result.currency,
        originalAmount: amount,
        originalCurrency: currency,
        status: 'success'
      });
    });
  });
}
