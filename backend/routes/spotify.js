import express from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { logger } from '../middlewares/errorHandler.js';
import { cacheService } from '../services/cacheService.js';
import {
  isSpotifyConfigured,
  buildAuthUrl,
  exchangeCodeForTokens,
  saveTokens,
  deleteTokens,
  getStoredTokens,
  spotifyFetch
} from '../services/spotifyService.js';

const router = express.Router();

// OAuth state is stored in Redis so it survives restarts and works across
// multiple backend processes. An in-memory Map mirrors writes as a fallback
// for environments where Redis is disabled (DISABLE_REDIS=true) or unreachable.
const stateStore = new Map();
const STATE_TTL_SEC = 10 * 60;
const stateKey = (s) => `spotify:oauth:state:${s}`;

const issueState = async (userId) => {
  const state = crypto.randomBytes(16).toString('hex');
  const entry = { userId, createdAt: Date.now() };

  await cacheService.set(stateKey(state), entry, STATE_TTL_SEC);

  stateStore.set(state, entry);
  for (const [k, v] of stateStore.entries()) {
    if (Date.now() - v.createdAt > STATE_TTL_SEC * 1000) stateStore.delete(k);
  }
  return state;
};

const consumeState = async (state) => {
  const fromRedis = await cacheService.get(stateKey(state));
  if (fromRedis) {
    await cacheService.del(stateKey(state));
    stateStore.delete(state);
    return fromRedis;
  }
  const entry = stateStore.get(state);
  if (!entry) return null;
  stateStore.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_SEC * 1000) return null;
  return entry;
};

// Public callback — Spotify redirects the browser here with ?code & ?state.
router.get('/callback', async (req, res) => {
  try {
    if (!isSpotifyConfigured()) {
      return res.status(503).json({ error: 'Spotify is not configured' });
    }
    const { code, state, error } = req.query;
    if (error) return res.status(400).json({ error: String(error) });
    if (!code || !state) return res.status(400).json({ error: 'Missing code or state' });

    const stateEntry = await consumeState(String(state));
    if (!stateEntry) return res.status(400).json({ error: 'Invalid or expired state' });

    const tokenResponse = await exchangeCodeForTokens(String(code));
    const profile = await saveTokens({ tokenResponse, linkedByUserId: stateEntry.userId });

    res.json({
      ok: true,
      profile: profile
        ? {
            id: profile.id,
            displayName: profile.display_name,
            email: profile.email,
            product: profile.product,
            avatarUrl: profile.images?.[0]?.url || null
          }
        : null
    });
  } catch (err) {
    logger.error('Spotify callback failed', { error: err.message, status: err.status });
    return res.status(err.status === 403 ? 403 : 500).json({ error: err.message || 'Spotify callback failed' });
  }
});

router.use(authenticateJWT);

router.get('/auth-url', async (req, res) => {
  try {
    if (!isSpotifyConfigured()) {
      return res.status(503).json({ error: 'Spotify is not configured' });
    }
    const state = await issueState(req.user.id);
    res.json({ url: buildAuthUrl(state), state });
  } catch (err) {
    logger.error('Spotify auth-url failed', { error: err.message });
    res.status(500).json({ error: 'Failed to start Spotify OAuth' });
  }
});

router.get('/status', async (req, res) => {
  try {
    if (!isSpotifyConfigured()) {
      return res.json({ configured: false, connected: false });
    }
    const tokens = await getStoredTokens();
    if (!tokens) return res.json({ configured: true, connected: false });

    // Legacy/broken rows: tokens row was saved before we required a successful
    // /me fetch, so spotify_user_id is null. Treat as disconnected so the UI
    // shows the Connect button again instead of an empty "connected" state.
    if (!tokens.spotify_user_id) {
      await deleteTokens();
      return res.json({
        configured: true,
        connected: false,
        warning: 'Previous Spotify connection was incomplete and has been cleared. Please reconnect.'
      });
    }

    res.json({
      configured: true,
      connected: true,
      profile: {
        id: tokens.spotify_user_id,
        displayName: tokens.display_name,
        email: tokens.email,
        product: tokens.product,
        avatarUrl: tokens.avatar_url
      }
    });
  } catch (err) {
    logger.error('Spotify status failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load Spotify status' });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    await deleteTokens();
    res.json({ ok: true });
  } catch (err) {
    logger.error('Spotify disconnect failed', { error: err.message });
    res.status(500).json({ error: 'Failed to disconnect Spotify' });
  }
});

