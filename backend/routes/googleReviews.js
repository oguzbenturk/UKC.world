import express from 'express';
import axios from 'axios';
import { cacheService } from '../services/cacheService.js';

const router = express.Router();

const CACHE_KEY = 'google:place:reviews';
const CACHE_TTL = 60 * 60; // 1 hour

/**
 * GET /api/google-reviews
 * Returns up to 5 Google Place reviews for the business.
 * Cached in Redis for 1 hour to avoid hammering the Places API.
 * Requires GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID in env.
 */
router.get('/', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    const placeId = process.env.GOOGLE_PLACE_ID;

    if (!apiKey || !placeId) {
      return res.status(503).json({ error: 'Google Reviews not configured' });
    }

    // Try cache first
    const cached = await cacheService.get(CACHE_KEY);
    if (cached) {
      return res.json(cached);
    }

    // Fetch from Google Places API (v1 — Places Details)
    const { data } = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: placeId,
          fields: 'name,rating,user_ratings_total,reviews,url',
          language: 'en',
          key: apiKey,
        },
        timeout: 8000,
      }
    );

    if (data.status !== 'OK' || !data.result) {
      return res.status(502).json({ error: `Google API error: ${data.status}` });
    }

    const { name, rating, user_ratings_total, reviews = [], url } = data.result;

    const payload = {
      name,
      rating,
      totalReviews: user_ratings_total,
      googleUrl: url,
      reviews: (reviews || [])
        .filter(r => r.rating >= 4) // Only show 4-5 star reviews
        .sort((a, b) => b.time - a.time)
        .slice(0, 5)
        .map(r => ({
          author: r.author_name,
          avatar: r.profile_photo_url || null,
          rating: r.rating,
          text: r.text,
          relativeTime: r.relative_time_description,
          time: r.time,
        })),
    };

    await cacheService.set(CACHE_KEY, payload, CACHE_TTL);

    return res.json(payload);
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Google API timed out' });
    }
    console.error('[googleReviews] fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

export default router;
