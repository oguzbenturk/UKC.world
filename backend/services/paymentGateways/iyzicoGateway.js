import Iyzipay from 'iyzipay';
import { pool } from '../../db.js';
import { logger } from '../../middlewares/errorHandler.js';
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

    // Iyzico supports multiple currencies directly: TRY, EUR, USD, GBP, NOK, CHF
    // We determine the initialization currency based on the USER'S COUNTRY
    // - Turkey -> Must use TRY (Local cards require TRY)
    // - Other/Null -> Use Source Currency (EUR/USD) to avoid DCC bad rates
    
    const sourceCurrency = (currency || 'EUR').toUpperCase();
    const originalAmount = parseFloat(amount);
    
    let iyzicoCurrency = Iyzipay.CURRENCY.EUR;
    let priceStr = originalAmount.toFixed(2);
    let initializationCurrency = sourceCurrency;

    // Check user country
    const country = (userData?.country || '').toLowerCase();
    const isTurkey = ['turkey', 'türkiye', 'tr', 'turkiye'].includes(country);

    if (isTurkey) {
        // Force TRY for Turkish users to support local cards
        initializationCurrency = 'TRY';
        iyzicoCurrency = Iyzipay.CURRENCY.TRY;
        
        // Convert amount if source isn't TRY
        if (sourceCurrency !== 'TRY') {
             try {
                const amountInTry = await CurrencyService.convertCurrency(amount, sourceCurrency, 'TRY');
                priceStr = amountInTry.toFixed(2);
                logger.info('Converted to TRY for Turkish user', { 
                    user: userData?.email, 
                    country: userData?.country,
                    from: amount,
                    to: amountInTry 
                });
            } catch (convErr) {
                logger.error('Currency conversion failed for Turkey', convErr);
                // Fallback to original (might fail with "Local card..." error if EUR)
                priceStr = originalAmount.toFixed(2);
            }
        } else {
             priceStr = originalAmount.toFixed(2);
        }
    } else {
        // Foreign user - Keep original currency (e.g. EUR)
        // This avoids "910 USD" DCC issues for foreign cards
        const currencyMap = {
            'TRY': Iyzipay.CURRENCY.TRY,
            'EUR': Iyzipay.CURRENCY.EUR,
            'USD': Iyzipay.CURRENCY.USD,
            'GBP': Iyzipay.CURRENCY.GBP,
            'NOK': Iyzipay.CURRENCY.NOK,
            'CHF': Iyzipay.CURRENCY.CHF
        };
        iyzicoCurrency = currencyMap[sourceCurrency] || Iyzipay.CURRENCY.EUR;
        priceStr = originalAmount.toFixed(2);
        
        logger.info('Using Foreign Currency for Outsider/Foreigner', {
            user: userData?.email,
            country: userData?.country,
            currency: initializationCurrency
        });
    }

    logger.info('Iyzico payment initialization', { 
        amount: priceStr, 
        currency: initializationCurrency,
        iyzicoCurrency: iyzicoCurrency,
        userCountry: userData?.country
    });
    
    // Create Buyer Object
    
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
          name: 'Wallet Deposit',
          category1: 'General',
          category2: 'Finance',
          itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
          price: priceStr
        }
      ]
    };

    logger.info('Initiating Iyzico Checkout', { conversationId, price: priceStr });

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
        // Include original amount info for proper wallet crediting
        originalAmount: originalAmount,
        originalCurrency: sourceCurrency,
        metadata: {
          token: result.token,
          pageUrl: result.paymentPageUrl,
          provider: 'iyzico',
          originalAmount: originalAmount,
          originalCurrency: sourceCurrency
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
