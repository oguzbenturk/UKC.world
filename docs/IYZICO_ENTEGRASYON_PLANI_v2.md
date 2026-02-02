# Iyzico Ödeme Entegrasyonu - Sadeleştirilmiş Plan v2

## 📋 Genel Bakış

**Amaç:** Plannivo uygulamasına Iyzico ödeme gateway'i entegre etmek

**Mevcut Durum:** Mock/simülasyon yapısı mevcut, gerçek entegrasyon yok

**Hedef:** Production-ready, güvenli Iyzico entegrasyonu

---

## 🎯 Faz 1: Temel Entegrasyon (4-5 saat)

### 1.1 Kurulum

```bash
cd backend
npm install iyzipay
```

### 1.2 Environment Variables

```bash
# backend/.env

# Sandbox (Test)
IYZICO_API_KEY=sandbox-xxx
IYZICO_SECRET_KEY=sandbox-yyy  
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com

# Feature Flag
IYZICO_ENABLED=true
IYZICO_TEST_MODE=true
```

**⚠️ ÖNEMLİ:** Production'a geçerken `IYZICO_TEST_MODE=false` yapılacak

### 1.3 Gateway Implementasyonu

**Dosya:** `backend/services/paymentGateways/iyzicoGateway.js`

```javascript
import Iyzipay from 'iyzipay';
import { pool } from '../../db.js';
import { logger } from '../../middlewares/errorHandler.js';

// SDK Instance
const iyzipay = process.env.IYZICO_ENABLED === 'true' 
  ? new Iyzipay({
      apiKey: process.env.IYZICO_API_KEY,
      secretKey: process.env.IYZICO_SECRET_KEY,
      uri: process.env.IYZICO_BASE_URL
    })
  : null;

/**
 * Ödeme formu başlatma
 */
export async function initiateDeposit({ 
  userId, 
  amount, 
  currency, 
  referenceCode,
  clientIp 
}) {
  if (!iyzipay) {
    throw new Error('Iyzico is not configured');
  }

  // Kullanıcı bilgilerini çek
  const userResult = await pool.query(
    `SELECT id, name, email, phone, address, city, country, zip_code, identity_number
     FROM users WHERE id = $1`,
    [userId]
  );
  
  if (userResult.rows.length === 0) {
    throw new Error('Kullanıcı bulunamadı');
  }
  
  const user = userResult.rows[0];
  
  // Zorunlu alan kontrolü
  if (!user.name || !user.email) {
    throw new Error('Kullanıcı adı ve email zorunludur. Lütfen profil bilgilerinizi tamamlayın.');
  }

  // Para birimi ve tutar
  let finalCurrency = currency;
  let finalAmount = amount;
  
  // Türk kullanıcılar için TRY zorunlu
  if (user.country === 'Turkey' || user.country === 'Türkiye') {
    finalCurrency = 'TRY';
    if (currency !== 'TRY') {
      // TODO: Currency conversion
      // finalAmount = await convertCurrency(amount, currency, 'TRY');
    }
  }

  // ConversationId formatı: userId-timestamp-random
  const conversationId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Iyzico request
  const request = {
    locale: 'tr',
    conversationId,
    price: finalAmount.toFixed(2),
    paidPrice: finalAmount.toFixed(2),
    currency: finalCurrency,
    basketId: referenceCode,
    paymentGroup: 'PRODUCT',
    callbackUrl: `${process.env.BACKEND_URL}/api/finances/callback/iyzico`,
    
    buyer: {
      id: user.id,
      name: user.name.split(' ')[0] || user.name,
      surname: user.name.split(' ').slice(1).join(' ') || '-',
      email: user.email,
      identityNumber: user.identity_number || '11111111111',
      registrationAddress: user.address || 'Belirtilmemiş',
      ip: clientIp,
      city: user.city || 'Istanbul',
      country: user.country || 'Turkey',
      zipCode: user.zip_code || '34000'
    },
    
    shippingAddress: {
      contactName: user.name,
      city: user.city || 'Istanbul',
      country: user.country || 'Turkey',
      address: user.address || 'Belirtilmemiş',
      zipCode: user.zip_code || '34000'
    },
    
    billingAddress: {
      contactName: user.name,
      city: user.city || 'Istanbul',
      country: user.country || 'Turkey',
      address: user.address || 'Belirtilmemiş',
      zipCode: user.zip_code || '34000'
    },
    
    // Minimum 1 basket item zorunlu
    basketItems: [
      {
        id: 'wallet-deposit',
        name: 'Wallet Deposit',
        category1: 'Wallet',
        itemType: 'VIRTUAL',
        price: finalAmount.toFixed(2)
      }
    ]
  };

  return new Promise((resolve, reject) => {
    iyzipay.checkoutFormInitialize.create(request, (err, result) => {
      if (err) {
        logger.error('Iyzico checkout initialize error', { err, userId });
        return reject(new Error('Ödeme başlatılamadı'));
      }
      
      if (result.status !== 'success') {
        logger.error('Iyzico checkout initialize failed', { result, userId });
        return reject(new Error(result.errorMessage || 'Ödeme başlatılamadı'));
      }
      
      resolve({
        token: result.token,
        checkoutFormContent: result.checkoutFormContent,
        paymentPageUrl: result.paymentPageUrl,
        conversationId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 saat
      });
    });
  });
}

/**
 * Ödeme doğrulama
 */
export async function verifyPayment(token) {
  if (!iyzipay) {
    throw new Error('Iyzico is not configured');
  }

  return new Promise((resolve, reject) => {
    iyzipay.checkoutForm.retrieve({ token }, (err, result) => {
      if (err) {
        logger.error('Iyzico payment verification error', { err });
        return reject(new Error('Ödeme doğrulanamadı'));
      }
      
      // 3D Secure mdStatus kontrolü
      const mdStatus = result.mdStatus;
      const validMdStatuses = ['1', '2', '3', '4']; // Başarılı 3D durumları
      
      if (result.paymentStatus === 'SUCCESS' && validMdStatuses.includes(String(mdStatus))) {
        resolve({
          success: true,
          paymentId: result.paymentId,
          conversationId: result.conversationId,
          amount: parseFloat(result.paidPrice),
          currency: result.currency,
          cardAssociation: result.cardAssociation,
          cardFamily: result.cardFamily,
          lastFourDigits: result.lastFourDigits,
          mdStatus
        });
      } else {
        resolve({
          success: false,
          error: result.errorMessage || 'Ödeme başarısız',
          errorCode: result.errorCode
        });
      }
    });
  });
}

/**
 * İade işlemi (Admin)
 */
export async function refundPayment({ paymentTransactionId, amount, currency }) {
  if (!iyzipay) {
    throw new Error('Iyzico is not configured');
  }

  return new Promise((resolve, reject) => {
    const request = {
      paymentTransactionId,
      price: amount.toFixed(2),
      currency: currency || 'TRY',
      ip: '127.0.0.1'
    };

    iyzipay.refund.create(request, (err, result) => {
      if (err || result.status !== 'success') {
        logger.error('Iyzico refund error', { err, result });
        return reject(new Error(result?.errorMessage || 'İade işlemi başarısız'));
      }
      
      resolve({
        refundId: result.paymentId,
        amount: parseFloat(result.price),
        status: 'success'
      });
    });
  });
}
```

