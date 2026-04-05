/**
 * Alert Service - Slack ve diğer bildirim kanalları için
 * Kritik ödeme olaylarında alert gönderir
 */

import { IncomingWebhook } from '@slack/webhook';
import { logger } from '../middlewares/errorHandler.js';

// Slack webhook (opsiyonel - .env'de yoksa disable)
const slackWebhook = process.env.SLACK_WEBHOOK_URL 
  ? new IncomingWebhook(process.env.SLACK_WEBHOOK_URL)
  : null;

// Alert mesaj şablonları
const alertTemplates = {
  payment_failed: (data) => ({
    text: `⚠️ *Ödeme Başarısız*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚠️ *Ödeme Başarısız*\n\n` +
            `• *Kullanıcı:* ${data.userId}\n` +
            `• *Email:* ${data.email || 'N/A'}\n` +
            `• *Tutar:* ${data.amount} ${data.currency}\n` +
            `• *Gateway:* ${data.gateway || 'iyzico'}\n` +
            `• *Hata:* ${data.error}\n` +
            `• *IP:* ${data.clientIp || 'N/A'}\n` +
            `• *Zaman:* ${new Date().toLocaleString('tr-TR')}`
        }
      }
    ]
  }),
  
  refund_requested: (data) => ({
    text: `💰 *İade Talebi*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💰 *İade Talebi*\n\n` +
            `• *Kullanıcı:* ${data.userId}\n` +
            `• *Tutar:* ${data.amount} ${data.currency}\n` +
            `• *İşlem ID:* ${data.transactionId || 'N/A'}\n` +
            `• *Sebep:* ${data.reason || 'Belirtilmedi'}\n` +
            `• *Zaman:* ${new Date().toLocaleString('tr-TR')}`
        }
      }
    ]
  }),
  
  suspicious_activity: (data) => ({
    text: `🚨 *Şüpheli Aktivite Tespit Edildi*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚨 *Şüpheli Aktivite*\n\n` +
            `• *Kullanıcı:* ${data.userId}\n` +
            `• *Tip:* ${data.type || 'Bilinmiyor'}\n` +
            `• *Detay:* ${data.details}\n` +
            `• *IP:* ${data.clientIp || 'N/A'}\n` +
            `• *Zaman:* ${new Date().toLocaleString('tr-TR')}`
        }
      }
    ]
  }),
  
  rate_limit_exceeded: (data) => ({
    text: `🛑 *Rate Limit Aşıldı*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🛑 *Rate Limit Aşıldı*\n\n` +
            `• *Kullanıcı:* ${data.userId || 'N/A'}\n` +
            `• *IP:* ${data.clientIp}\n` +
            `• *Endpoint:* ${data.endpoint}\n` +
            `• *Deneme Sayısı:* ${data.attempts || 'N/A'}\n` +
            `• *Zaman:* ${new Date().toLocaleString('tr-TR')}`
        }
      }
    ]
  }),
  
  large_transaction: (data) => ({
    text: `💸 *Yüksek Tutarlı İşlem*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💸 *Yüksek Tutarlı İşlem*\n\n` +
            `• *Kullanıcı:* ${data.userId}\n` +
            `• *Email:* ${data.email || 'N/A'}\n` +
            `• *Tutar:* ${data.amount} ${data.currency}\n` +
            `• *Tip:* ${data.type || 'deposit'}\n` +
            `• *IP:* ${data.clientIp || 'N/A'}\n` +
            `• *Zaman:* ${new Date().toLocaleString('tr-TR')}`
        }
      }
    ]
  }),
  
  payment_success: (data) => ({
    text: `✅ *Ödeme Başarılı*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *Ödeme Başarılı*\n\n` +
            `• *Kullanıcı:* ${data.userId}\n` +
            `• *Tutar:* ${data.amount} ${data.currency}\n` +
            `• *İşlem ID:* ${data.transactionId || 'N/A'}\n` +
            `• *Zaman:* ${new Date().toLocaleString('tr-TR')}`
        }
      }
    ]
  })
};

