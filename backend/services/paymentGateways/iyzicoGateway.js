import Iyzipay from 'iyzipay';
import { pool } from '../../db.js';
import { logger } from '../../middlewares/errorHandler.js';

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
      'SELECT id, name, email, phone, address, city, country, zip_code, identity_number FROM users WHERE id = $1',
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

    const user = await getUserDetails(userId);
    const conversationId = referenceCode || `TRX-${Date.now()}`;
    const baseUrl = process.env.BACKEND_API_URL || 'http://localhost:4000';
    const callbackUrl = `${baseUrl}/api/payment-gateways/iyzico/callback`;

    // Ensure currency
    const pCurrency = (currency || 'EUR').toUpperCase(); // Default to EUR if not provided
    const iyzicoCurrency = Iyzipay.CURRENCY[pCurrency] || Iyzipay.CURRENCY.EUR;
    
    // Iyzico requires price as string
    const priceStr = parseFloat(amount).toFixed(2);
    
    // Create Buyer Object
    // Split name strictly for Iyzico (Name Surname)
    const fullName = (user?.name || 'Guest User').trim();
    const lastSpaceIndex = fullName.lastIndexOf(' ');
    const firstName = lastSpaceIndex > 0 ? fullName.substring(0, lastSpaceIndex) : fullName;
    const lastName = lastSpaceIndex > 0 ? fullName.substring(lastSpaceIndex + 1) : 'User';

    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: conversationId,
      price: priceStr,
      paidPrice: priceStr,
      currency: iyzicoCurrency,
      basketId: conversationId,
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      callbackUrl: callbackUrl,
      enabledInstallments: [1],
      buyer: {
        id: userId,
        name: firstName,
        surname: lastName,
        gsmNumber: user?.phone || '+905555555555',
        email: user?.email || 'email@email.com',
        identityNumber: user?.identity_number || '11111111111',
        lastLoginDate: '2025-01-01 12:00:00',
        registrationDate: '2025-01-01 12:00:00',
        registrationAddress: user?.address || 'N/A',
        ip: '85.34.78.112', // Should ideally be passed from req.ip
        city: user?.city || 'Istanbul',
        country: user?.country || 'Turkey',
        zipCode: user?.zip_code || '34732'
      },
      shippingAddress: {
        contactName: fullName,
        city: user?.city || 'Istanbul',
        country: user?.country || 'Turkey',
        address: user?.address || 'N/A',
        zipCode: user?.zip_code || '34732'
      },
      billingAddress: {
        contactName: fullName,
        city: user?.city || 'Istanbul',
        country: user?.country || 'Turkey',
        address: user?.address || 'N/A',
        zipCode: user?.zip_code || '34732'
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

      logger.info('Iyzico Init Success', { token: result.token });

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
        metadata: {
          token: result.token,
          pageUrl: result.paymentPageUrl,
          provider: 'iyzico'
        }
      });
    });
  });
}