router.get('/now-playing', async (req, res) => {
  try {
    const data = await spotifyFetch('/me/player/currently-playing');
    res.json(data || { is_playing: false });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ error: 'Spotify not connected' });
    logger.error('Spotify now-playing failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch now playing' });
  }
});

router.post('/play', async (req, res) => {
  try {
    const { device_id } = req.body || {};
    const query = device_id ? `?device_id=${encodeURIComponent(device_id)}` : '';
    await spotifyFetch(`/me/player/play${query}`, { method: 'PUT' });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/pause', async (req, res) => {
  try {
    const { device_id } = req.body || {};
    const query = device_id ? `?device_id=${encodeURIComponent(device_id)}` : '';
    await spotifyFetch(`/me/player/pause${query}`, { method: 'PUT' });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/next', async (req, res) => {
  try {
    await spotifyFetch('/me/player/next', { method: 'POST' });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/previous', async (req, res) => {
  try {
    await spotifyFetch('/me/player/previous', { method: 'POST' });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/volume', async (req, res) => {
  try {
    const { volume } = req.body || {};
    const v = Math.max(0, Math.min(100, parseInt(volume, 10)));
    if (Number.isNaN(v)) return res.status(400).json({ error: 'Invalid volume' });
    await spotifyFetch(`/me/player/volume?volume_percent=${v}`, { method: 'PUT' });
    res.json({ ok: true, volume: v });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/seek', async (req, res) => {
  try {
    const { position_ms } = req.body || {};
    const pos = parseInt(position_ms, 10);
    if (Number.isNaN(pos) || pos < 0) return res.status(400).json({ error: 'Invalid position_ms' });
    await spotifyFetch(`/me/player/seek?position_ms=${pos}`, { method: 'PUT' });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/devices', async (req, res) => {
  try {
    const data = await spotifyFetch('/me/player/devices');
    res.json(data || { devices: [] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/transfer', async (req, res) => {
  try {
    const { device_id, play } = req.body || {};
    if (!device_id) return res.status(400).json({ error: 'device_id required' });
    await spotifyFetch('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [device_id], play: Boolean(play) })
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/playlists', async (req, res) => {
  try {
    const data = await spotifyFetch('/me/playlists?limit=50');
    res.json(data || { items: [] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/play-playlist', async (req, res) => {
  try {
    const { playlist_uri, device_id } = req.body || {};
    if (!playlist_uri) return res.status(400).json({ error: 'playlist_uri required' });
    const query = device_id ? `?device_id=${encodeURIComponent(device_id)}` : '';
    await spotifyFetch(`/me/player/play${query}`, {
      method: 'PUT',
      body: JSON.stringify({ context_uri: playlist_uri })
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/schedules', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, playlist_uri, playlist_name, device_id, device_name,
              scheduled_time, repeat_mode, is_active, last_triggered_at, created_at
         FROM spotify_schedules
        WHERE user_id = $1
        ORDER BY scheduled_time ASC`,
      [req.user.id]
    );
    res.json({ schedules: result.rows });
  } catch (err) {
    logger.error('Spotify schedules list failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load schedules' });
  }
});

router.post('/schedule', async (req, res) => {
  try {
    const {
      playlist_uri,
      playlist_name,
      device_id,
      device_name,
      scheduled_time,
      repeat_mode
    } = req.body || {};

    if (!playlist_uri || !scheduled_time) {
      return res.status(400).json({ error: 'playlist_uri and scheduled_time are required' });
    }
    if (!/^\d{2}:\d{2}$/.test(scheduled_time)) {
      return res.status(400).json({ error: 'scheduled_time must be HH:MM' });
    }
    const mode = repeat_mode || 'once';
    if (!['once', 'daily', 'weekdays', 'weekends'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid repeat_mode' });
    }

    const result = await pool.query(
      `INSERT INTO spotify_schedules
         (user_id, playlist_uri, playlist_name, device_id, device_name,
          scheduled_time, repeat_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, playlist_uri, playlist_name, device_id, device_name,
                 scheduled_time, repeat_mode, is_active, last_triggered_at, created_at`,
      [
        req.user.id,
        playlist_uri,
        playlist_name || null,
        device_id || null,
        device_name || null,
        scheduled_time,
        mode
      ]
    );
    res.status(201).json({ schedule: result.rows[0] });
  } catch (err) {
    logger.error('Spotify schedule create failed', { error: err.message });
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

router.delete('/schedule/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM spotify_schedules WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Spotify schedule delete failed', { error: err.message });
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

router.post('/schedule/:id/triggered', async (req, res) => {
  try {
    await pool.query(
      'UPDATE spotify_schedules SET last_triggered_at = NOW() WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark schedule as triggered' });
  }
});

export default router;