/**
 * Slack'e alert gönder
 * @param {string} type - Alert tipi (payment_failed, refund_requested, etc.)
 * @param {object} data - Alert verisi
 */
export async function sendPaymentAlert(type, data) {
  // Slack webhook yoksa sessizce çık
  if (!slackWebhook) {
    logger.debug('Slack webhook not configured, skipping alert', { type });
    return;
  }
  
  try {
    const template = alertTemplates[type];
    if (!template) {
      logger.warn('Unknown alert type', { type });
      await slackWebhook.send({ 
        text: `📢 Payment Alert: ${type}\n${JSON.stringify(data, null, 2)}` 
      });
      return;
    }
    
    const message = template(data);
    await slackWebhook.send(message);
    
    logger.info('Slack alert sent', { type, userId: data.userId });
  } catch (err) {
    // Slack hatası ödeme işlemini engellememelidir
    logger.error('Slack alert failed', { 
      type, 
      error: err.message,
      userId: data.userId 
    });
  }
}

/**
 * Ödeme olayını logla (audit trail)
 * @param {string} action - İşlem tipi
 * @param {object} data - İşlem verisi
 */
export function logPaymentEvent(action, data) {
  const logData = {
    action,
    userId: data.userId,
    email: data.email,
    amount: data.amount,
    currency: data.currency,
    gateway: data.gateway || 'iyzico',
    status: data.status,
    transactionId: data.transactionId,
    referenceCode: data.referenceCode,
    ip: data.clientIp,
    userAgent: data.userAgent,
    timestamp: new Date().toISOString()
  };
  
  // Hassas verileri çıkar
  delete logData.cardNumber;
  delete logData.cvv;
  delete logData.cardToken;
  
  // Log seviyesini duruma göre ayarla
  if (action.includes('failed') || action.includes('error')) {
    logger.error('Payment event', logData);
  } else if (action.includes('suspicious') || action.includes('blocked')) {
    logger.warn('Payment event', logData);
  } else {
    logger.info('Payment event', logData);
  }
  
  return logData;
}

/**
 * Şüpheli aktivite kontrolü
 * @param {object} data - Kontrol edilecek veri
 * @returns {boolean} - Şüpheli mi?
 */
export function checkSuspiciousActivity(data) {
  const suspicious = [];
  
  // Çok yüksek tutar
  if (data.amount > 10000) {
    suspicious.push('high_amount');
  }
  
  // Kısa sürede çok fazla işlem (rate limiter'a ek olarak)
  if (data.recentTransactionCount > 5) {
    suspicious.push('high_frequency');
  }
  
  // Farklı IP'lerden aynı kullanıcı
  if (data.differentIpCount > 3) {
    suspicious.push('multiple_ips');
  }
  
  if (suspicious.length > 0) {
    sendPaymentAlert('suspicious_activity', {
      ...data,
      type: suspicious.join(', '),
      details: `Suspicious patterns detected: ${suspicious.join(', ')}`
    });
    
    logPaymentEvent('suspicious_detected', {
      ...data,
      suspiciousPatterns: suspicious
    });
    
    return true;
  }
  
  return false;
}

// Large transaction threshold (alert gönderilecek minimum tutar)
const LARGE_TRANSACTION_THRESHOLD = {
  TRY: 5000,
  EUR: 200,
  USD: 200,
  GBP: 200
};

/**
 * Yüksek tutarlı işlem kontrolü
 * @param {object} data - İşlem verisi
 */
export function checkLargeTransaction(data) {
  const threshold = LARGE_TRANSACTION_THRESHOLD[data.currency] || 5000;
  
  if (data.amount >= threshold) {
    sendPaymentAlert('large_transaction', data);
    logPaymentEvent('large_transaction_detected', data);
  }
}

export default {
  sendPaymentAlert,
  logPaymentEvent,
  checkSuspiciousActivity,
  checkLargeTransaction
};
