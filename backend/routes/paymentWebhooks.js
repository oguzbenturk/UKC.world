import express from 'express';

import {
  handleStripeWebhook,
  handleIyzicoWebhook,
  handlePaytrWebhook,
  handleBinancePayWebhook
} from '../services/paymentGatewayWebhookService.js';

const router = express.Router();

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function parseBody(body) {
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch (error) {
      return {};
    }
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      return {};
    }
  }

  if (body && typeof body === 'object') {
    return body;
  }

  return {};
}

function buildContext(req) {
  const rawBody = typeof req.rawBody === 'string'
    ? req.rawBody
    : Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : JSON.stringify(req.body ?? {});

  return {
    payload: parseBody(req.body),
    headers: req.headers,
    signature: req.headers['stripe-signature'] || req.headers['x-signature'] || null,
    rawBody,
    query: req.query
  };
}

function sendAcknowledgement(res, result) {
  const statusCode = Number.isInteger(result?.statusCode) ? result.statusCode : 202;
  res.status(statusCode).json(result);
}

router.post(
  '/stripe',
  asyncHandler(async (req, res) => {
    const result = await handleStripeWebhook(buildContext(req));
    sendAcknowledgement(res, result);
  })
);

router.post(
  '/iyzico',
  asyncHandler(async (req, res) => {
    const result = await handleIyzicoWebhook(buildContext(req));
    sendAcknowledgement(res, result);
  })
);

router.post(
  '/paytr',
  asyncHandler(async (req, res) => {
    const result = await handlePaytrWebhook(buildContext(req));
    sendAcknowledgement(res, result);
  })
);

router.post(
  '/binance-pay',
  asyncHandler(async (req, res) => {
    const result = await handleBinancePayWebhook(buildContext(req));
    sendAcknowledgement(res, result);
  })
);

export default router;