### 1.4 Callback Endpoint (KRİTİK)

**Dosya:** `backend/routes/finances.js`

```javascript
import { verifyPayment } from '../services/paymentGateways/iyzicoGateway.js';

/**
 * Iyzico Callback - Kullanıcı ödeme sonrası buraya yönlendirilir
 */
router.post('/callback/iyzico', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    logger.warn('Iyzico callback: Token eksik');
    return res.redirect(`${process.env.FRONTEND_URL}/wallet?payment=error&reason=missing_token`);
  }
  
  try {
    const result = await verifyPayment(token);
    
    if (result.success) {
      // Başarılı - Frontend'e yönlendir (wallet kredilendirmesi webhook'ta yapılacak)
      const params = new URLSearchParams({
        payment: 'success',
        amount: result.amount,
        currency: result.currency
      });
      
      res.redirect(`${process.env.FRONTEND_URL}/wallet?${params}`);
    } else {
      // Başarısız
      const params = new URLSearchParams({
        payment: 'failed',
        reason: result.error || 'payment_failed'
      });
      
      res.redirect(`${process.env.FRONTEND_URL}/wallet?${params}`);
    }
    
  } catch (error) {
    logger.error('Iyzico callback error', { error: error.message, token });
    res.redirect(`${process.env.FRONTEND_URL}/wallet?payment=error`);
  }
});
```

