import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spin, Alert, Button } from 'antd';
import apiClient from '@/shared/services/apiClient';
import { logger } from '@/shared/utils/logger';

export default function SpotifyCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!code || !state) {
      setError('Missing code or state');
      return;
    }

    const finalize = async () => {
      try {
        await apiClient.get('/spotify/callback', { params: { code, state } });
        setDone(true);
        if (window.opener) {
          try {
            // '*' is fine here — payload carries no sensitive data; tokens are stored server-side.
            // Needed because dev parent (localhost) and callback (127.0.0.1) have different origins.
            window.opener.postMessage({ type: 'spotify:connected' }, '*');
          } catch {
            /* ignore */
          }
          setTimeout(() => window.close(), 600);
        } else {
          setTimeout(() => navigate('/settings?tab=music', { replace: true }), 800);
        }
      } catch (err) {
        logger.error('Spotify callback failed', { error: String(err) });
        setError(err?.response?.data?.error || err?.message || 'Spotify connection failed');
      }
    };
    finalize();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="max-w-md w-full">
        {error ? (
          <Alert
            type="error"
            showIcon
            message="Spotify connection failed"
            description={error}
            action={<Button onClick={() => navigate('/settings?tab=music')}>Back to settings</Button>}
            className="rounded-lg"
          />
        ) : done ? (
          <Alert
            type="success"
            showIcon
            message="Spotify connected"
            description="You can close this window."
            className="rounded-lg"
          />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Spin size="large" />
            <div className="text-slate-600">Finishing Spotify connection...</div>
          </div>
        )}
      </div>
    </div>
  );
}
