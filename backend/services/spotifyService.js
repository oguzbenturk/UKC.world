import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'streaming',
  'user-read-email',
  'user-read-private'
].join(' ');

export const isSpotifyConfigured = () =>
  Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

const basicAuthHeader = () => {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
};

export const buildAuthUrl = (state) => {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    state
  });
  return `${SPOTIFY_ACCOUNTS}/authorize?${params.toString()}`;
};

export const exchangeCodeForTokens = async (code) => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI
  });
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
};

const refreshAccessToken = async (refreshToken) => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
};

const fetchSpotifyProfile = async (accessToken) => {
  const res = await fetch(`${SPOTIFY_API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    // Bubble the real reason up instead of returning null and storing broken
    // tokens. Most common cause is Spotify Developer Dashboard "Development
    // Mode" — only allowlisted Spotify accounts can complete the OAuth grant
    // beyond the basic token exchange, so /me returns 403.
    const text = await res.text();
    const err = new Error(
      res.status === 403
        ? 'This Spotify account is not authorised on the Plannivo Spotify app. ' +
          'Add it under "Users and Access" in https://developer.spotify.com/dashboard ' +
          '(Development mode allows up to 25 users), or request Extended Quota Mode.'
        : `Spotify profile fetch failed: ${res.status} ${text || res.statusText}`
    );
    err.status = res.status;
    throw err;
  }
  return res.json();
};

export const saveTokens = async ({ tokenResponse, linkedByUserId }) => {
  const expiresAt = new Date(Date.now() + (tokenResponse.expires_in - 60) * 1000);
  // Throws on failure — caller is responsible for surfacing the message; we
  // refuse to save tokens we can't even read /me with, since the downstream
  // /playlists, /devices etc. calls would all fail the same way.
  const profile = await fetchSpotifyProfile(tokenResponse.access_token);

  const existing = await pool.query('SELECT id FROM spotify_tokens LIMIT 1');
  if (existing.rowCount > 0) {
    await pool.query(
      `UPDATE spotify_tokens
         SET access_token = $1,
             refresh_token = COALESCE($2, refresh_token),
             expires_at = $3,
             scope = $4,
             spotify_user_id = $5,
             display_name = $6,
             email = $7,
             product = $8,
             avatar_url = $9,
             linked_by_user_id = $10,
             updated_at = NOW()
       WHERE id = $11`,
      [
        tokenResponse.access_token,
        tokenResponse.refresh_token || null,
        expiresAt,
        tokenResponse.scope || SPOTIFY_SCOPES,
        profile?.id || null,
        profile?.display_name || null,
        profile?.email || null,
        profile?.product || null,
        profile?.images?.[0]?.url || null,
        linkedByUserId || null,
        existing.rows[0].id
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO spotify_tokens
         (access_token, refresh_token, expires_at, scope, spotify_user_id,
          display_name, email, product, avatar_url, linked_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        tokenResponse.access_token,
        tokenResponse.refresh_token,
        expiresAt,
        tokenResponse.scope || SPOTIFY_SCOPES,
        profile?.id || null,
        profile?.display_name || null,
        profile?.email || null,
        profile?.product || null,
        profile?.images?.[0]?.url || null,
        linkedByUserId || null
      ]
    );
  }
  return profile;
};

export const deleteTokens = async () => {
  await pool.query('DELETE FROM spotify_tokens');
};

export const getStoredTokens = async () => {
  const result = await pool.query(
    `SELECT id, access_token, refresh_token, expires_at, spotify_user_id,
            display_name, email, product, avatar_url
       FROM spotify_tokens
       ORDER BY id DESC
       LIMIT 1`
  );
  return result.rows[0] || null;
};

export const getValidAccessToken = async () => {
  const row = await getStoredTokens();
  if (!row) return null;

  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt > Date.now() + 30 * 1000) {
    return row.access_token;
  }

  try {
    const refreshed = await refreshAccessToken(row.refresh_token);
    const newExpiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000);
    await pool.query(
      `UPDATE spotify_tokens
          SET access_token = $1,
              refresh_token = COALESCE($2, refresh_token),
              expires_at = $3,
              scope = COALESCE($4, scope),
              updated_at = NOW()
        WHERE id = $5`,
      [
        refreshed.access_token,
        refreshed.refresh_token || null,
        newExpiresAt,
        refreshed.scope || null,
        row.id
      ]
    );
    return refreshed.access_token;
  } catch (err) {
    logger.error('Spotify token refresh failed', { error: err.message });
    return null;
  }
};

export const spotifyFetch = async (path, options = {}) => {
  const token = await getValidAccessToken();
  if (!token) {
    const err = new Error('Spotify not connected');
    err.status = 401;
    throw err;
  }

  const url = path.startsWith('http') ? path : `${SPOTIFY_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (res.status === 204) return null;

  const text = await res.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;

  if (!res.ok) {
    const err = new Error(json?.error?.message || `Spotify API error: ${res.status}`);
    err.status = res.status;
    err.spotifyError = json?.error || json;
    throw err;
  }

  return json;
};