### 1.5 Webhook Handler Güncelleme

**Dosya:** `backend/services/paymentGatewayWebhookService.js`

```javascript
/**
 * Iyzico webhook event normalize
 */
function normalizeIyzicoEvent({ payload, signature }) {
  const body = ensurePlainObject(payload);
  
  // Webhook olaylarını normalize et
  let eventType = 'payment';
  let status = 'unknown';
  
  if (body.status === 'SUCCESS' || body.paymentStatus === 'SUCCESS') {
    status = 'success';
  } else if (body.status === 'FAILURE' || body.paymentStatus === 'FAILURE') {
    status = 'failed';
  }
  
  return {
    provider: 'iyzico',
    eventType,
    status,
    transactionId: body.paymentId || body.token,
    conversationId: body.conversationId,
    amount: toNumber(body.paidPrice),
    currency: normalizeCurrency(body.currency),
    metadata: {
      cardAssociation: body.cardAssociation,
      cardFamily: body.cardFamily,
      lastFourDigits: body.lastFourDigits,
      mdStatus: body.mdStatus,
      basketId: body.basketId
    }
  };
}
```

---

## 🔒 Faz 2: Güvenlik (2-3 saat)

### 2.1 Rate Limiting

**Dosya:** `backend/routes/wallet.js`

```javascript
import rateLimit from 'express-rate-limit';

// Deposit için rate limit
const depositLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 5, // Max 5 istek
  message: { error: 'Çok fazla ödeme isteği. Lütfen 1 dakika bekleyin.' },
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/deposit', authenticateJWT, depositLimiter, async (req, res) => {
  // ...
});
```

### 2.2 Input Validation

```javascript
import { body, validationResult } from 'express-validator';

const depositValidation = [
  body('amount')
    .isFloat({ min: 10, max: 50000 })
    .withMessage('Tutar 10-50000 arasında olmalıdır'),
  body('currency')
    .isIn(['TRY', 'EUR', 'USD', 'GBP'])
    .withMessage('Geçersiz para birimi'),
  body('gateway')
    .optional()
    .isIn(['stripe', 'iyzico', 'paytr'])
    .withMessage('Geçersiz ödeme yöntemi')
];

router.post('/deposit', 
  authenticateJWT, 
  depositLimiter, 
  depositValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // ...
  }
);
```

### 2.3 Idempotency (Double Spending Prevention)

```javascript
// walletService.js içinde
async function createDepositRequest({ userId, amount, currency, referenceCode, ... }) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Aynı referenceCode ile mevcut işlem var mı?
    if (referenceCode) {
      const existing = await client.query(
        `SELECT id, status FROM wallet_deposit_requests 
         WHERE reference_code = $1 
         AND status IN ('pending', 'processing', 'completed')
         FOR UPDATE`,
        [referenceCode]
      );
      
      if (existing.rows.length > 0) {
        throw new Error('Bu ödeme zaten işleme alındı');
      }
    }
    
    // Deposit request oluştur
    const result = await client.query(
      `INSERT INTO wallet_deposit_requests 
       (user_id, amount, currency, reference_code, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       RETURNING *`,
      [userId, amount, currency, referenceCode]
    );
    
    await client.query('COMMIT');
    return result.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 2.4 IP Extraction

```javascript
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded 
    ? forwarded.split(',')[0].trim() 
    : req.connection?.remoteAddress || req.ip;
  
  // Production'da geçersiz IP kontrolü
  if (process.env.NODE_ENV === 'production' && (!ip || ip === '::1')) {
    logger.warn('Invalid client IP detected', { forwarded, ip });
    // Fallback ama log'a kaydet
  }
  
  return ip || '127.0.0.1';
}
```

---

## 📊 Faz 3: Monitoring (1 saat)

### 3.1 Audit Logging (Mevcut Logger Kullanımı)

```javascript
// Ödeme işlemlerini logla
function logPaymentEvent(action, data) {
  logger.info('Payment event', {
    action,
    userId: data.userId,
    amount: data.amount,
    currency: data.currency,
    gateway: 'iyzico',
    status: data.status,
    transactionId: data.transactionId,
    ip: data.clientIp,
    timestamp: new Date().toISOString()
  });
}

