import cron from 'node-cron';
import { recordPwsReading } from '../services/weather/index.js';
import { logger } from '../middlewares/errorHandler.js';

/**
 * Poll UKC's live Weather Underground PWS every few minutes and append the reading to
 * wind_history, so the wind-report page can draw a continuous, never-deleted history.
 *
 * Offline ticks are skipped (no row is inserted), which leaves a Windguru-style gap in
 * the series until the station comes back online. Recording is idempotent on the
 * observation timestamp, so overlapping ticks never create duplicates.
 *
 * NOTE: history only accrues while the backend process is running — i.e. in production
 * after deploy (or a long-running local backend). It starts empty and fills over time.
 */
const SCHEDULE_EXPRESSION = process.env.WIND_HISTORY_CRON || '*/5 * * * *';

export async function runWindHistoryTick() {
  const result = await recordPwsReading();
  if (result.recorded) {
    logger.info('Wind history tick recorded', { observedAt: result.observedAt });
  }
  return result;
}

let scheduledTask = null;

export function startWindHistoryRecorderJob() {
  if (scheduledTask) {
    logger.warn('Wind history recorder job is already running');
    return scheduledTask;
  }

  scheduledTask = cron.schedule(SCHEDULE_EXPRESSION, () => {
    runWindHistoryTick().catch((error) => {
      logger.error('Wind history recorder: unhandled error in tick', { error: error.message });
    });
  });

  logger.info('Wind history recorder cron job scheduled', { expression: SCHEDULE_EXPRESSION });
  return scheduledTask;
}

export function stopWindHistoryRecorderJob() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Wind history recorder cron job stopped');
  }
}

export default {
  startWindHistoryRecorderJob,
  stopWindHistoryRecorderJob,
  runWindHistoryTick,
};
