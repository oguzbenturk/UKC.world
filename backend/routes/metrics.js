import { Router } from 'express';
import notificationMetrics from '../services/metrics/notificationMetrics.js';
import { getPrometheusMetrics, prometheusRegistry } from '../services/metrics/prometheusMetrics.js';

const metricsRouter = Router();

metricsRouter.get('/prometheus', async (_req, res, next) => {
  try {
    const metrics = await getPrometheusMetrics();
    res.set('Content-Type', prometheusRegistry.contentType);
    res.send(metrics);
  } catch (error) {
    next(error);
  }
});

metricsRouter.get('/notifications/snapshot', (_req, res) => {
  res.json(notificationMetrics.snapshot());
});

export default metricsRouter;