// Kullanım
logPaymentEvent('deposit_initiated', { userId, amount, currency, clientIp });
logPaymentEvent('deposit_completed', { userId, amount, currency, transactionId });
logPaymentEvent('deposit_failed', { userId, amount, currency, error });
```

### 3.2 Slack Alerting (Kritik Hatalar)

```javascript
// backend/services/alertService.js
import Slack from '@slack/webhook';

const slackWebhook = process.env.SLACK_WEBHOOK_URL 
  ? new Slack.IncomingWebhook(process.env.SLACK_WEBHOOK_URL)
  : null;

export async function sendPaymentAlert(type, data) {
  if (!slackWebhook) return;
  
  const messages = {
    'payment_failed': `⚠️ Ödeme Başarısız\nUser: ${data.userId}\nAmount: ${data.amount} ${data.currency}\nError: ${data.error}`,
    'refund_requested': `💰 İade Talebi\nUser: ${data.userId}\nAmount: ${data.amount} ${data.currency}`,
    'suspicious_activity': `🚨 Şüpheli Aktivite\nUser: ${data.userId}\nDetails: ${data.details}`
  };
  
  try {
    await slackWebhook.send({ text: messages[type] || `Payment alert: ${type}` });
  } catch (err) {
    logger.error('Slack alert failed', { err });
  }
}
```

---

## 🖥️ Faz 4: Frontend (1.5 saat)

### 4.1 Checkout Component

**Dosya:** `src/features/wallet/components/IyzicoCheckout.jsx`

```jsx
import { useEffect, useState } from 'react';

export function IyzicoCheckout({ checkoutFormContent, paymentPageUrl, onClose }) {
  const [isSafari, setIsSafari] = useState(false);
  
  useEffect(() => {
    // Safari detection (iframe issues)
    const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    setIsSafari(isSafariBrowser);
  }, []);
  
  if (isSafari && paymentPageUrl) {
    return (
      <div className="p-6 text-center">
        <p className="mb-4">Ödeme sayfasına yönlendiriliyorsunuz...</p>
        <button 
          onClick={() => window.location.href = paymentPageUrl}
          className="btn btn-primary"
        >
          Ödeme Sayfasına Git
        </button>
      </div>
    );
  }
  
  return (
    <div className="relative">
      <button 
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
      >
        ✕
      </button>
      <iframe 
        srcDoc={checkoutFormContent}
        className="w-full h-[600px] border-0"
        title="Iyzico Ödeme"
      />
    </div>
  );
}
```

### 4.2 Deposit Page Güncelleme

```jsx
// src/features/wallet/pages/DepositPage.jsx
import { IyzicoCheckout } from '../components/IyzicoCheckout';

