import { Router } from 'express';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import {
  getWorkerState,
  drainWorker,
  initializeWorkerState
} from '../services/notificationWorkerState.js';

const router = Router();
const authorizeOps = authorizeRoles(['admin', 'manager', 'developer']);
const drainSecret = process.env.NOTIFICATION_WORKER_DRAIN_SECRET || null;

function ensureWorkerAccess(req, res, next) {
  if (drainSecret && req.headers['x-worker-drain-secret'] === drainSecret) {
    return next();
  }
  return authenticateJWT(req, res, () => authorizeOps(req, res, next));
}

router.get('/state', ensureWorkerAccess, (_req, res) => {
  res.json({
    ok: true,
    worker: getWorkerState()
  });
});

router.post('/drain', ensureWorkerAccess, async (req, res, next) => {
  try {
    const timeoutMs = Number.isFinite(Number(req.body?.timeoutMs))
      ? Number(req.body.timeoutMs)
      : undefined;
    const state = await drainWorker({ timeoutMs });
    res.json({ ok: true, worker: state });
  } catch (error) {
    next(error);
  }
});

// Ensure worker state logs on module load when router initialized
initializeWorkerState();

export default router;