function DepositPage() {
  const [iyzicoData, setIyzicoData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const handleIyzicoDeposit = async () => {
    setLoading(true);
    try {
      const response = await apiClient.post('/wallet/deposit', {
        amount,
        currency,
        gateway: 'iyzico'
      });
      
      setIyzicoData(response.data);
    } catch (error) {
      toast.error(error.message || 'Ödeme başlatılamadı');
    } finally {
      setLoading(false);
    }
  };
  
  if (iyzicoData) {
    return (
      <IyzicoCheckout 
        checkoutFormContent={iyzicoData.checkoutFormContent}
        paymentPageUrl={iyzicoData.paymentPageUrl}
        onClose={() => setIyzicoData(null)}
      />
    );
  }
  
  // Normal deposit form...
}
```

---

## ✅ Faz 5: Test & Production (2 saat)

### 5.1 Test Kartları

| Kart No | Sonuç | CVV | SKT |
|---------|-------|-----|-----|
| `5528790000000008` | ✅ Başarılı | 123 | 12/30 |
| `5528790000000016` | ❌ Yetersiz bakiye | 123 | 12/30 |
| `4766620000000001` | ✅ 3D Secure | 123 | 12/30 |

### 5.2 Test Senaryoları (10 Kritik)

1. ✅ Başarılı ödeme → Wallet kredilenmeli
2. ✅ Başarısız ödeme → Hata mesajı gösterilmeli
3. ✅ Eksik kullanıcı bilgisi → Profil uyarısı
4. ✅ Rate limit aşımı → 429 hatası
5. ✅ Double submission → Engellenmeli
6. ✅ Safari browser → Redirect çalışmalı
7. ✅ 3D Secure akışı → Tamamlanmalı
8. ✅ Callback token eksik → Error redirect
9. ✅ Session timeout → Yeniden başlatma
10. ✅ Currency conversion (TR user + EUR)

### 5.3 Production Checklist

```markdown
## Pre-Production

- [ ] Iyzico Merchant Panel'de Callback URL tanımlandı
- [ ] Production API key ve secret alındı
- [ ] `IYZICO_TEST_MODE=false` yapıldı
- [ ] `IYZICO_BASE_URL=https://api.iyzipay.com` ayarlandı
- [ ] SSL sertifikası geçerli
- [ ] Rate limiting aktif
- [ ] Error logging çalışıyor
- [ ] Slack alerting test edildi

## Post-Production

- [ ] Test kartıyla gerçek ödeme test edildi (düşük tutar)
- [ ] Webhook'lar düzgün geliyor
- [ ] Wallet kredilendirmesi çalışıyor
- [ ] Refund test edildi
```

### 5.4 Iyzico Merchant Panel Ayarları

1. **Webhook URL:** `https://yourdomain.com/api/webhooks/iyzico`
2. **Callback URL:** `https://yourdomain.com/api/finances/callback/iyzico`
3. **Notification Email:** `alerts@yourdomain.com`

---

## 📁 Değiştirilecek Dosyalar

| # | Dosya | İşlem | Süre |
|---|-------|-------|------|
| 1 | `backend/package.json` | ➕ iyzipay, @slack/webhook | 5 dk |
| 2 | `backend/.env` | ✏️ Credentials ekleme | 5 dk |
| 3 | `backend/services/paymentGateways/iyzicoGateway.js` | 🔄 Yeniden yazma | 2 saat |
| 4 | `backend/routes/finances.js` | ➕ Callback endpoint | 30 dk |
| 5 | `backend/routes/wallet.js` | ✏️ Rate limit + validation | 30 dk |
| 6 | `backend/services/walletService.js` | ✏️ Idempotency | 30 dk |
| 7 | `backend/services/paymentGatewayWebhookService.js` | ✏️ Normalize | 30 dk |
| 8 | `backend/services/alertService.js` | ➕ Yeni dosya | 20 dk |
| 9 | `src/features/wallet/components/IyzicoCheckout.jsx` | ➕ Yeni component | 30 dk |
| 10 | `src/features/wallet/pages/DepositPage.jsx` | ✏️ Integration | 30 dk |

**Toplam: 10 dosya (3 yeni, 7 güncelleme)**

---

## ⏱️ Zaman Özeti

| Faz | Süre | Öncelik |
|-----|------|---------|
| **Faz 1:** Temel Entegrasyon | 4-5 saat | 🔴 Kritik |
| **Faz 2:** Güvenlik | 2-3 saat | 🔴 Kritik |
| **Faz 3:** Monitoring | 1 saat | 🟡 Önemli |
| **Faz 4:** Frontend | 1.5 saat | 🟢 Normal |
| **Faz 5:** Test & Production | 2 saat | 🔴 Kritik |
| **TOPLAM** | **10-12 saat** | |

---

## 🚫 ÇIKARILAN MADDELER (v1'den)

| Madde | Neden Çıkarıldı |
|-------|-----------------|
| KYC Limits System | Iyzico kendi KYC'sini yapıyor |
| Daily Reconciliation Cron | Manuel tool yeterli, Iyzico dashboard var |
| Prometheus Metrics | Mevcut monitoring yeterli, ileride eklenebilir |
| Swagger Documentation | Postman collection yeterli |
| BIGINT Migration | NUMERIC(15,2) daha pratik |
| Winston Daily Rotate | Mevcut logger yeterli |
| Chargeback Auto-Processing | Çok nadir, manuel handle |
| Network Partition Handling | Standard timeout yeterli |
| Database Partitioning | Premature optimization |

---

## 📌 Sonuç

**v1:** 35 dosya, 55 feature, 16-20 saat
**v2:** 10 dosya, 15 feature, 10-12 saat

**Kazanç:** %40 daha az iş, aynı güvenlik seviyesi

> "Premature optimization is the root of all evil" - Donald Knuth

Temel entegrasyon çalıştıktan sonra, ihtiyaç halinde ek featureler eklenebilir.

---

## 📞 Kaynaklar

- **Iyzico Docs:** https://dev.iyzipay.com/
- **Test Kartları:** https://dev.iyzipay.com/tr/test-kartlari
- **Merchant Panel:** https://merchant.iyzipay.com/
